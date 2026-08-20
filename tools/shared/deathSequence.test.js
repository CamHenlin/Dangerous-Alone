import test from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from './collision.js';
import {
  DEATH_PHASE,
  FADE_STEPS,
  FADE_STEP_FRAMES,
  GREY_FRAMES,
  HOLD_FRAMES,
  OVER_FRAMES,
  SPARK_BIG_AT,
  SPARK_FRAMES,
  SPIN_LAPS,
  SPIN_TURN_FRAMES,
  createDeathSequence,
  coopDeathSpinDone,
  deathRenderState,
  deathSequenceActive,
  stepDeathSequence,
} from './deathSequence.js';

/** Run until `phase` is reached (or we give up), returning the frame count. */
function framesUntilPhase(state, phase, limit = 2000) {
  for (let f = 1; f <= limit; f += 1) {
    stepDeathSequence(state);
    if (state.phase === phase) return f;
  }
  return -1;
}

test('the dying tune fires once, on the first frame', () => {
  const state = createDeathSequence();
  assert.equal(stepDeathSequence(state).playDyingTune, true);
  for (let f = 0; f < 100; f += 1) {
    assert.equal(stepDeathSequence(state).playDyingTune, false);
  }
});

test('Link starts facing down and turns down/right/up/left', () => {
  const state = createDeathSequence();
  stepDeathSequence(state);
  const seen = [deathRenderState(state).linkDir];
  for (let f = 0; f < SPIN_TURN_FRAMES * 4; f += 1) {
    stepDeathSequence(state);
    const dir = deathRenderState(state).linkDir;
    if (dir !== seen[seen.length - 1]) seen.push(dir);
  }
  assert.deepEqual(seen.slice(0, 4), [DIR.DOWN, DIR.RIGHT, DIR.UP, DIR.LEFT]);
});

test('the spin runs four laps before the fade', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.FADE);
  assert.equal(state.lapsLeft, 0);
  assert.equal(SPIN_LAPS, 4);
});

test('the fade takes four steps ten frames apart', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.FADE);
  const before = state.fadeStep;
  assert.equal(before, 0);
  const toGrey = framesUntilPhase(state, DEATH_PHASE.GREY);
  assert.equal(toGrey, FADE_STEPS * FADE_STEP_FRAMES);
  assert.equal(deathRenderState(state).fadeStep, FADE_STEPS);
});

test('Link turns grey, then is replaced by the spark', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.GREY);
  const grey = deathRenderState(state);
  assert.equal(grey.linkVisible, true);
  assert.equal(grey.linkGrey, true);
  assert.equal(grey.sparkVisible, false);

  const toSpark = framesUntilPhase(state, DEATH_PHASE.SPARK);
  assert.equal(toSpark, GREY_FRAMES);
  const spark = deathRenderState(state);
  assert.equal(spark.linkVisible, false);
  assert.equal(spark.sparkVisible, true);
});

test('the spark grows for its last five ticks', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.SPARK);
  // Counter $F down to $6 draws the small tile; $5 down to $1 draws the big one.
  assert.equal(deathRenderState(state).sparkTile, 0x62);
  for (let f = 0; f < SPARK_FRAMES - SPARK_BIG_AT; f += 1) stepDeathSequence(state);
  assert.equal(state.sparkTicks, SPARK_BIG_AT);
  assert.equal(deathRenderState(state).sparkTile, 0x62);
  stepDeathSequence(state);
  assert.equal(deathRenderState(state).sparkTile, 0x64);
});

test('the heart tune plays as the spark winks out', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.SPARK);
  let tunes = 0;
  for (let f = 0; f < SPARK_FRAMES + 2; f += 1) {
    if (stepDeathSequence(state).playHeartTune) tunes += 1;
  }
  assert.equal(tunes, 1);
  assert.equal(state.phase, DEATH_PHASE.HOLD);
});

test('GAME OVER shows after the hold and lasts $60 frames', () => {
  const state = createDeathSequence();
  framesUntilPhase(state, DEATH_PHASE.HOLD);
  assert.equal(deathRenderState(state).gameOverVisible, false);

  const toOver = framesUntilPhase(state, DEATH_PHASE.OVER);
  assert.equal(toOver, HOLD_FRAMES);
  assert.equal(deathRenderState(state).gameOverVisible, true);

  const toDone = framesUntilPhase(state, DEATH_PHASE.DONE);
  assert.equal(toDone, OVER_FRAMES);
});

test('co-op regroups when the spin ends, not at GAME OVER', () => {
  const state = createDeathSequence();
  assert.equal(coopDeathSpinDone(state), false);
  framesUntilPhase(state, DEATH_PHASE.FADE);
  assert.equal(coopDeathSpinDone(state), true);
  assert.equal(state.phase, DEATH_PHASE.FADE);
});

test('the sequence reports finished exactly once, then goes inert', () => {
  const state = createDeathSequence();
  let finishes = 0;
  for (let f = 0; f < 1000; f += 1) {
    if (stepDeathSequence(state).finished) finishes += 1;
  }
  assert.equal(finishes, 1);
  assert.equal(deathSequenceActive(state), false);
});
