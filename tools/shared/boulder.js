/**
 * NES UpdateBoulderSet / Boulder ($1F / $20) — mountain rockfall spawner.
 */

import { DIR } from './collision.js';
import { roomPlayOrigin } from './continuousCamera.js';

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
 * Home-room origin minus the streaming anchor, in object space.
 * NES UpdateBoulderSet writes screen-local X/Y ($40 spawn, $F0 scrap). With
 * two cameras those bytes belong to the set's mountain cell, not whoever
 * currently holds the world's roomId.
 * @param {number | null | undefined} homeRoomId
 * @param {number | null | undefined} anchorRoomId
 */
export function boulderRoomOffset(homeRoomId, anchorRoomId) {
  if (homeRoomId == null || anchorRoomId == null) return { dx: 0, dy: 0 };
  const home = roomPlayOrigin(homeRoomId & 0xff);
  const anchor = roomPlayOrigin(anchorRoomId & 0xff);
  return { dx: home.ox - anchor.ox, dy: home.oy - anchor.oy };
}

/**
 * Scrap-zone Y for a boulder whose home cell may not be the streaming anchor.
 * @param {number | null | undefined} homeRoomId
 * @param {number | null | undefined} anchorRoomId
 */
export function boulderScrapY(homeRoomId, anchorRoomId) {
  return BOULDER_DESTROY_Y + boulderRoomOffset(homeRoomId, anchorRoomId).dy;
}

/**
 * @param {{ alive?: boolean, objType?: number, homeRoomId?: number | null }[]} enemies
 * @param {number | null} [homeRoomId] count only this cell's rocks (per-screen NES cap)
 */
export function countActiveBoulders(enemies, homeRoomId) {
  const home = homeRoomId == null ? null : homeRoomId & 0xff;
  return enemies.filter((e) => {
    if (!e?.alive || e.objType !== BOULDER) return false;
    if (home == null) return true;
    return ((e.homeRoomId ?? home) & 0xff) === home;
  }).length;
}

/**
 * Random X in the same screen half as the chase target (UpdateBoulderSet).
 * `chaseX` is the home room's own local X, not the streaming-anchor frame.
 * @param {number} chaseX
 * @param {number} randomByte 0–255
 */
export function boulderSpawnX(chaseX, randomByte) {
  const r = randomByte & 0xff;
  return chaseX < 0x80 ? r & 0x7f : r | 0x80;
}

/**
 * Update BoulderSet timer / request one Boulder when ready.
 * @param {{ alive?: boolean, objType?: number, timer?: number, homeRoomId?: number | null }} set
 * @param {{ alive?: boolean, objType?: number, homeRoomId?: number | null }[]} enemies
 * @param {object} [opts]
 * @param {{ x: number, y: number } | null} [opts.chase] chase in streaming-anchor space
 * @param {() => number} [opts.rngByte]
 * @param {number | null} [opts.anchorRoomId] current streaming anchor
 * @returns {{ objType: number, x: number, y: number, dir: number } | null}
 */
export function stepBoulderSet(set, enemies, opts = {}) {
  if (!set?.alive || set.objType !== BOULDER_SET) return null;
  if ((set.timer ?? 0) > 0) return null;

  const rngByte = opts.rngByte ?? (() => (Math.random() * 256) & 0xff);
  const home = set.homeRoomId ?? opts.anchorRoomId ?? null;
  if (countActiveBoulders(enemies, home) >= MAX_ACTIVE_BOULDERS) {
    set.timer = 1 + (rngByte() & 0x1f);
    return null;
  }

  // Chase is stored in the world's streaming-anchor frame. The half-screen
  // test (X < $80) is a NES screen-local compare, so undo the leftover
  // offset first, then put the spawn back into anchor space.
  const { dx, dy } = boulderRoomOffset(home, opts.anchorRoomId);
  const chaseX = (opts.chase?.x ?? 0x80) - dx;
  // Next spawn wait: (Random + 8) AND $1F
  set.timer = (rngByte() + 8) & 0x1f;
  return {
    objType: BOULDER,
    x: boulderSpawnX(chaseX, rngByte()) + dx,
    y: BOULDER_SPAWN_Y + dy,
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
