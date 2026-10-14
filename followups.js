"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const config = require("./config");

const FOLLOWUP_FILE = path.join(__dirname, "followups.jsonl");

/**
 * Records a message that needs the owner's attention: one JSON line per item in
 * followups.jsonl, and a POST to SHEETS_WEBHOOK_URL when it is set (for example a
 * Google Apps Script web app that appends a row to a Google Sheet).
 */
async function recordFollowUp(entry) {
  const item = { time: new Date().toISOString(), ...entry };
  try {
    fs.appendFileSync(FOLLOWUP_FILE, JSON.stringify(item) + "\n");
  } catch (error) {
    console.log("Could not write followups.jsonl:", error.message);
  }
  if (!config.sheetsWebhookUrl) return;
  try {
    await axios.post(config.sheetsWebhookUrl, item, { timeout: 15000 });
  } catch (error) {
    console.log("Could not send the follow-up to the webhook:", error.message);
  }
}

/** The newest follow-ups first, at most `limit` of them. */
function recentFollowUps(limit = 10) {
  try {
    return fs
      .readFileSync(FOLLOWUP_FILE, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

module.exports = { recordFollowUp, recentFollowUps };
