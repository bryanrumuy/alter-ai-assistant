"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDashboard, CSRF_HEADER, CSRF_VALUE } = require("./dashboard");
const { createStore } = require("./db");

const PASSWORD = "correct-horse-battery";
const basic = (password) => `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`;

async function start(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-hardening-dash-"));
  const store = createStore(":memory:");
  const sent = [];
  const server = createDashboard({
    store,
    password: PASSWORD,
    knowledgeFile: path.join(dir, "knowledge.md"),
    readActive: () => true,
    writeActive() {},
    sendReply: async (channel, chatId, text) => sent.push({ channel, chatId, text }),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, store, sent, close, headers: { Authorization: basic(PASSWORD), [CSRF_HEADER]: CSRF_VALUE } };
}

test("a request for another hostname is refused (DNS rebinding)", async () => {
  const { base, close, headers } = await start();
  // fetch refuses to override Host, so use the raw http client.
  const http = require("http");
  const status = await new Promise((resolve, reject) => {
    const url = new URL(`${base}/api/overview`);
    http
      .get({ hostname: url.hostname, port: url.port, path: url.pathname, headers: { ...headers, Host: "evil.example:3100" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(status, 421);
  await close();
});

test("repeated wrong passwords are throttled, and the right one is refused while locked out", async () => {
  const { base, close } = await start({ maxLoginFailures: 3 });
  for (let i = 0; i < 3; i += 1) {
    const response = await fetch(`${base}/api/overview`, { headers: { Authorization: basic("wrong") } });
    assert.equal(response.status, 401);
  }
  const locked = await fetch(`${base}/api/overview`, { headers: { Authorization: basic(PASSWORD) } });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get("retry-after"), "60");
  await close();
});

test("opening the page without credentials does not count as a failed login", async () => {
  const { base, close } = await start({ maxLoginFailures: 2 });
  for (let i = 0; i < 5; i += 1) await fetch(`${base}/api/overview`);
  const ok = await fetch(`${base}/api/overview`, { headers: { Authorization: basic(PASSWORD) } });
  assert.equal(ok.status, 200);
  await close();
});

test("setting an order to the status it already has sends nothing again", async () => {
  const { base, store, sent, close, headers } = await start();
  const id = store.addOrder({ channel: "telegram", chatId: 5, name: "Rina", items: [], total: 1000, pickupTime: "17.00" });
  const post = () => fetch(`${base}/api/orders/status`, { method: "POST", headers, body: JSON.stringify({ id, status: "siap" }) }).then((r) => r.json());

  assert.equal((await post()).notified, true);
  const second = await post();
  assert.equal(second.unchanged, true);
  assert.equal(second.notified, false);
  assert.equal(sent.length, 1, "the customer is told once");
  await close();
});

test("an oversized body gets 413", async () => {
  const { base, close, headers } = await start();
  const response = await fetch(`${base}/api/knowledge`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ text: "x".repeat(200 * 1024) }),
  }).catch((error) => ({ status: error.cause?.code === "ECONNRESET" ? 413 : 0 }));
  assert.equal(response.status, 413);
  await close();
});
