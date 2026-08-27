import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIR,
  UW_BOUNDS,
  combineVerticalCollidingTiles,
  getLinkCollidingTile,
  getMonsterCollidingTile,
  hitsUwBound,
  boundBlocksDir,
  isOwTileWalkable,
  isOwWarpTile,
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

test('vertical look-ahead prefers a cave mouth beside ornament solids', () => {
  assert.equal(isOwWarpTile(0x24), true);
  assert.equal(combineVerticalCollidingTiles(0xa5, 0x24), 0x24);
  assert.equal(combineVerticalCollidingTiles(0x24, 0xa1), 0x24);
  // No cave mouth: still NES max-id.
  assert.equal(combineVerticalCollidingTiles(0x26, 0xa5), 0xa5);
  assert.equal(combineVerticalCollidingTiles(0xa5, 0x26), 0xa5);
});

test('stairs next to a rock or block keep NES max-id', () => {
  // Preferring $70 as a warp used to let vertical walks clip through the
  // neighboring solid — the "funny" collision around a pushed grave / $B0.
  assert.equal(combineVerticalCollidingTiles(0xd8, 0x70), 0xd8);
  assert.equal(combineVerticalCollidingTiles(0x70, 0xd8), 0xd8);
  assert.equal(combineVerticalCollidingTiles(0xb0, 0x70), 0xb0);
  assert.equal(combineVerticalCollidingTiles(0x70, 0xb0), 0xb0);
});

test('cave-mouth columns stay walkable from either side of the mouth', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Row 9: ornament | mouth | mouth | ornament  (cols 15–18), like OW $0F.
  grid[9][15] = 0xa5;
  grid[9][16] = 0x24;
  grid[9][17] = 0x24;
  grid[9][18] = 0xa1;
  // ObjY=$85 → up look-ahead play Y hits row 9.
  assert.equal(getLinkCollidingTile(grid, 0x78, 0x85, DIR.UP).walkable, true);
  assert.equal(getLinkCollidingTile(grid, 0x80, 0x85, DIR.UP).walkable, true);
  assert.equal(getLinkCollidingTile(grid, 0x88, 0x85, DIR.UP).walkable, true);
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

test('boundBlocksDir matches BoundDirection* compare sense', () => {
  const box = { minX: 0x21, maxX: 0xd0, minY: 0x5e, maxY: 0xbd };
  assert.equal(boundBlocksDir(0x20, 0x5d, DIR.LEFT, box), true);
  assert.equal(boundBlocksDir(0x20, 0x5d, DIR.UP, box), true);
  assert.equal(boundBlocksDir(0x20, 0x5d, DIR.RIGHT, box), false);
  assert.equal(boundBlocksDir(0x20, 0x5d, DIR.DOWN, box), false);
  assert.equal(boundBlocksDir(0x21, 0x5e, DIR.LEFT, box), false);
  assert.equal(boundBlocksDir(0xd0, 0x8d, DIR.RIGHT, box), true);
  assert.equal(boundBlocksDir(0xcf, 0x8d, DIR.RIGHT, box), false);
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
