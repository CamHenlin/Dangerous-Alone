/**
 * The real walkability grid for each overworld screen, straight from the
 * collision rule the game plays by.
 *
 * A generated screen is only usable if what it *looks* like agrees with what
 * the player can actually walk through. Drawing a path where the game has a
 * cliff is not a cosmetic problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { isOwTileWalkable } from '../shared/collision.js';

const PLAY = path.join(EXTRACTED_DIR, 'play');
const out = {};
for (const f of fs.readdirSync(path.join(PLAY, 'screens')).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(PLAY, 'screens', f), 'utf8'));
  out[s.mapIndex] = s.tileGrid.map((row) => row.map((t) => (isOwTileWalkable(t) ? 1 : 0)));
}
fs.writeFileSync(path.join(PLAY, 'walkable.json'), JSON.stringify(out));
console.log(`wrote walkable.json for ${Object.keys(out).length} screens`);
