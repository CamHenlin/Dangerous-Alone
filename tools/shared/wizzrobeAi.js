/**
 * Wizzrobe AI — Z_04.asm `UpdateBlueWizzrobe` and `UpdateRedWizzrobe`.
 *
 * The two colours run completely different routines. Blue ($23) walks the square
 * grid, turning toward Link now and then, and fades $20 px diagonally when its
 * walk timer expires or a block or water blocks it. Red ($24) never walks: it
 * materialises on a square near Link, turns solid, shoots one magic shot, fades
 * out and repeats.
 *
 * NES `FrameCounter` parity is modelled with `e.anim`, the per-object frame
 * counter that `stepEnemy` advances once per frame.
 */

import { DIR } from './collision.js';

export const BLUE_WIZZROBE = 0x23;
export const RED_WIZZROBE = 0x24;

/**
 * @typedef {object} TileProbe
 * @property {number} tile raw `ObjCollidedTile`
 * @property {boolean} walkable tile < `ObjectFirstUnwalkableTile`
 */

/**
 * @typedef {object} WizzrobeOpts
 * @property {{ x: number, y: number } | null} [link]
 * @property {((x: number, y: number) => TileProbe) | null} [probeTile]
 * @property {() => number} [rngByte]
 */

/** `WizzrobeCollisionOffsetsX` indexed by `ObjDir - 1`. */
export const WIZZROBE_HOTSPOT_X = Object.freeze([
  0x0f, 0x00, 0x00, 0x04, 0x08, 0x00, 0x00, 0x04, 0x08, 0x00,
]);

/** `WizzrobeCollisionOffsetsY`. */
export const WIZZROBE_HOTSPOT_Y = Object.freeze([
  0x04, 0x04, 0x00, 0x08, 0x08, 0x08, 0x00, -0x08, 0x00, 0x00,
]);

/**
 * `Wizzrobe_GetCollidableTileForDir` — probe the square at the direction's
 * collision hotspot.
 * @param {WizzrobeOpts} opts
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @returns {TileProbe}
 */
function probeForDir(opts, x, y, dir) {
  if (!opts.probeTile) return { tile: 0, walkable: true };
  const index = (dir & 0x0f) - 1;
  const px = (x + (WIZZROBE_HOTSPOT_X[index] ?? 0)) & 0xff;
  const py = (y + (WIZZROBE_HOTSPOT_Y[index] ?? 0)) & 0xff;
  return opts.probeTile(px, py);
}

/**
 * @param {number} objType
 */
export function isWizzrobeType(objType) {
  return objType === BLUE_WIZZROBE || objType === RED_WIZZROBE;
}

/**
 * Reset the per-colour Wizzrobe fields (called from `createEnemy`).
 * Blue starts walking with a `Random | $70` timer
 * (`BlueWizzrobe_AlignWithNearestSquareAndRandomizeTimer`); red starts at
 * state 0 so its first frame decrements to $FF and picks a teleport square.
 * @param {object} e
 * @param {number} [seed]
 */
export function initWizzrobe(e, seed = 0) {
  if (e.objType === BLUE_WIZZROBE) {
    e.wizzTimer = 0x70 | (seed & 0x0f);
    e.wizzRemDistance = 0;
    e.wizzTurnCounter = 0;
  } else {
    e.wizzState = 0;
    e.wizzFadeCounter = 0;
  }
}

/** Tile is a block ($B0–$B3) or water / screen-edge brick (≥ $F4). */
function tileIsTeleportable(tile) {
  const masked = tile & 0xfc;
  return masked === 0xb0 || masked >= 0xf4;
}

function alignedSquareX(x) {
  return (x + 8) & 0xf0;
}

/** `RedWizzrobe_AlignAndSetY` — square-align, then back off 3 to the usual $?D. */
function alignAndSetY(y) {
  return ((y & 0xf0) - 3) & 0xff;
}

/** `BlueWizzrobe_AlignWithNearestSquare` — nearest square, not the current one. */
function alignWithNearestSquare(e) {
  e.x = alignedSquareX(e.x);
  e.y = alignAndSetY(e.y + 8);
}

// --- Red Wizzrobe ($24) -----------------------------------------------------

/** `UpdateRedWizzrobe_JumpTable` index — `ObjState >> 6`. */
export const RED_WIZZROBE_GROUP = Object.freeze({
  /** $00–$3F `UpdateRedWizzrobe_0`: bare RTS, nothing drawn. */
  GONE: 0,
  /** $40–$7F `UpdateRedWizzrobe_1`: fading out. */
  FADE_OUT: 1,
  /** $80–$BF `UpdateRedWizzrobe_2`: solid; shoots at $B0. */
  SOLID: 2,
  /** $C0–$FF `UpdateRedWizzrobe_3`: teleport at $FF, then fading in. */
  FADE_IN: 3,
});

/** `RedWizzrobeDirections` — `Random & 3` → facing. */
export const RED_WIZZROBE_DIRS = Object.freeze([DIR.DOWN, DIR.UP, DIR.RIGHT, DIR.LEFT]);

/** `RedWizzrobeOffsetsX` — `Random & $F` → signed X offset from Link. */
export const RED_WIZZROBE_OFFSETS_X = Object.freeze([
  0x00, 0x00, -0x20, 0x20, 0x00, 0x00, -0x40, 0x40,
  0x00, 0x00, -0x30, 0x30, 0x00, 0x00, -0x50, 0x50,
]);

/** `RedWizzrobeOffsetsY`. */
export const RED_WIZZROBE_OFFSETS_Y = Object.freeze([
  -0x20, 0x20, 0x00, 0x00, -0x40, 0x40, 0x00, 0x00,
  -0x30, 0x30, 0x00, 0x00, -0x50, 0x50, 0x00, 0x00,
]);

/** `UpdateRedWizzrobe_2` shoots magic shot $59 on this exact state. */
export const RED_WIZZROBE_SHOOT_STATE = 0xb0;

/**
 * @param {number} state
 */
export function redWizzrobeGroup(state) {
  return (state & 0xff) >> 6;
}

/**
 * `UpdateRedWizzrobe_3` at state $FF — appear on a square-aligned spot near
 * Link, facing a random direction. The ROM commits the coordinates before
 * testing them and simply retries next frame when the spot is rejected.
 * @param {object} e
 * @param {WizzrobeOpts} [opts]
 * @returns {boolean} true when the square was accepted
 */
export function redWizzrobeTeleport(e, opts = {}) {
  const rngByte = opts.rngByte ?? (() => (e.anim + e.id * 17) & 0xff);
  const roll = rngByte() & 0xff;
  e.dir = RED_WIZZROBE_DIRS[roll & 0x03];

  const index = roll & 0x0f;
  const linkX = opts.link?.x ?? e.x;
  const linkY = opts.link?.y ?? e.y;
  e.x = (linkX + RED_WIZZROBE_OFFSETS_X[index]) & 0xf0;
  // The +3 nudge makes the following square-align land on the same row Link is on.
  e.y = alignAndSetY(linkY + 3 + RED_WIZZROBE_OFFSETS_Y[index]);

  // Y outside [$5D, $C4) means the square is inside a wall.
  if (e.y < 0x5d || e.y >= 0xc4) return false;
  return probeForDir(opts, e.x, e.y, e.dir).walkable;
}

/**
 * One frame of `UpdateRedWizzrobe`.
 * @param {object} e
 * @param {WizzrobeOpts} [opts]
 */
export function stepRedWizzrobe(e, opts = {}) {
  e.wizzState = ((e.wizzState ?? 0) - 1) & 0xff;
  const group = redWizzrobeGroup(e.wizzState);

  if (group === RED_WIZZROBE_GROUP.FADE_IN) {
    if (e.wizzState === 0xff) {
      // Rejected squares bump the state back so $FF is retried next frame.
      if (!redWizzrobeTeleport(e, opts)) e.wizzState = 0x00;
      return;
    }
    advanceFade(e);
    return;
  }

  if (group === RED_WIZZROBE_GROUP.FADE_OUT) {
    // $7F is rewritten to $4F, skipping $30 frames of the fade.
    if (e.wizzState === 0x7f) e.wizzState = 0x4f;
    advanceFade(e);
    return;
  }

  // SOLID and GONE groups do not move.
}

/** `INC RedWizzrobe_ObjFadeCounter` — its low bit gates the intermittent draw. */
function advanceFade(e) {
  e.wizzFadeCounter = ((e.wizzFadeCounter ?? 0) + 1) & 0xff;
}

/**
 * `Wizzrobe_DrawAndCheckCollisionsIntermittently` for red: the solid group draws
 * every frame, the fade groups draw on even fade-counter frames, and the GONE
 * group plus the $FF teleport frame never draw.
 * @param {object} e
 */
export function redWizzrobeIsVisible(e) {
  const state = e.wizzState ?? 0;
  const group = redWizzrobeGroup(state);
  if (group === RED_WIZZROBE_GROUP.GONE) return false;
  if (group === RED_WIZZROBE_GROUP.SOLID) return true;
  if (state === 0xff) return false;
  return ((e.wizzFadeCounter ?? 0) & 1) === 0;
}

// --- Blue Wizzrobe ($23) ----------------------------------------------------

/** `BlueWizzrobeTeleportOffsetsX` indexed by `ObjDir` (1 px per set bit). */
export const BLUE_WIZZROBE_OFFSETS_X = Object.freeze([
  0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1,
]);

/** `BlueWizzrobeTeleportOffsetsY`. */
export const BLUE_WIZZROBE_OFFSETS_Y = Object.freeze([
  0, 0, 0, 0, 1, 1, 1, 0, -1, -1, -1,
]);

/** `BlueWizzrobeTeleportMaxOffsetsX` — candidate teleport deltas. */
export const BLUE_WIZZROBE_TELEPORT_X = Object.freeze([-0x20, 0x20, -0x20, 0x20]);

/** `BlueWizzrobeTeleportMaxOffsetsY`. */
export const BLUE_WIZZROBE_TELEPORT_Y = Object.freeze([-0x20, -0x20, 0x20, 0x20]);

/** `BlueWizzrobeTeleportDirs` — the matching diagonal facings. */
export const BLUE_WIZZROBE_TELEPORT_DIRS = Object.freeze([
  DIR.LEFT | DIR.UP,
  DIR.RIGHT | DIR.UP,
  DIR.LEFT | DIR.DOWN,
  DIR.RIGHT | DIR.DOWN,
]);

/** `BeginTeleporting` moves $20 px on both axes. */
export const BLUE_WIZZROBE_TELEPORT_DISTANCE = 0x20;

/** `BlueWizzrobe_Move` — one pixel per set direction bit. */
export function blueWizzrobeMove(e) {
  const dir = e.dir & 0x0f;
  e.x = (e.x + (BLUE_WIZZROBE_OFFSETS_X[dir] ?? 0)) & 0xff;
  e.y = (e.y + (BLUE_WIZZROBE_OFFSETS_Y[dir] ?? 0)) & 0xff;
}

/** `BeginTeleporting` — fade through the obstacle and flip the turn axis. */
function beginTeleporting(e) {
  e.wizzRemDistance = BLUE_WIZZROBE_TELEPORT_DISTANCE;
  e.wizzTurnCounter = ((e.wizzTurnCounter ?? 0) ^ 0x40) & 0xff;
  e.wizzTimer = 0;
}

/** `BlueWizzrobe_AlignWithNearestSquareAndRandomizeTimer`. */
function alignAndRandomizeTimer(e, rngByte) {
  e.wizzTimer = (rngByte() & 0xff) | 0x70;
  alignWithNearestSquare(e);
}

/**
 * `BlueWizzrobe_TurnTowardLink` — alternate between facing Link horizontally
 * and vertically depending on bit 6 of the turn counter.
 * @param {object} e
 * @param {{ x: number, y: number } | null | undefined} link
 */
export function blueWizzrobeTurnTowardLink(e, link) {
  if (!link) return;
  const wanted = ((e.wizzTurnCounter ?? 0) & 0x40) === 0
    ? (e.x >= link.x ? DIR.LEFT : DIR.RIGHT)
    : (e.y >= link.y ? DIR.UP : DIR.DOWN);
  if (wanted === (e.dir & 0x0f)) return;
  e.dir = wanted;
  alignWithNearestSquare(e);
}

/** `L_BlueWizzrobe_TurnTowardLinkIfNeeded` — only on multiples of $40. */
function turnTowardLinkIfNeeded(e, link) {
  if (((e.wizzTurnCounter ?? 0) & 0x3f) !== 0) return;
  blueWizzrobeTurnTowardLink(e, link);
}

/** `BlueWizzrobe_MoveAndCheckTile`. */
function moveAndCheckTile(e, opts) {
  blueWizzrobeMove(e);
  if (!opts.probeTile) return;
  const probe = probeForDir(opts, e.x, e.y, e.dir);
  if (probe.walkable) return;

  if (tileIsTeleportable(probe.tile)) {
    // Already fading through an obstacle: keep going next frame.
    if ((e.wizzRemDistance ?? 0) !== 0) return;
    beginTeleporting(e);
    return;
  }

  // Plain wall: reverse whichever components the facing has, then move again.
  let dir = e.dir & 0x0f;
  if (dir & 0x0c) dir ^= 0x0c;
  if (dir & 0x03) dir ^= 0x03;
  e.dir = dir;
  blueWizzrobeMove(e);
}

/**
 * `BlueWizzrobe_ChooseTeleportTarget` — probe one random diagonal $20 px away.
 * @param {object} e
 * @param {WizzrobeOpts} opts
 * @param {() => number} rngByte
 */
function chooseTeleportTarget(e, opts, rngByte) {
  const index = rngByte() & 0x03;
  const dir = BLUE_WIZZROBE_TELEPORT_DIRS[index];
  const targetX = (e.x + BLUE_WIZZROBE_TELEPORT_X[index]) & 0xff;
  const targetY = (e.y + BLUE_WIZZROBE_TELEPORT_Y[index]) & 0xff;
  if (!probeForDir(opts, targetX, targetY, dir).walkable) {
    alignAndRandomizeTimer(e, rngByte);
    return;
  }
  e.dir = dir;
  beginTeleporting(e);
}

/**
 * One frame of `UpdateBlueWizzrobe` / `BlueWizzrobe_WalkOrTeleport`.
 * @param {object} e
 * @param {WizzrobeOpts} [opts]
 */
export function stepBlueWizzrobe(e, opts = {}) {
  const rngByte = opts.rngByte ?? (() => (e.anim + e.id * 17) & 0xff);
  const timer = e.wizzTimer ?? 0;
  const link = opts.link ?? null;

  if (timer === 0) {
    // Teleporting: drift diagonally every frame until the distance is spent.
    const rem = e.wizzRemDistance ?? 0;
    if (rem > 0) {
      e.wizzRemDistance = rem - 1;
      moveAndCheckTile(e, opts);
      return;
    }
    alignAndRandomizeTimer(e, rngByte);
    blueWizzrobeTurnTowardLink(e, link);
    return;
  }

  e.wizzTimer = timer - 1;

  if (timer >= 0x10) {
    // Walk every other frame; the turn check still runs on the odd frames.
    if (((e.anim ?? 0) & 1) === 0) {
      e.wizzTurnCounter = ((e.wizzTurnCounter ?? 0) + 1) & 0xff;
      turnTowardLinkIfNeeded(e, link);
      moveAndCheckTile(e, opts);
    } else {
      turnTowardLinkIfNeeded(e, link);
    }
    return;
  }

  // $2–$F is a standing pause; at 1 the next teleport is picked.
  if (timer === 1) chooseTeleportTarget(e, opts, rngByte);
}

/**
 * `Wizzrobe_DrawAndCheckCollisionsIntermittently` for blue: walking (distance 0)
 * draws every frame, and fading draws on even remaining-distance frames.
 * @param {object} e
 */
export function blueWizzrobeIsVisible(e) {
  return ((e.wizzRemDistance ?? 0) & 1) === 0;
}

/**
 * `BlueWizzrobe_TryShooting` — once every $20 frames, while not fading, and
 * only when already facing Link along a shared square row or column.
 *
 * The column test is asymmetric in the ROM: the monster's X is square-masked
 * but Link's is not, so the columns only ever match on an exact $?0 boundary.
 * @param {object} e
 * @param {{ x: number, y: number } | null | undefined} link
 */
export function blueWizzrobeShouldShoot(e, link) {
  if (!link) return false;
  if ((e.wizzRemDistance ?? 0) !== 0) return false;
  if (((e.anim ?? 0) & 0x1f) !== 0) return false;

  if ((e.y & 0xf0) === (link.y & 0xf0)) {
    const wanted = e.x >= link.x ? DIR.LEFT : DIR.RIGHT;
    return wanted === (e.dir & 0x0f);
  }
  if ((e.x & 0xf0) !== link.x) return false;
  const wanted = e.y >= link.y ? DIR.UP : DIR.DOWN;
  return wanted === (e.dir & 0x0f);
}

// --- Shared dispatch --------------------------------------------------------

/**
 * @param {object} e
 * @param {WizzrobeOpts} [opts]
 */
export function stepWizzrobe(e, opts = {}) {
  if (e.objType === RED_WIZZROBE) stepRedWizzrobe(e, opts);
  else stepBlueWizzrobe(e, opts);
}

/**
 * Drawn (and therefore collidable) this frame.
 * @param {object} e
 */
export function wizzrobeIsVisible(e) {
  return e.objType === RED_WIZZROBE ? redWizzrobeIsVisible(e) : blueWizzrobeIsVisible(e);
}

/**
 * @param {object} e
 * @param {{ x: number, y: number } | null | undefined} link
 */
export function wizzrobeShouldShoot(e, link) {
  if (e.objType === RED_WIZZROBE) {
    return (e.wizzState ?? 0) === RED_WIZZROBE_SHOOT_STATE;
  }
  return blueWizzrobeShouldShoot(e, link);
}
