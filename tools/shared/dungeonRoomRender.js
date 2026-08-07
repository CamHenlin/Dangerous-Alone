/**
 * Render a composed UW play-area tile grid to RGBA (256×176).
 */

import { decodeBgTile } from './tileChr.js';
import { nesColor, rgbaFromNesIndices } from './nesPalette.js';
import {
  FLOOR_ORIGIN,
  FLOOR_TILES_H,
  FLOOR_TILES_W,
  PLAY_COLS,
  PLAY_ROWS,
  composeDoorFrameTiles,
  composeDungeonRoomTiles,
  openSidesForRoom,
} from './dungeonRoomLayout.js';

/** CHR left transparent in door-frame overlays so Link shows through the opening. */
export const DOOR_OVERLAY_CLEAR_TILES = Object.freeze(new Set([0x00, 0x24]));

/** Default tileSources from assets/schema/dungeons.json (for play without schema fetch). */
export const UW_TILE_SOURCES = Object.freeze({
  commonBackground: {
    tileStart: 0,
    tileEndInclusive: 111,
    patternBlockId: 'common_background',
  },
  underworldBackground: {
    tileStart: 112,
    tileEndInclusive: 241,
    patternBlockId: 'underworld_bg',
  },
  commonMisc: {
    tileStart: 242,
    tileEndInclusive: 255,
    patternBlockId: 'common_misc',
  },
});

/**
 * @param {number} row
 * @param {number} col
 * @param {number} outer
 * @param {number} inner
 */
export function paletteRowForPlayTile(row, col, outer, inner) {
  const inFloor =
    row >= FLOOR_ORIGIN.row
    && row < FLOOR_ORIGIN.row + FLOOR_TILES_H
    && col >= FLOOR_ORIGIN.col
    && col < FLOOR_ORIGIN.col + FLOOR_TILES_W;
  return inFloor ? inner & 3 : outer & 3;
}

/**
 * @param {number[][]} tileGrid 22×32
 * @param {object} opts
 * @param {{ rows: number[][] }} opts.paletteSet
 * @param {object} opts.tileSources
 * @param {Map<string, Uint8Array|Buffer>} opts.patternBins
 * @param {number} [opts.outerPalette]
 * @param {number} [opts.innerPalette]
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function renderPlayGridRgba(tileGrid, opts) {
  const width = PLAY_COLS * 8;
  const height = PLAY_ROWS * 8;
  const rgba = new Uint8Array(width * height * 4);
  const outer = opts.outerPalette ?? 0;
  const inner = opts.innerPalette ?? 1;
  const { paletteSet, tileSources, patternBins } = opts;

  for (let tr = 0; tr < PLAY_ROWS; tr += 1) {
    for (let tc = 0; tc < PLAY_COLS; tc += 1) {
      const palRow = paletteRowForPlayTile(tr, tc, outer, inner);
      const colors = rgbaFromNesIndices(paletteSet.rows[palRow]);
      const [br, bg, bb] = nesColor(paletteSet.rows[palRow][0]);
      colors[0] = { r: br, g: bg, b: bb, a: 255 };

      const indices = decodeBgTile(tileGrid[tr][tc], tileSources, patternBins);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((tr * 8 + y) * width + (tc * 8 + x)) * 4;
          rgba[px] = c.r;
          rgba[px + 1] = c.g;
          rgba[px + 2] = c.b;
          rgba[px + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba };
}

/**
 * Render one UW metatile (WriteSquareUW 2×2) to RGBA.
 * Tile order matches roomToTileGrid: UL, LL / UR, LR → primary..+3.
 * @param {number} primary CHR base (e.g. $B0 block, $74 floor)
 * @param {object} opts
 * @param {{ rows: number[][] }} opts.paletteSet
 * @param {object} [opts.tileSources]
 * @param {Map<string, Uint8Array|Buffer>} opts.patternBins
 * @param {number} [opts.paletteRow] BG palette row 0–3 (floor uses inner)
 */
export function renderUwSquareRgba(primary, opts) {
  const tileSources = opts.tileSources ?? UW_TILE_SOURCES;
  const palRow = opts.paletteRow ?? 1;
  const colors = rgbaFromNesIndices(opts.paletteSet.rows[palRow & 3]);
  const [br, bg, bb] = nesColor(opts.paletteSet.rows[palRow & 3][0]);
  colors[0] = { r: br, g: bg, b: bb, a: 255 };

  const width = 16;
  const height = 16;
  const rgba = new Uint8Array(width * height * 4);
  const tiles = [
    [primary & 0xff, (primary + 2) & 0xff],
    [(primary + 1) & 0xff, (primary + 3) & 0xff],
  ];
  for (let tr = 0; tr < 2; tr += 1) {
    for (let tc = 0; tc < 2; tc += 1) {
      const indices = decodeBgTile(tiles[tr][tc], tileSources, opts.patternBins);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((tr * 8 + y) * width + (tc * 8 + x)) * 4;
          rgba[px] = c.r;
          rgba[px + 1] = c.g;
          rgba[px + 2] = c.b;
          rgba[px + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba };
}

/**
 * Compose + render a dungeon room.
 * @param {object} room
 * @param {object} opts same as renderPlayGridRgba plus openSides / doorState / primarySquares
 */
export function renderDungeonRoomRgba(room, opts = {}) {
  const openSides =
    opts.openSides
    ?? openSidesForRoom(room, opts.doorState ?? null);
  const tileGrid = composeDungeonRoomTiles(room, {
    primarySquares: opts.primarySquares,
    openSides,
  });
  const { width, height, rgba } = renderPlayGridRgba(tileGrid, {
    paletteSet: opts.paletteSet,
    tileSources: opts.tileSources ?? UW_TILE_SOURCES,
    patternBins: opts.patternBins,
    outerPalette: room.doors?.outerPalette ?? 0,
    innerPalette: room.doors?.innerPalette ?? 1,
  });
  return { width, height, rgba, tileGrid };
}

/**
 * Render overhead door lintels as a transparent overlay so Link passes under
 * the frame. Side jambs are omitted — they sit in the opening and clipped him.
 * @param {object} room
 * @param {object} opts same palette/CHR opts as renderDungeonRoomRgba
 * @returns {{ width: number, height: number, rgba: Uint8Array, tileGrid: number[][] }}
 */
export function renderDoorFrameOverlayRgba(room, opts = {}) {
  const openSides =
    opts.openSides
    ?? openSidesForRoom(room, opts.doorState ?? null);
  const tileGrid = composeDoorFrameTiles(room, { openSides });
  const width = PLAY_COLS * 8;
  const height = PLAY_ROWS * 8;
  const rgba = new Uint8Array(width * height * 4);
  const outer = room.doors?.outerPalette ?? opts.outerPalette ?? 0;
  const inner = room.doors?.innerPalette ?? opts.innerPalette ?? 1;
  const { paletteSet, patternBins } = opts;
  const tileSources = opts.tileSources ?? UW_TILE_SOURCES;
  if (!paletteSet || !patternBins) {
    return { width, height, rgba, tileGrid };
  }

  for (let tr = 0; tr < PLAY_ROWS; tr += 1) {
    for (let tc = 0; tc < PLAY_COLS; tc += 1) {
      const tile = tileGrid[tr][tc] & 0xff;
      if (DOOR_OVERLAY_CLEAR_TILES.has(tile)) continue;
      const palRow = paletteRowForPlayTile(tr, tc, outer, inner);
      const colors = rgbaFromNesIndices(paletteSet.rows[palRow]);
      const [br, bg, bb] = nesColor(paletteSet.rows[palRow][0]);
      colors[0] = { r: br, g: bg, b: bb, a: 255 };
      const indices = decodeBgTile(tile, tileSources, patternBins);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((tr * 8 + y) * width + (tc * 8 + x)) * 4;
          rgba[px] = c.r;
          rgba[px + 1] = c.g;
          rgba[px + 2] = c.b;
          rgba[px + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba, tileGrid };
}
