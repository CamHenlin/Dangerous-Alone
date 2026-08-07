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
