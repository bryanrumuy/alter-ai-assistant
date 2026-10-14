"use strict";

// Environment first: modules read it when loaded, and these tests must never touch real data.
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-hardening-"));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, "test.db");
process.env.BOT_MODE = "business";
process.env.OPENAI_API_KEY = "test-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const askAI = require("./ai-online");
const { getStore } = require("./db");
const { parseReply, createRateLimiter } = require("./lib");

const context = (chatId) => ({ channel: "telegram", chatId, name: "Rina" });

const orderCall = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_1",
      type: "function",
      function: {
        name: "create_order",
        arguments: JSON.stringify({ items: [{ name: "Kopi susu", quantity: 1 }], pickup_time: "10.00" }),
      },
    },
  ],
};

test("an order stored before a network error is still confirmed and reported", async () => {
  // The customer has already been shown the total (Rp22.000), so this turn is their confirmation.
  axios.post = async () => ({ data: { choices: [{ message: { role: "assistant", content: "Total Rp22.000, ambil jam 10.00. Benar?" } }] } });
  await askAI("pesan 1 kopi susu jam 10", "tg:101", context(101));

  let calls = 0;
  axios.post = async () => {
    calls += 1;
    if (calls === 1) return { data: { choices: [{ message: orderCall }] } };
    throw new Error("timeout");
  };
  const result = await askAI("ya", "tg:101", context(101));
  assert.equal(result.failed, false);
  assert.equal(result.orders.length, 1);
  assert.match(result.text, /Pesanan #\d+ tercatat/);
  assert.equal(getStore().getOrder(result.orders[0].id).status, "baru");
});

test("a customer cannot pile up open orders", async () => {
  for (let i = 0; i < 3; i += 1) getStore().addOrder({ channel: "telegram", chatId: 202, name: "Spam", items: [], total: 0, pickupTime: "1" });
  let calls = 0;
  axios.post = async () => {
    calls += 1;
    return calls === 1
      ? { data: { choices: [{ message: orderCall }] } }
      : { data: { choices: [{ message: { role: "assistant", content: "Maaf, tunggu staf ya." } }] } };
  };
  const result = await askAI("ya", "tg:202", context(202));
  assert.equal(result.orders.length, 0);
  assert.equal(getStore().countOpenOrders("telegram", 202), 3);
});

test("two quick messages from one customer are answered one after the other", async () => {
  const started = [];
  let running = 0;
  let overlap = false;
  axios.post = async (_url, body) => {
    running += 1;
    if (running > 1) overlap = true;
    started.push(body.messages.filter((m) => m.role === "user").map((m) => m.content));
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
    return { data: { choices: [{ message: { role: "assistant", content: "ok" } }] } };
  };
  await Promise.all([askAI("satu", "tg:303", context(303)), askAI("dua", "tg:303", context(303))]);
  assert.equal(overlap, false);
  assert.deepEqual(started[1], ["satu", "dua"], "the second answer sees the first exchange");
});

test("each channel keeps its own memory file", async () => {
  axios.post = async () => ({ data: { choices: [{ message: { role: "assistant", content: "halo" } }] } });
  await askAI("hai", "tg:404", context(404));
  await askAI("hai", "6281@c.us", null);
  const telegram = JSON.parse(fs.readFileSync(path.join(dir, "brain.telegram.json"), "utf-8"));
  const whatsapp = JSON.parse(fs.readFileSync(path.join(dir, "brain.json"), "utf-8"));
  assert.ok(telegram["tg:404"] && !telegram["6281@c.us"]);
  assert.ok(whatsapp["6281@c.us"] && !whatsapp["tg:404"]);
});

test("a reply starting with AI: keeps its words and the owner label is configurable", () => {
  assert.equal(parseReply("AI: dasar komputer").text, "AI: dasar komputer");
  assert.equal(parseReply("Sinta: baik", "Sinta").text, "baik");
  assert.equal(parseReply("baris satu\n.titik").text, "baris satu\n.titik");
});

test("the rate limiter forgets chats that went quiet", () => {
  const allow = createRateLimiter(1, 1000);
  allow("a", 0);
  allow("b", 5000);
  assert.equal(allow("a", 5000), true, "the old hit of a is no longer counted");
});
