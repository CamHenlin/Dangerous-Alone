/**
 * Which rectangle a foe may walk in.
 *
 * Overworld wanderers use the camera chase pad so they can follow Link
 * across a seam. In company that pad is the connected union of every
 * overlapping view — otherwise a foe on player one's screen treats the
 * seam as a wall and cannot walk into an ally's adjacent quadrant.
 * Underground, every foe — not only bosses — stays in its home cell.
 * The chase pad is what walked Goriyas through dungeon doors.
 */

import { HUD_HEIGHT } from './collision.js';
import { occupyingRoom, PLAY_H, PLAY_W, roomPlayOrigin } from './continuousCamera.js';
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
 * @param {{ homeRoomId?: number | null, objType?: number, x?: number, y?: number }} enemy
 * @param {number} anchorRoomId
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [cam]
 * @param {readonly { camLocalX?: number, camLocalY?: number }[] | null} [cameras]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function enemyMotionBounds(mode, enemy, anchorRoomId, cam = null, cameras = null) {
  if (mode === 'dungeon') {
    return uwEnemyBoundsForRoom(enemy?.homeRoomId ?? anchorRoomId, anchorRoomId);
  }
  if (mode === 'overworld') {
    return connectedChaseBounds(cameras, enemy?.x, enemy?.y, cam);
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

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * Chase pad covering the cameras whose views overlap this point — and any
 * further cameras those pads touch. Adjacent split-screen quadrants become
 * one walkable rectangle; a leftover room two screens away stays its own
 * box, so wanderers do not march the forest between the party.
 *
 * @param {readonly { camLocalX?: number, camLocalY?: number }[] | null | undefined} cameras
 * @param {number} [x]
 * @param {number} [y]
 * @param {{ camLocalX?: number, camLocalY?: number } | null} [fallback]
 */
export function connectedChaseBounds(cameras, x, y, fallback = null) {
  const list = [...(cameras ?? [])];
  if (!list.length && fallback) list.push(fallback);
  if (!list.length) return OW_CHASE_BOUNDS;
  const pads = list.map((cam) => chaseBoundsForCamera(cam.camLocalX ?? 0, cam.camLocalY ?? 0));

  const seeds = [];
  const hasPoint = Number.isFinite(x) && Number.isFinite(y);
  if (hasPoint) {
    for (let i = 0; i < pads.length; i += 1) {
      if (boundsContain(pads[i], x, y)) seeds.push(i);
    }
    if (!seeds.length) {
      let best = 0;
      let bestD = boundsCenterDist(pads[0], x, y);
      for (let i = 1; i < pads.length; i += 1) {
        const d = boundsCenterDist(pads[i], x, y);
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      }
      seeds.push(best);
    }
  } else {
    seeds.push(0);
  }

  const seen = new Uint8Array(pads.length);
  const stack = [...seeds];
  for (const i of seeds) seen[i] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (let j = 0; j < pads.length; j += 1) {
      if (seen[j] || !boundsOverlap(pads[i], pads[j])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  let box = null;
  for (let i = 0; i < pads.length; i += 1) {
    if (!seen[i]) continue;
    box = box ? unionBounds(box, pads[i]) : { ...pads[i] };
  }
  return box ?? pads[0];
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
 * shots used to clamp to whoever stepped the world first — player one's
 * screen — and vanish into the anchor. Wanderers use
 * {@link connectedChaseBounds} instead, so a far leftover view does not
 * open a forest-sized walk box.
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
  const camLocalX = cam?.camLocalX ?? 0;
  const camLocalY = cam?.camLocalY ?? 0;
  const camBox =
    mode === 'overworld' || mode === 'dungeon'
      ? chaseBoundsForCamera(camLocalX, camLocalY)
      : OW_CHASE_BOUNDS;
  if (mode !== 'overworld' && mode !== 'dungeon') return camBox;
  const occ = homeRoomId ?? occupyingRoom(anchorRoomId, x, y).roomId;
  const home = roomPlayOrigin(occ);
  const anchor = roomPlayOrigin(anchorRoomId);
  const cellBox =
    mode === 'dungeon'
      ? uwEnemyBoundsForRoom(occ, anchorRoomId)
      : chaseBoundsForCamera(home.ox - anchor.ox, home.oy - anchor.oy);
  // Same cell as the stepping camera: the solo chase pad. A leftover cell
  // must not union with that pad — adjacent rooms become one corridor, and
  // Aquamentus fireballs from the room to the right fly into this one.
  const camOcc = occupyingRoom(
    anchorRoomId,
    camLocalX + PLAY_W / 2,
    camLocalY + HUD_HEIGHT + PLAY_H / 2,
  ).roomId;
  if ((occ & 0xff) === (camOcc & 0xff)) return unionBounds(camBox, cellBox);
  return cellBox;
}
