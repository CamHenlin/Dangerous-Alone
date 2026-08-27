/**
 * NES shutter doors (`TriggeredDoorCmd` 6→7 open, 2→3 close).
 *
 * The nametable has no half-open face: closed shutter is face index 2, open
 * is face 0. The ROM waits `DoorTimer = 8` with a door rumble, then snaps.
 * We keep that 8-frame window and slide the two 16px halves apart (or
 * together) so the wait reads as motion.
 *
 * Collision follows `CurOpenedDoors`: a door stays solid until the open
 * command finishes. Close collision is already applied by `closeDoorPair`
 * (the remake skips NES's `$30` Link freeze).
 */

import { dirForSide, dungeonNeighbor, isDoorMarkedOpen, oppositeSide } from './dungeonDoors.js';
import { doorFacePlayRect, openSidesForRoom } from './dungeonRoomLayout.js';

export const SHUTTER_ANIM_FRAMES = 8;
export const SHUTTER_HALF_TRAVEL = 16;

/**
 * @param {number} roomId
 * @param {string} side
 */
export function shutterAnimKey(roomId, side) {
  return `${roomId & 0xff}:${side}`;
}

/**
 * @param {number} roomId
 * @param {string} side
 * @param {'open' | 'close'} kind
 */
export function createShutterAnim(roomId, side, kind) {
  return { roomId: roomId & 0xff, side, kind, frame: 0 };
}

/**
 * @param {{ frame: number }} anim
 * @returns {boolean} true when the command has finished
 */
export function stepShutterAnim(anim) {
  anim.frame += 1;
  return anim.frame >= SHUTTER_ANIM_FRAMES;
}

/**
 * 0 = halves together (closed), 1 = 16px apart (open).
 * @param {{ kind: 'open' | 'close', frame: number }} anim
 */
export function shutterAnimProgress(anim) {
  const t = Math.min(Math.max(anim.frame, 0), SHUTTER_ANIM_FRAMES) / SHUTTER_ANIM_FRAMES;
  return anim.kind === 'open' ? t : 1 - t;
}

/**
 * Pixel offsets for the two face halves at `progress`.
 * N/S split left/right; E/W split top/bottom.
 * @param {'north'|'south'|'east'|'west'} side
 * @param {number} progress 0..1
 * @returns {[{ dx: number, dy: number }, { dx: number, dy: number }]}
 */
export function shutterHalfOffsets(side, progress) {
  const d = Math.round(progress * SHUTTER_HALF_TRAVEL);
  if (side === 'east' || side === 'west') {
    return [
      { dx: 0, dy: d ? -d : 0 },
      { dx: 0, dy: d },
    ];
  }
  return [
    { dx: d ? -d : 0, dy: 0 },
    { dx: d, dy: 0 },
  ];
}

/**
 * Shutter sides that `openRoomShutters` would open, without marking them.
 * @param {{ open?: Set<string> }} state
 * @param {{ roomId: number, doors?: Record<string, { type?: string }> }} room
 * @returns {string[]}
 */
export function shutterSidesNeedingOpen(state, room) {
  /** @type {string[]} */
  const sides = [];
  if (!room?.doors) return sides;
  for (const side of ['north', 'south', 'west', 'east']) {
    if (room.doors[side]?.type !== 'shutter') continue;
    if (isDoorMarkedOpen(state, room.roomId, side)) continue;
    sides.push(side);
  }
  return sides;
}

/**
 * Display-open sides: persistent opens plus any door currently sliding.
 * Collision still uses `openSidesForRoom` (doorState only).
 * @param {object} room
 * @param {{ open?: Set<string> } | null} doorState
 * @param {Iterable<{ roomId: number, side: string }>} anims
 * @returns {string[]}
 */
export function visualOpenSides(room, doorState, anims) {
  const sides = new Set(openSidesForRoom(room, doorState));
  const id = room?.roomId & 0xff;
  for (const anim of anims ?? []) {
    if ((anim.roomId & 0xff) !== id) continue;
    sides.add(anim.side);
  }
  return [...sides];
}

/**
 * The facing door on the far side of this wall, if the map continues.
 * @param {number} roomId
 * @param {string} side
 * @returns {{ roomId: number, side: string } | null}
 */
export function neighborShutterRef(roomId, side) {
  const next = dungeonNeighbor(roomId, dirForSide(side));
  if (next == null) return null;
  return { roomId: next, side: oppositeSide(side) };
}

/**
 * Split a cropped door-face RGBA into the two sliding halves.
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {'north'|'south'|'east'|'west'} side
 * @returns {[{ width: number, height: number, rgba: Uint8Array }, { width: number, height: number, rgba: Uint8Array }]}
 */
export function splitDoorFaceRgba(rgba, width, height, side) {
  if (side === 'east' || side === 'west') {
    const halfH = height >> 1;
    return [
      cropRgba(rgba, width, height, 0, 0, width, halfH),
      cropRgba(rgba, width, height, 0, halfH, width, height - halfH),
    ];
  }
  const halfW = width >> 1;
  return [
    cropRgba(rgba, width, height, 0, 0, halfW, height),
    cropRgba(rgba, width, height, halfW, 0, width - halfW, height),
  ];
}

/**
 * Overlay placements in play-local pixels (256×176 origin).
 * `texture` is left for the caller — this only returns keys and positions.
 * @param {{ roomId: number, side: string, kind: 'open' | 'close', frame: number }} anim
 * @returns {{ key: string, half: 0 | 1, x: number, y: number }[]}
 */
export function shutterSpritePlacements(anim) {
  const rect = doorFacePlayRect(anim.side);
  if (!rect) return [];
  const offs = shutterHalfOffsets(anim.side, shutterAnimProgress(anim));
  const vertical = anim.side === 'east' || anim.side === 'west';
  const origins = [
    { x: rect.x, y: rect.y },
    vertical
      ? { x: rect.x, y: rect.y + (rect.h >> 1) }
      : { x: rect.x + (rect.w >> 1), y: rect.y },
  ];
  return offs.map((off, i) => ({
    key: `${shutterAnimKey(anim.roomId, anim.side)}:${i}`,
    half: /** @type {0 | 1} */ (i),
    x: origins[i].x + off.dx,
    y: origins[i].y + off.dy,
  }));
}

/**
 * @param {Uint8Array} rgba
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function cropRgba(rgba, srcW, srcH, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const sy = y + row;
    if (sy < 0 || sy >= srcH) continue;
    for (let col = 0; col < w; col += 1) {
      const sx = x + col;
      if (sx < 0 || sx >= srcW) continue;
      const src = (sy * srcW + sx) * 4;
      const dst = (row * w + col) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return { width: w, height: h, rgba: out };
}
