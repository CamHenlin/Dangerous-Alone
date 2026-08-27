import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, getLinkCollidingTile } from './collision.js';
import { dungeonTileOpts } from './dungeonPlay.js';
import {
  LINK_QSPEED,
  UW_ROOM_BOUNDS,
  createLinkState,
  stepLink,
} from './linkMotion.js';
import {
  BLOCK_STAIRS_POS,
  BLOCK_STAIRS_TILE,
  PUSH_HOLD_FRAMES,
  PUSH_STATE,
  pushBlockWalkOpts,
  stepPushBlock,
  writeSquareAtPlayGrid,
} from './pushBlock.js';

const UW = dungeonTileOpts();

function openUwGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x74));
}

function walkUntilStop(link, grid, dir, opts, frames = 80) {
  for (let i = 0; i < frames; i += 1) {
    const x0 = link.x;
    const y0 = link.y;
    stepLink(link, grid, dir, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    if (link.x === x0 && link.y === y0) break;
  }
  return { x: link.x, y: link.y };
}

test('walking into a baked $B0 stops flush, not overlapping the square', () => {
  const grid = openUwGrid();
  writeSquareAtPlayGrid(grid, 0x70, 0x90, 0xb0);
  const fromLeft = walkUntilStop(createLinkState(0x50, 0x8d, DIR.RIGHT), grid, DIR.RIGHT, UW);
  assert.equal(fromLeft.x, 0x60, `left-stop x=$${fromLeft.x.toString(16)}`);
  const fromRight = walkUntilStop(createLinkState(0x90, 0x8d, DIR.LEFT), grid, DIR.LEFT, UW);
  assert.equal(fromRight.x, 0x80, `right-stop x=$${fromRight.x.toString(16)}`);
});

test('a moving push block keeps Link flush with the sprite', () => {
  const grid = openUwGrid();
  writeSquareAtPlayGrid(grid, 0x70, 0x90, 0xb0);
  const block = {
    x: 0x70,
    y: 0x90,
    homeX: 0x70,
    homeY: 0x90,
    dir: DIR.RIGHT,
    state: PUSH_STATE.IDLE,
    pushTimer: 0,
    traveled: 0,
    complete: false,
  };
  const link = createLinkState(0x60, 0x8d, DIR.RIGHT);
  for (let i = 0; i < PUSH_HOLD_FRAMES; i += 1) {
    stepPushBlock(block, link, DIR.RIGHT, true);
  }
  assert.equal(block.state, PUSH_STATE.MOVING);
  writeSquareAtPlayGrid(grid, block.homeX, block.homeY, 0x74);

  while (block.state === PUSH_STATE.MOVING) {
    stepLink(link, grid, DIR.RIGHT, LINK_QSPEED, UW_ROOM_BOUNDS, {
      ...UW,
      ...pushBlockWalkOpts(block),
    });
    stepPushBlock(block, link, DIR.RIGHT, true);
    assert.ok(
      link.x + 16 <= block.x + 1,
      `Link overlapped the sliding block (link x=$${link.x.toString(16)} block x=$${block.x.toString(16)})`,
    );
  }
  writeSquareAtPlayGrid(grid, block.x, block.y, 0xb0);
  assert.equal(block.x, 0x80);
  const after = walkUntilStop(createLinkState(0x60, 0x8d, DIR.RIGHT), grid, DIR.RIGHT, UW);
  assert.equal(after.x, 0x70, `dest left-stop x=$${after.x.toString(16)}`);
});

test('BLOCK_STAIRS next to a wall keep NES max-id, not a vertical warp clip', () => {
  const grid = openUwGrid();
  writeSquareAtPlayGrid(grid, BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
  for (let r = 0; r < 22; r += 1) grid[r][27] = 0xf5;
  const hit = getLinkCollidingTile(grid, 0xd0, 0x6d, DIR.UP, UW);
  assert.equal(hit.walkable, false, 'stairs+$F5 must stay solid (not prefer $70)');

  writeSquareAtPlayGrid(grid, 0xd0, 0x90, 0xb0);
  const stop = walkUntilStop(createLinkState(0xc8, 0xad, DIR.UP), grid, DIR.UP, UW, 160);
  assert.ok(
    stop.y >= 0x90,
    `vertical walk clipped through the dest block to y=$${stop.y.toString(16)}`,
  );
});
