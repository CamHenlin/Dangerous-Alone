import { DIR } from './collision.js';
import { SQUARES_H, SQUARES_W, squareToTiles } from './overworld.js';
import { standingTile } from './world.js';

const PLAY_ROWS = 22;
const PLAY_COLS = 32;

/** UW stairs primary tiles (and consecutive WriteSquareUW siblings). */
export const STAIRS_TILES = Object.freeze(new Set([0x70, 0x71, 0x72, 0x73]));

/**
 * RoomLayoutUWCellar0 / 1 + ColumnHeapUWCellar (Z_05 @ $A3B4 / PRG $163B4).
 * Descriptors use table 0 only (PatchColumnDirectoryForCellar).
 */
export const ROOM_LAYOUT_UW_CELLAR_0 = Object.freeze([
  0x04, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x04, 0x04,
]);
export const ROOM_LAYOUT_UW_CELLAR_1 = Object.freeze([
  0x04, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0x03, 0x03, 0x03, 0x02, 0x03, 0x03, 0x04, 0x04,
]);
export const COLUMN_HEAP_UW_CELLAR = Object.freeze([
  0x82, 0x43, 0x43, 0x43, 0x02, 0x0c, 0x43, 0x80, 0x41, 0x41, 0x41, 0x41, 0x43, 0x82, 0x43, 0x42,
  0x0c, 0x01, 0x41, 0x43, 0x82, 0x43, 0x42, 0x0c, 0x03, 0x02, 0x0c, 0x43, 0x82, 0x43, 0x43, 0x43,
  0x43, 0x43,
]);

/** SecondarySquaresOW (PRG $169B4) — cellar squares are all type-3 (< $10). */
export const SECONDARY_SQUARES_OW = Object.freeze([
  0x24, 0x24, 0x24, 0x24, 0x6f, 0x6f, 0x6f, 0x6f, 0xf3, 0xf3, 0xf3, 0xf3, 0xfa, 0xfa, 0xfa, 0xfa,
  0x98, 0x95, 0x26, 0x26, 0x90, 0x95, 0x90, 0x95, 0x8f, 0x90, 0x8f, 0x90, 0x95, 0x96, 0x95, 0x96,
  0x8e, 0x93, 0x90, 0x95, 0x90, 0x95, 0x92, 0x97, 0x74, 0x74, 0x75, 0x75, 0x76, 0x77, 0x76, 0x77,
  0xf3, 0x24, 0xf3, 0x24, 0x24, 0x24, 0x24, 0x24, 0x26, 0x26, 0x26, 0x26, 0x89, 0x88, 0x8b, 0x88,
]);

/** NES CellarKeeseXs / CellarKeeseYs (mode 9 → 4 blue keese). */
export const CELLAR_KEESE_XS = Object.freeze([0x20, 0x60, 0x90, 0xd0]);
export const CELLAR_KEESE_YS = Object.freeze([0x9d, 0x5d, 0x7d, 0x9d]);
export const CELLAR_KEESE_TYPE = 0x1b;

/** NES CellarLadderXs. */
export const CELLAR_LADDER_XS = Object.freeze([0x30, 0xc0]);

/** InitMode9_EnterCellar places Link at Y=$41; WalkCellar stops at $5D. */
export const CELLAR_ENTER_Y = 0x41;
export const CELLAR_STAND_Y = 0x5d;

/**
 * Soft ceiling while climbing out — NES CheckSubroom needs ObjY < $40 (into the
 * HUD band). Play code must not clamp cellar Y to HUD_HEIGHT ($40).
 */
export const CELLAR_EXIT_MIN_Y = 0x30;

/**
 * Decode one ColumnHeapUWCellar column (11 square indices).
 * @param {number} columnIndex 0..4
 * @param {readonly number[]} [heap]
 */
export function decodeCellarColumn(columnIndex, heap = COLUMN_HEAP_UW_CELLAR) {
  let seen = 0;
  let start = -1;
  for (let i = 0; i < heap.length; i += 1) {
    if (heap[i] & 0x80) {
      if (seen === columnIndex) {
        start = i;
        break;
      }
      seen += 1;
    }
  }
  if (start < 0) {
    throw new Error(`Cellar column ${columnIndex} not found (${seen} starts)`);
  }
  /** @type {number[]} */
  const squares = [];
  let p = start;
  let repeatFlag = 0;
  while (squares.length < SQUARES_H) {
    const byte = heap[p];
    squares.push(byte & 0x3f);
    if (byte & 0x40) {
      repeatFlag ^= 0x40;
      if (repeatFlag === 0) p += 1;
    } else {
      p += 1;
    }
  }
  return squares;
}

/**
 * 11×16 OW-style square grid for cellar layout $3E / $3F.
 * @param {number} layoutId
 */
export function decodeCellarSquares(layoutId) {
  const descriptors =
    (layoutId & 0xff) === 0x3e ? ROOM_LAYOUT_UW_CELLAR_0 : ROOM_LAYOUT_UW_CELLAR_1;
  /** @type {number[][]} */
  const squares = Array.from({ length: SQUARES_H }, () => Array(SQUARES_W).fill(0));
  for (let col = 0; col < SQUARES_W; col += 1) {
    const colSquares = decodeCellarColumn(descriptors[col] & 0x0f);
    for (let row = 0; row < SQUARES_H; row += 1) {
      squares[row][col] = colSquares[row];
    }
  }
  return squares;
}

/**
 * LayoutRoomOrCaveOW for UW cellars — full 22×32 play area (no FillWalls/doors).
 * Browser-safe (no Node Buffer).
 * @param {number} layoutId $3E tunnel / $3F treasure
 * @returns {number[][]}
 */
export function composeCellarRoomTiles(layoutId) {
  const squares = decodeCellarSquares(layoutId);
  const secondary = SECONDARY_SQUARES_OW;
  const primary = /** @type {number[]} */ ([]);
  const secrets = /** @type {number[]} */ ([]);
  /** @type {number[][]} */
  const grid = Array.from({ length: PLAY_ROWS }, () => Array(PLAY_COLS).fill(0x24));
  for (let sc = 0; sc < SQUARES_W; sc += 1) {
    for (let sr = 0; sr < SQUARES_H; sr += 1) {
      const tiles = squareToTiles(squares[sr][sc], primary, secondary, secrets);
      const col = sc * 2;
      const row = sr * 2;
      // Secondary square $02 is CHR $F3 (blank). Visually black floor, but UW
      // collision treats ≥$78 as solid — normalize to walkable floor $24.
      const [ul, ll, ur, lr] = tiles.map(cellarFloorTile);
      grid[row][col] = ul;
      grid[row + 1][col] = ll;
      grid[row][col + 1] = ur;
      grid[row + 1][col + 1] = lr;
    }
  }
  return grid;
}

/** @param {number} tile */
function cellarFloorTile(tile) {
  return (tile & 0xff) === 0xf3 ? 0x24 : tile & 0xff;
}

/**
 * Spawn descriptors for mode-9 cellar keese (screen-absolute).
 * @returns {{ objType: number, x: number, y: number, slotIndex: number }[]}
 */
export function cellarKeeseSpawns() {
  return CELLAR_KEESE_XS.map((x, i) => ({
    objType: CELLAR_KEESE_TYPE,
    x,
    y: CELLAR_KEESE_YS[i],
    slotIndex: i + 1,
  }));
}

/**
 * Cellar layouts $3E / $3F — attrs A/B are destination room ids.
 * @param {object} room
 * @param {{ cellarRooms?: number[] }} level
 */
export function isCellarRoom(room, level) {
  if (!room) return false;
  if (level?.cellarRooms?.includes(room.roomId)) return true;
  return room.layoutId === 0x3e || room.layoutId === 0x3f;
}

/**
 * True when `roomId` is a cellar on this level (list membership or layout).
 * @param {number} roomId
 * @param {{ cellarRooms?: number[], rooms?: { roomId: number, layoutId?: number }[] }} level
 */
export function isCellarRoomId(roomId, level) {
  const id = roomId & 0xff;
  if (level?.cellarRooms?.includes(id)) return true;
  const room = level?.rooms?.find((r) => (r.roomId & 0xff) === id);
  return isCellarRoom(room, level);
}

/**
 * Rooms the continuous UW camera may stream. Cellars live on the map grid but
 * are entered only via stairs — never show them as map-adjacent neighbors, and
 * when inside a cellar never stream its top-down neighbors.
 *
 * @param {number[]} candidateRoomIds
 * @param {number} currentRoomId
 * @param {{ cellarRooms?: number[], rooms?: { roomId: number, layoutId?: number }[] }} level
 * @returns {number[]}
 */
export function streamableUwRooms(candidateRoomIds, currentRoomId, level) {
  const current = currentRoomId & 0xff;
  if (isCellarRoomId(current, level)) return [current];
  return candidateRoomIds.filter((id) => {
    const rid = id & 0xff;
    return rid === current || !isCellarRoomId(rid, level);
  });
}

/**
 * @param {object} room decoded with attrsA/attrsB or cellarExits
 * @returns {{ left: number, right: number } | null}
 */
export function cellarExitsFor(room) {
  if (room?.cellarExits) return room.cellarExits;
  if (room?.attrsA != null && room?.attrsB != null) {
    return { left: room.attrsA & 0xff, right: room.attrsB & 0xff };
  }
  return null;
}

/**
 * Spawn coords after leaving a cellar (LevelBlockAttrsC packing).
 * NES screen-absolute (HUD included); matches CheckSubroom unpack.
 * @param {number} attrsC
 */
export function cellarReturnSpawn(attrsC) {
  const nesX = attrsC & 0xf0;
  const nesY = ((attrsC & 0x0f) << 4) | 0x0d;
  return {
    x: nesX,
    y: nesY,
    dir: DIR.DOWN,
  };
}

/**
 * NES UW stairs warp gate: X multiple of $10, Y ≡ $D (mod $10).
 * @param {{ x: number, y: number }} link
 */
export function linkAlignedForUwStairs(link) {
  return (link.x & 0x0f) === 0 && (link.y & 0x0f) === 0x0d;
}

/**
 * CheckWarps UW branch: ObjGridOffset == 0 and a stairs tile ($70–$73) under Link.
 *
 * NES also requires Y ≡ $D and a single GetCollidableTileStill sample. We keep
 * the gridOffset gate (no mid-step warps) but probe a small footprint — right
 * foot + one metatile up — because:
 * - Y=$9D (south slot on a $90 stairs square) samples the row *below* the stairs
 * - X=$78 overlaps stairs while the left-foot sample is still floor
 * - 8px grid cells also park Link at Y ≡ $5 between metatile rows
 *
 * @param {{ x: number, y: number, gridOffset?: number }} link
 * @param {number[][] | null | undefined} playGrid 22×32 dungeon play grid
 */
export function checkUwStairsEntry(link, playGrid) {
  if (!playGrid?.length || !link) return false;
  if ((link.gridOffset ?? 0) !== 0) return false;
  for (const ox of [0, 8]) {
    for (const oy of [0, -8, -16]) {
      const tile = standingTile(playGrid, link.x + ox, link.y + oy);
      if (STAIRS_TILES.has(tile & 0xff)) return true;
    }
  }
  return false;
}

/**
 * Find a stairs tile under Link's feet (floor-grid helper / tests).
 * Prefer `checkUwStairsEntry` with the play grid in play code.
 * @param {number[][] | null} floorTiles 14×24 room floor
 * @param {{ x: number, y: number }} origin floor sprite origin
 * @param {{ x: number, y: number }} link
 * @param {{ requireNesAlign?: boolean }} [opts]
 */
export function linkOnStairs(floorTiles, origin, link, opts = {}) {
  if (!floorTiles?.length) return false;
  if (opts.requireNesAlign !== false && !linkAlignedForUwStairs(link)) return false;
  // Sample Link's top-left and foot-center — stairs are a 2×2 square.
  const samples = [
    [link.x, link.y],
    [link.x + 8, link.y + 8],
  ];
  for (const [px, py] of samples) {
    const col = Math.floor((px - origin.x) / 8);
    const row = Math.floor((py - origin.y) / 8);
    const tile = floorTiles[row]?.[col];
    if (tile != null && STAIRS_TILES.has(tile & 0xff)) return true;
  }
  return false;
}

/**
 * Cellar room reached by stairs from `fromRoomId`, if any.
 * Scans LevelInfo cellar list in order (NES: LevelInfo_CellarRoomIdArray + attrs A|B).
 * @param {object} level
 * @param {number} fromRoomId
 */
export function cellarForStairsRoom(level, fromRoomId) {
  const want = Number(fromRoomId);
  for (const cid of level.cellarRooms ?? []) {
    const room = level.rooms.find((r) => Number(r.roomId) === Number(cid));
    const exits = cellarExitsFor(room);
    if (!exits) continue;
    if (Number(exits.left) === want || Number(exits.right) === want) return Number(cid);
  }
  return null;
}

/**
 * On-map stairs room(s) that drop into `cellarRoomId` (attrs A/B destinations).
 * Used when a tip wants to mark a cellar treasure on the dungeon minimap —
 * cellars themselves are never drawn.
 * @param {object} level
 * @param {number} cellarRoomId
 * @returns {number[]}
 */
export function stairsRoomsForCellar(level, cellarRoomId) {
  const room = (level?.rooms ?? []).find((r) => Number(r.roomId) === Number(cellarRoomId));
  const exits = cellarExitsFor(room);
  if (!exits) return [];
  /** @type {number[]} */
  const out = [];
  for (const id of [exits.left, exits.right]) {
    const n = Number(id);
    if (!Number.isFinite(n) || n === 0xff) continue;
    if (out.includes(n)) continue;
    out.push(n & 0xff);
  }
  return out;
}

/**
 * Spawn when dropping into a cellar.
 * Skip WalkCellar animation: place at stand Y=$5D (after auto-walk), facing down.
 * X = $30 if source is attrs A (left), else $C0.
 * @param {{ x: number, y: number }} [_origin] unused (coords are screen-absolute)
 * @param {{ w: number, h: number }} [_roomSize]
 * @param {{ sourceRoomId?: number, cellarRoom?: object }} [opts]
 */
export function cellarEnterSpawn(_origin, _roomSize, opts = {}) {
  const exits = cellarExitsFor(opts.cellarRoom);
  let x = CELLAR_LADDER_XS[0];
  if (opts.sourceRoomId != null && exits) {
    x = opts.sourceRoomId === exits.left ? CELLAR_LADDER_XS[0] : CELLAR_LADDER_XS[1];
  }
  return {
    x,
    y: CELLAR_STAND_Y,
    dir: DIR.DOWN,
  };
}

/**
 * Exit a cellar when Link is at the top and facing/holding up.
 * NES CheckSubroom (mode 9): ObjY < $40 and input up.
 * @returns {{ nextRoomId: number, attrsC: number } | null}
 */
export function checkCellarExit(link, cellarRoom, level, _origin, inputDir) {
  if (!isCellarRoom(cellarRoom, level)) return null;
  if (link.y >= 0x40) return null;
  if (!(link.dir & DIR.UP) && !(inputDir & DIR.UP)) return null;

  const exits = cellarExitsFor(cellarRoom);
  if (!exits) return null;
  const nextRoomId = link.x < 0x80 ? exits.left : exits.right;
  if (!level.rooms.some((r) => r.roomId === nextRoomId)) return null;
  return {
    nextRoomId,
    attrsC: cellarRoom.attrsC ?? 0x6a,
  };
}
