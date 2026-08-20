import {
  DIR,
  OW_FIRST_UNWALKABLE,
  OW_WALKABLE_REMAP,
  UW_FIRST_UNWALKABLE,
  clampOwLinkPos,
  getLinkCollidingTile,
  hitsOwBound,
  hitsUwBound,
  normalizeOwTile,
} from './collision.js';
import {
  CONTINUOUS_OW,
  clampMapEdgePos,
  hitsMapEdgeLimit,
} from './continuousCamera.js';
import {
  isLadderWaterTile,
  ladderAllowsStanding,
  ladderOverridesBlock,
} from './ladder.js';
import { clampWorldPos, hitsWorldLimit, standingTile } from './world.js';

/** Default Link quarter-speed ($60); applied 4× per frame → 1.5 px/frame. */
export const LINK_QSPEED = 0x60;
/** Reduced quarter-speed on overworld mountain stairs ($74/$75). */
export const LINK_QSPEED_STAIRS = 0x30;
export const LINK_ANIM_PERIOD = 6;

/** Overworld tiles that slow Link down (Z_05.asm Link_SetSpeed). */
const OW_STAIR_TILES = Object.freeze([0x74, 0x75]);

/**
 * Link_SetSpeed: overworld only — mountain stairs drop QSpeed to $30 and
 * reset the position fraction on the transition into the slower speed.
 * @param {LinkState} link
 * @param {number[][] | null} tileGrid
 * @returns {number} quarter speed
 */
export function overworldLinkQSpeed(link, tileGrid) {
  if (!tileGrid?.length) return LINK_QSPEED;
  const tile = standingTile(tileGrid, link.x, link.y);
  const slow = OW_STAIR_TILES.includes(tile);
  const next = slow ? LINK_QSPEED_STAIRS : LINK_QSPEED;
  if (slow && link.qSpeedApplied !== LINK_QSPEED_STAIRS) link.posFrac = 0;
  link.qSpeedApplied = next;
  return next;
}

/**
 * Pass as `roomId` to skip OW/world/UW edge clamps.
 * Used inside UW doorways (`DoorwayDir ≠ 0`) where NES skips `BoundByRoom`
 * so Link can reach door cavities at X≈`$10` / `$E8`.
 */
export const NO_ROOM_BOUNDS = -1;
/**
 * Pass as `roomId` for underworld `BoundByRoom` (`ObjectRoomBoundsUW`).
 * NES applies this whenever `DoorwayDir = 0`.
 */
export const UW_ROOM_BOUNDS = -2;

export { CONTINUOUS_OW };

/**
 * @param {number} x
 * @param {number} y
 * @param {number | null} [roomId]
 * @param {number | null} [anchorRoomId] real map room when `roomId` is CONTINUOUS_OW
 */
function clampLinkPos(x, y, roomId = null, anchorRoomId = null) {
  if (roomId === NO_ROOM_BOUNDS || roomId === UW_ROOM_BOUNDS) return { x, y };
  if (roomId === CONTINUOUS_OW) {
    return clampMapEdgePos(x, y, anchorRoomId ?? 0);
  }
  if (roomId != null) return clampWorldPos(x, y, roomId);
  return clampOwLinkPos(x, y);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number | null} [roomId]
 * @param {number | null} [anchorRoomId]
 */
function hitsLinkBound(x, y, dir, roomId = null, anchorRoomId = null) {
  if (roomId === NO_ROOM_BOUNDS) return false;
  if (roomId === UW_ROOM_BOUNDS) return hitsUwBound(x, y, dir);
  if (roomId === CONTINUOUS_OW) {
    return hitsMapEdgeLimit(x, y, dir, anchorRoomId ?? 0);
  }
  if (roomId != null) return hitsWorldLimit(x, y, dir, roomId);
  return hitsOwBound(x, y, dir);
}

/**
 * Reject a one-pixel step that leaves room bounds.
 *
 * UW/`BoundByRoom` is different: NES only clears a direction when the *current*
 * ObjX/ObjY is already past the lip (`hitsLinkBound` in `canLinkMove`). It does
 * not rewind pixels that cross `$21`/`$BD`/…. Blocking those pixels here caused
 * a snap loop at the lip and prevented `DoorwayDir` overflow from ever engaging
 * (CheckDoorway runs after BoundByRoom and re-enables movement in the cavity).
 *
 * @param {number} nextX
 * @param {number} nextY
 * @param {number} dir
 * @param {number | null} [roomId]
 * @param {number | null} [anchorRoomId]
 */
function pixelHitsRoomBound(nextX, nextY, dir, roomId = null, anchorRoomId = null) {
  if (roomId === UW_ROOM_BOUNDS || roomId === NO_ROOM_BOUNDS) return false;
  void dir;
  const clamped = clampLinkPos(nextX, nextY, roomId, anchorRoomId);
  return clamped.x !== nextX || clamped.y !== nextY;
}

/** @param {object} [tileOpts] */
function anchorFromOpts(tileOpts = {}) {
  return tileOpts.anchorRoomId ?? null;
}

/** Reduce multi-bit input to one direction (priority: U D L R). */
export function pickSingleDir(inputMask) {
  const m = inputMask & 0x0f;
  if (m & DIR.UP) return DIR.UP;
  if (m & DIR.DOWN) return DIR.DOWN;
  if (m & DIR.LEFT) return DIR.LEFT;
  if (m & DIR.RIGHT) return DIR.RIGHT;
  return 0;
}

/**
 * Clear directions already past `BoundByRoom` / world lips (NES clears them
 * before `Link_ModifyDirOnGridLine`). Without this, holding e.g. down+right
 * on the UW south lip prefers DOWN via `pickSingleDir`, and mid-cell
 * perpendicular handling reverse-oscillates instead of sliding to the door.
 *
 * @param {number} inputMask
 * @param {number} x
 * @param {number} y
 * @param {number | null} [roomId]
 */
export function filterInputByRoomBounds(inputMask, x, y, roomId = null, tileOpts = {}) {
  let m = inputMask & 0x0f;
  const anchor = anchorFromOpts(tileOpts);
  for (const d of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
    if ((m & d) && hitsLinkBound(x, y, d, roomId, anchor)) m &= ~d;
  }
  return m;
}

export function isVertical(dir) {
  return Boolean(dir & (DIR.UP | DIR.DOWN));
}

export function isHorizontal(dir) {
  return Boolean(dir & (DIR.LEFT | DIR.RIGHT));
}

export function oppositeDir(dir) {
  if (dir & DIR.UP) return DIR.DOWN;
  if (dir & DIR.DOWN) return DIR.UP;
  if (dir & DIR.LEFT) return DIR.RIGHT;
  if (dir & DIR.RIGHT) return DIR.LEFT;
  return 0;
}

/** True when X is on an 8px column and Y has the NES walk alignment (…|5). */
export function onGrid(x, y) {
  return (x & 7) === 0 && (y & 7) === 5;
}

/**
 * @typedef {object} LinkState
 * @property {number} x
 * @property {number} y
 * @property {number} dir
 * @property {number} posFrac
 * @property {number} gridOffset
 * @property {number} animCounter
 * @property {number} animFrame  0 or 1
 * @property {boolean} moving
 */

/**
 * @returns {LinkState}
 */
export function createLinkState(x, y, dir = DIR.UP) {
  return {
    x,
    y,
    dir,
    posFrac: 0,
    gridOffset: 0,
    animCounter: LINK_ANIM_PERIOD,
    animFrame: 0,
    moving: false,
  };
}

/**
 * Copy every motion field onto `target`. `x`/`y` are taken separately so a
 * caller can map occupying-room local coords back onto the world anchor
 * without dropping the walk cycle (`animFrame` / `animCounter`).
 *
 * @param {LinkState} target
 * @param {LinkState} source
 * @param {number} [x]
 * @param {number} [y]
 */
export function writeLinkMotion(target, source, x = source.x, y = source.y) {
  target.x = x;
  target.y = y;
  target.dir = source.dir;
  target.posFrac = source.posFrac;
  target.gridOffset = source.gridOffset;
  target.animCounter = source.animCounter;
  target.animFrame = source.animFrame;
  target.moving = source.moving;
}

/**
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number | null} [roomId] when set, allow walking to screen edges if a neighbor exists
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
/**
 * Pixel position of the next 8px grid cell in `dir`.
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @returns {{ x: number, y: number } | null}
 */
export function nextGridCellPos(x, y, dir) {
  if (dir & DIR.RIGHT) return { x: (x & 0xf8) + 8, y };
  if (dir & DIR.LEFT) return { x: (x & 0xf8) - 8, y };
  if (dir & DIR.DOWN) return { x, y: y + 8 };
  if (dir & DIR.UP) return { x, y: y - 8 };
  return null;
}

/**
 * Standing tile at the next 8px grid cell in `dir`.
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function nextGridStandingSolid(tileGrid, x, y, dir, tileOpts = {}) {
  const next = nextGridCellPos(x, y, dir);
  if (!tileGrid || !next) return false;
  return isLinkStandingSolid(tileGrid, next.x, next.y, tileOpts);
}

export function canLinkMove(tileGrid, x, y, dir, roomId = null, tileOpts = {}) {
  if (!dir) return false;
  if (hitsLinkBound(x, y, dir, roomId, anchorFromOpts(tileOpts))) return false;
  const hit =
    typeof tileOpts.collidingTile === 'function'
      ? tileOpts.collidingTile(x, y, dir)
      : getLinkCollidingTile(tileGrid, x, y, dir, tileOpts);
  let walkable = hit.walkable;
  // One-tile stepladder: water under an active ladder object may be crossed.
  if (!walkable && tileOpts.ladder && tileOpts.ladderMode) {
    walkable = ladderOverridesBlock(
      false,
      hit.tile,
      tileOpts.ladderMode,
      tileOpts.ladder,
      { x, y, dir },
      dir,
    );
  }
  if (!walkable) return false;

  // RIGHT only: NES look-ahead is +$10, which skips a lone solid column at +$08.
  // LEFT/UP/DOWN already sample the adjacent tile (−8 / +8), so an extra
  // next-cell standing test would stop Link a full tile early on UW faces.
  // Continuous multi-room probes already sample across the seam.
  if (
    (dir & DIR.RIGHT)
    && !tileOpts.collidingTile
    && nextGridStandingSolid(tileGrid, x, y, dir, tileOpts)
  ) {
    if (tileOpts.ladder && tileOpts.ladderMode) {
      const next = nextGridCellPos(x, y, dir);
      const nextTile = standingTile(tileGrid, next.x, next.y);
      if (
        ladderOverridesBlock(
          false,
          nextTile,
          tileOpts.ladderMode,
          tileOpts.ladder,
          { x, y, dir },
          dir,
        )
      ) {
        return true;
      }
    }
    return false;
  }
  return true;
}

/**
 * Knockback one frame: up to 4px toward `shoveDir`, stopping on solid tiles / bounds.
 * When blocked, clears remaining shove so Link is not stuck inside a wall.
 *
 * @param {LinkState} link
 * @param {number[][]} tileGrid
 * @param {number} shoveDir
 * @param {number} shovePixels remaining pixels
 * @param {object} [opts]
 * @param {number | null} [opts.roomId]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts.tileOpts]
 * @param {number} [opts.pixelsPerFrame]
 * @returns {{ shovePixels: number, moved: number, blocked: boolean }}
 */
export function stepShove(link, tileGrid, shoveDir, shovePixels, opts = {}) {
  if (!tileGrid || shovePixels <= 0 || !shoveDir) {
    return { shovePixels: 0, moved: 0, blocked: false };
  }
  const roomId = opts.roomId ?? null;
  const tileOpts = opts.tileOpts ?? {};
  const maxStep = Math.min(opts.pixelsPerFrame ?? 4, shovePixels);
  let moved = 0;

  for (let i = 0; i < maxStep; i += 1) {
    if (!canLinkMove(tileGrid, link.x, link.y, shoveDir, roomId, tileOpts)) {
      link.gridOffset = 0;
      link.posFrac = 0;
      link.moving = false;
      return { shovePixels: 0, moved, blocked: true };
    }

    const x0 = link.x;
    const y0 = link.y;
    if (shoveDir & DIR.UP) link.y -= 1;
    else if (shoveDir & DIR.DOWN) link.y += 1;
    else if (shoveDir & DIR.LEFT) link.x -= 1;
    else if (shoveDir & DIR.RIGHT) link.x += 1;

    if (pixelHitsRoomBound(link.x, link.y, shoveDir, roomId, anchorFromOpts(tileOpts))) {
      link.x = x0;
      link.y = y0;
      link.gridOffset = 0;
      link.posFrac = 0;
      link.moving = false;
      return { shovePixels: 0, moved, blocked: true };
    }
    moved += 1;
  }

  return { shovePixels: shovePixels - moved, moved, blocked: false };
}

/**
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
function resolveTileOpts(tileOpts = {}) {
  const firstUnwalkable = tileOpts.firstUnwalkable ?? OW_FIRST_UNWALKABLE;
  const walkableRemap =
    tileOpts.walkableRemap
    ?? (firstUnwalkable === UW_FIRST_UNWALKABLE ? [] : OW_WALKABLE_REMAP);
  return { firstUnwalkable, walkableRemap };
}

/**
 * True when the tile under Link's feet is impassable.
 * Active stepladder water is not treated as solid — otherwise `applyQuarterStep`
 * / eject undo every pixel onto `$F4` and the gap cannot be crossed.
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], ladder?: object, ladderMode?: string }} [tileOpts]
 */
export function isLinkStandingSolid(tileGrid, x, y, tileOpts = {}) {
  if (!tileGrid && typeof tileOpts.standingTile !== 'function') return false;
  const { firstUnwalkable, walkableRemap } = resolveTileOpts(tileOpts);
  const tile =
    typeof tileOpts.standingTile === 'function'
      ? tileOpts.standingTile(x, y)
      : standingTile(tileGrid, x, y);
  if (normalizeOwTile(tile, firstUnwalkable, walkableRemap).walkable) return false;
  if (
    tileOpts.ladder
    && tileOpts.ladderMode
    && isLadderWaterTile(tile, tileOpts.ladderMode)
    && ladderAllowsStanding(tileOpts.ladder, { x, y })
  ) {
    return false;
  }
  return true;
}

/**
 * If Link is embedded in a solid tile, slide him to the nearest walkable pixel.
 * Prefers `preferDir` (typically opposite knockback), then a Chebyshev ring search.
 *
 * @param {LinkState} link
 * @param {number[][]} tileGrid
 * @param {object} [opts]
 * @param {number | null} [opts.roomId]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts.tileOpts]
 * @param {number} [opts.preferDir]
 * @param {number} [opts.maxRadius]
 * @returns {{ ejected: boolean, dx: number, dy: number }}
 */
export function ejectLinkFromSolid(link, tileGrid, opts = {}) {
  if (!tileGrid) return { ejected: false, dx: 0, dy: 0 };
  const roomId = opts.roomId ?? null;
  const tileOpts = opts.tileOpts ?? {};
  const maxRadius = opts.maxRadius ?? 48;
  if (!isLinkStandingSolid(tileGrid, link.x, link.y, tileOpts)) {
    return { ejected: false, dx: 0, dy: 0 };
  }

  const clampPos = (x, y) => clampLinkPos(x, y, roomId, anchorFromOpts(tileOpts));

  const walkableAt = (x, y) => {
    const c = clampPos(x, y);
    if (c.x !== x || c.y !== y) return false;
    return !isLinkStandingSolid(tileGrid, x, y, tileOpts);
  };

  const commit = (x, y) => {
    const dx = x - link.x;
    const dy = y - link.y;
    link.x = x;
    link.y = y;
    link.gridOffset = 0;
    link.posFrac = 0;
    link.moving = false;
    return { ejected: true, dx, dy };
  };

  const preferDir = opts.preferDir || oppositeDir(link.dir) || DIR.UP;
  const rayDirs = [
    preferDir,
    oppositeDir(preferDir),
    DIR.UP,
    DIR.DOWN,
    DIR.LEFT,
    DIR.RIGHT,
  ].filter((d, i, arr) => d && arr.indexOf(d) === i);

  for (const dir of rayDirs) {
    let x = link.x;
    let y = link.y;
    for (let i = 0; i < maxRadius; i += 1) {
      if (dir & DIR.UP) y -= 1;
      else if (dir & DIR.DOWN) y += 1;
      else if (dir & DIR.LEFT) x -= 1;
      else if (dir & DIR.RIGHT) x += 1;
      if (walkableAt(x, y)) return commit(x, y);
    }
  }

  const ox = link.x;
  const oy = link.y;
  for (let r = 1; r <= maxRadius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ox + dx;
        const y = oy + dy;
        if (walkableAt(x, y)) return commit(x, y);
      }
    }
  }

  return { ejected: false, dx: 0, dy: 0 };
}

/**
 * Rewind to the start of the current 8px grid cell (pos − gridOffset).
 * Used when a mid-cell step is blocked so we never leave Link off-grid
 * inside / against a solid.
 * @param {LinkState} link
 */
export function snapToGridCellStart(link) {
  if (link.gridOffset === 0) {
    link.posFrac = 0;
    return;
  }
  if (link.dir & (DIR.LEFT | DIR.RIGHT)) {
    link.x -= link.gridOffset;
  } else if (link.dir & (DIR.UP | DIR.DOWN)) {
    link.y -= link.gridOffset;
  }
  link.gridOffset = 0;
  link.posFrac = 0;
  link.moving = false;
}

/**
 * Link_ModifyDirOnGridLine — mid-cell facing rules while gridOffset ≠ 0.
 * - Same axis / opposite: adopt input immediately (offset kept; walk back).
 * - Perpendicular early (|offset| < 4, still leaving the cell origin):
 *   reverse on the current axis and flip offset (−1→7, 3→−5) so the same
 *   pixel finishes toward the cell start. Late perpendicular input is ignored
 *   (keep facing) until the cell completes.
 * @param {LinkState} link
 * @param {number} inputDir single direction
 * @returns {number} facing direction to move this frame
 */
export function applyDirOnGridLine(link, inputDir) {
  if (!inputDir || link.gridOffset === 0) {
    return link.dir;
  }
  if (inputDir === link.dir) {
    return link.dir;
  }
  if (inputDir === oppositeDir(link.dir)) {
    link.dir = inputDir;
    return link.dir;
  }

  // Perpendicular.
  const absOff = Math.abs(link.gridOffset);
  if (absOff >= 4) {
    return link.dir;
  }
  // Already turned back toward the cell origin — don't reverse again.
  if (link.dir & (DIR.LEFT | DIR.UP)) {
    if (link.gridOffset >= 0) return link.dir;
  } else if (link.gridOffset < 0) {
    return link.dir;
  }

  const flipped =
    link.gridOffset > 0 ? link.gridOffset - 8 : link.gridOffset + 8;
  link.dir = oppositeDir(link.dir);
  link.gridOffset = flipped;
  return link.dir;
}

/**
 * @param {LinkState} link
 * @param {number} inputMask
 * @param {number[][]} [tileGrid]
 * @param {number | null} [roomId]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], ladder?: object, ladderMode?: string }} [tileOpts]
 */
export function resolveLinkDir(link, inputMask, tileGrid, roomId = null, tileOpts = {}) {
  const input = pickSingleDir(inputMask);
  if (!input) {
    return 0;
  }
  if (input === link.dir || input === oppositeDir(link.dir)) {
    link.dir = input;
    return input;
  }
  const facingBlocked =
    tileGrid != null
      ? !canLinkMove(tileGrid, link.x, link.y, link.dir, roomId, tileOpts)
      : false;
  if (link.gridOffset === 0 || facingBlocked) {
    link.dir = input;
    return input;
  }
  return link.dir;
}

/**
 * @param {LinkState} link
 * @param {number} dir
 * @param {number} qSpeed
 * @param {number | null} roomId
 * @param {number[][] | null} [tileGrid]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
function applyQuarterStep(link, dir, qSpeed, roomId, tileGrid = null, tileOpts = {}) {
  const atPosLimit = link.gridOffset === 8;
  const atNegLimit = link.gridOffset === -8;
  const x0 = link.x;
  const y0 = link.y;
  const grid0 = link.gridOffset;
  const frac0 = link.posFrac;

  if (dir & (DIR.RIGHT | DIR.DOWN)) {
    const sum = link.posFrac + qSpeed;
    link.posFrac = sum & 0xff;
    let carry = sum > 0xff ? 1 : 0;
    if (atPosLimit) {
      carry = 0;
    }
    if (carry) {
      link.gridOffset += 1;
      if (dir & DIR.RIGHT) {
        link.x += 1;
      } else {
        link.y += 1;
      }
    }
  } else if (dir & (DIR.LEFT | DIR.UP)) {
    const diff = link.posFrac - qSpeed;
    const borrow = diff < 0;
    link.posFrac = diff & 0xff;
    let carryClear = borrow;
    if (atNegLimit) {
      carryClear = false;
    }
    if (carryClear) {
      link.gridOffset -= 1;
      if (dir & DIR.LEFT) {
        link.x -= 1;
      } else {
        link.y -= 1;
      }
    }
  }

  if (pixelHitsRoomBound(link.x, link.y, dir, roomId, anchorFromOpts(tileOpts))) {
    link.x = x0;
    link.y = y0;
    link.gridOffset = grid0;
    link.posFrac = frac0;
    return false;
  }

  // Reject pixels that plant Link's feet in a solid (thin walls / bad look-ahead).
  // Use standing tile — not look-ahead — so cave-mouth approaches stay free.
  if (
    tileGrid
    && (link.x !== x0 || link.y !== y0)
    && isLinkStandingSolid(tileGrid, link.x, link.y, tileOpts)
  ) {
    link.x = x0;
    link.y = y0;
    link.gridOffset = grid0;
    link.posFrac = frac0;
    return false;
  }

  return link.x !== x0 || link.y !== y0;
}

/**
 * @param {LinkState} link
 */
export function truncateGridOffset(link) {
  if (link.gridOffset !== 0 && (link.gridOffset & 7) === 0) {
    link.gridOffset = 0;
  }
}

/**
 * @param {LinkState} link
 * @param {number[][]} tileGrid
 * @param {number} inputMask
 * @param {number} [qSpeed]
 * @param {number | null} [roomId]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], ladder?: object, ladderMode?: string }} [tileOpts]
 */
export function stepLink(
  link,
  tileGrid,
  inputMask,
  qSpeed = LINK_QSPEED,
  roomId = null,
  tileOpts = {},
) {
  link.moving = false;

  // Once an 8px grid step has begun, keep facing that axis unless the player
  // reverses (Link_ModifyDirOnGridLine). Do not re-run look-ahead mid-cell —
  // that freezes cave-mouth approaches under overhanging rock.
  const committed = link.gridOffset !== 0;
  // Mirror NES: BoundByRoom clears blocked components before dir selection.
  const boundMask = filterInputByRoomBounds(inputMask, link.x, link.y, roomId, tileOpts);
  let moveDir;

  if (committed) {
    moveDir = applyDirOnGridLine(link, pickSingleDir(boundMask));
  } else {
    // Already embedded (knockback / thin wall) — slide out before walking.
    if (isLinkStandingSolid(tileGrid, link.x, link.y, tileOpts)) {
      ejectLinkFromSolid(link, tileGrid, {
        roomId,
        tileOpts,
        preferDir: oppositeDir(link.dir),
      });
    }

    moveDir = resolveLinkDir(link, boundMask, tileGrid, roomId, tileOpts);
    if (!moveDir) {
      // BoundByRoom may clear the only held direction (e.g. RIGHT at X=$D0).
      // Still adopt that facing so locked key-door bumps can unlock — movement
      // stays blocked by the lip / solid face.
      const faceOnly = pickSingleDir(inputMask);
      if (faceOnly) link.dir = faceOnly;
      link.animCounter = LINK_ANIM_PERIOD;
      return;
    }
    if (!canLinkMove(tileGrid, link.x, link.y, moveDir, roomId, tileOpts)) {
      // At a grid point: try each input axis for a walkable component
      // (simplified Link_ModifyDirAtGridPoint).
      const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].filter(
        (d) => boundMask & d,
      );
      let turned = false;
      for (const d of dirs) {
        if (canLinkMove(tileGrid, link.x, link.y, d, roomId, tileOpts)) {
          link.dir = d;
          moveDir = d;
          turned = true;
          break;
        }
      }
      if (!turned) {
        link.animCounter = LINK_ANIM_PERIOD;
        return;
      }
    }
  }

  const prevX = link.x;
  const prevY = link.y;
  for (let i = 0; i < 4; i += 1) {
    applyQuarterStep(link, moveDir, qSpeed, roomId, tileGrid, tileOpts);
  }
  truncateGridOffset(link);

  if (link.x !== prevX || link.y !== prevY) {
    link.moving = true;
    link.animCounter -= 1;
    if (link.animCounter <= 0) {
      link.animCounter = LINK_ANIM_PERIOD;
      link.animFrame ^= 1;
    }
  } else if (committed && link.gridOffset !== 0) {
    // No pixel this frame while mid-cell. That can mean the next pixel is a
    // real wall/bound — or a fractional stall (e.g. mountain-stair QSpeed $30:
    // four adds land exactly on a byte boundary with no carry).
    //
    // NES Walker_CheckTileCollision skips tiles while gridOffset ≠ 0, so do
    // NOT use look-ahead `canLinkMove` here: approaching a UW face from one
    // cell away makes look-ahead solid mid-cell and would snap Link back a
    // full 8px early. Only rewind when the immediate next pixel is unusable.
    const stuckOnSolid = isLinkStandingSolid(tileGrid, link.x, link.y, tileOpts);
    let nextX = link.x;
    let nextY = link.y;
    if (moveDir & DIR.UP) nextY -= 1;
    else if (moveDir & DIR.DOWN) nextY += 1;
    else if (moveDir & DIR.LEFT) nextX -= 1;
    else if (moveDir & DIR.RIGHT) nextX += 1;
    const nextPixelBlocked =
      pixelHitsRoomBound(nextX, nextY, moveDir, roomId, anchorFromOpts(tileOpts))
      || isLinkStandingSolid(tileGrid, nextX, nextY, tileOpts);
    if (stuckOnSolid || nextPixelBlocked) {
      snapToGridCellStart(link);
    }
    link.animCounter = LINK_ANIM_PERIOD;
  } else {
    link.animCounter = LINK_ANIM_PERIOD;
  }
}

/**
 * Link walk metatile halves for drawing.
 *
 * Facing down starts from shieldless CHR `$08`/`$0A`. NES
 * `Link_EndMoveAndAnimate` then patches the left OAM tile for the wood
 * shield (`+$50` → `$58`/`$5A`) or Magical Shield head tiles (`$60`).
 * `@FixHFlip` clears H-flip on the patched sprite when the pre-patch tile
 * was `$0A` (only one downward shield frame).
 *
 * Other facings keep shield art baked into the walk CHR; `flipH` mirrors the
 * whole 16×16 (≡ swap halves + flip each), matching side/up walk.
 *
 * @param {number} dir
 * @param {number} animFrame
 * @param {{ magicShield?: boolean }} [opts]
 * @returns {{
 *   leftTile: number,
 *   rightTile: number,
 *   flipLeft: boolean,
 *   flipRight: boolean,
 *   baseTile: number,
 *   flipH: boolean,
 * }}
 */
export function linkWalkSprite(dir, animFrame, opts = {}) {
  const frame = animFrame & 1;
  const magic = Boolean(opts.magicShield);

  if (dir & DIR.DOWN) {
    // After optional walk H-flip swap, patch left tile only.
    if (magic) {
      // LinkHeadTiles `$08`/`$0A` → LinkHeadMagicShieldTiles `$60`.
      if (frame) {
        return {
          leftTile: 0x60,
          rightTile: 0x08,
          flipLeft: false,
          flipRight: true,
          baseTile: 0x60,
          flipH: true,
        };
      }
      return {
        leftTile: 0x60,
        rightTile: 0x0a,
        flipLeft: false,
        flipRight: false,
        baseTile: 0x60,
        flipH: false,
      };
    }
    // Wood shield: left `$08`/`$0A` → `$58`/`$5A`.
    if (frame) {
      return {
        leftTile: 0x5a,
        rightTile: 0x08,
        flipLeft: false,
        flipRight: true,
        baseTile: 0x5a,
        flipH: true,
      };
    }
    return {
      leftTile: 0x58,
      rightTile: 0x0a,
      flipLeft: false,
      flipRight: false,
      baseTile: 0x58,
      flipH: false,
    };
  }

  let baseTile;
  let flipH;
  if (dir & DIR.UP) {
    baseTile = 0x0c;
    flipH = Boolean(frame);
  } else if (dir & DIR.LEFT) {
    baseTile = frame ? 0x04 : 0x00;
    flipH = true;
  } else {
    baseTile = frame ? 0x04 : 0x00;
    flipH = false;
  }

  if (flipH) {
    return {
      leftTile: baseTile + 2,
      rightTile: baseTile,
      flipLeft: true,
      flipRight: true,
      baseTile,
      flipH: true,
    };
  }
  return {
    leftTile: baseTile,
    rightTile: baseTile + 2,
    flipLeft: false,
    flipRight: false,
    baseTile,
    flipH: false,
  };
}
