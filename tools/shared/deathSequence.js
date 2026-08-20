/**
 * Game mode `$11` — the death sequence (`UpdateMode11Death_Full` @ `Z_05.asm:2523`).
 *
 * A pure frame-stepped state machine over the ROM's submode chain. Submodes
 * 0–6 only shuffle nametables and palette rows, so they collapse into the
 * setup that `InitMode11Death` (`Z_05.asm:2078`) performs; everything that is
 * observable to the player is modelled here:
 *
 *   SPIN   sub 7  Link turns every 5 frames; 4 laps of down→right→up→left
 *   FADE   sub 8  `AnimateWorldFading` — 4 palette steps, 10 frames each
 *   GREY   sub 9  Link's grey palette, then a 24-frame beat
 *   SPARK  sub A  a 15-frame spark, small tile until the last 6 frames
 *   HOLD   sub B  46 frames of empty screen
 *   OVER   sub B  "GAME OVER" for 96 frames
 *   DONE   sub C  hand off to the continue question (mode `$08`)
 */

import { DIR } from './collision.js';

export const DEATH_PHASE = Object.freeze({
  SPIN: 'spin',
  FADE: 'fade',
  GREY: 'grey',
  SPARK: 'spark',
  HOLD: 'hold',
  OVER: 'over',
  DONE: 'done',
});

/** `ObjTimer+11 = $05` between turns. */
export const SPIN_TURN_FRAMES = 5;
/** `DeathModeCounter = $04` — four laps before the fade. */
export const SPIN_LAPS = 4;
/** `AnimateWorldFading`: `FadeCycle` runs 4 steps, `ObjTimer+12 = $0A` apart. */
export const FADE_STEPS = 4;
export const FADE_STEP_FRAMES = 10;
/** Submode 9 arms `ObjTimer+11 = $18`. */
export const GREY_FRAMES = 0x18;
/** Submode A's `DeathModeCounter = $0F`, one tick per frame. */
export const SPARK_FRAMES = 0x0f;
/** The spark swaps to the big tile ($64) for its last 5 ticks. */
export const SPARK_BIG_AT = 6;
/** Submode A arms `ObjTimer+11 = $2E` before "GAME OVER". */
export const HOLD_FRAMES = 0x2e;
/** Submode B arms `ObjTimer+11 = $60` while "GAME OVER" shows. */
export const OVER_FRAMES = 0x60;

/**
 * `Sub7` rotates by shifting `ObjDir` right twice; the resulting order is
 * down → right → up → left, and reaching left completes a lap.
 */
const SPIN_ORDER = Object.freeze([DIR.DOWN, DIR.RIGHT, DIR.UP, DIR.LEFT]);

/**
 * @typedef {object} DeathState
 * @property {string} phase
 * @property {number} timer frames left in the current phase
 * @property {number} spinIndex position in `SPIN_ORDER`
 * @property {number} lapsLeft `DeathModeCounter` during the spin
 * @property {number} fadeStep 0–4; 4 means fully faded
 * @property {number} sparkTicks `DeathModeCounter` during the spark
 * @property {boolean} started the dying tune has been requested
 */

/** `InitMode11Death`: `ObjDir = $04` (down), `DeathModeCounter = $04`. */
export function createDeathSequence() {
  return {
    phase: DEATH_PHASE.SPIN,
    timer: 0,
    spinIndex: 0,
    lapsLeft: SPIN_LAPS,
    fadeStep: 0,
    sparkTicks: 0,
    started: false,
  };
}

export function deathSequenceActive(state) {
  return state.phase !== DEATH_PHASE.DONE;
}

/** Co-op spin is over — regroup, skip the fade / GAME OVER the living did not earn. */
export function coopDeathSpinDone(state) {
  return !state || state.phase !== DEATH_PHASE.SPIN;
}

/** Direction Link faces this frame. */
export function deathLinkDir(state) {
  return SPIN_ORDER[state.spinIndex % SPIN_ORDER.length];
}

/**
 * What the renderer should draw this frame.
 * @param {DeathState} state
 */
export function deathRenderState(state) {
  const p = state.phase;
  return {
    /** Link is on screen (spinning, then grey) until the spark replaces him. */
    linkVisible: p === DEATH_PHASE.SPIN || p === DEATH_PHASE.FADE || p === DEATH_PHASE.GREY,
    linkDir: deathLinkDir(state),
    linkGrey: p === DEATH_PHASE.GREY,
    /** 0 = normal world palette, 4 = fully drained. */
    fadeStep: p === DEATH_PHASE.SPIN ? 0 : Math.min(state.fadeStep, FADE_STEPS),
    sparkVisible: p === DEATH_PHASE.SPARK,
    /** `$62` small / `$64` big. */
    sparkTile: state.sparkTicks >= SPARK_BIG_AT ? 0x62 : 0x64,
    gameOverVisible: p === DEATH_PHASE.OVER,
  };
}

/**
 * @typedef {object} DeathStep
 * @property {boolean} playDyingTune Tune1 `$80` at the top of the sequence
 * @property {boolean} playHeartTune Tune0 `$10` as the spark winks out
 * @property {boolean} finished mode `$08` takes over this frame
 */

const NO_EVENTS = Object.freeze({
  playDyingTune: false,
  playHeartTune: false,
  finished: false,
});

/**
 * Advance one frame.
 * @param {DeathState} state mutated
 * @returns {DeathStep}
 */
export function stepDeathSequence(state) {
  if (!state.started) {
    // Sub1 requests Tune1 $80 before any of the drawing submodes run.
    state.started = true;
    return { ...NO_EVENTS, playDyingTune: true };
  }
  switch (state.phase) {
    case DEATH_PHASE.SPIN:
      return stepSpin(state);
    case DEATH_PHASE.FADE:
      return stepFade(state);
    case DEATH_PHASE.GREY:
      return advanceAfter(state, DEATH_PHASE.SPARK, () => {
        state.sparkTicks = SPARK_FRAMES;
      });
    case DEATH_PHASE.SPARK:
      return stepSpark(state);
    case DEATH_PHASE.HOLD:
      return advanceAfter(state, DEATH_PHASE.OVER, () => {
        state.timer = OVER_FRAMES;
      });
    case DEATH_PHASE.OVER:
      return advanceAfter(state, DEATH_PHASE.DONE, null, true);
    default:
      return NO_EVENTS;
  }
}

/**
 * Burn one frame off `state.timer`. Mirrors the ROM, where a separate routine
 * decrements `ObjTimer` each frame and the submode acts on the frame it reads
 * zero — so arming a timer with N yields a period of exactly N frames.
 * @returns {boolean} true when the timer has expired
 */
function tick(state) {
  if (state.timer > 0) state.timer -= 1;
  return state.timer === 0;
}

/** Sub7: turn every 5 frames; each pass through LEFT burns one lap. */
function stepSpin(state) {
  if (!tick(state)) return NO_EVENTS;
  if (deathLinkDir(state) === DIR.LEFT) {
    state.lapsLeft -= 1;
  }
  if (state.lapsLeft <= 0) {
    state.phase = DEATH_PHASE.FADE;
    state.timer = FADE_STEP_FRAMES;
    return NO_EVENTS;
  }
  state.spinIndex = (state.spinIndex + 1) % SPIN_ORDER.length;
  state.timer = SPIN_TURN_FRAMES;
  return NO_EVENTS;
}

/** Sub8: four palette steps, ten frames apart. */
function stepFade(state) {
  if (!tick(state)) return NO_EVENTS;
  state.fadeStep += 1;
  if (state.fadeStep >= FADE_STEPS) {
    state.phase = DEATH_PHASE.GREY;
    state.timer = GREY_FRAMES;
    return NO_EVENTS;
  }
  state.timer = FADE_STEP_FRAMES;
  return NO_EVENTS;
}

/** SubA: count the spark down, then chirp and hold. */
function stepSpark(state) {
  state.sparkTicks -= 1;
  if (state.sparkTicks > 0) return NO_EVENTS;
  state.phase = DEATH_PHASE.HOLD;
  state.timer = HOLD_FRAMES;
  return { ...NO_EVENTS, playHeartTune: true };
}

/**
 * Burn `state.timer` frames, then move to `next`.
 * @param {DeathState} state
 * @param {string} next
 * @param {(() => void) | null} onEnter
 * @param {boolean} [finished]
 */
function advanceAfter(state, next, onEnter, finished = false) {
  if (!tick(state)) return NO_EVENTS;
  state.phase = next;
  state.timer = 0;
  onEnter?.();
  return finished ? { ...NO_EVENTS, finished: true } : NO_EVENTS;
}
