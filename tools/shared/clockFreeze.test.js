import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearClockFreeze,
  clockFreezeActive,
  enemyIsClockFrozen,
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
