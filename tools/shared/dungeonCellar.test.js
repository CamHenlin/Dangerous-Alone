import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT, UW_FIRST_UNWALKABLE } from './collision.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CELLAR_EXIT_MIN_Y,
  CELLAR_FLOOR_TILE,
  CELLAR_FLOOR_Y,
  CELLAR_INNER_STAIRS_X,
  CELLAR_KEESE_TYPE,
  CELLAR_LADDER_XS,
  CELLAR_STAIRS_TILE,
  CELLAR_STAND_Y,
  cellarEnterSpawn,
  cellarExitsFor,
  cellarForStairsRoom,
  cellarKeeseSpawns,
  cellarReturnSpawn,
  checkCellarExit,
  checkUwStairsEntry,
  composeCellarRoomTiles,
  decodeCellarSquares,
  isCellarRoom,
  isCellarRoomId,
  linkOnStairs,
  stairsRoomsForCellar,
  streamableUwRooms,
} from './dungeonCellar.js';
import { PLAY_COLS, PLAY_ROWS, composeDungeonRoomTiles } from './dungeonRoomLayout.js';
import { UW_PRIMARY_SQUARES, buildDungeonPlayGrid, dungeonPlayOrigin } from './dungeonPlay.js';
import { finalizeLevelMeta } from './dungeons.js';
import { OBJ, spawnDungeonEnemies } from './enemies.js';
import {
  LINK_QSPEED,
  NO_ROOM_BOUNDS,
  UW_ROOM_BOUNDS,
  canLinkMove,
  createLinkState,
  stepLink,
} from './linkMotion.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('cellar $7F exits decode to room $22', () => {
  const room = { layoutId: 0x3f, attrsA: 0x22, attrsB: 0x22, cellarExits: { left: 0x22, right: 0x22 } };
  assert.equal(isCellarRoom(room, { cellarRooms: [0x7f] }), true);
  assert.deepEqual(cellarExitsFor(room), { left: 0x22, right: 0x22 });
});

test('streamableUwRooms hides map-adjacent cellars from top-down rooms', () => {
  const level = {
    cellarRooms: [0x4a],
    rooms: [
      { roomId: 0x49, layoutId: 0x01 },
      { roomId: 0x4a, layoutId: 0x3e },
      { roomId: 0x59, layoutId: 0x02 },
    ],
  };
  assert.deepEqual(
    streamableUwRooms([0x49, 0x4a, 0x59], 0x49, level),
    [0x49, 0x59],
  );
  assert.equal(isCellarRoomId(0x4a, level), true);
});

test('streamableUwRooms isolates the current cellar', () => {
  const level = {
    cellarRooms: [0x4a],
    rooms: [
      { roomId: 0x49, layoutId: 0x01 },
      { roomId: 0x4a, layoutId: 0x3e },
    ],
  };
  assert.deepEqual(streamableUwRooms([0x49, 0x4a, 0x5a], 0x4a, level), [0x4a]);
});

test('streamableUwRooms drops empty map cells that are not rooms', () => {
  // L1 $33's camera 3×3 includes $32 / $34, which are not rooms. Fetching
  // them as missing used to stall the sweep so visited $43 never painted.
  const level = {
    cellarRooms: [0x7f],
    rooms: [{ roomId: 0x33 }, { roomId: 0x43 }, { roomId: 0x23 }, { roomId: 0x7f }],
  };
  assert.deepEqual(
    streamableUwRooms([0x23, 0x32, 0x33, 0x34, 0x43], 0x33, level),
    [0x23, 0x33, 0x43],
  );
});

test('stairs detection uses floor tiles $70–$73 with NES alignment', () => {
  const floor = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  // Screen Y $9D → floor row ((0x9D - 96) / 8) = 7 with floor origin Y=$60.
  floor[7][12] = 0x70;
  const origin = { x: 32, y: 96 };
  assert.equal(linkOnStairs(floor, origin, { x: 0x80, y: 0x9d }), true);
  assert.equal(linkOnStairs(floor, origin, { x: 0x80, y: 0x9c }), false); // unaligned Y
  assert.equal(linkOnStairs(floor, origin, { x: 40, y: 0x9d }), false);
});

test('stairsRoomsForCellar returns the on-map parent', () => {
  const level = JSON.parse(
    readFileSync(join(ROOT, 'assets/extracted/dungeons/q1/level_5/level.json'), 'utf8'),
  );
  // Recorder cellar $04 ↔ stairs room $05.
  assert.deepEqual(stairsRoomsForCellar(level, 0x04), [0x05]);
});

test('cellarForStairsRoom finds matching exit', () => {
  const level = {
    cellarRooms: [0x7f],
    rooms: [
      { roomId: 0x22 },
      { roomId: 0x7f, cellarExits: { left: 0x22, right: 0x22 }, attrsC: 0x6a },
    ],
  };
  assert.equal(cellarForStairsRoom(level, 0x22), 0x7f);
  assert.equal(cellarForStairsRoom(level, '34'), 0x7f, 'coerce string room ids');
});

test('cellarForStairsRoom does not fall back to lone unmatched cellar', () => {
  const level = {
    cellarRooms: [0x7f],
    rooms: [{ roomId: 0x7f, cellarExits: { left: 0x10, right: 0x11 } }],
  };
  assert.equal(cellarForStairsRoom(level, 0x22), null);
});

test('checkUwStairsEntry uses GetCollidableTileStill on play grid', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x24));
  // Screen ($D0,$8D) → sample Y $98 → play row ($98-$40)/8 = 11, col $D0/8 = 26.
  grid[11][26] = 0x71;
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0x8d, gridOffset: 0 }, grid), true);
  // Mid-cell X still samples column $D0 via X & $F8.
  assert.equal(checkUwStairsEntry({ x: 0xd4, y: 0x8d, gridOffset: 0 }, grid), true);
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0x8d, gridOffset: 1 }, grid), false);
  // Half-cell Y ≡ $5 and south slot Y=$9D still warp via footprint probes.
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0x95, gridOffset: 0 }, grid), true);
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0x9d, gridOffset: 0 }, grid), true);
  // Far south of the square must not warp.
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0xad, gridOffset: 0 }, grid), false);
});

test('L3 room $69 stairs map to cellar $0F', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_3/level.json');
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x69);
  assert.ok(room);
  assert.equal(cellarForStairsRoom(level, 0x69), 0x0f);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {});
  assert.equal(checkUwStairsEntry({ x: 0xd0, y: 0x8d, gridOffset: 0 }, grid), true);
  assert.equal(checkUwStairsEntry({ x: 0xd4, y: 0x8d, gridOffset: 0 }, grid), true);
});

test('L5 $64 diamond stairs map to cellar $7 from north and south slots', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_5/level.json');
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x64);
  assert.ok(room?.pushable);
  assert.equal(cellarForStairsRoom(level, 0x64), 0x07);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {});
  // Stairs square at ($80,$90); west approach and south stop both warp.
  assert.equal(checkUwStairsEntry({ x: 0x80, y: 0x8d, gridOffset: 0 }, grid), true);
  assert.equal(checkUwStairsEntry({ x: 0x78, y: 0x8d, gridOffset: 0 }, grid), true);
  assert.equal(checkUwStairsEntry({ x: 0x80, y: 0x9d, gridOffset: 0 }, grid), true);
});

test('cellarEnterSpawn uses CellarLadderXs and stand Y $5D', () => {
  const cellar = { cellarExits: { left: 0x22, right: 0x33 } };
  const left = cellarEnterSpawn(null, null, {
    sourceRoomId: 0x22,
    cellarRoom: cellar,
  });
  assert.equal(left.x, CELLAR_LADDER_XS[0]);
  assert.equal(left.y, 0x5d);
  assert.equal(left.dir, DIR.DOWN);
  const right = cellarEnterSpawn(null, null, {
    sourceRoomId: 0x33,
    cellarRoom: cellar,
  });
  assert.equal(right.x, CELLAR_LADDER_XS[1]);
});

test('checkCellarExit uses NES Y < $40 and X side for destination', () => {
  const cellar = {
    roomId: 0x7f,
    layoutId: 0x3f,
    cellarExits: { left: 0x22, right: 0x33 },
    attrsC: 0x6a,
  };
  const level = { cellarRooms: [0x7f], rooms: [{ roomId: 0x22 }, { roomId: 0x33 }, cellar] };
  assert.equal(
    checkCellarExit({ x: 0x40, y: 0x5d, dir: DIR.UP }, cellar, level, null, DIR.UP),
    null,
    'stand Y is not at ladder top',
  );
  assert.equal(
    checkCellarExit({ x: 0x40, y: 0x40, dir: DIR.UP }, cellar, level, null, DIR.UP),
    null,
    'Y at HUD edge is not yet past the gate',
  );
  const left = checkCellarExit({ x: 0x40, y: 0x3f, dir: DIR.UP }, cellar, level, null, DIR.UP);
  assert.equal(left?.nextRoomId, 0x22);
  const right = checkCellarExit({ x: 0xa0, y: 0x3f, dir: DIR.UP }, cellar, level, null, DIR.UP);
  assert.equal(right?.nextRoomId, 0x33);
});

test('CELLAR_EXIT_MIN_Y is below HUD so play can reach the exit gate', () => {
  assert.ok(CELLAR_EXIT_MIN_Y < HUD_HEIGHT);
  assert.ok(CELLAR_EXIT_MIN_Y <= 0x3f);
});

test('L1 $7F: UW BoundByRoom blocks cellar climb; mode-9 skip allows exit', () => {
  // NES Z_07: GameMode=$09 skips BoundByRoom so the ladder can pass Y<$5E.
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_1/level.json');
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x7f);
  assert.ok(room);
  assert.equal(isCellarRoom(room, level), true);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {});
  const opts = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };

  assert.equal(
    canLinkMove(
      grid,
      CELLAR_LADDER_XS[0],
      CELLAR_STAND_Y,
      DIR.UP,
      UW_ROOM_BOUNDS,
      opts,
    ),
    false,
    'ObjectRoomBoundsUW top $5E freezes stand Y $5D',
  );
  assert.equal(
    canLinkMove(
      grid,
      CELLAR_LADDER_XS[0],
      CELLAR_STAND_Y,
      DIR.UP,
      NO_ROOM_BOUNDS,
      opts,
    ),
    true,
    'mode 9 skips room bounds',
  );

  const link = createLinkState(CELLAR_LADDER_XS[0], CELLAR_STAND_Y, DIR.UP);
  let exit = null;
  for (let i = 0; i < 200; i += 1) {
    stepLink(link, grid, DIR.UP, LINK_QSPEED, NO_ROOM_BOUNDS, opts);
    if (link.y < CELLAR_EXIT_MIN_Y) link.y = CELLAR_EXIT_MIN_Y;
    exit = checkCellarExit(link, room, level, null, DIR.UP);
    if (exit) break;
  }
  assert.ok(exit, `expected cellar exit, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`);
  assert.equal(exit.nextRoomId, 0x22);
});

test('cellarReturnSpawn unpacks attrsC as screen-absolute', () => {
  const spawn = cellarReturnSpawn(0x6a);
  assert.equal(spawn.x, 0x60);
  assert.equal(spawn.y, 0xad);
  assert.equal(spawn.dir, DIR.DOWN);
});

test('composeCellarRoomTiles does not need Node Buffer', () => {
  const had = globalThis.Buffer;
  // @ts-ignore
  delete globalThis.Buffer;
  try {
    const grid = composeCellarRoomTiles(0x3f);
    assert.equal(grid[2][0], 0xfa);
  } finally {
    globalThis.Buffer = had;
  }
});

test('cellar $3F treasure layout has ladder shaft + black floor', () => {
  const squares = decodeCellarSquares(0x3f);
  // Top of left ladder column is open ($00 → black).
  assert.equal(squares[0][3], 0x00);
  // Ladder shaft squares.
  assert.equal(squares[1][3], 0x01);
  // Ceiling void uses square $02 (CHR $F3).
  assert.equal(squares[0][0], 0x02);
  const grid = composeCellarRoomTiles(0x3f);
  assert.equal(grid.length, PLAY_ROWS);
  assert.equal(grid[0].length, PLAY_COLS);
  // Ladder open mouth tiles are $24.
  assert.equal(grid[0][6], CELLAR_FLOOR_TILE);
  assert.equal(grid[0][7], CELLAR_FLOOR_TILE);
  // Square $02 stays ROM CHR $F3 (solid void under UW $78).
  assert.equal(grid[0][0], 0xf3);
  // Brick walls from square $03 stay $FA.
  assert.equal(grid[2][0], 0xfa);
  // Square $0C floor lip: blank $F3 over walkable $24.
  assert.equal(grid[16][8], 0xf3);
  assert.equal(grid[17][8], CELLAR_FLOOR_TILE);
  assert.equal(grid[2][6], CELLAR_STAIRS_TILE);
});

test('composeDungeonRoomTiles routes cellars away from UW walls', () => {
  const room = { layoutId: 0x3f, doors: { north: { code: 0, type: 'open' } } };
  const grid = composeDungeonRoomTiles(room);
  // UW FillWalls would plant $E0 at (1,1); cellar layout does not.
  assert.notEqual(grid[1][1], 0xe0);
  assert.equal(grid[0][0], 0xf3);
  assert.equal(grid[2][0], 0xfa);
});

const CELLAR_WALK = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };

/**
 * @param {number[][]} grid
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number} frames
 */
function walkCellar(grid, x, y, dir, frames) {
  const link = createLinkState(x, y, dir);
  for (let i = 0; i < frames; i += 1) {
    stepLink(link, grid, dir, LINK_QSPEED, NO_ROOM_BOUNDS, CELLAR_WALK);
    if (link.y < CELLAR_EXIT_MIN_Y) link.y = CELLAR_EXIT_MIN_Y;
  }
  return link;
}

test('cellar blanks $F3 are solid; only stairs $6F and floor $24 walk', () => {
  const grid = composeCellarRoomTiles(0x3f);
  const walkable = new Set();
  for (const row of grid) {
    for (const tile of row) {
      if (tile < UW_FIRST_UNWALKABLE) walkable.add(tile);
    }
  }
  assert.deepEqual([...walkable].sort((a, b) => a - b), [
    CELLAR_FLOOR_TILE,
    CELLAR_STAIRS_TILE,
  ]);
  assert.equal(grid[0][0] >= UW_FIRST_UNWALKABLE, true, 'ceiling $F3 is solid');
});

test('cellar stairs: Link cannot walk the void at the top', () => {
  const grid = composeCellarRoomTiles(0x3f);
  const x = CELLAR_LADDER_XS[0];
  assert.equal(
    canLinkMove(grid, x, CELLAR_STAND_Y, DIR.LEFT, NO_ROOM_BOUNDS, CELLAR_WALK),
    false,
  );
  assert.equal(
    canLinkMove(grid, x, CELLAR_STAND_Y, DIR.RIGHT, NO_ROOM_BOUNDS, CELLAR_WALK),
    false,
  );
  assert.equal(
    canLinkMove(grid, x, CELLAR_STAND_Y, DIR.DOWN, NO_ROOM_BOUNDS, CELLAR_WALK),
    true,
  );
  const climbed = walkCellar(grid, x, CELLAR_STAND_Y, DIR.UP, 80);
  assert.ok(climbed.y < 0x40, `expected climb toward exit, Y=$${climbed.y.toString(16)}`);
  const sidestep = walkCellar(grid, climbed.x, climbed.y, DIR.LEFT, 40);
  assert.equal(sidestep.x, climbed.x, 'void beside the mouth must stay solid');
});

test('cellar $3E floor strip connects both ladders; $F3 above it does not', () => {
  const grid = composeCellarRoomTiles(0x3e);
  const left = CELLAR_LADDER_XS[0];
  const down = walkCellar(grid, left, CELLAR_STAND_Y, DIR.DOWN, 250);
  assert.equal(down.y, CELLAR_FLOOR_Y);
  const across = walkCellar(grid, down.x, down.y, DIR.RIGHT, 250);
  assert.ok(
    across.x >= CELLAR_LADDER_XS[1],
    `expected to reach the right ladder, X=$${across.x.toString(16)}`,
  );
  assert.equal(
    canLinkMove(grid, 0x80, CELLAR_FLOOR_Y, DIR.UP, NO_ROOM_BOUNDS, CELLAR_WALK),
    false,
    'blank $F3 above the floor lip is solid',
  );
  assert.equal(
    canLinkMove(grid, left, CELLAR_FLOOR_Y, DIR.UP, NO_ROOM_BOUNDS, CELLAR_WALK),
    true,
    'stairs from the floor stay open',
  );
});

test('cellar $3F treasure alcove is reached by inner stairs, not the void', () => {
  const grid = composeCellarRoomTiles(0x3f);
  const left = CELLAR_LADDER_XS[0];
  // Mid-ladder, the alcove is still walled off from the entrance shaft.
  assert.equal(
    canLinkMove(grid, left, 0x8d, DIR.RIGHT, NO_ROOM_BOUNDS, CELLAR_WALK),
    false,
  );
  const floor = walkCellar(grid, left, CELLAR_STAND_Y, DIR.DOWN, 250);
  const toInner = walkCellar(grid, CELLAR_INNER_STAIRS_X, floor.y, DIR.UP, 120);
  assert.ok(
    toInner.y <= 0x9d,
    `inner stairs should reach the alcove lip, Y=$${toInner.y.toString(16)}`,
  );
  assert.equal(
    canLinkMove(grid, 0xc0, 0x9d, DIR.LEFT, NO_ROOM_BOUNDS, CELLAR_WALK),
    true,
    'item lip $C0,$9D is floor',
  );
  assert.equal(
    canLinkMove(grid, 0xc0, 0x9d, DIR.UP, NO_ROOM_BOUNDS, CELLAR_WALK),
    false,
    'alcove $F3 above the lip is solid',
  );
});

test('cellar rooms spawn 4 blue keese at fixed positions', () => {
  const room = {
    roomId: 0x0f,
    layoutId: 0x3f,
    monster: { countIndex: 1, id: 0x28 },
    useMonsterGroups: false,
  };
  const list = spawnDungeonEnemies(room, { x: 0, y: 0 }, DIR.DOWN);
  assert.equal(list.length, 4);
  assert.ok(list.every((e) => e.objType === OBJ.BLUE_KEESE));
  assert.deepEqual(
    list.map((e) => e.x),
    cellarKeeseSpawns().map((s) => s.x),
  );
  assert.equal(CELLAR_KEESE_TYPE, OBJ.BLUE_KEESE);
});
