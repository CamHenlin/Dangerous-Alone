import {
  DIR,
  OW_WALKABLE_REMAP,
  UW_FIRST_UNWALKABLE,
  getLinkCollidingTile,
} from './collision.js';

/** @param {number} dir */
function oppositeDir(dir) {
  if (dir & DIR.UP) return DIR.DOWN;
  if (dir & DIR.DOWN) return DIR.UP;
  if (dir & DIR.LEFT) return DIR.RIGHT;
  if (dir & DIR.RIGHT) return DIR.LEFT;
  return 0;
}

/** UW water / ladder tile (PrimarySquares index 6 → $F4). */
export const LADDER_TILE = 0xf4;

/** OW rooms where CheckLadder places object `$5F` (Z_07 LadderRoomsOW). */
export const LADDER_ROOMS_OW = Object.freeze([0x17, 0x18, 0x19, 0x27, 0x4f, 0x5f]);

/** OW water tiles that need the stepladder ($8D–$98). */
export const OW_LADDER_WATER_TILES = Object.freeze(
  Array.from({ length: 0x99 - 0x8d }, (_, i) => 0x8d + i),
);

/**
 * LinkToLadderOffsets — indexed by facing bit index from GetOppositeDir’s Y
 * (RIGHT=3, LEFT=2, DOWN=1, UP=0).
 */
const OFFSET_X = Object.freeze([0x00, 0x00, -0x10, 0x10]);
const OFFSET_Y = Object.freeze([-5, 0x13, 0x03, 0x03]);

/**
 * @param {number} dir
 */
function facingOffsetIndex(dir) {
  if (dir & DIR.RIGHT) return 3;
  if (dir & DIR.LEFT) return 2;
  if (dir & DIR.DOWN) return 1;
  if (dir & DIR.UP) return 0;
  return 0;
}

/**
 * @param {number} dir
 */
export function ladderOffsetForDir(dir) {
  const i = facingOffsetIndex(dir);
  return { x: OFFSET_X[i], y: OFFSET_Y[i] };
}

/**
 * @param {number} roomId
 */
export function isOwLadderRoom(roomId) {
  return LADDER_ROOMS_OW.includes(roomId & 0xff);
}

/**
 * @param {number} tile
 * @param {'overworld' | 'dungeon'} mode
 */
export function isLadderWaterTile(tile, mode) {
  const t = tile & 0xff;
  if (mode === 'overworld') return t >= 0x8d && t < 0x99;
  return t === LADDER_TILE;
}

/**
 * UW collision opts — water stays solid; ladder object grants a one-tile bypass.
 */
export function dungeonTileOptsWithLadder(_inv = {}) {
  return {
    firstUnwalkable: UW_FIRST_UNWALKABLE,
    walkableRemap: /** @type {number[]} */ ([]),
  };
}

/**
 * OW collision opts — LadderRoomsOW still listed for callers; water is not
 * remapped room-wide (NES places object `$5F`).
 * @param {{ ladder?: number }} [inv]
 * @param {number} [roomId]
 */
export function overworldTileOptsWithLadder(inv = {}, roomId = 0) {
  void inv;
  void roomId;
  return { walkableRemap: [...OW_WALKABLE_REMAP] };
}

/**
 * @typedef {{ x: number, y: number, dir: number, state: 1 | 2 }} LadderObject
 */

/**
 * Separation along the ladder axis (CheckLadder distance).
 * @param {LadderObject} ladder
 * @param {{ x: number, y: number }} link
 * @returns {{ dist: number, aligned: boolean }}
 */
export function ladderSeparation(ladder, link) {
  const vertical = Boolean(ladder.dir & (DIR.UP | DIR.DOWN));
  if (vertical) {
    if (link.x !== ladder.x) return { dist: 0xff, aligned: false };
    return {
      dist: Math.abs(link.y + 3 - ladder.y) & 0xff,
      aligned: true,
    };
  }
  if ((link.y + 3) !== ladder.y) return { dist: 0xff, aligned: false };
  return {
    dist: Math.abs(link.x - ladder.x) & 0xff,
    aligned: true,
  };
}

/**
 * True while Link is on the active stepladder span (dist ≤ $10, axis-aligned).
 * Feet may rest on water `$F4` here — standing/eject checks must not treat that
 * as an ordinary solid (or Link is pushed back off the ladder every frame).
 * @param {LadderObject | null | undefined} ladder
 * @param {{ x: number, y: number }} link
 */
export function ladderAllowsStanding(ladder, link) {
  if (!ladder) return false;
  const { dist, aligned } = ladderSeparation(ladder, link);
  return aligned && dist <= 0x10;
}

/**
 * @param {LadderObject | null | undefined} ladder
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number} moveDir
 */
export function ladderAllowsMove(ladder, link, moveDir) {
  if (!ladder || !moveDir) return false;
  const { dist, aligned } = ladderSeparation(ladder, link);
  if (!aligned || dist > 0x10) return false;

  const along =
    Boolean(moveDir & ladder.dir) || Boolean(moveDir & oppositeDir(ladder.dir));
  if (!along) return false;

  if (dist < 0x10) return true;
  // dist === $10: step onto (state 1) or step back; not further into open water.
  if (moveDir === oppositeDir(ladder.dir)) return true;
  return ladder.state === 1 && moveDir === ladder.dir;
}

/**
 * After movement: advance state or put the ladder away (CheckLadder).
 * @param {LadderObject | null} ladder
 * @param {{ x: number, y: number, dir: number }} link
 * @returns {LadderObject | null}
 */
export function stepLadderObject(ladder, link) {
  if (!ladder) return null;
  const { dist, aligned } = ladderSeparation(ladder, link);
  if (!aligned || dist > 0x10) return null;
  if (dist < 0x10) {
    return { ...ladder, state: 2 };
  }
  // dist === $10
  if (link.dir !== ladder.dir) return null;
  if (ladder.state === 1) return ladder; // still approaching
  return null; // state 2: stepped fully off
}

/**
 * Place ladder one tile ahead when facing water (Z_07 @SetUpLadder).
 * @param {{ x: number, y: number, dir: number, gridOffset?: number }} link
 * @param {object} opts
 * @param {number[][] | null | undefined} opts.tileGrid
 * @param {{ ladder?: number }} opts.inv
 * @param {'overworld' | 'dungeon'} opts.mode
 * @param {number} [opts.roomId]
 * @param {boolean} [opts.inDoorway]
 * @param {number} [opts.inputDir] facing-matched input
 * @param {LadderObject | null} [opts.existing]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts.tileOpts]
 * @returns {LadderObject | null}
 */
export function tryPlaceLadder(link, opts) {
  if (opts.existing) return opts.existing;
  if (!opts.inv?.ladder || opts.inDoorway) return null;
  if ((link.gridOffset ?? 0) !== 0) return null;
  if (opts.mode === 'overworld' && !isOwLadderRoom(opts.roomId ?? 0)) return null;

  const inputDir = opts.inputDir ?? 0;
  if (!inputDir || inputDir !== link.dir) return null;

  const hit = getLinkCollidingTile(
    opts.tileGrid ?? [],
    link.x,
    link.y,
    link.dir,
    opts.tileOpts ?? {},
  );
  if (!isLadderWaterTile(hit.tile, opts.mode)) return null;

  const off = ladderOffsetForDir(link.dir);
  return {
    x: (link.x + off.x) & 0xff,
    y: (link.y + off.y) & 0xff,
    dir: link.dir,
    state: 1,
  };
}

/**
 * canLinkMove, but water under an active ladder may be crossed for one tile.
 * @param {boolean} normallyWalkable
 * @param {number} collidingTile
 * @param {'overworld' | 'dungeon'} mode
 * @param {LadderObject | null | undefined} ladder
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number} moveDir
 */
export function ladderOverridesBlock(
  normallyWalkable,
  collidingTile,
  mode,
  ladder,
  link,
  moveDir,
) {
  if (normallyWalkable) return true;
  if (!isLadderWaterTile(collidingTile, mode)) return false;
  return ladderAllowsMove(ladder, link, moveDir);
}
