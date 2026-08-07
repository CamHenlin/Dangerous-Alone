import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOE_COUNTS_L1,
  FOE_COUNTS_OW,
  decodeSpawnByte,
  resolveObjTypes,
  resolveSpawns,
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
