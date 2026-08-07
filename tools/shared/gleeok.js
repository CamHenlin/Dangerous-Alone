/**
 * Gleeok neck / body helpers (NES InitGleeok / UpdateGleeok / Gleeok_DrawBody).
 * Simplified stretch: segments lerp between a fixed base and a wandering head.
 */

import { gleeokHeadCount, isGleeok } from './bosses.js';

/** NES Gleeok_DrawBody — body top-left. */
export const GLEEOK_BODY_X = 0x74;
export const GLEEOK_BODY_Y = 0x57;

/** Composite canvas covers wandering necks under the body. */
export const GLEEOK_CANVAS_OX = 0x40;
export const GLEEOK_CANVAS_OY = 0x50;
export const GLEEOK_CANVAS_W = 0x90;
export const GLEEOK_CANVAS_H = 0x80;

/** Shared neck base (InitGleeok segment 0). */
export const GLEEOK_BASE_X = 0x7c;
export const GLEEOK_BASE_Y = 0x6f;

/** Initial segment Y column (GleeokSegmentYs). */
export const GLEEOK_SEGMENT_YS = Object.freeze([0x6f, 0x74, 0x79, 0x7e, 0x83, 0x88]);

/** Neck segment / attached head CHR (Gleeok_DrawSegment). */
export const GLEEOK_NECK_TILE = 0xda;
export const GLEEOK_HEAD_TILE = 0xdc;

/**
 * Body animation frames — NES GleeokBodyTiles0/1/2 row-major (3×2 of 8×16 tops).
 * Cycle uses BaseTileOffsets $06,$00,$06,$0C into concat(tiles0,tiles1,tiles2).
 */
export const GLEEOK_BODY_FRAMES = Object.freeze([
  // offset $06 → tiles1
  Object.freeze([0xcc, 0xc4, 0xce, 0xc2, 0xc6, 0xd0]),
  // offset $00 → tiles0
  Object.freeze([0xc0, 0xc4, 0xc8, 0xc2, 0xc6, 0xca]),
  // offset $06 → tiles1
  Object.freeze([0xcc, 0xc4, 0xce, 0xc2, 0xc6, 0xd0]),
  // offset $0C → tiles2
  Object.freeze([0xd2, 0xd6, 0xd8, 0xd4, 0xc6, 0xd0]),
]);

export const GLEEOK_BODY_CELL = Object.freeze([
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 16, y: 0 },
  { x: 0, y: 16 },
  { x: 8, y: 16 },
  { x: 16, y: 16 },
]);

/**
 * @typedef {{
 *   headX: number,
 *   headY: number,
 *   speedX: number,
 *   speedY: number,
 *   delay: number,
 *   dirCounterH: number,
 *   dirCounterV: number,
 *   dirChangeCounter: number,
 *   segs: { x: number, y: number }[],
 * }} GleeokNeck
 */

/**
 * @param {number} neckIndex
 * @returns {GleeokNeck}
 */
export function createGleeokNeck(neckIndex) {
  const segs = GLEEOK_SEGMENT_YS.map((y) => ({ x: GLEEOK_BASE_X, y }));
  // Stagger start delays like InitGleeok (0, 12, 24, 36).
  const delay = neckIndex * 12;
  return {
    headX: GLEEOK_BASE_X,
    headY: GLEEOK_SEGMENT_YS[5],
    // NES: necks 0/2 start decelerating on X; 1/3 on Y (speed flag $FF = subtract).
    speedX: neckIndex % 2 === 0 ? 0xff : 0,
    speedY: neckIndex % 2 === 1 ? 0xff : 0,
    delay,
    dirCounterH: 6,
    dirCounterV: 3,
    dirChangeCounter: 0,
    segs,
  };
}

/**
 * @param {import('./enemies.js').Enemy} e
 */
export function initGleeok(e) {
  const n = gleeokHeadCount(e.objType);
  e.x = GLEEOK_BODY_X;
  e.y = GLEEOK_BODY_Y;
  e.headHp = Array.from({ length: n }, () => 0xa0);
  e.headsAlive = n;
  e.hp = n * 0xa0;
  e.bodyAnimFrame = 0;
  e.bodyAnimTimer = 0x10;
  e.writhing = 0;
  e.necks = Array.from({ length: n }, (_, i) => createGleeokNeck(i));
  for (const neck of e.necks) stretchGleeokNeck(neck);
}

/**
 * @param {number} value
 * @param {number} speedFlag 0 = +1, nonzero = −1
 */
function changeBySpeedFlag(value, speedFlag) {
  return speedFlag ? value - 1 : value + 1;
}

/**
 * Recompute middle segments between fixed base and head.
 * @param {GleeokNeck} neck
 */
export function stretchGleeokNeck(neck) {
  const baseX = GLEEOK_BASE_X;
  const baseY = GLEEOK_BASE_Y;
  const { headX, headY } = neck;
  neck.segs = [];
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    neck.segs.push({
      x: Math.round(baseX + (headX - baseX) * t),
      y: Math.round(baseY + (headY - baseY) * t),
    });
  }
  neck.headX = headX;
  neck.headY = headY;
}

/**
 * One neck’s head motion (Gleeok_MoveHead) + stretch.
 * @param {GleeokNeck} neck
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
export function stepGleeokNeck(neck, bounds) {
  if (neck.delay > 0) {
    neck.delay -= 1;
    stretchGleeokNeck(neck);
    return;
  }
  neck.headX = changeBySpeedFlag(neck.headX, neck.speedX);
  neck.headY = changeBySpeedFlag(neck.headY, neck.speedY);

  // Keep heads under the body in the boss arena.
  const minX = Math.max(bounds.minX + 8, 0x40);
  const maxX = Math.min(bounds.maxX - 8, 0xc0);
  const minY = Math.max(bounds.minY + 8, 0x70);
  const maxY = Math.min(bounds.maxY - 8, 0xb8);
  if (neck.headX < minX) {
    neck.headX = minX;
    neck.speedX = 0;
  } else if (neck.headX > maxX) {
    neck.headX = maxX;
    neck.speedX = 0xff;
  }
  if (neck.headY < minY) {
    neck.headY = minY;
    neck.speedY = 0;
  } else if (neck.headY > maxY) {
    neck.headY = maxY;
    neck.speedY = 0xff;
  }

  neck.dirChangeCounter = (neck.dirChangeCounter + 1) & 0xff;
  if (neck.dirChangeCounter >= 4) {
    neck.dirChangeCounter = 0;
    neck.dirCounterH += 1;
    if (neck.dirCounterH >= 0x0c) {
      neck.dirCounterH = 0;
      neck.speedX ^= 0xff;
    }
    neck.dirCounterV += 1;
    if (neck.dirCounterV >= 6) {
      neck.dirCounterV = 0;
      neck.speedY ^= 0xff;
    }
  }
  stretchGleeokNeck(neck);
}

/**
 * @param {import('./enemies.js').Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number} [frameCounter] used so one neck moves per frame like NES
 */
export function stepGleeok(e, bounds, frameCounter = 0) {
  if (!isGleeok(e.objType) || !e.necks) return;
  // Keep body pinned (spawn XY from room attrs must not drift).
  e.x = GLEEOK_BODY_X;
  e.y = GLEEOK_BODY_Y;

  e.bodyAnimTimer = (e.bodyAnimTimer ?? 1) - 1;
  if (e.bodyAnimTimer <= 0) {
    const period = (e.writhing ?? 0) > 0 ? 6 : 0x10;
    if ((e.writhing ?? 0) > 0) e.writhing -= 1;
    e.bodyAnimTimer = period;
    e.bodyAnimFrame = ((e.bodyAnimFrame ?? 0) + 1) & 3;
  }

  const necks = e.necks;
  const hps = e.headHp ?? [];
  for (let i = 0; i < necks.length; i += 1) {
    if (!(hps[i] > 0)) continue;
    // NES: one neck moves per frame (FrameCounter & 3).
    if ((frameCounter & 3) === (i & 3)) {
      stepGleeokNeck(necks[i], bounds);
    } else {
      stretchGleeokNeck(necks[i]);
    }
  }
}

/**
 * Head screen position for detach / projectiles.
 * @param {import('./enemies.js').Enemy} body
 * @param {number} neckIndex
 */
export function gleeokHeadPos(body, neckIndex) {
  const neck = body.necks?.[neckIndex];
  if (neck) return { x: neck.headX, y: neck.headY };
  return { x: body.x + 8, y: body.y + 24 };
}

/**
 * True if Link overlaps any living head (rough 16×16) or the body trunk.
 * @param {import('./enemies.js').Enemy} e
 * @param {number} linkX
 * @param {number} linkY
 */
export function gleeokTouchesLink(e, linkX, linkY) {
  if (!e.necks || !e.headHp) return false;
  for (let i = 0; i < e.necks.length; i += 1) {
    if (!(e.headHp[i] > 0)) continue;
    const { headX, headY } = e.necks[i];
    if (Math.abs(headX - linkX) < 12 && Math.abs(headY - linkY) < 12) return true;
  }
  return (
    Math.abs(e.x + 4 - linkX) < 14
    && Math.abs(e.y + 8 - linkY) < 18
  );
}

/**
 * Sword / projectile hit test — NES collides head + neck base.
 * @param {import('./enemies.js').Enemy} e
 * @param {{ x: number, y: number, w: number, h: number }} box
 */
export function gleeokOverlapsHitbox(e, box) {
  if (!box) return false;
  const body = { x: e.x, y: e.y, w: 24, h: 32 };
  if (rectsOverlapSimple(box, body)) return true;
  if (!e.necks || !e.headHp) return false;
  for (let i = 0; i < e.necks.length; i += 1) {
    if (!(e.headHp[i] > 0)) continue;
    const neck = e.necks[i];
    const head = { x: neck.headX, y: neck.headY, w: 16, h: 16 };
    if (rectsOverlapSimple(box, head)) return true;
    const base = neck.segs?.[0];
    if (base && rectsOverlapSimple(box, { x: base.x, y: base.y, w: 8, h: 16 })) return true;
  }
  return false;
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
function rectsOverlapSimple(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
