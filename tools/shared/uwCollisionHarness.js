/**
 * Underworld environment-collision harness.
 *
 * Derives expected Link stop lips from NES GetCollidingTileMoving rules
 * (hotspot ObjY+$0B, dir offset −8/+8/+$10, X&=$F8, firstUnwalkable $78)
 * and walks `stepLink` into every solid run in a room to verify we stop flush
 * with that lip — not a cell early/late.
 */

import {
  DIR,
  HUD_HEIGHT,
  LINK_HOTSPOT_Y,
  UW_FIRST_UNWALKABLE,
  getLinkCollidingTile,
  hitsUwBound,
} from './collision.js';
import {
  LINK_QSPEED,
  UW_ROOM_BOUNDS,
  canLinkMove,
  createLinkState,
  isLinkStandingSolid,
  stepLink,
} from './linkMotion.js';
import { standingTile } from './world.js';

/**
 * @param {number[][]} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function uwTileOpts(tileOpts = {}) {
  return {
    firstUnwalkable: tileOpts.firstUnwalkable ?? UW_FIRST_UNWALKABLE,
    walkableRemap: tileOpts.walkableRemap ?? [],
  };
}

/**
 * Play-area row sampled by Link's still/moving hotspot at ObjY.
 * @param {number} objY
 */
export function hotspotRow(objY) {
  return Math.floor((objY + LINK_HOTSPOT_Y - HUD_HEIGHT) / 8);
}

/**
 * True when tile id is UW-unwalkable (ObjectFirstUnwalkableTile = $78).
 * @param {number} tile
 * @param {number} [firstUnwalkable]
 */
export function isUwSolidTile(tile, firstUnwalkable = UW_FIRST_UNWALKABLE) {
  return (tile & 0xff) >= firstUnwalkable;
}

/**
 * Horizontal solid runs on a play row as [leftPx, rightPxExclusive).
 * @param {number[][]} tileGrid
 * @param {number} row
 * @param {number} [firstUnwalkable]
 * @returns {{ left: number, right: number }[]}
 */
export function solidRunsOnRow(tileGrid, row, firstUnwalkable = UW_FIRST_UNWALKABLE) {
  const line = tileGrid[row];
  if (!line) return [];
  /** @type {{ left: number, right: number }[]} */
  const runs = [];
  let i = 0;
  while (i < line.length) {
    if (!isUwSolidTile(line[i], firstUnwalkable)) {
      i += 1;
      continue;
    }
    const left = i * 8;
    while (i < line.length && isUwSolidTile(line[i], firstUnwalkable)) i += 1;
    runs.push({ left, right: i * 8 });
  }
  return runs;
}

/**
 * NES left-stop lip for a solid run: smallest ObjX on the 8px walk grid where
 * LEFT look-ahead (ObjX−8)&$F8 lands inside the run.
 * @param {{ left: number, right: number }} run
 */
export function expectedLeftStopX(run) {
  // sample = (x-8)&~7 ∈ [run.left, run.right)  ⇒  x ∈ (run.left, run.right+8]
  // Closest approach from the right on x%8===0 is x === run.right.
  return run.right;
}

/**
 * NES right-stop lip: largest ObjX on the 8px grid where RIGHT look-ahead
 * (ObjX+$10)&$F8 lands inside the run.
 * @param {{ left: number, right: number }} run
 */
export function expectedRightStopX(run) {
  // sample = (x+16)&~7 ∈ [run.left, run.right)
  // From the left, the first blocked aligned X is run.left - 16 (when that
  // sample equals run.left). Example: run=$90..$A0 → stop $80.
  return run.left - 0x10;
}

/**
 * Walk horizontally until blocked. Returns final ObjX.
 * @param {number[][]} tileGrid
 * @param {number} startX
 * @param {number} y
 * @param {number} dir DIR.LEFT | DIR.RIGHT
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 * @param {number} [frames]
 */
export function walkUntilStopped(tileGrid, startX, y, dir, tileOpts = {}, frames = 240) {
  const opts = uwTileOpts(tileOpts);
  const link = createLinkState(startX, y, dir);
  for (let i = 0; i < frames; i += 1) {
    const x0 = link.x;
    stepLink(link, tileGrid, dir, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    if (link.x === x0 && link.gridOffset === 0) break;
  }
  return link;
}

/**
 * Probe one World position for debug / assertions.
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function probeUwCollision(tileGrid, x, y, tileOpts = {}) {
  const opts = uwTileOpts(tileOpts);
  const stand = standingTile(tileGrid, x, y) & 0xff;
  const dirs = {
    left: canLinkMove(tileGrid, x, y, DIR.LEFT, UW_ROOM_BOUNDS, opts),
    right: canLinkMove(tileGrid, x, y, DIR.RIGHT, UW_ROOM_BOUNDS, opts),
    up: canLinkMove(tileGrid, x, y, DIR.UP, UW_ROOM_BOUNDS, opts),
    down: canLinkMove(tileGrid, x, y, DIR.DOWN, UW_ROOM_BOUNDS, opts),
  };
  const look = {
    left: getLinkCollidingTile(tileGrid, x, y, DIR.LEFT, opts),
    right: getLinkCollidingTile(tileGrid, x, y, DIR.RIGHT, opts),
    up: getLinkCollidingTile(tileGrid, x, y, DIR.UP, opts),
    down: getLinkCollidingTile(tileGrid, x, y, DIR.DOWN, opts),
  };
  return {
    x,
    y,
    stand,
    standSolid: isLinkStandingSolid(tileGrid, x, y, opts),
    row: hotspotRow(y),
    dirs,
    look,
    bounds: {
      left: hitsUwBound(x, y, DIR.LEFT),
      right: hitsUwBound(x, y, DIR.RIGHT),
      up: hitsUwBound(x, y, DIR.UP),
      down: hitsUwBound(x, y, DIR.DOWN),
    },
  };
}

/**
 * Format a compact collision readout for the play HUD.
 * @param {ReturnType<typeof probeUwCollision>} probe
 * @param {number} [gridOffset]
 */
export function formatCollisionReadout(probe, gridOffset = 0) {
  const bit = (ok) => (ok ? '.' : 'B');
  const d = probe.dirs;
  const lookL = probe.look.left.tile.toString(16).padStart(2, '0');
  return (
    `x=$${probe.x.toString(16).padStart(2, '0')}`
    + ` y=$${probe.y.toString(16).padStart(2, '0')}`
    + ` go=${gridOffset}`
    + ` stand=$${probe.stand.toString(16).padStart(2, '0')}`
    + ` lookL=$${lookL}`
    + ` UDLR=${bit(d.up)}${bit(d.down)}${bit(d.left)}${bit(d.right)}`
  );
}

/**
 * For every solid run on hotspot rows used by typical walk Y values, approach
 * from both sides and assert stop lips.
 *
 * @param {number[][]} tileGrid
 * @param {object} [opts]
 * @param {number[]} [opts.walkYs] absolute ObjY samples
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts.tileOpts]
 * @returns {{ ok: boolean, failures: string[], checks: number }}
 */
export function runHorizontalFaceApproachSuite(tileGrid, opts = {}) {
  const tileOpts = uwTileOpts(opts.tileOpts);
  const walkYs = opts.walkYs ?? [0x65, 0x6d, 0x85, 0x8d, 0xa5];
  /** @type {string[]} */
  const failures = [];
  let checks = 0;

  for (const y of walkYs) {
    if (y < 0x5e || y >= 0xbd) continue; // inside UW vertical bound for standing walks
    const row = hotspotRow(y);
    const runs = solidRunsOnRow(tileGrid, row, tileOpts.firstUnwalkable).filter(
      // Interior floor obstacles / door faces — skip outer fill columns.
      (r) => r.left >= 0x20 && r.right <= 0xe0,
    );

    for (const run of runs) {
      // Approach from one clear cell away so intervening solids cannot steal the stop.
      const leftLip = expectedLeftStopX(run);
      const leftStart = leftLip + 8;
      if (
        leftStart <= 0xd0
        && !isLinkStandingSolid(tileGrid, leftStart, y, tileOpts)
        && canLinkMove(tileGrid, leftStart, y, DIR.LEFT, UW_ROOM_BOUNDS, tileOpts)
        && !canLinkMove(tileGrid, leftLip, y, DIR.LEFT, UW_ROOM_BOUNDS, tileOpts)
        && getLinkCollidingTile(tileGrid, leftLip, y, DIR.LEFT, tileOpts).walkable === false
      ) {
        checks += 1;
        const link = walkUntilStopped(tileGrid, leftStart, y, DIR.LEFT, tileOpts);
        if (link.x !== leftLip) {
          failures.push(
            `Y=$${y.toString(16)} LEFT into [$${run.left.toString(16)},$${run.right.toString(16)})`
              + ` from $${leftStart.toString(16)}: stop $${link.x.toString(16)} want $${leftLip.toString(16)}`,
          );
        }
        if (isLinkStandingSolid(tileGrid, link.x, link.y, tileOpts)) {
          failures.push(
            `Y=$${y.toString(16)} LEFT stop $${link.x.toString(16)} standing in solid`,
          );
        }
      }

      const rightLip = expectedRightStopX(run);
      const rightStart = rightLip - 8;
      if (
        rightStart >= 0x28
        && rightLip >= 0x20
        && !isLinkStandingSolid(tileGrid, rightStart, y, tileOpts)
        && canLinkMove(tileGrid, rightStart, y, DIR.RIGHT, UW_ROOM_BOUNDS, tileOpts)
        && !canLinkMove(tileGrid, rightLip, y, DIR.RIGHT, UW_ROOM_BOUNDS, tileOpts)
        && getLinkCollidingTile(tileGrid, rightLip, y, DIR.RIGHT, tileOpts).walkable === false
      ) {
        checks += 1;
        const link = walkUntilStopped(tileGrid, rightStart, y, DIR.RIGHT, tileOpts);
        if (link.x !== rightLip) {
          failures.push(
            `Y=$${y.toString(16)} RIGHT into [$${run.left.toString(16)},$${run.right.toString(16)})`
              + ` from $${rightStart.toString(16)}: stop $${link.x.toString(16)} want $${rightLip.toString(16)}`,
          );
        }
      }
    }
  }

  return { ok: failures.length === 0, failures, checks };
}

/**
 * Flag LEFT-blocked cells whose look-ahead solid's right edge is more than
 * 0px left of ObjX (i.e. stopped early with empty floor under the feet line).
 *
 * @param {number[][]} tileGrid
 * @param {object} [opts]
 * @returns {{ ok: boolean, gaps: { x: number, y: number, gap: number, runRight: number }[] }}
 */
export function findEarlyLeftStopGaps(tileGrid, opts = {}) {
  const tileOpts = uwTileOpts(opts.tileOpts);
  const walkYs = opts.walkYs ?? [0x65, 0x6d, 0x85, 0x8d, 0xa5];
  /** @type {{ x: number, y: number, gap: number, runRight: number }[]} */
  const gaps = [];

  for (const y of walkYs) {
    const row = hotspotRow(y);
    for (let x = 0x28; x <= 0xd0; x += 8) {
      if (canLinkMove(tileGrid, x, y, DIR.LEFT, UW_ROOM_BOUNDS, tileOpts)) continue;
      if (hitsUwBound(x, y, DIR.LEFT)) continue;
      const hit = getLinkCollidingTile(tileGrid, x, y, DIR.LEFT, tileOpts);
      if (hit.walkable) continue;
      const sample = (x - 8) & 0xf8;
      let runRight = sample + 8;
      while (
        runRight < 256
        && isUwSolidTile(tileGrid[row][runRight >> 3], tileOpts.firstUnwalkable)
      ) {
        runRight += 8;
      }
      const gap = x - runRight;
      if (gap > 0) gaps.push({ x, y, gap, runRight });
    }
  }
  return { ok: gaps.length === 0, gaps };
}
