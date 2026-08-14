/**
 * Render the authored prologue into a vine-framed storyboard PNG.
 *
 *     npm run story:boards
 *
 * Output goes to `assets/extracted/play/prologue.png`, deliberately *not* over
 * `story.png`: that one is the ROM's own storyboard and belongs to the
 * extractor, so `npm run extract -- demo` would overwrite anything written
 * there. The game prefers the authored file and falls back to the ROM, which
 * means deleting it restores the 1986 screen — the same rule the rest of
 * `story/` follows.
 *
 * The board is a whole number of 240px panels tall and the attract sequence
 * derives its page count from the image height, so adding a paragraph here is
 * the only edit needed to add a panel there.
 *
 * The epilogue uses the same frame and the same wrap, but is *not* baked: its
 * text is typed out a glyph at a time, so `endingUi.js` draws the frame live
 * and lays the words out through `tools/shared/endingStory.js`. Both ends of
 * the game therefore share `tools/shared/storyboard.js` as their geometry.
 */

import fs from 'node:fs';
import path from 'node:path';

import { EPILOGUE, EPILOGUE_TITLE } from '../../story/ending.js';
import { HIGHLIGHT, PARAGRAPHS, TITLE } from '../../story/prologue.js';
import { encodePngRgba } from '../shared/png.js';
import { renderDemoNametableRgba } from '../shared/demoStory.js';
import { unrenderableChars } from '../shared/nesCharset.js';
import { EXTRACTED_DIR, ROOT } from '../shared/paths.js';
import {
  BODY_ROWS,
  composeStoryboard,
  paginatePanels,
} from '../shared/storyboard.js';

const PLAY_DIR = path.join(EXTRACTED_DIR, 'play');
const GRAPHICS_DIR = path.join(EXTRACTED_DIR, 'graphics');

export const PROLOGUE_PNG_PATH = path.join(PLAY_DIR, 'prologue.png');
export const EPILOGUE_PNG_PATH = path.join(PLAY_DIR, 'epilogue.png');

/**
 * Paginate paragraphs into panels, putting `title` on the first one.
 * @param {string[]} paragraphs
 * @param {string} [title]
 * @returns {import('../shared/storyboard.js').Panel[]}
 */
export function storyboardPanels(paragraphs, title) {
  const pages = paginatePanels(paragraphs, { rowsPerPanel: BODY_ROWS.length });
  return pages.map((lines, i) => (i === 0 && title ? { title, lines } : { lines }));
}

/**
 * @param {Uint8Array|Buffer} commonBg
 * @param {Uint8Array|Buffer} demoBg
 * @param {import('../shared/storyboard.js').Panel[]} panels
 * @param {Record<string, number>} highlight
 * @param {string} outPath
 */
function writeBoard(commonBg, demoBg, panels, highlight, outPath) {
  const board = composeStoryboard(panels, { highlight });
  const { width, height, rgba } = renderDemoNametableRgba(
    board.tiles,
    board.attrs,
    commonBg,
    demoBg,
    undefined,
    { rows: board.rows },
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodePngRgba(width, height, rgba));
  return {
    outPath,
    panels: board.panelCount,
    width,
    height,
    fill: panels.map((p) => p.lines.length),
  };
}

/** Fail the build on a character the NES charset cannot draw. */
function assertRenderable(label, strings) {
  for (const text of strings) {
    if (!text) continue;
    const bad = unrenderableChars(text);
    if (bad.length) {
      throw new Error(`${label} has unrenderable ${JSON.stringify(bad)} in ${JSON.stringify(text)}`);
    }
  }
}

/**
 * @param {{ outDir?: string, graphicsDir?: string }} [opts]
 */
export function buildStoryboards(opts = {}) {
  const outDir = opts.outDir ?? PLAY_DIR;
  const graphicsDir = opts.graphicsDir ?? GRAPHICS_DIR;

  const commonPath = path.join(graphicsDir, 'common_background.bin');
  const demoPath = path.join(graphicsDir, 'demo_background.bin');
  if (!fs.existsSync(commonPath) || !fs.existsSync(demoPath)) {
    throw new Error(
      'Missing BG CHR bins — run: npm run extract -- graphics (need common_background + demo_background)',
    );
  }
  const commonBg = fs.readFileSync(commonPath);
  const demoBg = fs.readFileSync(demoPath);

  assertRenderable('Prologue', [TITLE, ...PARAGRAPHS]);
  assertRenderable('Epilogue', [EPILOGUE_TITLE, ...EPILOGUE]);

  return {
    prologue: writeBoard(
      commonBg,
      demoBg,
      storyboardPanels(PARAGRAPHS, TITLE),
      HIGHLIGHT,
      path.join(outDir, 'prologue.png'),
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = buildStoryboards();
  for (const [name, board] of Object.entries(res)) {
    console.log(
      `${name}: ${board.panels} panel${board.panels === 1 ? '' : 's'} `
        + `(${board.width}×${board.height}) → ${path.relative(ROOT, board.outPath)}`,
    );
    // Panel fill, so a stranded two-line panel is obvious without opening the PNG.
    console.log(`  rows used per panel: ${board.fill.join(' / ')} of ${BODY_ROWS.length}`);
  }
}
