import { decodeTileIndices } from './nes2bpp.js';

/**
 * Resolve a BG CHR tile index to pattern bytes inside extracted/graphics bins.
 * @param {number} tile
 * @param {object} tileSources schema.tileSources
 * @param {Map<string, Buffer|Uint8Array>} patternBins id → raw pattern bytes
 */
export function getTilePatternBytes(tile, tileSources, patternBins) {
  const t = tile & 0xff;
  const empty = () => new Uint8Array(16);
  for (const source of Object.values(tileSources)) {
    if (t >= source.tileStart && t <= source.tileEndInclusive) {
      const index = t - source.tileStart;
      const bin = patternBins.get(source.patternBlockId);
      if (!bin) {
        throw new Error(`Missing pattern bin ${source.patternBlockId}`);
      }
      const offset = index * 16;
      if (offset + 16 > bin.length) {
        return empty();
      }
      return bin.subarray(offset, offset + 16);
    }
  }
  return empty();
}

/**
 * Decode tile to 8×8 color indices 0–3.
 */
export function decodeBgTile(tile, tileSources, patternBins) {
  return decodeTileIndices(getTilePatternBytes(tile, tileSources, patternBins));
}
