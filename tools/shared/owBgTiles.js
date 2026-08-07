/**
 * Map OW play-area PPU BG tile ids → extracted sheet + local index.
 * Matches assets/schema/overworld.json tileSources.
 */

/** @type {readonly { tileStart: number, tileEndInclusive: number, sheetKey: string, cols: number }[]} */
export const OW_BG_SHEET_RANGES = Object.freeze([
  { tileStart: 0, tileEndInclusive: 111, sheetKey: 'commonBg', cols: 16 },
  { tileStart: 112, tileEndInclusive: 241, sheetKey: 'overworldBg', cols: 16 },
  // common_misc is a single 14-tile row (hearts etc. + $F2–$FF).
  { tileStart: 242, tileEndInclusive: 255, sheetKey: 'misc', cols: 14 },
]);

/**
 * @param {number} ppuTile
 * @returns {{ sheetKey: string, index: number, cols: number } | null}
 */
export function owBgTileSheetIndex(ppuTile) {
  const t = ppuTile & 0xff;
  for (const range of OW_BG_SHEET_RANGES) {
    if (t >= range.tileStart && t <= range.tileEndInclusive) {
      return {
        sheetKey: range.sheetKey,
        index: t - range.tileStart,
        cols: range.cols,
      };
    }
  }
  return null;
}

/**
 * Pixel offset of a PPU BG tile inside its sheet PNG.
 * @param {number} ppuTile
 * @returns {{ sheetKey: string, sx: number, sy: number } | null}
 */
export function owBgTileSourceRect(ppuTile) {
  const loc = owBgTileSheetIndex(ppuTile);
  if (!loc) return null;
  return {
    sheetKey: loc.sheetKey,
    sx: (loc.index % loc.cols) * 8,
    sy: Math.floor(loc.index / loc.cols) * 8,
  };
}
