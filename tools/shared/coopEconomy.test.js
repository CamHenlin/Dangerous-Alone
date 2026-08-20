import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SOLO_BOMB_BAG,
  SOLO_RUPEE_CAP,
  applyPartyCaps,
  bombCap,
  rupeeCap,
  shareHeartContainer,
} from './coopEconomy.js';
import { addRupees, createInventory } from './inventory.js';
import { createInventoryView, createPlayer } from './player.js';

test('caps scale with who is sitting down', () => {
  assert.equal(rupeeCap(1), SOLO_RUPEE_CAP);
  assert.equal(rupeeCap(2), 510);
  assert.equal(rupeeCap(4), 1020);
  assert.equal(bombCap(8, 1), 8);
  assert.equal(bombCap(12, 2), 24);
});

test('joining grows the bag; leaving ratchets the purse as you spend', () => {
  const inv = createInventory();
  inv.rupees = 200;
  inv.bombs = 8;
  applyPartyCaps(inv, 2);
  assert.equal(inv.rupeeCap, 510);
  assert.equal(inv.rupeeCapFloor, 510);
  assert.equal(inv.maxBombs, 16);
  assert.equal(inv.bombBag, SOLO_BOMB_BAG);
  inv.rupees = 400;
  inv.bombs = 14;
  applyPartyCaps(inv, 1);
  assert.equal(inv.rupeeCapFloor, 255);
  assert.equal(inv.rupeeCap, 400, 'the ceiling stays on the pile you hold');
  assert.equal(inv.maxBombs, 8);
  assert.equal(inv.rupees, 400, 'the excess stays');
  assert.equal(inv.bombs, 14);
  addRupees(inv, 10);
  assert.equal(inv.rupees, 400, 'cannot pick up past the ratcheted ceiling');
  addRupees(inv, -50);
  assert.equal(inv.rupees, 350);
  assert.equal(inv.rupeeCap, 350, 'spending walks the ceiling down');
  addRupees(inv, -200);
  assert.equal(inv.rupees, 150);
  assert.equal(inv.rupeeCap, 255, 'then it rests on the solo floor');
});

test('a container raises everyone and fills only the finder', () => {
  const shared = createInventory();
  const a = createPlayer({
    index: 0,
    link: {},
    sword: {},
    inv: createInventoryView(shared),
  });
  const b = createPlayer({
    index: 1,
    link: {},
    sword: {},
    inv: createInventoryView(shared),
  });
  a.inv.maxHalfHearts = 6;
  a.inv.halfHearts = 4;
  b.inv.maxHalfHearts = 6;
  b.inv.halfHearts = 2;
  a.inv.maxHalfHearts += 2;
  a.inv.halfHearts = Math.min(a.inv.maxHalfHearts, a.inv.halfHearts + 2);
  shareHeartContainer([a, b], a);
  assert.equal(a.inv.maxHalfHearts, 8);
  assert.equal(a.inv.halfHearts, 6, 'the finder is filled by one container');
  assert.equal(b.inv.maxHalfHearts, 8);
  assert.equal(b.inv.halfHearts, 2, 'the other is not healed');
});
