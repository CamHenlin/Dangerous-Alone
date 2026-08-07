/**
 * Tile sampling across neighboring screens/rooms for continuous traversal.
 */

import {
  DIR,
  HUD_HEIGHT,
  LINK_HOTSPOT_Y,
  OW_FIRST_UNWALKABLE,
  OW_WALKABLE_REMAP,
  UW_FIRST_UNWALKABLE,
  combineVerticalCollidingTiles,
  normalizeOwTile,
  objectHotspotOffset,
  tileAtPlayPixel,
} from './collision.js';
import { PLAY_H, PLAY_W, roomPlayOrigin } from './continuousCamera.js';
import { MAP_H, MAP_W, roomCol, roomRow } from './world.js';

/**
 * @typedef {Map<number, number[][]>} RoomGridMap
 */

/**
 * Sample a tile at absolute play-space coordinates.
 * @param {RoomGridMap} grids
 * @param {number} worldX
 * @param {number} worldPlayY
 * @param {number} [solidFallback] tile id when no grid is loaded
 */
export function tileAtWorld(grids, worldX, worldPlayY, solidFallback = 0x89) {
  const col = Math.floor(worldX / PLAY_W);
  const row = Math.floor(worldPlayY / PLAY_H);
  if (col < 0 || row < 0 || col >= MAP_W || row >= MAP_H) {
    return solidFallback;
  }
  const roomId = (row << 4) | col;
  const grid = grids.get(roomId);
  if (!grid) return solidFallback;
  const localX = worldX - col * PLAY_W;
  const localPlayY = worldPlayY - row * PLAY_H;
  return tileAtPlayPixel(grid, localX, localPlayY);
}

/**
 * Multi-room GetCollidingTileMoving relative to an anchor room's local coords.
 * @param {RoomGridMap} grids
 * @param {number} anchorRoomId
 * @param {number} objX local X
 * @param {number} objY local screen Y (includes HUD)
 * @param {number} dir
 * @param {{ isLink?: boolean, firstUnwalkable?: number, walkableRemap?: readonly number[], solidFallback?: number }} [opts]
 */
export function getObjectCollidingTileMulti(
  grids,
  anchorRoomId,
  objX,
  objY,
  dir,
  opts = {},
) {
  const isLink = opts.isLink !== false;
  const firstUnwalkable = opts.firstUnwalkable ?? OW_FIRST_UNWALKABLE;
  const walkableRemap =
    opts.walkableRemap
    ?? (firstUnwalkable === UW_FIRST_UNWALKABLE ? [] : OW_WALKABLE_REMAP);
  const solidFallback = opts.solidFallback ?? firstUnwalkable;
  const offset = objectHotspotOffset(dir, isLink);
  let sampleY = objY + LINK_HOTSPOT_Y;
  let sampleX = objX;

  const vertical = Boolean(dir & (DIR.UP | DIR.DOWN));
  const horizontal = Boolean(dir & (DIR.LEFT | DIR.RIGHT));

  // Continuous mode: always apply the NES hotspot offset. The single-screen
  // `sampleY < $DD` guard would freeze look-ahead once Y crosses into a
  // southern neighbor's anchor-relative coordinates.
  if (vertical || horizontal) {
    sampleY = vertical ? sampleY + offset : sampleY;
    sampleX = horizontal ? sampleX + offset : sampleX;
  }

  sampleX = Math.floor(sampleX / 8) * 8;
  const origin = roomPlayOrigin(anchorRoomId);
  const worldX = origin.ox + sampleX;
  const worldPlayY = origin.oy + (sampleY - HUD_HEIGHT);
  let tile = tileAtWorld(grids, worldX, worldPlayY, solidFallback);

  if (vertical) {
    const tile2 = tileAtWorld(grids, worldX + 8, worldPlayY, solidFallback);
    tile = combineVerticalCollidingTiles(tile, tile2);
  }

  return normalizeOwTile(tile, firstUnwalkable, walkableRemap);
}

/**
 * @param {RoomGridMap} grids
 * @param {number} anchorRoomId
 * @param {number} objX
 * @param {number} objY
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], solidFallback?: number }} [opts]
 */
export function getLinkCollidingTileMulti(grids, anchorRoomId, objX, objY, dir, opts = {}) {
  return getObjectCollidingTileMulti(grids, anchorRoomId, objX, objY, dir, {
    isLink: true,
    ...opts,
  });
}

/**
 * @param {RoomGridMap} grids
 * @param {number} anchorRoomId
 * @param {number} objX
 * @param {number} objY
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], solidFallback?: number }} [opts]
 */
export function getMonsterCollidingTileMulti(grids, anchorRoomId, objX, objY, dir, opts = {}) {
  return getObjectCollidingTileMulti(grids, anchorRoomId, objX, objY, dir, {
    isLink: false,
    ...opts,
  });
}

/**
 * Standing tile under Link across room seams.
 * @param {RoomGridMap} grids
 * @param {number} anchorRoomId
 * @param {number} objX
 * @param {number} objY
 */
export function standingTileMulti(grids, anchorRoomId, objX, objY) {
  const origin = roomPlayOrigin(anchorRoomId);
  // Do not use `x & $F8` — that clears bit 8 and folds X≥256 back into the
  // anchor screen (272→16), which is exactly the continuous-camera bug.
  const x = Math.floor(objX / 8) * 8;
  const worldX = origin.ox + x;
  const worldPlayY = origin.oy + (objY + 0x0b - HUD_HEIGHT);
  // Missing grids must read as solid — a walkable fallback lets streamed foes
  // sink into trees/rocks when a neighbor pack has not loaded yet.
  return tileAtWorld(grids, worldX, worldPlayY, OW_FIRST_UNWALKABLE);
}

/**
 * Build a RoomGridMap from an iterable of { roomId, tileGrid }.
 * @param {Iterable<{ roomId: number, tileGrid: number[][] }>} rooms
 * @returns {RoomGridMap}
 */
export function roomGridMapFrom(rooms) {
  /** @type {RoomGridMap} */
  const map = new Map();
  for (const r of rooms) {
    if (r?.tileGrid) map.set(r.roomId & 0xff, r.tileGrid);
  }
  return map;
}

/**
 * Neighbor room ids around an anchor (4-dir + self).
 * @param {number} roomId
 * @param {(id: number, dir: number) => number | null} neighborFn
 */
export function adjacentRoomIds(roomId, neighborFn) {
  const ids = new Set([roomId & 0xff]);
  for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
    const n = neighborFn(roomId, dir);
    if (n != null) ids.add(n & 0xff);
  }
  return [...ids];
}

/**
 * True if a room's play rect is fully outside the camera view (world space).
 * @param {number} roomId
 * @param {number} worldCamX
 * @param {number} worldCamY
 * @param {number} [pad]
 */
export function roomFullyOffCamera(roomId, worldCamX, worldCamY, pad = 8) {
  const { ox, oy } = roomPlayOrigin(roomId);
  const viewLeft = worldCamX - pad;
  const viewTop = worldCamY - pad;
  const viewRight = worldCamX + PLAY_W + pad;
  const viewBottom = worldCamY + PLAY_H + pad;
  return (
    ox + PLAY_W < viewLeft
    || ox > viewRight
    || oy + PLAY_H < viewTop
    || oy > viewBottom
  );
}

export { roomCol, roomRow };
