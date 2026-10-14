"use strict";

// Environment first: the modules read it when they are loaded, and the tests must never touch real data.
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-orders-"));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, "test.db");
process.env.BOT_MODE = "business";
process.env.BUSINESS_NAME = "Kopi Senja";
process.env.OPENAI_API_KEY = "test-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const askAI = require("./ai-online");
const { getStore } = require("./db");

const context = (chatId) => ({ channel: "telegram", chatId, name: "Rina" });

function modelSays(...answers) {
  const requests = [];
  axios.post = async (_url, body) => {
    requests.push(JSON.parse(JSON.stringify(body)));
    return { data: { choices: [{ message: answers.shift() }] } };
  };
  return requests;
}

const toolCall = (args) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id: "call_1", type: "function", function: { name: "create_order", arguments: JSON.stringify(args) } }],
});

const text = (content) => ({ role: "assistant", content });

const twoKopiOneCroissant = {
  items: [
    { name: "Kopi susu", quantity: 2 },
    { name: "Croissant", quantity: 1 },
  ],
  pickup_time: "17.00",
};

/** The customer gives a complete order: the code must not store it until the total was shown and confirmed. */
async function proposeOrder(sender, chatId) {
  const requests = modelSays(toolCall(twoKopiOneCroissant), text("Ringkasan: 2 kopi susu dan 1 croissant, total Rp64.000, ambil jam 17.00. Benar?"));
  const result = await askAI("pesan 2 kopi susu dan 1 croissant jam 5 sore", sender, context(chatId));
  return { result, requests };
}

test("a complete order message is NOT stored: the summary is shown first", async () => {
  const before = getStore().listOrders("active").length;
  const { result, requests } = await proposeOrder("tg:9", 9);

  assert.equal(result.orders.length, 0);
  assert.equal(getStore().listOrders("active").length, before);
  const toolResult = JSON.parse(requests[1].messages.at(-1).content);
  assert.equal(toolResult.status, "awaiting_customer_confirmation");
  assert.equal(toolResult.saved, false);
  assert.equal(toolResult.total, "Rp64.000");
});

test("after the customer saw the total and confirms, the order is stored with a code-computed total", async () => {
  await proposeOrder("tg:10", 10);
  const requests = modelSays(toolCall(twoKopiOneCroissant), text("Pesanan #1 tersimpan. Total Rp64.000, ambil jam 17.00."));
  const result = await askAI("ya betul", "tg:10", context(10));

  assert.equal(result.failed, false);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].total, 64000);
  const stored = getStore().getOrder(result.orders[0].id);
  assert.equal(stored.status, "baru");
  assert.equal(stored.pickup_time, "17.00");
  assert.equal(stored.items[0].name, "Kopi susu");

  // The model is offered the tool, restricted to the menu, and sees the computed total.
  const tool = requests[0].tools[0].function;
  assert.deepEqual(tool.parameters.properties.items.items.properties.name.enum, ["Kopi susu", "Americano", "Matcha latte", "Croissant"]);
  assert.equal(JSON.parse(requests[1].messages.at(-1).content).total, "Rp64.000");
});

test("changing the order after the summary needs a new summary and confirmation", async () => {
  await proposeOrder("tg:11", 11);
  modelSays(
    toolCall({ items: [{ name: "Kopi susu", quantity: 5 }], pickup_time: "17.00" }),
    text("Jadi 5 kopi susu, total Rp110.000. Benar?")
  );
  const result = await askAI("eh jadi 5 kopi susu aja", "tg:11", context(11));
  assert.equal(result.orders.length, 0, "the new total Rp110.000 was not shown before, so nothing is stored yet");
});

test("an item that is not on the menu is refused and nothing is stored", async () => {
  const before = getStore().listOrders("active").length;
  modelSays(toolCall({ items: [{ name: "Es krim", quantity: 1 }], pickup_time: "17.00" }), text("Maaf, es krim tidak ada di menu."));
  const result = await askAI("pesan es krim", "tg:12", context(12));
  assert.equal(result.orders.length, 0);
  assert.equal(getStore().listOrders("active").length, before);
  assert.match(result.text, /tidak ada di menu/);
});

test("without a chat context no ordering tool is offered", async () => {
  const requests = modelSays(text("Halo!"));
  await askAI("halo", "tg:13", null);
  assert.equal(requests[0].tools, undefined);
});

test("a model that keeps calling the tool creates one order and the customer still gets a confirmation", async () => {
  await proposeOrder("tg:14", 14);
  const loop = toolCall(twoKopiOneCroissant);
  modelSays(loop, loop, loop, loop, loop);
  const result = await askAI("ya", "tg:14", context(14));
  assert.equal(result.orders.length, 1, "no duplicate orders from a looping model");
  assert.equal(result.failed, false);
  assert.match(result.text, new RegExp(`Pesanan #${result.orders[0].id} tercatat`));
});
