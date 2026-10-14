"use strict";

// Fills an EMPTY database with a day of fictional customer conversations for demos and screenshots.
// The replies are written by the real assistant (about 25 model calls), so what you see is what the bot does.
// Usage: node seed-demo.js   (refuses to run if the database already has conversations)

const fs = require("fs");
const os = require("os");
const path = require("path");

// Environment first. The database is the real one; the chat memory and on/off switch go to a throwaway folder.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "alter-seed-"));
process.env.DB_FILE = process.env.DB_FILE || path.join(__dirname, "alter.db");
process.env.DATA_DIR = scratch;
process.env.BOT_MODE = "business";
process.env.BUSINESS_NAME = "Kopi Senja";
process.env.KNOWLEDGE_FILE = process.env.KNOWLEDGE_FILE || "knowledge.md";
fs.writeFileSync(path.join(scratch, "telegram-state.json"), JSON.stringify({ active: true }));

const askAI = require("./ai-online");
const { getStore } = require("./db");
const { recordFollowUp, recentFollowUps } = require("./followups");
const { createAssistant } = require("./telegram-core");

const MINUTE = 60 * 1000;
const STEP_MS = 50 * 1000; // seconds between messages inside one conversation

/** Fictional customers. `confirm` retries a short "yes" until the order exists; `status` is the order's final state. */
const customers = [
  { id: 910001, name: "Emma Carter", minutesAgo: 420, turns: ["Hi! What time do you close today?", "Do you have oat milk?", "Great. Can I order 2 iced lattes and 1 butter croissant for pickup tomorrow at 8:30 am?"], confirm: true, status: "diproses" },
  { id: 910009, name: "Chloe Martin", minutesAgo: 540, turns: ["Hello, I'd like 2 americanos for pickup tomorrow at 9:00 am."], confirm: true, status: "selesai" },
  { id: 910002, name: "Liam Walker", minutesAgo: 300, turns: ["Do you deliver to Darmo?", "Ok, no problem. Thanks!"] },
  { id: 910003, name: "Sofia Rossi", minutesAgo: 240, turns: ["My matcha latte was cold when I picked it up today and I'd like a refund, please."] },
  { id: 910004, name: "Noah Kim", minutesAgo: 180, turns: ["URGENT: my daughter has a nut allergy and ate your cheesecake. She is struggling to breathe, please help!"] },
  { id: 910005, name: "Olivia Brown", minutesAgo: 120, turns: ["Hi, we are planning an office party for 40 people next Friday. Do you offer a catering discount?"] },
  { id: 910006, name: "Daniel Tan", minutesAgo: 90, turns: ["Morning order please: 3 americanos for pickup tomorrow at 8:15 am."], confirm: true, status: "siap" },
  { id: 910007, name: "Maya Patel", minutesAgo: 50, turns: ["Are your drinks vegan-friendly? I only drink plant-based milk.", "Perfect, thank you!"] },
  { id: 910008, name: "Ethan Wright", minutesAgo: 30, turns: ["One cheesecake slice and one iced latte for pickup tomorrow at 4:15 pm, please."], confirm: true, status: "baru" },
];

const store = getStore();

function ioFor(sink) {
  return {
    reply: async (text) => sink.replies.push(text),
    typing: async () => {},
    notifyOwner: async () => {},
  };
}

async function runCustomer(assistant, customer) {
  const sink = { replies: [] };
  const io = ioFor(sink);
  const send = (text) => assistant.handleText({ chatId: customer.id, name: customer.name, text }, io);

  for (const turn of customer.turns) await send(turn);
  // The assistant has to show the total first and the customer then confirms: say "yes" until it is stored.
  for (let attempt = 0; customer.confirm && attempt < 3 && store.countOpenOrders("telegram", customer.id) === 0; attempt += 1) {
    await send(attempt === 0 ? "Yes, that's correct, please confirm." : "Yes, please place the order.");
  }
  return sink.replies.at(-1);
}

/** Spreads a conversation over the day it supposedly happened, instead of "all within one minute". */
function backdate(customer) {
  const raw = store.raw;
  const start = Date.now() - customer.minutesAgo * MINUTE;
  const messages = raw.prepare("SELECT id FROM messages WHERE channel = 'telegram' AND chat_id = ? ORDER BY id").all(String(customer.id));
  const update = raw.prepare("UPDATE messages SET ts = ? WHERE id = ?");
  let last = start;
  messages.forEach((message, index) => {
    last = start + index * STEP_MS;
    update.run(new Date(last).toISOString(), message.id);
  });
  const moment = new Date(last).toISOString();
  raw.prepare("UPDATE followups SET ts = ? WHERE channel = 'telegram' AND chat_id = ?").run(moment, String(customer.id));
  raw.prepare("UPDATE orders SET ts = ? WHERE channel = 'telegram' AND chat_id = ?").run(moment, String(customer.id));
}

async function main() {
  if (store.stats().chatsTotal > 0) {
    console.error("The database already has conversations. Back it up and start from an empty one before seeding.");
    process.exit(1);
  }

  const assistant = createAssistant({
    askAI,
    recordFollowUp,
    recentFollowUps,
    allowReply: () => true,
    ownerId: "",
    ownerName: "Bryan",
    store,
    stateFile: path.join(scratch, "telegram-state.json"),
  });

  for (const customer of customers) {
    const last = await runCustomer(assistant, customer);
    console.log(`${customer.name}: ${String(last).replace(/\s+/g, " ").slice(0, 110)}`);
  }

  for (const customer of customers) {
    backdate(customer);
    const order = store.listOrders("active").concat(store.listOrders("done")).find((o) => o.chat_id === String(customer.id));
    if (customer.status && order && customer.status !== "baru") store.setOrderStatus(order.id, customer.status);
  }

  const stats = store.stats();
  console.log("\nSeeded:", JSON.stringify(stats));
  const missing = customers.filter((c) => c.confirm && store.countOpenOrders("telegram", c.id) + store.listOrders("done").filter((o) => o.chat_id === String(c.id)).length === 0);
  if (missing.length) console.log("No order was created for:", missing.map((c) => c.name).join(", "));
  fs.rmSync(scratch, { recursive: true, force: true });
  store.close();
}

main();
