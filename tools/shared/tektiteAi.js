/**
 * Simplified UpdateTektiteOrBoulder hop arcs.
 */

import { DIR } from './collision.js';
import { BOULDER, boulderScrapY, pointBoulderDownward } from './boulder.js';

/** Destination Y deltas indexed by NES dir bit (approx JumperYOffsets). */
const JUMP_DY = Object.freeze({
  [DIR.UP]: -0x20,
  [DIR.DOWN]: 0x20,
  [DIR.LEFT]: 0,
  [DIR.RIGHT]: 0,
  [DIR.UP | DIR.LEFT]: -0x20,
  [DIR.UP | DIR.RIGHT]: -0x20,
  [DIR.DOWN | DIR.LEFT]: 0x20,
  [DIR.DOWN | DIR.RIGHT]: 0x20,
});

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ x: number, y: number } | null | undefined} chase
 * @param {{ anchorRoomId?: number | null }} [opts]
 */
export function stepTektite(e, bounds, chase, opts = {}) {
  const isBoulder = e.objType === BOULDER;
  // State 0 = ground; 1 = airborne.
  const state = e.jumperState ?? 0;
  if (state === 0) {
    if ((e.timer ?? 0) > 0) return;
    // Face toward chase (TurnTowardsPlayer8 approx).
    if (chase) {
      const dx = chase.x - e.x;
      const dy = chase.y - e.y;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx >= 0 ? DIR.RIGHT : DIR.LEFT;
      else e.dir = dy >= 0 ? DIR.DOWN : DIR.UP;
      // Prefer diagonal-ish by OR'ing horizontal when mostly vertical.
      if ((e.dir & (DIR.UP | DIR.DOWN)) && Math.abs(dx) > 4) {
        e.dir |= dx >= 0 ? DIR.RIGHT : DIR.LEFT;
      }
    } else {
      e.dir = DIR.DOWN | DIR.RIGHT;
    }
    if (isBoulder) pointBoulderDownward(e);
    e.jumperState = 1;
    e.jumperTargetY = e.y + (JUMP_DY[e.dir & 0x0f] ?? 0x20);
    // Boulder start hi-byte $FE; tektite ~$FD.
    e.jumperVy = isBoulder ? -2 : -3;
    e.timer = 0;
    return;
  }

  if (isBoulder) pointBoulderDownward(e);

  // Airborne: apply gravity-ish accel and move.
  // Boulder uses a steeper downward accel set in NES.
  e.jumperVy = (e.jumperVy ?? 0) + (isBoulder ? 0.5 : 0.35);
  const vx = (e.dir & DIR.RIGHT ? 1 : 0) - (e.dir & DIR.LEFT ? 1 : 0);
  e.x += vx;
  e.y += e.jumperVy;

  // Bound
  if (e.x < bounds.minX) {
    e.x = bounds.minX;
    e.dir = (e.dir & ~DIR.LEFT) | DIR.RIGHT;
  }
  if (e.x > bounds.maxX) {
    e.x = bounds.maxX;
    e.dir = (e.dir & ~DIR.RIGHT) | DIR.LEFT;
  }
  if (e.y < bounds.minY) {
    e.y = bounds.minY;
    e.jumperVy = Math.abs(e.jumperVy ?? 1);
  }

  // Boulder scrap zone — DestroyMonster when Y >= $F0 of the home cell.
  const scrapY = boulderScrapY(e.homeRoomId, opts.anchorRoomId);
  if (isBoulder && e.y >= scrapY) {
    e.alive = false;
    e.hp = 0;
    return;
  }

  if (!isBoulder && e.y > bounds.maxY) {
    e.y = bounds.maxY;
    land(e, false);
    return;
  }

  // Land when falling past target Y.
  if ((e.jumperVy ?? 0) > 0 && e.y >= (e.jumperTargetY ?? e.y)) {
    e.y = e.jumperTargetY ?? e.y;
    land(e, isBoulder);
  }
}

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {boolean} isBoulder
 */
function land(e, isBoulder) {
  e.jumperState = 0;
  // Boulder lands with the residual Abs distance (< 3) as timer.
  e.timer = isBoulder ? 1 : 20 + ((e.anim ?? 0) & 0x1f);
  e.jumperVy = 0;
}
