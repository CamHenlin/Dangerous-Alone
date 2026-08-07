import test from 'node:test';
import assert from 'node:assert/strict';

import { B_ITEM, createInventory } from './inventory.js';
import { ITEM, tryBuyCaveSlot } from './caves.js';
import {
  LETTER,
  canShowLetter,
  isPotionShop,
  letterWasShown,
  potionShopWaresHidden,
  showLetter,
} from './potionShop.js';

function potionShop() {
  return {
    caveId: 0x1a,
    kind: 'potion',
    slots: [
      { item: ITEM.BLUE_POTION, price: 40 },
      { item: ITEM.RED_POTION, price: 68 },
      { item: ITEM.NOTHING, price: 0 },
    ],
    itemFlags: {},
  };
}

test('wares stay hidden until the letter has been shown', () => {
  const cave = potionShop();
  const inv = createInventory();
  assert.equal(potionShopWaresHidden(cave, inv), true);
  inv.letter = LETTER.HELD;
  assert.equal(potionShopWaresHidden(cave, inv), true, 'holding is not showing');
  inv.letter = LETTER.SHOWN;
  assert.equal(potionShopWaresHidden(cave, inv), false);
  assert.equal(letterWasShown(inv), true);
});

test('only the potion shop hides its wares', () => {
  const shop = { caveId: 0x1d, kind: 'shop', slots: [] };
  assert.equal(isPotionShop(shop), false);
  assert.equal(potionShopWaresHidden(shop, createInventory()), false);
  assert.equal(potionShopWaresHidden(null, createInventory()), false);
});

test('B shows the letter only while it occupies the B slot', () => {
  const cave = potionShop();
  const inv = createInventory();
  inv.letter = LETTER.HELD;
  assert.equal(canShowLetter(cave, inv), false, 'B slot is empty');

  inv.selectedB = B_ITEM.POTION;
  assert.equal(canShowLetter(cave, inv), true);

  // CheckMissingItem only redirects to the letter slot when there is no potion.
  inv.potion = 1;
  assert.equal(canShowLetter(cave, inv), false);
});

test('showing the letter marks it used and retargets the B slot', () => {
  const inv = createInventory();
  inv.letter = LETTER.HELD;
  inv.selectedB = B_ITEM.POTION;
  const result = showLetter(inv);
  assert.deepEqual(result, { ok: true, tune: 'secret' });
  assert.equal(inv.letter, LETTER.SHOWN);
  assert.equal(inv.selectedB, B_ITEM.POTION);

  // INC InvLetter runs once; a second B press is a no-op.
  assert.deepEqual(showLetter(inv), { ok: false });
  assert.equal(inv.letter, LETTER.SHOWN);
});

test('a merely held letter no longer unlocks the purchase', () => {
  const cave = potionShop();
  const inv = createInventory();
  inv.rupees = 200;
  inv.letter = LETTER.HELD;
  const blocked = tryBuyCaveSlot(inv, cave, 0, { taken: new Set() });
  assert.equal(blocked.ok, false);

  inv.letter = LETTER.SHOWN;
  const bought = tryBuyCaveSlot(inv, cave, 0, { taken: new Set() });
  assert.equal(bought.ok, true);
  assert.equal(inv.rupees, 160);
});
