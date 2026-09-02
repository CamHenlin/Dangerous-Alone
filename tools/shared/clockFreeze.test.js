import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearClockFreeze,
  clockCoversOccupancy,
  clockFreezeActive,
  enemyIsClockFrozen,
  shouldClearClock,
  tagVisibleEnemiesForClock,
} from './clockFreeze.js';

test('tagVisibleEnemiesForClock only marks living visible foes', () => {
  const foes = [
    { alive: true, id: 1 },
    { alive: true, id: 2 },
    { alive: false, id: 3 },
  ];
  tagVisibleEnemiesForClock(foes, (e) => e.id === 1);
  assert.equal(foes[0].clockFrozen, true);
  assert.equal(foes[1].clockFrozen, undefined);
  assert.equal(foes[2].clockFrozen, undefined);
});

test('a clock picked up in one world is not expired by another', () => {
  const foes = [{ alive: true, clockFrozen: true }];
  assert.equal(shouldClearClock('overworld', 'overworld', foes), false);
  assert.equal(shouldClearClock('overworld', 'cellar:1:127', foes), false);
  assert.equal(shouldClearClock('overworld', 'overworld', []), true);
  assert.equal(shouldClearClock(null, 'overworld', []), false);
});

test('clock covers only the occupying screen it was taken on', () => {
  assert.equal(clockCoversOccupancy('overworld', 0x78, 'overworld', 0x78), true);
  assert.equal(clockCoversOccupancy('overworld', 0x78, 'overworld', 0x79), false);
  assert.equal(clockCoversOccupancy('overworld', 0x78, 'cellar:1:127', 0x78), false);
  assert.equal(clockCoversOccupancy('overworld', 0x78, 'overworld', null), false);
});

test('leaving the pickup screen expires the clock even if tagged foes live', () => {
  const foes = [{ alive: true, clockFrozen: true }];
  assert.equal(shouldClearClock('overworld', 'overworld', foes, 0x78, [0x78]), false);
  assert.equal(shouldClearClock('overworld', 'overworld', foes, 0x78, [0x77, 0x78]), false);
  assert.equal(shouldClearClock('overworld', 'overworld', foes, 0x78, [0x77, 0x79]), true);
  assert.equal(shouldClearClock('overworld', 'cellar:1:127', foes, 0x78, [0x79]), false);
});

test('clock ends when tagged foes die; clearClockFreeze wipes tags', () => {
  const inv = { clock: 1 };
  const foes = [
    { alive: true, clockFrozen: true },
    { alive: true, clockFrozen: false },
  ];
  assert.equal(clockFreezeActive(foes), true);
  foes[0].alive = false;
  assert.equal(clockFreezeActive(foes), false);
  clearClockFreeze(inv, foes);
  assert.equal(inv.clock, 0);
  assert.equal(foes[0].clockFrozen, false);
  assert.equal(enemyIsClockFrozen(foes[1]), false);
});
