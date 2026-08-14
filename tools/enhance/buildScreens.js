/**
 * Bake the enhanced 2x overworld screens.
 *
 * Overworld backgrounds are pre-rendered per screen rather than composed from
 * a tilemap at runtime, so this is where they get built for the enhanced art
 * set — and the offline step buys something the sheet-based path cannot give.
 *
 * A screen of open desert is the same sand tile placed a hundred times. Drawn
 * from a sheet, every one of those copies carries an identical speckle, and the
 * repetition reads as a hard 16-pixel dot grid stamped across the whole field —
 * far more noticeable than the texture it was supposed to be. Baking per screen
 * lets each placement take a seed derived from its position in the world, so
 * the grain varies across the sand while the tile itself stays byte-identical
 * everywhere it is used.
 *
 * The result is written next to the originals as `screens2x/`, same filenames,
 * so the runtime swaps art sets by changing one path segment.
 */

import fs from 'node:fs';
import path from 'node:path';
import { decodePatternBlock } from '../shared/nes2bpp.js';
import { encodePngRgba } from '../shared/png.js';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { SHADES, expandRowRgb, masterPalette } from '../shared/masterPalette.js';
import { owBgTileSheetIndex } from '../shared/owBgTiles.js';
import {
  SQUARES_H,
  SQUARES_W,
  paletteRowForSquareWithBurnHint,
} from '../shared/overworld.js';
import { ENHANCED_TILE_PX } from './enhanceTile.js';
import { createTileSource } from './tileSource.js';

const GRAPHICS_DIR = path.join(EXTRACTED_DIR, 'graphics');
const OVERWORLD_DIR = path.join(EXTRACTED_DIR, 'overworld');
const PLAY_DIR = path.join(EXTRACTED_DIR, 'play');

/** `owBgTiles` sheet keys → pattern block ids. */
const SHEET_BY_KEY = Object.freeze({
  commonBg: 'common_background',
  overworldBg: 'overworld_bg',
  misc: 'common_misc',
});

/**
 * Position-derived noise seed. Two adjacent copies of one tile get different
 * grain; the same world position always gets the same grain.
 *
 * @param {number} mapIndex
 * @param {number} tileRow
 * @param {number} tileCol
 */
function positionSeed(mapIndex, tileRow, tileCol) {
  const col = (mapIndex & 0x0f) * SQUARES_W * 2 + tileCol;
  const row = (mapIndex >> 4) * SQUARES_H * 2 + tileRow;
  return (Math.imul(col + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca6b)) >>> 0;
}

function loadTileBanks() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(GRAPHICS_DIR, 'graphics_manifest.json'), 'utf8'),
  );
  /** @type {Map<string, { kind: string, tiles: Uint8Array[] }>} */
  const banks = new Map();
  for (const sheet of manifest.sheets) {
    banks.set(sheet.id, {
      kind: sheet.kind,
      tiles: decodePatternBlock(fs.readFileSync(path.join(GRAPHICS_DIR, sheet.bin))),
    });
  }
  return banks;
}

/**
 * @param {object} screen play screen pack with `tileGrid` and `attrs`
 * @param {Map<string, { kind: string, tiles: Uint8Array[] }>} banks
 * @param {{ rowsRgb: number[][][] }} paletteSet
 * @param {{ pixels: (sheetId: string, index: number, opts?: object) => Uint8Array|null }} source
 */
export function renderEnhancedScreenRgba(screen, banks, paletteSet, source) {
  const T = ENHANCED_TILE_PX;
  // An expanded row is 4 slots x SHADES entries, so the mask has to follow the
  // ramp length. Hardcoding 0x0f silently wrapped slots 2 and 3 back onto 0 and
  // 1 the moment the ramp grew, turning every mid-tone into the black backdrop.
  const MASK = 4 * SHADES - 1;
  const rows = SQUARES_H * 2;
  const cols = SQUARES_W * 2;
  const width = cols * T;
  const height = rows * T;
  const rgba = new Uint8Array(width * height * 4);
  /** @type {Map<number, number[][]>} */
  const paletteCache = new Map();

  const secrets = screen.secrets ?? [];
  for (let tr = 0; tr < rows; tr += 1) {
    for (let tc = 0; tc < cols; tc += 1) {
      const palRow = paletteRowForSquareWithBurnHint(
        Math.floor(tr / 2),
        Math.floor(tc / 2),
        screen.attrs.outerPalette,
        screen.attrs.innerPalette,
        secrets,
      );
      let colors = paletteCache.get(palRow);
      if (!colors) {
        colors = expandRowRgb(paletteSet.rowsRgb[palRow]);
        paletteCache.set(palRow, colors);
      }

      const loc = owBgTileSheetIndex(screen.tileGrid[tr][tc]);
      const sheetId = loc ? SHEET_BY_KEY[loc.sheetKey] : null;
      const pixels = loc
        ? source.pixels(sheetId, loc.index, {
          seed: positionSeed(screen.mapIndex, tr, tc),
        })
        : null;
      // A master-space tile already carries absolute colour, so the screen's
      // palette row does not apply to it — that is the whole point of letting
      // the model choose its own colours.
      const master = sheetId && source.space?.(sheetId) === 'master';

      for (let y = 0; y < T; y += 1) {
        for (let x = 0; x < T; x += 1) {
          const v = pixels ? pixels[y * T + x] : 0;
          const c = !pixels
            ? [0, 0, 0]
            : master
              ? masterPalette()[v % MASTER_SIZE]
              : colors[v & MASK];
          const o = ((tr * T + y) * width + (tc * T + x)) * 4;
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
 * @param {{ quiet?: boolean }} [opts]
 */
export function buildEnhancedScreens({ quiet = false, mode = 'procedural' } = {}) {
  const palettes = JSON.parse(fs.readFileSync(path.join(GRAPHICS_DIR, 'palettes.json'), 'utf8'));
  const overworld = palettes.paletteSets.find((p) => p.id === 'overworld');
  if (!overworld) throw new Error('palettes.json has no overworld set');
  const banks = loadTileBanks();
  const source = createTileSource(mode, banks);

  const jobs = [
    { srcDir: path.join(PLAY_DIR, 'screens'), outDir: path.join(OVERWORLD_DIR, 'screens2x') },
    {
      srcDir: path.join(PLAY_DIR, 'q2', 'screens'),
      outDir: path.join(PLAY_DIR, 'q2', 'screens2x'),
    },
  ];

  let written = 0;
  for (const { srcDir, outDir } of jobs) {
    if (!fs.existsSync(srcDir)) continue;
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.json'))) {
      const screen = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      const { width, height, rgba } = renderEnhancedScreenRgba(screen, banks, overworld, source);
      const id = screen.mapIndex.toString(16).padStart(2, '0');
      fs.writeFileSync(
        path.join(outDir, `screen_${id}.png`),
        encodePngRgba(width, height, rgba),
      );
      written += 1;
    }
    if (!quiet) console.log(`  ${path.relative(EXTRACTED_DIR, outDir)}`);
  }

  if (!quiet) console.log(`Wrote ${written} enhanced screens (${source.id} tiles)`);
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildEnhancedScreens();
}
