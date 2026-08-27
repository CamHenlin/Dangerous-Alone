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
export function unionBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * ObjectRoomBoundsOW used by BoundFlyer. `max*` is inclusive (`RoomBoundRight`
 * / `RoomBoundDown` in the ROM are exclusive).
 */
export const FAIRY_SCREEN_BOUNDS_OW = Object.freeze({
  minX: 0x11,
  maxX: 0xdf,
  minY: 0x4e,
  maxY: 0xcc,
});

/** ObjectRoomBoundsUW, inclusive, matching BoundFlyer underworld. */
export const FAIRY_SCREEN_BOUNDS_UW = Object.freeze({
  minX: 0x21,
  maxX: 0xcf,
  minY: 0x5e,
  maxY: 0xbc,
});

/**
 * Translate a screen-local BoundFlyer box by a camera origin.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} screen
 * @param {{ camLocalX?: number, camLocalY?: number }} cam
 */
function offsetScreenBounds(screen, cam) {
  const dx = cam?.camLocalX ?? 0;
  const dy = cam?.camLocalY ?? 0;
  return {
    minX: screen.minX + dx,
    maxX: screen.maxX + dx,
    minY: screen.minY + dy,
    maxY: screen.maxY + dy,
  };
}

function boundsContain(box, x, y) {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

function boundsCenterDist(box, x, y) {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return Math.abs(x - cx) + Math.abs(y - cy);
}

/**
 * NES BoundFlyer box for a dropped fairy: the ObjectRoomBounds of the
 * camera that currently holds it — not the 24px enemy chase pad, and not
 * the union of every split-screen view. The pad is what let fairies fly
 * off the visible playfield; the union is what let them cross to a
 * teammate's leftover screen.
 *
 * @param {readonly { camLocalX?: number, camLocalY?: number }[]} cameras
 * @param {number} x
 * @param {number} y
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [fallback]
 * @param {'overworld' | 'dungeon' | string} [mode]
 */
export function fairyFlightBounds(cameras, x, y, fallback = null, mode = 'overworld') {
  const screen = mode === 'dungeon' ? FAIRY_SCREEN_BOUNDS_UW : FAIRY_SCREEN_BOUNDS_OW;
  const list = [...(cameras ?? [])];
  if (!list.length && fallback) list.push(fallback);
  if (!list.length) return screen;
  const boxes = list.map((cam) => offsetScreenBounds(screen, cam));
  const holding = boxes.find((box) => boundsContain(box, x, y));
  if (holding) return holding;
  let best = boxes[0];
  let bestD = boundsCenterDist(best, x, y);
  for (let i = 1; i < boxes.length; i += 1) {
    const d = boundsCenterDist(boxes[i], x, y);
    if (d < bestD) {
      best = boxes[i];
      bestD = d;
    }
  }
  return best;
}

/**
 * Chase pad covering every camera looking at this place. Leftover-room
 * shots and wanderers used to clamp to whoever stepped the world first —
 * player one's screen — and vanish into the anchor.
 *
 * @param {readonly { camLocalX?: number, camLocalY?: number }[]} cameras
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [fallback]
 */
export function chaseBoundsForCameras(cameras, fallback = null) {
  const list = [...(cameras ?? [])];
  if (!list.length && fallback) list.push(fallback);
  if (!list.length) return OW_CHASE_BOUNDS;
  let box = chaseBoundsForCamera(list[0].camLocalX ?? 0, list[0].camLocalY ?? 0);
  for (let i = 1; i < list.length; i += 1) {
    box = unionBounds(
      box,
      chaseBoundsForCamera(list[i].camLocalX ?? 0, list[i].camLocalY ?? 0),
    );
  }
  return box;
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
