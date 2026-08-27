/**
 * The strip under a co-op frame: one minimap, one purse, four digits.
 *
 * Each quadrant already has a 64px bar of its own. In company that bar
 * drops the counters and the radar — they would be printed twice or four
 * times — and this strip, the full 512px across, is where they live instead.
 */

import { QUAD_H, SHARED_BAR_H } from './splitLayout.js';
import { formatStatusCount } from './statusBarText.js';

export const SHARED_BAR_W = 512;

/**
 * Top-left of the shared strip, or null when the frame has no room for it.
 * @param {number} playerCount
 */
export function sharedBarOrigin(playerCount) {
  if ((playerCount | 0) < 2) return null;
  return { x: 0, y: QUAD_H * 2 };
}

/**
 * A count that is allowed to grow past the ROM's 255 / 3-glyph field.
 *
 * Three digits stay the NES `FormatDecimalCountByte` (X for a blank). Four
 * digits keep that blank and just add a column, so 23 is still `XX23` and
 * 1234 is `1234`.
 *
 * @param {number} value
 * @param {number} [digits=4]
 */
export function formatPartyCount(value, digits = 4) {
  const width = Math.max(1, digits | 0);
  // Three glyphs stay the NES blank rules, but the party purse is not a byte.
  if (width <= 3) return formatStatusCount(value, 10 ** 3 - 1);
  const cap = 10 ** width - 1;
  const v = Math.max(0, Math.min(cap, value | 0));
  const raw = String(v);
  if (raw.length >= width) return raw.slice(-width);
  return `${'X'.repeat(width - raw.length)}${raw}`;
}

export { SHARED_BAR_H };
