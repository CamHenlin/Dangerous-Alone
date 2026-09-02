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
      dist: Math.min(0xff, Math.abs(link.y + 3 - ladder.y)),
      aligned: true,
    };
  }
  if ((link.y + 3) !== ladder.y) return { dist: 0xff, aligned: false };
  return {
    dist: Math.min(0xff, Math.abs(link.x - ladder.x)),
    aligned: true,
  };
}

/**
 * Pin the ladder to this hero's cross-axis. A walk-grid snap (or a second
 * player a pixel off) used to leave a visible `$5F` that `ladderAllowsMove`
 * would not honor — "the ladder comes out, then I hit a wall".
 * @param {LadderObject} ladder
 * @param {{ x: number, y: number }} link
 */
export function alignLadderToLink(ladder, link) {
  const vertical = Boolean(ladder.dir & (DIR.UP | DIR.DOWN));
  if (vertical) {
    return link.x === ladder.x ? ladder : { ...ladder, x: link.x };
  }
  const y = link.y + 3;
  return y === ladder.y ? ladder : { ...ladder, y };
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
 * `others` are allies in the same place — a friend standing off-axis must
 * not stash the ladder the current hero is crossing.
 * @param {LadderObject | null} ladder
 * @param {{ x: number, y: number, dir: number }} link
 * @param {readonly { x: number, y: number, dir: number }[]} [others]
 * @returns {LadderObject | null}
 */
export function stepLadderObject(ladder, link, others = []) {
  if (!ladder) return null;
  const heroes = [link, ...others];
  /** @type {{ dist: number, link: { dir: number } }[]} */
  const users = [];
  for (const h of heroes) {
    const { dist, aligned } = ladderSeparation(ladder, h);
    if (aligned && dist <= 0x10) users.push({ dist, link: h });
  }
  if (users.length === 0) return null;
  if (users.some((u) => u.dist < 0x10)) {
    return { ...ladder, state: 2 };
  }
  // All at dist === $10: keep while anyone is still approaching.
  if (users.some((u) => u.link.dir === ladder.dir && ladder.state === 1)) {
    return ladder;
  }
  return null;
}

/**
 * True when look-ahead is unwalkable water — a new `$5F` would actually help.
 * Used to drop a covering-but-wrong-facing object at a T-junction; a
 * perpendicular tap beside a straight 1-tile gap hits land and keeps it.
 * @param {{ x: number, y: number }} link
 * @param {number} dir
 * @param {object} opts
 */
function lookAheadNeedsLadder(link, dir, opts) {
  if (!dir) return false;
  const hit = collidingTileAhead(link, dir, opts);
  return !hit.walkable && isLadderWaterTile(hit.tile, opts.mode);
}

/**
 * Look-ahead water probe. Continuous OW must use the multi-room sampler —
 * `getLinkCollidingTile` on the streaming-anchor grid clamps leftover Y and
 * can plant the stepladder in the ocean while the beach gap is the real tile.
 * @param {{ x: number, y: number }} link
 * @param {number} dir
 * @param {object} opts
 */
function collidingTileAhead(link, dir, opts) {
  if (typeof opts.collidingTile === 'function') {
    return opts.collidingTile(link.x, link.y, dir);
  }
  if (typeof opts.tileOpts?.collidingTile === 'function') {
    return opts.tileOpts.collidingTile(link.x, link.y, dir);
  }
  return getLinkCollidingTile(
    opts.tileGrid ?? [],
    link.x,
    link.y,
    dir,
    opts.tileOpts ?? {},
  );
}

/**
 * Battery save / debug snapshot of the one-tile stepladder object.
 * @param {LadderObject | null | undefined} ladder
 * @returns {LadderObject | null}
 */
export function snapshotLadder(ladder) {
  if (!ladder) return null;
  return {
    x: ladder.x,
    y: ladder.y,
    dir: ladder.dir,
    state: ladder.state === 2 ? 2 : 1,
  };
}

/**
 * @param {unknown} saved
 * @returns {LadderObject | null}
 */
export function hydrateLadder(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const rec = /** @type {{ x?: unknown, y?: unknown, dir?: unknown, state?: unknown }} */ (saved);
  const dir = Number(rec.dir) || 0;
  if (!dir) return null;
  return {
    x: Number(rec.x) || 0,
    y: Number(rec.y) || 0,
    dir,
    state: rec.state === 2 ? 2 : 1,
  };
}

/**
 * Place ladder one tile ahead when facing water (Z_07 @SetUpLadder).
 * @param {{ x: number, y: number, dir: number, gridOffset?: number }} link
 * @param {object} opts
 * @param {number[][] | null | undefined} opts.tileGrid
 * @param {{ ladder?: number }} opts.inv
 * @param {'overworld' | 'dungeon'} opts.mode
 * @param {number} [opts.roomId]
 * @param {number} [opts.occupyingRoomId] cell Link is standing in (not the stream)
 * @param {boolean} [opts.inDoorway]
 * @param {number} [opts.inputDir] direction held this frame
 * @param {LadderObject | null} [opts.existing]
 * @param {readonly { x: number, y: number, dir: number }[]} [opts.others]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function, standingTile?: Function }} [opts.tileOpts]
 * @param {(x: number, y: number, dir: number) => { tile: number, walkable: boolean }} [opts.collidingTile]
 * @param {(x: number, y: number) => number} [opts.standingTile]
 * @returns {LadderObject | null}
 */
export function tryPlaceLadder(link, opts) {
  let existing = opts.existing ?? null;
  if (existing) {
    // Covering must be decided on the *unmoved* object. Aligning to this
    // hero first stole a co-op partner's span (different Y) and a leftover
    // `$5F` ocean ladder kept while standing in the `$17` river.
    const othersOnSpan = (opts.others ?? []).some((h) => ladderAllowsStanding(existing, h));
    const selfOnSpan = ladderAllowsStanding(existing, link);
    if (selfOnSpan) {
      existing = alignLadderToLink(existing, link);
      const dir = opts.inputDir ?? 0;
      const canUse = Boolean(dir) && ladderAllowsMove(existing, link, dir);
      const needsNew =
        Boolean(dir)
        && dir !== existing.dir
        && !canUse
        && !othersOnSpan
        && lookAheadNeedsLadder(link, dir, opts);
      if (!needsNew) return existing;
      existing = null;
    } else if (othersOnSpan) {
      return existing;
    } else {
      existing = null;
    }
  }
  if (!opts.inv?.ladder || opts.inDoorway) return null;
  if ((link.gridOffset ?? 0) !== 0) return null;
  const ladderRoomId = opts.occupyingRoomId ?? opts.roomId ?? 0;
  if (opts.mode === 'overworld' && !isOwLadderRoom(ladderRoomId)) return null;

  // `main.js` places the ladder before `stepLink` adopts this frame's facing,
  // so probe with the held direction — not last frame's `link.dir`.
  const dir = opts.inputDir ?? 0;
  if (!dir) return null;

  const hit = collidingTileAhead(link, dir, opts);
  if (!isLadderWaterTile(hit.tile, opts.mode)) return null;

  const off = ladderOffsetForDir(dir);
  const x = link.x + off.x;
  const y = link.y + off.y;
  // NES object coords are 8-bit. Continuous leftover X/Y must not wrap —
  // `& $FF` planted the stepladder in the ocean while Link stood on `$5F`.
  return {
    x: opts.mode === 'overworld' ? x : x & 0xff,
    y: opts.mode === 'overworld' ? y : y & 0xff,
    dir,
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
