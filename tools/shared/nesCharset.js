/**
 * NES BG charset (`common_background`) character → CHR tile.
 *
 * Digits $00–$09, letters $0A–$23 (A–Z), space $24, dash $62. Punctuation is
 * whatever the name-register board (`ModeE_CharMap`) can draw, plus the credits
 * copyright tile.
 *
 * Lives in `tools/shared` so `story/` text can be validated by `npm test`
 * without a DOM; `game/src/play/nesFont.js` renders from the same table.
 */

/** Punctuation glyphs reachable from the register board (`ModeE_CharMap`). */
export const PUNCT_TILE = Object.freeze({
  ',': 0x28,
  '!': 0x29,
  "'": 0x2a,
  '&': 0x2b,
  '.': 0x2c,
  '"': 0x2d,
  '?': 0x2e,
  /** Outside the register board, but the credits line draws tile $FC. */
  '©': 0xfc,
});

/**
 * @param {string} ch
 * @returns {number | null} CHR tile index, or null if unsupported
 */
export function nesCharTile(ch) {
  const c = String(ch ?? '').toUpperCase();
  if (c === ' ') return 0x24;
  if (c === '-') return 0x62;
  // Money-game / price signs — PrependSignToPrice uses tile $64 for '+'.
  if (c === '+') return 0x64;
  if (PUNCT_TILE[c] != null) return PUNCT_TILE[c];
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return 0x0a + (c.charCodeAt(0) - 65);
  return null;
}

/**
 * @param {string} ch
 */
export function isRenderableChar(ch) {
  return nesCharTile(ch) != null;
}

/**
 * Characters in `text` the charset cannot draw. Newlines are line breaks, not
 * glyphs, so they are allowed through.
 * @param {string} text
 * @returns {string[]} unique offenders, in order of first appearance
 */
export function unrenderableChars(text) {
  /** @type {string[]} */
  const bad = [];
  for (const ch of String(text ?? '')) {
    if (ch === '\n' || isRenderableChar(ch)) continue;
    if (!bad.includes(ch)) bad.push(ch);
  }
  return bad;
}
