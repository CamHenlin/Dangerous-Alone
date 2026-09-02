import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  buildDungeonPlayGrid,
  dungeonPlayOrigin,
  dungeonTileOpts,
} from './dungeonPlay.js';
import { stepLadderObject, tryPlaceLadder } from './ladder.js';
import {
  LINK_QSPEED,
  UW_ROOM_BOUNDS,
  createLinkState,
  isLinkSpriteBlocked,
  isLinkStandingSolid,
  stepLink,
} from './linkMotion.js';
import { ROOT } from './paths.js';
import {
  expectedLeftStopX,
  expectedRightStopX,
  findEarlyLeftStopGaps,
  formatCollisionReadout,
  probeUwCollision,
  runHorizontalFaceApproachSuite,
  solidRunsOnRow,
  walkUntilStopped,
  hotspotRow,
} from './uwCollisionHarness.js';

function loadLevel(quest, level) {
  const levelPath = path.join(
    ROOT,
    `assets/extracted/dungeons/q${quest}/level_${level}/level.json`,
  );
  if (!fs.existsSync(levelPath)) {
    assert.fail(`missing extract ${levelPath}`);
  }
  return JSON.parse(fs.readFileSync(levelPath, 'utf8'));
}

function roomGrid(levelData, roomId) {
  const room = levelData.rooms.find((r) => r.roomId === roomId);
  assert.ok(room, `missing room $${roomId.toString(16)}`);
  return {
    room,
    grid: buildDungeonPlayGrid(room, dungeonPlayOrigin()),
    opts: dungeonTileOpts(),
  };
}

test('L4 $71 solid runs match statue columns on hotspot row', () => {
  const level = loadLevel(1, 4);
  const { grid } = roomGrid(level, 0x71);
  const runs = solidRunsOnRow(grid, hotspotRow(0x65)).filter(
    (r) => r.left >= 0x30 && r.right <= 0xd0,
  );
  assert.deepEqual(
    runs.map((r) => [r.left, r.right]),
    [
      [0x30, 0x40],
      [0x60, 0x70],
      [0x90, 0xa0],
      [0xc0, 0xd0],
    ],
  );
  assert.equal(expectedLeftStopX(runs[2]), 0xa0);
  assert.equal(expectedRightStopX(runs[2]), 0x80);
});

test('L4 $71: no early LEFT gaps (blocked cells flush with solid lip)', () => {
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x71);
  const { ok, gaps } = findEarlyLeftStopGaps(grid, { tileOpts: opts });
  assert.equal(
    ok,
    true,
    gaps.map((g) => `$${g.x.toString(16)},$${g.y.toString(16)} gap=${g.gap}`).join('; '),
  );
});

test('L4 $71: horizontal face approaches stop on NES lips', () => {
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x71);
  const result = runHorizontalFaceApproachSuite(grid, { tileOpts: opts });
  assert.ok(result.checks >= 8, `expected many checks, got ${result.checks}`);
  assert.equal(result.ok, true, result.failures.join('\n'));
});

test('L4 $71: walk from $B0 left reaches face lip $A0 (screenshot case)', () => {
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x71);
  const link = walkUntilStopped(grid, 0xb0, 0x65, DIR.LEFT, opts);
  assert.equal(link.x, 0xa0, `stop $${link.x.toString(16)}`);
  assert.equal(link.gridOffset, 0);
  const probe = probeUwCollision(grid, link.x, link.y, opts);
  assert.equal(probe.dirs.left, false);
  assert.equal(probe.standSolid, false);
  assert.match(formatCollisionReadout(probe, link.gridOffset), /lookL=\$b6/);
});

test('all Q1 level-4 rooms: face approaches + no early LEFT gaps', () => {
  const level = loadLevel(1, 4);
  /** @type {string[]} */
  const allFail = [];
  let checks = 0;
  let roomsHit = 0;
  for (const room of level.rooms) {
    // Skip cellars — different layout rules.
    if (room.layoutId === 0x3e || room.layoutId === 0x3f) continue;
    const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
    const opts = dungeonTileOpts();
    const gap = findEarlyLeftStopGaps(grid, { tileOpts: opts });
    if (!gap.ok) {
      allFail.push(
        `$${room.roomId.toString(16)} early LEFT gaps: ${gap.gaps
          .slice(0, 5)
          .map((g) => `$${g.x.toString(16)}/@$${g.y.toString(16)} gap=${g.gap}`)
          .join(', ')}`,
      );
    }
    const suite = runHorizontalFaceApproachSuite(grid, { tileOpts: opts });
    if (suite.checks > 0) roomsHit += 1;
    checks += suite.checks;
    for (const f of suite.failures) {
      allFail.push(`$${room.roomId.toString(16)} ${f}`);
    }
  }
  assert.ok(roomsHit >= 3, `rooms with face checks=${roomsHit}`);
  assert.ok(checks >= 20, `checks=${checks}`);
  assert.equal(allFail.length, 0, allFail.join('\n'));
});

const LAVA_MAZE_MASKS = Object.freeze([
  0,
  DIR.UP,
  DIR.DOWN,
  DIR.LEFT,
  DIR.RIGHT,
  DIR.UP | DIR.LEFT,
  DIR.UP | DIR.RIGHT,
  DIR.DOWN | DIR.LEFT,
  DIR.DOWN | DIR.RIGHT,
]);

/**
 * @param {number} seed
 */
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * True when the left foot is on the path but the right 8px sits in lava.
 * That is the "half off the trail" screenshot on L4 layout 23.
 * @param {number[][]} grid
 * @param {number} x
 * @param {number} y
 * @param {ReturnType<typeof dungeonTileOpts>} opts
 */
function rightFootOnLava(grid, x, y, opts) {
  return (
    !isLinkStandingSolid(grid, x, y, opts)
    && isLinkSpriteBlocked(grid, x, y, opts)
  );
}

test('L4 lava-maze (layout 23): wiggling on the path keeps both feet on tiles', () => {
  // Screenshot: L4 `$2c` / `$31` winding `$F4` path. Walking back and forth
  // with mid-cell reverses used to finish an 8px cell at x=$78, y=$75 — left
  // foot on the trail, right foot in lava.
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x31);
  const rand = mulberry(42);
  const link = createLinkState(0x78, 0x8d, DIR.UP);
  for (let i = 0; i < 4000; i += 1) {
    const mask = LAVA_MAZE_MASKS[(rand() * LAVA_MAZE_MASKS.length) | 0];
    stepLink(link, grid, mask, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    assert.equal(
      rightFootOnLava(grid, link.x, link.y, opts),
      false,
      `right foot in lava at $${link.x.toString(16)},$${link.y.toString(16)} `
        + `go=${link.gridOffset} frame ${i}`,
    );
  }
});

test('L4 $01 water maze: random walks keep the 16px sprite on the path', () => {
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x01);
  const rand = mulberry(7);
  const link = createLinkState(0x78, 0x8d, DIR.DOWN);
  for (let i = 0; i < 4000; i += 1) {
    const mask = LAVA_MAZE_MASKS[(rand() * LAVA_MAZE_MASKS.length) | 0];
    stepLink(link, grid, mask, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    assert.equal(
      rightFootOnLava(grid, link.x, link.y, opts),
      false,
      `L4 $01 right foot in lava at $${link.x.toString(16)},$${link.y.toString(16)} `
        + `go=${link.gridOffset} frame ${i}`,
    );
  }
});

test('L4 $31: mid-cell reverse at the $65→$6D cell does not land on lava', () => {
  // The seed-42 hole: DOWN from y=$65 at x=$78 (wide path), then perpendicular
  // flips remap gridOffset so the cell completes at y=$75 where x+8 is `$F4`.
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x31);
  const link = createLinkState(0x78, 0x65, DIR.DOWN);
  const sequence = [
    DIR.DOWN, DIR.DOWN | DIR.RIGHT, DIR.UP | DIR.LEFT, 0, DIR.DOWN | DIR.LEFT,
    DIR.RIGHT, DIR.UP | DIR.LEFT, DIR.DOWN, 0, DIR.DOWN | DIR.RIGHT,
    DIR.LEFT, DIR.UP | DIR.RIGHT, DIR.DOWN | DIR.LEFT, DIR.UP, DIR.RIGHT,
  ];
  for (let round = 0; round < 40; round += 1) {
    for (const mask of sequence) {
      stepLink(link, grid, mask, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
      assert.equal(
        rightFootOnLava(grid, link.x, link.y, opts),
        false,
        `after mask ${mask} at $${link.x.toString(16)},$${link.y.toString(16)} go=${link.gridOffset}`,
      );
    }
  }
  assert.equal(isLinkSpriteBlocked(grid, 0x78, 0x75, opts), true, 'y=$75 x=$78 is the bad cell');
  assert.equal(isLinkStandingSolid(grid, 0x78, 0x75, opts), false, 'left foot alone looks walkable');
});

test('L4 $31: owning the stepladder does not walk the $78 column into lava', () => {
  // Browser playtests load `?debug=1`, which grants the ladder. Vertical
  // look-ahead at the $85→$7D jog sees `$F4` and CheckLadder places the
  // object; the extra foot used to skip whenever that object existed.
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x31);
  const link = createLinkState(0x78, 0x8d, DIR.UP);
  /** @type {import('./ladder.js').LadderObject | null} */
  let ladder = null;
  for (let i = 0; i < 80; i += 1) {
    const walkOpts = { ...opts, ladder, ladderMode: 'dungeon' };
    if ((link.gridOffset || 0) === 0) {
      ladder = tryPlaceLadder(link, {
        tileGrid: grid,
        inv: { ladder: 1 },
        mode: 'dungeon',
        inputDir: DIR.UP,
        existing: ladder,
        tileOpts: opts,
      });
      walkOpts.ladder = ladder;
    }
    stepLink(link, grid, DIR.UP, LINK_QSPEED, UW_ROOM_BOUNDS, walkOpts);
    if (ladder) ladder = stepLadderObject(ladder, link);
    assert.equal(
      rightFootOnLava(grid, link.x, link.y, opts),
      false,
      `ladder walk at $${link.x.toString(16)},$${link.y.toString(16)} go=${link.gridOffset}`,
    );
  }
  assert.ok(link.y >= 0x85, `must stop at the $70 jog, y=$${link.y.toString(16)}`);
  assert.equal(link.x, 0x78);
});

test('L4 $31: horizontal walks stay on the 16px island, not 8px into lava', () => {
  const level = loadLevel(1, 4);
  const { grid, opts } = roomGrid(level, 0x31);
  const link = createLinkState(0x50, 0x95, DIR.RIGHT);
  for (let i = 0; i < 40; i += 1) {
    stepLink(link, grid, DIR.RIGHT, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    assert.equal(
      rightFootOnLava(grid, link.x, link.y, opts),
      false,
      `right from $50 at $${link.x.toString(16)},$${link.y.toString(16)}`,
    );
  }
  assert.equal(link.x, 0x50, `must not walk to the $58 lip, x=$${link.x.toString(16)}`);
});
