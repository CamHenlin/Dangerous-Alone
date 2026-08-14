/**
 * Price "one variant per usage".
 *
 * The (slot, shade) representation exists only because one CHR tile has to look
 * right under every palette row it is ever drawn with. Bake a separate enhanced
 * tile per (tile, row) pair the game actually uses and that constraint is gone
 * — each variant can then carry absolute colour. The cost is the pair count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { owBgTileSheetIndex } from '../shared/owBgTiles.js';
import { paletteRowForSquareWithBurnHint } from '../shared/overworld.js';

const PLAY_DIR = path.join(EXTRACTED_DIR, 'play');

const pairs = new Set();
const tiles = new Set();
for (const f of fs.readdirSync(path.join(PLAY_DIR, 'screens')).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(PLAY_DIR, 'screens', f), 'utf8'));
  for (let tr = 0; tr < s.tileGrid.length; tr += 1) {
    for (let tc = 0; tc < s.tileGrid[tr].length; tc += 1) {
      const row = paletteRowForSquareWithBurnHint(
        Math.floor(tr / 2), Math.floor(tc / 2),
        s.attrs.outerPalette, s.attrs.innerPalette, [],
      );
      const loc = owBgTileSheetIndex(s.tileGrid[tr][tc]);
      if (!loc) continue;
      tiles.add(`${loc.sheetKey}#${loc.index}`);
      pairs.add(`${loc.sheetKey}#${loc.index}@${row}`);
    }
  }
}
console.log(`overworld distinct tiles used      : ${tiles.size}`);
console.log(`overworld distinct (tile,row) pairs: ${pairs.size}`);
console.log(`multiplier                         : ${(pairs.size / tiles.size).toFixed(2)}x`);

// Emit the mapping so the generator can bake one variant per usage.
const byTile = {};
for (const p of pairs) {
  const [t, r] = p.split('@');
  (byTile[t] ??= []).push(Number(r));
}
for (const k of Object.keys(byTile)) byTile[k].sort((a, b) => a - b);
fs.writeFileSync(
  path.join(EXTRACTED_DIR, 'play', 'tile_palette_rows.json'),
  JSON.stringify({ byTile }, null, 1),
);
console.log(`wrote tile_palette_rows.json`);
