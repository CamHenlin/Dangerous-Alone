import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import {
  decodePatternBlock,
  parseDeathPaletteSeries,
  parseLevelInfoPalettes,
  renderTilesRgba,
} from '../shared/nes2bpp.js';
import { GREY_PREVIEW, nesColor, rgbaFromNesIndices } from '../shared/nesPalette.js';
import { encodePngRgba } from '../shared/png.js';
import { crc32Hex } from '../shared/hash.js';
import { sha256Hex } from '../shared/hashNode.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';

export const PATTERN_BLOCKS_PATH = path.join(ROOT, 'assets', 'schema', 'pattern_blocks.json');
export const GRAPHICS_DIR = path.join(EXTRACTED_DIR, 'graphics');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hex(n) {
  return `0x${n.toString(16).toUpperCase()}`;
}

function loadPatternSchema(schemaPath = PATTERN_BLOCKS_PATH) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

function paletteToRgba(previewMode, levelPalettes, rowIndex) {
  if (previewMode === 'grey') {
    return GREY_PREVIEW.map(([r, g, b], i) => ({ r, g, b, a: i === 0 ? 0 : 255 }));
  }
  const rows = levelPalettes?.rows;
  if (!rows?.[rowIndex]) {
    return GREY_PREVIEW.map(([r, g, b], i) => ({ r, g, b, a: i === 0 ? 0 : 255 }));
  }
  return rgbaFromNesIndices(rows[rowIndex]);
}

/**
 * Extract pattern PNGs + palette JSON from the ROM.
 * @param {object} opts
 */
export function cmdGraphics({
  romPath = DEFAULT_ROM_PATH,
  schemaPath = PATTERN_BLOCKS_PATH,
  outDir = GRAPHICS_DIR,
} = {}) {
  const rom = loadValidatedRom(romPath);
  const schema = loadPatternSchema(schemaPath);
  ensureDir(outDir);

  const paletteSets = [];
  for (const entry of schema.level_info_palettes ?? []) {
    const blob = rom.prg.subarray(entry.prg_offset, entry.prg_offset + entry.length);
    const parsed = parseLevelInfoPalettes(blob);
    const deathFade = parseDeathPaletteSeries(blob);
    const set = {
      id: entry.id,
      prgOffset: entry.prg_offset,
      prgOffsetHex: hex(entry.prg_offset),
      rows: parsed.rows,
      rowsRgb: parsed.rows.map((row) => row.map((idx) => nesColor(idx))),
      rawNesIndices: parsed.raw,
      deathFade,
      deathFadeRgb: deathFade.map((step) => step.map((idx) => nesColor(idx))),
    };
    paletteSets.push(set);
  }

  const palettesPath = path.join(outDir, 'palettes.json');
  fs.writeFileSync(palettesPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), paletteSets }, null, 2)}\n`);

  const overworld = paletteSets.find((p) => p.id === 'overworld');
  const sheets = [];

  for (const block of schema.blocks) {
    const end = block.prg_offset + block.length;
    if (end > rom.prg.length) {
      throw new Error(`Block ${block.id} exceeds PRG (${hex(end)})`);
    }
    const bytes = Buffer.from(rom.prg.subarray(block.prg_offset, end));
    const binName = `${block.id}.bin`;
    fs.writeFileSync(path.join(outDir, binName), bytes);
    const tiles = decodePatternBlock(bytes);

    // Background sheets: use overworld BG palette row 1 (inner terrain-ish).
    // Sprite sheets: use sprite palette row 4 (Link-ish) when available.
    const rowIndex = block.kind === 'sprites' ? 4 : 1;
    const palette = paletteToRgba('level', overworld, rowIndex);
    // Ensure background color 0 is opaque black for BG readability in the viewer.
    if (block.kind === 'background') {
      palette[0] = { r: 0, g: 0, b: 0, a: 255 };
    }

    const { width, height, rgba } = renderTilesRgba(tiles, palette, 16);
    const png = encodePngRgba(width, height, rgba);
    const sheetPath = path.join(outDir, block.sheet);
    fs.writeFileSync(sheetPath, png);

    // Also emit a greyscale preview for debugging pure pattern shapes.
    const greyPalette = paletteToRgba('grey');
    if (block.kind === 'background') {
      greyPalette[0] = { r: 0, g: 0, b: 0, a: 255 };
    }
    const grey = renderTilesRgba(tiles, greyPalette, 16);
    const greyName = block.sheet.replace(/\.png$/, '_grey.png');
    fs.writeFileSync(path.join(outDir, greyName), encodePngRgba(grey.width, grey.height, grey.rgba));

    sheets.push({
      id: block.id,
      description: block.description,
      kind: block.kind,
      sheet: block.sheet,
      greySheet: greyName,
      bin: binName,
      tileCount: tiles.length,
      width,
      height,
      prgOffset: block.prg_offset,
      prgOffsetHex: hex(block.prg_offset),
      length: block.length,
      crc32: crc32Hex(bytes),
      sha256: sha256Hex(bytes),
      previewPaletteRow: rowIndex,
    });

    console.log(
      `  ${block.id}: ${tiles.length} tiles → ${block.sheet} (${width}×${height}) crc32=${sheets.at(-1).crc32}`,
    );
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    romPath,
    schemaPath,
    palettes: path.relative(EXTRACTED_DIR, palettesPath),
    sheets,
  };
  const manifestPath = path.join(outDir, 'graphics_manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${sheets.length} sheets + palettes → ${outDir}`);
  return manifest;
}
