import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ITEM,
  MONEY_GAME_LOSS,
  MONEY_GAME_PERM_ENDS,
  MONEY_GAME_PERMUTATIONS,
  MONEY_GAME_WIN,
  activeSlots,
  buildCaveTable,
  classifyCave,
  getCave,
  grantCaveItem,
  heartRequirement,
  priceRowIndex,
  rollMoneyGameAmounts,
  tryBuyCaveSlot,
  tryGamble,
} from './caves.js';
import { createInventory } from './inventory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROM = path.join(ROOT, 'zelda.nes');

function loadFromRom() {
  const rom = fs.readFileSync(ROM);
  const prg = rom.subarray(16);
  const items = prg.subarray(0x18600, 0x18600 + 60);
  const prices = prg.subarray(0x18648, 0x18648 + 60);
  const textFlags = prg.subarray(0x045a2, 0x045a2 + 20);
  const dwellers = prg.subarray(0x06e6f, 0x06e6f + 20);
  return buildCaveTable(items, prices, textFlags, dwellers, { 0: 'IT\'S DANGEROUS' }, [0x1d, 0x23, 0x49, 0x79]);
}

test('shop price rows are offset by 4', () => {
  assert.equal(priceRowIndex(0x1e, 'shop'), 10);
  assert.equal(priceRowIndex(0x1a, 'potion'), 6);
  assert.equal(priceRowIndex(0x10, 'give'), 0);
});

test('G7 shop sells blue candle for 60', () => {
  const table = loadFromRom();
  const shop = getCave(table, 0x1e);
  assert.equal(shop.kind, 'shop');
  const candle = shop.slots.find((s) => s.item === ITEM.BLUE_CANDLE);
  assert.ok(candle);
  assert.equal(candle.price, 60);
});

test('wood sword cave is a free gift', () => {
  const table = loadFromRom();
  const cave = getCave(table, 0x10);
  assert.equal(cave.kind, 'give');
  const inv = createInventory();
  const taken = new Set();
  const mid = cave.slots.findIndex((s) => s.item === ITEM.WOOD_SWORD);
  const result = tryBuyCaveSlot(inv, cave, mid, { taken });
  assert.equal(result.ok, true);
  assert.equal(inv.sword, 1);
});

test('white sword requires 5 hearts', () => {
  const table = loadFromRom();
  const cave = getCave(table, 0x12);
  assert.equal(heartRequirement(cave), 5);
  const inv = createInventory();
  const slot = cave.slots.findIndex((s) => s.item === ITEM.WHITE_SWORD);
  assert.equal(tryBuyCaveSlot(inv, cave, slot).ok, false);
  inv.maxHalfHearts = 10;
  inv.halfHearts = 10;
  assert.equal(tryBuyCaveSlot(inv, cave, slot).ok, true);
  assert.equal(inv.sword, 2);
});

test('potion shop needs letter', () => {
  const table = loadFromRom();
  const cave = getCave(table, 0x1a);
  assert.equal(cave.kind, 'potion');
  const inv = createInventory();
  inv.rupees = 200;
  const slot = activeSlots(cave)[0].index;
  assert.equal(tryBuyCaveSlot(inv, cave, slot).reason, 'Show the letter first');
  inv.letter = 1;
  assert.equal(tryBuyCaveSlot(inv, cave, slot).reason, 'Show the letter first');
  inv.letter = 2;
  const bought = tryBuyCaveSlot(inv, cave, slot);
  assert.equal(bought.ok, true);
});

test('grantCaveItem sets candle and ring', () => {
  const inv = createInventory();
  grantCaveItem(inv, ITEM.BLUE_CANDLE);
  assert.equal(inv.candle, 1);
  grantCaveItem(inv, ITEM.BLUE_RING);
  assert.equal(inv.ring, 1);
});

test('classifyCave covers shops', () => {
  assert.equal(classifyCave(0x1d, 0xdc, {}), 'shop');
  assert.equal(classifyCave(0x14, 0x04, {}), 'road');
});

test('rollMoneyGameAmounts uses ROM permutation tables', () => {
  assert.equal(MONEY_GAME_PERMUTATIONS.length, 18);
  assert.equal(MONEY_GAME_PERM_ENDS.length, 6);
  const amounts = rollMoneyGameAmounts(() => 0);
  assert.equal(amounts.length, 3);
  const pool = new Set([
    -MONEY_GAME_LOSS[0],
    -MONEY_GAME_LOSS[1],
    MONEY_GAME_WIN[0],
    MONEY_GAME_WIN[1],
  ]);
  for (const a of amounts) assert.ok(pool.has(a));
  // First permutation end-index 2 → indexes 0,1,2 → all three pool slots.
  assert.deepEqual(
    [...new Set(amounts.map((a) => (a < 0 ? 'loss' : 'win')))].sort(),
    ['loss', 'win'],
  );
});

test('tryGamble consumes a pre-rolled slot', () => {
  const inv = createInventory();
  inv.rupees = 50;
  const amounts = [-10, -40, 20];
  const result = tryGamble(inv, { kind: 'gamble' }, 2, amounts);
  assert.equal(result.ok, true);
  assert.equal(result.delta, 20);
  assert.equal(inv.rupees, 70);
});
