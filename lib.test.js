"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReply, isPausedByManual, createRateLimiter, trimHistory } = require("./lib");

test("parseReply flags an urgent reply and removes the tag", () => {
  const result = parseReply("[URGENT] oke, aku kabari sekarang");
  assert.deepEqual(result, { text: "oke, aku kabari sekarang", isUrgent: true, needsFollowUp: true });
});

test("parseReply leaves a normal reply alone", () => {
  assert.deepEqual(parseReply("siap"), { text: "siap", isUrgent: false, needsFollowUp: false });
});

test("parseReply strips a leading speaker label", () => {
  assert.equal(parseReply("Bryan: baik").text, "baik");
});

test("parseReply does not cut a sentence that merely contains a colon", () => {
  assert.equal(parseReply("jam 9: ketemu di kantor").text, "jam 9: ketemu di kantor");
});

test("parseReply handles an empty or missing reply", () => {
  assert.deepEqual(parseReply(undefined), { text: "", isUrgent: false, needsFollowUp: false });
});

test("isPausedByManual is true inside the pause window and false after it", () => {
  const now = 1_000_000;
  assert.equal(isPausedByManual(now - 5 * 60 * 1000, now, 30), true);
  assert.equal(isPausedByManual(now - 31 * 60 * 1000, now, 30), false);
  assert.equal(isPausedByManual(undefined, now, 30), false);
});

test("createRateLimiter blocks after the limit and frees up after the window", () => {
  const allow = createRateLimiter(2, 1000);
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 100), true);
  assert.equal(allow("a", 200), false);
  assert.equal(allow("b", 200), true);
  assert.equal(allow("a", 1500), true);
});

test("trimHistory keeps the newest messages and starts on a user turn", () => {
  const history = [
    { role: "user", content: "1" },
    { role: "assistant", content: "2" },
    { role: "user", content: "3" },
    { role: "assistant", content: "4" },
  ];
  assert.deepEqual(trimHistory(history, 3).map((m) => m.content), ["3", "4"]);
  assert.deepEqual(trimHistory([{ role: "assistant", content: "x" }], 5), []);
});

test("parseReply marks a note for follow-up without urgency", () => {
  const result = parseReply("[CATAT] siap, nanti aku sampaikan");
  assert.deepEqual(result, { text: "siap, nanti aku sampaikan", isUrgent: false, needsFollowUp: true });
});

test("parseReply reads several tags in a row", () => {
  const result = parseReply("[CATAT] [URGENT] tenang ya");
  assert.deepEqual(result, { text: "tenang ya", isUrgent: true, needsFollowUp: true });
});
