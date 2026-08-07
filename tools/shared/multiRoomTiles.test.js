import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import { PLAY_W } from './continuousCamera.js';
import {
  getLinkCollidingTileMulti,
  roomGridMapFrom,
  standingTileMulti,
  tileAtWorld,
} from './multiRoomTiles.js';

function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x26));
}

function wallGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x89));
}

test('tileAtWorld samples the correct room', () => {
  const grids = new Map([
    [0x00, openGrid()],
    [0x01, wallGrid()],
  ]);
  assert.equal(tileAtWorld(grids, 8, 8), 0x26);
  assert.equal(tileAtWorld(grids, PLAY_W + 8, 8), 0x89);
});

test('getLinkCollidingTileMulti crosses the seam', () => {
  const left = openGrid();
  const right = wallGrid();
  const grids = roomGridMapFrom([
    { roomId: 0x00, tileGrid: left },
    { roomId: 0x01, tileGrid: right },
  ]);
  // Standing in room $00 near the right edge, facing right into walls.
  const hit = getLinkCollidingTileMulti(grids, 0x00, 0xf0, HUD_HEIGHT + 0x40, DIR.RIGHT);
  assert.equal(hit.walkable, false);
});

test('standingTileMulti', () => {
  const grids = new Map([[0x00, openGrid()]]);
  assert.equal(standingTileMulti(grids, 0x00, 0x80, 0x8d), 0x26);
});
