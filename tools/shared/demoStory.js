/**
 * Attract-mode title + storyboard nametables (game mode `$00`).
 *
 * ROM (bank 6 `TransferBufAddrs`):
 *   - title: `GameTitleTransferBuf` (selector `$10`) via `InitDemoSubphasePlayTitleSong`
 *   - story: `StoryTileAttrTransferBuf` (selector `$02`) via `InitDemoSubphaseTransferStoryTiles`
 *
 * Patterns: common BG at PPU `$1000` (tiles `$00+`) and demo BG at `$1700`
 * (tiles `$70+`). Palettes: `TitlePaletteTransferRecord` / `StoryPaletteTransferRecord`.
 */

import { decodeTileIndices } from './nes2bpp.js';
import { attrPaletteAt, decodeTransferRecords, nametableFromRecords } from './nesTransferBuf.js';
import { nesColor } from './nesPalette.js';

/** PRG offset of `StoryTileAttrTransferBuf` (USA PRG1). */
export const STORY_TRANSFER_PRG = 0x1a489;
/** Byte length including the terminating `$FF`. */
export const STORY_TRANSFER_LENGTH = 1131;
/** PRG offset of `GameTitleTransferBuf` (USA PRG1). */
export const TITLE_TRANSFER_PRG = 0x1a8f4;
/** Byte length including the terminating `$FF`. */
export const TITLE_TRANSFER_LENGTH = 1121;
/** Demo background patterns load at PPU `$1700` → tile `$70`. */
export const DEMO_BG_TILE_BASE = 0x70;

/**
 * BG palette rows from `StoryPaletteTransferRecord` (PPU `$3F00`, 4×4).
 * @type {readonly (readonly number[])[]}
 */
export const STORY_BG_PALETTE_ROWS = Object.freeze([
  Object.freeze([0x0f, 0x30, 0x30, 0x30]),
  Object.freeze([0x0f, 0x21, 0x30, 0x30]),
  Object.freeze([0x0f, 0x16, 0x30, 0x30]),
  Object.freeze([0x0f, 0x29, 0x1a, 0x09]),
]);

/**
 * BG palette rows from `TitlePaletteTransferRecord` @ `Z_02.asm:449`.
 * @type {readonly (readonly number[])[]}
 */
export const TITLE_BG_PALETTE_ROWS = Object.freeze([
  Object.freeze([0x36, 0x0f, 0x00, 0x10]),
  Object.freeze([0x36, 0x17, 0x27, 0x0f]),
  Object.freeze([0x36, 0x08, 0x1a, 0x28]),
  Object.freeze([0x36, 0x30, 0x3b, 0x22]),
]);

/**
 * @param {Uint8Array|Buffer} prg
 * @param {number} prgOffset
 * @param {number} length
 * @returns {{ tiles: Uint8Array, attrs: Uint8Array, records: import('./nesTransferBuf.js').TransferRecord[] }}
 */
function decodeNametableTransfer(prg, prgOffset, length) {
  const buf = prg.subarray(prgOffset, prgOffset + length);
  const { records } = decodeTransferRecords(buf);
  const { tiles, attrs } = nametableFromRecords(records, 0x2000);
  return { tiles, attrs, records };
}

/**
 * @param {Uint8Array|Buffer} prg
 * @param {number} [prgOffset]
 */
export function decodeStoryNametable(prg, prgOffset = STORY_TRANSFER_PRG) {
  return decodeNametableTransfer(prg, prgOffset, STORY_TRANSFER_LENGTH);
}

/**
 * @param {Uint8Array|Buffer} prg
 * @param {number} [prgOffset]
 */
export function decodeTitleNametable(prg, prgOffset = TITLE_TRANSFER_PRG) {
  return decodeNametableTransfer(prg, prgOffset, TITLE_TRANSFER_LENGTH);
}

/**
 * Pattern bytes for one nametable tile index under the demo CHR layout.
 * @param {number} tile
 * @param {Uint8Array|Buffer} commonBg `common_background.bin`
 * @param {Uint8Array|Buffer} demoBg `demo_background.bin`
 */
export function storyTilePatternBytes(tile, commonBg, demoBg) {
  const t = tile & 0xff;
  if (t >= DEMO_BG_TILE_BASE) {
    const index = t - DEMO_BG_TILE_BASE;
    const offset = index * 16;
    if (offset + 16 > demoBg.length) return new Uint8Array(16);
    return demoBg.subarray(offset, offset + 16);
  }
  const offset = t * 16;
  if (offset + 16 > commonBg.length) return new Uint8Array(16);
  return commonBg.subarray(offset, offset + 16);
}

/**
 * Render an attract nametable to RGBA (opaque backdrop).
 *
 * Defaults to the NES screen, 256×240. `opts.rows` renders a taller strip —
 * the authored prologue stacks several 30-row panels into one image so the
 * attract sequence can scroll between them.
 *
 * @param {Uint8Array} tiles `32 * rows` nametable tiles
 * @param {Uint8Array} attrs one palette row per 2×2 block
 * @param {Uint8Array|Buffer} commonBg
 * @param {Uint8Array|Buffer} demoBg
 * @param {readonly (readonly number[])[]} [paletteRows]
 * @param {{ rows?: number }} [opts]
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function renderDemoNametableRgba(
  tiles,
  attrs,
  commonBg,
  demoBg,
  paletteRows = STORY_BG_PALETTE_ROWS,
  opts = {},
) {
  const totalRows = Math.max(1, opts.rows ?? 30);
  const width = 256;
  const height = totalRows * 8;
  const rgba = new Uint8Array(width * height * 4);
  /** @type {{ r: number, g: number, b: number, a: number }[][]} */
  const rowColors = paletteRows.map((row) =>
    row.map((idx) => {
      const [r, g, b] = nesColor(idx);
      return { r, g, b, a: 255 };
    }),
  );

  for (let row = 0; row < totalRows; row += 1) {
    for (let col = 0; col < 32; col += 1) {
      const tile = tiles[row * 32 + col] ?? 0;
      const indices = decodeTileIndices(storyTilePatternBytes(tile, commonBg, demoBg));
      const colors = rowColors[attrPaletteAt(attrs, col, row) & 3] ?? rowColors[0];
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((row * 8 + y) * width + (col * 8 + x)) * 4;
          rgba[px] = c.r;
          rgba[px + 1] = c.g;
          rgba[px + 2] = c.b;
          rgba[px + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba };
}

/** @deprecated alias — prefer `renderDemoNametableRgba` */
export function renderStoryNametableRgba(
  tiles,
  attrs,
  commonBg,
  demoBg,
  paletteRows = STORY_BG_PALETTE_ROWS,
) {
  return renderDemoNametableRgba(tiles, attrs, commonBg, demoBg, paletteRows);
}

/**
 * @param {Uint8Array} tiles
 * @param {Uint8Array} attrs
 * @param {Uint8Array|Buffer} commonBg
 * @param {Uint8Array|Buffer} demoBg
 */
export function renderTitleNametableRgba(tiles, attrs, commonBg, demoBg) {
  return renderDemoNametableRgba(tiles, attrs, commonBg, demoBg, TITLE_BG_PALETTE_ROWS);
}
