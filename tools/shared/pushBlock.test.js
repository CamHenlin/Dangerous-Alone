import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  PUSH_HOLD_FRAMES,
  PUSH_STATE,
  createPushBlock,
  findPushBlockTile,
  pushBlockSquareTiles,
  pushOpensShutters,
  pushSpawnsStairs,
  BLOCK_STAIRS_POS,
  stepPushBlock,
} from './pushBlock.js';

test('findPushBlockTile prefers NES play row $A (floor row 6)', () => {
  const grid = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  grid[6][8] = 0xb0;
  grid[10][12] = 0xb0;
  assert.deepEqual(findPushBlockTile(grid), { col: 8, row: 6 });
});

test('pushBlockSquareTiles expands WriteSquareUW 2×2', () => {
  assert.deepEqual(pushBlockSquareTiles(0xb0), [0xb0, 0xb1, 0xb2, 0xb3]);
  assert.deepEqual(pushBlockSquareTiles(0x74), [0x74, 0x75, 0x76, 0x77]);
});

test('push block completes after hold + travel', () => {
  const floor = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  floor[10][12] = 0xb0;
  const block = createPushBlock(
    { pushable: true, specialItem: { effectType: 0 } },
    { x: 32, y: 64 },
    floor,
  );
  assert.ok(block);
  assert.equal(block.homeX, block.x);
  assert.equal(block.homeY, block.y);
  const link = { x: block.x, y: block.y + 8, dir: DIR.UP };
  for (let i = 0; i < PUSH_HOLD_FRAMES; i += 1) {
    stepPushBlock(block, link, DIR.UP, true);
  }
  assert.equal(block.state, PUSH_STATE.MOVING);
  let done = false;
  for (let i = 0; i < 32; i += 1) {
    const r = stepPushBlock(block, link, DIR.UP, true);
    if (r.justCompleted) done = true;
  }
  assert.equal(done, true);
  assert.equal(block.state, PUSH_STATE.DONE);
  assert.equal(block.y, 64 + 10 * 8 - 0x10);
});

test('BLOCK_DOOR secret opens shutters on push', () => {
  assert.equal(pushOpensShutters({ specialItem: { effectType: 4 } }), true);
  assert.equal(pushOpensShutters({ specialItem: { effectType: 0 } }), false);
});

test('BLOCK_STAIRS secret spawns stairs at $D0,$60', () => {
  assert.equal(pushSpawnsStairs({ specialItem: { effectType: 5 } }), true);
  assert.equal(pushSpawnsStairs({ specialItem: { effectType: 4 } }), false);
  assert.deepEqual(BLOCK_STAIRS_POS, { x: 0xd0, y: 0x60 });
});
test('cannot push until room cleared', () => {
  const floor = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  floor[10][4] = 0xb0;
  const block = createPushBlock({ pushable: true }, { x: 0, y: 0 }, floor);
  const link = { x: block.x, y: block.y + 8, dir: DIR.UP };
  for (let i = 0; i < 40; i += 1) stepPushBlock(block, link, DIR.UP, false);
  assert.equal(block.state, PUSH_STATE.IDLE);
});
