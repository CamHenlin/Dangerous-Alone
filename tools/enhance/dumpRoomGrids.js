/**
 * Dump every dungeon room's composed tile grid so the context builder can use
 * real dungeon neighbourhoods.
 *
 * Overworld screens ship with their `tileGrid` already in the extract, but a
 * dungeon room does not — walls, doors and floor are assembled at load time
 * from the room's layout and door state. That assembly is non-trivial and
 * already correct in `dungeonRoomLayout.js`, so this runs the real composer and
 * writes the result out rather than reimplementing it in the Python tooling.
 *
 * Without this, every dungeon square falls back to being drawn surrounded by
 * copies of itself, which is why dungeon tiles join badly at their edges.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { composeDungeonRoomTiles, openSidesForRoom } from '../shared/dungeonRoomLayout.js';
import { UW_PRIMARY_SQUARES } from '../shared/dungeonPlay.js';

const DUNGEONS_DIR = path.join(EXTRACTED_DIR, 'dungeons');
const OUT_PATH = path.join(EXTRACTED_DIR, 'play', 'room_grids.json');

/**
 * @param {{ quiet?: boolean }} [opts]
 */
export function dumpRoomGrids({ quiet = false } = {}) {
  const rooms = [];
  for (const quest of ['q1', 'q2']) {
    const questDir = path.join(DUNGEONS_DIR, quest);
    if (!fs.existsSync(questDir)) continue;
    for (const levelDir of fs.readdirSync(questDir).sort()) {
      const levelPath = path.join(questDir, levelDir, 'level.json');
      if (!fs.existsSync(levelPath)) continue;
      const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
      for (const room of level.rooms ?? []) {
        try {
          // Doors open: that is how a room looks while being walked through,
          // and it is the arrangement whose seams the player actually sees.
          const tileGrid = composeDungeonRoomTiles(room, {
            primarySquares: UW_PRIMARY_SQUARES,
            openSides: openSidesForRoom(room, null),
          });
          rooms.push({ quest, level: levelDir, roomId: room.roomId, tileGrid });
        } catch (err) {
          if (!quiet) console.warn(`  skipped ${quest}/${levelDir} room ${room.roomId}: ${err.message}`);
        }
      }
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ rooms }));
  if (!quiet) console.log(`Wrote ${rooms.length} room grids → ${path.relative(EXTRACTED_DIR, OUT_PATH)}`);
  return rooms.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dumpRoomGrids();
}
