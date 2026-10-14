"use strict";

const path = require("path");
const config = require("./config");
const { readActive, writeActive } = require("./state");
const { describeLines, formatRupiah } = require("./menu");

const DEFAULT_STATE_FILE = path.join(config.dataDir, "telegram-state.json");
const INACTIVE_TEXT = "Asistennya lagi istirahat. Coba lagi nanti ya.";
const CHANNEL = "telegram";

const startText = (ownerName) =>
  config.mode === "business"
    ? `Halo! Aku asisten AI ${config.businessName}. Tanyakan apa saja soal layanan kami, atau titip pesan untuk tim.`
    : `Halo! Aku asisten AI-nya ${ownerName}. ${ownerName} lagi nggak pegang HP, tapi kamu bisa tanya atau titip pesan di sini.`;

/**
 * The Telegram side of the assistant, free of any Telegram library so it can be tested.
 * `io` carries the actions of one incoming message: reply(text), typing(), notifyOwner(text).
 * The on/off switch is read from a file on every message, so the dashboard can flip it.
 */
function createAssistant({
  askAI,
  recordFollowUp,
  recentFollowUps,
  allowReply,
  ownerId,
  ownerName,
  store = null,
  stateFile = DEFAULT_STATE_FILE,
}) {
  const isActive = () => readActive(stateFile);

  function isOwner(userId) {
    return ownerId !== "" && String(userId) === String(ownerId);
  }

  async function handleCommand(command, user, io) {
    if (command === "start") {
      await io.reply(startText(ownerName));
      return;
    }
    if (command === "myid") {
      await io.reply(`ID Telegram kamu: ${user.id}`);
      return;
    }
    if (!isOwner(user.id)) {
      await io.reply("Perintah ini hanya untuk pemilik bot.");
      return;
    }
    if (command === "on" || command === "off") {
      writeActive(stateFile, command === "on");
      await io.reply(command === "on" ? "Bot aktif." : "Bot istirahat.");
    } else if (command === "status") {
      await io.reply(`Status bot: ${isActive() ? "aktif" : "mati"}`);
    } else if (command === "pending") {
      const items = recentFollowUps(10);
      const lines = items.map(
        (item) => `- ${item.name}${item.urgent ? " (PENTING)" : ""}: "${item.message}"`
      );
      await io.reply(
        items.length ? `Perlu ditindaklanjuti (10 terbaru)\n${lines.join("\n")}` : "Tidak ada yang menunggu."
      );
    } else {
      await io.reply("Perintah: /on /off /status /pending /myid");
    }
  }

  function log(message, direction, text) {
    try {
      store?.logMessage({
        channel: CHANNEL,
        chatId: message.chatId,
        name: message.name,
        direction,
        text,
      });
    } catch (error) {
      console.log("Could not log the message:", error.message);
    }
  }

  async function handleText(message, io) {
    if (!isActive()) {
      await io.reply(INACTIVE_TEXT);
      return;
    }
    if (!allowReply(message.chatId)) return;

    log(message, "in", message.text);
    await io.typing();
    const result = await askAI(message.text, `tg:${message.chatId}`, {
      channel: CHANNEL,
      chatId: message.chatId,
      name: message.name,
    });

    for (const order of result.orders ?? []) {
      await io.notifyOwner(
        `Pesanan baru #${order.id}\nDari: ${message.name}\n${describeLines(order.items)}\nTotal: ${formatRupiah(order.total)}\nAmbil: ${order.pickupTime}${order.note ? `\nCatatan: ${order.note}` : ""}`
      );
    }

    if (result.needsFollowUp && !result.failed) {
      await recordFollowUp({
        channel: CHANNEL,
        chatId: message.chatId,
        name: message.name,
        message: message.text.slice(0, 500),
        reply: result.text,
        urgent: result.isUrgent,
      });
      await io.notifyOwner(
        `${result.isUrgent ? "PENTING. " : ""}Perlu ditindaklanjuti\nDari: ${message.name}\nPesan: ${message.text.slice(0, 500)}\nBalasan bot: ${result.text}`
      );
    }
    await io.reply(result.text);
    log(message, "out", result.text);
  }

  return { handleCommand, handleText, isActive };
}

module.exports = { createAssistant, INACTIVE_TEXT };
