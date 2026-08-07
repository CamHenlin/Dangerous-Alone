/**
 * NES UpdateFireball / GetDirectionsAndDistancesToTarget / _CalcDiagonalSpeedIndex.
 * Fireballs ($55/$56) home toward a target with independent X/Y q-speeds.
 */

import { DIR } from './collision.js';

/** FireballQSpeedsX (index 8 → $00, past the table into Y[0]). */
export const FIREBALL_QSPEED_X = Object.freeze([
  0x70, 0x68, 0x60, 0x58, 0x50, 0x3c, 0x26, 0x10, 0x00,
]);

/** FireballQSpeedsY */
export const FIREBALL_QSPEED_Y = Object.freeze([
  0x00, 0x10, 0x26, 0x3c, 0x50, 0x58, 0x60, 0x68, 0x70,
]);

/** Visible delay before movement (ObjTimer = $10). */
export const FIREBALL_DELAY_FRAMES = 0x10;

/**
 * GetDirectionsAndDistancesToTarget (origin → target).
 * @param {number} ox
 * @param {number} oy
 * @param {number} tx
 * @param {number} ty
 */
export function directionsAndDistancesToTarget(ox, oy, tx, ty) {
  let dirX = DIR.LEFT;
  let distX = ox - tx;
  if (distX < 0) {
    dirX = DIR.RIGHT;
    distX = -distX;
  }
  let dirY = DIR.UP;
  let distY = oy - ty;
  if (distY < 0) {
    dirY = DIR.DOWN;
    distY = -distY;
  }
  return { dirX, dirY, distX, distY };
}

/**
 * _CalcDiagonalSpeedIndex — Y starts at 4 (middle); walks toward the farther axis.
 * @param {number} distX
 * @param {number} distY
 * @param {number} [middle=4]
 */
export function calcDiagonalSpeedIndex(distX, distY, middle = 4) {
  let index = middle;
  let offset = -1;
  let greater = distX;
  let lesser = distY;
  if (distX < distY) {
    greater = distY;
    lesser = distX;
    offset = 1;
  }
  if (greater - lesser < 8) return index;

  for (;;) {
    index += offset;
    if (index === 0 || index === 8) return index;
    greater -= lesser;
    if (greater < lesser) return index;
  }
}

/**
 * Aim parameters for a fireball from (ox,oy) toward (tx,ty).
 * @param {number} ox
 * @param {number} oy
 * @param {number} tx
 * @param {number} ty
 */
export function aimFireball(ox, oy, tx, ty) {
  const { dirX, dirY, distX, distY } = directionsAndDistancesToTarget(ox, oy, tx, ty);
  const index = calcDiagonalSpeedIndex(distX, distY);
  return {
    dirX,
    dirY,
    dir: dirX | dirY,
    qSpeedX: FIREBALL_QSPEED_X[index] ?? 0,
    qSpeedY: FIREBALL_QSPEED_Y[index] ?? 0,
    angleIndex: index,
  };
}

/**
 * One NES MoveObject tick along an axis: add/sub q-speed to frac; carry moves a pixel.
 * Applied 4× per frame (standard object movement).
 * @param {{ x: number, y: number, posFracX?: number, posFracY?: number }} p
 * @param {number} dirX
 * @param {number} dirY
 * @param {number} qSpeedX
 * @param {number} qSpeedY
 */
export function stepFireballAxes(p, dirX, dirY, qSpeedX, qSpeedY) {
  let fracX = p.posFracX ?? 0;
  let fracY = p.posFracY ?? 0;
  for (let i = 0; i < 4; i += 1) {
    if (dirX & DIR.RIGHT) {
      const sum = fracX + qSpeedX;
      fracX = sum & 0xff;
      if (sum > 0xff) p.x += 1;
    } else if (dirX & DIR.LEFT) {
      const diff = fracX - qSpeedX;
      const borrow = diff < 0;
      fracX = diff & 0xff;
      if (borrow) p.x -= 1;
    }
    if (dirY & DIR.DOWN) {
      const sum = fracY + qSpeedY;
      fracY = sum & 0xff;
      if (sum > 0xff) p.y += 1;
    } else if (dirY & DIR.UP) {
      const diff = fracY - qSpeedY;
      const borrow = diff < 0;
      fracY = diff & 0xff;
      if (borrow) p.y -= 1;
    }
  }
  p.posFracX = fracX;
  p.posFracY = fracY;
}
