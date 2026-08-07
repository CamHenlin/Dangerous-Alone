import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUPEE_ROLL_PERIOD,
  createRupeeRoll,
  resetRupeeRoll,
  stepRupeeRoll,
} from './rupeeRoll.js';

/** Run `frames` steps and report how many units the counter moved. */
function run(roll, target, frames) {
  let tunes = 0;
  for (let i = 0; i < frames; i += 1) {
    if (stepRupeeRoll(roll, target).playTune) tunes += 1;
  }
  return tunes;
}

test('idle roll does nothing when the display matches the total', () => {
  const roll = createRupeeRoll(42);
  const result = stepRupeeRoll(roll, 42);
  assert.equal(result.changed, false);
  assert.equal(result.playTune, false);
  assert.equal(roll.shown, 42);
});

test('counts up one rupee every two frames', () => {
  const roll = createRupeeRoll(0);
  assert.equal(stepRupeeRoll(roll, 10).changed, false);
  assert.equal(roll.shown, 0);
  assert.equal(stepRupeeRoll(roll, 10).changed, true);
  assert.equal(roll.shown, 1);
});

test('counts down toward a smaller total at the same cadence', () => {
  const roll = createRupeeRoll(30);
  const tunes = run(roll, 20, 10 * RUPEE_ROLL_PERIOD);
  assert.equal(roll.shown, 20);
  assert.equal(tunes, 10);
});

test('plays the heart tune once per unit and stops at the target', () => {
  const roll = createRupeeRoll(0);
  const tunes = run(roll, 5, 100);
  assert.equal(roll.shown, 5);
  assert.equal(tunes, 5);
});

test('clamps the target to the 0..$FF status-bar range', () => {
  const high = createRupeeRoll(0xfe);
  run(high, 500, 20);
  assert.equal(high.shown, 0xff);

  const low = createRupeeRoll(2);
  run(low, -50, 20);
  assert.equal(low.shown, 0);
});

test('retargeting mid-roll reverses direction without a stall', () => {
  const roll = createRupeeRoll(0);
  run(roll, 100, 10);
  assert.equal(roll.shown, 5);
  run(roll, 0, 10);
  assert.equal(roll.shown, 0);
});

test('reset snaps the display and clears the phase', () => {
  const roll = createRupeeRoll(0);
  stepRupeeRoll(roll, 50);
  resetRupeeRoll(roll, 50);
  assert.equal(roll.shown, 50);
  assert.equal(roll.frame, 0);
  assert.equal(stepRupeeRoll(roll, 50).changed, false);
});
