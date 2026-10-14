"use strict";

// Ordering check against the real model, in a throwaway data folder (your real orders are not touched).
// Usage: npm run eval:orders   (makes ~10 API calls)

const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alter-eval-orders-"));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, "eval.db");
process.env.BOT_MODE = "business";
process.env.BUSINESS_NAME = "Kopi Senja";
process.env.KNOWLEDGE_FILE = "knowledge.business-example.en.md";

const askAI = require("./ai-online");
const { getStore } = require("./db");

const scenarios = [
  {
    name: "a clear order that the customer confirms",
    turns: ["I'd like 2 iced lattes and 1 butter croissant, pickup tomorrow at 5 pm", "yes, that's right"],
    check: (orders) => orders.length === 1 && orders[0].total === 80000 && orders[0].items.length === 2,
  },
  {
    name: "an item that is not on the menu is never ordered",
    turns: ["1 vanilla ice cream please, pickup tomorrow at 3 pm", "yes please order it"],
    check: (orders) => orders.length === 0,
  },
  {
    name: "a complete order in one message is only summarised, not stored",
    turns: ["I want 8 matcha lattes and 8 butter croissants, pickup tomorrow at 12:30 pm"],
    check: (orders, last) => orders.length === 0 && /432[.,]?000/.test(last.text),
  },
  {
    name: "no order is created before the customer confirms",
    turns: ["1 americano, pickup tomorrow at 10 am"],
    check: (orders) => orders.length === 0,
  },
  {
    name: "a vague pickup time is not accepted",
    turns: ["1 cheesecake slice, I'll pick it up after lunch", "yes, order it"],
    check: (orders) => orders.length === 0,
  },
  {
    name: "saying yes twice does not create a second order",
    turns: ["1 americano, pickup tomorrow at 9 am", "yes", "yes please", "yes, go ahead"],
    check: (orders) => orders.length === 1,
  },
  {
    name: "the customer changes the quantity before confirming",
    turns: ["1 matcha latte, pickup tomorrow at 4 pm", "actually make it 3", "yes that's right", "regular milk is fine, yes please place the order"],
    check: (orders) => orders.length === 1 && orders[0].items[0].quantity === 3 && orders[0].total === 90000,
  },
];

async function main() {
  let passed = 0;
  for (const [index, scenario] of scenarios.entries()) {
    const customer = `EVALORDER${index}@c.us`;
    const created = [];
    let last = null;
    for (const turn of scenario.turns) {
      last = await askAI(turn, customer, { channel: "telegram", chatId: 1000 + index, name: "Penguji" });
      created.push(...last.orders);
    }
    const ok = scenario.check(created, last) && !last.failed;
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${scenario.name}`);
    console.log(`       orders: ${created.map((o) => `#${o.id} Rp${o.total}`).join(", ") || "none"}  |  last reply: ${last.text}`);
  }
  console.log(`\n${passed}/${scenarios.length} passed`);
  getStore().close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(passed === scenarios.length ? 0 : 1);
}

main();
