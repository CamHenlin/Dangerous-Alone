/**
 * NES UpdateBoulderSet / Boulder ($1F / $20) — mountain rockfall spawner.
 */

import { DIR } from './collision.js';

/** Object types (mirror enemies.js OBJ). */
export const BOULDER_SET = 0x1f;
export const BOULDER = 0x20;

/** Max concurrent Boulder ($20) objects (ActiveBoulders). */
export const MAX_ACTIVE_BOULDERS = 3;

/** Destroy when Y reaches the bottom scrap zone (NES CMP #$F0). */
export const BOULDER_DESTROY_Y = 0xf0;

/** Spawn Y at the top edge of the playfield (NES STA #$40). */
export const BOULDER_SPAWN_Y = 0x40;

/**
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 */
export function countActiveBoulders(enemies) {
  return enemies.filter((e) => e.alive && e.objType === BOULDER).length;
}

/**
 * Random X in the same screen half as the chase target (UpdateBoulderSet).
 * @param {number} chaseX
 * @param {number} randomByte 0–255
 */
export function boulderSpawnX(chaseX, randomByte) {
  const r = randomByte & 0xff;
  return chaseX < 0x80 ? r & 0x7f : r | 0x80;
}

/**
 * Update BoulderSet timer / request one Boulder when ready.
 * @param {{ alive?: boolean, objType?: number, timer?: number }} set
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 * @param {object} [opts]
 * @param {{ x: number, y: number } | null} [opts.chase]
 * @param {() => number} [opts.rngByte]
 * @returns {{ objType: number, x: number, y: number, dir: number } | null}
 */
export function stepBoulderSet(set, enemies, opts = {}) {
  if (!set?.alive || set.objType !== BOULDER_SET) return null;
  if ((set.timer ?? 0) > 0) return null;

  const rngByte = opts.rngByte ?? (() => (Math.random() * 256) & 0xff);
  if (countActiveBoulders(enemies) >= MAX_ACTIVE_BOULDERS) {
    set.timer = 1 + (rngByte() & 0x1f);
    return null;
  }

  const chaseX = opts.chase?.x ?? 0x80;
  // Next spawn wait: (Random + 8) AND $1F
  set.timer = (rngByte() + 8) & 0x1f;
  return {
    objType: BOULDER,
    x: boulderSpawnX(chaseX, rngByte()),
    y: BOULDER_SPAWN_Y,
    dir: DIR.DOWN | DIR.RIGHT,
  };
}

/**
 * Force a down vertical component (Jumper_PointBoulderDownward).
 * @param {{ objType: number, dir: number }} e
 */
export function pointBoulderDownward(e) {
  if (e.objType !== BOULDER) return;
  e.dir = (e.dir & 0x03) | DIR.DOWN;
}
