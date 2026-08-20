/**
 * Which rectangle a foe may walk in.
 *
 * Overworld wanderers use the camera chase pad so they can follow Link
 * across a seam. Underground, every foe — not only bosses — stays in its
 * home cell. The chase pad is what walked Goriyas through dungeon doors.
 */

import { occupyingRoom, roomPlayOrigin } from './continuousCamera.js';
import { chaseBoundsForCamera, uwEnemyBoundsForRoom } from './roomStream.js';

/** Same box as `OW_ENEMY_BOUNDS` — kept here so this file does not import `enemies.js`. */
const OW_CHASE_BOUNDS = Object.freeze({
  minX: 0x20,
  maxX: 0xd8,
  minY: 0x4d,
  maxY: 0xd0,
});

/**
 * @param {'overworld' | 'dungeon' | string} mode
 * @param {{ homeRoomId?: number | null, objType?: number }} enemy
 * @param {number} anchorRoomId
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [cam]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function enemyMotionBounds(mode, enemy, anchorRoomId, cam = null) {
  if (mode === 'dungeon') {
    return uwEnemyBoundsForRoom(enemy?.homeRoomId ?? anchorRoomId, anchorRoomId);
  }
  if (mode === 'overworld' && cam) {
    return chaseBoundsForCamera(cam.camLocalX ?? 0, cam.camLocalY ?? 0);
  }
  return OW_CHASE_BOUNDS;
}

/**
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} a
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} b
 */
function unionBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Where a shot may fly, in the current anchor's local coordinates.
 *
 * Combat is stepped once per world, by whoever arrives first — usually
 * player one, whose camera is the anchor playfield. A leftover ally's
 * beam is then born outside that box and dies on the first tick. Union
 * the stepping camera with the shot's occupying cell so a beam on an
 * off-anchor screen lives, while a shot in the camera room keeps the
 * same chase pad solo always used.
 *
 * @param {'overworld' | 'dungeon' | string} mode
 * @param {number} x
 * @param {number} y
 * @param {number} anchorRoomId
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [cam]
 * @param {number} [homeRoomId]
 */
export function shotMotionBounds(mode, x, y, anchorRoomId, cam = null, homeRoomId) {
  const camBox =
    mode === 'overworld' || mode === 'dungeon'
      ? chaseBoundsForCamera(cam?.camLocalX ?? 0, cam?.camLocalY ?? 0)
      : OW_CHASE_BOUNDS;
  if (mode !== 'overworld' && mode !== 'dungeon') return camBox;
  const occ = homeRoomId ?? occupyingRoom(anchorRoomId, x, y).roomId;
  const home = roomPlayOrigin(occ);
  const anchor = roomPlayOrigin(anchorRoomId);
  const cellBox =
    mode === 'dungeon'
      ? uwEnemyBoundsForRoom(occ, anchorRoomId)
      : chaseBoundsForCamera(home.ox - anchor.ox, home.oy - anchor.oy);
  return unionBounds(camBox, cellBox);
}
