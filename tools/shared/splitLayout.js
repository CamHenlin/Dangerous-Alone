/**
 * How the screen is carved up when more than one player is looking.
 *
 * One player keeps the ROM's 256×240 frame. Two or more always open the
 * same 2×2 of those frames. A 3px gutter sits between adjacent quadrants
 * so two playfields do not read as one picture. Empty cells say PRESS
 * START TO JOIN — a 2-up special case made two players a different game
 * than three.
 *
 * Quadrants are always 256×240, the same split the HUD and playfield already
 * use, so nobody sees more or less world than they do alone.
 */

export const QUAD_W = 256;
export const QUAD_H = 240;
/** Black strip between co-op quadrants, in NES pixels. Solo has none. */
export const QUAD_GUTTER = 3;

/**
 * @param {number} playerCount
 * @returns {{ width: number, height: number, cols: number, rows: number }}
 */
export function frameSize(playerCount) {
  const n = Math.max(1, playerCount | 0);
  if (n <= 1) return { width: QUAD_W, height: QUAD_H, cols: 1, rows: 1 };
  return {
    width: QUAD_W * 2 + QUAD_GUTTER,
    height: QUAD_H * 2 + QUAD_GUTTER,
    cols: 2,
    rows: 2,
  };
}

/**
 * Top-left of player `index`'s quadrant, in frame pixels.
 * @param {number} index 0-based
 * @param {number} playerCount
 */
/**
 * Seats in the 2×2 that nobody is sitting in. Company always opens the
 * grid, so two players leave two join prompts.
 *
 * @param {readonly number[]} activeIndexes
 * @param {number} playerCount
 */
export function emptyQuadrants(activeIndexes, playerCount) {
  if ((playerCount | 0) < 2) return [];
  const taken = new Set(activeIndexes);
  return [0, 1, 2, 3].filter((i) => !taken.has(i));
}

export function quadrantOrigin(index, playerCount) {
  const { cols } = frameSize(playerCount);
  const i = Math.max(0, index | 0);
  const gap = (playerCount | 0) < 2 ? 0 : QUAD_GUTTER;
  return {
    x: (i % cols) * (QUAD_W + gap),
    y: Math.floor(i / cols) * (QUAD_H + gap),
  };
}
