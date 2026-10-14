"use strict";

const { Bot } = require("grammy");
const config = require("./config");
const askAI = require("./ai-online");
const { createRateLimiter } = require("./lib");
const { recordFollowUp, recentFollowUps } = require("./followups");
const { createAssistant } = require("./telegram-core");
const { getStore } = require("./db");

if (!config.apiKey) {
  console.error("OPENAI_API_KEY is missing. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!config.telegramToken) {
  console.error("TELEGRAM_BOT_TOKEN is missing. Create a bot with @BotFather and put its token in .env.");
  process.exit(1);
}

const bot = new Bot(config.telegramToken);
const assistant = createAssistant({
  askAI,
  recordFollowUp,
  recentFollowUps,
  allowReply: createRateLimiter(config.maxRepliesPerMinute, 60 * 1000),
  ownerId: config.telegramOwnerId,
  ownerName: config.ownerName,
  store: getStore(),
});

function ioFor(ctx) {
  return {
    reply: (text) => ctx.reply(text),
    typing: () => ctx.replyWithChatAction("typing"),
    notifyOwner: async (text) => {
      if (!config.telegramOwnerId) return;
      await bot.api
        .sendMessage(config.telegramOwnerId, text)
        .catch((error) => console.log("Could not notify the owner:", error.message));
    },
  };
}

for (const command of ["start", "myid", "on", "off", "status", "pending", "help"]) {
  bot.command(command, (ctx) => assistant.handleCommand(command, ctx.from, ioFor(ctx)));
}

bot.on("message:text", (ctx) => {
  if (ctx.chat.type !== "private") return; // private chats only
  const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Teman";
  return assistant.handleText({ chatId: ctx.chat.id, name, text: ctx.message.text }, ioFor(ctx));
});

bot.catch((error) => console.log("Telegram error:", error.message));

bot.start({
  onStart: (me) => {
    const hint = config.telegramOwnerId
      ? ""
      : " Set TELEGRAM_OWNER_ID (send /myid to the bot) to get alerts and owner commands.";
    console.log(`Telegram bot @${me.username} ready. Auto-reply is ${assistant.isActive() ? "ON" : "OFF"}.${hint}`);
  },
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
