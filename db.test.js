"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("./db");

const base = { channel: "telegram", chatId: 1, name: "Rina" };

test("follow-ups list urgent first and can be marked done", () => {
  const store = createStore(":memory:");
  store.addFollowUp({ ...base, message: "titip pesan", reply: "siap", urgent: false });
  const urgentId = store.addFollowUp({ ...base, message: "tolong", reply: "tenang", urgent: true });

  const open = store.listFollowUps("open");
  assert.equal(open.length, 2);
  assert.equal(open[0].id, urgentId);
  assert.equal(open[0].urgent, true);

  assert.equal(store.setFollowUpStatus(urgentId, "done"), true);
  assert.equal(store.listFollowUps("open").length, 1);
  assert.equal(store.listFollowUps("done").length, 1);
  assert.equal(store.setFollowUpStatus(9999, "done"), false);
});

test("chats are grouped with the latest preview and message count", () => {
  const store = createStore(":memory:");
  store.logMessage({ ...base, direction: "in", text: "halo" });
  store.logMessage({ ...base, direction: "out", text: "halo juga" });
  store.logMessage({ channel: "whatsapp", chatId: "a@c.us", name: "Budi", direction: "in", text: "p" });

  const chats = store.listChats();
  assert.equal(chats.length, 2);
  const rina = chats.find((chat) => chat.name === "Rina");
  assert.equal(rina.messages, 2);
  assert.equal(rina.preview, "halo juga");
  assert.deepEqual(store.getChat("telegram", 1).map((m) => m.text), ["halo", "halo juga"]);
});

test("stats count incoming messages, chats and follow-ups", () => {
  const store = createStore(":memory:");
  store.logMessage({ ...base, direction: "in", text: "halo" });
  store.logMessage({ ...base, direction: "out", text: "hai" });
  store.addFollowUp({ ...base, message: "m", reply: "r", urgent: true });
  assert.deepEqual(store.stats(), {
    messagesToday: 1,
    chatsTotal: 1,
    openFollowUps: 1,
    openUrgent: 1,
    resolvedFollowUps: 0,
    ordersToday: 0,
    revenueToday: 0,
    activeOrders: 0,
  });
});

test("text that looks like SQL is stored as plain data", () => {
  const store = createStore(":memory:");
  const evil = "x'); DROP TABLE messages; --";
  store.logMessage({ ...base, name: evil, direction: "in", text: evil });
  assert.equal(store.getChat("telegram", 1)[0].text, evil);
});

test("orders move through their statuses and feed the stats", () => {
  const store = createStore(":memory:");
  const items = [{ name: "Kopi susu", quantity: 2, price: 22000, subtotal: 44000 }];
  const id = store.addOrder({ ...base, items, total: 44000, pickupTime: "17.00" });

  assert.equal(store.getOrder(id).status, "baru");
  assert.deepEqual(store.getOrder(id).items, items);
  assert.equal(store.listOrders("active").length, 1);
  assert.equal(store.stats().revenueToday, 44000);
  assert.equal(store.stats().activeOrders, 1);

  assert.equal(store.setOrderStatus(id, "siap"), true);
  assert.equal(store.setOrderStatus(id, "hacked"), false);
  assert.equal(store.setOrderStatus(id, "selesai"), true);
  assert.equal(store.listOrders("active").length, 0);
  assert.equal(store.listOrders("done").length, 1);

  store.setOrderStatus(id, "batal");
  assert.equal(store.stats().revenueToday, 0, "a cancelled order is not revenue");
});

test("an identical order from the same chat a moment ago is recognised, a cancelled or different one is not", () => {
  const store = createStore(":memory:");
  const items = [{ name: "Americano", quantity: 1, price: 22000, subtotal: 22000 }];
  const id = store.addOrder({ ...base, items, total: 22000, pickupTime: "9 am" });
  assert.equal(store.hasRecentIdenticalOrder("telegram", 1, items, 60000), true, "the pickup wording may differ between the calls");
  assert.equal(store.hasRecentIdenticalOrder("telegram", 1, [{ ...items[0], quantity: 2 }], 60000), false);
  assert.equal(store.hasRecentIdenticalOrder("telegram", 2, items, 60000), false);
  store.setOrderStatus(id, "batal");
  assert.equal(store.hasRecentIdenticalOrder("telegram", 1, items, 60000), false);
});
