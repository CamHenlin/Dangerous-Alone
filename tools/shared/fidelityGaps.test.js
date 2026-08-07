import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOSS, bossNeedsArrow, isBossType, isDodongo, isGohma } from './bosses.js';
import { canSwingSword, createInventory } from './inventory.js';
import {
  PERSISTED_INV_KEYS,
  applyInventorySnapshot,
  snapshotInventory,
} from './save.js';
import { LADDER_ROOMS_OW, overworldTileOptsWithLadder } from './ladder.js';
import { tryBuyCaveSlot, tryDoorRepair } from './caves.js';
import { OW_WALKABLE_REMAP } from './collision.js';

test('Like-Like paralysis does not block sword', () => {
  const inv = createInventory();
  inv.sword = 1;
  inv.paralyzed = 2;
  assert.equal(canSwingSword(inv), true);
});

test('bracelet is persisted in save inventory keys', () => {
  assert.ok(PERSISTED_INV_KEYS.includes('bracelet'));
  const inv = createInventory();
  inv.bracelet = 1;
  const snap = snapshotInventory(inv);
  assert.equal(snap.bracelet, 1);
  const again = createInventory();
  applyInventorySnapshot(again, snap);
  assert.equal(again.bracelet, 1);
});

test('boss type variants registered', () => {
  assert.equal(isDodongo(BOSS.DODONGO_1), true);
  assert.equal(isGohma(BOSS.GOHMA_RED), true);
  assert.equal(isBossType(BOSS.GLEEOK_3), true);
  assert.equal(isBossType(BOSS.PATRA_RED), true);
  assert.equal(bossNeedsArrow(BOSS.GOHMA_RED), true);
});

test('OW ladder rooms listed; water is not remapped room-wide', () => {
  assert.ok(LADDER_ROOMS_OW.includes(0x17));
  const off = overworldTileOptsWithLadder({ ladder: 0 }, 0x17);
  assert.equal(off.walkableRemap.length, OW_WALKABLE_REMAP.length);
  const on = overworldTileOptsWithLadder({ ladder: 1 }, 0x17);
  assert.equal(on.walkableRemap.length, OW_WALKABLE_REMAP.length);
});

test('take-any is one choice; door repair is one-shot', () => {
  const inv = createInventory();
  inv.rupees = 100;
  const cave = {
    caveId: 0x11,
    kind: 'take_any',
    slots: [
      { item: 0x22, price: 0 }, // heart
      { item: 0x00, price: 0 },
      { item: 0x18, price: 0 },
    ],
  };
  const taken = new Set();
  const roomId = 0x2f;
  const a = tryBuyCaveSlot(inv, cave, 0, { taken, roomId });
  assert.equal(a.ok, true);
  const b = tryBuyCaveSlot(inv, cave, 2, { taken, roomId });
  assert.equal(b.ok, false);

  const door = {
    caveId: 0x15,
    kind: 'door',
    slots: [{ item: 0, price: 20 }, { item: 0, price: 0 }, { item: 0, price: 0 }],
  };
  const dTaken = new Set();
  assert.equal(tryDoorRepair(inv, door, { taken: dTaken, roomId: 0x01 }).ok, true);
  assert.equal(tryDoorRepair(inv, door, { taken: dTaken, roomId: 0x01 }).ok, false);
});
