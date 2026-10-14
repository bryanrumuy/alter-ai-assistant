"use strict";

require("dotenv").config();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  apiKey: process.env.OPENAI_API_KEY,
  apiUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  ownerName: process.env.OWNER_NAME || "Bryan",
  // How long the bot stays quiet in a chat after the owner replied by hand.
  manualPauseMinutes: toNumber(process.env.MANUAL_PAUSE_MINUTES, 30),
  // Cron expression for the summary report (default: every hour, on the hour).
  reportCron: process.env.REPORT_CRON || "0 * * * *",
  // Newer models only accept their default temperature, so it is sent only when TEMPERATURE is set.
  temperature: process.env.TEMPERATURE ? Number(process.env.TEMPERATURE) : undefined,
  // Optional: a web app URL that receives each follow-up as JSON (e.g. Google Apps Script -> Sheets).
  sheetsWebhookUrl: process.env.SHEETS_WEBHOOK_URL || "",
  // Optional file with facts the assistant may use to answer questions (FAQ, product info).
  knowledgeFile: process.env.KNOWLEDGE_FILE || "knowledge.md",
  maxHistory: toNumber(process.env.MAX_HISTORY, 15),
  // Safety net against reply loops with other bots.
  maxRepliesPerMinute: toNumber(process.env.MAX_REPLIES_PER_MINUTE, 5),
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 60000),
  fallbackReply: process.env.FALLBACK_REPLY || "lagi sibuk, nanti dibalas ya",
};
