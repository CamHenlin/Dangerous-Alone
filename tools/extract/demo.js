import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import { parseOffset } from '../shared/ranges.js';
import { decodeDemoTextLines } from '../shared/demoText.js';
import {
  STORY_TRANSFER_PRG,
  TITLE_TRANSFER_PRG,
  decodeStoryNametable,
  decodeTitleNametable,
  renderStoryNametableRgba,
  renderTitleNametableRgba,
} from '../shared/demoStory.js';
import { encodePngRgba } from '../shared/png.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';
import { GRAPHICS_DIR } from './graphics.js';

export const DEMO_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'demo.json');
export const DEMO_OUT_PATH = path.join(EXTRACTED_DIR, 'play', 'demo.json');
export const STORY_PNG_PATH = path.join(EXTRACTED_DIR, 'play', 'story.png');
export const TITLE_PNG_PATH = path.join(EXTRACTED_DIR, 'play', 'title.png');

/**
 * @returns {{ commonBg: Buffer, demoBg: Buffer } | null}
 */
function loadDemoChrBins() {
  const commonPath = path.join(GRAPHICS_DIR, 'common_background.bin');
  const demoPath = path.join(GRAPHICS_DIR, 'demo_background.bin');
  if (!fs.existsSync(commonPath) || !fs.existsSync(demoPath)) {
    console.warn(
      'Demo title/story PNGs skipped — run: npm run extract -- graphics (need common_background + demo_background bins)',
    );
    return null;
  }
  return {
    commonBg: fs.readFileSync(commonPath),
    demoBg: fs.readFileSync(demoPath),
  };
}

/**
 * Compose the attract storyboard PNG from the ROM transfer buf + BG CHR bins.
 * @param {Uint8Array|Buffer} prg
 * @param {string} [outPath]
 * @returns {string | null}
 */
export function extractStoryPng(prg, outPath = STORY_PNG_PATH) {
  const bins = loadDemoChrBins();
  if (!bins) return null;
  const { tiles, attrs } = decodeStoryNametable(prg);
  const { width, height, rgba } = renderStoryNametableRgba(
    tiles,
    attrs,
    bins.commonBg,
    bins.demoBg,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodePngRgba(width, height, rgba));
  return outPath;
}

/**
 * Compose the attract title PNG from `GameTitleTransferBuf` + BG CHR bins.
 * @param {Uint8Array|Buffer} prg
 * @param {string} [outPath]
 * @returns {string | null}
 */
export function extractTitlePng(prg, outPath = TITLE_PNG_PATH) {
  const bins = loadDemoChrBins();
  if (!bins) return null;
  const { tiles, attrs } = decodeTitleNametable(prg);
  const { width, height, rgba } = renderTitleNametableRgba(
    tiles,
    attrs,
    bins.commonBg,
    bins.demoBg,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodePngRgba(width, height, rgba));
  return outPath;
}

/**
 * Extract game mode `$00` attract tables + crawl text + title/story PNGs.
 * @param {{ romPath?: string, schemaPath?: string, outPath?: string, storyPngPath?: string, titlePngPath?: string }} [opts]
 */
export function cmdDemo(opts = {}) {
  const romPath = opts.romPath ?? DEFAULT_ROM_PATH;
  const schemaPath = opts.schemaPath ?? DEMO_SCHEMA_PATH;
  const outPath = opts.outPath ?? DEMO_OUT_PATH;
  const storyPngPath = opts.storyPngPath ?? STORY_PNG_PATH;
  const titlePngPath = opts.titlePngPath ?? TITLE_PNG_PATH;
  const { prg } = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  /** @param {string} name */
  const table = (name) => {
    const entry = schema.offsets[name];
    const start = parseOffset(entry.prg);
    return Array.from(prg.slice(start, start + entry.length));
  };

  const textFieldsPrg = parseOffset(schema.offsets.textFields.prg);
  const textLines = decodeDemoTextLines(prg, textFieldsPrg, schema.lineTextOffsets);

  const storyEntry = schema.offsets.storyTileAttrTransferBuf;
  const storyPrg = storyEntry ? parseOffset(storyEntry.prg) : STORY_TRANSFER_PRG;
  const titleEntry = schema.offsets.gameTitleTransferBuf;
  const titlePrg = titleEntry ? parseOffset(titleEntry.prg) : TITLE_TRANSFER_PRG;

  const titlePng = extractTitlePng(prg, titlePngPath);
  const storyPng = extractStoryPng(prg, storyPngPath);

  const doc = {
    generatedAt: new Date().toISOString(),
    lineAttrs: table('lineAttrs'),
    leftItemIds: table('leftItemIds'),
    rightItemIds: table('rightItemIds'),
    fadeDelays: table('fadeDelays'),
    fadePalettes: table('fadePalettes'),
    textFields: table('textFields'),
    lineTextAddrs: table('lineTextAddrs'),
    textLines,
    demoSpriteTileBase: schema.demoSpriteTileBase ?? 0x70,
    titlePng: titlePng ? path.posix.join('play', 'title.png') : null,
    storyPng: storyPng ? path.posix.join('play', 'story.png') : null,
    titleTransferPrg: titlePrg,
    storyTransferPrg: storyPrg,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  const pngNote = [titlePng && 'title', storyPng && 'storyboard'].filter(Boolean).join('+');
  console.log(
    `Demo: ${doc.lineAttrs.length} line attrs, ${doc.textLines.length} text lines, ` +
      `${doc.fadeDelays.length} fade steps` +
      (pngNote ? `, ${pngNote}` : '') +
      ` → ${outPath}`,
  );
  return doc;
}
