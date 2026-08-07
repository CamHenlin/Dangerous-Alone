/**
 * Multi-part boss / worm sprite layouts (ObjAnimFrameHeap + draw routines).
 * Play composites these onto boss / UW / common sheets.
 */

import { DIR } from './collision.js';
import { BOSS, CHILD_DIGDOGGER, PATRA_CHILD, PATRA_CHILD_RED } from './bosses.js';
import {
  GLEEOK_BODY_CELL,
  GLEEOK_BODY_FRAMES,
  GLEEOK_BODY_X,
  GLEEOK_BODY_Y,
  GLEEOK_CANVAS_OX,
  GLEEOK_CANVAS_OY,
} from './gleeok.js';
import { MOLDORM, RED_LAMNOLA, BLUE_LAMNOLA } from './moldormLamnola.js';
import { GRUMBLE } from './grumble.js';

/** Manhandla: body + 4 mouths. Canvas 48×48; body at (16,16) → draw offset (−16,−16). */
export const MANHANDLA_PARTS = Object.freeze([
  { key: 'body', tile: 0xec, x: 16, y: 16, mirror: true, flipH: false, flipV: false, mouth: -1 },
  { key: 'up', tile: 0xe8, x: 16, y: 0, mirror: true, flipH: false, flipV: false, mouth: 0 },
  { key: 'down', tile: 0xe8, x: 16, y: 32, mirror: true, flipH: false, flipV: true, mouth: 1 },
  { key: 'left', tile: 0xe0, x: 0, y: 16, mirror: false, flipH: false, flipV: false, mouth: 2 },
  { key: 'right', tile: 0xe0, x: 32, y: 16, mirror: false, flipH: true, flipV: false, mouth: 3 },
]);

/** Digdogger big form: 2×2 of 16×16 from tile $D4 (V-flip bottom). */
export const DIGDOGGER_BIG_PARTS = Object.freeze([
  { tile: 0xd4, x: 0, y: 0, flipH: false, flipV: false },
  { tile: 0xd4, x: 16, y: 0, flipH: true, flipV: false },
  { tile: 0xd4, x: 0, y: 16, flipH: false, flipV: true },
  { tile: 0xd4, x: 16, y: 16, flipH: true, flipV: true },
]);

/** Gohma: legs at ±$10, eye center. Canvas 48×16; offset (−16, 0). */
export const GOHMA_PARTS = Object.freeze([
  { key: 'legL', tile: 0xf0, x: 0, y: 0, mirror: false, flipH: false },
  { key: 'eye', tile: 0xf4, x: 16, y: 0, mirror: true, flipH: false },
  { key: 'legR', tile: 0xf0, x: 32, y: 0, mirror: false, flipH: true },
]);

/** Gleeok body frame 0 (GleeokBodyTiles0) — 3×2 of 8×16 tops. */
export const GLEEOK_BODY_TILES = GLEEOK_BODY_FRAMES[1];
export const GLEEOK_BODY_OFFSETS = GLEEOK_BODY_CELL;
export { GLEEOK_BODY_FRAMES, GLEEOK_BODY_CELL };

/** Ganon frame 0 corners (32×32). */
export const GANON_CORNERS = Object.freeze([
  { tile: 0xc0, x: 0, y: 0, flipH: false },
  { tile: 0xc4, x: 16, y: 0, flipH: true },
  { tile: 0xc8, x: 0, y: 16, flipH: false },
  { tile: 0xcc, x: 16, y: 16, flipH: true },
]);

/**
 * Dodongo walk tiles (ObjAnimFrameHeap / Dodongo_Draw).
 * Horizontal: two abutting 16×16 halves; LEFT swaps halves and H-flips both.
 * @param {number} dir
 * @param {number} [animFrame] 0 or 1 (every 8 screen frames)
 * @returns {{
 *   side: boolean,
 *   flipH: boolean,
 *   leftTile: number,
 *   rightTile: number | null,
 * }}
 */
export function dodongoWalkDraw(dir, animFrame = 0) {
  const anim = animFrame & 1;
  // Vertical: single 16×16 (mirrored pair); frame image is the same for both anims.
  if (dir & DIR.UP) {
    return { side: false, flipH: false, mirror: true, leftTile: 0xfa, rightTile: null };
  }
  if (dir & DIR.DOWN) {
    return { side: false, flipH: false, mirror: true, leftTile: 0xf4, rightTile: null };
  }
  // Side walk: anim0 $DC/$E0, anim1 $E4/$E8. LEFT swaps halves + HFlip both.
  const base = anim ? 0xe4 : 0xdc;
  const facingLeft = Boolean(dir & DIR.LEFT);
  return {
    side: true,
    flipH: facingLeft,
    mirror: false,
    leftTile: facingLeft ? base + 4 : base,
    rightTile: facingLeft ? base : base + 4,
  };
}

/**
 * Dodongo bloated tiles (DodongoFrameImagesBloated / frame images $04/$05/$07/$09).
 * Horizontal: $EC/$F0; DOWN $F8 mirrored; UP $FE mirrored.
 * @param {number} dir
 * @returns {{
 *   side: boolean,
 *   flipH: boolean,
 *   mirror: boolean,
 *   leftTile: number,
 *   rightTile: number | null,
 * }}
 */
export function dodongoBloatedDraw(dir) {
  if (dir & DIR.UP) {
    return { side: false, flipH: false, mirror: true, leftTile: 0xfe, rightTile: null };
  }
  if (dir & DIR.DOWN) {
    return { side: false, flipH: false, mirror: true, leftTile: 0xf8, rightTile: null };
  }
  const facingLeft = Boolean(dir & DIR.LEFT);
  return {
    side: true,
    flipH: facingLeft,
    mirror: false,
    leftTile: facingLeft ? 0xf0 : 0xec,
    rightTile: facingLeft ? 0xec : 0xf0,
  };
}

/**
 * @param {number} dir
 * @deprecated use dodongoWalkDraw
 */
export function dodongoFrameTile(dir) {
  return dodongoWalkDraw(dir, 0).leftTile;
}

/**
 * Types drawn via dedicated multi-part composers (not FRAME_TILES alone).
 * @param {number} objType
 */
export function hasBossComposer(objType) {
  return (
    objType === BOSS.MANHANDLA
    || objType === BOSS.DIGDOGGER
    || objType === BOSS.DIGDOGGER_1
    || objType === BOSS.GOHMA
    || objType === BOSS.GOHMA_RED
    || objType === BOSS.DODONGO
    || objType === BOSS.DODONGO_1
    || objType === BOSS.GLEEOK_2
    || objType === BOSS.GLEEOK_3
    || objType === BOSS.GLEEOK_4
    || objType === BOSS.GANON
  );
}

/**
 * Screen-space offset so composite origin matches NES ObjX/ObjY (body/center).
 * @param {number} objType
 */
export function enemySpriteOffset(objType) {
  if (objType === BOSS.MANHANDLA) return { x: -16, y: -16 };
  if (objType === BOSS.GOHMA || objType === BOSS.GOHMA_RED) return { x: -16, y: 0 };
  if (
    objType === BOSS.GLEEOK_2
    || objType === BOSS.GLEEOK_3
    || objType === BOSS.GLEEOK_4
  ) {
    // Composite origin is canvas top-left; ObjX/Y stay at NES body ($74,$57).
    return { x: GLEEOK_CANVAS_OX - GLEEOK_BODY_X, y: GLEEOK_CANVAS_OY - GLEEOK_BODY_Y };
  }
  // Narrow item fairy / rupee stash: center 8×16 in the 16px object slot.
  if (objType === 0x2f || objType === 0x35) return { x: 4, y: 0 };
  return { x: 0, y: 0 };
}

/**
 * Half-width (8×16) draw — gels, moldorm segments, lamnola segments.
 * @param {number} objType
 */
export function enemyHalfSprite(objType) {
  return (
    objType === 0x14
    || objType === 0x15
    || objType === 0x2f // pond fairy
    || objType === 0x35 // rupee stash
    || objType === MOLDORM
    || objType === RED_LAMNOLA
    || objType === BLUE_LAMNOLA
  );
}

export {
  BOSS,
  CHILD_DIGDOGGER,
  PATRA_CHILD,
  PATRA_CHILD_RED,
  MOLDORM,
  RED_LAMNOLA,
  BLUE_LAMNOLA,
  GRUMBLE,
};
