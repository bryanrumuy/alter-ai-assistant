"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { priceOrder, formatRupiah, describeLines } = require("./menu");

const menu = [
  { name: "Kopi susu", price: 22000 },
  { name: "Croissant", price: 20000 },
];

test("the total is computed from menu prices", () => {
  const result = priceOrder(
    [
      { name: "Kopi susu", quantity: 2 },
      { name: "Croissant", quantity: 1 },
    ],
    menu
  );
  assert.equal(result.total, 64000);
  assert.equal(describeLines(result.lines), "2x Kopi susu, 1x Croissant");
});

test("names are matched ignoring case and the same item is merged", () => {
  const result = priceOrder(
    [
      { name: "kopi SUSU", quantity: 1 },
      { name: "Kopi susu", quantity: 2 },
    ],
    menu
  );
  assert.deepEqual(result.lines, [{ name: "Kopi susu", quantity: 3, price: 22000, subtotal: 66000 }]);
});

test("an item that is not on the menu is rejected", () => {
  assert.match(priceOrder([{ name: "Es krim", quantity: 1 }], menu).error, /not on the menu/);
});

test("bad quantities and empty orders are rejected", () => {
  assert.ok(priceOrder([{ name: "Kopi susu", quantity: 0 }], menu).error);
  assert.ok(priceOrder([{ name: "Kopi susu", quantity: 1.5 }], menu).error);
  assert.ok(priceOrder([{ name: "Kopi susu", quantity: 999 }], menu).error);
  assert.ok(priceOrder([], menu).error);
  assert.ok(priceOrder("kopi", menu).error);
});

test("rupiah amounts are written with thousands separators", () => {
  assert.equal(formatRupiah(64000), "Rp64.000");
});
