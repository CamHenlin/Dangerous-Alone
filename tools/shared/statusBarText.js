/**
 * NES FormatDecimalCountByte (Z_01.asm) — always 3 nametable characters.
 *
 * 123 → "123"
 *  23 → "X23"
 *   3 → "X3 "
 *   0 → "X0 "
 */

/**
 * @param {number} value
 * @param {number} [max=255] NES field saturates at 255; a 3-glyph co-op
 *   counter passes 999 so 510 still prints as "510"
 * @returns {string} exactly 3 characters (space-padded) unless `max` ≥ 1000
 */
export function formatStatusCount(value, max = 255) {
  const cap = Math.max(0, max | 0);
  const v = Math.max(0, Math.min(cap, value | 0));
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
