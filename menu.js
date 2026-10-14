"use strict";

const fs = require("fs");
const path = require("path");

const MAX_QTY_PER_ITEM = 20;
const MAX_LINES = 10;
const DEFAULT_FILE = path.join(__dirname, "menu.json");

/** The sellable items: [{ name, price }]. An empty list means ordering is switched off. */
function loadMenu(file = DEFAULT_FILE) {
  try {
    const items = JSON.parse(fs.readFileSync(file, "utf-8"));
    return items.filter((item) => typeof item.name === "string" && Number.isInteger(item.price) && item.price >= 0);
  } catch {
    return [];
  }
}

function formatRupiah(amount) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

/**
 * Turns what the model asked for into priced order lines. Names must match the menu and
 * the total is computed here, never taken from the model.
 * Returns { lines, total } or { error }.
 */
function priceOrder(rawItems, menu) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: "Pesanan kosong." };
  if (rawItems.length > MAX_LINES) return { error: `Maksimal ${MAX_LINES} jenis item per pesanan.` };

  const byName = new Map(menu.map((item) => [item.name.toLowerCase(), item]));
  const merged = new Map();
  for (const raw of rawItems) {
    const menuItem = byName.get(String(raw?.name ?? "").trim().toLowerCase());
    if (!menuItem) return { error: `Item "${raw?.name}" tidak ada di menu.` };
    const qty = raw.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      return { error: `Jumlah ${menuItem.name} harus 1 sampai ${MAX_QTY_PER_ITEM}.` };
    }
    merged.set(menuItem.name, (merged.get(menuItem.name) ?? 0) + qty);
  }

  const lines = [...merged].map(([name, quantity]) => {
    const price = byName.get(name.toLowerCase()).price;
    return { name, quantity, price, subtotal: price * quantity };
  });
  return { lines, total: lines.reduce((sum, line) => sum + line.subtotal, 0) };
}

function describeLines(lines) {
  return lines.map((line) => `${line.quantity}x ${line.name}`).join(", ");
}

module.exports = { loadMenu, priceOrder, formatRupiah, describeLines };
