/**
 * Deterministic input replay for regression tests (headless, no Pixi).
 *
 * MVP: walk Link on an open tile grid with a recorded input stream and
 * assert a stable state hash. Expand later to combat / dungeon scenes.
 */

import { DIR } from './collision.js';
import { createLinkState, stepLink } from './linkMotion.js';
import { createIntRng } from './rng.js';
import { crc32Hex } from './hash.js';

/**
 * @param {number} seed
 * @param {number} rows
 * @param {number} cols
 * @param {number} [fillTile]
 */
export function openTileGrid(rows = 22, cols = 32, fillTile = 0x26) {
  return Array.from({ length: rows }, () => Array(cols).fill(fillTile));
}

/**
 * Stable CRC of primitive game state for golden tests.
 * @param {object} state
 */
export function hashGameState(state) {
  const parts = [
    `x:${state.link?.x ?? 0}`,
    `y:${state.link?.y ?? 0}`,
    `dir:${state.link?.dir ?? 0}`,
    `frame:${state.frame ?? 0}`,
    `seed:${state.seed ?? 0}`,
  ];
  if (state.inv) {
    parts.push(
      `sword:${state.inv.sword ?? 0}`,
      `hearts:${state.inv.halfHearts ?? 0}`,
      `rupees:${state.inv.rupees ?? 0}`,
    );
  }
  if (Array.isArray(state.enemies)) {
    for (const e of state.enemies) {
      parts.push(`e:${e.objType}:${e.x}:${e.y}:${e.alive ? 1 : 0}`);
    }
  }
  return crc32Hex(Buffer.from(parts.join('|'), 'utf8'));
}

/**
 * @typedef {object} ReplayFrame
 * @property {number} mask direction bits
 * @property {boolean} [a]
 * @property {boolean} [b]
 */

/**
 * @param {object} opts
 * @param {number} [opts.seed]
 * @param {number} [opts.startX]
 * @param {number} [opts.startY]
 * @param {number} [opts.startDir]
 * @param {number[][]} [opts.tileGrid]
 * @param {ReplayFrame[]} opts.frames
 * @param {number | null} [opts.roomId] OW room for edge walk; null = cave/clamp bounds
 */
export function runReplay(opts) {
  const seed = opts.seed ?? 1;
  const rng = createIntRng(seed);
  const tileGrid = opts.tileGrid ?? openTileGrid();
  const link = createLinkState(
    opts.startX ?? 0x80,
    opts.startY ?? 0x8d,
    opts.startDir ?? DIR.RIGHT,
  );
  const roomId = opts.roomId ?? null;
  let frame = 0;
  for (const f of opts.frames) {
    stepLink(link, tileGrid, f.mask ?? 0, undefined, roomId);
    frame += 1;
  }
  return {
    seed,
    frame,
    link,
    rng,
    hash: hashGameState({ seed, frame, link }),
  };
}

/**
 * Build N frames of a single direction.
 * @param {number} dir
 * @param {number} count
 */
export function holdDir(dir, count) {
  return Array.from({ length: count }, () => ({ mask: dir }));
}
