import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT, OW_FIRST_UNWALKABLE } from './collision.js';
import { PLAY_H, PLAY_W } from './continuousCamera.js';
import {
  canEnemyMove,
  createEnemy,
  ejectEnemyFromSolid,
  isEnemyStandingSolid,
  stepEnemy,
  OBJ,
} from './enemies.js';
import {
  getMonsterCollidingTileMulti,
  standingTileMulti,
} from './multiRoomTiles.js';

function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x26));
}

function forestFloorGrid() {
  // Bottom 6 tile rows solid (trees), rest open — matches many OW south edges.
  return Array.from({ length: 22 }, (_, r) =>
    Array(32).fill(r >= 16 ? OW_FIRST_UNWALKABLE : 0x26),
  );
}

test('stepEnemy forwards collidingTile so offset foes do not use clamped grid', () => {
  const grids = new Map([
    [0x00, openGrid()],
    [0x10, openGrid()],
  ]);
  // Enemy standing in the southern neighbor (anchor-relative).
  const e = createEnemy({
    objType: OBJ.RED_OCTOROK_SLOW,
    x: 0x80,
    y: HUD_HEIGHT + PLAY_H + 0x40,
    dir: DIR.DOWN,
  });
  assert.ok(e);
  e.homeRoomId = 0x10;
  e.alive = true;
  e.edgePending = false;

  let probed = false;
  const tileOpts = {
    collidingTile: (x, y, dir) => {
      probed = true;
      return getMonsterCollidingTileMulti(grids, 0x00, x, y, dir);
    },
    standingTile: (x, y) => standingTileMulti(grids, 0x00, x, y),
  };

  // Single-screen grid would clamp this Y into the bottom row; multi must win.
  const single = forestFloorGrid();
  stepEnemy(
    e,
    { minX: -32, maxX: 512, minY: 0, maxY: 512 },
    single,
    { chase: { x: e.x, y: e.y + 40 }, ...tileOpts },
  );
  assert.equal(probed, true);
});

test('offset southern foe is not standing-solid on the anchor room forest row', () => {
  const grids = new Map([
    [0x00, forestFloorGrid()],
    [0x10, openGrid()],
  ]);
  const y = HUD_HEIGHT + PLAY_H + 0x40; // mid open sand of room $10
  const standing = standingTileMulti(grids, 0x00, 0x80, y);
  assert.equal(standing, 0x26);
  assert.equal(
    isEnemyStandingSolid(null, 0x80, y, {
      standingTile: (x, yy) => standingTileMulti(grids, 0x00, x, yy),
    }),
    false,
  );
});

test('without multi probe, offset Y clamps into forest (the bug)', () => {
  const single = forestFloorGrid();
  const y = HUD_HEIGHT + PLAY_H + 0x40;
  // Classic standingTile clamps row → bottom forest.
  assert.equal(
    isEnemyStandingSolid(single, 0x80, y),
    true,
  );
});

test('continuous DOWN look-ahead still samples southern neighbor solids', () => {
  const south = openGrid();
  // Solid strip at the top of the southern room.
  for (let c = 0; c < 32; c += 1) {
    south[0][c] = OW_FIRST_UNWALKABLE;
    south[1][c] = OW_FIRST_UNWALKABLE;
  }
  const grids = new Map([
    [0x00, openGrid()],
    [0x10, south],
  ]);
  // Just above the south room's top solid row, facing down.
  const y = HUD_HEIGHT + PLAY_H - 8;
  const hit = getMonsterCollidingTileMulti(grids, 0x00, 0x80, y, DIR.DOWN);
  assert.equal(hit.walkable, false);
  assert.equal(
    canEnemyMove(null, 0x80, y, DIR.DOWN, {
      collidingTile: (x, yy, dir) => getMonsterCollidingTileMulti(grids, 0x00, x, yy, dir),
    }),
    false,
  );
});

test('ejectEnemyFromSolid works with standingTile across room offsets', () => {
  const grids = new Map([
    [0x00, forestFloorGrid()],
    [0x10, openGrid()],
  ]);
  // Mistakenly planted on the anchor forest — eject onto open sand above.
  const e = createEnemy({
    objType: OBJ.RED_OCTOROK_SLOW,
    x: 0x80,
    y: 0xc5,
    dir: DIR.UP,
  });
  assert.ok(e);
  const tileOpts = {
    standingTile: (x, y) => standingTileMulti(grids, 0x00, x, y),
  };
  const result = ejectEnemyFromSolid(e, null, { tileOpts, maxRadius: 10 });
  assert.equal(result.ejected, true);
  assert.equal(
    isEnemyStandingSolid(null, e.x, e.y, tileOpts),
    false,
  );
});

test('ejectEnemyFromSolid keeps eastern-neighbor foes in their own room', () => {
  const west = openGrid();
  const east = openGrid();
  // Solid bush column on the east room's left side.
  for (let r = 0; r < 22; r += 1) {
    east[r][2] = OW_FIRST_UNWALKABLE;
    east[r][3] = OW_FIRST_UNWALKABLE;
  }
  const grids = new Map([
    [0x00, west],
    [0x01, east],
  ]);
  const tileOpts = {
    standingTile: (x, y) => standingTileMulti(grids, 0x00, x, y),
    collidingTile: (x, y, dir) => getMonsterCollidingTileMulti(grids, 0x00, x, y, dir),
  };
  // Standing on the bush at local (0x10, 0x8D) of room $01 → world X = PLAY_W+0x10.
  const e = createEnemy({
    objType: OBJ.RED_OCTOROK_SLOW,
    x: PLAY_W + 0x10,
    y: 0x8d,
    dir: DIR.RIGHT,
  });
  assert.ok(e);
  assert.equal(isEnemyStandingSolid(null, e.x, e.y, tileOpts), true);
  const result = ejectEnemyFromSolid(e, null, { tileOpts, maxRadius: 6 });
  assert.equal(result.ejected, true);
  assert.equal(isEnemyStandingSolid(null, e.x, e.y, tileOpts), false);
  // Must not fold with `x & $F0` and teleport into room $00.
  assert.ok(e.x >= PLAY_W, `expected to stay in east room, x=${e.x}`);
  assert.ok(Math.abs(result.dx) < PLAY_W / 2, `jump too far dx=${result.dx}`);
});

test('ejectEnemyFromSolid keeps southern-neighbor foes in their own room', () => {
  const north = openGrid();
  const south = openGrid();
  // Standing at local Y=$8D samples play row 11 — plant a bush strip there.
  for (let c = 0; c < 32; c += 1) {
    south[11][c] = OW_FIRST_UNWALKABLE;
    south[12][c] = OW_FIRST_UNWALKABLE;
  }
  const grids = new Map([
    [0x00, north],
    [0x10, south],
  ]);
  const tileOpts = {
    standingTile: (x, y) => standingTileMulti(grids, 0x00, x, y),
    collidingTile: (x, y, dir) => getMonsterCollidingTileMulti(grids, 0x00, x, y, dir),
  };
  // Local (0x80, $8D) of room $10 → anchor-relative Y = $8D + PLAY_H.
  const e = createEnemy({
    objType: OBJ.RED_OCTOROK_SLOW,
    x: 0x80,
    y: 0x8d + PLAY_H,
    dir: DIR.DOWN,
  });
  assert.ok(e);
  assert.equal(isEnemyStandingSolid(null, e.x, e.y, tileOpts), true);
  const result = ejectEnemyFromSolid(e, null, { tileOpts, maxRadius: 6 });
  assert.equal(result.ejected, true);
  assert.equal(isEnemyStandingSolid(null, e.x, e.y, tileOpts), false);
  assert.ok(e.y >= PLAY_H, `expected to stay in south room, y=${e.y}`);
  assert.ok(Math.abs(result.dy) < PLAY_H / 2, `jump too far dy=${result.dy}`);
});

test('standingTileMulti does not fold X≥256 back into the anchor room', () => {
  const grids = new Map([[0x00, openGrid()]]);
  // Sample into an unloaded neighbor column — must be solid, not open $26.
  const tile = standingTileMulti(grids, 0x00, PLAY_W + 16, 0x8d);
  assert.ok(tile >= OW_FIRST_UNWALKABLE);
});
