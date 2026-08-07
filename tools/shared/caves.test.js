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
  alreadyOwnsShopItem,
  clearShopVisitTaken,
  grantCaveItem,
  heartRequirement,
  priceRowIndex,
  rollMoneyGameAmounts,
  caveTakenKey,
  takeAnyRoadDest,
  tryBuyCaveSlot,
  tryDoorRepair,
  tryGamble,
  tryMoblinGift,
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

test('clearShopVisitTaken restocks shop shelves between visits', () => {
  const taken = new Set(['29:0', '29:1', '29:2', '16:0']);
  clearShopVisitTaken({ caveId: 0x1d, kind: 'shop' }, taken);
  assert.equal(taken.has('29:1'), false);
  assert.equal(taken.has('16:0'), true); // gift cave stays taken
  clearShopVisitTaken({ caveId: 0x10, kind: 'give' }, taken);
  assert.equal(taken.has('16:0'), true);
});

test('shop refuses arrows once owned; magic shield stays buyable', () => {
  const table = loadFromRom();
  const shop = getCave(table, 0x1d);
  const arrowSlot = shop.slots.findIndex((s) => s.item === ITEM.WOOD_ARROW);
  const shieldSlot = shop.slots.findIndex((s) => s.item === ITEM.MAGIC_SHIELD);
  assert.ok(arrowSlot >= 0);
  assert.ok(shieldSlot >= 0);

  const inv = createInventory();
  inv.rupees = 200;
  inv.arrow = 1;
  assert.equal(alreadyOwnsShopItem(inv, ITEM.WOOD_ARROW), true);
  assert.equal(tryBuyCaveSlot(inv, shop, arrowSlot).reason, 'Already own this');
  assert.equal(inv.rupees, 200);

  inv.magicShield = 1;
  assert.equal(alreadyOwnsShopItem(inv, ITEM.MAGIC_SHIELD), false);
  assert.equal(tryBuyCaveSlot(inv, shop, shieldSlot).ok, true);
  assert.equal(inv.rupees, 200 - shop.slots[shieldSlot].price);
});

test('shop inventories match the walkthrough / ROM', () => {
  const table = loadFromRom();
  const expect = (caveId, wares) => {
    const shop = getCave(table, caveId);
    assert.equal(shop.kind, 'shop');
    assert.deepEqual(
      shop.slots.map((s) => [s.item, s.price]),
      wares,
    );
  };
  // Shop One — G7 candle shop
  expect(0x1e, [
    [ITEM.MAGIC_SHIELD, 160],
    [ITEM.KEY, 100],
    [ITEM.BLUE_CANDLE, 60],
  ]);
  // Shop Two / Four — arrows
  expect(0x1d, [
    [ITEM.MAGIC_SHIELD, 130],
    [ITEM.BOMBS, 20],
    [ITEM.WOOD_ARROW, 80],
  ]);
  // Shop Three — cheap shield
  expect(0x1f, [
    [ITEM.MAGIC_SHIELD, 90],
    [ITEM.BAIT, 100],
    [ITEM.HEART, 10],
  ]);
  // Shop Five — blue ring
  expect(0x20, [
    [ITEM.KEY, 80],
    [ITEM.BLUE_RING, 250],
    [ITEM.BAIT, 60],
  ]);
});

test('classifyCave covers shops', () => {
  assert.equal(classifyCave(0x1d, 0xdc, {}), 'shop');
  assert.equal(classifyCave(0x14, 0x04, {}), 'road');
});

test('take-any / door / moblin taken flags are per OW room', () => {
  const inv = createInventory();
  const takeAny = {
    caveId: 0x11,
    kind: 'take_any',
    slots: [
      { item: ITEM.RED_POTION, price: 0 },
      { item: ITEM.NOTHING, price: 0 },
      { item: ITEM.HEART_CONTAINER, price: 0 },
    ],
  };
  const taken = new Set();
  // Loot L8 ($7b); P3 ($2f) must stay stocked.
  const atL8 = tryBuyCaveSlot(inv, takeAny, 2, { taken, roomId: 0x7b });
  assert.equal(atL8.ok, true);
  assert.ok(taken.has(caveTakenKey(takeAny, 'any', 0x7b)));
  assert.equal(taken.has('17:any'), false, 'legacy global key must not be written');
  assert.equal(
    tryBuyCaveSlot(inv, takeAny, 2, { taken, roomId: 0x7b }).ok,
    false,
  );
  assert.equal(
    tryBuyCaveSlot(inv, takeAny, 2, { taken, roomId: 0x2f }).ok,
    true,
  );

  const door = {
    caveId: 0x17,
    kind: 'door',
    slots: [{ item: 0, price: 20 }, { item: 0, price: 0 }, { item: 0, price: 0 }],
  };
  inv.rupees = 100;
  const dTaken = new Set();
  assert.equal(tryDoorRepair(inv, door, { taken: dTaken, roomId: 0x01 }).ok, true);
  assert.equal(tryDoorRepair(inv, door, { taken: dTaken, roomId: 0x01 }).ok, false);
  assert.equal(tryDoorRepair(inv, door, { taken: dTaken, roomId: 0x03 }).ok, true);

  const moblin = {
    caveId: 0x21,
    kind: 'moblin',
    slots: [{ item: 0, price: 30 }, { item: 0, price: 0 }, { item: 0, price: 0 }],
  };
  const mTaken = new Set();
  assert.equal(tryMoblinGift(inv, moblin, { taken: mTaken, roomId: 0x13 }).ok, true);
  assert.equal(tryMoblinGift(inv, moblin, { taken: mTaken, roomId: 0x13 }).ok, false);
  assert.equal(tryMoblinGift(inv, moblin, { taken: mTaken, roomId: 0x28 }).ok, true);
});

test('takeAnyRoadDest advances +1/+2/+3 along the loop', () => {
  const roads = [0x1d, 0x23, 0x49, 0x79];
  assert.equal(takeAnyRoadDest(roads, 0x1d, 0), 0x23);
  assert.equal(takeAnyRoadDest(roads, 0x1d, 1), 0x49);
  assert.equal(takeAnyRoadDest(roads, 0x1d, 2), 0x79);
  assert.equal(takeAnyRoadDest(roads, 0x79, 0), 0x1d);
  assert.equal(takeAnyRoadDest(roads, 0x99, 0), 0x23); // unknown → from index 0
  assert.equal(takeAnyRoadDest(roads, 0x1d, 3), null);
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
