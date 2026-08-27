/**
 * NES BeginShove / Obj_Shove for monsters (Z_01.asm / Z_07.asm).
 *
 * A surviving weapon hit stores the weapon's facing and `$40` pixels. Each
 * frame then slides 4px that way, stopping on a solid (when square-aligned)
 * or a room bound. Mid-tile perpendicular hits cancel instead of sliding
 * sideways off the walk grid.
 *
 * Bosses, keese, worms and similar ResetShoveInfo every frame in the ROM, so
 * they never actually move from a hit.
 */

import {
  DIR,
  OW_FIRST_UNWALKABLE,
  boundBlocksDir,
  getMonsterCollidingTile,
} from './collision.js';
import { advanceGridOffset, isWandererType } from './wandererAi.js';
import { isZolOrGelType } from './zolGelAi.js';

/** ObjShoveDistance after BeginShove. */
export const ENEMY_SHOVE_PIXELS = 0x40;
/** Pixels applied per Obj_Shove frame. */
export const ENEMY_SHOVE_SPEED = 4;

const BLUE_TEKTITE = 0x0d;
const RED_TEKTITE = 0x0e;
const BLUE_LEEVER = 0x0f;
const RED_LEEVER = 0x10;
const VIRE = 0x12;
const ZOL = 0x13;
const PEAHAT = 0x1a;
const ARMOS = 0x1e;
const FLYING_GHINI = 0x22;
const WALLMASTER = 0x27;
const ROPE = 0x28;
const LEEVER_ACTIVE = 2;

/**
 * Types whose Update* actually JMP/JSR Obj_Shove (wanderers, hoppers, flyers
 * that do not ResetShoveInfo after CheckMonsterCollisions).
 * @param {{ objType?: number, alive?: boolean, npc?: boolean, armosStatue?: boolean, armosFade?: number, leeverPhase?: number }} e
 */
export function enemyMovesOnShove(e) {
  if (!e?.alive || e.npc) return false;
  const t = e.objType;
  if (isWandererType(t) || isZolOrGelType(t)) return true;
  if (t === BLUE_TEKTITE || t === RED_TEKTITE) return true;
  if (t === PEAHAT || t === FLYING_GHINI) return true;
  if (t === WALLMASTER || t === ROPE) return true;
  if (t === BLUE_LEEVER || t === RED_LEEVER) return e.leeverPhase === LEEVER_ACTIVE;
  if (t === ARMOS) return !e.armosStatue && !(e.armosFade > 0);
  return false;
}

/**
 * Facing left/right vs shove up/down (or the other way around).
 * @param {number} facing
 * @param {number} shoveDir
 */
export function shoveIsPerpendicular(facing, shoveDir) {
  const faceH = facing & (DIR.LEFT | DIR.RIGHT);
  const faceV = facing & (DIR.UP | DIR.DOWN);
  const shoveH = shoveDir & (DIR.LEFT | DIR.RIGHT);
  const shoveV = shoveDir & (DIR.UP | DIR.DOWN);
  if (faceH && !faceV) return Boolean(shoveV);
  if (faceV && !faceH) return Boolean(shoveH);
  return false;
}

function clearShove(e) {
  e.shoveDir = 0;
  e.shovePixels = 0;
}

/**
 * BeginShove monster-defender: weapon facing, `$40` pixels.
 * First-frame Obj_Shove cancels a mid-tile perpendicular hit.
 * @param {object} e
 * @param {number} weaponDir
 * @returns {boolean} true if a shove was armed
 */
export function beginEnemyShove(e, weaponDir) {
  if (!e?.alive || !enemyMovesOnShove(e)) return false;
  const dir = (weaponDir ?? 0) & 0x0f;
  if (!dir) return false;
  if ((e.gridOffset ?? 0) !== 0 && shoveIsPerpendicular(e.dir ?? 0, dir)) {
    clearShove(e);
    return false;
  }
  e.shoveDir = dir;
  e.shovePixels = ENEMY_SHOVE_PIXELS;
  // CheckMonsterWeaponCollision: Zol / Vire face the weapon (not boomerang).
  if (e.objType === ZOL || e.objType === VIRE) e.dir = dir;
  return true;
}

function shoveTileBlocked(tileGrid, x, y, dir, tileOpts = {}) {
  if ((!tileGrid && typeof tileOpts.collidingTile !== 'function') || !dir) {
    return false;
  }
  if (typeof tileOpts.collidingTile === 'function') {
    return !tileOpts.collidingTile(x, y, dir)?.walkable;
  }
  return !getMonsterCollidingTile(tileGrid, x, y, dir, {
    firstUnwalkable: tileOpts.firstUnwalkable ?? OW_FIRST_UNWALKABLE,
    walkableRemap: tileOpts.walkableRemap,
  }).walkable;
}

function stepOneShovePixel(e, dir) {
  if (dir & DIR.UP) e.y -= 1;
  else if (dir & DIR.DOWN) e.y += 1;
  else if (dir & DIR.LEFT) e.x -= 1;
  else if (dir & DIR.RIGHT) e.x += 1;
  advanceGridOffset(e, 1);
  if (((e.gridOffset ?? 0) & 0x0f) === 0) e.gridOffset = 0;
}

/**
 * One Obj_Shove frame. Returns true while a shove is still in progress, so
 * the caller can skip walking AI (Walker_Move JMP Obj_Shove).
 * @param {object} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number } | null | undefined} bounds
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function }} [tileOpts]
 * @param {{ skipTiles?: boolean }} [opts]
 */
export function stepEnemyShove(e, bounds, tileGrid = null, tileOpts = {}, opts = {}) {
  const dir = (e.shoveDir ?? 0) & 0x0f;
  let left = e.shovePixels ?? 0;
  if (!dir || left <= 0) {
    clearShove(e);
    return false;
  }

  const step = Math.min(ENEMY_SHOVE_SPEED, left);
  for (let i = 0; i < step; i += 1) {
    if ((e.gridOffset ?? 0) === 0 && !opts.skipTiles) {
      if (shoveTileBlocked(tileGrid, e.x, e.y, dir, tileOpts)) {
        clearShove(e);
        return false;
      }
    }
    if (boundBlocksDir(e.x, e.y, dir, bounds)) {
      clearShove(e);
      return false;
    }
    stepOneShovePixel(e, dir);
    left -= 1;
  }

  e.shovePixels = left;
  if (left <= 0) clearShove(e);
  return (e.shovePixels ?? 0) > 0;
}
