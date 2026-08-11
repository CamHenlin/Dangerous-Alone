/**
 * Build the enhanced graphics set the game loads.
 *
 *   node tools/enhance/cli.js         # procedural enhancer
 *   node tools/enhance/cli.js --ai    # FLUX tiles from aiTiles.py
 *
 * Both write to the same place — `graphics2x/`, `screens2x/`, `title2x.png` —
 * because that is what the runtime's Enhanced mode loads. Swapping art sets is
 * therefore a rebuild, not a code change, and Classic mode is untouched either
 * way since it reads the original `graphics/` directory.
 *
 * Order matters: the screen and title bakers read the tile planes the sheet
 * step produces, so sheets go first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { buildEnhancedSheets, ENHANCED_DIR } from './buildSheets.js';
import { buildEnhancedScreens } from './buildScreens.js';
import { buildEnhancedDemo } from './buildDemo.js';
import { AI_DIR } from './tileSource.js';

const useAi = process.argv.includes('--ai');

/**
 * Copy the FLUX sheets into the directory Enhanced mode serves.
 *
 * The `.4bpp` planes matter as much as the PNGs: dungeon rooms are composed at
 * runtime from those, not from a baked image.
 */
function installAiSheets() {
  if (!fs.existsSync(AI_DIR)) {
    throw new Error(`No AI tiles at ${AI_DIR} — run tools/enhance/aiTiles.py first`);
  }
  fs.mkdirSync(ENHANCED_DIR, { recursive: true });
  let copied = 0;
  for (const file of fs.readdirSync(AI_DIR)) {
    if (!file.endsWith('.png') && !file.endsWith('.4bpp')) continue;
    fs.copyFileSync(path.join(AI_DIR, file), path.join(ENHANCED_DIR, file));
    copied += 1;
  }
  console.log(`  copied ${copied} files ${path.relative(EXTRACTED_DIR, AI_DIR)} → ${path.relative(EXTRACTED_DIR, ENHANCED_DIR)}`);
}

const mode = useAi ? 'ai' : 'procedural';
console.log(`Enhanced graphics set: ${mode}`);

if (useAi) {
  console.log('Sheets:');
  installAiSheets();
} else {
  console.log('Enhanced sheets:');
  buildEnhancedSheets();
}

console.log('Enhanced screens:');
buildEnhancedScreens({ mode });

console.log('Enhanced title / storyboard:');
buildEnhancedDemo({ mode });
