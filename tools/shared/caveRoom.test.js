import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, OW_BOUNDS } from './collision.js';
import { createLinkState, stepLink } from './linkMotion.js';
import {
  CAVE_ENTER_SPAWN,
  CAVE_FIRE_TILE,
  caveDwellerDraw,
  checkCaveExit,
  createCaveTileGrid,
  dwellerKind,
  wareUnderLink,
} from './caveRoom.js';
import { sheetForPpuTile } from './enemyAnim.js';

test('dwellerKind maps ROM bytes', () => {
  assert.equal(dwellerKind(0x58), 'old_man');
  assert.equal(dwellerKind(0x5b), 'moblin');
});

test('caveDwellerDraw matches ObjAnimFrameHeap $58–$5B', () => {
  assert.deepEqual(caveDwellerDraw(0x58), { tile: 0x98, pal: 2, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x59), { tile: 0x9a, pal: 2, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x5a), { tile: 0x9c, pal: 0, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x5b), { tile: 0xf8, pal: 2, mirror: false });
  assert.equal(sheetForPpuTile(0x98, 'overworld').sheet, 'overworld');
  assert.equal(sheetForPpuTile(CAVE_FIRE_TILE, 'overworld').sheet, 'common');
});

test('enter spawn is not an immediate exit', () => {
  assert.equal(
    checkCaveExit({ x: CAVE_ENTER_SPAWN.x, y: CAVE_ENTER_SPAWN.y, dir: DIR.UP }),
    false,
  );
  assert.equal(
    checkCaveExit({ x: 0x78, y: OW_BOUNDS.bottom, dir: DIR.DOWN }),
    true,
  );
  // Mid-cell snap can leave Link one pixel shy of $CD.
  assert.equal(checkCaveExit({ x: 0x78, y: OW_BOUNDS.bottom - 1, dir: DIR.DOWN }), true);
  assert.equal(checkCaveExit({ x: 0x78, y: 0xd2, dir: DIR.DOWN }), true);
});

test('walking south from enter spawn can reach cave exit', () => {
  const grid = createCaveTileGrid();
  const link = createLinkState(CAVE_ENTER_SPAWN.x, CAVE_ENTER_SPAWN.y, DIR.UP);
  let sawExit = false;
  for (let i = 0; i < 120; i += 1) {
    stepLink(link, grid, DIR.DOWN);
    // Bound clamp can rewind off $CD the next frame; exit is sensed on arrival.
    if (checkCaveExit(link)) sawExit = true;
  }
  assert.equal(sawExit, true);
  assert.ok(link.y >= OW_BOUNDS.bottom - 5);
});

test('cave tile grid is walkable', () => {
  const g = createCaveTileGrid();
  assert.equal(g.length, 22);
  assert.equal(g[0].length, 32);
});

test('wareUnderLink detects overlap', () => {
  const slots = [{ x: 0x78, y: 0x98, gone: false, index: 1, item: 1, key: 'a' }];
  assert.ok(wareUnderLink({ x: 0x78, y: 0x98 }, slots));
  assert.ok(wareUnderLink({ x: 0x78, y: 0xa0 }, slots)); // Link a bit below ware
  assert.equal(wareUnderLink({ x: 0x20, y: 0x40 }, slots), null);
});
