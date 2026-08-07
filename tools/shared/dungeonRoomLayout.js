/**
 * NES underworld room composition (LayOutRoom):
 * FillTileMap → FillWalls → LayOutDoors → LayoutUWFloor.
 *
 * Play area is 22×32 tiles (column-major in NES RAM @ $6530).
 * We expose row-major grids for the rest of the codebase.
 */

import { composeCellarRoomTiles, isCellarRoom } from './dungeonCellar.js';
import { roomToTileGrid } from './dungeons.js';

const DEFAULT_PRIMARY = Object.freeze([0xb0, 0x74, 0x94, 0xb4, 0x70, 0x68, 0xf4, 0x24]);

export const PLAY_ROWS = 22;
export const PLAY_COLS = 32;
export const FLOOR_ORIGIN = Object.freeze({ col: 4, row: 4 });
export const FLOOR_TILES_W = 24;
export const FLOOR_TILES_H = 14;

/** FillTileMap UW brick. */
export const UW_FILL_TILE = 0xf6;

/**
 * WallTileList from Z_05.asm ($4E bytes).
 * 0 = end of top-wall column (gap / advance).
 */
export const WALL_TILE_LIST = Object.freeze([
  0xe0, 0xf5, 0xf5, 0xf5, 0xf5, 0xb8, 0xf5, 0xd4, 0xf5, 0xf5, 0xf5, 0xc4, 0xde, 0xde,
  0xbc, 0xc8, 0xde, 0xbc, 0xde, 0xde, 0xf5, 0xdc, 0xc4, 0xde, 0xc8, 0xde, 0xbc, 0xc8,
  0xde, 0xde, 0xf5, 0xdc, 0xdc, 0x00, 0xc0, 0xd0, 0xdc, 0x00, 0xf5, 0xdc, 0xcc, 0x00,
  0xf5, 0xdc, 0xdc, 0x00, 0xf5, 0xcc, 0xd0, 0x00, 0xf5, 0xdc, 0xdc, 0x00, 0xc0, 0xd0,
  0xdc, 0x00, 0xf5, 0xdc, 0xcc, 0x00, 0xf5, 0xdc, 0xdc, 0x00, 0xd8, 0xcc, 0xd0, 0x00,
  0xf5, 0xdc, 0xdc, 0x00, 0xf5, 0xdc, 0xdc, 0x00,
]);

/** DoorFaceTiles{E,W,S,N} — 5 faces × 12 tiles. */
export const DOOR_FACE_TILES = Object.freeze({
  east: Object.freeze([
    0x88, 0x74, 0x8a, 0x24, 0x87, 0x87, 0x75, 0x89, 0x24, 0x8b, 0x87, 0x87, // open
    0x88, 0xa4, 0x8a, 0xa6, 0x87, 0x87, 0xa5, 0x89, 0xa7, 0x8b, 0x87, 0x87, // key
    0x88, 0xac, 0x8a, 0xae, 0x87, 0x87, 0xad, 0x89, 0xaf, 0x8b, 0x87, 0x87, // shutter
    0xdf, 0xdf, 0xdf, 0xdf, 0xf5, 0xf5, 0xdf, 0xdf, 0xdf, 0xdf, 0xf5, 0xf5, // bomb closed
    0xdf, 0x24, 0xdf, 0x92, 0xf5, 0xf5, 0x24, 0xdf, 0x93, 0xdf, 0xf5, 0xf5, // bomb open
  ]),
  west: Object.freeze([
    0x82, 0x82, 0x83, 0x24, 0x85, 0x76, 0x82, 0x82, 0x24, 0x84, 0x77, 0x86,
    0x82, 0x82, 0x83, 0xa0, 0x85, 0xa2, 0x82, 0x82, 0xa1, 0x84, 0xa3, 0x86,
    0x82, 0x82, 0x83, 0xac, 0x85, 0xae, 0x82, 0x82, 0xad, 0x84, 0xaf, 0x86,
    0xf5, 0xf5, 0xde, 0xde, 0xde, 0xde, 0xf5, 0xf5, 0xde, 0xde, 0xde, 0xde,
    0xf5, 0xf5, 0xde, 0x90, 0xde, 0x24, 0xf5, 0xf5, 0x91, 0xde, 0x24, 0xde,
  ]),
  south: Object.freeze([
    0x7e, 0x7f, 0x7d, 0x76, 0x24, 0x7d, 0x74, 0x24, 0x7d, 0x80, 0x81, 0x7d,
    0x7e, 0x7f, 0x7d, 0x9c, 0x9d, 0x7d, 0x9e, 0x9f, 0x7d, 0x80, 0x81, 0x7d,
    0x7e, 0x7f, 0x7d, 0xa8, 0xa9, 0x7d, 0xaa, 0xab, 0x7d, 0x80, 0x81, 0x7d,
    0xdd, 0xdd, 0xf5, 0xdd, 0xdd, 0xf5, 0xdd, 0xdd, 0xf5, 0xdd, 0xdd, 0xf5,
    0xdd, 0xdd, 0xf5, 0x24, 0x8e, 0xf5, 0x24, 0x8f, 0xf5, 0xdd, 0xdd, 0xf5,
  ]),
  north: Object.freeze([
    0x78, 0x79, 0x7a, 0x78, 0x24, 0x77, 0x78, 0x24, 0x75, 0x78, 0x7b, 0x7c,
    0x78, 0x79, 0x7a, 0x78, 0x98, 0x99, 0x78, 0x9a, 0x9b, 0x78, 0x7b, 0x7c,
    0x78, 0x79, 0x7a, 0x78, 0xa8, 0xa9, 0x78, 0xaa, 0xab, 0x78, 0x7b, 0x7c,
    0xf5, 0xdc, 0xdc, 0xf5, 0xdc, 0xdc, 0xf5, 0xdc, 0xdc, 0xf5, 0xdc, 0xdc,
    0xf5, 0xdc, 0xdc, 0xf5, 0x8c, 0x24, 0xf5, 0x8d, 0x24, 0xf5, 0xdc, 0xdc,
  ]),
});

/** Door face base address offsets from PlayAreaTiles ($6530). */
const DOOR_DST_OFFSET = Object.freeze({
  east: 0x271, // $67A1
  west: 0x01f, // $654F
  south: 0x146, // $6676
  north: 0x135, // $6665
});

const DOOR_SIDES = Object.freeze(['east', 'west', 'south', 'north']);
const DOOR_COL_COUNT = Object.freeze({ east: 3, west: 3, south: 2, north: 2 });
const DOOR_ROW_COUNT = Object.freeze({ east: 2, west: 2, south: 3, north: 3 });
const DOOR_SECOND_HALF = Object.freeze({ east: 2, west: 2, south: 0x2c, north: 0x2c });

/**
 * @param {number} col
 * @param {number} row
 */
export function cmIndex(col, row) {
  return col * PLAY_ROWS + row;
}

/**
 * @param {Uint8Array} cm column-major play area
 * @returns {number[][]}
 */
export function columnMajorToRowMajor(cm) {
  /** @type {number[][]} */
  const grid = Array.from({ length: PLAY_ROWS }, () => Array(PLAY_COLS).fill(0));
  for (let col = 0; col < PLAY_COLS; col += 1) {
    for (let row = 0; row < PLAY_ROWS; row += 1) {
      grid[row][col] = cm[cmIndex(col, row)];
    }
  }
  return grid;
}

/**
 * FillWalls — left half from WallTileList, then 180° rotate to right half.
 * @param {Uint8Array} cm
 */
export function fillWalls(cm) {
  let listIdx = 0;
  let top = 0x17; // $6547
  let bottom = 0x2a; // $655A
  let pairs = 0x0a;

  while (listIdx < WALL_TILE_LIST.length) {
    const tile = WALL_TILE_LIST[listIdx];
    if (tile === 0) {
      pairs = 0x13;
      top += 0x13;
      bottom += 0x19;
      listIdx += 1;
      continue;
    }

    cm[top] = tile;
    cm[bottom] = tile;
    if (tile !== 0xde && tile < 0xe2) {
      cm[bottom] = (tile + 1) & 0xff;
    }

    pairs -= 1;
    if (pairs !== 0) {
      top += 1;
      bottom -= 1;
    } else {
      pairs = 0x0a;
      top += 0x0d;
      bottom += 0x1f;
    }
    listIdx += 1;
  }

  // Rotate left half 180° into the right half (NES @LoopRotate).
  let src = 0x00; // $6530 — wait ASM uses $6530+0 = start of copy from $6630?
  // ASM: source $6530 → actually LDA #$30 / #$65 → $6530
  // Destination $67EF
  // Stop when source reaches $6690
  src = 0x00;
  let dst = 0x2bf; // $67EF - $6530 = $2BF
  const srcEnd = 0x160; // $6690 - $6530

  while (src < srcEnd) {
    let tile = cm[src];
    let out = tile;
    if (tile === 0xdd) {
      out = 0xdc;
    } else if (tile < 0xe0) {
      if (tile < 0xdc) {
        out = (tile + 2) & 0xff;
      } else {
        out = (tile + 1) & 0xff;
      }
    }
    cm[dst] = out;
    dst -= 1;
    src += 1;
  }
}

/**
 * Map door type code + open flag → face set index 0..4 (into DoorFaceTiles*).
 * @param {number} code 0–7
 * @param {boolean} opened
 */
export function doorFaceIndex(code, opened) {
  const dt = code & 7;
  // Walls / false walls: no door face overlay (FillWalls already drew solid).
  if (dt >= 1 && dt <= 3) return -1;

  // Provisional face (PF) then DF mapping from LayOutDoors comments.
  let pf;
  if (dt === 0) pf = 4; // open
  else if (dt === 4) pf = opened ? 9 : 8; // bombable
  else if (dt === 5 || dt === 6) pf = opened ? 4 : 5; // key
  else if (dt === 7) pf = opened ? 4 : 7; // shutter
  else pf = 4;

  let y = pf - 3;
  if (y >= 3) y -= 1;
  // y is 1..5
  return Math.max(0, Math.min(4, y - 1));
}

/**
 * Whether this door type should be treated as opened for face selection.
 * @param {{ code?: number, type?: string }} door
 * @param {boolean} markedOpen from DoorState
 */
export function doorIsOpenForFace(door, markedOpen) {
  const t = door?.type;
  if (t === 'open' || t === 'passage' || t === 'wall_or_pass') return true;
  if (t === 'wall') return false;
  return Boolean(markedOpen);
}

/**
 * Lay one door face into column-major play area.
 * @param {Uint8Array} cm
 * @param {'north'|'south'|'east'|'west'} side
 * @param {number} faceIdx 0..4
 */
export function layoutDoorFace(cm, side, faceIdx) {
  const tiles = DOOR_FACE_TILES[side];
  if (!tiles || faceIdx < 0) return;
  const srcBase = faceIdx * 12;
  const dstBase = DOOR_DST_OFFSET[side];
  const cols = DOOR_COL_COUNT[side];
  const rows = DOOR_ROW_COUNT[side];
  const horizontal = side === 'east' || side === 'west';

  for (let half = 0; half < 2; half += 1) {
    let dst = half === 0 ? dstBase : dstBase + DOOR_SECOND_HALF[side];
    let src = half === 0 ? srcBase : srcBase + 6;
    for (let c = 0; c < cols; c += 1) {
      for (let x = rows - 1; x >= 0; x -= 1) {
        cm[dst] = tiles[src] ?? 0xf5;
        src += 1;
        // NextDoorTileOffsets: [$14, $01, $01] indexed by X.
        dst += x === 0 ? 0x14 : 0x01;
        if (x === 0 && horizontal) dst += 1;
      }
    }
  }
}

/**
 * @param {Uint8Array} cm
 * @param {object} doors room.doors
 * @param {ReadonlySet<string> | Iterable<string>} [openSides] side names open
 */
export function layoutDoors(cm, doors, openSides = []) {
  const open = openSides instanceof Set ? openSides : new Set(openSides);
  for (const side of DOOR_SIDES) {
    const door = doors?.[side];
    if (!door) continue;
    const code = door.code ?? 0;
    const opened = doorIsOpenForFace(door, open.has(side));
    const face = doorFaceIndex(code, opened);
    if (face < 0) continue;
    layoutDoorFace(cm, side, face);
  }
}

/**
 * Place 14×24 floor tiles at NES floor origin (col 4, row 4).
 * @param {Uint8Array} cm
 * @param {number[][]} floor
 */
export function blitFloor(cm, floor) {
  const h = Math.min(FLOOR_TILES_H, floor.length);
  const w = Math.min(FLOOR_TILES_W, floor[0]?.length ?? 0);
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      cm[cmIndex(FLOOR_ORIGIN.col + c, FLOOR_ORIGIN.row + r)] = floor[r][c] & 0xff;
    }
  }
}

/**
 * Compose a full UW room play-area tile grid (22×32 row-major).
 *
 * @param {object} room
 * @param {object} [opts]
 * @param {readonly number[]} [opts.primarySquares]
 * @param {Iterable<string>} [opts.openSides] 'north'|'south'|'east'|'west'
 * @returns {number[][]}
 */
export function composeDungeonRoomTiles(room, opts = {}) {
  // Cellars ($3E/$3F): OW-style LayoutRoomOrCaveOW — full play area, no UW walls/doors.
  if (isCellarRoom(room, null) || room?.layoutId === 0x3e || room?.layoutId === 0x3f) {
    return composeCellarRoomTiles(room.layoutId);
  }
  const primary = opts.primarySquares ?? DEFAULT_PRIMARY;
  const cm = new Uint8Array(PLAY_ROWS * PLAY_COLS);
  cm.fill(UW_FILL_TILE);
  fillWalls(cm);
  layoutDoors(cm, room?.doors, opts.openSides ?? []);
  const floor = roomToTileGrid(room, [...primary]);
  blitFloor(cm, floor);
  return columnMajorToRowMajor(cm);
}

/**
 * Open sides for a room from DoorState + door types.
 * @param {object} room
 * @param {{ open?: Set<string> } | null} doorState
 * @returns {string[]}
 */
export function openSidesForRoom(room, doorState) {
  /** @type {string[]} */
  const sides = [];
  if (!room?.doors) return sides;
  for (const side of DOOR_SIDES) {
    const door = room.doors[side];
    if (!door) continue;
    const key = `${room.roomId}:${side}`;
    const marked = Boolean(doorState?.open?.has(key));
    if (doorIsOpenForFace(door, marked)) sides.push(side);
  }
  return sides;
}

/**
 * Cells that should draw above Link in a doorway: wall mass / lintel above the
 * opening, plus the solid seam columns between paired E/W door faces. Walk-height
 * jambs beside `$24` cavities are omitted so they do not clip him in the opening.
 * @param {number} row
 * @param {number} col
 */
export function isDoorOcclusionCell(row, col) {
  // North door: lintel row + wall above (cols 14–17).
  if (col >= 14 && col <= 17 && row <= 1) return true;
  // South door: outer wall only (r20+). The inner lip (r18) must stay under
  // Link once he walks north into the room — overlaying it left a bar over
  // his head after leaving the door.
  if (col >= 14 && col <= 17 && row >= 20) return true;
  // West door band (cols 0–3): everything above the cavity, plus the seam/outer
  // jamb columns (0–1) through the passage so the wall middle fully hides Link.
  // Inner jamb (col 3) at walk height stays clear so the opening does not clip.
  if (col >= 0 && col <= 3) {
    if (row <= 9) return true;
    if (col <= 1 && row >= 10 && row <= 12) return true;
  }
  // East door band (cols 28–31): mirror (outer jamb col 30 + seam col 31).
  if (col >= 28 && col <= 31) {
    if (row <= 9) return true;
    if (col >= 30 && row >= 10 && row <= 12) return true;
  }
  return false;
}

/** @deprecated use isDoorOcclusionCell */
export function isDoorLintelCell(side, row, col) {
  if (side === 'north') return isDoorOcclusionCell(row, col) && col >= 14 && col <= 17 && row <= 1;
  if (side === 'south') return isDoorOcclusionCell(row, col) && col >= 14 && col <= 17 && row >= 18;
  if (side === 'west') return isDoorOcclusionCell(row, col) && col >= 0 && col <= 3;
  if (side === 'east') return isDoorOcclusionCell(row, col) && col >= 28 && col <= 31;
  return false;
}

/**
 * Room tiles that occlude Link in doorways (lintels + wall above + E/W seam).
 * Empty cells are 0. Built from the full wall/door compose so brick above the
 * opening matches the background.
 * @param {object} room
 * @param {object} [opts]
 * @param {Iterable<string>} [opts.openSides]
 * @param {readonly number[]} [opts.primarySquares]
 * @returns {number[][]}
 */
export function composeDoorFrameTiles(room, opts = {}) {
  if (isCellarRoom(room, null) || room?.layoutId === 0x3e || room?.layoutId === 0x3f) {
    return Array.from({ length: PLAY_ROWS }, () => Array(PLAY_COLS).fill(0));
  }
  const full = composeDungeonRoomTiles(room, opts);
  /** @type {number[][]} */
  const grid = Array.from({ length: PLAY_ROWS }, () => Array(PLAY_COLS).fill(0));
  for (let row = 0; row < PLAY_ROWS; row += 1) {
    for (let col = 0; col < PLAY_COLS; col += 1) {
      if (isDoorOcclusionCell(row, col)) grid[row][col] = full[row][col] & 0xff;
    }
  }
  return grid;
}
