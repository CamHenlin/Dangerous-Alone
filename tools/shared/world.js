import {
  DIR,
  HUD_HEIGHT,
  OW_BOUNDS,
  OW_WARP_TILES,
  tileAtPlayPixel,
} from './collision.js';

export { OW_WARP_TILES };

/** Map size in screens. */
export const MAP_W = 16;
export const MAP_H = 8;

/**
 * PlayerScreenEdgeBounds — transition triggers (Z_07).
 * Index order matches reverse-dir tables: up, down, left, right.
 */
export const SCREEN_EDGE = Object.freeze({
  up: 0x3d,
  down: 0xdd,
  left: 0x00,
  right: 0xf0,
});

/**
 * @param {number} roomId
 */
export function roomRow(roomId) {
  return (roomId >> 4) & 0x0f;
}

/**
 * @param {number} roomId
 */
export function roomCol(roomId) {
  return roomId & 0x0f;
}

/**
 * Neighbor screen, or null if off the map.
 * @param {number} roomId
 * @param {number} dir
 * @returns {number | null}
 */
export function neighborRoomId(roomId, dir) {
  const row = roomRow(roomId);
  const col = roomCol(roomId);
  if (dir & DIR.UP) {
    return row > 0 ? ((row - 1) << 4) | col : null;
  }
  if (dir & DIR.DOWN) {
    return row < MAP_H - 1 ? ((row + 1) << 4) | col : null;
  }
  if (dir & DIR.LEFT) {
    return col > 0 ? (row << 4) | (col - 1) : null;
  }
  if (dir & DIR.RIGHT) {
    return col < MAP_W - 1 ? (row << 4) | (col + 1) : null;
  }
  return null;
}

/**
 * Movement limit: room bounds when no neighbor; else screen-edge (inclusive).
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number} roomId
 */
export function hitsWorldLimit(x, y, dir, roomId) {
  const next = neighborRoomId(roomId, dir);
  if (next == null) {
    if (dir & DIR.UP) return y <= OW_BOUNDS.top;
    if (dir & DIR.DOWN) return y >= OW_BOUNDS.bottom;
    if (dir & DIR.LEFT) return x <= OW_BOUNDS.left;
    if (dir & DIR.RIGHT) return x >= OW_BOUNDS.right;
    return false;
  }
  if (dir & DIR.UP) return y <= SCREEN_EDGE.up;
  if (dir & DIR.DOWN) return y >= SCREEN_EDGE.down;
  if (dir & DIR.LEFT) return x <= SCREEN_EDGE.left;
  if (dir & DIR.RIGHT) return x >= SCREEN_EDGE.right;
  return false;
}

/**
 * Clamp inside limits that still allow reaching a transition edge.
 * @param {number} x
 * @param {number} y
 * @param {number} roomId
 */
export function clampWorldPos(x, y, roomId) {
  const minX = neighborRoomId(roomId, DIR.LEFT) == null ? OW_BOUNDS.left : SCREEN_EDGE.left;
  const maxX = neighborRoomId(roomId, DIR.RIGHT) == null ? OW_BOUNDS.right : SCREEN_EDGE.right;
  const minY = neighborRoomId(roomId, DIR.UP) == null ? OW_BOUNDS.top : SCREEN_EDGE.up;
  const maxY = neighborRoomId(roomId, DIR.DOWN) == null ? OW_BOUNDS.bottom : SCREEN_EDGE.down;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * Arrive positions after a screen scroll (ScrollWorld) completes.
 * Chosen on the NES walk grid (X multiple of 8, Y&7===5) just inside the
 * play area so the next edge crossing can still land with gridOffset===0.
 */
export const TRANSITION_SPAWN = Object.freeze({
  /** Exited north → appear at bottom */
  [DIR.UP]: { y: 0xcd }, // 205, &7===5 (same as OW_BOUNDS.bottom)
  /** Exited south → appear at top */
  [DIR.DOWN]: { y: 0x4d }, // 77, &7===5 (OW_BOUNDS.top / CheckWarps)
  /** Exited west → appear at right */
  [DIR.LEFT]: { x: 0xe0 }, // 224, &7===0
  /** Exited east → appear at left */
  [DIR.RIGHT]: { x: 0x10 }, // 16, &7===0 (OW_BOUNDS.left is $11, off-grid)
});

/**
 * If Link is on a screen edge with matching facing, return transition.
 * The play loop scrolls to the opposite side (see screenScroll.js).
 *
 * Note: do not require gridOffset===0. Hitting the edge often stops movement
 * mid-cell; requiring a clean grid made transitions fail after a few screens.
 * @param {{ x: number, y: number, dir: number, gridOffset?: number }} link
 * @param {number} roomId
 * @returns {{ nextRoomId: number, dir: number, x: number, y: number } | null}
 */
export function checkScreenTransition(link, roomId) {
  const { x, y, dir } = link;

  if ((dir & DIR.UP) && y <= SCREEN_EDGE.up) {
    const next = neighborRoomId(roomId, DIR.UP);
    if (next != null) {
      return { nextRoomId: next, dir: DIR.UP, x, y: TRANSITION_SPAWN[DIR.UP].y };
    }
  }
  if ((dir & DIR.DOWN) && y >= SCREEN_EDGE.down) {
    const next = neighborRoomId(roomId, DIR.DOWN);
    if (next != null) {
      return { nextRoomId: next, dir: DIR.DOWN, x, y: TRANSITION_SPAWN[DIR.DOWN].y };
    }
  }
  if ((dir & DIR.LEFT) && x <= SCREEN_EDGE.left) {
    const next = neighborRoomId(roomId, DIR.LEFT);
    if (next != null) {
      return { nextRoomId: next, dir: DIR.LEFT, x: TRANSITION_SPAWN[DIR.LEFT].x, y };
    }
  }
  if ((dir & DIR.RIGHT) && x >= SCREEN_EDGE.right) {
    const next = neighborRoomId(roomId, DIR.RIGHT);
    if (next != null) {
      return { nextRoomId: next, dir: DIR.RIGHT, x: TRANSITION_SPAWN[DIR.RIGHT].x, y };
    }
  }
  return null;
}

/**
 * Standing tile under Link (GetCollidableTileStill).
 * Samples ObjX masked to 8px, Y + $0B — no +8 center bias.
 * @param {number[][]} tileGrid
 * @param {number} objX
 * @param {number} objY
 */
export function standingTile(tileGrid, objX, objY) {
  const x = objX & 0xf8;
  const yPlay = objY + 0x0b - HUD_HEIGHT;
  return tileAtPlayPixel(tileGrid, x, yPlay);
}

/**
 * OW cave / dungeon entry (CheckWarps / HandleWarpOW).
 * @param {{ x: number, y: number, gridOffset: number }} link
 * @param {number[][]} tileGrid
 * @param {{ caveId?: number }} attrs
 * @param {number} [roomId] current OW room (Level 6 wide mouth is $22)
 * @returns {{ kind: 'level' | 'cave', id: number } | null}
 */
export function checkCaveEntry(link, tileGrid, attrs, roomId = null, opts = {}) {
  // NES: UndergroundExitType | ObjGridOffset ≠ 0 → skip (no "moving" flag).
  if (link.gridOffset !== 0) {
    return null;
  }
  // Continuous OW: prefer a multi-room standing probe so seam X/Y still hit
  // the warp column after soft-cross (single-grid `& $F8` folds X≥256).
  const tile =
    typeof opts.standingTile === 'function'
      ? opts.standingTile(link.x, link.y)
      : standingTile(tileGrid, link.x, link.y);
  if (!OW_WARP_TILES.includes(tile & 0xff)) {
    return null;
  }
  // NES also requires Y low nibble $D and X multiple of $10 (or $8 in room
  // $22). Continuous soft-cross + stair QSpeed $30 can park Link on the mouth
  // at Y=$80/$84 with rock above blocking further steps — standing tile
  // already proves feet are on the warp, so those alignments must still enter
  // (same rationale as the OW $1A waterfall X softlock fix).
  void roomId;
  const caveId = attrs?.caveId ?? 0;
  if (caveId >= 1 && caveId <= 9) {
    return { kind: 'level', id: caveId };
  }
  if (caveId >= 0x10) {
    return { kind: 'cave', id: caveId };
  }
  return null;
}

/**
 * OW return position after leaving a level (from screen exit nibbles).
 * @param {{ exitX: number, exitY: number }} attrs
 */
export function overworldExitSpawn(attrs) {
  const exitX = attrs.exitX & 0x0f;
  const exitY = attrs.exitY & 0x07;
  return {
    x: exitX << 4,
    // exitY is square-row; Y = HUD + row*16 + $D (Level 1: exitY=3 → $7D)
    y: HUD_HEIGHT + (exitY << 4) + 0x0d,
  };
}
