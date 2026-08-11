/**
 * NES UpdateZol / UpdateGel / UpdateNormalZolOrGel (Z_04.asm).
 *
 * Room gels start in state 2 (InitGel). Zol-split children start in state 0,
 * shove at QSpeed $FF (state 1), then snap to the tile grid and enter state 2.
 * Normal travel uses turn rate $20, QSpeed $18 (Zol) / $40 (Gel), and
 * ZolGelDelays pauses at tile edges.
 */

import { DIR } from './collision.js';
import { QSPEED } from './objQSpeed.js';

/** ObjType ids mirrored from enemies.js (avoid circular import). */
export const ZOL = 0x13;
export const GEL = 0x14;
export const GEL2 = 0x15;

/** Gel_Move state machine. */
export const GEL_STATE = Object.freeze({
  SPLIT_START: 0,
  SPLIT_SHOVE: 1,
  NORMAL: 2,
});

/**
 * ZolGelDelays — first 4 Zol, last 4 Gel (Z_04.asm).
 * Indexed by Random&3 (+4 for gel).
 */
export const ZOL_GEL_DELAYS = Object.freeze([
  0x18, 0x28, 0x38, 0x48, 0x08, 0x18, 0x28, 0x38,
]);

/** UpdateNormalZolOrGel turn rate (not the generic wanderer $80). */
export const ZOL_GEL_TURN_RATE = 0x20;

/** Pause threshold: ObjTimer >= 5 skips Wanderer_TargetPlayer. */
export const ZOL_GEL_PAUSE_TIMER = 0x05;

/** Child-gel shove speed during Gel_MoveSplitting. */
export const GEL_SHOVE_QSPEED = 0xff;

/** State-0 → state-1 transition QSpeed / timer. */
export const GEL_SPLIT_START_QSPEED = 0x20;
export const GEL_SPLIT_START_TIMER = 0x05;

/**
 * @param {number} objType
 */
export function isZolOrGelType(objType) {
  return objType === ZOL || objType === GEL || objType === GEL2;
}

/**
 * @param {number} objType
 */
export function isGelType(objType) {
  return objType === GEL || objType === GEL2;
}

/**
 * InitGel: non-split gels begin in state 2.
 * @param {number} objType
 * @returns {number | undefined}
 */
export function initialGelState(objType) {
  return isGelType(objType) ? GEL_STATE.NORMAL : undefined;
}

/**
 * QSpeed written each frame by UpdateNormalZolOrGel / Gel state 2.
 * @param {number} objType
 */
export function normalZolGelQSpeed(objType) {
  return objType === ZOL ? QSPEED.ZOL : QSPEED.GEL_ACTIVE;
}

/**
 * Pick edge-delay frames from ZolGelDelays.
 * @param {number} objType
 * @param {number} randomByte low bits used (Random,X & 3)
 */
export function pickZolGelEdgeDelay(objType, randomByte) {
  const idx = (randomByte & 0x03) + (objType === ZOL ? 0 : 4);
  return ZOL_GEL_DELAYS[idx];
}

/**
 * True while UpdateNormalZolOrGel should not call Wanderer_TargetPlayer.
 * @param {number} timer
 */
export function zolGelPaused(timer) {
  return (timer ?? 0) >= ZOL_GEL_PAUSE_TIMER;
}

/**
 * After Gel_MoveSplitting ends: ((X+8)&$F0, ((Y+8)&$F0)|$0D), gridOffset=0.
 * @param {{ x: number, y: number, gridOffset?: number }} e
 */
export function snapGelAfterShove(e) {
  e.x = (e.x + 8) & 0xf0;
  e.y = ((e.y + 8) & 0xf0) | 0x0d;
  e.gridOffset = 0;
}

/**
 * CreateChildGel facing: vertical parent → LEFT then RIGHT; else UP then DOWN.
 * @param {number} parentDir
 * @returns {[number, number]}
 */
export function gelSplitChildDirs(parentDir) {
  if (parentDir & (DIR.UP | DIR.DOWN)) {
    return [DIR.LEFT, DIR.RIGHT];
  }
  return [DIR.UP, DIR.DOWN];
}
