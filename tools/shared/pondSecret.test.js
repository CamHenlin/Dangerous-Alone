import test from 'node:test';
import assert from 'node:assert/strict';

import { SECRET_STAIRS_TILES } from './owSecrets.js';
import {
  POND_CYCLE_COLORS,
  POND_CYCLE_END,
  POND_FIRST_UNWALKABLE,
  POND_STAIRS_COL,
  POND_STAIRS_ROW,
  createPondSecret,
  isPondSecretRevealed,
  pondCollisionFloor,
  pondFirstUnwalkable,
  pondSecretDone,
  pondSecretKey,
  pondSecretStarted,
  restorePondSecret,
  revealPondStairs,
  startPondSecret,
  stepPondSecret,
} from './pondSecret.js';

/** Drive `frames` frames from frame 0 and collect every step that fired. */
function drive(state, frames) {
  const steps = [];
  for (let f = 0; f < frames; f += 1) {
    const step = stepPondSecret(state, f & 0xff);
    if (step.stepped) steps.push(step);
  }
  return steps;
}

test('an idle screen never steps', () => {
  const state = createPondSecret();
  assert.equal(pondSecretStarted(state), false);
  assert.equal(drive(state, 200).length, 0);
});

test('InitFluteSecret seeds the cycle at 1', () => {
  const state = createPondSecret();
  assert.equal(startPondSecret(state), true);
  assert.equal(state.cycle, 1);
  assert.equal(pondSecretStarted(state), true);
});

test('a second recorder blast is ignored while draining', () => {
  const state = createPondSecret();
  startPondSecret(state);
  assert.equal(startPondSecret(state), false);
  assert.equal(state.cycle, 1);
});

test('steps once every eight frames on the FrameCounter&7==4 phase', () => {
  const state = createPondSecret();
  startPondSecret(state);
  for (let f = 0; f < 4; f += 1) {
    assert.equal(stepPondSecret(state, f).stepped, false);
  }
  assert.equal(stepPondSecret(state, 4).stepped, true);
  for (let f = 5; f < 12; f += 1) {
    assert.equal(stepPondSecret(state, f).stepped, false);
  }
  assert.equal(stepPondSecret(state, 12).stepped, true);
});

test('walks the palette colours from index 1 upward', () => {
  const state = createPondSecret();
  startPondSecret(state);
  const steps = drive(state, 8 * 12);
  const colors = steps.map((s) => s.color).filter((c) => c != null);
  assert.deepEqual(colors, POND_CYCLE_COLORS.slice(1, 11));
});

test('opens the water at step $A and reveals the stairs at step $B', () => {
  const state = createPondSecret();
  startPondSecret(state);
  assert.equal(pondFirstUnwalkable(state), null);

  const steps = drive(state, 8 * 12);
  assert.equal(steps.length, 11);
  assert.equal(steps[9].openedWater, true);
  assert.equal(steps[10].revealStairs, true);
  assert.equal(steps[10].color, null);
  assert.equal(pondFirstUnwalkable(state), POND_FIRST_UNWALKABLE);
});

test('the cycle stops at $C and stays put', () => {
  const state = createPondSecret();
  startPondSecret(state);
  drive(state, 8 * 12);
  assert.equal(state.cycle, POND_CYCLE_END);
  assert.equal(pondSecretDone(state), true);
  assert.equal(drive(state, 200).length, 0);
});

test('the drain takes 88 frames end to end', () => {
  const state = createPondSecret();
  startPondSecret(state);
  let revealFrame = -1;
  for (let f = 0; f < 400 && revealFrame < 0; f += 1) {
    if (stepPondSecret(state, f & 0xff).revealStairs) revealFrame = f;
  }
  assert.equal(revealFrame, 4 + 10 * 8);
});

test('RevealPondStairs paints $70–$73 at the hardcoded square', () => {
  assert.equal(POND_STAIRS_COL, 6);
  assert.equal(POND_STAIRS_ROW, 5);
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0x95));
  assert.equal(revealPondStairs(tileGrid), true);
  assert.equal(tileGrid[10][12], SECRET_STAIRS_TILES[0]);
  assert.equal(tileGrid[11][12], SECRET_STAIRS_TILES[1]);
  assert.equal(tileGrid[10][13], SECRET_STAIRS_TILES[2]);
  assert.equal(tileGrid[11][13], SECRET_STAIRS_TILES[3]);
});

test('pond reveal key restores walkability without a layout secret marker', () => {
  const key = pondSecretKey(0x42);
  assert.equal(key, '66:5:6');
  const revealed = new Set([key]);
  assert.equal(isPondSecretRevealed(revealed, 0x42), true);
  assert.equal(isPondSecretRevealed(new Set(), 0x42), false);
  const state = restorePondSecret(revealed, 0x42);
  assert.equal(state.walkable, true);
  assert.equal(pondSecretDone(state), true);
  assert.equal(startPondSecret(state), false);
});

test('pondCollisionFloor stays open from the reveal flag even if state was reset', () => {
  const idle = createPondSecret();
  assert.equal(pondCollisionFloor(idle, new Set(), 0x42), null);
  assert.equal(
    pondCollisionFloor(idle, new Set([pondSecretKey(0x42)]), 0x42),
    POND_FIRST_UNWALKABLE,
  );
  idle.walkable = true;
  assert.equal(pondCollisionFloor(idle, new Set(), 0x42), POND_FIRST_UNWALKABLE);
});
