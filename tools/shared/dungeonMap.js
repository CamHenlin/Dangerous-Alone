/**
 * Text submenu map for a dungeon level (16×8 rooms).
 *
 * @param {object} level
 * @param {object} opts
 * @param {Set<number>|Iterable<number>} [opts.visited]
 * @param {number} [opts.currentRoomId]
 * @param {boolean} [opts.hasMap]
 * @param {boolean} [opts.hasCompass]
 */
export function formatDungeonMap(level, opts = {}) {
  const visited = opts.visited instanceof Set ? opts.visited : new Set(opts.visited ?? []);
  const hasMap = Boolean(opts.hasMap);
  const hasCompass = Boolean(opts.hasCompass);
  const current = opts.currentRoomId;
  const boss = level.bossRoom;
  const triforce = level.triforceRoom;

  /** @type {Set<number>} */
  const onMap = new Set(level.rooms.map((r) => r.roomId));
  // Hide cellars from the main map grid (off-map ids like $7F).
  for (const c of level.cellarRooms ?? []) onMap.delete(c);

  const lines = [];
  for (let row = 0; row < 8; row += 1) {
    let line = '';
    for (let col = 0; col < 16; col += 1) {
      const id = (row << 4) | col;
      if (!onMap.has(id)) {
        line += ' ';
        continue;
      }
      if (current === id) {
        line += '@';
        continue;
      }
      if (hasCompass && id === boss) {
        line += 'B';
        continue;
      }
      if (hasCompass && id === triforce) {
        line += 'T';
        continue;
      }
      if (hasMap || visited.has(id)) {
        line += visited.has(id) ? '·' : 'o';
        continue;
      }
      line += ' ';
    }
    // Trim trailing spaces but keep a left gutter sense of width.
    if (line.trim().length) lines.push(line.replace(/\s+$/g, ''));
  }
  if (lines.length === 0) return '(no map)';
  return lines.join('\n');
}
