"use strict";

const fs = require("fs");
const path = require("path");
const config = require("./config");

const STATE_FILE = path.join(config.dataDir, "telegram-state.json");
const INACTIVE_TEXT = "Asistennya lagi istirahat. Coba lagi nanti ya.";
const startText = (owner) =>
  `Halo! Aku asisten AI-nya ${owner}. ${owner} lagi nggak pegang HP, tapi kamu bisa tanya atau titip pesan di sini.`;

function loadActive() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")).active === true;
  } catch {
    return false;
  }
}

function saveActive(active) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ active }));
  } catch (error) {
    console.log("Could not save telegram-state.json:", error.message);
  }
}

/**
 * The Telegram side of the assistant, free of any Telegram library so it can be tested.
 * `io` carries the actions of one incoming message: reply(text), typing(), notifyOwner(text).
 */
function createAssistant({ askAI, recordFollowUp, recentFollowUps, allowReply, ownerId, ownerName }) {
  let active = loadActive();

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
      active = command === "on";
      saveActive(active);
      await io.reply(active ? "Bot aktif." : "Bot istirahat.");
    } else if (command === "status") {
      await io.reply(`Status bot: ${active ? "aktif" : "mati"}`);
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

  async function handleText(message, io) {
    if (!active) {
      await io.reply(INACTIVE_TEXT);
      return;
    }
    if (!allowReply(message.chatId)) return;

    await io.typing();
    const result = await askAI(message.text, `tg:${message.chatId}`);

    if (result.needsFollowUp && !result.failed) {
      await recordFollowUp({
        from: `tg:${message.chatId}`,
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
  }

  return { handleCommand, handleText, isActive: () => active };
}

module.exports = { createAssistant, INACTIVE_TEXT };
