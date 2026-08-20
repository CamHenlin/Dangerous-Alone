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
 * Which map cell this hero is standing in, given the world's streaming anchor
 * and their anchor-local position. Two players can share one `roomId` and
 * still occupy different cells; cameras and HUDs should ask this, not the
 * anchor.
 * @param {number} anchorRoomId
 * @param {number} linkX
 * @param {number} linkY
 */
export function occupyingRoom(anchorRoomId, linkX, linkY) {
  const w = localToWorld(anchorRoomId, linkX, linkY);
  return worldToLocal(w.x, w.y);
}

/**
 * Anchor-local object coords expressed in `toRoomId`'s own local space.
 * Same shift `main.js` uses when a leftover hero walks a neighbour cell.
 * @param {number} anchorRoomId
 * @param {number} toRoomId
 * @param {number} x
 * @param {number} y
 */
export function localInRoom(anchorRoomId, toRoomId, x, y) {
  const a = roomPlayOrigin(anchorRoomId);
  const b = roomPlayOrigin(toRoomId);
  return { x: x + (a.ox - b.ox), y: y + (a.oy - b.oy) };
}

/**
 * Which dungeon cell this hero should walk and collide in.
 *
 * `latchedId` is the last room they officially occupied (spawn, door cross).
 * Keep it while their converted coords still sit in that cell's floor or the
 * seam lip used to finish a stride — otherwise a hard cut (`goRoom`) leaves
 * an ally's latch naming the old cell while their numbers now mean the new
 * one, and `tileAtPlayPixel` clamps those off-grid samples onto the neighbour's
 * west wall (ghost collision in the room you are looking at).
 *
 * @param {number} anchorRoomId
 * @param {number} x
 * @param {number} y
 * @param {number | null | undefined} latchedId
 */
export function resolveUwOccupyingRoomId(anchorRoomId, x, y, latchedId) {
  const here = occupyingRoom(anchorRoomId, x, y).roomId & 0xff;
  if (latchedId == null) return here;
  const latched = latchedId & 0xff;
  if (latched === here) return here;
  const local = localInRoom(anchorRoomId, latched, x, y);
  if (canClaimAnchorCross(local.x, local.y)) return latched;
  return here;
}

/**
 * True when the position is inside the anchor room's 256×176 play rectangle.
 * A hero left behind when someone else walked through a door sits outside it
 * (negative Y after a south rebase, and so on) and must not be treated as
 * still exiting that door — otherwise they steal the world's anchor back.
 * @param {number} linkX
 * @param {number} linkY
 */
export function inAnchorPlayArea(linkX, linkY) {
  const playY = linkY - HUD_HEIGHT;
  return linkX >= 0 && linkX < PLAY_W && playY >= 0 && playY < PLAY_H;
}

/**
 * How far past a seam a hero may still rebase the world's anchor.
 *
 * `detectUwDoorCross` fires on the first pixel outside the play rectangle,
 * but a stride can land there with `gridOffset !== 0` and only become a
 * real exit on a later frame. The NES door cavity is deeper than one tile
 * (east `$CF→$100` is 49px; south `$BD` to the seam is 51px). A 16px lip
 * matched the `$F0` edge exactly — a hero standing just inside it (`x=$ED`)
 * is at `x=$-13` after an ally's east rebase, drops DoorwayDir, and the
 * solid door tiles freeze them in the opening. Anyone a full cell away
 * (the reverse-cross trap) is still well outside this.
 */
export const ANCHOR_SEAM_LIP = 56;

/**
 * True when this hero may rebase the world's streaming anchor.
 *
 * Inside the play rectangle: they may walk out this frame. On the seam lip:
 * they already stepped out mid-stride and the cross is still theirs. Deep in
 * a neighbour: they live there; treating their position as an exit of the
 * *current* room is what made one camera chase the other.
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} [lip]
 */
export function canClaimAnchorCross(linkX, linkY, lip = ANCHOR_SEAM_LIP) {
  if (inAnchorPlayArea(linkX, linkY)) return true;
  const playY = linkY - HUD_HEIGHT;
  if (linkX >= -lip && linkX < 0 && playY >= 0 && playY < PLAY_H) return true;
  if (linkX >= PLAY_W && linkX < PLAY_W + lip && playY >= 0 && playY < PLAY_H) return true;
  if (linkX >= 0 && linkX < PLAY_W && playY >= -lip && playY < 0) return true;
  if (linkX >= 0 && linkX < PLAY_W && playY >= PLAY_H && playY < PLAY_H + lip) return true;
  return false;
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

/** The play map is 16 rooms across and 8 down, overworld and underworld alike. */
export const PLAY_MAP = Object.freeze({ cols: 16, rows: 8 });

/**
 * Negate without producing `-0`. It draws identically, but it serialises
 * differently from `0`, which would show up as a phantom golden-hash mismatch.
 * @param {number} v
 */
const negate = (v) => (v === 0 ? 0 : -v);

/**
 * @typedef {object} CameraSolution
 * @property {number} fieldX playfield offset (the camera, negated and rounded)
 * @property {number} fieldY
 * @property {boolean} tracks false when the world camera should be left alone
 * @property {number} camLocalX camera relative to the anchor room
 * @property {number} camLocalY
 * @property {number} worldCamX camera in absolute play space
 * @property {number} worldCamY
 * @property {'none' | 'overworld' | 'dungeon'} layout stream to re-lay out
 */

/**
 * Where the playfield sits this frame — the whole camera policy, with no
 * renderer attached so each player's view can solve its own (Phase 23).
 *
 * Three regimes:
 * - A cave draws at the origin and leaves the world camera untouched, because
 *   there is no map to be positioned on.
 * - A cellar sits on the dungeon grid but plays like a cave, so it pins to its
 *   own room; otherwise Link on a side ladder peeks into the neighbours.
 * - Everything else follows Link, clamped at the map rim.
 *
 * @param {object} opts
 * @param {string} opts.mode 'overworld' | 'dungeon' | 'cave'
 * @param {number} opts.roomId anchor room
 * @param {number} opts.linkX
 * @param {number} opts.linkY
 * @param {boolean} [opts.pinned] the room plays like a cave (a cellar)
 * @param {{ cols?: number, rows?: number }} [opts.map]
 * @returns {CameraSolution}
 */
/**
 * Where one player is looking: the play field's offset inside the room grid
 * (`camLocal*`, what on-screen tests are measured against) and the same point
 * in world pixels (`world*`, what room streaming is measured against).
 *
 * One per player rather than one per game — `adoptCameraSolution()` writes a
 * fresh `solvePlayCamera()` result into it each frame.
 */
export function createCamera() {
  return { camLocalX: 0, camLocalY: 0, worldCamX: 0, worldCamY: 0 };
}

/**
 * Move a camera to a solved position, leaving the solution's render fields
 * (`fieldX`, `layout`) to the caller.
 * @param {ReturnType<createCamera>} cam mutated
 * @param {CameraSolution} solution
 */
export function adoptCameraSolution(cam, solution) {
  cam.camLocalX = solution.camLocalX;
  cam.camLocalY = solution.camLocalY;
  cam.worldCamX = solution.worldCamX;
  cam.worldCamY = solution.worldCamY;
  return cam;
}

export function solvePlayCamera({
  mode,
  roomId,
  linkX,
  linkY,
  pinned = false,
  map = PLAY_MAP,
}) {
  if (mode === 'cave') {
    return {
      fieldX: 0,
      fieldY: 0,
      tracks: false,
      camLocalX: 0,
      camLocalY: 0,
      worldCamX: 0,
      worldCamY: 0,
      layout: 'none',
    };
  }
  if (pinned) {
    const origin = roomPlayOrigin(roomId);
    return {
      fieldX: 0,
      fieldY: 0,
      tracks: true,
      camLocalX: 0,
      camLocalY: 0,
      worldCamX: origin.ox,
      worldCamY: origin.oy,
      layout: 'dungeon',
    };
  }
  const cam = cameraLocalForLink(roomId, linkX, linkY, map);
  /** @type {'none' | 'overworld' | 'dungeon'} */
  let layout = 'none';
  if (mode === 'overworld') layout = 'overworld';
  else if (mode === 'dungeon') layout = 'dungeon';
  return {
    fieldX: negate(Math.round(cam.camX)),
    fieldY: negate(Math.round(cam.camY)),
    tracks: true,
    camLocalX: cam.camX,
    camLocalY: cam.camY,
    worldCamX: cam.worldCamX,
    worldCamY: cam.worldCamY,
    layout,
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
 * Rooms any of the cameras can see (plus the same margin).
 * @param {Iterable<{ worldCamX?: number, worldCamY?: number }>} cameras
 * @param {{ cols?: number, rows?: number, margin?: number }} [opts]
 */
export function roomsForCameras(cameras, opts = {}) {
  const seen = new Set();
  /** @type {number[]} */
  const out = [];
  for (const cam of cameras ?? []) {
    for (const id of roomsForCamera(cam.worldCamX ?? 0, cam.worldCamY ?? 0, opts)) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
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
 * True when no camera in the list can see the rect.
 *
 * One camera is the old test. Several is split screen: a foe on player two's
 * half of the world must not be culled just because player one walked away.
 *
 * @param {{ x: number, y: number, w?: number, h?: number }} rect
 * @param {Iterable<{ camLocalX?: number, camLocalY?: number }>} cameras
 * @param {number} [pad]
 */
export function rectFullyOffEveryCamera(rect, cameras, pad = 0) {
  const list = [...(cameras ?? [])];
  if (!list.length) return rectFullyOffCamera(rect, 0, 0, pad);
  return list.every((c) => rectFullyOffCamera(rect, c.camLocalX ?? 0, c.camLocalY ?? 0, pad));
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
 * Shift from `fromRoom`'s local space into `toRoom`'s. A one-step neighbor
 * matches {@link rebaseDelta}; a hero leaving a cell that is not the world's
 * streaming anchor needs the full origin difference.
 * @param {number} fromRoomId
 * @param {number} toRoomId
 */
export function rebaseDeltaToRoom(fromRoomId, toRoomId) {
  const a = roomPlayOrigin(fromRoomId);
  const b = roomPlayOrigin(toRoomId);
  return { dx: a.ox - b.ox, dy: a.oy - b.oy };
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
