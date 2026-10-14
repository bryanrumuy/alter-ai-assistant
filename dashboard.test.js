"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDashboard, CSRF_HEADER, CSRF_VALUE } = require("./dashboard");
const { createStore } = require("./db");

const PASSWORD = "correct-horse";

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-dash-"));
  const store = createStore(":memory:");
  let active = false;
  const server = createDashboard({
    store,
    password: PASSWORD,
    knowledgeFile: path.join(dir, "knowledge.md"),
    readActive: () => active,
    writeActive: (value) => {
      active = value;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}` };
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, auth, store, close, isActive: () => active, dir };
}

test("requests without the password are refused", async () => {
  const { base, close } = await start();
  const none = await fetch(`${base}/api/overview`);
  assert.equal(none.status, 401);
  const wrong = await fetch(`${base}/api/overview`, {
    headers: { Authorization: `Basic ${Buffer.from("admin:nope").toString("base64")}` },
  });
  assert.equal(wrong.status, 401);
  await close();
});

test("the overview shows stats and the bot state", async () => {
  const { base, auth, store, close } = await start();
  store.addFollowUp({ channel: "telegram", chatId: 1, name: "Rina", message: "m", reply: "r", urgent: true });
  const response = await fetch(`${base}/api/overview`, { headers: auth });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.stats.openFollowUps, 1);
  assert.equal(body.active, false);
  await close();
});

test("changing state needs the anti-forgery header", async () => {
  const { base, auth, isActive, close } = await start();
  const options = { method: "POST", body: JSON.stringify({ active: true }) };

  const blocked = await fetch(`${base}/api/active`, { ...options, headers: auth });
  assert.equal(blocked.status, 403);
  assert.equal(isActive(), false);

  const allowed = await fetch(`${base}/api/active`, {
    ...options,
    headers: { ...auth, [CSRF_HEADER]: CSRF_VALUE },
  });
  assert.equal(allowed.status, 200);
  assert.equal(isActive(), true);
  await close();
});

test("a follow-up can be marked done and bad input is rejected", async () => {
  const { base, auth, store, close } = await start();
  const id = store.addFollowUp({ channel: "telegram", chatId: 1, name: "Rina", message: "m", reply: "r", urgent: false });
  const headers = { ...auth, [CSRF_HEADER]: CSRF_VALUE };

  const ok = await fetch(`${base}/api/followups/done`, { method: "POST", headers, body: JSON.stringify({ id }) });
  assert.equal((await ok.json()).ok, true);
  assert.equal(store.listFollowUps("open").length, 0);

  const bad = await fetch(`${base}/api/followups/done`, { method: "POST", headers, body: JSON.stringify({ id: "1; DROP" }) });
  assert.equal(bad.status, 400);
  const broken = await fetch(`${base}/api/followups/done`, { method: "POST", headers, body: "{nope" });
  assert.equal(broken.status, 400);
  await close();
});

test("the knowledge text is saved and read back", async () => {
  const { base, auth, close } = await start();
  const headers = { ...auth, [CSRF_HEADER]: CSRF_VALUE };
  await fetch(`${base}/api/knowledge`, { method: "PUT", headers, body: JSON.stringify({ text: "Buka jam 9" }) });
  const body = await (await fetch(`${base}/api/knowledge`, { headers: auth })).json();
  assert.equal(body.text, "Buka jam 9");
  await close();
});

test("the page is served with a strict content security policy", async () => {
  const { base, auth, close } = await start();
  const response = await fetch(`${base}/`, { headers: auth });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(await response.text(), /Alter Dashboard/);
  await close();
});

test("the dashboard cannot start without a password", () => {
  assert.throws(() => createDashboard({ store: null, password: "", knowledgeFile: "x", readActive() {}, writeActive() {} }));
});

test("staff can reply to a follow-up: the answer is sent, logged and the item closes", async () => {
  const sent = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-reply-"));
  const store = createStore(":memory:");
  const server = createDashboard({
    store,
    password: PASSWORD,
    knowledgeFile: path.join(dir, "knowledge.md"),
    readActive: () => true,
    writeActive() {},
    sendReply: async (channel, chatId, text) => sent.push({ channel, chatId, text }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}`,
    [CSRF_HEADER]: CSRF_VALUE,
  };
  const id = store.addFollowUp({ channel: "telegram", chatId: 77, name: "Rina", message: "menu best seller?", reply: "diteruskan", urgent: false });

  const empty = await fetch(`${base}/api/followups/reply`, { method: "POST", headers, body: JSON.stringify({ id, text: "  " }) });
  assert.equal(empty.status, 400);
  const missing = await fetch(`${base}/api/followups/reply`, { method: "POST", headers, body: JSON.stringify({ id: 999, text: "halo" }) });
  assert.equal(missing.status, 404);

  const ok = await fetch(`${base}/api/followups/reply`, { method: "POST", headers, body: JSON.stringify({ id, text: "Best seller kami kopi susu" }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(sent, [{ channel: "telegram", chatId: "77", text: "Best seller kami kopi susu" }]);
  assert.equal(store.listFollowUps("open").length, 0);
  assert.equal(store.getChat("telegram", 77).at(-1).text, "Best seller kami kopi susu");
  await new Promise((resolve) => server.close(resolve));
});

test("a failed delivery keeps the follow-up open and reports the error", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-reply-"));
  const store = createStore(":memory:");
  const server = createDashboard({
    store,
    password: PASSWORD,
    knowledgeFile: path.join(dir, "knowledge.md"),
    readActive: () => true,
    writeActive() {},
    sendReply: async () => {
      throw new Error("Telegram menolak pesan");
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}`,
    [CSRF_HEADER]: CSRF_VALUE,
  };
  const id = store.addFollowUp({ channel: "telegram", chatId: 1, name: "Rina", message: "m", reply: "r", urgent: false });
  const response = await fetch(`${base}/api/followups/reply`, { method: "POST", headers, body: JSON.stringify({ id, text: "halo" }) });
  assert.equal(response.status, 502);
  assert.equal(store.listFollowUps("open").length, 1);
  await new Promise((resolve) => server.close(resolve));
});

test("moving an order along tells the customer, and a failed message does not undo the status", async () => {
  const sent = [];
  let failNext = false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-orders-"));
  const store = createStore(":memory:");
  const server = createDashboard({
    store,
    password: PASSWORD,
    knowledgeFile: path.join(dir, "knowledge.md"),
    readActive: () => true,
    writeActive() {},
    sendReply: async (channel, chatId, text) => {
      if (failNext) throw new Error("blocked");
      sent.push({ channel, chatId, text });
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}`,
    [CSRF_HEADER]: CSRF_VALUE,
  };
  const id = store.addOrder({ channel: "telegram", chatId: 5, name: "Rina", items: [{ name: "Kopi susu", quantity: 1, price: 22000, subtotal: 22000 }], total: 22000, pickupTime: "17.00" });
  const post = (body) => fetch(`${base}/api/orders/status`, { method: "POST", headers, body: JSON.stringify(body) }).then((r) => r.json());

  const ready = await post({ id, status: "siap" });
  assert.equal(ready.notified, true);
  assert.match(sent[0].text, new RegExp(`Pesanan #${id} sudah siap diambil`));
  assert.equal(store.getOrder(id).status, "siap");

  const bad = await fetch(`${base}/api/orders/status`, { method: "POST", headers, body: JSON.stringify({ id, status: "hacked" }) });
  assert.equal(bad.status, 400);

  failNext = true;
  const done = await post({ id, status: "batal" });
  assert.equal(done.notified, false);
  assert.equal(store.getOrder(id).status, "batal");

  const listed = await (await fetch(`${base}/api/orders?view=done`, { headers })).json();
  assert.equal(listed.orders.length, 1);
  await new Promise((resolve) => server.close(resolve));
});
