import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARROW,
  B_ITEM,
  CANDLE_TIER,
  FLASH_BUBBLE_BLOCK_FRAMES,
  SWORD,
  addBombs,
  addRupees,
  applyBubbleSwordBlock,
  canSwingSword,
  createInventory,
  cycleBItem,
  grantCaveExtras,
  grantRoomItem,
  grantWoodenSword,
  harmLink,
  hasTriforce,
  healLink,
  heartDisplay,
  ratchetRupeeCap,
  stealMagicShield,
  stepLinkStatus,
  triforceCount,
  trySpendArrowShot,
} from './inventory.js';
import { createInventoryView } from './player.js';

test('the rupee ceiling ratchets down to what you hold, not below the floor', () => {
  const inv = createInventory();
  inv.rupeeCapFloor = 255;
  inv.rupeeCap = 510;
  inv.rupees = 400;
  ratchetRupeeCap(inv);
  assert.equal(inv.rupeeCap, 400);
  addRupees(inv, 10);
  assert.equal(inv.rupees, 400, 'cannot pick up past the ratcheted ceiling');
  addRupees(inv, -200);
  assert.equal(inv.rupees, 200);
  assert.equal(inv.rupeeCap, 255, 'then it rests on the party floor');
});

test('new game has no sword and 3 hearts', () => {
  const inv = createInventory();
  assert.equal(inv.sword, SWORD.NONE);
  assert.equal(inv.halfHearts, 6);
  assert.equal(inv.maxHalfHearts, 6);
  assert.deepEqual(heartDisplay(inv), { full: 3, half: 0, empty: 0 });
});

test('grantWoodenSword is idempotent', () => {
  const inv = createInventory();
  assert.equal(grantWoodenSword(inv), true);
  assert.equal(inv.sword, SWORD.WOOD);
  assert.equal(grantWoodenSword(inv), false);
});

test('harmLink applies invuln and can kill', () => {
  const inv = createInventory();
  const hit = harmLink(inv, 2);
  assert.equal(hit.applied, true);
  assert.equal(inv.halfHearts, 4);
  assert.equal(inv.invuln, 48);
  assert.equal(harmLink(inv, 2).applied, false); // invuln
  inv.invuln = 0;
  harmLink(inv, 2); // 4 → 2
  inv.invuln = 0;
  const last = harmLink(inv, 2); // 2 → 0
  assert.equal(last.died, true);
  assert.equal(inv.dead, true);
  assert.equal(harmLink(inv, 2).applied, false);
});

test('harmLink blue ring halves damage; red quarters (InvRing)', () => {
  const blue = createInventory();
  blue.ring = 1;
  blue.halfHearts = 16;
  harmLink(blue, 4);
  assert.equal(blue.halfHearts, 14); // floor(4/2)=2

  const red = createInventory();
  red.ring = 2;
  red.halfHearts = 16;
  harmLink(red, 8);
  assert.equal(red.halfHearts, 14); // floor(8/4)=2

  const floorOne = createInventory();
  floorOne.ring = 1;
  floorOne.halfHearts = 6;
  harmLink(floorOne, 1);
  assert.equal(floorOne.halfHearts, 5); // max(1, floor(1/2))
});

test('healLink clamps to max', () => {
  const inv = createInventory();
  inv.halfHearts = 1;
  healLink(inv, 99);
  assert.equal(inv.halfHearts, 6);
});

test('addBombs selects B slot and clamps', () => {
  const inv = createInventory();
  assert.equal(addBombs(inv, 4), 4);
  assert.equal(inv.selectedB, B_ITEM.BOMB);
  addBombs(inv, 99);
  assert.equal(inv.bombs, 8);
});

test('cycleBItem walks owned items in NES grid order', () => {
  const inv = createInventory();
  addBombs(inv, 1);
  inv.boomerang = 1;
  inv.candle = 1;
  inv.selectedB = B_ITEM.BOOMERANG;
  assert.equal(cycleBItem(inv), B_ITEM.BOMB);
  assert.equal(cycleBItem(inv), B_ITEM.CANDLE);
  assert.equal(cycleBItem(inv), B_ITEM.BOOMERANG);
  assert.equal(cycleBItem(inv, -1), B_ITEM.CANDLE);
  assert.equal(cycleBItem(inv, -1), B_ITEM.BOMB);
});

test('cycleBItem offers potion slot for held letter (CheckMissingItem)', () => {
  const inv = createInventory();
  inv.letter = 1;
  inv.potion = 0;
  inv.selectedB = B_ITEM.NONE;
  assert.equal(cycleBItem(inv), B_ITEM.POTION);
});

test('triforce piece sets level bit', () => {
  const inv = createInventory();
  assert.equal(grantRoomItem(inv, 0x1b, { level: 1 }), 'Triforce (L1)');
  assert.equal(hasTriforce(inv, 1), true);
  assert.equal(triforceCount(inv), 1);
  grantRoomItem(inv, 0x1b, { level: 3 });
  assert.equal(triforceCount(inv), 2);
  assert.equal(hasTriforce(inv, 3), true);
});

test('Level 2 triforce without Level 1 still counts as one shard', () => {
  const inv = createInventory();
  assert.equal(grantRoomItem(inv, 0x1b, { level: 2 }), 'Triforce (L2)');
  assert.equal(hasTriforce(inv, 1), false);
  assert.equal(hasTriforce(inv, 2), true);
  assert.equal(triforceCount(inv), 1);
});

test('grantCaveExtras includes blue candle', () => {
  const inv = createInventory();
  grantCaveExtras(inv);
  assert.equal(inv.candle, CANDLE_TIER.BLUE);
  assert.equal(inv.boomerang, 1);
});

test('grantRoomItem covers ROM dungeon floor ids', () => {
  const inv = createInventory();
  assert.equal(grantRoomItem(inv, 0x00), 'Bombs');
  assert.ok(inv.bombs >= 4);
  assert.equal(grantRoomItem(inv, 0x07), 'Red candle');
  assert.equal(inv.candle, CANDLE_TIER.RED);
  assert.equal(grantRoomItem(inv, 0x0b), 'Magic key');
  assert.equal(inv.magicKey, 1);
  assert.equal(grantRoomItem(inv, 0x0f), '5 rupees');
  assert.equal(inv.rupees, 5);
  assert.equal(grantRoomItem(inv, 0x13), 'Red ring');
  assert.equal(inv.ring, 2);
  assert.equal(grantRoomItem(inv, 0x0e), 'Triforce of Power');
  assert.equal(inv.triforceOfPower, 1);
});

test('trySpendArrowShot costs 1 rupee (NES WieldArrow)', () => {
  const inv = createInventory();
  assert.deepEqual(trySpendArrowShot(inv), { ok: false, reason: 'gear' });
  inv.bow = 1;
  inv.arrow = 1;
  assert.deepEqual(trySpendArrowShot(inv), { ok: false, reason: 'rupees' });
  inv.rupees = 3;
  assert.deepEqual(trySpendArrowShot(inv), { ok: true });
  assert.equal(inv.rupees, 2);
  assert.deepEqual(trySpendArrowShot(inv), { ok: true });
  assert.equal(inv.rupees, 1);
  inv.rupees = 300;
  inv.rupeeCap = 300;
  inv.rupeeCapFloor = 255;
  assert.deepEqual(trySpendArrowShot(inv), { ok: true });
  assert.equal(inv.rupees, 299);
  assert.equal(inv.rupeeCap, 299, 'an arrow shot walks a ratcheted ceiling down');
});

test('bow pickup does not soft-grant arrows; shop arrows unlock B-slot', () => {
  const inv = createInventory();
  assert.equal(grantRoomItem(inv, 0x0a), 'Bow');
  assert.equal(inv.bow, 1);
  assert.equal(inv.arrow, ARROW.NONE);
  assert.equal(inv.selectedB, B_ITEM.NONE);
  assert.deepEqual(trySpendArrowShot(inv), { ok: false, reason: 'gear' });
  inv.bombs = 1;
  cycleBItem(inv);
  assert.notEqual(inv.selectedB, B_ITEM.BOW);

  assert.equal(grantRoomItem(inv, 0x08), 'Arrows');
  assert.equal(inv.arrow, ARROW.WOOD);
  // Already holding bombs — do not steal B; bow becomes cycleable.
  assert.equal(inv.selectedB, B_ITEM.BOMB);
  cycleBItem(inv);
  assert.equal(inv.selectedB, B_ITEM.BOW);
  inv.rupees = 1;
  assert.deepEqual(trySpendArrowShot(inv), { ok: true });
});

// Cave TakeItem arms itemLiftTimer ($80); if stepLinkStatus is never called
// (e.g. cave mode skipping stepCombat), Link stays frozen forever.
test('stepLinkStatus counts down itemLiftTimer', () => {
  const inv = createInventory();
  inv.itemLiftTimer = 0x80;
  stepLinkStatus(inv);
  assert.equal(inv.itemLiftTimer, 0x7f);
  for (let i = 0; i < 0x7f; i += 1) stepLinkStatus(inv);
  assert.equal(inv.itemLiftTimer, 0);
  stepLinkStatus(inv);
  assert.equal(inv.itemLiftTimer, 0);
});

test('flashing bubble blocks the sword with a timer, not the sticky flag', () => {
  const inv = createInventory();
  inv.sword = 1;
  applyBubbleSwordBlock(inv, 0x2b);
  assert.equal(inv.swordBlocked, 0);
  assert.equal(inv.swordBlockedTimer, FLASH_BUBBLE_BLOCK_FRAMES);
  assert.equal(canSwingSword(inv), false);
  for (let i = 0; i < FLASH_BUBBLE_BLOCK_FRAMES - 1; i += 1) stepLinkStatus(inv);
  assert.equal(canSwingSword(inv), false);
  stepLinkStatus(inv);
  assert.equal(inv.swordBlockedTimer, 0);
  assert.equal(canSwingSword(inv), true);
});

test('red bubble stays sticky after a flashing countdown expires', () => {
  const inv = createInventory();
  inv.sword = 1;
  applyBubbleSwordBlock(inv, 0x2d);
  applyBubbleSwordBlock(inv, 0x2b);
  assert.equal(inv.swordBlocked, 1);
  assert.ok(inv.swordBlockedTimer > 0);
  for (let i = 0; i < FLASH_BUBBLE_BLOCK_FRAMES; i += 1) stepLinkStatus(inv);
  assert.equal(inv.swordBlockedTimer, 0);
  assert.equal(inv.swordBlocked, 1, 'sticky red-bubble flag survives the flash timer');
  assert.equal(canSwingSword(inv), false);
  applyBubbleSwordBlock(inv, 0x2c);
  assert.equal(canSwingSword(inv), true);
});

test('a runaway sword-block timer is clamped so it cannot stick', () => {
  const inv = createInventory();
  inv.sword = 1;
  inv.swordBlockedTimer = 0xffff;
  stepLinkStatus(inv);
  assert.equal(inv.swordBlockedTimer, FLASH_BUBBLE_BLOCK_FRAMES - 1);
  inv.swordBlockedTimer = -3;
  stepLinkStatus(inv);
  assert.equal(inv.swordBlockedTimer, 0);
  assert.equal(canSwingSword(inv), true);
});

test('a like-like steal takes the shared shield, not the ally\'s legs', () => {
  const shared = createInventory();
  const p1 = createInventoryView(shared);
  const p2 = createInventoryView(shared);
  p1.magicShield = 1;
  p1.paralyzed = 0;
  p2.paralyzed = 0;
  stealMagicShield(p2);
  p2.paralyzed = 2;
  assert.equal(p1.magicShield, 0, 'the bag is shared, so the shield is gone for everyone');
  assert.equal(p1.paralyzed, 0, 'player one should still be able to walk');
  assert.equal(p2.paralyzed, 2);
});
