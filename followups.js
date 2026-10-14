"use strict";

const axios = require("axios");
const config = require("./config");
const { getStore } = require("./db");

/**
 * Records a message that needs the owner's attention in the database (where the
 * dashboard shows it) and, when SHEETS_WEBHOOK_URL is set, posts it as JSON, for
 * example to a Google Apps Script web app that appends a row to a Google Sheet.
 */
async function recordFollowUp(entry) {
  const item = {
    channel: entry.channel ?? "whatsapp",
    chatId: entry.chatId ?? entry.from ?? "",
    name: entry.name,
    message: entry.message,
    reply: entry.reply,
    urgent: Boolean(entry.urgent),
  };
  try {
    getStore().addFollowUp(item);
  } catch (error) {
    console.log("Could not save the follow-up:", error.message);
  }
  if (!config.sheetsWebhookUrl) return;
  try {
    await axios.post(config.sheetsWebhookUrl, { time: new Date().toISOString(), ...item }, { timeout: 15000 });
  } catch (error) {
    console.log("Could not send the follow-up to the webhook:", error.message);
  }
}

/** The open follow-ups, urgent first, at most `limit` of them. */
function recentFollowUps(limit = 10) {
  try {
    return getStore().listFollowUps("open", limit);
  } catch {
    return [];
  }
}

/** One line per follow-up, the same wording on every channel. */
function formatPending(items) {
  return items.map((item) => `- ${item.name}${item.urgent ? " (PENTING)" : ""}: "${item.message}"`).join("\n");
}

module.exports = { recordFollowUp, recentFollowUps, formatPending };
