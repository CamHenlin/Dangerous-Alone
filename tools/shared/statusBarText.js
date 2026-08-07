/**
 * NES FormatDecimalCountByte (Z_01.asm) — always 3 nametable characters.
 *
 * 123 → "123"
 *  23 → "X23"
 *   3 → "X3 "
 *   0 → "X0 "
 */

/**
 * @param {number} value 0–255
 * @returns {string} exactly 3 characters (space-padded)
 */
export function formatStatusCount(value) {
  const v = Math.max(0, Math.min(255, value | 0));
  const ones = v % 10;
  const tens = Math.floor(v / 10) % 10;
  const hundreds = Math.floor(v / 100);
  if (hundreds > 0) return `${hundreds}${tens}${ones}`;
  if (tens > 0) return `X${tens}${ones}`;
  return `X${ones} `;
}

/**
 * Magic key shows “XA ” (X + letter A + space) instead of a count.
 * @returns {string}
 */
export function formatMagicKeyCount() {
  return 'XA ';
}
