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
process.env.KNOWLEDGE_FILE = "knowledge.business-example.md";

const askAI = require("./ai-online");
const { getStore } = require("./db");

const scenarios = [
  {
    name: "a clear order that the customer confirms",
    turns: ["pesan 2 kopi susu dan 1 croissant, ambil jam 5 sore", "ya, betul"],
    check: (orders) =>
      orders.length === 1 && orders[0].total === 64000 && orders[0].items.length === 2,
  },
  {
    name: "an item that is not on the menu is never ordered",
    turns: ["pesan 1 es krim vanilla ambil jam 3", "ya pesan itu"],
    check: (orders) => orders.length === 0,
  },
  {
    name: "a complete order in one message is only summarised, not stored (the Rp690.000 case)",
    turns: ["saya pesan matcha latte 15 sama croissant 15 ya, ambil jam 12 siang"],
    check: (orders, last) => orders.length === 0 && /690\.?000/.test(last.text),
  },
  {
    name: "no order is created before the customer confirms",
    turns: ["mau 1 americano ambil jam 10"],
    check: (orders) => orders.length === 0,
  },
  {
    name: "the customer changes the quantity before confirming",
    turns: ["pesan 1 matcha latte ambil jam 4 sore", "eh jadi 3 aja", "oke betul"],
    check: (orders) => orders.length === 1 && orders[0].items[0].quantity === 3 && orders[0].total === 78000,
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
