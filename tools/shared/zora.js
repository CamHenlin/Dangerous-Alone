/**
 * NES CheckZora (Z_04) — separate from the room monster list.
 * When LevelBlockAttrsA bit $08 is set, try to place one Zora ($11) on water.
 */

import { OBJ, createEnemy } from './enemies.js';
import { standingTile } from './world.js';

/** OW water tiles accepted by CheckZora ($8D..$98). */
export function isOwWaterTile(tile) {
  const t = tile & 0xff;
  return t >= 0x8d && t < 0x99;
}

/**
 * Decode one NES Random byte into a CheckZora candidate (same byte → X and Y).
 * @param {number} r 0–255
 * @returns {{ x: number, y: number } | null}
 */
export function zoraCandidateFromRandomByte(r) {
  const x = r & 0xf0;
  if (x === 0 || x === 0xf0) return null;
  const yBase = (r << 4) & 0xf0;
  if (yBase < 0x50 || yBase >= 0xe0) return null;
  return { x, y: yBase | 0x0d };
}

/**
 * Try to spawn a Zora on a water tile (CheckZora).
 * No-op when attrs.zora is false or a living Zora is already present
 * in this room (continuous OW may stream a neighbor Zora — that must not
 * block the current screen's CheckZora).
 *
 * @param {{ zora?: boolean }} attrs
 * @param {number[][]} tileGrid
 * @param {import('./enemies.js').Enemy[]} enemies
 * @param {object} [opts]
 * @param {() => number} [opts.rngByte] returns 0–255
 * @param {number} [opts.attempts] NES uses $0D
 * @param {number | null} [opts.roomId] when set, uniqueness is per home room
 * @returns {import('./enemies.js').Enemy | null} newly created Zora, or null
 */
export function trySpawnZora(attrs, tileGrid, enemies, opts = {}) {
  if (!attrs?.zora || !tileGrid?.length) return null;
  const roomId = opts.roomId == null ? null : opts.roomId & 0xff;
  if (
    enemies.some(
      (e) =>
        e.alive
        && e.objType === OBJ.ZORA
        && (roomId == null || (e.homeRoomId ?? roomId) === roomId),
    )
  ) {
    return null;
  }

  const rngByte = opts.rngByte ?? (() => (Math.random() * 256) & 0xff);
  const attempts = opts.attempts ?? 0x0d;

  for (let i = 0; i < attempts; i += 1) {
    const pos = zoraCandidateFromRandomByte(rngByte());
    if (!pos) continue;
    if (!isOwWaterTile(standingTile(tileGrid, pos.x, pos.y))) continue;
    const zora = createEnemy({ objType: OBJ.ZORA, x: pos.x, y: pos.y });
    return zora;
  }
  return null;
}
