import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOE_COUNTS_L1,
  FOE_COUNTS_OW,
  MONSTER_SLOT_COUNT,
  STREAM_ROOM_CAP,
  decodeSpawnByte,
  monstersInRoom,
  resolveObjTypes,
  resolveSpawns,
  tryAddMonsterToRoom,
} from './spawn.js';

test('OW FoeCounts match LevelInfoOW', () => {
  assert.deepEqual([...FOE_COUNTS_OW], [1, 4, 5, 6]);
});

test('screen $78 resolves to 4 red slow octoroks', () => {
  const types = resolveObjTypes({
    monsterId: 7,
    countIndex: 1,
    foeCounts: FOE_COUNTS_OW,
  });
  assert.deepEqual(types, [7, 7, 7, 7]);
});

test('Level 1 room $72 resolves to 3 blue keese', () => {
  const types = resolveObjTypes({
    monsterId: 0x1b,
    countIndex: 0,
    foeCounts: FOE_COUNTS_L1,
  });
  assert.deepEqual(types, [0x1b, 0x1b, 0x1b]);
});

test('Aquamentus forces count 1', () => {
  const types = resolveObjTypes({
    monsterId: 0x3d,
    countIndex: 3,
    foeCounts: FOE_COUNTS_L1,
  });
  assert.deepEqual(types, [0x3d]);
});

test('decodeSpawnByte matches AssignObjSpawnPositions', () => {
  assert.deepEqual(decodeSpawnByte(0x55), { x: 0x50, y: 0x5d });
  assert.deepEqual(decodeSpawnByte(0x8d), { x: 0xd0, y: 0x8d });
});

test('resolveSpawns attaches positions', () => {
  const spawns = resolveSpawns(
    { monsterId: 7, monsterCountIndex: 1, useMonsterGroups: false },
    { foeCounts: FOE_COUNTS_OW, linkDir: 0x08 },
  );
  assert.equal(spawns.length, 4);
  assert.equal(spawns[0].objType, 7);
  assert.ok(spawns[0].y & 0x0d);
});

test('empty monster id yields no spawns', () => {
  assert.deepEqual(resolveObjTypes({ monsterId: 0, countIndex: 1 }), []);
});

test('monsterEntry marks edge-pending spawns', () => {
  const spawns = resolveSpawns(
    { monsterId: 7, monsterCountIndex: 1, monsterEntry: true },
    { foeCounts: FOE_COUNTS_OW, allowEdgeSpawn: true },
  );
  assert.equal(spawns.length, 4);
  assert.ok(spawns.every((s) => s.edgePending));
});

test('tryAddMonsterToRoom budgets slots per room, not globally', () => {
  /** @type {{ homeRoomId: number }[]} */
  const enemies = [];
  // Fill room $45 to the NES table size.
  for (let i = 0; i < MONSTER_SLOT_COUNT; i += 1) {
    assert.equal(tryAddMonsterToRoom(enemies, { homeRoomId: 0x45 }, 0x45), true);
  }
  assert.equal(tryAddMonsterToRoom(enemies, { homeRoomId: 0x45 }, 0x45), false);
  // A streamed neighbour still gets its own wave — under the old flat cap the
  // room Link stood in could spawn nothing at all.
  assert.equal(tryAddMonsterToRoom(enemies, { homeRoomId: 0x46 }, 0x46), true);
  assert.equal(monstersInRoom(enemies, 0x45), MONSTER_SLOT_COUNT);
  assert.equal(monstersInRoom(enemies, 0x46), 1);
});

test('tryAddMonsterToRoom still honours a global ceiling', () => {
  /** @type {{ homeRoomId: number }[]} */
  const enemies = [];
  let room = 0;
  while (tryAddMonsterToRoom(enemies, { homeRoomId: room }, room)) {
    room += 1;
  }
  assert.equal(enemies.length, STREAM_ROOM_CAP);
});

test('dead foes do not hold a room slot', () => {
  const enemies = [];
  for (let i = 0; i < MONSTER_SLOT_COUNT; i += 1) {
    enemies.push({ homeRoomId: 0x45, alive: i > 0 });
  }
  // The corpse lingers until the room leaves the camera; its slot is free.
  assert.equal(monstersInRoom(enemies, 0x45), MONSTER_SLOT_COUNT - 1);
  assert.equal(tryAddMonsterToRoom(enemies, { homeRoomId: 0x45, alive: true }, 0x45), true);
});
