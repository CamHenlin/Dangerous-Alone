import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT, UW_FIRST_UNWALKABLE } from './collision.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CELLAR_EXIT_MIN_Y,
  CELLAR_KEESE_TYPE,
  CELLAR_LADDER_XS,
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
  // Floor corridor uses square $03 (wall) flanking open $02.
  assert.equal(squares[0][0], 0x02);
  const grid = composeCellarRoomTiles(0x3f);
  assert.equal(grid.length, PLAY_ROWS);
  assert.equal(grid[0].length, PLAY_COLS);
  // Ladder open mouth tiles are $24.
  assert.equal(grid[0][6], 0x24);
  assert.equal(grid[0][7], 0x24);
  // Square $02 floor is normalized to walkable $24 (ROM CHR $F3).
  assert.equal(grid[0][0], 0x24);
  // Brick walls from square $03 stay $FA.
  assert.equal(grid[2][0], 0xfa);
});

test('composeDungeonRoomTiles routes cellars away from UW walls', () => {
  const room = { layoutId: 0x3f, doors: { north: { code: 0, type: 'open' } } };
  const grid = composeDungeonRoomTiles(room);
  // UW FillWalls would plant $E0 at (1,1); cellar layout does not.
  assert.notEqual(grid[1][1], 0xe0);
  assert.equal(grid[0][0], 0x24);
  assert.equal(grid[2][0], 0xfa);
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
