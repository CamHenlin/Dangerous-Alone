/**
 * Party-sized status counts. The ROM field is three glyphs and saturates
 * at 255; co-op multiplies the purse by who is sitting down.
 *
 * Three digits stay the NES `FormatDecimalCountByte` (X for a blank). Four
 * digits keep that blank and just add a column, so 23 is still `XX23` and
 * 1234 is `1234`.
 */

import { formatStatusCount } from './statusBarText.js';

/**
 * A count that is allowed to grow past the ROM's 255 / 3-glyph field.
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
