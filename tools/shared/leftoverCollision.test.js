/**
 * Leftover-room walking must stop on the same local pixel as an anchor walk.
 *
 * The sampler is world-space; Link's numbers are anchor-local. A leftover
 * hero in the east neighbour sits at x+256, a north one at y−176. If either
 * conversion is wrong, one side of a tree alley opens and the other swallows
 * the sprite — the thing that looks like "can't walk left, clip into the
 * right-hand trees".
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIR, UW_FIRST_UNWALKABLE } from './collision.js';
import { PLAY_H, PLAY_W, occupyingRoom } from './continuousCamera.js';
import { buildDungeonPlayGrid, dungeonPlayOrigin, dungeonTileOpts } from './dungeonPlay.js';
import {
  CONTINUOUS_OW,
  LINK_QSPEED,
  UW_ROOM_BOUNDS,
  createLinkState,
  onWalkGrid,
  overworldLinkQSpeed,
  stepLink,
  stepShove,
} from './linkMotion.js';
import {
  getLinkCollidingTileMulti,
  roomGridMapFrom,
  standingTileMulti,
} from './multiRoomTiles.js';
import { ROOT } from './paths.js';

const ANCHOR = 0x47;
const EAST = 0x48;
const WEST = 0x46;
const NORTH = 0x37;
const SOUTH = 0x57;

const WALK_DIRS = Object.freeze([
  { name: 'left', dir: DIR.LEFT },
  { name: 'right', dir: DIR.RIGHT },
  { name: 'up', dir: DIR.UP },
  { name: 'down', dir: DIR.DOWN },
]);

/** Several columns and rows so a one-tile conversion slip cannot hide. */
const SAMPLE_SPOTS = Object.freeze([
  { x: 0x80, y: 0x8d },
  { x: 0x70, y: 0x8d },
  { x: 0x90, y: 0x8d },
  { x: 0x80, y: 0x5d },
  { x: 0x80, y: 0xad },
  { x: 0x68, y: 0x6d },
  { x: 0x98, y: 0xad },
]);

function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x26));
}

/** 8px tree walls on the four sides, sand in the middle. */
function alleyGrid() {
  const g = openGrid();
  for (let r = 0; r < 22; r += 1) {
    for (let c = 0; c < 8; c += 1) g[r][c] = 0xd8;
    for (let c = 24; c < 32; c += 1) g[r][c] = 0xd8;
  }
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 32; c += 1) g[r][c] = 0xd8;
  }
  for (let r = 19; r < 22; r += 1) {
    for (let c = 0; c < 32; c += 1) g[r][c] = 0xd8;
  }
  return g;
}

function multiOpts(grids, anchor, extra = {}) {
  return {
    anchorRoomId: anchor,
    collidingTile: (x, y, dir) => getLinkCollidingTileMulti(grids, anchor, x, y, dir, extra),
    standingTile: (x, y) => standingTileMulti(grids, anchor, x, y),
    ...extra,
  };
}

function roomAt(dx, dy) {
  return ((((ANCHOR >> 4) + dy) << 4) | ((ANCHOR & 0x0f) + dx)) & 0xff;
}

function gridWorld(makeGrid, radius = 3) {
  const tileGrid = makeGrid();
  const rooms = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      rooms.push({ roomId: roomAt(dx, dy), tileGrid });
    }
  }
  return roomGridMapFrom(rooms);
}

function walkUntilStop(link, grid, dir, opts, frames = 160) {
  for (let i = 0; i < frames; i += 1) {
    const x0 = link.x;
    const y0 = link.y;
    stepLink(link, grid, dir, LINK_QSPEED, CONTINUOUS_OW, opts);
    if (link.x === x0 && link.y === y0) break;
  }
  return { x: link.x, y: link.y };
}

function alleyWorld() {
  return gridWorld(alleyGrid);
}

function openWorld() {
  return gridWorld(openGrid);
}

function uwAlleyGrid() {
  const g = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  for (let r = 0; r < 22; r += 1) {
    for (let c = 0; c < 8; c += 1) g[r][c] = 0x80;
    for (let c = 24; c < 32; c += 1) g[r][c] = 0x80;
  }
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 32; c += 1) g[r][c] = 0x80;
  }
  for (let r = 19; r < 22; r += 1) {
    for (let c = 0; c < 32; c += 1) g[r][c] = 0x80;
  }
  return g;
}

function leftoverState(dx, dy, x, y, dir) {
  return createLinkState(x + dx * PLAY_W, y + dy * PLAY_H, dir);
}

function assertLeftoverMatches(label, local, leftover, dx, dy) {
  assert.equal(
    leftover.x,
    local.x + dx * PLAY_W,
    `${label} x (local ${local.x} leftover ${leftover.x})`,
  );
  assert.equal(
    leftover.y,
    local.y + dy * PLAY_H,
    `${label} y (local ${local.y} leftover ${leftover.y})`,
  );
}

function walkCell(grids, dx, dy, spot, dir, extra = {}) {
  const grid = grids.get(ANCHOR);
  const here = multiOpts(grids, ANCHOR, extra);
  const local = walkUntilStop(createLinkState(spot.x, spot.y, dir), grid, dir, here);
  const leftover = walkUntilStop(leftoverState(dx, dy, spot.x, spot.y, dir), grid, dir, here);
  return { local, leftover };
}

const MID_X = 0x80;
const MID_Y = 0x8d;

test('leftover east stops on the same local pixels as the anchor', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const localOpts = multiOpts(grids, ANCHOR);
  const local = createLinkState(MID_X, MID_Y, DIR.LEFT);
  const leftover = createLinkState(MID_X + PLAY_W, MID_Y, DIR.LEFT);

  const localLeft = walkUntilStop(local, grid, DIR.LEFT, localOpts);
  const eastLeft = walkUntilStop(leftover, grid, DIR.LEFT, localOpts);
  assert.equal(eastLeft.x, localLeft.x + PLAY_W, 'east leftover left-wall');
  assert.equal(eastLeft.y, localLeft.y);

  local.x = MID_X;
  leftover.x = MID_X + PLAY_W;
  const localRight = walkUntilStop(local, grid, DIR.RIGHT, localOpts);
  const eastRight = walkUntilStop(leftover, grid, DIR.RIGHT, localOpts);
  assert.equal(eastRight.x, localRight.x + PLAY_W, 'east leftover right-wall');
});

test('leftover west stops on the same local pixels as the anchor', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const localOpts = multiOpts(grids, ANCHOR);
  const local = createLinkState(MID_X, MID_Y, DIR.LEFT);
  const leftover = createLinkState(MID_X - PLAY_W, MID_Y, DIR.LEFT);

  const localLeft = walkUntilStop(local, grid, DIR.LEFT, localOpts);
  const westLeft = walkUntilStop(leftover, grid, DIR.LEFT, localOpts);
  assert.equal(westLeft.x, localLeft.x - PLAY_W, 'west leftover left-wall');

  local.x = MID_X;
  leftover.x = MID_X - PLAY_W;
  const localRight = walkUntilStop(local, grid, DIR.RIGHT, localOpts);
  const westRight = walkUntilStop(leftover, grid, DIR.RIGHT, localOpts);
  assert.equal(westRight.x, localRight.x - PLAY_W, 'west leftover right-wall');
});

test('leftover north and south stop on the same local pixels as the anchor', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const localOpts = multiOpts(grids, ANCHOR);

  const localUp = walkUntilStop(createLinkState(MID_X, MID_Y, DIR.UP), grid, DIR.UP, localOpts);
  const northUp = walkUntilStop(
    createLinkState(MID_X, MID_Y - PLAY_H, DIR.UP),
    grid,
    DIR.UP,
    localOpts,
  );
  assert.equal(northUp.y, localUp.y - PLAY_H, 'north leftover north-wall');
  assert.equal(northUp.x, localUp.x);

  const localDown = walkUntilStop(
    createLinkState(MID_X, MID_Y, DIR.DOWN),
    grid,
    DIR.DOWN,
    localOpts,
  );
  const southDown = walkUntilStop(
    createLinkState(MID_X, MID_Y + PLAY_H, DIR.DOWN),
    grid,
    DIR.DOWN,
    localOpts,
  );
  assert.equal(southDown.y, localDown.y + PLAY_H, 'south leftover south-wall');
  assert.equal(southDown.x, localDown.x);
});

test('a leftover right-walk does not sink into the tree column the local walk refuses', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const opts = multiOpts(grids, ANCHOR);
  const local = createLinkState(MID_X, MID_Y, DIR.RIGHT);
  const leftover = createLinkState(MID_X + PLAY_W, MID_Y, DIR.RIGHT);
  walkUntilStop(local, grid, DIR.RIGHT, opts);
  walkUntilStop(leftover, grid, DIR.RIGHT, opts);
  const localIntoWall = local.x - 0xb8; // col 24 starts at pixel $C0; hotspot stop is west of that
  const leftoverIntoWall = leftover.x - PLAY_W - 0xb8;
  assert.equal(
    leftoverIntoWall,
    localIntoWall,
    `leftover sank further into the right trees (local x=${local.x} leftover local=${leftover.x - PLAY_W})`,
  );
  // Sprite is 16px; the right trees start at pixel $C0. Standing at ≥$C0 is inside.
  assert.ok(local.x < 0xc0, `local walk ended inside the right trees at x=${local.x}`);
  assert.ok(
    leftover.x - PLAY_W < 0xc0,
    `leftover walk ended inside the right trees at local x=${leftover.x - PLAY_W}`,
  );
});

const ROW_YS = Object.freeze([0x5d, 0x8d, 0xad]);

test('leftover east matches the anchor on several rows', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const opts = multiOpts(grids, ANCHOR);
  for (const y of ROW_YS) {
    const localLeft = walkUntilStop(createLinkState(MID_X, y, DIR.LEFT), grid, DIR.LEFT, opts);
    const eastLeft = walkUntilStop(
      createLinkState(MID_X + PLAY_W, y, DIR.LEFT),
      grid,
      DIR.LEFT,
      opts,
    );
    assert.equal(eastLeft.x, localLeft.x + PLAY_W, `row ${y.toString(16)} left`);
    const localRight = walkUntilStop(createLinkState(MID_X, y, DIR.RIGHT), grid, DIR.RIGHT, opts);
    const eastRight = walkUntilStop(
      createLinkState(MID_X + PLAY_W, y, DIR.RIGHT),
      grid,
      DIR.RIGHT,
      opts,
    );
    assert.equal(eastRight.x, localRight.x + PLAY_W, `row ${y.toString(16)} right`);
  }
});

test('diagonal leftover (east and north) still hits the same local walls', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const opts = multiOpts(grids, ANCHOR);
  const localLeft = walkUntilStop(createLinkState(MID_X, MID_Y, DIR.LEFT), grid, DIR.LEFT, opts);
  const diag = createLinkState(MID_X + PLAY_W, MID_Y - PLAY_H, DIR.LEFT);
  const diagLeft = walkUntilStop(diag, grid, DIR.LEFT, opts);
  assert.equal(diagLeft.x, localLeft.x + PLAY_W, 'diagonal leftover left-wall x');
  assert.equal(diagLeft.y, MID_Y - PLAY_H, 'diagonal leftover must not drift north/south');
});

test('leftover two rooms from the anchor still reaches that room\'s trees', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const farWest = multiOpts(grids, 0x45);
  const farEast = multiOpts(grids, 0x49);
  const farNorth = multiOpts(grids, 0x27);
  const farSouth = multiOpts(grids, 0x67);
  const here = multiOpts(grids, ANCHOR);

  const westLocal = walkUntilStop(
    createLinkState(MID_X, MID_Y, DIR.LEFT),
    grid,
    DIR.LEFT,
    farWest,
  );
  const westFar = walkUntilStop(
    createLinkState(MID_X - PLAY_W * 2, MID_Y, DIR.LEFT),
    grid,
    DIR.LEFT,
    here,
  );
  assert.equal(westFar.x, westLocal.x - PLAY_W * 2, 'two-room west leftover left-wall');

  const eastLocal = walkUntilStop(
    createLinkState(MID_X, MID_Y, DIR.RIGHT),
    grid,
    DIR.RIGHT,
    farEast,
  );
  const eastFar = walkUntilStop(
    createLinkState(MID_X + PLAY_W * 2, MID_Y, DIR.RIGHT),
    grid,
    DIR.RIGHT,
    here,
  );
  assert.equal(eastFar.x, eastLocal.x + PLAY_W * 2, 'two-room east leftover right-wall');

  const northLocal = walkUntilStop(createLinkState(MID_X, MID_Y, DIR.UP), grid, DIR.UP, farNorth);
  const northFar = walkUntilStop(
    createLinkState(MID_X, MID_Y - PLAY_H * 2, DIR.UP),
    grid,
    DIR.UP,
    here,
  );
  assert.equal(northFar.y, northLocal.y - PLAY_H * 2, 'two-room north leftover north-wall');

  const southLocal = walkUntilStop(
    createLinkState(MID_X, MID_Y, DIR.DOWN),
    grid,
    DIR.DOWN,
    farSouth,
  );
  const southFar = walkUntilStop(
    createLinkState(MID_X, MID_Y + PLAY_H * 2, DIR.DOWN),
    grid,
    DIR.DOWN,
    here,
  );
  assert.equal(southFar.y, southLocal.y + PLAY_H * 2, 'two-room south leftover south-wall');
});

const NEIGHBOR_CELLS = Object.freeze([
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
]);

const FAR_CELLS = Object.freeze([
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [-1, 2],
  [1, -2],
  [-1, -2],
]);

test('leftover matches the anchor on every neighbour cell, spot, and direction', () => {
  const grids = alleyWorld();
  for (const [dx, dy] of NEIGHBOR_CELLS) {
    for (const spot of SAMPLE_SPOTS) {
      for (const { name, dir } of WALK_DIRS) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir);
        assertLeftoverMatches(
          `cell ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('leftover two and three rooms away still matches the anchor on every axis', () => {
  const grids = alleyWorld();
  for (const [dx, dy] of FAR_CELLS) {
    for (const spot of SAMPLE_SPOTS) {
      for (const { name, dir } of WALK_DIRS) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir);
        assertLeftoverMatches(
          `far ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('leftover never occupies a different cell after an in-room wall stop', () => {
  const grids = alleyWorld();
  const grid = grids.get(ANCHOR);
  const here = multiOpts(grids, ANCHOR);
  for (const [dx, dy] of NEIGHBOR_CELLS) {
    if (dx === 0 && dy === 0) continue;
    const want = roomAt(dx, dy);
    for (const { name, dir } of WALK_DIRS) {
      const leftover = leftoverState(dx, dy, MID_X, MID_Y, dir);
      walkUntilStop(leftover, grid, dir, here);
      const occ = occupyingRoom(ANCHOR, leftover.x, leftover.y);
      assert.equal(
        occ.roomId,
        want,
        `leftover ${dx},${dy} ${name} ended in $${occ.roomId.toString(16)} `
          + `at ${leftover.x},${leftover.y} instead of $${want.toString(16)}`,
      );
    }
  }
});

test('leftover on open sand walks the same pixels as a local walk', () => {
  const grids = openWorld();
  const grid = grids.get(ANCHOR);
  const here = multiOpts(grids, ANCHOR);
  const frames = 48;
  for (const [dx, dy] of NEIGHBOR_CELLS) {
    for (const { name, dir } of WALK_DIRS) {
      const local = createLinkState(MID_X, MID_Y, dir);
      const leftover = leftoverState(dx, dy, MID_X, MID_Y, dir);
      for (let i = 0; i < frames; i += 1) {
        stepLink(local, grid, dir, LINK_QSPEED, CONTINUOUS_OW, here);
        stepLink(leftover, grid, dir, LINK_QSPEED, CONTINUOUS_OW, here);
      }
      assertLeftoverMatches(`open ${dx},${dy} ${name}`, local, leftover, dx, dy);
    }
  }
});

test('leftover can walk across the next seam into a room two away from the anchor', () => {
  const grids = openWorld();
  const grid = grids.get(ANCHOR);
  const here = multiOpts(grids, ANCHOR);
  const cases = [
    { dx: -1, dy: 0, dir: DIR.LEFT, startX: 0x20, startY: MID_Y, dest: roomAt(-2, 0) },
    { dx: 1, dy: 0, dir: DIR.RIGHT, startX: 0xe0, startY: MID_Y, dest: roomAt(2, 0) },
    { dx: 0, dy: -1, dir: DIR.UP, startX: MID_X, startY: 0x55, dest: roomAt(0, -2) },
    { dx: 0, dy: 1, dir: DIR.DOWN, startX: MID_X, startY: 0xc0, dest: roomAt(0, 2) },
  ];
  for (const c of cases) {
    const link = leftoverState(c.dx, c.dy, c.startX, c.startY, c.dir);
    let reached = false;
    for (let i = 0; i < 400; i += 1) {
      stepLink(link, grid, c.dir, LINK_QSPEED, CONTINUOUS_OW, here);
      if (occupyingRoom(ANCHOR, link.x, link.y).roomId === c.dest) {
        reached = true;
        break;
      }
    }
    assert.ok(
      reached,
      `leftover ${c.dx},${c.dy} should have entered $${c.dest.toString(16)} `
        + `but occupies $${occupyingRoom(ANCHOR, link.x, link.y).roomId.toString(16)} `
        + `at ${link.x},${link.y}`,
    );
  }
});

test('dungeon leftover matches the anchor on every neighbour cell', () => {
  const grids = gridWorld(uwAlleyGrid);
  const uw = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };
  for (const [dx, dy] of NEIGHBOR_CELLS) {
    for (const { name, dir } of WALK_DIRS) {
      const { local, leftover } = walkCell(grids, dx, dy, { x: MID_X, y: MID_Y }, dir, uw);
      assertLeftoverMatches(`uw cell ${dx},${dy} ${name}`, local, leftover, dx, dy);
    }
  }
});

function extractedUwLevel(quest, level) {
  const file = path.join(ROOT, `assets/extracted/dungeons/q${quest}/level_${level}/level.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function extractedUwWorld(levelData, roomId, radius = 2) {
  const rooms = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const id = ((((roomId >> 4) + dy) << 4) | ((roomId & 0x0f) + dx)) & 0xff;
      const pack = levelData.rooms.find((r) => r.roomId === id);
      if (!pack) continue;
      rooms.push({ roomId: id, tileGrid: buildDungeonPlayGrid(pack, dungeonPlayOrigin()) });
    }
  }
  return rooms.length ? roomGridMapFrom(rooms) : null;
}

/** L9 `$23` north-door floor strip (water `$F4` starts one row south). */
const L9_NORTH_LIP = Object.freeze([
  { x: 0x78, y: 0x5e },
  { x: 0x80, y: 0x5e },
  { x: 0x80, y: 0x5d },
  { x: 0x88, y: 0x5e },
]);

test('leftover L9 $23 north lip matches the anchor left and right', () => {
  // Screenshot: leftover at the north door, Right does nothing. The cell is
  // a water room — the only dry strip is this BoundByRoom lip.
  const level = extractedUwLevel(1, 9);
  if (!level) assert.fail('missing extract q1/level_9 — run dungeon extract');
  const grids = extractedUwWorld(level, 0x23);
  assert.ok(grids?.has(0x23), 'L9 $23 missing from extract');
  const uw = dungeonTileOpts();
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [2, 0],
    [0, -2],
  ]) {
    for (const spot of L9_NORTH_LIP) {
      for (const { name, dir } of [
        { name: 'left', dir: DIR.LEFT },
        { name: 'right', dir: DIR.RIGHT },
      ]) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir, uw);
        assertLeftoverMatches(
          `L9 $23 ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('a 1px north knockback on L9 $23 still walks right along the lip', () => {
  const level = extractedUwLevel(1, 9);
  if (!level) assert.fail('missing extract q1/level_9 — run dungeon extract');
  const pack = level.rooms.find((r) => r.roomId === 0x23);
  const grid = buildDungeonPlayGrid(pack, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const solo = walkUntilStop(createLinkState(0x80, 0x5e, DIR.RIGHT), grid, DIR.RIGHT, opts);
  const shoved = createLinkState(0x80, 0x5e, DIR.DOWN);
  stepShove(shoved, grid, DIR.UP, 0x20, {
    roomId: UW_ROOM_BOUNDS,
    tileOpts: opts,
    pixelsPerFrame: 4,
  });
  const after = walkUntilStop(shoved, grid, DIR.RIGHT, opts);
  assert.ok(
    after.x > 0x80,
    `north-lip shove must not freeze Right (x=$${after.x.toString(16)} y=$${after.y.toString(16)})`,
  );
  assert.equal(after.x, solo.x, `after shove right-stop ${after.x} vs solo ${solo.x}`);
});

test('dungeon leftover two rooms from the anchor still reaches that room\'s walls', () => {
  const grids = gridWorld(uwAlleyGrid);
  const uw = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };
  for (const [dx, dy] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ]) {
    for (const { name, dir } of WALK_DIRS) {
      const { local, leftover } = walkCell(grids, dx, dy, { x: MID_X, y: MID_Y }, dir, uw);
      assertLeftoverMatches(`uw far ${dx},${dy} ${name}`, local, leftover, dx, dy);
    }
  }
});

function extractedOwGrid(roomId) {
  const name = (roomId & 0xff).toString(16).padStart(2, '0');
  const file = path.join(ROOT, 'assets/extracted/play/screens', `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).tileGrid;
}

function extractedWorld(roomId, radius = 3) {
  const tileGrid = extractedOwGrid(roomId);
  if (!tileGrid) return null;
  const rooms = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      rooms.push({ roomId: roomAt(dx, dy), tileGrid });
    }
  }
  return roomGridMapFrom(rooms);
}

/** `$11` north-wall stairs occupy columns `$70`/`$78` (16px well). */
const STAIR_WELL = Object.freeze({ x: 0x78, y: 0x4d });

test('leftover in the $11 stair well can walk left onto the stair column', () => {
  const grids = extractedWorld(0x11);
  if (!grids) assert.fail('missing extracted screen 11.json — run overworld extract');
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, -1],
    [2, 0],
    [-2, 1],
  ]) {
    const { local, leftover } = walkCell(grids, dx, dy, STAIR_WELL, DIR.LEFT);
    assertLeftoverMatches(
      `$11 stair well ${dx},${dy} left`,
      local,
      leftover,
      dx,
      dy,
    );
    const localX = leftover.x - dx * PLAY_W;
    assert.ok(
      localX <= 0x70,
      `$11 leftover ${dx},${dy} could not center on the stairs `
        + `(left-stop local x=$${localX.toString(16)}, want ≤$70)`,
    );
  }
});

test('leftover in the $11 stair well matches the anchor on both walls', () => {
  const grids = extractedWorld(0x11);
  if (!grids) assert.fail('missing extracted screen 11.json — run overworld extract');
  const spots = [
    STAIR_WELL,
    { x: 0x70, y: 0x4d },
    { x: 0x80, y: 0x4d },
    { x: 0x78, y: 0x5d },
    { x: 0x78, y: 0x6d },
  ];
  for (const [dx, dy] of NEIGHBOR_CELLS) {
    for (const spot of spots) {
      for (const { name, dir } of [
        { name: 'left', dir: DIR.LEFT },
        { name: 'right', dir: DIR.RIGHT },
      ]) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir);
        assertLeftoverMatches(
          `$11 ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('leftover on $3C mountain stairs matches the anchor left and right', () => {
  const grids = extractedWorld(0x3c);
  if (!grids) assert.fail('missing extracted screen 3c.json — run overworld extract');
  const spots = [
    { x: 0x70, y: 0xcd },
    { x: 0x78, y: 0xcd },
    { x: 0x68, y: 0xcd },
  ];
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [2, -1],
  ]) {
    for (const spot of spots) {
      for (const { name, dir } of [
        { name: 'left', dir: DIR.LEFT },
        { name: 'right', dir: DIR.RIGHT },
      ]) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir);
        assertLeftoverMatches(
          `$3c ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('leftover walking west from $11 into $10 matches a local $11 walk', () => {
  const g10 = extractedOwGrid(0x10);
  const g11 = extractedOwGrid(0x11);
  const g12 = extractedOwGrid(0x12);
  const g13 = extractedOwGrid(0x13);
  if (!g10 || !g11 || !g12 || !g13) {
    assert.fail('missing extracted screens 10–13 — run overworld extract');
  }
  const grids = roomGridMapFrom([
    { roomId: 0x10, tileGrid: g10 },
    { roomId: 0x11, tileGrid: g11 },
    { roomId: 0x12, tileGrid: g12 },
    { roomId: 0x13, tileGrid: g13 },
  ]);
  const spot = { x: 0x78, y: 0x5d };
  const localOpts = multiOpts(grids, 0x11);
  const leftoverOpts = multiOpts(grids, 0x13);
  const local = walkUntilStop(
    createLinkState(spot.x, spot.y, DIR.LEFT),
    g11,
    DIR.LEFT,
    localOpts,
    500,
  );
  const leftover = walkUntilStop(
    createLinkState(spot.x + (0x11 - 0x13) * PLAY_W, spot.y, DIR.LEFT),
    g13,
    DIR.LEFT,
    leftoverOpts,
    500,
  );
  const loc = occupyingRoom(0x11, local.x, local.y);
  const lef = occupyingRoom(0x13, leftover.x, leftover.y);
  assert.equal(lef.roomId, loc.roomId, 'leftover $11→$10 ended in a different cell');
  assert.equal(lef.x, loc.x, `leftover $11→$10 x ${lef.x} vs local ${loc.x}`);
  assert.equal(lef.y, loc.y, `leftover $11→$10 y ${lef.y} vs local ${loc.y}`);
});

test('leftover on sand is not slowed by stairs on the streaming-anchor screen', () => {
  const link = leftoverState(3, 0, 0x78, 0x5d, DIR.LEFT);
  const hostStairs = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  assert.equal(
    overworldLinkQSpeed(link, hostStairs),
    0x30,
    'folded leftover X used to sample the host stairs',
  );
  assert.equal(
    overworldLinkQSpeed(link, hostStairs, { standingTile: () => 0x26 }),
    LINK_QSPEED,
    'occupying-cell sand must keep default speed',
  );
});

/** Dungeon 5 / Armos court on Death Mountain (`$0B`). */
const ARMOS_COURT = 0x0b;
const ARMOS_SPOTS = Object.freeze([
  { x: 0x20, y: 0x7d },
  { x: 0x28, y: 0x7d },
  { x: 0x40, y: 0x7d },
  { x: 0x70, y: 0xbd },
  { x: 0x70, y: 0xcd },
  { x: 0x78, y: 0xcd },
]);

test('leftover on $0B Armos / south stairs matches the anchor', () => {
  const grids = extractedWorld(ARMOS_COURT);
  if (!grids) assert.fail('missing extracted screen 0b.json — run overworld extract');
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [2, 0],
    [0, 2],
    [-2, 1],
  ]) {
    for (const spot of ARMOS_SPOTS) {
      for (const { name, dir } of [
        { name: 'left', dir: DIR.LEFT },
        { name: 'right', dir: DIR.RIGHT },
      ]) {
        const { local, leftover } = walkCell(grids, dx, dy, spot, dir);
        assertLeftoverMatches(
          `$0b ${dx},${dy} spot $${spot.x.toString(16)},$${spot.y.toString(16)} ${name}`,
          local,
          leftover,
          dx,
          dy,
        );
      }
    }
  }
});

test('leftover can still center on $0B south-wall stairs', () => {
  const grids = extractedWorld(ARMOS_COURT);
  if (!grids) assert.fail('missing extracted screen 0b.json — run overworld extract');
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [2, -1],
  ]) {
    const { leftover } = walkCell(grids, dx, dy, { x: 0x78, y: 0xcd }, DIR.LEFT);
    const localX = leftover.x - dx * PLAY_W;
    assert.ok(
      localX <= 0x70,
      `$0b leftover ${dx},${dy} could not center on the south stairs `
        + `(left-stop local x=$${localX.toString(16)}, want ≤$70)`,
    );
  }
});

test('knockback beside $0B Armos stays on the walk grid and still hits the statue', () => {
  const grids = extractedWorld(ARMOS_COURT);
  if (!grids) assert.fail('missing extracted screen 0b.json — run overworld extract');
  const grid = grids.get(ANCHOR);
  const opts = multiOpts(grids, ANCHOR);
  const spot = { x: 0x20, y: 0x7d };

  const solo = walkUntilStop(createLinkState(spot.x, spot.y, DIR.RIGHT), grid, DIR.RIGHT, opts);
  assert.ok(solo.x < 0x30, `solo walked through the Armos to x=$${solo.x.toString(16)}`);

  const shoved = createLinkState(spot.x, spot.y, DIR.LEFT);
  let left = 0x20;
  for (let i = 0; i < 8; i += 1) {
    const hit = stepShove(shoved, grid, DIR.LEFT, left, {
      pixelsPerFrame: 4,
      roomId: CONTINUOUS_OW,
      tileOpts: opts,
    });
    left = hit.shovePixels;
    if (hit.blocked || left <= 0) break;
  }
  assert.equal(onWalkGrid(shoved.x, shoved.y), true, 'knockback left Link off-grid');

  const after = walkUntilStop(shoved, grid, DIR.RIGHT, opts);
  assert.equal(after.x, solo.x, `after knockback right-stop ${after.x} vs solo ${solo.x}`);
  assert.equal(after.y, solo.y);
});

test('a 4px off-grid pose on $0B stairs snaps back and centers on the well', () => {
  const grids = extractedWorld(ARMOS_COURT);
  if (!grids) assert.fail('missing extracted screen 0b.json — run overworld extract');
  const grid = grids.get(ANCHOR);
  const opts = multiOpts(grids, ANCHOR);

  const aligned = walkUntilStop(
    createLinkState(0x78, 0xcd, DIR.LEFT),
    grid,
    DIR.LEFT,
    opts,
  );
  const drifted = createLinkState(0x78 - 4, 0xcd, DIR.LEFT);
  const after = walkUntilStop(drifted, grid, DIR.LEFT, opts);
  assert.equal(after.x, aligned.x);
  assert.ok(after.x <= 0x70, `off-grid stair walk stopped at $${after.x.toString(16)}`);
  assert.equal(onWalkGrid(after.x, after.y), true);
});

test('leftover on the west map rim still walks to that room\'s trees', () => {
  // Anchor $42 (inland); leftover two rooms west is $40, the map's west rim.
  const alley = alleyGrid();
  const grids = roomGridMapFrom([
    { roomId: 0x40, tileGrid: alley },
    { roomId: 0x41, tileGrid: alley },
    { roomId: 0x42, tileGrid: alley },
  ]);
  const rim = multiOpts(grids, 0x40);
  const inland = multiOpts(grids, 0x42);
  const grid = alley;
  const localLeft = walkUntilStop(createLinkState(MID_X, MID_Y, DIR.LEFT), grid, DIR.LEFT, rim);
  const leftover = createLinkState(MID_X - PLAY_W * 2, MID_Y, DIR.LEFT);
  const farLeft = walkUntilStop(leftover, grid, DIR.LEFT, inland);
  assert.equal(farLeft.x, localLeft.x - PLAY_W * 2, 'map-rim leftover left-wall');
  assert.equal(
    occupyingRoom(0x42, farLeft.x, farLeft.y).roomId,
    0x40,
    'map-rim leftover must still occupy $40',
  );
});
