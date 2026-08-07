import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createInventory } from './inventory.js';
import {
  CLEAR_CONDITIONS,
  MARK_KIND,
  activeDungeonHintMarks,
  activeMapMarks,
  addHintMarks,
  caveScreens,
  dungeonHintMarkKey,
  floorItemRoomId,
  hintMarkKey,
  levelEntranceScreens,
  nextDungeonLevel,
  parseHintMarkKey,
  pruneHintMarks,
  resolveMark,
} from './mapMarks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ow = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets/extracted/overworld/overworld_index.json'), 'utf8'),
);
/** The lighter pack the game actually loads — flat attrs, not nested. */
const world = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets/extracted/play/world_index.json'), 'utf8'),
);

test('quest-1 level entrances come out of the extracted table', () => {
  const entrances = levelEntranceScreens(ow.screens, 1);
  assert.deepEqual(
    [...entrances.entries()].sort((a, b) => a[0] - b[0]),
    [
      [1, 0x37],
      [2, 0x3c],
      [3, 0x74],
      [4, 0x45],
      [5, 0x0b],
      [6, 0x22],
      [7, 0x42],
      [8, 0x6d],
      [9, 0x05],
    ],
  );
});

test('the play pack the game loads yields the same entrances', () => {
  // world_index.json keeps caveId / ignoreSecret flat on the entry rather than
  // under `attrs`. If a re-extract ever drops those flags, level 5 picks up
  // $1B (a quest-2-only screen) and the radar starts lying.
  assert.deepEqual(
    [...levelEntranceScreens(world.screens, 1).entries()],
    [...levelEntranceScreens(ow.screens, 1).entries()],
  );
});

test('screens the current quest never opens are skipped', () => {
  // $1B also carries cave id 5, but quest 1 ignores its secret.
  assert.deepEqual(caveScreens(ow.screens, 5, 1), [0x0b]);
  // The magical sword grave: $09 is quest-2 only, $21 is the quest-1 one.
  assert.deepEqual(caveScreens(ow.screens, 0x13, 1), [0x21]);
});

test('nextDungeonLevel walks the shards in order, then Death Mountain', () => {
  const inv = createInventory();
  assert.equal(nextDungeonLevel(inv), 1);
  inv.triforce = 0b0000_0001;
  assert.equal(nextDungeonLevel(inv), 2);
  inv.triforce = 0b0000_1011; // 1, 2, 4 — level 3 is still the gap
  assert.equal(nextDungeonLevel(inv), 3);
  inv.triforce = 0xff;
  assert.equal(nextDungeonLevel(inv), 9);
  inv.triforceOfPower = 1;
  assert.equal(nextDungeonLevel(inv), null);
});

test('resolveMark handles screen, caveId and level descriptors', () => {
  const ctx = { screens: ow.screens, quest: 1 };
  assert.deepEqual(
    resolveMark({ screen: 0x0d, clears: 'potionShopOpen', label: 'SHOP' }, ctx),
    [{ scope: 'overworld', roomId: 0x0d, clears: 'potionShopOpen', label: 'SHOP' }],
  );
  assert.deepEqual(
    resolveMark({ caveId: 0x12, clears: 'whiteSword' }, ctx).map((m) => m.roomId),
    [0x0a],
  );
  assert.deepEqual(resolveMark({ level: 7 }, ctx).map((m) => m.roomId), [0x42]);
  assert.deepEqual(resolveMark(null, ctx), []);
});

test('hint marks are placed once and skipped when already collected', () => {
  const inv = createInventory();
  const state = new Set();
  const ctx = { screens: ow.screens, quest: 1, inv };
  const marks = [{ caveId: 0x12, clears: 'whiteSword', label: 'WHITE SWORD' }];

  assert.equal(addHintMarks(state, marks, ctx).length, 1);
  assert.equal(addHintMarks(state, marks, ctx).length, 0, 'no duplicate');
  assert.ok(state.has(hintMarkKey(0x0a, 'whiteSword')));

  inv.sword = 2;
  const fresh = new Set();
  assert.equal(addHintMarks(fresh, marks, ctx).length, 0, 'stale before it is drawn');
});

test('collecting the item retires its hint mark', () => {
  const inv = createInventory();
  const state = new Set([hintMarkKey(0x0a, 'whiteSword'), hintMarkKey(0x21, 'magicSword')]);
  assert.equal(pruneHintMarks(state, inv), 0);
  inv.sword = 2;
  assert.equal(pruneHintMarks(state, inv), 1);
  assert.deepEqual([...state], [hintMarkKey(0x21, 'magicSword')]);
});

test('marks without a clear condition are permanent', () => {
  const inv = createInventory();
  inv.sword = 3;
  const state = new Set([hintMarkKey(0x40)]);
  assert.equal(pruneHintMarks(state, inv), 0);
});

test('activeMapMarks draws the next dungeon plus live hints', () => {
  const inv = createInventory();
  const hintMarks = new Set([hintMarkKey(0x0a, 'whiteSword')]);
  const marks = activeMapMarks({ inv, hintMarks, screens: ow.screens, quest: 1 });
  assert.deepEqual(marks, [
    { roomId: 0x0a, kind: MARK_KIND.HINT },
    { roomId: 0x37, kind: MARK_KIND.DUNGEON, level: 1 },
  ]);

  inv.sword = 2;
  const after = activeMapMarks({ inv, hintMarks, screens: ow.screens, quest: 1 });
  assert.deepEqual(after, [{ roomId: 0x37, kind: MARK_KIND.DUNGEON, level: 1 }]);
});

test('the dungeon mark wins when a hint sits on the same screen', () => {
  const inv = createInventory();
  const hintMarks = new Set([hintMarkKey(0x37, '')]);
  const marks = activeMapMarks({ inv, hintMarks, screens: ow.screens, quest: 1 });
  assert.deepEqual(marks, [{ roomId: 0x37, kind: MARK_KIND.DUNGEON, level: 1 }]);
});

test('hint mark keys round-trip', () => {
  assert.deepEqual(parseHintMarkKey(hintMarkKey(0x42, 'raft')), {
    scope: 'overworld',
    roomId: 0x42,
    clears: 'raft',
  });
  assert.deepEqual(parseHintMarkKey(hintMarkKey(0x42)), {
    scope: 'overworld',
    roomId: 0x42,
    clears: '',
  });
  assert.deepEqual(parseHintMarkKey(dungeonHintMarkKey(5, 0x04, 'recorder')), {
    scope: 'dungeon',
    level: 5,
    roomId: 0x04,
    clears: 'recorder',
  });
  assert.equal(parseHintMarkKey('nonsense'), null);
});

test('dungeon tip marks resolve from floor item type and stay off the OW radar', () => {
  const level5 = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets/extracted/dungeons/q1/level_5/level.json'), 'utf8'),
  );
  // Recorder sits in cellar $04; the minimap marks stairs room $05 instead.
  assert.equal(floorItemRoomId(level5, 0x05), 0x04);

  const inv = createInventory();
  const state = new Set();
  const ctx = {
    screens: ow.screens,
    quest: 1,
    inv,
    levelDataByLevel: new Map([[5, level5]]),
  };
  const added = addHintMarks(
    state,
    [{ dungeonLevel: 5, itemType: 0x05, clears: 'recorder', label: 'RECORDER' }],
    ctx,
  );
  assert.deepEqual(added, [
    { scope: 'dungeon', level: 5, roomId: 0x05, clears: 'recorder', label: 'RECORDER' },
  ]);
  assert.ok(state.has(dungeonHintMarkKey(5, 0x05, 'recorder')));

  // Underworld keys must not appear on the overworld radar.
  const owMarks = activeMapMarks({ inv, hintMarks: state, screens: ow.screens, quest: 1 });
  assert.ok(!owMarks.some((m) => m.roomId === 0x05 && m.kind === MARK_KIND.HINT));

  assert.deepEqual(activeDungeonHintMarks(state, 5, inv, level5), [
    { roomId: 0x05, kind: MARK_KIND.HINT, clears: 'recorder' },
  ]);
  assert.deepEqual(activeDungeonHintMarks(state, 1, inv, level5), []);

  // A stale cellar key (room $04) still paints on the stairs room.
  const stale = new Set([dungeonHintMarkKey(5, 0x04, 'recorder')]);
  assert.deepEqual(activeDungeonHintMarks(stale, 5, inv, level5), [
    { roomId: 0x05, kind: MARK_KIND.HINT, clears: 'recorder' },
  ]);

  inv.flute = 1;
  assert.deepEqual(activeDungeonHintMarks(state, 5, inv, level5), []);
  assert.equal(pruneHintMarks(state, inv), 1);
});

test('every clear condition reads a real inventory field', () => {
  const inv = createInventory();
  for (const [name, fn] of Object.entries(CLEAR_CONDITIONS)) {
    assert.equal(fn(inv), false, `${name} should be unmet on a fresh file`);
  }
  inv.sword = 3;
  inv.letter = 2;
  inv.bracelet = 1;
  inv.raft = 1;
  inv.ladder = 1;
  inv.flute = 1;
  inv.bow = 1;
  inv.candle = 2;
  inv.magicShield = 1;
  inv.ring = 2;
  for (const [name, fn] of Object.entries(CLEAR_CONDITIONS)) {
    assert.equal(fn(inv), true, `${name} should be met on a full file`);
  }
});
