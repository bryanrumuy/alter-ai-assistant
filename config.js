"use strict";

require("dotenv").config();
const path = require("path");

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const dataDir = process.env.DATA_DIR || __dirname;

module.exports = {
  // Where runtime data lives (WhatsApp session, database, state). Mount this as a volume in Docker.
  dataDir,
  apiKey: process.env.OPENAI_API_KEY,
  apiUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  ownerName: process.env.OWNER_NAME || "Bryan",
  // "personal": answers for you while you are away. "business": a customer-service assistant
  // that answers only from the knowledge file and hands everything else to the team.
  mode: process.env.BOT_MODE === "business" ? "business" : "personal",
  businessName: process.env.BUSINESS_NAME || "kami",
  // How long the bot stays quiet in a chat after the owner replied by hand.
  manualPauseMinutes: toNumber(process.env.MANUAL_PAUSE_MINUTES, 30),
  // Cron expression for the summary report (default: every hour, on the hour).
  reportCron: process.env.REPORT_CRON || "0 * * * *",
  // Newer models only accept their default temperature, so it is sent only when TEMPERATURE is set.
  temperature: process.env.TEMPERATURE ? Number(process.env.TEMPERATURE) : undefined,
  // Newer reasoning models only accept function tools on chat completions with reasoning_effort "none".
  // Older models reject that parameter, so it is sent only for gpt-5/gpt-6 models unless overridden.
  toolsReasoningEffort:
    process.env.TOOLS_REASONING_EFFORT ?? (/^gpt-[56]/.test(process.env.OPENAI_MODEL || "") ? "none" : ""),
  // Optional: a web app URL that receives each follow-up as JSON (e.g. Google Apps Script -> Sheets).
  sheetsWebhookUrl: process.env.SHEETS_WEBHOOK_URL || "",
  // Optional file with facts the assistant may use to answer questions (FAQ, product info).
  knowledgeFile: process.env.KNOWLEDGE_FILE || "knowledge.md",
  dbFile: process.env.DB_FILE || path.join(dataDir, "alter.db"),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  // Your own Telegram user id (send /myid to the bot): enables owner commands and alerts.
  telegramOwnerId: process.env.TELEGRAM_OWNER_ID || "",
  // The dashboard refuses to start without a password. It listens on localhost unless told otherwise.
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "",
  dashboardHost: process.env.DASHBOARD_HOST || "127.0.0.1",
  // Extra Host names the dashboard answers to (comma separated), e.g. when it sits behind a reverse proxy.
  dashboardAllowedHosts: (process.env.DASHBOARD_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  dashboardPort: toNumber(process.env.DASHBOARD_PORT, 3100),
  maxHistory: toNumber(process.env.MAX_HISTORY, 15),
  // Safety net against reply loops with other bots.
  maxRepliesPerMinute: toNumber(process.env.MAX_REPLIES_PER_MINUTE, 5),
  requestTimeoutMs: toNumber(process.env.REQUEST_TIMEOUT_MS, 60000),
  fallbackReply: process.env.FALLBACK_REPLY || "lagi sibuk, nanti dibalas ya",
};
