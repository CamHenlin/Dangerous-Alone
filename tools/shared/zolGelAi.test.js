import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, UW_FIRST_UNWALKABLE } from './collision.js';
import {
  OBJ,
  createEnemy,
  spawnDeathSplits,
  stepEnemy,
} from './enemies.js';
import { QSPEED } from './objQSpeed.js';
import { isWandererType, turnRateForType } from './wandererAi.js';
import {
  GEL_SPLIT_START_TIMER,
  GEL_STATE,
  ZOL_GEL_DELAYS,
  ZOL_GEL_TURN_RATE,
  gelSplitChildDirs,
  pickZolGelEdgeDelay,
  snapGelAfterShove,
  zolGelPaused,
} from './zolGelAi.js';

const BOUNDS = Object.freeze({
  minX: 0x20,
  maxX: 0xd8,
  minY: 0x4d,
  maxY: 0xd0,
});

/** Full play grid (22×32) — all walkable under UW $78. */
function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x24));
}

test('ZolGelDelays ROM table', () => {
  assert.deepEqual([...ZOL_GEL_DELAYS], [0x18, 0x28, 0x38, 0x48, 0x08, 0x18, 0x28, 0x38]);
  assert.equal(pickZolGelEdgeDelay(OBJ.ZOL, 0), 0x18);
  assert.equal(pickZolGelEdgeDelay(OBJ.GEL, 0), 0x08);
  assert.equal(pickZolGelEdgeDelay(OBJ.GEL2, 3), 0x38);
});

test('Zol/Gel use turn rate $20 and are not common wanderers', () => {
  assert.equal(turnRateForType(OBJ.ZOL), ZOL_GEL_TURN_RATE);
  assert.equal(turnRateForType(OBJ.GEL), ZOL_GEL_TURN_RATE);
  assert.equal(isWandererType(OBJ.ZOL), false);
  assert.equal(isWandererType(OBJ.GEL), false);
});

test('InitGel: room gels start in state 2 with edge-delay timer', () => {
  const g = createEnemy({ objType: OBJ.GEL2, x: 0x80, y: 0x8d });
  assert.equal(g.gelState, GEL_STATE.NORMAL);
  assert.ok(ZOL_GEL_DELAYS.slice(4).includes(g.timer));
  assert.equal(g.qSpeedFrac, QSPEED.GEL_ACTIVE);
});

test('zolGelPaused matches ObjTimer >= 5', () => {
  assert.equal(zolGelPaused(5), true);
  assert.equal(zolGelPaused(4), false);
  assert.equal(zolGelPaused(0), false);
});

test('Gel pauses at tile edges then walks with QSpeed $40', () => {
  const grid = openGrid();
  const e = createEnemy({ objType: OBJ.GEL, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.gridOffset = 0;
  e.timer = 8;
  e.turnTimer = 0xff;
  const x0 = e.x;

  // stepEnemy decrements first: frames with timer 7,6,5 stay paused (>=5).
  for (let i = 0; i < 3; i += 1) {
    stepEnemy(e, BOUNDS, grid, { firstUnwalkable: UW_FIRST_UNWALKABLE });
  }
  assert.equal(e.x, x0, 'should still be paused');

  // timer→4: movement begins at 1 px/f (QSpeed $40).
  for (let i = 0; i < 8; i += 1) {
    stepEnemy(e, BOUNDS, grid, {
      firstUnwalkable: UW_FIRST_UNWALKABLE,
      chase: null,
      rngByte: () => 0,
    });
  }
  assert.ok(e.x > x0, `expected gel to advance, x=${e.x}`);
  assert.equal(e.qSpeedFrac, QSPEED.GEL_ACTIVE);
});

test('Gel does not wedge forever against a lava wall', () => {
  // 22×32 play grid: open corridor on the left, lava wall to the right.
  const grid = openGrid();
  for (let r = 0; r < 22; r += 1) {
    for (let c = 10; c < 32; c += 1) grid[r][c] = 0xf4;
  }
  // Standing left of the lava face, aimed into it.
  const e = createEnemy({ objType: OBJ.GEL2, x: 0x40, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.gridOffset = 0;
  e.timer = 0;
  e.turnTimer = 0xff;

  let traveled = 0;
  let prevX = e.x;
  let prevY = e.y;
  for (let i = 0; i < 120; i += 1) {
    stepEnemy(e, BOUNDS, grid, {
      firstUnwalkable: UW_FIRST_UNWALKABLE,
      rngByte: () => 0x55,
    });
    traveled += Math.abs(e.x - prevX) + Math.abs(e.y - prevY);
    prevX = e.x;
    prevY = e.y;
  }
  // Must keep walking (may ping-pong room lip ↔ lava) — not freeze on the wall.
  assert.ok(traveled >= 32, `gel stuck (traveled ${traveled}, dir=${e.dir})`);
});

test('snapGelAfterShove aligns to NES tile grid', () => {
  const e = { x: 0x87, y: 0x90, gridOffset: 0x0c };
  snapGelAfterShove(e);
  assert.equal(e.x, 0x80);
  assert.equal(e.y, 0x9d);
  assert.equal(e.gridOffset, 0);
});

test('Zol death spawns state-0 gels with opposite facings', () => {
  const zol = createEnemy({ objType: OBJ.ZOL, x: 0x80, y: 0x8d });
  zol.dir = DIR.LEFT;
  zol.gridOffset = 0x04;
  const kids = spawnDeathSplits(zol, []);
  assert.equal(kids.length, 2);
  assert.equal(kids[0].gelState, GEL_STATE.SPLIT_START);
  assert.equal(kids[1].gelState, GEL_STATE.SPLIT_START);
  assert.deepEqual(
    gelSplitChildDirs(DIR.LEFT),
    [DIR.UP, DIR.DOWN],
  );
  assert.equal(kids[0].dir, DIR.UP);
  assert.equal(kids[1].dir, DIR.DOWN);
  assert.equal(kids[0].gridOffset, 0x04);
});

test('split gel shoves then enters normal state', () => {
  const grid = openGrid();
  const e = createEnemy({ objType: OBJ.GEL, x: 0x80, y: 0x8d, dir: DIR.RIGHT });
  e.gelState = GEL_STATE.SPLIT_START;
  e.timer = 0;
  e.gridOffset = 0;

  stepEnemy(e, BOUNDS, grid, { firstUnwalkable: UW_FIRST_UNWALKABLE });
  assert.equal(e.gelState, GEL_STATE.SPLIT_SHOVE);
  assert.equal(e.timer, GEL_SPLIT_START_TIMER);

  // Drain shove timer / hit a block; should land in NORMAL on the grid.
  for (let i = 0; i < 20; i += 1) {
    stepEnemy(e, BOUNDS, grid, { firstUnwalkable: UW_FIRST_UNWALKABLE });
    if (e.gelState === GEL_STATE.NORMAL) break;
  }
  assert.equal(e.gelState, GEL_STATE.NORMAL);
  assert.equal(e.y & 0x0f, 0x0d);
  assert.equal(e.x & 0x0f, 0);
});
