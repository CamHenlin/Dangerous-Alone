/**
 * Build the enhanced 2x sheets from the already-extracted pattern bins.
 *
 * This reads `assets/extracted/graphics/*.bin` rather than the ROM, so the
 * overhaul is reproducible without re-running extraction and stays honest about
 * its input: whatever the extractor pulled out of the cartridge is exactly what
 * gets enhanced.
 *
 * Sheets are written with the same tile ordering and the same baked palette
 * convention as the originals, just at twice the size and sixteen colours per
 * row. A consumer that knows a tile's index can find it at the same grid
 * position, only multiplied by 2.
 */

import fs from 'node:fs';
import path from 'node:path';
import { decodePatternBlock } from '../shared/nes2bpp.js';
import { encodePngRgba } from '../shared/png.js';
import { crc32Hex, sha256Hex } from '../shared/hash.js';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { SHADES, expandRowRgb } from '../shared/masterPalette.js';
import { ENHANCED_TILE_PX, enhanceTile } from './enhanceTile.js';

export const SOURCE_DIR = path.join(EXTRACTED_DIR, 'graphics');
export const ENHANCED_DIR = path.join(EXTRACTED_DIR, 'graphics2x');
const TILES_PER_ROW = 16;

/**
 * The 16 RGBA entries a sheet is baked with. Mirrors the original extractor:
 * sprites bake with overworld SP0 (row 4), backgrounds with BG row 1, and a
 * background's slot 0 is opaque black rather than transparent.
 *
 * @param {'sprites'|'background'} kind
 * @param {{ rowsRgb: number[][][] }} overworld
 */
function bakedPalette(kind, overworld) {
  const rowIndex = kind === 'sprites' ? 4 : 1;
  const row = overworld.rowsRgb[rowIndex];
  const expanded = expandRowRgb(row);
  return expanded.map(([r, g, b], i) => ({
    r,
    g,
    b,
    // Slots are four shades wide, so slot 0 is entries 0..3.
    // Slot 0 is transparent on a sprite sheet: the first ramp's worth of entries.
    a: i < SHADES && kind === 'sprites' ? 0 : 255,
  }));
}

/**
 * Lay enhanced tiles out into one RGBA sheet.
 * @param {{ pixels: Uint8Array }[]} enhanced
 * @param {{ r: number, g: number, b: number, a: number }[]} palette 16 entries
 */
function renderEnhancedSheet(enhanced, palette) {
  const px = ENHANCED_TILE_PX;
  const cols = Math.min(TILES_PER_ROW, Math.max(enhanced.length, 1));
  const rows = Math.ceil(enhanced.length / cols) || 1;
  const width = cols * px;
  const height = rows * px;
  const rgba = new Uint8Array(width * height * 4);

  enhanced.forEach((tile, index) => {
    const baseX = (index % cols) * px;
    const baseY = Math.floor(index / cols) * px;
    for (let y = 0; y < px; y += 1) {
      for (let x = 0; x < px; x += 1) {
        const color = palette[tile.pixels[y * px + x] & (4 * SHADES - 1)];
        const o = ((baseY + y) * width + (baseX + x)) * 4;
        rgba[o] = color.r;
        rgba[o + 1] = color.g;
        rgba[o + 2] = color.b;
        rgba[o + 3] = color.a;
      }
    }
  });

  return { width, height, rgba };
}

/**
 * @param {{ sourceDir?: string, outDir?: string, quiet?: boolean }} [opts]
 */
export function buildEnhancedSheets({
  sourceDir = SOURCE_DIR,
  outDir = ENHANCED_DIR,
  quiet = false,
} = {}) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(sourceDir, 'graphics_manifest.json'), 'utf8'),
  );
  const palettes = JSON.parse(fs.readFileSync(path.join(sourceDir, 'palettes.json'), 'utf8'));
  const overworld = palettes.paletteSets.find((p) => p.id === 'overworld');
  if (!overworld) throw new Error('palettes.json has no overworld set');

  fs.mkdirSync(outDir, { recursive: true });

  const sheets = [];
  /** @type {Record<string, number>} */
  const materialTally = {};

  for (const block of manifest.sheets) {
    const bytes = fs.readFileSync(path.join(sourceDir, block.bin));
    const tiles = decodePatternBlock(bytes);
    const enhanced = tiles.map((slots, tileIndex) =>
      enhanceTile(slots, { sheetId: block.id, tileIndex, kind: block.kind }),
    );

    /** @type {Record<string, number>} */
    const perSheet = {};
    for (const t of enhanced) {
      perSheet[t.material] = (perSheet[t.material] ?? 0) + 1;
      materialTally[t.material] = (materialTally[t.material] ?? 0) + 1;
    }

    const palette = bakedPalette(block.kind, overworld);
    const { width, height, rgba } = renderEnhancedSheet(enhanced, palette);
    fs.writeFileSync(path.join(outDir, block.sheet), encodePngRgba(width, height, rgba));

    // The raw 4bpp planes travel alongside the PNG so tooling (and any future
    // re-render at a different baked palette) never has to reverse the colours.
    const raw = new Uint8Array(enhanced.length * ENHANCED_TILE_PX * ENHANCED_TILE_PX);
    enhanced.forEach((t, i) => raw.set(t.pixels, i * t.pixels.length));
    const rawName = `${block.id}.4bpp`;
    fs.writeFileSync(path.join(outDir, rawName), raw);

    sheets.push({
      id: block.id,
      description: block.description,
      kind: block.kind,
      sheet: block.sheet,
      raw: rawName,
      tileCount: tiles.length,
      tilePx: ENHANCED_TILE_PX,
      width,
      height,
      sourceCrc32: block.crc32,
      crc32: crc32Hex(Buffer.from(raw)),
      sha256: sha256Hex(Buffer.from(raw)),
      bakedPaletteRow: block.kind === 'sprites' ? 4 : 1,
      materials: perSheet,
    });

    if (!quiet) {
      const top = Object.entries(perSheet)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `${m}:${n}`)
        .join(' ');
      console.log(`  ${block.id}: ${tiles.length} tiles → ${width}×${height}  ${top}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: path.relative(EXTRACTED_DIR, sourceDir),
    tilePx: ENHANCED_TILE_PX,
    scale: 2,
    palette: 'master256',
    sheets,
    materialTally,
  };
  fs.writeFileSync(
    path.join(outDir, 'graphics_manifest.json'),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  if (!quiet) {
    const total = Object.values(materialTally).reduce((a, b) => a + b, 0);
    console.log(`Wrote ${sheets.length} enhanced sheets (${total} tiles) → ${outDir}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildEnhancedSheets();
}
