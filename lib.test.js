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

test("parseReply finds and removes a tag in the middle or at the end", () => {
  const middle = parseReply("Belum ada infonya. [CATAT] Saya teruskan ke tim.");
  assert.deepEqual(middle, { text: "Belum ada infonya. Saya teruskan ke tim.", isUrgent: false, needsFollowUp: true });
  const end = parseReply("Saya teruskan ya. [CATAT]");
  assert.deepEqual(end, { text: "Saya teruskan ya.", isUrgent: false, needsFollowUp: true });
});

test("a reply that repeats itself is collapsed (the doubled message seen in a real chat)", () => {
  const doubled =
    "Siap, saya catat 3 kopi susu dan 2 croissant. Mau diambil pukul berapa? totalnya Rp106.000. Setelah jam ambil ditentukan, saya rangkum untuk konfirmasi.\n mau diambil pukul berapa? Totalnya Rp106.000. Setelah jam ambil ditentukan, saya rangkum untuk konfirmasi.";
  assert.equal(
    parseReply(doubled).text,
    "Siap, saya catat 3 kopi susu dan 2 croissant. Mau diambil pukul berapa? totalnya Rp106.000. Setelah jam ambil ditentukan, saya rangkum untuk konfirmasi."
  );
});

test("short or different sentences are never dropped", () => {
  assert.equal(parseReply("Ya. Ya. Oke.").text, "Ya. Ya. Oke.");
  assert.equal(parseReply("Kopi susu Rp22.000. Americano Rp18.000.").text, "Kopi susu Rp22.000. Americano Rp18.000.");
});

test("a reworded second paragraph is dropped, a genuinely different one is kept", () => {
  const reworded =
    "Mau diambil jam berapa? Total pesanan 3 kopi susu dan 2 croissant adalah Rp106.000. Setelah jam pengambilan ditentukan, saya minta konfirmasi pesanan sebelum memprosesnya.\nMau diambil jam berapa? Total 3 kopi susu dan 2 croissant adalah Rp106.000. Setelah jamnya ditentukan, saya akan minta konfirmasi pesanan sebelum memprosesnya.";
  assert.equal(
    parseReply(reworded).text,
    "Mau diambil jam berapa? Total pesanan 3 kopi susu dan 2 croissant adalah Rp106.000. Setelah jam pengambilan ditentukan, saya minta konfirmasi pesanan sebelum memprosesnya."
  );
  const different = "Pesanan kamu sudah tercatat.\nSilakan ambil di kasir sebelum pukul 17.00 ya.";
  assert.equal(parseReply(different).text, different);
});

test("the language detector tells English from Indonesian and stays quiet when unsure", () => {
  const { detectLanguage } = require("./lib");
  assert.equal(detectLanguage("I would like 2 iced lattes for pickup tomorrow, please"), "en");
  assert.equal(detectLanguage("saya mau pesan kopi susu besok ya, ambil jam 5"), "id");
  assert.equal(detectLanguage("Americano"), null);
  assert.equal(detectLanguage(""), null);
});
