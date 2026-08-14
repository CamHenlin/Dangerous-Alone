/**
 * NES Wanderer_TargetPlayer / UpdateCommonWanderer turn machine.
 * Turn rates from Update* (Octorok $70/$A0, Moblin $A0, Stalfos/Gibdo/Darknut $80, …).
 *
 * Frame order matches Z_04.asm Wanderer_TargetPlayer:
 *   1. tick ObjTurnTimer every frame
 *   2. Walker_Move (tile collision / alt-dir)
 *   3. if ObjGridOffset & $0F == 0: truncate offset, then maybe reface
 */

import { DIR } from './collision.js';

/**
 * @param {number} objType
 * @returns {number} ObjTurnRate threshold (higher → turns toward player more often)
 */
export function turnRateForType(objType) {
  // Lynel $01–$02, Moblin $03–$04, Goriya $05–$06, fast Octorok $08/$0A → $A0
  if (
    objType === 0x01
    || objType === 0x02
    || objType === 0x03
    || objType === 0x04
    || objType === 0x05
    || objType === 0x06
    || objType === 0x08
    || objType === 0x0a
  ) {
    return 0xa0;
  }
  // Slow Octorok $07/$09 → $70
  if (objType === 0x07 || objType === 0x09) return 0x70;
  // Bubble $2B–$2D → $40 (UpdateBubble)
  if (objType >= 0x2b && objType <= 0x2d) return 0x40;
  // Ghini $21 → $FF, "to turn as often as possible" (UpdateGhini)
  if (objType === 0x21) return 0xff;
  // Zol / Gel — UpdateNormalZolOrGel uses $20 (not the common $80 path).
  if (objType === 0x13 || objType === 0x14 || objType === 0x15) return 0x20;
  // Darknut / Stalfos / Gibdo / Like-Like / Vire → $80
  return 0x80;
}

/**
 * Types that use the common wanderer mover (not special machines).
 * @param {number} objType
 */
export function isWandererType(objType) {
  return (
    (objType >= 0x01 && objType <= 0x0a)
    || objType === 0x0b
    || objType === 0x0c
    || objType === 0x12
    // Zol $13 uses UpdateNormalZolOrGel (zolGelAi.js), not UpdateCommonWanderer.
    || objType === 0x17
    // Ghini $21 uses UpdateCommonWanderer (Z_04.asm UpdateGhini).
    || objType === 0x21
    || objType === 0x2a
    // Bubbles $2B–$2D use UpdateCommonWanderer (Z_04.asm UpdateBubble).
    || (objType >= 0x2b && objType <= 0x2d)
    || objType === 0x30
  );
}

/**
 * Lynel ($01–$02) and Goriya ($05–$06) use UpdateGoriya facing, not
 * Wanderer_TargetPlayer.
 * @param {number} objType
 */
export function isGoriyaStyleFacing(objType) {
  return (
    objType === 0x01
    || objType === 0x02
    || objType === 0x05
    || objType === 0x06
  );
}

/**
 * Decrement ObjTurnTimer every frame (Wanderer_TargetPlayer prologue).
 * Must run even mid-tile — the NES ticks this before Walker_Move.
 * @param {{ turnTimer?: number }} e
 */
export function tickWandererTurnTimer(e) {
  if ((e.turnTimer ?? 0) > 0) e.turnTimer -= 1;
}

/**
 * After Walker_Move: when low nibble is 0, force ObjGridOffset := 0
 * (Wanderer_TargetPlayer `STA ObjGridOffset`).
 * @param {{ gridOffset?: number }} e
 */
export function truncateWandererGridOffset(e) {
  if (((e.gridOffset ?? 0) & 0x0f) === 0) e.gridOffset = 0;
}

/**
 * UpdateGoriya facing: on the longer axis, if distance < $51 then face the
 * chase target and set wantsToShoot.
 * @param {{ dir: number, wantsToShoot?: boolean, x: number, y: number }} e
 * @param {{ x: number, y: number } | null | undefined} chase
 * @returns {boolean} wantsToShoot
 */
export function goriyaDecideFacing(e, chase) {
  e.wantsToShoot = false;
  if (!chase) return false;

  let vertDist;
  let vertDir;
  if (chase.y >= e.y) {
    vertDist = chase.y - e.y;
    vertDir = DIR.DOWN;
  } else {
    vertDist = e.y - chase.y;
    vertDir = DIR.UP;
  }

  let horizDist;
  let horizDir;
  if (chase.x >= e.x) {
    horizDist = chase.x - e.x;
    horizDir = DIR.RIGHT;
  } else {
    horizDist = e.x - chase.x;
    horizDir = DIR.LEFT;
  }

  const useVert = vertDist >= horizDist;
  const dist = useVert ? vertDist : horizDist;
  if (dist >= 0x51) return false;

  e.dir = useVert ? vertDir : horizDir;
  e.wantsToShoot = true;
  return true;
}

/**
 * On tile boundary after a move: maybe face chase target (Wanderer_TargetPlayer).
 * Turn timer is ticked separately via {@link tickWandererTurnTimer} every frame.
 * @param {{ dir: number, turnTimer?: number, turnRate?: number, objType: number, x: number, y: number, wantsToShoot?: boolean }} e
 * @param {{ x: number, y: number } | null | undefined} chase
 * @param {() => number} randomByte
 * @returns {boolean} wantsToShoot
 */
export function wandererDecideFacing(e, chase, randomByte) {
  e.wantsToShoot = false;

  const rate = e.turnRate ?? turnRateForType(e.objType);
  // NES: ObjTurnRate >= Random+1,X (CMP / BCC → skip chase when rate < roll)
  const roll = randomByte() & 0xff;
  const canChase = Boolean(chase) && rate >= roll;

  if (canChase && chase) {
    const dx = Math.abs(chase.x - e.x);
    const dy = Math.abs(chase.y - e.y);
    // Horizontal distance first: if dx < 9, face vertically (even if also dy < 9).
    if (dx < 9) {
      e.dir = chase.y < e.y ? DIR.UP : DIR.DOWN;
      e.turnTimer = randomByte() & 0xff;
      e.wantsToShoot = true;
      return true;
    }
    if (dy < 9) {
      e.dir = chase.x >= e.x ? DIR.RIGHT : DIR.LEFT;
      e.turnTimer = randomByte() & 0xff;
      e.wantsToShoot = true;
      return true;
    }
  }

  if ((e.turnTimer ?? 0) > 0) return false;

  // Perpendicular turn toward chase when timer expired.
  if (chase) {
    if (e.dir & (DIR.UP | DIR.DOWN)) {
      e.dir = chase.x >= e.x ? DIR.RIGHT : DIR.LEFT;
    } else {
      e.dir = chase.y < e.y ? DIR.UP : DIR.DOWN;
    }
  }
  e.turnTimer = randomByte() & 0xff;
  return false;
}

/**
 * Advance gridOffset after a successful move of `speed` px.
 * @param {{ gridOffset?: number }} e
 * @param {number} speed
 */
export function advanceGridOffset(e, speed) {
  e.gridOffset = ((e.gridOffset ?? 0) + speed) & 0xff;
}

/** True when aligned to tile for a facing decision (low nibble of gridOffset = 0). */
export function onTileBoundary(e) {
  return ((e.gridOffset ?? 0) & 0x0f) === 0;
}
