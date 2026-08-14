/**
 * Write the master palette out as JSON for the Python tooling.
 *
 * `masterPalette.js` is the single source of truth for the ramp maths. The
 * generator needs the same numbers, and a hand-mirrored copy in Python would
 * drift the first time the ramp is retuned — which already happened once when
 * the ramp went from 4 steps to 8. Dumping it keeps one definition.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { MASTER_SIZE, SHADES, masterPalette } from '../shared/masterPalette.js';

const OUT_PATH = path.join(EXTRACTED_DIR, 'graphics', 'master_palette.json');

export function dumpMasterPalette({ quiet = false } = {}) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    shades: SHADES,
    size: MASTER_SIZE,
    rgb: masterPalette().map((c) => [...c]),
  }));
  if (!quiet) console.log(`Wrote ${MASTER_SIZE}-entry master palette → ${path.relative(EXTRACTED_DIR, OUT_PATH)}`);
  return MASTER_SIZE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dumpMasterPalette();
}
