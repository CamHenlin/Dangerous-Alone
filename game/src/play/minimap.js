import {
  dungeonMapRooms,
  dungeonMinimapCell,
  overworldMarker,
  roomBounds,
} from '@shared/minimapModel.js';

const COLORS = Object.freeze({
  frame: 0x4a5568,
  back: 0x0a1018,
  owCell: 0x1e2a20,
  visited: 0x6bcf7f,
  unvisited: 0x3a4858,
  boss: 0xe04040,
  triforce: 0xe8d040,
  player: 0xffffff,
});

/**
 * NES-style dungeon room grid with player / compass marks.
 * @param {import('pixi.js').Graphics} g
 * @param {object} level
 * @param {object} opts
 * @param {Set<number>|Iterable<number>} [opts.visited]
 * @param {number} [opts.currentRoomId]
 * @param {boolean} [opts.hasMap]
 * @param {boolean} [opts.hasCompass]
 * @param {number} [opts.x]
 * @param {number} [opts.y]
 * @param {number} [opts.cellW]
 * @param {number} [opts.cellH]
 * @param {boolean} [opts.compact] crop to occupied rooms (HUD)
 */
export function drawDungeonMinimap(g, level, opts = {}) {
  const visited = opts.visited instanceof Set ? opts.visited : new Set(opts.visited ?? []);
  const hasMap = Boolean(opts.hasMap);
  const hasCompass = Boolean(opts.hasCompass);
  const current = opts.currentRoomId;
  const ox = opts.x ?? 148;
  const oy = opts.y ?? 72;
  const cw = opts.cellW ?? 6;
  const ch = opts.cellH ?? 5;
  const onMap = dungeonMapRooms(level);

  let minCol = 0;
  let minRow = 0;
  let cols = 16;
  let rows = 8;
  if (opts.compact) {
    const b = roomBounds(onMap);
    if (b) {
      minCol = b.minCol;
      minRow = b.minRow;
      cols = b.maxCol - b.minCol + 1;
      rows = b.maxRow - b.minRow + 1;
    }
  }

  g.rect(ox - 2, oy - 2, cols * cw + 4, rows * ch + 4);
  g.fill({ color: COLORS.back, alpha: 0.95 });
  g.stroke({ width: 1, color: COLORS.frame });

  for (let row = minRow; row < minRow + rows; row += 1) {
    for (let col = minCol; col < minCol + cols; col += 1) {
      const id = (row << 4) | col;
      const cell = dungeonMinimapCell(id, {
        onMap,
        visited,
        currentRoomId: current,
        hasMap,
        hasCompass,
        bossRoom: level.bossRoom,
        triforceRoom: level.triforceRoom,
      });
      if (!cell.onMap) continue;
      if (!cell.visible && !cell.compassOnly) continue;

      const x = ox + (col - minCol) * cw;
      const y = oy + (row - minRow) * ch;

      if (cell.compassOnly) {
        g.rect(x + 1, y + 1, cw - 2, ch - 2);
        g.fill(cell.bossMark ? COLORS.boss : COLORS.triforce);
        continue;
      }

      g.rect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      g.fill(cell.visited || cell.current ? COLORS.visited : COLORS.unvisited);

      if (cell.bossMark) {
        g.rect(x + Math.max(1, (cw / 2) | 0) - 1, y + 1, 2, 2);
        g.fill(COLORS.boss);
      }
      if (cell.triforceMark) {
        g.rect(x + Math.max(1, (cw / 2) | 0) - 1, y + 1, 2, 2);
        g.fill(COLORS.triforce);
      }
      if (cell.current) {
        g.circle(x + cw / 2, y + ch / 2, Math.max(1.2, Math.min(cw, ch) / 2 - 0.5));
        g.fill(COLORS.player);
      }
    }
  }
}

/**
 * Overworld status-bar / submenu locator (16×8 screens + player dot).
 * @param {import('pixi.js').Graphics} g
 * @param {number | null} roomId
 * @param {object} opts
 * @param {number} [opts.x]
 * @param {number} [opts.y]
 * @param {number} [opts.cellW]
 * @param {number} [opts.cellH]
 */
export function drawOverworldMinimap(g, roomId, opts = {}) {
  const ox = opts.x ?? 8;
  const oy = opts.y ?? 8;
  const cw = opts.cellW ?? 4;
  const ch = opts.cellH ?? 3;

  g.rect(ox - 2, oy - 2, 16 * cw + 4, 8 * ch + 4);
  g.fill({ color: COLORS.back, alpha: 0.95 });
  g.stroke({ width: 1, color: COLORS.frame });

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const x = ox + col * cw;
      const y = oy + row * ch;
      g.rect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      g.fill(COLORS.owCell);
    }
  }

  const marker = overworldMarker(roomId);
  if (marker) {
    g.circle(
      ox + marker.col * cw + cw / 2,
      oy + marker.row * ch + ch / 2,
      Math.max(1.5, Math.min(cw, ch) / 2),
    );
    g.fill(COLORS.player);
  }
}
