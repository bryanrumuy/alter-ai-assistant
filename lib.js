"use strict";

const URGENT_TAG = "[URGENT]";
const NOTE_TAG = "[CATAT]";

/** Words of a paragraph without punctuation, for comparing two paragraphs. */
function wordSet(text) {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean));
}

/** True when two paragraphs say nearly the same thing (many shared words). */
function isRewording(a, b) {
  const first = wordSet(a);
  const second = wordSet(b);
  if (first.size < 4 || second.size < 4) return false;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared += 1;
  return shared / (first.size + second.size - shared) >= 0.5;
}

/** Drops a later paragraph that only rewords an earlier one (the model's "draft, then final" habit). */
function collapseRewordings(text) {
  const kept = [];
  for (const paragraph of text.split(/\n+/)) {
    if (!paragraph.trim()) continue;
    if (kept.some((earlier) => isRewording(earlier, paragraph))) continue;
    kept.push(paragraph.trim());
  }
  return kept.join("\n");
}

/**
 * Some models write the same answer twice in one reply (a draft, then a slightly reworded copy).
 * A sentence of three or more words that already appeared earlier in the reply is dropped.
 * Splitting only after punctuation that is followed by whitespace keeps "Rp106.000" in one piece.
 */
function collapseRepeats(text) {
  const parts = text.split(/((?<=[.!?])\s+)/);
  const seen = new Set();
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const gap = parts[i + 1] ?? "";
    const key = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const words = key ? key.split(" ").length : 0;
    if (words >= 3 && seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence, gap);
  }
  return kept.join("").trim();
}

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits the model reply into the text to send and its flags.
 * The model starts a reply with [URGENT] for emergencies and [CATAT] when the
 * owner has to follow up (a left message, a request, a question only he can answer).
 * The tags are removed so the contact never sees them. A leading speaker label
 * such as "Bryan:" or "Asisten:" is stripped as well, and a repeated or reworded
 * copy of the answer is dropped.
 */
function parseReply(raw, ownerName = "bryan") {
  const original = String(raw ?? "");
  // Models sometimes put a tag mid-sentence or at the end, so look for it anywhere.
  const isUrgent = original.toUpperCase().includes(URGENT_TAG);
  const needsFollowUp = original.toUpperCase().includes(NOTE_TAG);
  const stripped = original
    .replace(/\[(URGENT|CATAT)\]/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?])/g, "$1")
    .trim()
    .replace(new RegExp(`^(${escapeRegExp(ownerName)}|asisten|assistant)\\s*:\\s*`, "i"), "");
  const text = collapseRepeats(collapseRewordings(stripped));
  return { text, isUrgent, needsFollowUp: needsFollowUp || isUrgent };
}

/** True while a manual reply from the owner should keep the bot quiet. */
function isPausedByManual(lastManualAt, now, pauseMinutes) {
  if (!lastManualAt) return false;
  return now - lastManualAt < pauseMinutes * 60 * 1000;
}

/** Allows at most `limit` events per `windowMs` for each key. */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    hits.set(key, [...recent, now]);
    // Forget keys that went quiet so the map cannot grow forever.
    for (const [other, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(other);
    }
    return true;
  };
}

/** Keeps the last `max` messages and makes sure the list starts with a user turn. */
function trimHistory(history, max) {
  const trimmed = history.slice(-max);
  const firstUser = trimmed.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : trimmed.slice(firstUser);
}

module.exports = {
  collapseRepeats,
  collapseRewordings,
  URGENT_TAG,
  NOTE_TAG,
  parseReply,
  isPausedByManual,
  createRateLimiter,
  trimHistory,
};
