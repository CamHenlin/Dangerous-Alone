/**
 * Continuous Link-centered camera for Phase 18 QoL.
 *
 * Coordinates:
 * - Local object X/Y match the current anchor room (Y includes HUD_HEIGHT).
 * - World play-space: origin at map (0,0) top-left of room $00's play area.
 * - Camera offsets the playfield so Link stays centered except at map rims.
 */

import { DIR, HUD_HEIGHT, OW_BOUNDS } from './collision.js';
import { MAP_H, MAP_W, neighborRoomId, roomCol, roomRow } from './world.js';

export const PLAY_W = 256;
export const PLAY_H = 240 - HUD_HEIGHT; // 176

/** Sentinel `roomId` for Link motion: map-edge clamps only (no screen lips). */
export const CONTINUOUS_OW = -3;

/**
 * @param {number} roomId
 * @returns {{ ox: number, oy: number }} play-space origin of the room
 */
export function roomPlayOrigin(roomId) {
  return {
    ox: roomCol(roomId) * PLAY_W,
    oy: roomRow(roomId) * PLAY_H,
  };
}

/**
 * Local object position → absolute play-space (Y strips HUD).
 * @param {number} roomId
 * @param {number} localX
 * @param {number} localY screen Y including HUD
 */
export function localToWorld(roomId, localX, localY) {
  const { ox, oy } = roomPlayOrigin(roomId);
  return { x: ox + localX, y: oy + (localY - HUD_HEIGHT) };
}

/**
 * Absolute play-space → room + local object coords.
 * @param {number} worldX
 * @param {number} worldPlayY
 */
export function worldToLocal(worldX, worldPlayY) {
  const col = Math.max(0, Math.min(MAP_W - 1, Math.floor(worldX / PLAY_W)));
  const row = Math.max(0, Math.min(MAP_H - 1, Math.floor(worldPlayY / PLAY_H)));
  const roomId = (row << 4) | col;
  return {
    roomId,
    x: worldX - col * PLAY_W,
    y: worldPlayY - row * PLAY_H + HUD_HEIGHT,
  };
}

/**
 * Camera top-left in play-space so Link stays centered when possible.
 * Link is treated as a 16×16 sprite; focus uses his center.
 *
 * @param {number} worldX Link world X (object left)
 * @param {number} worldPlayY Link world play Y (object top in play space)
 * @param {{ cols?: number, rows?: number }} [map]
 * @returns {{ camX: number, camY: number }}
 */
export function cameraForLink(worldX, worldPlayY, map = {}) {
  const cols = map.cols ?? MAP_W;
  const rows = map.rows ?? MAP_H;
  const focusX = worldX + 8;
  const focusY = worldPlayY + 8;
  const maxCamX = Math.max(0, cols * PLAY_W - PLAY_W);
  const maxCamY = Math.max(0, rows * PLAY_H - PLAY_H);
  return {
    camX: clamp(focusX - PLAY_W / 2, 0, maxCamX),
    camY: clamp(focusY - PLAY_H / 2, 0, maxCamY),
  };
}

/**
 * Convert local object coords to view (screen) coords under a camera that is
 * expressed relative to the anchor room's play origin.
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} camLocalX camera X relative to anchor room (may be negative)
 * @param {number} camLocalY camera play-Y relative to anchor room
 */
export function localToView(localX, localY, camLocalX, camLocalY) {
  return {
    x: localX - camLocalX,
    y: localY - camLocalY,
  };
}

/**
 * Camera in anchor-local play space (camY is play-relative, not screen Y).
 * @param {number} roomId
 * @param {number} linkX
 * @param {number} linkY
 * @param {{ cols?: number, rows?: number }} [map]
 */
export function cameraLocalForLink(roomId, linkX, linkY, map = {}) {
  const w = localToWorld(roomId, linkX, linkY);
  const cam = cameraForLink(w.x, w.y, map);
  const origin = roomPlayOrigin(roomId);
  return {
    camX: cam.camX - origin.ox,
    camY: cam.camY - origin.oy,
    worldCamX: cam.camX,
    worldCamY: cam.camY,
  };
}

/**
 * Rooms overlapping the camera view (plus a 1-screen margin for streaming).
 * @param {number} worldCamX
 * @param {number} worldCamY
 * @param {{ cols?: number, rows?: number, margin?: number }} [opts]
 * @returns {number[]}
 */
export function roomsForCamera(worldCamX, worldCamY, opts = {}) {
  const cols = opts.cols ?? MAP_W;
  const rows = opts.rows ?? MAP_H;
  const margin = opts.margin ?? 1;
  const x0 = worldCamX - margin * PLAY_W;
  const y0 = worldCamY - margin * PLAY_H;
  const x1 = worldCamX + PLAY_W + margin * PLAY_W;
  const y1 = worldCamY + PLAY_H + margin * PLAY_H;
  const c0 = Math.max(0, Math.floor(x0 / PLAY_W));
  const r0 = Math.max(0, Math.floor(y0 / PLAY_H));
  const c1 = Math.min(cols - 1, Math.floor((x1 - 1) / PLAY_W));
  const r1 = Math.min(rows - 1, Math.floor((y1 - 1) / PLAY_H));
  /** @type {number[]} */
  const out = [];
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      out.push((r << 4) | c);
    }
  }
  return out;
}

/**
 * True when the axis-aligned rect is completely outside the camera view.
 * @param {{ x: number, y: number, w?: number, h?: number }} rect local object space (Y includes HUD)
 * @param {number} camLocalX
 * @param {number} camLocalY
 * @param {number} [pad]
 */
export function rectFullyOffCamera(rect, camLocalX, camLocalY, pad = 0) {
  const w = rect.w ?? 16;
  const h = rect.h ?? 16;
  const view = localToView(rect.x, rect.y, camLocalX, camLocalY);
  return (
    view.x + w < -pad
    || view.x > PLAY_W + pad
    || view.y + h < HUD_HEIGHT - pad
    || view.y > HUD_HEIGHT + PLAY_H + pad
  );
}

/**
 * Keep overworld Y on the NES walk grid ($?D). Soft-cross used to preserve a
 * seam Y like $3F → $EF, which is off-grid and can wedge Link on a cave mouth
 * where look-ahead is solid and CheckWarps demands nibble $D.
 * @param {number} y
 */
export function snapOwWalkY(y) {
  return (y & ~0x0f) | 0x0d;
}

/**
 * If Link has crossed into a neighboring screen's territory, return the rebase.
 * Crossing uses the play-area seam (x past [0,256) or play-Y past [0,176)).
 *
 * @param {number} roomId
 * @param {number} linkX
 * @param {number} linkY
 * @returns {{ dir: number, nextRoomId: number, x: number, y: number } | null}
 */
export function detectRoomCross(roomId, linkX, linkY) {
  const playY = linkY - HUD_HEIGHT;
  if (linkX < 0) {
    const next = neighborRoomId(roomId, DIR.LEFT);
    if (next != null) {
      return { dir: DIR.LEFT, nextRoomId: next, x: linkX + PLAY_W, y: linkY };
    }
  } else if (linkX >= PLAY_W) {
    const next = neighborRoomId(roomId, DIR.RIGHT);
    if (next != null) {
      return { dir: DIR.RIGHT, nextRoomId: next, x: linkX - PLAY_W, y: linkY };
    }
  }
  if (playY < 0) {
    const next = neighborRoomId(roomId, DIR.UP);
    if (next != null) {
      return { dir: DIR.UP, nextRoomId: next, x: linkX, y: snapOwWalkY(linkY + PLAY_H) };
    }
  } else if (playY >= PLAY_H) {
    const next = neighborRoomId(roomId, DIR.DOWN);
    if (next != null) {
      return { dir: DIR.DOWN, nextRoomId: next, x: linkX, y: snapOwWalkY(linkY - PLAY_H) };
    }
  }
  return null;
}

/**
 * Rebase delta applied to all local positions when the anchor room changes.
 * @param {number} dir exit direction from the old room
 */
export function rebaseDelta(dir) {
  if (dir & DIR.LEFT) return { dx: PLAY_W, dy: 0 };
  if (dir & DIR.RIGHT) return { dx: -PLAY_W, dy: 0 };
  if (dir & DIR.UP) return { dx: 0, dy: PLAY_H };
  if (dir & DIR.DOWN) return { dx: 0, dy: -PLAY_H };
  return { dx: 0, dy: 0 };
}

/**
 * Map-edge movement limit for continuous overworld (no per-screen lips).
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number} roomId
 */
export function hitsMapEdgeLimit(x, y, dir, roomId) {
  const next = neighborRoomId(roomId, dir);
  if (next != null) return false;
  if (dir & DIR.UP) return y <= OW_BOUNDS.top;
  if (dir & DIR.DOWN) return y >= OW_BOUNDS.bottom;
  if (dir & DIR.LEFT) return x <= OW_BOUNDS.left;
  if (dir & DIR.RIGHT) return x >= OW_BOUNDS.right;
  return false;
}

/**
 * Clamp only against absolute map edges. Neighbor sides stay open so Link can
 * walk into the next screen's coordinate space before `detectRoomCross`.
 * @param {number} x
 * @param {number} y
 * @param {number} roomId
 */
export function clampMapEdgePos(x, y, roomId) {
  let minX = -PLAY_W;
  let maxX = PLAY_W * 2 - 1;
  let minY = HUD_HEIGHT - PLAY_H;
  let maxY = HUD_HEIGHT + PLAY_H * 2 - 1;
  if (neighborRoomId(roomId, DIR.LEFT) == null) minX = OW_BOUNDS.left;
  if (neighborRoomId(roomId, DIR.RIGHT) == null) maxX = OW_BOUNDS.right;
  if (neighborRoomId(roomId, DIR.UP) == null) minY = OW_BOUNDS.top;
  if (neighborRoomId(roomId, DIR.DOWN) == null) maxY = OW_BOUNDS.bottom;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * Dungeon rooms that should be drawn as fog (not yet visited).
 * @param {Iterable<number>} candidateRoomIds
 * @param {Set<number>} visited
 * @param {number} currentRoomId
 * @returns {Set<number>}
 */
export function foggedRooms(candidateRoomIds, visited, currentRoomId) {
  const fog = new Set();
  for (const id of candidateRoomIds) {
    if (id === currentRoomId) continue;
    if (!visited.has(id)) fog.add(id);
  }
  return fog;
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
