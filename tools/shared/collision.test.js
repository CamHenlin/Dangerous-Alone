import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIR,
  UW_BOUNDS,
  getLinkCollidingTile,
  getMonsterCollidingTile,
  hitsUwBound,
  isOwTileWalkable,
  normalizeOwTile,
  objectHotspotOffset,
  tileAtPlayPixel,
} from './collision.js';

test('OW ground $26 is walkable; rock $D8 is not', () => {
  assert.equal(isOwTileWalkable(0x26), true);
  assert.equal(isOwTileWalkable(0xd8), false);
  assert.equal(isOwTileWalkable(0x88), true);
  assert.equal(isOwTileWalkable(0x89), false);
});

test('WalkableTiles remap to $26', () => {
  assert.deepEqual(normalizeOwTile(0xd2), { tile: 0x26, walkable: true });
  assert.deepEqual(normalizeOwTile(0xdf), { tile: 0x26, walkable: true });
  assert.deepEqual(normalizeOwTile(0xf3), { tile: 0xf3, walkable: false });
});

test('tileAtPlayPixel indexes 8×8 cells', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  grid[5][10] = 0xd8;
  assert.equal(tileAtPlayPixel(grid, 80, 40), 0xd8);
  assert.equal(tileAtPlayPixel(grid, 0, 0), 0x26);
});

test('Link hotspot up samples tile above feet', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Block the column above spawn-ish feet.
  // objY=$8D, hotspot base Y=$98, up offset → $90 → play Y=$50 → row 10
  for (let c = 0; c < 32; c += 1) {
    grid[10][c] = 0xd8;
  }
  const hit = getLinkCollidingTile(grid, 0x78, 0x8d, DIR.UP);
  assert.equal(hit.walkable, false);
  const open = getLinkCollidingTile(grid, 0x78, 0x8d, DIR.DOWN);
  assert.equal(open.walkable, true);
});

test('monster up/left hotspot is −$10 vs Link −8', () => {
  assert.equal(objectHotspotOffset(DIR.UP, true), -8);
  assert.equal(objectHotspotOffset(DIR.UP, false), -16);
  assert.equal(objectHotspotOffset(DIR.LEFT, false), -16);
  assert.equal(objectHotspotOffset(DIR.RIGHT, false), 16);
});

test('monster probe sees solid sooner when moving up', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Row that monster −$10 hits but Link −8 does not from the same Y.
  // objY=$8D → base $98; Link up → $90 (play $50 = row 10); monster → $88 (play $48 = row 9)
  for (let c = 0; c < 32; c += 1) grid[9][c] = 0xd8;
  assert.equal(getMonsterCollidingTile(grid, 0x78, 0x8d, DIR.UP).walkable, false);
  assert.equal(getLinkCollidingTile(grid, 0x78, 0x8d, DIR.UP).walkable, true);
});

test('UW BoundByRoom edges match ObjectRoomBoundsUW compare sense', () => {
  assert.equal(UW_BOUNDS.left, 0x21);
  assert.equal(hitsUwBound(0x21, 0x8d, DIR.LEFT), false);
  assert.equal(hitsUwBound(0x20, 0x8d, DIR.LEFT), true);
  assert.equal(hitsUwBound(0xd0, 0x8d, DIR.RIGHT), true);
  assert.equal(hitsUwBound(0xcf, 0x8d, DIR.RIGHT), false);
  assert.equal(hitsUwBound(0x78, 0x5e, DIR.UP), false);
  assert.equal(hitsUwBound(0x78, 0x5d, DIR.UP), true);
  assert.equal(hitsUwBound(0x78, 0xbd, DIR.DOWN), true);
});

test('UW left look-ahead samples ObjX−8 (not an extra tile early)', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  // Face column at X=$30–$37 (col 6). Link at $40 should see it when moving left.
  for (let r = 0; r < 22; r += 1) {
    grid[r][6] = 0x94;
    grid[r][7] = 0x96;
  }
  const atFace = getLinkCollidingTile(grid, 0x40, 0x65, DIR.LEFT, {
    firstUnwalkable: 0x78,
    walkableRemap: [],
  });
  assert.equal(atFace.walkable, false);
  assert.equal(atFace.tile, 0x96);
  // One tile further right: left sample is floor beside the face.
  const clear = getLinkCollidingTile(grid, 0x48, 0x65, DIR.LEFT, {
    firstUnwalkable: 0x78,
    walkableRemap: [],
  });
  assert.equal(clear.walkable, true);
});
