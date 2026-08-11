import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  DOOR_FACE_TILES,
  FLOOR_ORIGIN,
  PLAY_COLS,
  PLAY_ROWS,
  UW_FILL_TILE,
  composeDungeonRoomTiles,
  doorFaceIndex,
  doorFacePlayRect,
  fillWalls,
  layoutDoorFace,
} from './dungeonRoomLayout.js';
import { ROOT } from './paths.js';

test('doorFacePlayRect covers both door-face halves', () => {
  assert.deepEqual(doorFacePlayRect('north'), { x: 112, y: 8, w: 32, h: 24 });
  assert.deepEqual(doorFacePlayRect('south'), { x: 112, y: 144, w: 32, h: 24 });
  assert.deepEqual(doorFacePlayRect('west'), { x: 8, y: 72, w: 24, h: 32 });
  assert.deepEqual(doorFacePlayRect('east'), { x: 224, y: 72, w: 24, h: 32 });
});

test('doorFaceIndex: open / key / shutter / bomb', () => {
  assert.equal(doorFaceIndex(0, true), 0); // open face
  assert.equal(doorFaceIndex(1, false), -1); // solid wall
  assert.equal(doorFaceIndex(5, false), 1); // key closed
  assert.equal(doorFaceIndex(5, true), 0); // key open → open face
  assert.equal(doorFaceIndex(7, false), 2); // shutter closed
  assert.equal(doorFaceIndex(4, false), 3); // bomb closed
  assert.equal(doorFaceIndex(4, true), 4); // bomb hole
});

test('fillWalls writes solid bricks not just fill', () => {
  const cm = new Uint8Array(PLAY_ROWS * PLAY_COLS);
  cm.fill(UW_FILL_TILE);
  fillWalls(cm);
  // Top-left wall corner area (col 1, row 1) gets $E0 from WallTileList.
  assert.equal(cm[1 * PLAY_ROWS + 1], 0xe0);
  // Fill tile alone should no longer dominate the left wall column.
  assert.notEqual(cm[1 * PLAY_ROWS + 2], UW_FILL_TILE);
});

test('north open door face plants doorway tiles', () => {
  const cm = new Uint8Array(PLAY_ROWS * PLAY_COLS);
  cm.fill(UW_FILL_TILE);
  layoutDoorFace(cm, 'north', 0);
  // DoorFaceTilesN open starts with $78 at dst $6665 → col 14, row 1.
  assert.equal(cm[14 * PLAY_ROWS + 1], 0x78);
  assert.equal(cm[14 * PLAY_ROWS + 2], 0x79);
  // Passage floor tile $24 appears in the open face.
  assert.ok(DOOR_FACE_TILES.north.slice(0, 12).includes(0x24));
});

test('L1 $73 composes walls + open south + key north', () => {
  const levelPath = path.join(
    ROOT,
    'assets/extracted/dungeons/q1/level_1/level.json',
  );
  if (!fs.existsSync(levelPath)) return;
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x73);
  assert.ok(room, 'room $73');
  assert.equal(room.doors.north.type, 'key');
  assert.equal(room.doors.south.type, 'open');

  const grid = composeDungeonRoomTiles(room, { openSides: ['south', 'east', 'west'] });
  assert.equal(grid.length, PLAY_ROWS);
  assert.equal(grid[0].length, PLAY_COLS);

  // Floor blit lands at NES origin.
  assert.notEqual(grid[FLOOR_ORIGIN.row][FLOOR_ORIGIN.col], UW_FILL_TILE);

  // Closed key face (index 1) plants $98/$99 in the north doorway (col 15).
  assert.equal(grid[1][14], 0x78);
  assert.equal(grid[2][15], 0x98);
  assert.equal(grid[3][15], 0x99);

  // South open face starts with $7E/$7F/$7D; passage $24 is one column over.
  assert.equal(grid[18][14], 0x7e);
  assert.equal(grid[19][14], 0x7f);
  assert.equal(grid[18][15], 0x76);
  assert.equal(grid[19][15], 0x24);
});
