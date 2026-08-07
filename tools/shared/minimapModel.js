/**
 * Pure minimap cell model for OW / dungeon status-bar and submenu maps.
 */

/**
 * Room ids that belong on a dungeon map (excludes cellars).
 * @param {{ rooms?: { roomId: number }[], cellarRooms?: number[] }} level
 * @returns {Set<number>}
 */
export function dungeonMapRooms(level) {
  /** @type {Set<number>} */
  const onMap = new Set((level?.rooms ?? []).map((r) => r.roomId));
  for (const c of level?.cellarRooms ?? []) onMap.delete(c);
  return onMap;
}

/**
 * Bounding box of rooms on the 16×8 dungeon grid.
 * @param {Iterable<number>} roomIds
 * @returns {{ minCol: number, maxCol: number, minRow: number, maxRow: number } | null}
 */
export function roomBounds(roomIds) {
  let minCol = 16;
  let maxCol = -1;
  let minRow = 8;
  let maxRow = -1;
  for (const id of roomIds) {
    const col = id & 0x0f;
    const row = (id >> 4) & 0x07;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  if (maxCol < 0) return null;
  return { minCol, maxCol, minRow, maxRow };
}

/**
 * @typedef {object} DungeonMinimapCell
 * @property {boolean} onMap
 * @property {boolean} visible room square drawn (map, visit, or current)
 * @property {boolean} visited
 * @property {boolean} current
 * @property {boolean} bossMark
 * @property {boolean} triforceMark
 * @property {boolean} compassOnly boss/TF peek without a room square
 */

/**
 * Classify one dungeon map cell for rendering.
 * @param {number} roomId
 * @param {object} opts
 * @param {Set<number>} opts.onMap
 * @param {Set<number>} opts.visited
 * @param {number} [opts.currentRoomId]
 * @param {boolean} [opts.hasMap]
 * @param {boolean} [opts.hasCompass]
 * @param {number} [opts.bossRoom]
 * @param {number} [opts.triforceRoom]
 * @returns {DungeonMinimapCell}
 */
export function dungeonMinimapCell(roomId, opts) {
  const onMap = opts.onMap.has(roomId);
  if (!onMap) {
    return {
      onMap: false,
      visible: false,
      visited: false,
      current: false,
      bossMark: false,
      triforceMark: false,
      compassOnly: false,
    };
  }
  const current = opts.currentRoomId === roomId;
  const visited = opts.visited.has(roomId);
  const hasMap = Boolean(opts.hasMap);
  const hasCompass = Boolean(opts.hasCompass);
  const visible = hasMap || visited || current;
  const bossMark = hasCompass && roomId === opts.bossRoom;
  const triforceMark = hasCompass && roomId === opts.triforceRoom;
  return {
    onMap: true,
    visible,
    visited,
    current,
    bossMark,
    triforceMark,
    compassOnly: !visible && (bossMark || triforceMark),
  };
}

/**
 * Overworld status-bar radar: position on the 16×8 screen grid.
 * @param {number | null | undefined} roomId
 * @returns {{ col: number, row: number } | null}
 */
export function overworldMarker(roomId) {
  if (roomId == null || roomId < 0) return null;
  return { col: roomId & 0x0f, row: (roomId >> 4) & 0x07 };
}
