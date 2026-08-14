/**
 * Attract / ending storyboard panels — the vine-framed screens the NES uses
 * for the prologue.
 *
 * The ROM stores its one panel as a nametable transfer buffer
 * (`StoryTileAttrTransferBuf`), which is why it was a baked image and not
 * editable prose. This module rebuilds that same shape from text, so the
 * prologue can be written in `story/prologue.js` and rendered back out to a
 * PNG by `tools/story/buildPrologue.js`.
 *
 * `endingUi.js` draws the epilogue with the same geometry and the same border
 * tiles, so the two ends of the game are visibly a pair.
 *
 * ## The two constraints that shape the layout
 *
 * NES attributes cover **2×2 tiles**, so a colour change lands on a 16×16
 * pixel grid, not per character. That is why:
 *
 *   - Body lines sit on every *other* row. A single-spaced line would share
 *     its attribute row with its neighbour and drag that neighbour's colour
 *     along with it.
 *   - A highlighted word's colour bleeds to its column neighbour. Words are
 *     space-separated, so the bleed lands on a space and is invisible.
 *
 * The ROM works exactly this way — look at the double spaces it puts around
 * "GANNON" in the original storyboard.
 */

import { nesCharTile } from './nesCharset.js';

/** Nametable geometry. One panel is exactly one NES screen. */
export const PANEL_COLS = 32;
export const PANEL_ROWS = 30;

/** Border tiles from `demo_background.bin` (PPU `$1700` → tile `$70`). */
export const BORDER_TILE = Object.freeze({
  /** Corner. */
  corner: 0xe6,
  /** Horizontal vine, alternating. */
  hA: 0xe4,
  hB: 0xe5,
  /** Vertical vine, alternating. */
  vA: 0xe2,
  vB: 0xe3,
});

/** Space — `nesCharTile(' ')`, hoisted because every blank cell uses it. */
const SPACE_TILE = 0x24;

/** Frame position inside a panel. */
export const FRAME = Object.freeze({
  leftCol: 2,
  rightCol: 29,
  topRow: 4,
  bottomRow: 29,
});

/**
 * Text columns inside the frame — 24 characters wide.
 *
 * The right edge stops at col 27, not 28: cols 28 and 29 share an attribute
 * block with the right-hand vine, so a character there would repaint the vine
 * in the text colour. The ROM's own storyboard stops at 27 for the same
 * reason.
 */
export const TEXT_LEFT_COL = FRAME.leftCol + 2;
export const TEXT_RIGHT_COL = FRAME.rightCol - 2;
export const TEXT_COLS = TEXT_RIGHT_COL - TEXT_LEFT_COL + 1;

/** Body rows, top to bottom. Every other row, for the attribute reason above. */
export const BODY_ROWS = Object.freeze(
  Array.from({ length: 11 }, (_, i) => FRAME.topRow + 3 + i * 2),
);

/** The title interrupts the top border, so it shares that row. */
export const TITLE_ROW = FRAME.topRow;

/**
 * Palette rows, matching `STORY_BG_PALETTE_ROWS` in demoStory.js:
 * 0 white, 1 blue, 2 red, 3 the green vine.
 */
export const PALETTE = Object.freeze({ white: 0, blue: 1, red: 2, border: 3 });

/** Accent names authors may use in `highlight`. */
export const ACCENT = Object.freeze({ red: PALETTE.red, blue: PALETTE.blue });

/**
 * @typedef {object} Panel
 * @property {string} [title] shown in the gap in the top border
 * @property {number} [titleAccent] PALETTE row for the title (default red)
 * @property {string[]} lines body lines, already short enough to fit
 *
 * @typedef {object} Storyboard
 * @property {number} cols
 * @property {number} rows total rows across every panel
 * @property {Uint8Array} tiles `cols * rows` nametable tiles
 * @property {Uint8Array} attrs one palette row per 2×2 tile block
 * @property {number} panelCount
 */

/**
 * Greedy wrap to the panel's text width. Exported so authors can check a
 * paragraph fits before it is split across panels.
 * @param {string} text
 * @param {number} [cols]
 * @returns {string[]}
 */
export function wrapPanelText(text, cols = TEXT_COLS) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Break authored paragraphs into panels of `BODY_ROWS.length` lines, keeping a
 * blank line between paragraphs and never splitting a paragraph across a panel
 * boundary if it fits whole on the next one.
 *
 * @param {string[]} paragraphs
 * @param {{ rowsPerPanel?: number, cols?: number }} [opts]
 * @returns {string[][]} one array of body lines per panel
 */
export function paginatePanels(paragraphs, opts = {}) {
  const rows = opts.rowsPerPanel ?? BODY_ROWS.length;
  const cols = opts.cols ?? TEXT_COLS;
  /** @type {string[][]} */
  const panels = [];
  /** @type {string[]} */
  let current = [];

  const flush = () => {
    if (current.length) panels.push(current);
    current = [];
  };

  for (const para of paragraphs ?? []) {
    const lines = wrapPanelText(para, cols);
    if (!lines.length) continue;
    // A blank line between paragraphs, but never as the first row of a panel.
    const withGap = current.length ? ['', ...lines] : lines;
    if (current.length + withGap.length > rows) {
      // Does the paragraph fit whole on a fresh panel? Then start one.
      if (lines.length <= rows) {
        flush();
        current = [...lines];
        continue;
      }
      // Too long for any panel — spill it across the boundary rather than
      // dropping rows on the floor.
      for (const line of withGap) {
        if (current.length >= rows) flush();
        if (!current.length && line === '') continue;
        current.push(line);
      }
      continue;
    }
    current.push(...withGap);
  }
  flush();
  return panels;
}

/**
 * Set the attribute palette for one tile cell.
 *
 * Written in the NES's own packed layout — one byte per 32×32 pixel quadrant,
 * holding four 2×2-tile blocks — so the result drops straight into
 * `attrPaletteAt` alongside nametables decoded from the ROM.
 *
 * `attrCols` is unused here and kept only so callers read the same way as
 * `writeText`; the packed index is derived from col/row directly.
 *
 * @param {Uint8Array} attrs
 * @param {number} attrCols
 * @param {number} col
 * @param {number} row
 * @param {number} palette
 */
function setAttr(attrs, attrCols, col, row, palette) {
  const index = (row >> 2) * 8 + (col >> 2);
  if (index < 0 || index >= attrs.length) return;
  const shift = ((row & 2) << 1) | (col & 2);
  attrs[index] = (attrs[index] & ~(3 << shift)) | ((palette & 3) << shift);
}

/**
 * Draw a string of tiles and set its palette.
 * @returns {boolean} false when a character has no tile
 */
function writeText(tiles, attrs, cols, attrCols, col, row, text, palette) {
  let ok = true;
  for (let i = 0; i < text.length; i += 1) {
    const tile = nesCharTile(text[i]);
    const c = col + i;
    if (c > TEXT_RIGHT_COL && row !== TITLE_ROW) {
      ok = false;
      break;
    }
    tiles[row * cols + c] = tile == null ? SPACE_TILE : tile;
    if (tile == null) ok = false;
    setAttr(attrs, attrCols, c, row, palette);
  }
  return ok;
}

/**
 * Apply an accent to every occurrence of a word on one line.
 *
 * Colour lands on the 16×16 attribute grid, so a word starting on an odd
 * column tints the space before it too. That is invisible, and it is what the
 * ROM does.
 *
 * @param {Uint8Array} attrs
 * @param {number} attrCols
 * @param {string} line
 * @param {number} startCol
 * @param {number} row
 * @param {Record<string, number>} highlight word → palette row
 */
function applyHighlights(attrs, attrCols, line, startCol, row, highlight) {
  for (const [word, palette] of Object.entries(highlight ?? {})) {
    if (!word) continue;
    let from = 0;
    for (;;) {
      const at = line.indexOf(word, from);
      if (at < 0) break;
      // Whole words only — "8" must not match inside "18".
      const before = at === 0 ? ' ' : line[at - 1];
      const after = line[at + word.length] ?? ' ';
      if (!/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after)) {
        for (let i = 0; i < word.length; i += 1) {
          setAttr(attrs, attrCols, startCol + at + i, row, palette);
        }
      }
      from = at + word.length;
    }
  }
}

/**
 * Draw one panel's vine frame.
 * @param {Uint8Array} tiles
 * @param {Uint8Array} attrs
 * @param {number} cols
 * @param {number} attrCols
 * @param {number} rowOffset first row of this panel
 * @param {{ gapFrom: number, gapTo: number } | null} titleGap columns the title occupies
 */
function drawFrame(tiles, attrs, cols, attrCols, rowOffset, titleGap) {
  const put = (col, row, tile) => {
    tiles[(rowOffset + row) * cols + col] = tile;
    setAttr(attrs, attrCols, col, rowOffset + row, PALETTE.border);
  };

  // Top edge, interrupted by the title when there is one.
  put(FRAME.leftCol, FRAME.topRow, BORDER_TILE.corner);
  put(FRAME.rightCol, FRAME.topRow, BORDER_TILE.corner);
  for (let col = FRAME.leftCol + 1; col < FRAME.rightCol; col += 1) {
    if (titleGap && col >= titleGap.gapFrom && col <= titleGap.gapTo) continue;
    put(col, FRAME.topRow, col % 2 ? BORDER_TILE.hA : BORDER_TILE.hB);
  }

  // Sides.
  for (let row = FRAME.topRow + 1; row < FRAME.bottomRow; row += 1) {
    put(FRAME.leftCol, row, row % 2 ? BORDER_TILE.vA : BORDER_TILE.vB);
    put(FRAME.rightCol, row, row % 2 ? BORDER_TILE.vB : BORDER_TILE.vA);
  }

  // Bottom edge.
  put(FRAME.leftCol, FRAME.bottomRow, BORDER_TILE.corner);
  put(FRAME.rightCol, FRAME.bottomRow, BORDER_TILE.corner);
  for (let col = FRAME.leftCol + 1; col < FRAME.rightCol; col += 1) {
    put(col, FRAME.bottomRow, col % 2 ? BORDER_TILE.hA : BORDER_TILE.hB);
  }
}

/**
 * Where a title sits in the top border, snapped to an even column so its
 * attribute block never overlaps the vine.
 * @param {string} title
 * @returns {{ start: number, gapFrom: number, gapTo: number }}
 */
export function titlePlacement(title) {
  const len = title.length;
  const centre = Math.round((PANEL_COLS - len) / 2);
  const start = Math.max(FRAME.leftCol + 4, centre - (centre % 2));
  return { start, gapFrom: start - 1, gapTo: start + len };
}

/**
 * Compose one or more panels into a single tall nametable.
 *
 * @param {Panel[]} panels
 * @param {{ highlight?: Record<string, number> }} [opts]
 * @returns {Storyboard}
 */
export function composeStoryboard(panels, opts = {}) {
  const list = (panels ?? []).filter(Boolean);
  const cols = PANEL_COLS;
  const rows = PANEL_ROWS * Math.max(1, list.length);
  const attrCols = cols >> 1;
  const tiles = new Uint8Array(cols * rows).fill(SPACE_TILE);
  // Packed NES attribute table: 8 bytes per 4 tile rows.
  const attrs = new Uint8Array(Math.ceil(rows / 4) * 8);
  const highlight = opts.highlight ?? {};

  list.forEach((panel, index) => {
    const rowOffset = index * PANEL_ROWS;
    const title = String(panel.title ?? '').toUpperCase();
    const placement = title ? titlePlacement(title) : null;
    drawFrame(tiles, attrs, cols, attrCols, rowOffset, placement);

    if (placement) {
      writeText(
        tiles,
        attrs,
        cols,
        attrCols,
        placement.start,
        rowOffset + TITLE_ROW,
        title,
        panel.titleAccent ?? PALETTE.red,
      );
    }

    (panel.lines ?? []).forEach((line, i) => {
      const row = BODY_ROWS[i];
      if (row == null) return;
      const text = String(line ?? '').toUpperCase();
      if (!text) return;
      // Left-aligned, like the ROM's storyboard. Centring individual lines
      // reads as ragged indentation once a paragraph wraps.
      writeText(
        tiles,
        attrs,
        cols,
        attrCols,
        TEXT_LEFT_COL,
        rowOffset + row,
        text,
        PALETTE.white,
      );
      applyHighlights(attrs, attrCols, text, TEXT_LEFT_COL, rowOffset + row, highlight);
    });
  });

  return { cols, rows, tiles, attrs, panelCount: list.length };
}
