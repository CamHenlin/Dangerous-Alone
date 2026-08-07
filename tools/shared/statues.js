/**
 * UW statue fireballs (Z_04 UpdateStatues) — layouts $23 / $24.
 */

import { PROJ, shootFireball } from './projectiles.js';

/** layoutId → statue pattern (0 = 4, 1 = 2). */
export const STATUE_LAYOUTS = Object.freeze({
  0x24: 0,
  0x23: 1,
});

const PATTERN_COUNT = Object.freeze([4, 2]);
const START_TIMERS = Object.freeze([0x50, 0x80, 0xf0, 0x60]);
const POS_X = Object.freeze([
  Object.freeze([0x24, 0xc8, 0x24, 0xc8]),
  Object.freeze([0x64, 0x88]),
]);
const POS_Y = Object.freeze([
  Object.freeze([0xc0, 0xbc, 0x64, 0x5c]),
  Object.freeze([0x94, 0x8c]),
]);

/**
 * @param {number} layoutId
 */
export function statuePatternForLayout(layoutId) {
  const p = STATUE_LAYOUTS[layoutId & 0xff];
  return p == null ? -1 : p;
}

/**
 * @param {number} layoutId
 */
export function createStatueState(layoutId) {
  const pattern = statuePatternForLayout(layoutId);
  if (pattern < 0) return null;
  const n = PATTERN_COUNT[pattern];
  return {
    pattern,
    timers: Array.from({ length: n }, (_, i) => START_TIMERS[i] ?? 0x50),
  };
}

/**
 * @param {object} state
 * @param {{ x: number, y: number }} link
 * @returns {import('./projectiles.js').Projectile[]}
 */
export function stepStatues(state, link) {
  if (!state) return [];
  /** @type {import('./projectiles.js').Projectile[]} */
  const out = [];
  const xs = POS_X[state.pattern];
  const ys = POS_Y[state.pattern];
  for (let i = 0; i < state.timers.length; i += 1) {
    state.timers[i] -= 1;
    if (state.timers[i] > 0) continue;
    state.timers[i] = START_TIMERS[i] ?? 0x80;
    const x = xs[i];
    const y = ys[i];
    // Skip if Link is within $18 on both axes.
    if (Math.abs(link.x - x) < 0x18 && Math.abs(link.y - y) < 0x18) continue;
    out.push(shootFireball(PROJ.FIREBALL, x, y, link.x, link.y, { x, y }));
  }
  return out;
}
