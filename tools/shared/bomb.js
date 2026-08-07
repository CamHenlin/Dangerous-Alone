import { DIR } from './collision.js';

/** BombTimes: fuse, explode, wall, end. */
export const BOMB_FUSE = 0x30;
export const BOMB_EXPLODE = 0x18;
export const BOMB_DAMAGE = 0x40;
export const BOMB_RADIUS = 0x18;

/**
 * @typedef {object} Bomb
 * @property {number} x
 * @property {number} y
 * @property {number} timer
 * @property {'fuse' | 'explode' | 'done'} phase
 * @property {boolean} damaged
 */

/**
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir
 * @returns {Bomb}
 */
export function placeBomb(linkX, linkY, dir) {
  // Drop just ahead of Link (NES places relative to facing).
  let x = linkX + 4;
  let y = linkY + 2;
  if (dir & DIR.UP) y -= 16;
  if (dir & DIR.DOWN) y += 16;
  if (dir & DIR.LEFT) x -= 16;
  if (dir & DIR.RIGHT) x += 16;
  return { x, y, timer: BOMB_FUSE, phase: 'fuse', damaged: false };
}

/**
 * @param {Bomb} bomb
 * @returns {Bomb}
 */
export function stepBomb(bomb) {
  if (bomb.phase === 'done') {
    return bomb;
  }
  bomb.timer -= 1;
  if (bomb.timer > 0) {
    return bomb;
  }
  if (bomb.phase === 'fuse') {
    bomb.phase = 'explode';
    bomb.timer = BOMB_EXPLODE;
    bomb.damaged = false;
    return bomb;
  }
  bomb.phase = 'done';
  bomb.timer = 0;
  return bomb;
}

/**
 * @param {Bomb} bomb
 * @param {{ x: number, y: number, w: number, h: number }} target
 */
export function bombHits(bomb, target) {
  if (bomb.phase !== 'explode') {
    return false;
  }
  const cx = bomb.x + 8;
  const cy = bomb.y + 8;
  const tx = target.x + target.w / 2;
  const ty = target.y + target.h / 2;
  return Math.abs(cx - tx) < BOMB_RADIUS && Math.abs(cy - ty) < BOMB_RADIUS;
}
