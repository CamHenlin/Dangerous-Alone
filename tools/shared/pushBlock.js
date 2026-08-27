import { DIR, HUD_HEIGHT, LINK_HOTSPOT_Y, collisionSamplePoints } from './collision.js';
import { SECRET } from './roomSecrets.js';

/** ObjType $68 — must clear room before push (RoomAllDead). */
export const PUSH_STATE = Object.freeze({
  IDLE: 0,
  MOVING: 1,
  DONE: 2,
});

/** Frames Link must hold push before the block moves (~$10). */
export const PUSH_HOLD_FRAMES = 0x10;

/** Distance the block travels once released. */
export const PUSH_TRAVEL = 0x10;

/**
 * @typedef {object} PushBlock
 * @property {number} x
 * @property {number} y
 * @property {number} homeX  Spawn tile (baked room art cleared here while sprite is live)
 * @property {number} homeY
 * @property {number} dir
 * @property {number} state
 * @property {number} pushTimer
 * @property {number} traveled
 * @property {boolean} complete  BlockPushComplete ≥ 1
 * @property {number} [roomId]  Occupying cell this block belongs to
 * @property {boolean} [heldThisFrame]  Someone shoved this face this frame
 */

/**
 * Find the NES push-block tile ($B0) in a floor grid.
 * NES FindAndCreatePushBlockObject scans play-area row $A (screen Y $90),
 * which is floor row 6 (FLOOR_ORIGIN.row = 4).
 * @param {number[][]} floorTiles 14×24 from roomToTileGrid
 * @returns {{ col: number, row: number } | null}
 */
export function findPushBlockTile(floorTiles) {
  if (!floorTiles?.length) return null;
  const preferRow = 6; // play row $A
  if (floorTiles[preferRow]) {
    for (let col = 4; col < floorTiles[preferRow].length - 2; col += 1) {
      if (floorTiles[preferRow][col] === 0xb0) return { col, row: preferRow };
    }
  }
  // Fallback: first $B0 (unusual layouts).
  for (let row = 0; row < floorTiles.length; row += 1) {
    for (let col = 0; col < floorTiles[row].length; col += 1) {
      if (floorTiles[row][col] === 0xb0) return { col, row };
    }
  }
  return null;
}

/**
 * Expand a UW primary CHR into the 2×2 WriteSquareUW tile list (UL, LL, UR, LR).
 * @param {number} primary e.g. $B0 block or $74 floor
 * @returns {[number, number, number, number]}
 */
export function pushBlockSquareTiles(primary) {
  const p = primary & 0xff;
  if (p >= 0x70 && p < 0xf3) {
    return [p, p + 1, p + 2, p + 3];
  }
  return [p, p, p, p];
}

/**
 * @param {object} room
 * @param {{ x: number, y: number }} origin
 * @param {number[][]} floorTiles
 * @returns {PushBlock | null}
 */
export function createPushBlock(room, origin, floorTiles) {
  if (!room?.pushable) return null;
  const tile = findPushBlockTile(floorTiles);
  if (!tile) return null;
  const x = origin.x + tile.col * 8;
  const y = origin.y + tile.row * 8;
  return {
    roomId: room.roomId != null ? room.roomId & 0xff : undefined,
    x,
    y,
    homeX: x,
    homeY: y,
    dir: 0,
    state: PUSH_STATE.IDLE,
    pushTimer: 0,
    traveled: 0,
    complete: false,
    heldThisFrame: false,
  };
}

/**
 * True if Link is aligned and holding the correct direction into the block.
 * @param {PushBlock} block
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number} inputDir single-bit facing from pad (or 0)
 */
export function linkPushingBlock(block, link, inputDir) {
  if (!inputDir) return false;
  const linkY = link.y + 3;
  // NES: exact X or (Y+3) match — no ±4 soft align.
  // Aligned on X → vertical push.
  if (link.x === block.x) {
    const dy = linkY - block.y;
    if (dy >= 0 && dy < 0x11 && (inputDir & DIR.UP)) return true;
    if (dy <= 0 && dy > -0x11 && (inputDir & DIR.DOWN)) return true;
    return false;
  }
  // Aligned on Y → horizontal push.
  if (linkY === block.y) {
    const dx = link.x - block.x;
    if (dx >= 0 && dx < 0x11 && (inputDir & DIR.LEFT)) return true;
    if (dx <= 0 && dx > -0x11 && (inputDir & DIR.RIGHT)) return true;
  }
  return false;
}

/**
 * While shoving a block face from the neighboring walk row (±$10), ease Link
 * onto the NES align axis one pixel per frame. Exact CMP align is easy to miss
 * visually because the block metatile is 16px tall/wide.
 *
 * @param {PushBlock} block
 * @param {{ x: number, y: number, gridOffset?: number }} link
 * @param {number} inputDir
 * @returns {'up' | 'down' | 'left' | 'right' | null} nudge direction, if any
 */
export function nudgeLinkOntoPushAxis(block, link, inputDir) {
  if (!block || !inputDir || !link) return null;
  if (block.state !== PUSH_STATE.IDLE) return null;
  const linkY = link.y + 3;
  const dx = link.x - block.x;
  const dy = linkY - block.y;

  // Horizontal face: pressing into the block, one walk-row off on Y.
  if (
    ((inputDir & DIR.RIGHT) && dx <= 0 && dx > -0x11)
    || ((inputDir & DIR.LEFT) && dx >= 0 && dx < 0x11)
  ) {
    if (dy === 0) return null;
    if (Math.abs(dy) > 0x10) return null;
    if (dy < 0) {
      link.y += 1;
      link.gridOffset = 0;
      return 'down';
    }
    link.y -= 1;
    link.gridOffset = 0;
    return 'up';
  }

  // Vertical face: pressing into the block, one walk-column off on X.
  if (
    ((inputDir & DIR.UP) && dy >= 0 && dy < 0x11)
    || ((inputDir & DIR.DOWN) && dy <= 0 && dy > -0x11)
  ) {
    if (dx === 0) return null;
    if (Math.abs(dx) > 0x10) return null;
    if (dx < 0) {
      link.x += 1;
      link.gridOffset = 0;
      return 'right';
    }
    link.x -= 1;
    link.gridOffset = 0;
    return 'left';
  }
  return null;
}

/**
 * @param {PushBlock} block
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number} inputDir
 * @param {boolean} roomCleared
 * @param {{ persistTimer?: boolean }} [opts]
 * @returns {{ justCompleted: boolean }}
 */
export function stepPushBlock(block, link, inputDir, roomCleared, opts = {}) {
  if (!block || block.state === PUSH_STATE.DONE) {
    return { justCompleted: false };
  }

  if (block.state === PUSH_STATE.MOVING) {
    const step = 1;
    if (block.dir & DIR.UP) block.y -= step;
    if (block.dir & DIR.DOWN) block.y += step;
    if (block.dir & DIR.LEFT) block.x -= step;
    if (block.dir & DIR.RIGHT) block.x += step;
    block.traveled += step;
    if (block.traveled >= PUSH_TRAVEL) {
      block.state = PUSH_STATE.DONE;
      block.complete = true;
      return { justCompleted: true };
    }
    return { justCompleted: false };
  }

  // Idle: require room clear (NES RoomAllDead).
  if (!roomCleared) {
    block.pushTimer = 0;
    return { justCompleted: false };
  }

  if (!linkPushingBlock(block, link, inputDir)) {
    // An ally standing elsewhere must not wipe a hold in progress.
    if (!opts.persistTimer) block.pushTimer = 0;
    return { justCompleted: false };
  }

  block.pushTimer += 1;
  if (block.pushTimer < PUSH_HOLD_FRAMES) {
    return { justCompleted: false };
  }

  block.dir = inputDir;
  block.state = PUSH_STATE.MOVING;
  block.traveled = 0;
  return { justCompleted: false };
}

/**
 * Once per world per frame: drop holds nobody renewed last tick.
 * @param {Iterable<PushBlock | null | undefined>} blocks
 */
export function beginPushBlockFrame(blocks) {
  for (const b of blocks) {
    if (!b || b.state !== PUSH_STATE.IDLE) continue;
    if (!b.heldThisFrame) b.pushTimer = 0;
    b.heldThisFrame = false;
  }
}

/**
 * Whether a completed push should open shutters (secret effect 4).
 * @param {object} room
 */
export function pushOpensShutters(room) {
  return (room?.specialItem?.effectType ?? 0) === SECRET.BLOCK_DOOR;
}

/**
 * Whether a completed push should spawn stairs (secret effect 5).
 * @param {object} room
 */
export function pushSpawnsStairs(room) {
  return (room?.specialItem?.effectType ?? 0) === SECRET.BLOCK_STAIRS;
}

/** NES BLOCK_STAIRS stairs square (screen X/Y of top-left of 2×2). */
export const BLOCK_STAIRS_POS = Object.freeze({ x: 0xd0, y: 0x60 });

/** UW stairs primary metatile (WriteSquareUW expands to $70–$73). */
export const BLOCK_STAIRS_TILE = 0x70;

/** 16×16 sprite / tile square of a push block. */
export const PUSH_BLOCK_SIZE = 16;

/**
 * Write a WriteSquareUW 2×2 into a 22×32 play grid at screen pixels.
 * @param {number[][]} tileGrid
 * @param {number} screenX
 * @param {number} screenY  includes HUD
 * @param {number} primary
 */
export function writeSquareAtPlayGrid(tileGrid, screenX, screenY, primary) {
  if (!tileGrid?.length) return;
  const [ul, ll, ur, lr] = pushBlockSquareTiles(primary);
  const tiles = [
    [ul, ur],
    [ll, lr],
  ];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const c = Math.floor((screenX + col * 8) / 8);
      const r = Math.floor((screenY + row * 8 - HUD_HEIGHT) / 8);
      if (tileGrid[r]) tileGrid[r][c] = tiles[row][col];
    }
  }
}

/**
 * @param {PushBlock | null | undefined} block
 * @param {number} x  screen X
 * @param {number} y  screen Y (includes HUD)
 */
export function pointInPushBlock(block, x, y) {
  if (!block) return false;
  return (
    x >= block.x
    && x < block.x + PUSH_BLOCK_SIZE
    && y >= block.y
    && y < block.y + PUSH_BLOCK_SIZE
  );
}

/**
 * While MOVING, home is already floor and dest is not yet $B0. Probe the
 * sprite the same way tiles are probed so Link cannot walk through it.
 * @param {PushBlock | null | undefined} block
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir
 */
export function movingPushBlockBlocksDir(block, linkX, linkY, dir) {
  if (!block || block.state !== PUSH_STATE.MOVING || !dir) return false;
  return collisionSamplePoints(linkX, linkY, dir).some((p) => pointInPushBlock(block, p.x, p.y));
}

/**
 * @param {PushBlock | null | undefined} block
 * @param {number} linkX
 * @param {number} linkY
 */
export function standingInMovingPushBlock(block, linkX, linkY) {
  if (!block || block.state !== PUSH_STATE.MOVING) return false;
  const x = Math.floor(linkX / 8) * 8;
  const y = linkY + LINK_HOTSPOT_Y;
  return pointInPushBlock(block, x, y);
}

/**
 * tileOpts overlay so walk / shove / eject all see the sliding sprite.
 * @param {PushBlock | null | undefined} block
 */
export function pushBlockWalkOpts(block) {
  if (!block || block.state !== PUSH_STATE.MOVING) return {};
  return {
    blockedBy: (x, y, dir) => movingPushBlockBlocksDir(block, x, y, dir),
    standingBlocked: (x, y) => standingInMovingPushBlock(block, x, y),
  };
}
