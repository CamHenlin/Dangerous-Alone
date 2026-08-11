/**
 * Bake the enhanced 2x title and storyboard screens.
 *
 * These two are composed from a nametable in the ROM rather than from the
 * overworld tables, so they need their own pass — but the shape is the same as
 * `buildScreens`: walk the tile grid, enhance each tile with a seed derived
 * from where it sits, and write the result beside the original under a `2x`
 * name.
 *
 * The title screen is the first thing a player sees, so leaving it as flat
 * original art next to an enhanced overworld would advertise the seam.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from '../extract/commands.js';
import {
  STORY_BG_PALETTE_ROWS,
  TITLE_BG_PALETTE_ROWS,
  decodeStoryNametable,
  decodeTitleNametable,
  storyTilePatternBytes,
} from '../shared/demoStory.js';
import { attrPaletteAt } from '../shared/nesTransferBuf.js';
import { decodePatternBlock } from '../shared/nes2bpp.js';
import { encodePngRgba } from '../shared/png.js';
import { nesColor } from '../shared/nesPalette.js';
import { BASE_SHADE, SHADES, expandRowRgb } from '../shared/masterPalette.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR } from '../shared/paths.js';
import { ENHANCED_TILE_PX } from './enhanceTile.js';
import { createTileSource } from './tileSource.js';
import { DEMO_BG_TILE_BASE } from '../shared/demoStory.js';

const GRAPHICS_DIR = path.join(EXTRACTED_DIR, 'graphics');
const PLAY_DIR = path.join(EXTRACTED_DIR, 'play');

const NT_COLS = 32;
const NT_ROWS = 30;

/**
 * @param {Uint8Array} tiles nametable tile ids
 * @param {Uint8Array} attrs attribute table
 * @param {Buffer} commonBg
 * @param {Buffer} demoBg
 * @param {readonly (readonly number[])[]} paletteRows
 */
function renderEnhancedNametableRgba(tiles, attrs, commonBg, demoBg, paletteRows, source) {
  const T = ENHANCED_TILE_PX;
  const MASK = 4 * SHADES - 1;
  const width = NT_COLS * T;
  const height = NT_ROWS * T;
  const rgba = new Uint8Array(width * height * 4);
  const rowColors = paletteRows.map((row) => expandRowRgb(row.map((idx) => nesColor(idx))));

  for (let row = 0; row < NT_ROWS; row += 1) {
    for (let col = 0; col < NT_COLS; col += 1) {
      const tile = (tiles[row * NT_COLS + col] ?? 0) & 0xff;
      // Same split `storyTilePatternBytes` makes: the demo bank sits above
      // $70, everything below it comes from common background.
      const [sheetId, index] = tile >= DEMO_BG_TILE_BASE
        ? ['demo_background', tile - DEMO_BG_TILE_BASE]
        : ['common_background', tile];
      const pixels = source.pixels(sheetId, index, {
        seed: (Math.imul(col + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca6b)) >>> 0,
      }) ?? new Uint8Array(T * T).fill(BASE_SHADE);
      const colors = rowColors[attrPaletteAt(attrs, col, row) & 3] ?? rowColors[0];
      for (let y = 0; y < T; y += 1) {
        for (let x = 0; x < T; x += 1) {
          const c = colors[pixels[y * T + x] & MASK];
          const o = ((row * T + y) * width + (col * T + x)) * 4;
          rgba[o] = c[0];
          rgba[o + 1] = c[1];
          rgba[o + 2] = c[2];
          rgba[o + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba };
}

/**
 * @param {{ romPath?: string, quiet?: boolean }} [opts]
 */
export function buildEnhancedDemo({ romPath = DEFAULT_ROM_PATH, quiet = false, mode = 'procedural' } = {}) {
  const commonPath = path.join(GRAPHICS_DIR, 'common_background.bin');
  const demoPath = path.join(GRAPHICS_DIR, 'demo_background.bin');
  if (!fs.existsSync(commonPath) || !fs.existsSync(demoPath)) {
    console.warn('Enhanced title/story skipped — run: npm run extract -- graphics');
    return 0;
  }
  const commonBg = fs.readFileSync(commonPath);
  const demoBg = fs.readFileSync(demoPath);
  const rom = loadValidatedRom(romPath);
  const banks = new Map([
    ['common_background', { kind: 'background', tiles: decodePatternBlock(commonBg) }],
    ['demo_background', { kind: 'background', tiles: decodePatternBlock(demoBg) }],
  ]);
  const source = createTileSource(mode, banks);

  const jobs = [
    {
      name: 'title2x.png',
      decode: decodeTitleNametable,
      rows: TITLE_BG_PALETTE_ROWS,
    },
    {
      name: 'story2x.png',
      decode: decodeStoryNametable,
      rows: STORY_BG_PALETTE_ROWS,
    },
  ];

  fs.mkdirSync(PLAY_DIR, { recursive: true });
  for (const job of jobs) {
    const { tiles, attrs } = job.decode(rom.prg);
    const { width, height, rgba } = renderEnhancedNametableRgba(
      tiles,
      attrs,
      commonBg,
      demoBg,
      job.rows,
      source,
    );
    fs.writeFileSync(path.join(PLAY_DIR, job.name), encodePngRgba(width, height, rgba));
    if (!quiet) console.log(`  play/${job.name} (${width}×${height})`);
  }
  return jobs.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildEnhancedDemo();
}
