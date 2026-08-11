import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyOneHitKill,
  createDebugCheats,
  killLink,
  MAX_RUPEES,
  refillBombs,
  refillHearts,
  refillRupees,
  shouldKillOnScreen,
} from './debugCheats.js';
import { B_ITEM, createInventory } from './inventory.js';

test('createDebugCheats defaults all off', () => {
  assert.deepEqual(createDebugCheats(), {
    invincible: false,
    oneHitKills: false,
    insaneDrops: false,
  });
});

test('refillHearts restores max and clears dead', () => {
  const inv = createInventory();
  inv.halfHearts = 1;
  inv.maxHalfHearts = 16;
  inv.dead = true;
  refillHearts(inv);
  assert.equal(inv.halfHearts, 16);
  assert.equal(inv.dead, false);
});

test('refillBombs restores max and selects bomb when B empty', () => {
  const inv = createInventory();
  inv.bombs = 0;
  inv.maxBombs = 16;
  inv.selectedB = B_ITEM.NONE;
  refillBombs(inv);
  assert.equal(inv.bombs, 16);
  assert.equal(inv.selectedB, B_ITEM.BOMB);
});

test('refillBombs leaves selected B-item alone when already set', () => {
  const inv = createInventory();
  inv.bombs = 2;
  inv.maxBombs = 8;
  inv.selectedB = B_ITEM.CANDLE;
  refillBombs(inv);
  assert.equal(inv.bombs, 8);
  assert.equal(inv.selectedB, B_ITEM.CANDLE);
});

test('refillRupees fills to NES max', () => {
  const inv = createInventory();
  inv.rupees = 3;
  refillRupees(inv);
  assert.equal(inv.rupees, MAX_RUPEES);
});

test('killLink zeros hearts and marks dead', () => {
  const inv = createInventory();
  inv.halfHearts = 6;
  inv.invuln = 40;
  assert.equal(killLink(inv), true);
  assert.equal(inv.halfHearts, 0);
  assert.equal(inv.dead, true);
  assert.equal(killLink(inv), false);
});

test('applyOneHitKill only forces on successful hits', () => {
  const e = { alive: true, hp: 0x40 };
  assert.equal(applyOneHitKill(e, false), false);
  assert.equal(e.alive, true);
  assert.equal(applyOneHitKill(e, 'parry'), false);
  assert.equal(e.alive, true);
  assert.equal(applyOneHitKill(e, true), true);
  assert.equal(e.alive, false);
  assert.equal(e.hp, 0);
});

test('shouldKillOnScreen skips NPCs, off-camera, and bubbles', () => {
  const foe = { alive: true, objType: 0x07 };
  assert.equal(shouldKillOnScreen(foe, () => false), true);
  assert.equal(shouldKillOnScreen(foe, () => true), false);
  assert.equal(shouldKillOnScreen({ alive: true, npc: true, objType: 0x4b }, () => false), false);
  assert.equal(shouldKillOnScreen({ alive: true, objType: 0x2b }, () => false), false);
});
