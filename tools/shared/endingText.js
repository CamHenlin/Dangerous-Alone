/**
 * Decoders for the game mode `$13` text blobs (`Z_02.asm`).
 *
 * The ending uses three different encodings, so each gets its own reader:
 *   - `ThanksText` reuses the dialogue scheme, where the top two bits of each
 *     byte pick the next line (`UpdateZeldaTextbox` @ `Z_02.asm:3296`).
 *   - `PeaceText` is a flat `$FF`-terminated tile run.
 *   - `CreditsTextLines` is 23 records of `[length][column][tiles…]`.
 */

/**
 * Punctuation in the six-bit dialogue charset that `ThanksText` / `PeaceText`
 * use. `$25` is the "wide space" that occupies a cell but costs no typing time.
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
});

/**
 * The credits write raw BG tile numbers straight to the nametable, so they
 * reach glyphs the dialogue charset cannot address.
 */
const TILE_PUNCT = Object.freeze({
  ...TEXT_PUNCT,
  0x62: '-',
  0x63: '.',
  0xfc: '©',
});

/**
 * @param {number} tile
 * @param {boolean} [raw] true for credits tiles, which carry no line flags
 */
export function charFromEndingTile(tile, raw = false) {
  const table = raw ? TILE_PUNCT : TEXT_PUNCT;
  const c = raw ? tile : tile & 0x3f;
  if (table[c] != null) return table[c];
  if (c <= 9) return String(c);
  if (c >= 0x0a && c <= 0x23) return String.fromCharCode(65 + (c - 0x0a));
  return '';
}

/**
 * `ThanksText` — three lines, ended by a byte with both high bits set.
 * @param {Uint8Array | Buffer} prg
 * @param {number} offset PRG offset (bank 2 maps 1:1 onto CPU addresses)
 * @returns {string[]}
 */
export function decodeThanksText(prg, offset) {
  const lines = [''];
  for (let i = 0; i < 128; i += 1) {
    const raw = prg[offset + i];
    if (raw === undefined || raw === 0xff) break;
    lines[lines.length - 1] += charFromEndingTile(raw);
    const flags = raw & 0xc0;
    if (flags === 0xc0) break;
    if (flags === 0x80 || flags === 0x40) lines.push('');
  }
  return lines.map((s) => s.trim()).filter(Boolean);
}

/**
 * `PeaceText` — one flat `$FF`-terminated run. `UpdatePeaceTextbox` walks a
 * table of VRAM addresses rather than embedding breaks, so we split after the
 * full stop that ends the first sentence.
 * @param {Uint8Array | Buffer} prg
 * @param {number} offset
 * @returns {string[]}
 */
export function decodePeaceText(prg, offset) {
  return decodePeaceString(prg, offset)
    .split(/(?<=\.)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The same run, undivided — the layout table decides where it breaks.
 * @param {Uint8Array | Buffer} prg
 * @param {number} offset
 * @returns {string}
 */
export function decodePeaceString(prg, offset) {
  let text = '';
  for (let i = 0; i < 128; i += 1) {
    const raw = prg[offset + i];
    if (raw === undefined || raw === 0xff) break;
    text += charFromEndingTile(raw);
  }
  return text;
}

/**
 * @typedef {object} CreditsLine
 * @property {number} index `CreditsLineIndex`
 * @property {number} column destination column within the 32-tile row
 * @property {string} text
 */

/**
 * `CreditsTextLines` — `[length][column][tiles…]` per record.
 * @param {Uint8Array | Buffer} prg
 * @param {number} base PRG offset of the blob
 * @param {number[]} lineOffsets byte offset of each record within the blob
 * @returns {CreditsLine[]}
 */
export function decodeCreditsLines(prg, base, lineOffsets) {
  return lineOffsets.map((off, index) => {
    const p = base + off;
    const length = prg[p] ?? 0;
    const column = prg[p + 1] ?? 0;
    let text = '';
    for (let k = 0; k < length; k += 1) {
      text += charFromEndingTile(prg[p + 2 + k] ?? 0x24, true);
    }
    return { index, column, text };
  });
}

/** Where `DrawCredits` splices the profile name and death count into line `$11`. */
export const CREDITS_NAME_COLUMN = 9;
export const CREDITS_NAME_WIDTH = 8;
export const CREDITS_DEATHS_COLUMN = 19;
export const CREDITS_DEATHS_WIDTH = 3;

/**
 * Line `$11` is a template that `DrawCredits` (`Z_02.asm:3896`) overwrites with
 * the player's name and their `DeathCounts` entry.
 * @param {CreditsLine} line
 * @param {string} name
 * @param {number} deaths
 * @returns {string} the row's tiles from `line.column` onward
 */
export function fillCreditsNameLine(line, name, deaths) {
  const cells = [...line.text.padEnd(24, ' ')];
  const write = (col, value, width) => {
    const start = col - line.column;
    for (let i = 0; i < width; i += 1) cells[start + i] = value[i] ?? ' ';
  };
  write(CREDITS_NAME_COLUMN, String(name ?? '').toUpperCase().padEnd(CREDITS_NAME_WIDTH), CREDITS_NAME_WIDTH);
  write(
    CREDITS_DEATHS_COLUMN,
    String(Math.max(0, Math.min(0xff, deaths | 0))).padStart(CREDITS_DEATHS_WIDTH, ' '),
    CREDITS_DEATHS_WIDTH,
  );
  return cells.join('').trimEnd();
}

/**
 * A nametable write of `$21A4` means row `($1A4 / $20)`, column `($1A4 % $20)`.
 * @param {number} high VRAM address high byte
 * @param {number} low VRAM address low byte
 */
export function vramRowCol(high, low) {
  const offset = (((high & 0x0f) << 8) | low) & 0x03ff;
  return { row: offset >> 5, col: offset & 0x1f };
}

/**
 * `ThanksText` types into the rows named by `ThanksTextboxLineAddrsLo`
 * (`Z_02.asm:3290`), starting at `$21A4` and jumping on the line-control bits.
 * @param {string[]} lines from {@link decodeThanksText}
 * @param {number[]} lineAddrsLo the `$C4,$E4,$A4` table
 * @param {number} [startLo] `ThanksTextboxCharTransferRecTemplate` low byte
 * @param {number} [high] its high byte
 */
export function thanksLayout(lines, lineAddrsLo, startLo = 0xa4, high = 0x21) {
  // The first line starts at the template address; each break moves to the
  // table entry the control bits chose, in order.
  const addrs = [startLo, ...lineAddrsLo];
  return lines.map((text, i) => ({ ...vramRowCol(high, addrs[i] ?? startLo), text }));
}

/**
 * `UpdatePeaceTextbox` places every character by table lookup, so the copy
 * breaks wherever the addresses stop being consecutive. The high byte drops to
 * `$23` once the low byte wraps below `$A0` (`Z_02.asm:3615`).
 * @param {string} text the undivided `PeaceText`
 * @param {number[]} charAddrsLo `PeaceTextboxCharAddrsLo`
 * @param {number} [high] `PeaceTextboxCharTransferRecTemplate` high byte
 * @returns {{ row: number, col: number, text: string }[]}
 */
export function peaceLayout(text, charAddrsLo, high = 0x22) {
  const runs = [];
  let prev = null;
  for (let i = 0; i < text.length && i < charAddrsLo.length; i += 1) {
    const lo = charAddrsLo[i];
    const page = lo >= 0xa0 ? high : high + 1;
    if (prev && page === prev.page && lo === prev.lo + 1) {
      runs[runs.length - 1].text += text[i];
    } else {
      runs.push({ ...vramRowCol(page, lo), text: text[i] });
    }
    prev = { page, lo };
  }
  return runs;
}

/** Each `CreditsVramPage` holds 8 rows, except `page % 4 == 3`, which hold 6. */
export function creditsPageRows(page) {
  return page % 4 === 3 ? 6 : 8;
}

/**
 * Walk `DrawCredits`' row machine (`Z_02.asm:3930`) to find which scroll row
 * each credits line lands on. One row is drawn per 8 pixels of scroll, and a
 * row is only given text when its bit is set in `CreditsPagesTextMasks`.
 * @param {number[]} pageMasks `CreditsPagesTextMasks`
 * @returns {{ rows: number[], totalRows: number }} `rows[lineIndex]` = scroll row
 */
export function creditsRowLayout(pageMasks) {
  const rows = [];
  let row = 0;
  for (let page = 0; page < pageMasks.length; page += 1) {
    const lines = creditsPageRows(page);
    for (let line = 0; line < lines; line += 1, row += 1) {
      if (pageMasks[page] & (0x80 >> line)) rows.push(row);
    }
  }
  return { rows, totalRows: row };
}

/** A credits row scrolls in at the bottom of the screen, one screen ahead. */
export const CREDITS_ROW_HEIGHT = 8;
export const CREDITS_SCREEN_HEIGHT = 240;

/** Absolute y of a credits row in scroll space. */
export function creditsRowY(row) {
  return CREDITS_SCREEN_HEIGHT + row * CREDITS_ROW_HEIGHT;
}

/**
 * The roll stops at `CreditsLastScreenList` nametable flips plus
 * `CreditsLastVscrollList` pixels (`Z_02.asm:3723`), quest 1 then quest 2.
 * @param {number[]} lastScreens
 * @param {number[]} lastVscrolls
 * @returns {{ quest1: number, quest2: number }} total scroll in pixels
 */
export function creditsScrollEnd(lastScreens, lastVscrolls) {
  const total = (i) => lastScreens[i] * CREDITS_SCREEN_HEIGHT + lastVscrolls[i];
  return { quest1: total(0), quest2: total(1) };
}

/**
 * `DrawCredits` skips whole lines by quest: quest 1 drops the "another quest"
 * block and beyond, quest 2 drops it but keeps the congratulation block.
 * @param {CreditsLine[]} lines
 * @param {number} quest 1 or 2
 * @param {{ maxLineIndex?: number, quest1SkipFrom?: number, quest2SkipRange?: number[] }} [gating]
 */
export function creditsLinesForQuest(lines, quest, gating = {}) {
  const max = gating.maxLineIndex ?? 23;
  const q1From = gating.quest1SkipFrom ?? 16;
  const [q2Lo, q2Hi] = gating.quest2SkipRange ?? [12, 16];
  return lines.filter(({ index }) => {
    if (index >= max) return false;
    if (quest === 2) return index < q2Lo || index >= q2Hi;
    return index < q1From;
  });
}
