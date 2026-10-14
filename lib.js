"use strict";

const URGENT_TAG = "[URGENT]";
const NOTE_TAG = "[CATAT]";

/**
 * Splits the model reply into the text to send and its flags.
 * The model starts a reply with [URGENT] for emergencies and [CATAT] when the
 * owner has to follow up (a left message, a request, a question only he can answer).
 * The tags are removed so the contact never sees them. A leading speaker label
 * such as "Bryan:" or "Asisten:" is stripped as well.
 */
function parseReply(raw) {
  const original = String(raw ?? "");
  // Models sometimes put a tag mid-sentence or at the end, so look for it anywhere.
  const isUrgent = original.toUpperCase().includes(URGENT_TAG);
  const needsFollowUp = original.toUpperCase().includes(NOTE_TAG);
  const text = original
    .replace(/\[(URGENT|CATAT)\]/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim()
    .replace(/^(bryan|asisten|assistant|ai)\s*:\s*/i, "");
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
  URGENT_TAG,
  NOTE_TAG,
  parseReply,
  isPausedByManual,
  createRateLimiter,
  trimHistory,
};
