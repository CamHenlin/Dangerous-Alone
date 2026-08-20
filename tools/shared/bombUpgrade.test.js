import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory } from './inventory.js';
import {
  BOMB_UPGRADE_PERSON,
  BOMB_UPGRADE_PRICE,
  tryBuyBombUpgrade,
} from './bombUpgrade.js';

test('bomb upgrade costs 100 and adds 4 capacity', () => {
  const inv = createInventory();
  inv.rupees = 100;
  inv.bombs = 2;
  assert.equal(tryBuyBombUpgrade(inv, 0x78, 0x98), true);
  assert.equal(inv.rupees, 0);
  assert.equal(inv.maxBombs, 12);
  assert.equal(inv.bombs, 12);
  assert.equal(BOMB_UPGRADE_PERSON, 0x4f);
  assert.equal(BOMB_UPGRADE_PRICE, 100);
});

test('a bomb upgrade keeps the party multiplier on the new bag', () => {
  const inv = createInventory();
  inv.rupees = 100;
  inv.bombBag = 8;
  inv.maxBombs = 16;
  inv.bombs = 3;
  assert.equal(tryBuyBombUpgrade(inv, 0x78, 0x98), true);
  assert.equal(inv.bombBag, 12);
  assert.equal(inv.maxBombs, 24, 'two players should still get ×2 of the new bag');
  assert.equal(inv.bombs, 24);
});

test('bomb upgrade rejects wrong position or poor Link', () => {
  const inv = createInventory();
  inv.rupees = 100;
  assert.equal(tryBuyBombUpgrade(inv, 0x70, 0x98), false);
  assert.equal(tryBuyBombUpgrade(inv, 0x78, 0x80), false);
  inv.rupees = 99;
  assert.equal(tryBuyBombUpgrade(inv, 0x78, 0x98), false);
  assert.equal(inv.maxBombs, 8);
});
