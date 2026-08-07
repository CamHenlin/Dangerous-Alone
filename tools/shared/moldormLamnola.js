/**
 * Moldorm ($41) / Lamnola ($3A/$3B) — multi-segment worms (Z_04).
 *
 * ROM `InitMoldorm` / `InitLamnola` build **10 segments, 2 heads** (slots 5 and
 * `$A`) — two independent 5-seg chains. Hits shorten from the tail; each head
 * leads its own body.
 */

import { DIR } from './collision.js';

export const MOLDORM = 0x41;
export const RED_LAMNOLA = 0x3a;
export const BLUE_LAMNOLA = 0x3b;

/** Segments per head (`InitMoldorm` / `InitLamnola` loop of 10 ÷ 2 heads). */
export const WORM_SEGMENTS = 5;
/** Two heads, matching ObjDir+5 / ObjDir+$A. */
export const WORM_CHAINS = 2;

export function isWormType(objType) {
  return objType === MOLDORM || objType === RED_LAMNOLA || objType === BLUE_LAMNOLA;
}

export function isLamnola(objType) {
  return objType === RED_LAMNOLA || objType === BLUE_LAMNOLA;
}

/**
 * @param {number} objType
 */
export function wormSpeed(objType) {
  if (objType === BLUE_LAMNOLA) return 2;
  if (objType === RED_LAMNOLA) return 1;
  return 1; // moldorm paces every other frame
}

/** Initial facing for each chain head (ROM picks random 8-way; cardinal OK). */
const CHAIN_DIRS = Object.freeze([DIR.UP, DIR.DOWN]);

/**
 * Expand a worm spawn into two 5-segment chains (10 objects total).
 * @param {{ objType: number, x: number, y: number, slotIndex?: number }} spawn
 * @param {(spawn: object) => object | null} createEnemy
 */
export function expandWorm(spawn, createEnemy) {
  if (!isWormType(spawn.objType)) return [];
  const isMoldorm = spawn.objType === MOLDORM;
  const hx = isMoldorm ? 0x80 : 0x40;
  const hy = isMoldorm ? 0x70 : 0x8d;
  /** @type {object[]} */
  const out = [];
  let slot = spawn.slotIndex ?? 1;
  for (let chain = 0; chain < WORM_CHAINS; chain += 1) {
    let head = null;
    // Nudge the second head so the two piles are not perfectly stacked.
    const ox = chain * 16;
    for (let i = 0; i < WORM_SEGMENTS; i += 1) {
      const seg = createEnemy({
        objType: spawn.objType,
        x: hx + ox - i * 8,
        y: hy,
        slotIndex: slot++,
        dir: CHAIN_DIRS[chain],
      });
      if (!seg) continue;
      seg.wormIndex = i;
      seg.wormHead = i === 0;
      seg.wormChain = chain;
      seg.hp = 0x20;
      seg.qSpeed = wormSpeed(spawn.objType);
      seg.history = [];
      seg.dir = CHAIN_DIRS[chain];
      if (i === 0) {
        head = seg;
        seg.wormId = seg.id;
      } else if (head) {
        seg.wormId = head.id;
        seg.npc = false;
      }
      out.push(seg);
    }
  }
  return out;
}

/**
 * Step head; body segments follow recorded head path.
 * @param {object} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ x: number, y: number } | null} chase
 * @param {object[]} enemies
 */
export function stepWorm(e, bounds, chase, enemies) {
  if (!e.alive || !isWormType(e.objType)) return;
  if (!e.wormHead) {
    followHead(e, enemies);
    return;
  }
  // Head AI.
  e.timer = (e.timer ?? 0) - 1;
  if (e.timer <= 0) {
    e.timer = isLamnola(e.objType) ? 16 : 12;
    if (chase) {
      const dx = chase.x - e.x;
      const dy = chase.y - e.y;
      if (isLamnola(e.objType)) {
        // Axis-aligned.
        e.dir = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? DIR.RIGHT : DIR.LEFT)
          : (dy > 0 ? DIR.DOWN : DIR.UP);
      } else {
        e.dir = 0;
        if (Math.abs(dx) > 4) e.dir |= dx > 0 ? DIR.RIGHT : DIR.LEFT;
        if (Math.abs(dy) > 4) e.dir |= dy > 0 ? DIR.DOWN : DIR.UP;
        if (!e.dir) e.dir = DIR.RIGHT;
      }
    }
  }
  const speed = e.qSpeed ?? 1;
  const pace = e.objType === MOLDORM ? ((e.anim & 1) === 0 ? 1 : 0) : 1;
  if (pace) {
    for (let i = 0; i < speed; i += 1) {
      if (e.dir & DIR.LEFT) e.x -= 1;
      if (e.dir & DIR.RIGHT) e.x += 1;
      if (e.dir & DIR.UP) e.y -= 1;
      if (e.dir & DIR.DOWN) e.y += 1;
    }
  }
  if (e.x < bounds.minX + 16) e.dir = DIR.RIGHT;
  if (e.x > bounds.maxX - 16) e.dir = DIR.LEFT;
  if (e.y < bounds.minY + 16) e.dir = DIR.DOWN;
  if (e.y > bounds.maxY - 16) e.dir = DIR.UP;
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));

  e.history = e.history ?? [];
  e.history.unshift({ x: e.x, y: e.y });
  if (e.history.length > WORM_SEGMENTS * 8) e.history.length = WORM_SEGMENTS * 8;
}

function followHead(e, enemies) {
  const head = enemies.find((o) => o.id === e.wormId && o.wormHead);
  if (!head?.alive) {
    e.alive = false;
    return;
  }
  const hist = head.history ?? [];
  const lag = (e.wormIndex ?? 1) * 6;
  const pos = hist[lag] ?? hist[hist.length - 1];
  if (pos) {
    e.x = pos.x;
    e.y = pos.y;
  }
}

/**
 * NES-like: damage kills the current tail segment (shortens worm).
 * @param {object} hit
 * @param {object[]} enemies
 * @param {number} dmg
 * @returns {boolean}
 */
export function damageWorm(hit, enemies, dmg) {
  if (!hit.alive || !isWormType(hit.objType)) return false;
  const family = enemies.filter(
    (o) => o.alive && o.wormId === hit.wormId && isWormType(o.objType),
  );
  if (!family.length) return false;
  // Prefer tail (highest wormIndex).
  family.sort((a, b) => (b.wormIndex ?? 0) - (a.wormIndex ?? 0));
  const tail = family[0];
  tail.hp -= dmg;
  tail.invuln = 12;
  if (tail.hp <= 0) {
    tail.alive = false;
    // If we killed the head (only segment), worm is done.
    if (tail.wormHead) {
      for (const s of family) {
        s.alive = false;
        s.hp = 0;
      }
    } else if (family.length === 2) {
      // Only head remains after this kill — keep head.
    }
  }
  return true;
}
