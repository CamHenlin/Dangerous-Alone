/**
 * Decoders for the mode `$00` attract crawl text (`DemoTextFields`).
 *
 * Each field is `[column][tiles…][$FF]`. Tiles are raw BG pattern indices
 * (same six-bit letter range as the credits), plus decorative border tiles.
 * Space tiles ($24) pad the right-hand label under the right item column.
 */

const TEXT_PUNCT = Object.freeze({
  0x24: ' ',
  0x25: ' ',
  0x28: ',',
  0x29: '!',
  0x2a: "'",
  0x2b: '&',
  0x2c: '.',
  0x2d: '"',
  0x2e: '?',
  0x2f: '-',
  0x62: '-',
  0x63: '.',
});

/**
 * @param {number} tile
 * @returns {string}
 */
export function charFromDemoTile(tile) {
  const c = tile & 0xff;
  if (TEXT_PUNCT[c] != null) return TEXT_PUNCT[c];
  if (c <= 9) return String(c);
  if (c >= 0x0a && c <= 0x23) return String.fromCharCode(65 + (c - 0x0a));
  // Decorative border tiles still occupy a column in the nametable line.
  return ' ';
}

/**
 * Decode one `$FF`-terminated field at a PRG offset.
 * @param {Uint8Array | Buffer} prg
 * @param {number} offset
 * @returns {{ column: number, text: string, tiles: number[] }}
 */
export function decodeDemoTextField(prg, offset) {
  const column = prg[offset] ?? 0;
  /** @type {number[]} */
  const tiles = [];
  let text = '';
  for (let i = 1; i < 80; i += 1) {
    const tile = prg[offset + i];
    if (tile === undefined || tile === 0xff) break;
    tiles.push(tile);
    text += charFromDemoTile(tile);
  }
  // Keep internal spaces — the ROM pads with $24 tiles so the right-hand
  // label lands under the right item column (e.g. `POWER·······RECORDER`).
  return { column, text: text.replace(/\s+$/g, ''), tiles };
}

/**
 * Decode every crawl line addressed by `DemoLineTextAddrs`.
 *
 * @param {Uint8Array | Buffer} prg
 * @param {number} textFieldsPrg
 * @param {number[]} lineTextOffsets offsets relative to `DemoTextFields`
 * @returns {{ index: number, column: number, text: string, offset: number }[]}
 */
export function decodeDemoTextLines(prg, textFieldsPrg, lineTextOffsets) {
  return lineTextOffsets.map((rel, index) => {
    const offset = textFieldsPrg + rel;
    const field = decodeDemoTextField(prg, offset);
    return {
      index,
      column: field.column,
      text: field.text,
      /** Raw BG tiles — render these for exact NT column padding. */
      tiles: field.tiles,
      offset,
    };
  });
}
