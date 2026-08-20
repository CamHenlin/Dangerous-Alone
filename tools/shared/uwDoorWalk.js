/**
 * One frame of underworld door walking and seam-cross detection.
 *
 * `main.js` `stepDungeon` has extra work around this (keys, ladders, cellars).
 * The motion mode and the owned-cross test are the part that must stay in
 * lockstep with the tests: corridor vs room vs neighbour, and who is allowed
 * to rebase the world's anchor.
 */

import { HUD_HEIGHT } from './collision.js';
import { canClaimAnchorCross, inAnchorPlayArea } from './continuousCamera.js';
import {
  clampUwDoorwayPath,
  detectUwDoorCross,
  linkInDoorwayCorridor,
} from './dungeonDoors.js';
import { NO_ROOM_BOUNDS, UW_ROOM_BOUNDS, stepLink } from './linkMotion.js';

/** Open UW floor — DoorwayDir skips tile collision. */
export const OPEN_UW_GRID = Object.freeze(
  Array.from({ length: 22 }, () => Object.freeze(Array(32).fill(0x26))),
);

/**
 * How this hero should walk this frame.
 *
 * - `corridor` — in a passable door (or its seam lip); open tiles + door clamp
 * - `room` — inside the anchor, normal UW bounds
 * - `neighbor` — living in another cell; must not rebase the anchor
 *
 * @param {{ x: number, y: number }} link
 * @param {object} room
 * @param {{ doorwayBlockSide?: string | null, doorState?: object | null }} [opts]
 * @returns {'corridor' | 'room' | 'neighbor'}
 */
export function uwDoorMotionMode(link, room, opts = {}) {
  if (!canClaimAnchorCross(link.x, link.y)) return 'neighbor';
  if (linkInDoorwayCorridor(link, room, opts)) return 'corridor';
  // The 56px seam lip may still rebase the world (a stride that landed
  // outside with gridOffset set). It is not the current room's floor —
  // BoundByRoom would yank an idle ally onto the doorway they were near.
  if (!inAnchorPlayArea(link.x, link.y)) return 'neighbor';
  return 'room';
}

/**
 * A seam cross this hero is allowed to take. Pass *this room's* local
 * coords — the cell they occupy, which may not be the world's streaming
 * anchor. An ally left a room behind sits in that cell's coordinates;
 * testing them as an exit of the *anchor* is what stole the camera.
 *
 * @param {{ x: number, y: number, gridOffset?: number }} link
 * @param {object} room
 * @param {object} [ctx]
 */
export function detectOwnedUwDoorCross(link, room, ctx = {}) {
  if (!canClaimAnchorCross(link.x, link.y)) return null;
  return detectUwDoorCross(link, room, ctx);
}

/**
 * One frame of door-aware UW walking, then an owned seam test.
 *
 * @param {{ x: number, y: number, dir?: number, gridOffset?: number }} link
 * @param {object} room
 * @param {number} inputMask
 * @param {object} [ctx]
 * @returns {{ mode: 'corridor' | 'room' | 'neighbor', cross: object | null }}
 */
export function stepUwDoorHero(link, room, inputMask, ctx = {}) {
  const mode = uwDoorMotionMode(link, room, ctx);
  const roomIds =
    ctx.roomIds instanceof Set
      ? ctx.roomIds
      : Array.isArray(ctx.rooms)
        ? new Set(ctx.rooms.map((r) => r.roomId))
        : ctx.roomIds ?? null;

  if (mode === 'neighbor') {
    stepLink(
      link,
      ctx.tileGrid ?? OPEN_UW_GRID,
      inputMask,
      undefined,
      NO_ROOM_BOUNDS,
      ctx.tileOpts ?? {},
    );
    return { mode, cross: null };
  }

  if (mode === 'corridor') {
    stepLink(link, OPEN_UW_GRID, inputMask, undefined, NO_ROOM_BOUNDS);
    clampUwDoorwayPath(link, room, {
      doorState: ctx.doorState ?? null,
      roomIds,
    });
  } else {
    const bounds = ctx.inCellar ? NO_ROOM_BOUNDS : UW_ROOM_BOUNDS;
    stepLink(
      link,
      ctx.tileGrid ?? OPEN_UW_GRID,
      inputMask,
      undefined,
      bounds,
      ctx.tileOpts ?? {},
    );
    if (!ctx.inCellar && ctx.roomClamp !== false) {
      const play = ctx.playOrigin ?? { x: 0, y: HUD_HEIGHT };
      link.x = Math.max(play.x, Math.min(play.x + 256 - 16, link.x));
      link.y = Math.max(play.y, Math.min(play.y + 176 - 16 + 8, link.y));
    }
  }

  return {
    mode,
    cross: detectOwnedUwDoorCross(link, room, ctx),
  };
}

/**
 * Hold a direction until a seam cross, or give up.
 *
 * @param {{ x: number, y: number, dir?: number, gridOffset?: number }} link
 * @param {object} room
 * @param {number} dir
 * @param {object} [ctx]
 * @param {number} [maxFrames]
 */
export function walkUntilUwDoorCross(link, room, dir, ctx = {}, maxFrames = 96) {
  let last = { mode: 'room', cross: null };
  for (let i = 0; i < maxFrames; i += 1) {
    last = stepUwDoorHero(link, room, dir, ctx);
    if (last.cross) return last.cross;
  }
  return null;
}

/**
 * Apply a rebase the way `main.js` does after a UW door cross.
 * @param {{ x: number, y: number }} link
 * @param {{ x: number, y: number, dir: number }} cross
 */
export function applyUwDoorCross(link, cross) {
  link.x = cross.x;
  link.y = cross.y;
  if (cross.dir != null) link.dir = cross.dir;
  return link;
}
