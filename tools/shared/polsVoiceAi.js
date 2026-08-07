/**
 * Pols Voice AI — Z_04.asm `UpdatePolsVoice`,
 * `UpdatePolsVoiceState1_Jumping` and `PolsVoice_MoveX`.
 *
 * Pols Voice is not a common wanderer. It alternates between a straight walk
 * of a randomly chosen distance and a ballistic hop, and it only updates on
 * even screen frames — so it covers ground at half the usual rate.
 *
 * NES `FrameCounter` parity is modelled with `e.anim`, the per-object frame
 * counter that `stepEnemy` advances once per frame.
 */

import { DIR } from './collision.js';

export const POLS_VOICE = 0x16;

export const POLS_STATE = Object.freeze({
  WALKING: 0,
  JUMPING: 1,
});

/** `PolsVoiceWalkSpeedsX` indexed by `ObjDir - 1`. */
export const POLS_WALK_SPEEDS_X = Object.freeze([1, -1, 0, 0, 1, -1, 0, 0, 1, -1]);

/** `PolsVoiceWalkSpeedsY`. */
export const POLS_WALK_SPEEDS_Y = Object.freeze([0, 0, 0, 1, 1, 1, 0, -1, -1, -1]);

/** `PolsVoiceInitialJumpSpeeds` — signed whole-pixel launch speed. */
export const POLS_JUMP_SPEEDS = Object.freeze([-3, -3, -1, -1, -1, -1, -1, -4]);

/** `PolsVoiceDestinationYOffsets` — signed landing offset from the launch Y. */
export const POLS_JUMP_Y_OFFSETS = Object.freeze([
  0x00, 0x00, 0x20, 0x20, 0x20, 0x20, 0x20, -0x20,
]);

/** `PolsVoiceDirections` — `Random & 3` → facing after landing. */
export const POLS_DIRS = Object.freeze([DIR.RIGHT, DIR.LEFT, DIR.DOWN, DIR.UP]);

/** Gravity added to the 16-bit vertical speed every moving frame. */
export const POLS_JUMP_ACCEL = 0x38;

/**
 * @typedef {object} PolsVoiceOpts
 * @property {(x: number, y: number) => { tile: number, walkable: boolean }} [probeTile]
 * @property {() => number} [rngByte]
 */

/**
 * Reset the hop-machine fields (called from `createEnemy`).
 * Distance 0 in state 0 makes the first update launch a hop, which is how the
 * ROM's freshly-cleared object variables behave.
 * @param {object} e
 */
export function initPolsVoice(e) {
  e.polsState = POLS_STATE.WALKING;
  e.polsRemDistance = 0;
  e.polsSpeedWhole = 0;
  e.polsSpeedFrac = 0;
  e.polsTargetY = 0;
}

/** `PolsVoice_MoveX` — one horizontal step for the current facing. */
export function polsVoiceMoveX(e) {
  const index = (e.dir & 0x0f) - 1;
  e.x = (e.x + (POLS_WALK_SPEEDS_X[index] ?? 0)) & 0xff;
}

/** Tile is a block ($B0–$B3) or water / screen-edge brick (≥ $F4). */
function tileForcesJump(tile) {
  const masked = tile & 0xfc;
  return masked === 0xb0 || masked >= 0xf4;
}

/**
 * `PolsVoice_IsSquareWalkable` — the object's own square plus the ($E, $6)
 * corner, so a hop is only allowed once both hotspots clear the obstacle.
 * @param {object} e
 * @param {PolsVoiceOpts} opts
 * @returns {{ tile: number, walkable: boolean }}
 */
function probeSquare(e, opts) {
  if (!opts.probeTile) return { tile: 0, walkable: true };
  const near = opts.probeTile(e.x, e.y);
  if (!near.walkable) return near;
  return opts.probeTile((e.x + 0x0e) & 0xff, (e.y + 0x06) & 0xff);
}

/**
 * `@SetState1` — launch a hop. The launch table index is the facing, overridden
 * to "down" near the top of the room and "up" near the bottom.
 * @param {object} e
 */
export function polsVoiceBeginJump(e) {
  if ((e.polsState ?? POLS_STATE.WALKING) !== POLS_STATE.WALKING) return;
  e.polsState = POLS_STATE.JUMPING;

  let index = (e.dir & 0x0f) - 1;
  if (e.y < 0x78) index = 3;
  if (e.y >= 0xa8) index = 7;

  e.polsSpeedWhole = POLS_JUMP_SPEEDS[index] ?? -1;
  e.polsTargetY = (e.y + (POLS_JUMP_Y_OFFSETS[index] ?? 0)) & 0xff;
  e.dir = index + 1;
}

/**
 * `UpdatePolsVoiceState1_Jumping` — accelerate downward, land when the target Y
 * is reached while falling.
 * @param {object} e
 * @param {PolsVoiceOpts} [opts]
 * @returns {boolean} true when the hop ended this frame
 */
export function stepPolsVoiceJump(e, opts = {}) {
  const frac = (e.polsSpeedFrac ?? 0) + POLS_JUMP_ACCEL;
  e.polsSpeedFrac = frac & 0xff;
  let whole = (e.polsSpeedWhole ?? 0) + (frac > 0xff ? 1 : 0);
  e.polsSpeedWhole = whole;
  e.y = (e.y + whole) & 0xff;

  if (whole < 0) return false;
  if (e.y < (e.polsTargetY ?? 0)) return false;

  e.polsState = POLS_STATE.WALKING;
  e.polsSpeedFrac = 0;
  e.polsSpeedWhole = 0;

  const rngByte = opts.rngByte ?? (() => (e.anim + e.id * 17) & 0xff);
  e.dir = POLS_DIRS[rngByte() & 0x03];
  // `AND #$40; ADC #$30` runs with carry set by the landing compare, so the
  // walk distance is $31 or $71 rather than $30 / $70.
  e.polsRemDistance = ((rngByte() & 0x40) + 0x30 + 1) & 0xff;

  e.x = (e.x + 8) & 0xf0;
  e.y = (((e.y + 8) & 0xf0) - 3) & 0xff;
  return true;
}

/**
 * One frame of `UpdatePolsVoice`.
 * @param {object} e
 * @param {PolsVoiceOpts} [opts]
 */
export function stepPolsVoice(e, opts = {}) {
  // Odd screen frames only draw and check collisions.
  if (((e.anim ?? 0) & 1) !== 0) return;

  polsVoiceMoveX(e);

  if ((e.polsState ?? POLS_STATE.WALKING) !== POLS_STATE.WALKING) {
    stepPolsVoiceJump(e, opts);
  } else if ((e.polsRemDistance ?? 0) === 0) {
    polsVoiceBeginJump(e);
    return;
  } else {
    e.polsRemDistance -= 1;
    const index = (e.dir & 0x0f) - 1;
    e.y = (e.y + (POLS_WALK_SPEEDS_Y[index] ?? 0)) & 0xff;
  }

  const probe = probeSquare(e, opts);
  if (probe.walkable) return;

  if (tileForcesJump(probe.tile)) {
    polsVoiceBeginJump(e);
    return;
  }

  // Blocked by something else: reverse and, when moving horizontally, shove
  // two pixels clear of the obstacle.
  if (e.dir & 0x03) {
    e.dir = (e.dir & 0x0f) ^ 0x03;
    polsVoiceMoveX(e);
    polsVoiceMoveX(e);
    return;
  }
  e.dir = (e.dir & 0x0f) ^ 0x0c;
}
