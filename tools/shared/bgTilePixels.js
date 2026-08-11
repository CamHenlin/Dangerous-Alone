/**
 * Mode-aware background tile lookup.
 *
 * Dungeon rooms are composed at runtime rather than pre-baked, because doors
 * open and close, blocks get pushed and secrets are revealed. So the renderer
 * needs the actual pixels of a CHR tile while the game is running, in whichever
 * art set is loaded.
 *
 * Both sets are addressed identically — the same PPU tile id, resolved through
 * the same `tileSources` ranges. They differ only in what a tile *is*:
 *
 *   classic   16 bytes of 2bpp planes  ->  8x8 values, 0-3   (palette slots)
 *   enhanced  256 bytes, one per pixel -> 16x16 values, 0-15 (slot * 4 + shade)
 *
 * Callers ask for `tileSize()` and index the returned buffer as a square of
 * that edge, so one loop body renders either set.
 */

import { decodeTileIndices } from './nes2bpp.js';
import { SHADES, expandRowRgb } from './masterPalette.js';
import { nesColor, rgbaFromNesIndices } from './nesPalette.js';
import { scale, tilePx } from './gfxScale.js';

/** Edge length in pixels of a background tile in the active art set. */
export function tileSize() {
  return tilePx();
}

/** Bytes per enhanced tile: one per pixel of a 16x16 square. */
const ENHANCED_TILE_BYTES = 16 * 16;

/**
 * Pixel values for one background tile — palette slots in classic, packed
 * slot+shade in enhanced.
 *
 * @param {number} tile PPU tile id
 * @param {object} tileSources schema tileSources ranges
 * @param {Map<string, Uint8Array|Buffer>} patternBins id -> raw tile data
 * @returns {Uint8Array} `tileSize()` squared values
 */
export function bgTilePixels(tile, tileSources, patternBins) {
  const t = tile & 0xff;
  const enhanced = scale() === 2;
  const stride = enhanced ? ENHANCED_TILE_BYTES : 16;
  const blank = () => new Uint8Array(enhanced ? ENHANCED_TILE_BYTES : 64);

  for (const source of Object.values(tileSources)) {
    if (t < source.tileStart || t > source.tileEndInclusive) continue;
    const bin = patternBins.get(source.patternBlockId);
    if (!bin) return blank();
    const offset = (t - source.tileStart) * stride;
    if (offset + stride > bin.length) return blank();
    const bytes = bin.subarray(offset, offset + stride);
    // Enhanced data is already one byte per pixel; classic needs unpacking.
    return enhanced ? bytes : decodeTileIndices(bytes);
  }
  return blank();
}

/**
 * The colours a background tile's pixel values index into, for one palette row.
 *
 * Colour 0 is forced opaque: on a background there is no transparency, and the
 * NES universal backdrop is a real colour that has to paint.
 *
 * @param {readonly number[]} rowIndices 4 NES colour indices
 * @returns {{ r: number, g: number, b: number, a: number }[]} 4 or 16 entries
 */
export function bgTileColors(rowIndices) {
  const [br, bg, bb] = nesColor(rowIndices[0]);
  if (scale() !== 2) {
    const colors = rgbaFromNesIndices(rowIndices);
    colors[0] = { r: br, g: bg, b: bb, a: 255 };
    return colors;
  }
  return expandRowRgb(rowIndices.map((i) => nesColor(i))).map(([r, g, b]) => ({
    r,
    g,
    b,
    a: 255,
  }));
}

/**
 * Mask for indexing the array `bgTileColors` returns.
 * @returns {number} 3 classic, 15 enhanced
 */
export function colorMask() {
  return scale() === 2 ? 4 * SHADES - 1 : 0x03;
}
