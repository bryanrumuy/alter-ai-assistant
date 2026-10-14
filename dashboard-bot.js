"use strict";

const path = require("path");
const config = require("./config");
const { getStore } = require("./db");
const { readActive, writeActive } = require("./state");
const { createDashboard } = require("./dashboard");

if (!config.dashboardPassword) {
  console.error("DASHBOARD_PASSWORD is missing. Set a strong password in .env to start the dashboard.");
  process.exit(1);
}

const stateFile = path.join(config.dataDir, "telegram-state.json");

/** Sends the staff's answer to the customer through the Telegram Bot API (WhatsApp is not supported here). */
async function sendReply(channel, chatId, text) {
  if (channel !== "telegram") throw new Error("Balas dari dashboard baru didukung untuk Telegram.");
  if (!config.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN belum diisi.");
  const label = config.mode === "business" ? `Dari tim ${config.businessName}:\n` : "";
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: label + text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Telegram menolak pesan (pelanggan mungkin memblokir bot).");
}
const server = createDashboard({
  store: getStore(),
  password: config.dashboardPassword,
  knowledgeFile: path.join(__dirname, config.knowledgeFile),
  readActive: () => readActive(stateFile),
  writeActive: (active) => writeActive(stateFile, active),
  sendReply,
});

server.listen(config.dashboardPort, config.dashboardHost, () => {
  console.log(`Dashboard on http://${config.dashboardHost}:${config.dashboardPort} (user: any, password from DASHBOARD_PASSWORD)`);
});

process.once("SIGINT", () => server.close());
process.once("SIGTERM", () => server.close());
