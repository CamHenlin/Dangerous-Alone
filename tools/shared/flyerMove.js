/**
 * NES flyer movement (Z_04 MoveFlyer / Flyer_SpeedUp / Flyer_SlowDown).
 *
 * Flyer_ObjSpeed is a rising/falling byte; only (speed & $E0) is added to
 * Flyer_ObjSpeedFrac each frame. On overflow, the object moves 1px along
 * each set direction bit (8-way capable).
 */

import { DIR } from './collision.js';

/** Directions8 table (Z_04.asm). */
export const DIRECTIONS8 = Object.freeze([
  0x08, 0x09, 0x01, 0x05, 0x04, 0x06, 0x02, 0x0a,
]);

export const FLYER_STATE = Object.freeze({
  SPEED_UP: 0,
  DECIDE: 1,
  CHASE: 2,
  WANDER: 3,
  SLOW_DOWN: 4,
  DELAY: 5,
});

/** InitBlueKeese / InitRedOrBlackKeese. */
export const KEESE_FLYING_MAX_SPEED_FRAC = 0xc0;
export const BLUE_KEESE_INIT_SPEED = 0x1f;
export const RED_BLACK_KEESE_INIT_SPEED = 0x7f;

/** SetUpFairyObject: Flyer_ObjSpeed $7F, FlyingMaxSpeedFrac $A0. */
export const FAIRY_INIT_SPEED = 0x7f;
export const FAIRY_FLYING_MAX_SPEED_FRAC = 0xa0;

/** EndInitFlyer (InitPeahat / flying ghini): Flyer_ObjSpeed $1F, max $A0. */
export const PEAHAT_INIT_SPEED = 0x1f;
export const PEAHAT_FLYING_MAX_SPEED_FRAC = 0xa0;

/**
 * Decide-state random gates (chase if ≥ chaseMin, wander if ≥ wanderMin, else slow).
 * Flyer_KeeseDecideState / Flyer_PeahatDecideState / Flyer_GhiniDecideState.
 */
export const FLYER_DECIDE = Object.freeze({
  KEESE: Object.freeze({ chaseMin: 0xa0, wanderMin: 0x20 }),
  PEAHAT: Object.freeze({ chaseMin: 0xb0, wanderMin: 0x20 }),
  GHINI: Object.freeze({ chaseMin: 0xa0, wanderMin: 0x08 }),
});

/**
 * @param {number} objType
 * @returns {number}
 */
export function keeseInitFlyerSpeed(objType) {
  // Blue $1B starts at $1F; red $1C / black $1D at $7F (faster ramp).
  return objType === 0x1b ? BLUE_KEESE_INIT_SPEED : RED_BLACK_KEESE_INIT_SPEED;
}

/**
 * EndInitFlyer vs InitBlueKeese max-speed byte.
 * @param {number} objType
 */
export function flyerInitMaxSpeed(objType) {
  if (objType === 0x1b || objType === 0x1c || objType === 0x1d) {
    return KEESE_FLYING_MAX_SPEED_FRAC;
  }
  return PEAHAT_FLYING_MAX_SPEED_FRAC;
}

/**
 * InitPeahat / EndInitFlyer $1F; keese keep their color-specific start.
 * @param {number} objType
 */
export function flyerInitSpeed(objType) {
  if (objType === 0x1b || objType === 0x1c || objType === 0x1d) {
    return keeseInitFlyerSpeed(objType);
  }
  return PEAHAT_INIT_SPEED;
}

/**
 * Flyer_*DecideState — next flying state from one random byte.
 * @param {number} randomByte
 * @param {number} [chaseMin]
 * @param {number} [wanderMin]
 */
export function flyerDecideState(
  randomByte,
  chaseMin = FLYER_DECIDE.KEESE.chaseMin,
  wanderMin = FLYER_DECIDE.KEESE.wanderMin,
) {
  const r = randomByte & 0xff;
  if (r >= chaseMin) return FLYER_STATE.CHASE;
  if (r >= wanderMin) return FLYER_STATE.WANDER;
  return FLYER_STATE.SLOW_DOWN;
}

/**
 * Flyer_*DecideState dispatch by object type.
 * @param {number} objType
 * @param {number} randomByte
 */
export function flyerDecideForType(objType, randomByte) {
  const gate =
    objType === 0x1a
      ? FLYER_DECIDE.PEAHAT
      : objType === 0x22
        ? FLYER_DECIDE.GHINI
        : FLYER_DECIDE.KEESE;
  return flyerDecideState(randomByte, gate.chaseMin, gate.wanderMin);
}

/**
 * Flyer_SlowDown / Flyer_SpeedUp rest timer: Random AND $3F OR $40 → $40–$7F.
 * @param {number} randomByte
 */
export function flyerDelayTimer(randomByte) {
  return (randomByte & 0x3f) | 0x40;
}

/**
 * Whole-speed nibble used by MoveFlyer: speed & $E0.
 * @param {number} flyerSpeed
 */
export function flyerWholeSpeed(flyerSpeed) {
  return flyerSpeed & 0xe0;
}

/**
 * Average px/frame for a Flyer_ObjSpeed value (documentation / tests).
 * @param {number} flyerSpeed
 */
export function flyerSpeedToPxPerFrame(flyerSpeed) {
  return flyerWholeSpeed(flyerSpeed) / 0x100;
}

/**
 * After INC/DEC in Flyer_SpeedUp / Flyer_SlowDown.
 * @param {number} flyerSpeed
 * @param {number} [flyingMaxSpeedFrac]
 * @returns {{ state: number, delayTimer?: number } | null} null = stay in current accel/decel state
 */
export function flyerSpeedThresholdTransition(
  flyerSpeed,
  flyingMaxSpeedFrac = KEESE_FLYING_MAX_SPEED_FRAC,
) {
  const whole = flyerWholeSpeed(flyerSpeed);
  if (whole === 0) {
    // Random timer $40–$7F is applied by the caller (needs a random byte).
    return { state: FLYER_STATE.DELAY };
  }
  if (whole >= flyingMaxSpeedFrac) {
    return { state: FLYER_STATE.DECIDE };
  }
  return null;
}

/**
 * MoveFlyer — fractional step; returns true if a whole pixel was applied.
 * @param {{ flyerSpeed?: number, flyerSpeedFrac?: number, dir: number, x: number, y: number, flyerDistTraveled?: number }} e
 */
export function moveFlyer(e) {
  const add = flyerWholeSpeed(e.flyerSpeed ?? 0);
  const sum = (e.flyerSpeedFrac ?? 0) + add;
  e.flyerSpeedFrac = sum & 0xff;
  if (sum < 0x100) return false;

  if (e.dir & DIR.RIGHT) e.x += 1;
  if (e.dir & DIR.LEFT) e.x -= 1;
  if (e.dir & DIR.DOWN) e.y += 1;
  if (e.dir & DIR.UP) e.y -= 1;
  e.flyerDistTraveled = ((e.flyerDistTraveled ?? 0) + 1) & 0xff;
  return true;
}

/**
 * Index into Directions8, or 0 if the facing is not an 8-way value.
 * @param {number} dir
 */
export function dir8Index(dir) {
  const i = DIRECTIONS8.indexOf(dir & 0x0f);
  return i < 0 ? 0 : i;
}

/**
 * ReverseObjDir8 — opposite 8-way heading (index + 4).
 * @param {number} dir
 */
export function reverseDir8(dir) {
  return DIRECTIONS8[(dir8Index(dir) + 4) & 7];
}

/**
 * Flyer_Wander TurnRandomlyDir8.
 * `randomByte >= $A0` keep heading; `>= $50` turn right; else turn left.
 * @param {number} dir
 * @param {number} randomByte
 */
export function turnRandomlyDir8(dir, randomByte) {
  let i = dir8Index(dir);
  const r = randomByte & 0xff;
  if (r < 0xa0) i = r >= 0x50 ? i + 1 : i - 1;
  return DIRECTIONS8[i & 7];
}

/**
 * TurnTowardsPlayer8 (Z_04 Flyer_Chase).
 *
 * Builds an 8-way toward the chase point, keeps the current heading if that
 * target is within one turn, otherwise picks a nearby heading that shares a
 * cardinal bit — or one turn right if none of the TestDir checks pass.
 *
 * @param {number} dir current 8-way facing
 * @param {number} x
 * @param {number} y
 * @param {number} chaseX
 * @param {number} chaseY
 */
export function turnTowardsPlayer8(dir, x, y, chaseX, chaseY) {
  let target = 0;
  if (chaseX !== x) target = chaseX > x ? DIR.RIGHT : DIR.LEFT;
  if (chaseY !== y) target |= chaseY > y ? DIR.DOWN : DIR.UP;

  const i = dir8Index(dir);
  // Three headings turning left: one-right, current, one-left. Exact match
  // leaves the current facing (the monster is already aimed close enough).
  let idx = i + 1;
  for (let n = 0; n < 3; n += 1) {
    idx &= 7;
    if (DIRECTIONS8[idx] === target) return dir;
    idx -= 1;
  }

  // Three headings turning right, starting one-left of current.
  idx = (idx + 1) & 7;
  for (let n = 0; n < 3; n += 1) {
    idx &= 7;
    const test = DIRECTIONS8[idx];
    if ((test & target) !== 0 && (test | target) < 7) return test;
    idx += 1;
  }

  // No accept: one turn right of the original facing.
  return DIRECTIONS8[(idx - 1) & 7];
}

/**
 * BoundFlyer after a whole-pixel MoveFlyer step: clamp to the room/screen
 * box and reverse 8-way facing so the flyer does not sit on the lip.
 *
 * @param {{ x: number, y: number, dir: number }} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number } | null | undefined} bounds
 * @returns {boolean} true if a bound was hit
 */
export function boundFlyer(e, bounds) {
  if (!bounds) return false;
  let hit = false;
  if (e.x < bounds.minX) {
    e.x = bounds.minX;
    hit = true;
  } else if (e.x > bounds.maxX) {
    e.x = bounds.maxX;
    hit = true;
  }
  if (e.y < bounds.minY) {
    e.y = bounds.minY;
    hit = true;
  } else if (e.y > bounds.maxY) {
    e.y = bounds.maxY;
    hit = true;
  }
  if (hit) e.dir = reverseDir8(e.dir);
  return hit;
}
