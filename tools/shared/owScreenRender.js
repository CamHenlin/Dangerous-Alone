/**
 * Overworld screen rasterizer (column → tile → CHR → RGBA).
 * Shared by the Node extractor and the in-browser pack builder.
 */

import {
  paletteRowForSquareWithBurnHint,
  screenSecrets,
  screenToTileGrid,
} from './overworld.js';
import { decodeBgTile } from './tileChr.js';
import { nesColor, rgbaFromNesIndices } from './nesPalette.js';

/**
 * Raster an already-expanded OW tile grid (row-major 8×8 CHR indices).
 * @param {number[][]} tileGrid
 * @param {{ outerPalette: number, innerPalette: number }} attrs
 * @param {object[]} secrets
 * @param {object} tileSources
 * @param {Map<string, Uint8Array>} patternBins
 * @param {{ rows: number[][] }} paletteSet
 */
export function renderOwTileGridRgba(tileGrid, attrs, secrets, tileSources, patternBins, paletteSet) {
  const tileRows = tileGrid.length;
  const tileCols = tileGrid[0]?.length ?? 0;
  const width = tileCols * 8;
  const height = tileRows * 8;
  const rgba = new Uint8Array(width * height * 4);

  for (let tr = 0; tr < tileRows; tr += 1) {
    for (let tc = 0; tc < tileCols; tc += 1) {
      const squareRow = Math.floor(tr / 2);
      const squareCol = Math.floor(tc / 2);
      const palRow = paletteRowForSquareWithBurnHint(
        squareRow,
        squareCol,
        attrs.outerPalette,
        attrs.innerPalette,
        secrets,
      );
      const colors = rgbaFromNesIndices(paletteSet.rows[palRow]);
      const [br, bg, bb] = nesColor(paletteSet.rows[palRow][0]);
      colors[0] = { r: br, g: bg, b: bb, a: 255 };

      const indices = decodeBgTile(tileGrid[tr][tc], tileSources, patternBins);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((tr * 8 + y) * width + (tc * 8 + x)) * 4;
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

/**
 * @param {object} screen
 * @param {object} tables
 * @param {Map<string, Uint8Array>} patternBins
 * @param {{ rows: number[][] }} paletteSet
 * @param {number} [quest]
 */
export function renderOwScreenRgba(screen, tables, patternBins, paletteSet, quest = 1) {
  const tileGrid = screenToTileGrid(screen, tables);
  const secrets = screen.secrets ?? screenSecrets(screen, tables, quest);
  return renderOwTileGridRgba(
    tileGrid,
    screen.attrs,
    secrets,
    tables.tileSources,
    patternBins,
    paletteSet,
  );
}
