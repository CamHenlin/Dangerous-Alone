import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { composeDoorFrameTiles, doorFaceIndex, doorFacePlayRect } from './dungeonRoomLayout.js';
import {
  DOOR_OVERLAY_CLEAR_TILES,
  renderDoorFaceRgba,
  renderDoorFrameOverlayRgba,
  renderDungeonRoomRgba,
} from './dungeonRoomRender.js';
import { finalizeLevelMeta } from './dungeons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('composeDoorFrameTiles: N lintel + wall above; E/W seam hides; door-face lintel under Link', () => {
  const room = {
    roomId: 0x53,
    doors: {
      north: { type: 'open', code: 0 },
      south: { type: 'open', code: 0 },
      west: { type: 'open', code: 0 },
      east: { type: 'open', code: 0 },
    },
    squares: Array.from({ length: 14 }, () => Array(24).fill(0)),
  };
  const grid = composeDoorFrameTiles(room, {
    openSides: ['north', 'south', 'east', 'west'],
  });
  // North lintel + wall above.
  assert.equal(grid[1][14], 0x78);
  assert.ok(grid[0][15] !== 0, 'wall above north door occludes');
  // West: wall above door face + seam/outer jamb; lintel over cavity stays under Link.
  assert.equal(grid[9][2], 0, 'west door-face lintel stays under Link');
  assert.equal(grid[9][3], 0, 'west door-face lintel (inner) stays under Link');
  assert.ok(grid[9][0] !== 0, 'west seam still occludes at lintel row');
  assert.ok(grid[9][1] !== 0, 'west outer jamb still occludes at lintel row');
  assert.ok(grid[8][2] !== 0, 'wall above west opening');
  assert.ok(grid[10][0] !== 0, 'west seam column hides Link mid-wall');
  assert.ok(grid[10][1] !== 0, 'west outer jamb hides Link mid-wall');
  assert.ok(grid[11][30] !== 0, 'east outer jamb hides Link mid-wall');
  assert.ok(grid[11][31] !== 0, 'east seam column hides Link mid-wall');
  assert.equal(grid[9][28], 0, 'east door-face lintel stays under Link');
  assert.equal(grid[9][29], 0, 'east door-face lintel (cavity col) stays under Link');
  // Cavity and walk-height inner jambs beside it must stay clear.
  assert.equal(grid[10][2], 0, 'west cavity not overlaid');
  assert.equal(grid[10][3], 0, 'west inner jamb not overlaid');
  assert.equal(grid[10][28], 0, 'east inner jamb not overlaid');
  assert.equal(grid[10][29], 0, 'east cavity not overlaid');
  assert.equal(grid[2][15], 0, 'north cavity not overlaid');
});

test('renderDoorFrameOverlayRgba: overhead opaque, opening transparent', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_1/level.json');
  if (!existsSync(path)) return;
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x73);
  assert.ok(room);

  const paletteSet = {
    rows: [
      [0x0f, 0x00, 0x10, 0x30],
      [0x0f, 0x00, 0x10, 0x30],
      [0x0f, 0x00, 0x10, 0x30],
      [0x0f, 0x00, 0x10, 0x30],
    ],
  };
  const patternBins = new Map([
    ['common_background', new Uint8Array(0x400)],
    ['underworld_bg', new Uint8Array(0x800)],
    ['common_misc', new Uint8Array(0x100)],
  ]);

  const { rgba, width, tileGrid } = renderDoorFrameOverlayRgba(room, {
    paletteSet,
    patternBins,
    doorState: null,
    openSides: ['south', 'east', 'west'],
  });

  /** @param {number} row @param {number} col */
  const alphaAtTile = (row, col) => {
    const px = ((row * 8 + 4) * width + (col * 8 + 4)) * 4;
    return rgba[px + 3];
  };

  assert.equal(tileGrid[1][14], 0x78);
  assert.equal(alphaAtTile(1, 14), 255);
  assert.equal(alphaAtTile(10, 0), 255, 'seam wall mid-passage');
  assert.equal(tileGrid[18][15], 0, 'south inner lip stays under Link');
  assert.equal(alphaAtTile(18, 15), 0);
  assert.equal(tileGrid[19][15], 0, 'south cavity row clear');
  assert.ok(tileGrid[20][15] !== 0, 'south outer wall still occludes');
  assert.equal(alphaAtTile(20, 15), 255);
  assert.ok(DOOR_OVERLAY_CLEAR_TILES.has(0x24));
});

function dummyUwPaint() {
  return {
    paletteSet: {
      rows: [
        [0x0f, 0x00, 0x10, 0x30],
        [0x0f, 0x00, 0x10, 0x30],
        [0x0f, 0x00, 0x10, 0x30],
        [0x0f, 0x00, 0x10, 0x30],
      ],
    },
    patternBins: new Map([
      ['common_background', new Uint8Array(0x400)],
      ['underworld_bg', new Uint8Array(0x800)],
      ['common_misc', new Uint8Array(0x100)],
    ]),
  };
}

test('renderDungeonRoomRgba: collision stays shut while the nametable shows the cavity', () => {
  const room = {
    roomId: 0x21,
    doors: {
      north: { type: 'open', code: 0 },
      south: { type: 'shutter', code: 7 },
      west: { type: 'wall', code: 1 },
      east: { type: 'wall', code: 1 },
    },
    squares: Array.from({ length: 14 }, () => Array(24).fill(0)),
  };
  const { tileGrid } = renderDungeonRoomRgba(room, {
    ...dummyUwPaint(),
    openSides: ['north', 'south'],
    collisionOpenSides: ['north'],
  });
  // Closed shutter face plants $A8/$A9; open face has $24 in the cavity.
  assert.equal(tileGrid[19][15], 0xa9, 'walk grid keeps the closed shutter');
});

test('renderDoorFaceRgba crops to the play-area door rect', () => {
  const rect = doorFacePlayRect('south');
  const face = renderDoorFaceRgba('south', doorFaceIndex(7, false), dummyUwPaint());
  assert.equal(face.width, rect.w);
  assert.equal(face.height, rect.h);
  assert.equal(face.rgba.length, rect.w * rect.h * 4);
});
