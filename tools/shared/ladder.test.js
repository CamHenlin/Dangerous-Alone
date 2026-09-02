import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, OW_WALKABLE_REMAP, UW_FIRST_UNWALKABLE } from './collision.js';
import {
  LADDER_TILE,
  alignLadderToLink,
  dungeonTileOptsWithLadder,
  hydrateLadder,
  isLadderWaterTile,
  ladderAllowsMove,
  ladderAllowsStanding,
  ladderOffsetForDir,
  snapshotLadder,
  stepLadderObject,
  tryPlaceLadder,
} from './ladder.js';
import { normalizeOwTile } from './collision.js';
import {
  LINK_QSPEED,
  UW_ROOM_BOUNDS,
  createLinkState,
  isLinkStandingSolid,
  onWalkGrid,
  snapLinkToWalkGrid,
  stepLink,
} from './linkMotion.js';
import { buildDungeonPlayGrid, dungeonPlayOrigin } from './dungeonPlay.js';
import { decodeScreen, loadOverworldTables, screenToTileGrid } from './overworld.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

const UW_TILE = Object.freeze({
  firstUnwalkable: UW_FIRST_UNWALKABLE,
  walkableRemap: /** @type {number[]} */ ([]),
});

/**
 * @param {number[][]} grid
 * @param {ReturnType<typeof createLinkState>} link
 * @param {number} dir
 * @param {number} frames
 * @param {(link: ReturnType<typeof createLinkState>) => boolean} [done]
 */
function walkWithLadder(grid, link, dir, frames, done) {
  /** @type {import('./ladder.js').LadderObject | null} */
  let ladder = null;
  for (let i = 0; i < frames; i += 1) {
    const opts = { ...UW_TILE, ladder, ladderMode: 'dungeon' };
    if ((link.gridOffset || 0) === 0) {
      ladder = tryPlaceLadder(link, {
        tileGrid: grid,
        inv: { ladder: 1 },
        mode: 'dungeon',
        inputDir: dir,
        existing: ladder,
        tileOpts: UW_TILE,
      });
      opts.ladder = ladder;
    }
    stepLink(link, grid, dir, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
    if (ladder) ladder = stepLadderObject(ladder, link);
    if (done?.(link)) return { ladder, frames: i + 1 };
  }
  return { ladder, frames };
}

function loadDungeonRoom(questLevel, roomId) {
  const path = join(ROOT, `assets/extracted/dungeons/q1/level_${questLevel}/level.json`);
  if (!existsSync(path)) return null;
  const level = JSON.parse(readFileSync(path, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === roomId);
  if (!room) return null;
  return {
    room,
    grid: buildDungeonPlayGrid(room, dungeonPlayOrigin()),
  };
}

test('owning ladder does not remap all UW water', () => {
  const opts = dungeonTileOptsWithLadder({ ladder: 1 });
  const n = normalizeOwTile(LADDER_TILE, opts.firstUnwalkable, opts.walkableRemap);
  assert.equal(n.walkable, false);
  assert.equal(opts.firstUnwalkable, UW_FIRST_UNWALKABLE);
});

test('ladder places one tile ahead when facing UW water', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  // Water column to the right of Link at ($80,$90).
  for (let r = 0; r < 22; r += 1) {
    for (let c = 18; c < 24; c += 1) grid[r][c] = LADDER_TILE;
  }
  const link = { x: 0x80, y: 0x90, dir: DIR.RIGHT, gridOffset: 0 };
  const ladder = tryPlaceLadder(link, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.RIGHT,
    tileOpts: { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] },
  });
  assert.ok(ladder);
  assert.equal(ladder.x, 0x90);
  assert.equal(ladder.y, 0x93);
  assert.equal(ladder.dir, DIR.RIGHT);
  assert.equal(ladder.state, 1);
});

test('held direction places the ladder before facing catches up', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  for (let r = 0; r < 22; r += 1) {
    for (let c = 18; c < 24; c += 1) grid[r][c] = LADDER_TILE;
  }
  const link = { x: 0x80, y: 0x90, dir: DIR.UP, gridOffset: 0 };
  const ladder = tryPlaceLadder(link, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.RIGHT,
    tileOpts: UW_TILE,
  });
  assert.ok(ladder);
  assert.equal(ladder.dir, DIR.RIGHT);
  assert.equal(ladder.x, 0x90);
});

test('ladder only allows one tile of water; further water is blocked', () => {
  const ladder = { x: 0x90, y: 0x93, dir: DIR.RIGHT, state: 1 };
  // Approaching from land (dist $10): may step on.
  assert.equal(
    ladderAllowsMove(ladder, { x: 0x80, y: 0x90, dir: DIR.RIGHT }, DIR.RIGHT),
    true,
  );
  // On ladder (dist 0): along-axis ok.
  const on = { ...ladder, state: 2 };
  assert.equal(
    ladderAllowsMove(on, { x: 0x90, y: 0x90, dir: DIR.RIGHT }, DIR.RIGHT),
    true,
  );
  // Fully stepped off (dist $10, state 2): stash — no further forward.
  assert.equal(
    ladderAllowsMove(on, { x: 0xa0, y: 0x90, dir: DIR.RIGHT }, DIR.RIGHT),
    false,
  );
  assert.equal(stepLadderObject(on, { x: 0xa0, y: 0x90, dir: DIR.RIGHT }), null);
});

test('perpendicular move on ladder is blocked', () => {
  const ladder = { x: 0x90, y: 0x93, dir: DIR.RIGHT, state: 2 };
  assert.equal(
    ladderAllowsMove(ladder, { x: 0x90, y: 0x90, dir: DIR.UP }, DIR.UP),
    false,
  );
});

test('offsets match NES LinkToLadderOffsets', () => {
  assert.deepEqual(ladderOffsetForDir(DIR.RIGHT), { x: 0x10, y: 0x03 });
  assert.deepEqual(ladderOffsetForDir(DIR.LEFT), { x: -0x10, y: 0x03 });
  assert.deepEqual(ladderOffsetForDir(DIR.UP), { x: 0, y: -5 });
  assert.deepEqual(ladderOffsetForDir(DIR.DOWN), { x: 0, y: 0x13 });
});

test('UW water tile id is $F4 only', () => {
  assert.equal(isLadderWaterTile(0xf4, 'dungeon'), true);
  assert.equal(isLadderWaterTile(0xf5, 'dungeon'), false);
  assert.equal(isLadderWaterTile(0x8d, 'overworld'), true);
});

test('ladderAllowsStanding covers the $10 span', () => {
  const ladder = { x: 0x80, y: 0x90, dir: DIR.UP, state: 2 };
  assert.equal(ladderAllowsStanding(ladder, { x: 0x80, y: 0x8d }), true);
  assert.equal(ladderAllowsStanding(ladder, { x: 0x80, y: 0x95 }), true);
  assert.equal(ladderAllowsStanding(ladder, { x: 0x80, y: 0x7d }), true);
  assert.equal(ladderAllowsStanding(ladder, { x: 0x88, y: 0x8d }), false);
  assert.equal(ladderAllowsStanding(ladder, { x: 0x80, y: 0x6d }), false);
});

test('standing on ladder water is not solid (no push-back)', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  for (let c = 0; c < 32; c += 1) {
    grid[10][c] = LADDER_TILE;
    grid[11][c] = LADDER_TILE;
  }
  const ladder = { x: 0x80, y: 0x90, dir: DIR.UP, state: 2 };
  const opts = {
    firstUnwalkable: UW_FIRST_UNWALKABLE,
    walkableRemap: [],
    ladder,
    ladderMode: 'dungeon',
  };
  // $8D sits on water row 11; without the ladder override this is solid.
  assert.equal(isLinkStandingSolid(grid, 0x80, 0x8d, { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] }), true);
  assert.equal(isLinkStandingSolid(grid, 0x80, 0x8d, opts), false);
});

test('L1 $23: vertical stepladder crosses the water channel', () => {
  const packed = loadDungeonRoom(1, 0x23);
  if (!packed) return;
  const link = createLinkState(0x80, 0x9d, DIR.UP);
  walkWithLadder(packed.grid, link, DIR.UP, 160, (l) => l.y <= 0x7d && l.gridOffset === 0);
  assert.ok(
    link.y <= 0x7d,
    `expected north bank, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`,
  );
});

test('L5 $26: stepladder crosses the one-square moat on every side', () => {
  const packed = loadDungeonRoom(5, 0x26);
  if (!packed) return;
  const { grid } = packed;

  const crossings = [
    { name: 'west outer → island', x: 0x21, y: 0x8d, dir: DIR.RIGHT, done: (l) => l.x >= 0x40 },
    { name: 'island → west outer', x: 0x40, y: 0x8d, dir: DIR.LEFT, done: (l) => l.x <= 0x21 },
    { name: 'island → east outer', x: 0xb0, y: 0x8d, dir: DIR.RIGHT, done: (l) => l.x >= 0xd0 },
    { name: 'east outer → island', x: 0xd0, y: 0x8d, dir: DIR.LEFT, done: (l) => l.x <= 0xb0 },
    { name: 'north outer → island', x: 0x80, y: 0x6d, dir: DIR.DOWN, done: (l) => l.y >= 0x8d },
    { name: 'island → north outer', x: 0x80, y: 0x8d, dir: DIR.UP, done: (l) => l.y <= 0x6d },
  ];

  for (const c of crossings) {
    const link = createLinkState(c.x, c.y, c.dir);
    walkWithLadder(grid, link, c.dir, 160, (l) => c.done(l) && l.gridOffset === 0);
    assert.ok(
      c.done(link),
      `${c.name}: expected far bank, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`,
    );
  }
});

test('snapshotLadder / hydrateLadder round-trip', () => {
  assert.equal(hydrateLadder(null), null);
  assert.equal(hydrateLadder({ x: 0x90, y: 0x93 }), null);
  const snap = snapshotLadder({ x: 0xb0, y: 0x90, dir: DIR.LEFT, state: 2 });
  assert.deepEqual(hydrateLadder(snap), { x: 0xb0, y: 0x90, dir: DIR.LEFT, state: 2 });
});

test('dry land can re-face an existing ladder', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  for (let r = 0; r < 22; r += 1) {
    for (let c = 10; c < 14; c += 1) grid[r][c] = LADDER_TILE;
    for (let c = 18; c < 24; c += 1) grid[r][c] = LADDER_TILE;
  }
  // Island at cols 14–17 ($70–$8F). Existing ladder faces far east water,
  // too far to step on — holding left must plant a new one on the west gap.
  const link = { x: 0x70, y: 0x90, dir: DIR.LEFT, gridOffset: 0 };
  const existing = { x: 0xa0, y: 0x93, dir: DIR.RIGHT, state: 2 };
  const placed = tryPlaceLadder(link, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.LEFT,
    existing,
    tileOpts: UW_TILE,
  });
  assert.ok(placed);
  assert.equal(placed.dir, DIR.LEFT);
});

test('feet on water keep the existing ladder', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  for (let r = 10; r < 14; r += 1) {
    for (let c = 0; c < 32; c += 1) grid[r][c] = LADDER_TILE;
  }
  const link = { x: 0x90, y: 0x8d, dir: DIR.LEFT, gridOffset: 0 };
  const existing = { x: 0x90, y: 0x90, dir: DIR.RIGHT, state: 2 };
  const kept = tryPlaceLadder(link, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.LEFT,
    existing,
    tileOpts: UW_TILE,
  });
  assert.equal(kept, existing);
});

function loadOwScreen(mapIndex) {
  const romPath = join(ROOT, 'zelda.nes');
  const schemaPath = join(ROOT, 'assets', 'schema', 'overworld.json');
  if (!existsSync(romPath)) return null;
  const prg = readFileSync(romPath).subarray(16);
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const tables = loadOverworldTables(prg, schema);
  const screen = decodeScreen(tables, mapIndex);
  return screenToTileGrid(screen, tables);
}

test('$5F dock: a leftover ocean-side ladder still returns to the beach', () => {
  const grid = loadOwScreen(0x5f);
  if (!grid) return;
  // Debug-kit / save restore can leave the ladder one tile into the ocean
  // (state 2, dist < $10) while Link is still on the heart dock.
  const link = createLinkState(0xc4, 0x8d, DIR.LEFT);
  const owTile = { walkableRemap: [...OW_WALKABLE_REMAP] };
  let ladder = { x: 0xd0, y: 0x90, dir: DIR.RIGHT, state: 2 };
  for (let i = 0; i < 160; i += 1) {
    const opts = { ...owTile, ladder, ladderMode: 'overworld' };
    if ((link.gridOffset || 0) === 0) {
      if (!onWalkGrid(link.x, link.y)) snapLinkToWalkGrid(link);
      ladder = tryPlaceLadder(link, {
        tileGrid: grid,
        inv: { ladder: 1 },
        mode: 'overworld',
        roomId: 0x5f,
        inputDir: DIR.LEFT,
        existing: ladder,
        tileOpts: owTile,
      });
      opts.ladder = ladder;
    }
    stepLink(link, grid, DIR.LEFT, LINK_QSPEED, null, opts);
    if (ladder) ladder = stepLadderObject(ladder, link);
    if (link.x <= 0x90 && link.gridOffset === 0) break;
  }
  assert.ok(
    link.x <= 0x90,
    `$5F dock should ladder west to the beach, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`,
  );
});

test('alignLadderToLink fixes a post-snap Y so water is walkable', () => {
  const link = { x: 0xc0, y: 0x8d, dir: DIR.LEFT };
  const skewed = { x: 0xb0, y: 0x91, dir: DIR.LEFT, state: 1 };
  assert.equal(ladderAllowsMove(skewed, link, DIR.LEFT), false);
  const aligned = alignLadderToLink(skewed, link);
  assert.equal(aligned.y, 0x90);
  assert.equal(ladderAllowsMove(aligned, link, DIR.LEFT), true);
});

test('an off-axis ally does not stash the ladder', () => {
  const ladder = { x: 0xb0, y: 0x90, dir: DIR.LEFT, state: 1 };
  const crossing = { x: 0xc0, y: 0x8d, dir: DIR.LEFT };
  const ally = { x: 0xc0, y: 0x85, dir: DIR.UP };
  const kept = stepLadderObject(ladder, crossing, [ally]);
  assert.ok(kept);
  assert.equal(kept.dir, DIR.LEFT);
  assert.equal(stepLadderObject(ladder, ally), null, 'ally alone would stash');
});

test('a far leftover ladder does not stay while feet are on water', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  for (let r = 10; r < 14; r += 1) {
    for (let c = 0; c < 32; c += 1) grid[r][c] = LADDER_TILE;
  }
  const link = { x: 0x90, y: 0x8d, dir: DIR.LEFT, gridOffset: 0 };
  const leftover = { x: 0x20, y: 0x90, dir: DIR.RIGHT, state: 2 };
  const placed = tryPlaceLadder(link, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.LEFT,
    existing: leftover,
    tileOpts: UW_TILE,
  });
  assert.ok(placed);
  assert.equal(placed.dir, DIR.LEFT);
  assert.equal(placed.x, 0x80);
});

test('an ally on the span keeps the ladder off a second hero\'s axis', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  const ladder = { x: 0x60, y: 0x90, dir: DIR.LEFT, state: 2 };
  const crossing = { x: 0x60, y: 0x8d, dir: DIR.LEFT, gridOffset: 0 };
  const other = { x: 0xa0, y: 0x5d, dir: DIR.UP, gridOffset: 0 };
  const kept = tryPlaceLadder(other, {
    tileGrid: grid,
    inv: { ladder: 1 },
    mode: 'dungeon',
    inputDir: DIR.UP,
    existing: ladder,
    others: [crossing],
    tileOpts: UW_TILE,
  });
  assert.ok(kept);
  assert.equal(kept.x, 0x60);
  assert.equal(kept.y, 0x90);
  assert.equal(kept.dir, DIR.LEFT);
});

test('$17 river: leftover ocean ladder still crosses west', () => {
  const grid = loadOwScreen(0x17);
  if (!grid) return;
  const owTile = { walkableRemap: [...OW_WALKABLE_REMAP] };
  const link = createLinkState(0x70, 0x8d, DIR.LEFT);
  let ladder = { x: 0xd0, y: 0x90, dir: DIR.RIGHT, state: 2 };
  for (let i = 0; i < 160; i += 1) {
    const opts = { ...owTile, ladder, ladderMode: 'overworld' };
    if ((link.gridOffset || 0) === 0) {
      if (!onWalkGrid(link.x, link.y)) snapLinkToWalkGrid(link);
      ladder = tryPlaceLadder(link, {
        tileGrid: grid,
        inv: { ladder: 1 },
        mode: 'overworld',
        roomId: 0x17,
        inputDir: DIR.LEFT,
        existing: ladder,
        tileOpts: owTile,
      });
      opts.ladder = ladder;
    }
    stepLink(link, grid, DIR.LEFT, LINK_QSPEED, null, opts);
    if (ladder) ladder = stepLadderObject(ladder, link);
    if (link.x <= 0x50 && link.gridOffset === 0) break;
  }
  assert.ok(
    link.x <= 0x50,
    `$17 river should ladder west, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`,
  );
});
