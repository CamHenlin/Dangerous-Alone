import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIR } from './collision.js';
import { placeBomb, stepBomb } from './bomb.js';
import {
  DOORWAY_CENTER_X,
  DOORWAY_CENTER_Y,
  checkDungeonRoomExit,
  clampUwDoorwayPos,
  createDoorState,
  doorPassable,
  doorwayLatchCleared,
  enteringRoomGridOffset,
  entrySideForFacing,
  inDoorway,
  linkInDoorwayCorridor,
  isDoorMarkedOpen,
  nearDoorway,
  openRoomShutters,
  tryBombDoors,
  tryUnlockKeyDoor,
} from './dungeonDoors.js';
import {
  UW_PRIMARY_SQUARES,
  buildDungeonPlayGrid,
  dungeonPlayOrigin,
  dungeonRoomSpawn,
  dungeonTileOpts,
} from './dungeonPlay.js';
import { finalizeLevelMeta } from './dungeons.js';
import {
  NO_ROOM_BOUNDS,
  UW_ROOM_BOUNDS,
  createLinkState,
  stepLink,
} from './linkMotion.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function keyRoom(roomId = 0x73) {
  return {
    roomId,
    doors: {
      north: { type: 'key' },
      south: { type: 'open' },
      west: { type: 'wall' },
      east: { type: 'open' },
    },
  };
}

test('open doors are always passable', () => {
  const state = createDoorState();
  assert.equal(doorPassable({ type: 'open' }, state, 0x73, 'east'), true);
  assert.equal(doorPassable({ type: 'wall' }, state, 0x73, 'west'), false);
  assert.equal(doorPassable({ type: 'key' }, state, 0x73, 'north'), false);
});

test('wall_or_pass false walls are walkable', () => {
  const state = createDoorState();
  assert.equal(doorPassable({ type: 'wall_or_pass' }, state, 0x46, 'east'), true);
});

test('magic key opens without consuming keys', () => {
  const state = createDoorState();
  const inv = { keys: 0, magicKey: 1 };
  assert.equal(tryUnlockKeyDoor({ type: 'key' }, state, 0x73, 'north', inv), true);
  assert.equal(inv.keys, 0);
  assert.equal(isDoorMarkedOpen(state, 0x73, 'north'), true);
});

test('key door consumes one key and opens both sides', () => {
  const state = createDoorState();
  const inv = { keys: 2 };
  assert.equal(tryUnlockKeyDoor({ type: 'key' }, state, 0x73, 'north', inv), true);
  assert.equal(inv.keys, 1);
  assert.equal(isDoorMarkedOpen(state, 0x73, 'north'), true);
  assert.equal(isDoorMarkedOpen(state, 0x63, 'south'), true);
  // Second visit is free.
  assert.equal(tryUnlockKeyDoor({ type: 'key' }, state, 0x73, 'north', inv), true);
  assert.equal(inv.keys, 1);
});

test('key door blocked without keys', () => {
  const state = createDoorState();
  assert.equal(tryUnlockKeyDoor({ type: 'key' }, state, 0x73, 'north', { keys: 0 }), false);
});

test('shutters open only after clear', () => {
  const state = createDoorState();
  const room = {
    roomId: 0x52,
    doors: {
      north: { type: 'key' },
      south: { type: 'wall' },
      west: { type: 'shutter' },
      east: { type: 'wall' },
    },
  };
  assert.equal(doorPassable(room.doors.west, state, room.roomId, 'west'), false);
  assert.deepEqual(openRoomShutters(state, room), ['west']);
  assert.equal(doorPassable(room.doors.west, state, room.roomId, 'west'), true);
});

test('bomb opens bombable wall pair', () => {
  const state = createDoorState();
  const room = {
    roomId: 0x53,
    doors: {
      north: { type: 'bombable' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'open' },
    },
  };
  const origin = { x: 32, y: 64 };
  const roomSize = { w: 192, h: 112 };
  const bomb = placeBomb(origin.x + roomSize.w / 2 - 8, origin.y + 8, DIR.UP);
  bomb.phase = 'explode';
  bomb.timer = 1;
  const opened = tryBombDoors(state, room, bomb, origin, roomSize);
  assert.deepEqual(opened, ['north']);
  assert.equal(isDoorMarkedOpen(state, 0x53, 'north'), true);
  assert.equal(isDoorMarkedOpen(state, 0x43, 'south'), true);
  void stepBomb;
});

test('checkDungeonRoomExit unlocks key door in north doorway', () => {
  const room = keyRoom(0x73);
  const state = createDoorState();
  const inv = { keys: 1 };
  const link = { x: DOORWAY_CENTER_X, y: 0x4d, dir: DIR.UP };
  const exit = checkDungeonRoomExit(link, room, {}, {}, { doorState: state, inv });
  assert.ok(exit);
  assert.equal(exit.nextRoomId, 0x63);
  assert.equal(exit.unlocked, true);
  assert.equal(inv.keys, 0);
});

test('room edge without doorway does not exit', () => {
  const room = keyRoom(0x73);
  room.doors.north = { type: 'open' };
  const link = { x: 40, y: 0x4d, dir: DIR.UP }; // wrong X (outside door opening)
  assert.equal(checkDungeonRoomExit(link, room, {}, {}, {}), null);
});

test('doorway axis slack allows neighboring walk lane', () => {
  const room = {
    roomId: 0x73,
    doors: {
      north: { type: 'wall' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'open' },
    },
  };
  // Statue-room walk lane ($95) beside exact NES center Y ($8D) still counts.
  const link = { x: 0x10, y: 0x95, dir: DIR.LEFT };
  assert.equal(inDoorway(link, 'west'), true);
  const exit = checkDungeonRoomExit(link, room, {}, {}, {
    rooms: [{ roomId: 0x72 }, { roomId: 0x73 }],
  });
  assert.ok(exit);
  assert.equal(exit.nextRoomId, 0x72);
});

test('west DoorwayDir does not cover floor statue columns (L4 $71)', () => {
  // NES west overflow is X<$21 with Y=$8D. The first face sits at X=$30.
  assert.equal(nearDoorway({ x: 0x10, y: DOORWAY_CENTER_Y }, 'west'), true);
  assert.equal(nearDoorway({ x: 0x20, y: DOORWAY_CENTER_Y }, 'west'), true);
  assert.equal(nearDoorway({ x: 0x21, y: DOORWAY_CENTER_Y }, 'west'), false);
  assert.equal(nearDoorway({ x: 0x30, y: DOORWAY_CENTER_Y }, 'west'), false);
  // Adjacent walk rows ($95/$9D) engage DoorwayDir inside the cavity only.
  assert.equal(nearDoorway({ x: 0x10, y: 0x95 }, 'west'), true);
  assert.equal(nearDoorway({ x: 0x10, y: 0x9d }, 'west'), true);
  // Far off-axis still blocked; depth still excludes statue columns at any Y.
  assert.equal(nearDoorway({ x: 0x10, y: 0xad }, 'west'), false);
  assert.equal(nearDoorway({ x: 0x30, y: 0x9d }, 'west'), false);
  const room = {
    roomId: 0x71,
    doors: {
      north: { type: 'open' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'wall' },
    },
  };
  assert.equal(linkInDoorwayCorridor({ x: 0x30, y: DOORWAY_CENTER_Y }, room), false);
  assert.equal(linkInDoorwayCorridor({ x: 0x10, y: DOORWAY_CENTER_Y }, room), true);
});

test('south DoorwayDir clears once Link leaves the south corridor (L3 $4A)', () => {
  // Still in south overflow → DoorwayDir stays (tile collision skip).
  assert.equal(nearDoorway({ x: 0x78, y: 0xd0 }, 'south'), true);
  assert.equal(doorwayLatchCleared({ x: 0x78, y: 0xd0 }, 'south'), false);
  // Deep in room / past overflow → cleared (no deep-room exit latch).
  assert.equal(doorwayLatchCleared({ x: 0x78, y: 0xa8 }, 'south'), true);
  const room = {
    roomId: 0x4a,
    doors: {
      north: { type: 'wall' },
      south: { type: 'open' },
      west: { type: 'key' },
      east: { type: 'open' },
    },
  };
  // Facing out in the cavity may exit even while DoorwayDir is still set —
  // NES gates leave with facing + gridOffset, not a side hard-block.
  const atSouth = { x: DOORWAY_CENTER_X, y: 0xd8, dir: DIR.DOWN, gridOffset: 0 };
  assert.ok(checkDungeonRoomExit(atSouth, room, {}, {}, {}));
});

test('entry walk blocks exit until gridOffset clears; turnaround re-exits', () => {
  const room = {
    roomId: 0x72,
    doors: {
      north: { type: 'wall' },
      south: { type: 'wall' },
      west: { type: 'wall' },
      east: { type: 'open' },
    },
  };
  const spawn = dungeonRoomSpawn(null, null, DIR.LEFT); // entered from east of $73
  assert.equal(spawn.x, 0xe8);
  assert.equal(spawn.y, DOORWAY_CENTER_Y);
  assert.equal(entrySideForFacing(spawn.dir), 'east');
  assert.equal(inDoorway(spawn, 'east'), true);
  assert.equal(enteringRoomGridOffset(spawn.dir), -1);

  // Mid entry-walk (NES CheckScreenEdge): cannot leave yet.
  const walkingIn = { ...spawn, gridOffset: enteringRoomGridOffset(spawn.dir) };
  assert.equal(checkDungeonRoomExit(walkingIn, room, {}, {}, {}), null);

  // After stride: still in the east frame, facing out → leave immediately.
  const turnAround = { x: 0xe8, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT, gridOffset: 0 };
  assert.equal(inDoorway(turnAround, 'east'), true);
  const exit = checkDungeonRoomExit(turnAround, room, {}, {}, {});
  assert.ok(exit);
  assert.equal(exit.nextRoomId, 0x73);
  assert.equal(exit.side, 'east');

  // Floor lip / inner door face ($D0–$E7) must not exit; need the $24 cavity ($E8+).
  const atLip = { x: 0xe0, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT, gridOffset: 0 };
  assert.equal(inDoorway(atLip, 'east'), false);
  assert.equal(checkDungeonRoomExit(atLip, room, {}, {}, {}), null);
});

test('floor-lip positions do not count as exits', () => {
  const room = {
    roomId: 0x73,
    doors: {
      north: { type: 'open' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'open' },
    },
  };
  const rooms = [0x72, 0x73, 0x74, 0x63, 0x83].map((roomId) => ({ roomId }));
  assert.equal(
    checkDungeonRoomExit({ x: 0x20, y: DOORWAY_CENTER_Y, dir: DIR.LEFT }, room, {}, {}, { rooms }),
    null,
  );
  assert.equal(
    checkDungeonRoomExit({ x: 0xcf, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT }, room, {}, {}, { rooms }),
    null,
  );
  assert.ok(
    checkDungeonRoomExit({ x: 0x08, y: DOORWAY_CENTER_Y, dir: DIR.LEFT }, room, {}, {}, { rooms }),
  );
  assert.ok(
    checkDungeonRoomExit({ x: 0xe8, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT }, room, {}, {}, { rooms }),
  );
});

test('dungeonRoomSpawn places Link in door frames', () => {
  assert.deepEqual(dungeonRoomSpawn(null, null, DIR.RIGHT), {
    x: 0x10,
    y: DOORWAY_CENTER_Y,
    dir: DIR.RIGHT,
  });
  assert.deepEqual(dungeonRoomSpawn(null, null, DIR.LEFT), {
    x: 0xe8,
    y: DOORWAY_CENTER_Y,
    dir: DIR.LEFT,
  });
  assert.deepEqual(dungeonRoomSpawn(null, null, DIR.DOWN), {
    x: DOORWAY_CENTER_X,
    y: 0x4d,
    dir: DIR.DOWN,
  });
  assert.deepEqual(dungeonRoomSpawn(null, null, DIR.UP), {
    x: DOORWAY_CENTER_X,
    y: 0xd8,
    dir: DIR.UP,
  });
  for (const dir of [DIR.RIGHT, DIR.LEFT, DIR.DOWN, DIR.UP]) {
    const spawn = dungeonRoomSpawn(null, null, dir);
    const side = entrySideForFacing(spawn.dir);
    assert.equal(inDoorway(spawn, side), true, `spawn facing ${dir} in ${side}`);
  }
});

test('linkInDoorwayCorridor covers spawn and key-door approach', () => {
  const room = keyRoom(0x73);
  const spawn = dungeonRoomSpawn(null, null, DIR.UP);
  assert.equal(
    linkInDoorwayCorridor(spawn, room, { doorwayBlockSide: 'south' }),
    true,
  );
  // Floor tile just inside north key door — approach slack.
  const approach = { x: DOORWAY_CENTER_X, y: 0x5d, dir: DIR.UP };
  assert.equal(linkInDoorwayCorridor(approach, room, {}), true);
});

test('north DoorwayDir accepts walk columns $70/$80', () => {
  assert.equal(nearDoorway({ x: 0x78, y: 0x5d }, 'north'), true);
  assert.equal(nearDoorway({ x: 0x70, y: 0x5d }, 'north'), true);
  assert.equal(nearDoorway({ x: 0x80, y: 0x5d }, 'north'), true);
  assert.equal(nearDoorway({ x: 0x68, y: 0x5d }, 'north'), false);
  assert.equal(nearDoorway({ x: 0x70, y: 0x6d }, 'north'), false, 'floor row is not overflow');
});

test('L1 $52: north key door exits from walk column $70', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_1/level.json');
  if (!existsSync(path)) return;
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x52);
  assert.ok(room);
  assert.equal(room.doors.north.type, 'key');
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {});
  const opts = dungeonTileOpts();
  const open = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const inv = { keys: 1 };
  const state = createDoorState();
  const link = createLinkState(0x70, 0x6d, DIR.UP);
  let exit = null;
  for (let i = 0; i < 64; i += 1) {
    const inDoor = linkInDoorwayCorridor(link, room, {});
    if (inDoor) {
      stepLink(link, open, DIR.UP, undefined, NO_ROOM_BOUNDS);
      clampUwDoorwayPos(link);
    } else {
      stepLink(link, grid, DIR.UP, undefined, UW_ROOM_BOUNDS, opts);
    }
    exit = checkDungeonRoomExit(link, room, {}, {}, {
      doorState: state,
      inv,
      rooms: level.rooms,
    });
    if (exit) break;
  }
  assert.ok(exit, `expected north exit from X=$70, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`);
  assert.equal(exit.side, 'north');
  assert.equal(exit.nextRoomId, 0x42);
});

test('L1 $53: west exit works from the $9D walk row (not only NES $8D)', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_1/level.json');
  if (!existsSync(path)) return;
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) => r.roomId === 0x53);
  assert.ok(room);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {});
  const opts = dungeonTileOpts();
  const open = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const link = createLinkState(0x30, 0x9d, DIR.LEFT);
  let exit = null;
  for (let i = 0; i < 48; i += 1) {
    const inDoor = linkInDoorwayCorridor(link, room, {});
    if (inDoor) {
      stepLink(link, open, DIR.LEFT, undefined, NO_ROOM_BOUNDS);
      clampUwDoorwayPos(link);
    } else {
      stepLink(link, grid, DIR.LEFT, undefined, UW_ROOM_BOUNDS, opts);
    }
    exit = checkDungeonRoomExit(link, room, {}, {}, {
      doorState: createDoorState(),
      rooms: level.rooms,
    });
    if (exit) break;
  }
  assert.ok(exit, `expected west exit from Y=$9D, stopped at $${link.x.toString(16)},$${link.y.toString(16)}`);
  assert.equal(exit.side, 'west');
  assert.equal(exit.nextRoomId, 0x52);
});
