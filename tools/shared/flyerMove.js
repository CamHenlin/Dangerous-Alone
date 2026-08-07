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

/**
 * @param {number} objType
 * @returns {number}
 */
export function keeseInitFlyerSpeed(objType) {
  // Blue $1B starts at $1F; red $1C / black $1D at $7F (faster ramp).
  return objType === 0x1b ? BLUE_KEESE_INIT_SPEED : RED_BLACK_KEESE_INIT_SPEED;
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
