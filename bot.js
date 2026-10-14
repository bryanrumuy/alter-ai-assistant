"use strict";

const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const cron = require("node-cron");
const config = require("./config");
const askAI = require("./ai-online");
const { isPausedByManual, createRateLimiter } = require("./lib");
const { recordFollowUp, recentFollowUps } = require("./followups");

const STATE_FILE = path.join(config.dataDir, "state.json");
const QR_FILE = path.join(config.dataDir, "qr.png");
// Messages the bot sends itself also fire message_create; ignore them for this long.
const BOT_ECHO_MS = 8000;
const MIN_TYPING_MS = 1500;
const TYPING_MS_PER_CHAR = 20;

const HELP_TEXT =
  "*Perintah bot*\n/on - aktifkan balasan otomatis\n/off - matikan\n/status - lihat status\n/pending - pesan yang perlu ditindaklanjuti\n/help - bantuan";

let client;
let isRestarting = false;
let reportTask = null;
const lastManualAt = {}; // chat id -> timestamp of the owner's last manual message
const lastBotSendAt = {}; // chat id -> timestamp of the bot's last message
const actionsSummary = [];
const allowReply = createRateLimiter(config.maxRepliesPerMinute, 60 * 1000);

function loadActive() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")).autoReplyActive === true;
  } catch {
    return false;
  }
}

function saveActive(value) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ autoReplyActive: value }));
  } catch (error) {
    console.log("Could not save state.json:", error.message);
  }
}

let autoReplyActive = loadActive();

function setActive(value) {
  autoReplyActive = value;
  saveActive(value);
}

async function sendBotMessage(chatId, text) {
  lastBotSendAt[chatId] = Date.now();
  return client.sendMessage(chatId, text);
}

function selfChatId() {
  return client.info.wid._serialized;
}

async function handleOwnerMessage(msg) {
  const inSelfChat = msg.to === selfChatId();

  if (!inSelfChat) {
    // A reply typed by hand: ignore the bot's own echoes, otherwise pause the bot in that chat.
    const isEcho = Date.now() - (lastBotSendAt[msg.to] ?? 0) < BOT_ECHO_MS;
    if (!isEcho) lastManualAt[msg.to] = Date.now();
    return;
  }

  const command = msg.body.trim().toLowerCase();
  if (command === "/on") {
    setActive(true);
    await msg.reply(`*Bot aktif.* ${config.ownerName} lagi sibuk, biar aku yang jagain chat.`);
  } else if (command === "/off") {
    setActive(false);
    await msg.reply("*Bot istirahat.* Balasan otomatis dimatikan.");
  } else if (command === "/status") {
    await msg.reply(
      `Status bot: ${autoReplyActive ? "aktif" : "mati"}\nBalasan menunggu laporan: ${actionsSummary.length}`
    );
  } else if (command === "/pending") {
    const items = recentFollowUps(10);
    const lines = items.map(
      (item) => `- ${item.name}${item.urgent ? " (PENTING)" : ""}: "${item.message}"`
    );
    await msg.reply(
      items.length ? `*Perlu ditindaklanjuti (10 terbaru)*\n${lines.join("\n")}` : "Tidak ada yang menunggu."
    );
  } else if (command === "/help") {
    await msg.reply(HELP_TEXT);
  }
}

async function handleIncomingMessage(message) {
  if (!autoReplyActive) return;
  if (!message.body || !message.from.endsWith("@c.us")) return; // skip groups, status, media-only

  if (isPausedByManual(lastManualAt[message.from], Date.now(), config.manualPauseMinutes)) return;
  if (!allowReply(message.from)) {
    console.log("Rate limit reached for a chat, skipping a reply.");
    return;
  }

  const chat = await message.getChat();
  const contact = await message.getContact();
  const senderName = contact.pushname || "Teman";

  await chat.sendStateTyping();
  const result = await askAI(message.body, message.from);

  if (result.isUrgent) {
    await sendBotMessage(
      selfChatId(),
      `*NOTIFIKASI PENTING*\nDari: ${senderName}\nPesan: ${message.body}\n\n_Bot sudah membalas, mungkin kamu mau cek._`
    );
  }

  if (result.needsFollowUp && !result.failed) {
    await recordFollowUp({
      from: message.from,
      name: senderName,
      message: message.body.slice(0, 500),
      reply: result.text,
      urgent: result.isUrgent,
    });
  }

  const typingMs = Math.max(MIN_TYPING_MS, result.text.length * TYPING_MS_PER_CHAR);
  await new Promise((resolve) => setTimeout(resolve, typingMs));

  await sendBotMessage(message.from, result.text);
  await chat.clearState();

  if (!result.failed) {
    actionsSummary.push({ name: senderName, asked: message.body.slice(0, 80), reply: result.text.slice(0, 80) });
  }
}

function sendReport() {
  if (actionsSummary.length === 0) return;
  const lines = actionsSummary
    .map((a) => `- ${a.name}: "${a.asked}"\n  balasan: "${a.reply}"`)
    .join("\n");
  const report = `*LAPORAN ASISTEN ${config.ownerName.toUpperCase()}*\n\n${lines}\n\n_Semua sudah dibalas otomatis._`;
  actionsSummary.length = 0;
  sendBotMessage(selfChatId(), report).catch((error) =>
    console.log("Could not send the report:", error.message)
  );
}

function startBot() {
  if (!config.apiKey) {
    console.error("OPENAI_API_KEY is missing. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(config.dataDir, ".wwebjs_auth") }),
    puppeteer: {
      headless: true,
      // In Docker the system Chromium is used instead of the bundled download.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  });

  console.log("Starting WhatsApp client...");
  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    // Also save a PNG so the code can be scanned from another screen or device.
    QRCode.toFile(QR_FILE, qr, { width: 480, margin: 2 }).catch((error) =>
      console.log("Could not save qr.png:", error.message)
    );
  });

  client.on("ready", () => {
    isRestarting = false;
    console.log(`Bot ready. Auto-reply is ${autoReplyActive ? "ON" : "OFF"}.`);
    if (reportTask) {
      // Already scheduled in an earlier connection; do not create a second timer.
    } else if (cron.validate(config.reportCron)) {
      reportTask = cron.schedule(config.reportCron, sendReport);
    } else {
      console.log(`REPORT_CRON "${config.reportCron}" is not valid, reports are disabled.`);
    }
  });

  client.on("message_create", (msg) => {
    if (!msg.fromMe) return;
    handleOwnerMessage(msg).catch((error) => console.log("Owner message error:", error.message));
  });

  client.on("message", (message) => {
    if (message.fromMe || message.from === "status@broadcast") return;
    handleIncomingMessage(message).catch((error) => console.log("Reply error:", error.message));
  });

  client.on("disconnected", (reason) => {
    console.log("WhatsApp disconnected:", reason);
    restartBot();
  });

  client.initialize();
}

function restartBot() {
  if (isRestarting) return;
  isRestarting = true;
  console.log("Restarting bot...");
  Promise.resolve(client?.destroy()).catch(() => {});
  setTimeout(startBot, 5000);
}

async function shutdown() {
  console.log("Shutting down...");
  try {
    await client?.destroy();
  } finally {
    process.exit(0);
  }
}

// A client being destroyed mid-start (during a restart) rejects its pending page calls.
// Log it instead of letting Node exit, otherwise the restart can never finish.
process.on("unhandledRejection", (reason) => {
  console.log("Unhandled rejection:", reason?.message ?? reason);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startBot();
