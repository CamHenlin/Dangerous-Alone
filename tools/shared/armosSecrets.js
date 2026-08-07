/**
 * Overworld Armos under-statue secrets (InitArmosOrFlyingGhini).
 * Index 0 = power bracelet room item; others = stairs `$70`.
 */

import { HUD_HEIGHT } from './collision.js';
import { revealSecretTiles } from './owSecrets.js';

export const SECRET_ARMOS_ROOMS = Object.freeze([0x24, 0x0b, 0x1c, 0x22, 0x34, 0x3d, 0x4e]);
export const SECRET_ARMOS_XS = Object.freeze([0xe0, 0xb0, 0xb0, 0x30, 0x40, 0x90, 0xa0]);
export const SECRET_ARMOS_Y = 0x80;

export const ARMOS_STAIRS_TILE = 0x70;
export const ARMOS_FLOOR_TILE = 0x26;
/** Room item id for power bracelet under Armos in room `$24`. */
export const ARMOS_BRACELET_ITEM = 0x14;

/**
 * @param {number} roomId
 * @param {{ x: number, y: number }} armos
 * @returns {{ kind: 'stairs' | 'bracelet' | 'floor', tile: number, itemType?: number } | null}
 */
export function armosSecretAt(roomId, armos) {
  if ((armos.y & 0xff) !== SECRET_ARMOS_Y) return null;
  for (let i = 0; i < SECRET_ARMOS_ROOMS.length; i += 1) {
    if (SECRET_ARMOS_ROOMS[i] !== roomId) continue;
    if (SECRET_ARMOS_XS[i] !== (armos.x & 0xff)) continue;
    if (i === 0) {
      return { kind: 'bracelet', tile: ARMOS_FLOOR_TILE, itemType: ARMOS_BRACELET_ITEM };
    }
    return { kind: 'stairs', tile: ARMOS_STAIRS_TILE };
  }
  return null;
}

/**
 * Persist key for under-Armos floor/stairs (survives screen reload / save).
 * @param {number} roomId
 * @param {number} col square col
 * @param {number} row square row
 */
export function armosRevealKey(roomId, col, row) {
  return `armos:${roomId & 0xff}:${row}:${col}`;
}

/**
 * Patch OW tile grid under a waking Armos (stairs or floor).
 * @param {number[][]} tileGrid
 * @param {number} roomId
 * @param {{ x: number, y: number }} armos
 * @returns {{ kind: 'stairs' | 'bracelet' | 'floor', tile: number, itemType?: number, key?: string, row?: number, col?: number } | null}
 */
export function applyArmosFloorReveal(tileGrid, roomId, armos) {
  const secret = armosSecretAt(roomId, armos);
  const col = Math.floor(armos.x / 16);
  const row = Math.floor((armos.y - HUD_HEIGHT) / 16);
  if (row < 0 || col < 0) return secret;
  const key = armosRevealKey(roomId, col, row);
  if (secret?.kind === 'stairs') {
    revealSecretTiles(tileGrid, row, col);
    return { ...secret, key, row, col };
  }
  // Floor under non-stairs / bracelet Armos (and unmatched statues stay solid until walkable floor).
  if (tileGrid[row * 2]?.[col * 2] != null) {
    const floor = ARMOS_FLOOR_TILE;
    tileGrid[row * 2][col * 2] = floor;
    tileGrid[row * 2 + 1][col * 2] = floor;
    tileGrid[row * 2][col * 2 + 1] = floor;
    tileGrid[row * 2 + 1][col * 2 + 1] = floor;
  }
  return { ...(secret ?? { kind: 'floor', tile: ARMOS_FLOOR_TILE }), key, row, col };
}

/**
 * Re-apply persisted Armos floor/stairs patches for a room.
 * @param {number[][]} tileGrid
 * @param {number} roomId
 * @param {Set<string>} revealed
 */
export function restoreArmosReveals(tileGrid, roomId, revealed) {
  const prefix = `armos:${roomId & 0xff}:`;
  for (const key of revealed) {
    if (!key.startsWith(prefix)) continue;
    const parts = key.split(':');
    const row = Number(parts[2]);
    const col = Number(parts[3]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    const secret = armosSecretAt(roomId, {
      x: col * 16,
      y: SECRET_ARMOS_Y,
    });
    if (secret?.kind === 'stairs') {
      revealSecretTiles(tileGrid, row, col);
    } else if (tileGrid[row * 2]?.[col * 2] != null) {
      const floor = ARMOS_FLOOR_TILE;
      tileGrid[row * 2][col * 2] = floor;
      tileGrid[row * 2 + 1][col * 2] = floor;
      tileGrid[row * 2][col * 2 + 1] = floor;
      tileGrid[row * 2 + 1][col * 2 + 1] = floor;
    }
  }
}
