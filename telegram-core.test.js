"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAssistant, INACTIVE_TEXT } = require("./telegram-core");
const { createStore } = require("./db");

function setup(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-tg-"));
  const store = createStore(path.join(dir, "test.db"));
  const sent = { replies: [], owner: [], followUps: [] };
  const io = {
    reply: async (text) => sent.replies.push(text),
    typing: async () => {},
    notifyOwner: async (text) => sent.owner.push(text),
  };
  const assistant = createAssistant({
    askAI: async () => ({
      text: "siap, nanti aku sampaikan",
      isUrgent: false,
      needsFollowUp: true,
      failed: false,
    }),
    recordFollowUp: async (entry) => sent.followUps.push(entry),
    recentFollowUps: () => [],
    allowReply: () => true,
    ownerId: "42",
    ownerName: "Bryan",
    store,
    stateFile: path.join(dir, "state.json"),
    ...overrides,
  });
  return { assistant, io, sent, store };
}

test("only the owner can switch the bot on", async () => {
  const { assistant, io, sent } = setup();
  await assistant.handleCommand("on", { id: 7 }, io);
  assert.equal(assistant.isActive(), false);
  assert.match(sent.replies[0], /pemilik/);
  await assistant.handleCommand("on", { id: 42 }, io);
  assert.equal(assistant.isActive(), true);
});

test("a switched-off bot answers with the rest message and does not call the model", async () => {
  let called = false;
  const { assistant, io, sent } = setup({
    askAI: async () => {
      called = true;
      return {};
    },
  });
  await assistant.handleText({ chatId: 1, name: "Rina", text: "halo" }, io);
  assert.deepEqual(sent.replies, [INACTIVE_TEXT]);
  assert.equal(called, false);
});

test("a follow-up is logged, the owner is told, and the visitor gets the reply", async () => {
  const { assistant, io, sent } = setup();
  await assistant.handleCommand("on", { id: 42 }, io);
  sent.replies.length = 0;
  await assistant.handleText({ chatId: 1, name: "Rina", text: "titip pesan ya" }, io);
  assert.equal(sent.followUps.length, 1);
  assert.equal(sent.followUps[0].name, "Rina");
  assert.equal(sent.followUps[0].channel, "telegram");
  assert.match(sent.owner[0], /Rina/);
  assert.deepEqual(sent.replies, ["siap, nanti aku sampaikan"]);
});

test("both sides of the conversation are stored for the dashboard", async () => {
  const { assistant, io, store } = setup();
  await assistant.handleCommand("on", { id: 42 }, io);
  await assistant.handleText({ chatId: 5, name: "Rina", text: "halo" }, io);
  const messages = store.getChat("telegram", 5);
  assert.deepEqual(messages.map((m) => m.direction), ["in", "out"]);
  assert.equal(messages[0].text, "halo");
});

test("a rate-limited chat gets no reply", async () => {
  const { assistant, io, sent } = setup({ allowReply: () => false });
  await assistant.handleCommand("on", { id: 42 }, io);
  sent.replies.length = 0;
  await assistant.handleText({ chatId: 1, name: "Rina", text: "halo" }, io);
  assert.deepEqual(sent.replies, []);
});

test("with no owner id configured nobody gets owner commands", async () => {
  const { assistant, io, sent } = setup({ ownerId: "" });
  await assistant.handleCommand("on", { id: 0 }, io);
  assert.equal(assistant.isActive(), false);
  assert.match(sent.replies[0], /pemilik/);
});
