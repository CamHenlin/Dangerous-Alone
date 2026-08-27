import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { candleForRoom } from './candle.js';
import {
  WORLD_STATE_KEYS,
  caveWorldId,
  cellarWorldId,
  createWorld,
  createWorldRegistry,
  dungeonWorldId,
  isCellarWorldId,
  overworldWorldId,
  parseCellarWorldId,
} from './worldRegistry.js';

const at = (world) => ({ world });

test('a fresh world is empty and knows where it is', () => {
  const w = createWorld();
  assert.equal(w.id, 'overworld');
  assert.equal(w.mode, 'overworld');
  assert.deepEqual(w.enemies, []);
  assert.equal(w.spawnedRooms.size, 0);
});

test('every field the focus has to swap is on the record', () => {
  // A key listed but not built is a field that would leak between worlds.
  const w = createWorld();
  for (const key of WORLD_STATE_KEYS) {
    assert.equal(key in w, true, `${key} is missing from createWorld()`);
  }
});

test('main.js load/save swap every WORLD_STATE_KEY', () => {
  // The list is the contract; the two functions in main.js are the swap.
  // A key that exists in one and not the other leaks from cave to labyrinth.
  const mainPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../game/src/play/main.js',
  );
  const src = fs.readFileSync(mainPath, 'utf8');
  const load = src.match(/function loadWorldContext\(p\) \{([\s\S]*?)\n  function /)?.[1];
  const save = src.match(/function saveWorldContext\(p\) \{([\s\S]*?)\n  \/\*\*/)?.[1]
    ?? src.match(/function saveWorldContext\(p\) \{([\s\S]*?)\n  let /)?.[1];
  assert.ok(load, 'loadWorldContext() not found');
  assert.ok(save, 'saveWorldContext() not found');
  for (const key of WORLD_STATE_KEYS) {
    assert.match(load, new RegExp(`\\b${key}\\b`), `${key} is not loaded`);
    assert.match(save, new RegExp(`w\\.${key}\\s*=`), `${key} is not saved`);
  }
});

test('worlds of the same kind do not share their contents', () => {
  const a = createWorld({ id: dungeonWorldId(1) });
  const b = createWorld({ id: dungeonWorldId(2) });
  a.enemies.push({ kind: 'stalfos' });
  a.spawnedRooms.add(0x35);
  a.secretLatchRooms.add(0x35);
  a.shutterAnims.set('21:south', { roomId: 0x21, side: 'south' });
  a.roomItems.set(0x35, { itemType: 0x1a });
  candleForRoom(a.candleRoom, 0x01).lit = true;
  a.gambleAmounts = [10, 20, 50];
  assert.equal(b.enemies.length, 0);
  assert.equal(b.spawnedRooms.size, 0);
  assert.equal(b.secretLatchRooms.size, 0, 'a leftover clear latch leaked into the other labyrinth');
  assert.equal(b.shutterAnims.size, 0, 'a leftover shutter slide leaked into the other labyrinth');
  assert.equal(b.roomItems.size, 0, 'one labyrinth\'s floor item painted the other');
  assert.equal(
    candleForRoom(b.candleRoom, 0x01).lit,
    false,
    'a candle in one labyrinth lit the other',
  );
  assert.notEqual(a.candleRoom, b.candleRoom);
  assert.equal(b.gambleAmounts, null, 'a money-game roll leaked into the other place');
  a.flutePulse = 0x40;
  a.personDialogueForRoom = 0x73;
  a.personWareGfx.set('old-man', { visible: true });
  assert.equal(b.flutePulse, 0, 'a recorder pulse leaked into the other labyrinth');
  assert.equal(b.personDialogueForRoom, null, 'hearing one old man skipped the other');
  assert.equal(b.personWareGfx.size, 0, 'one labyrinth\'s pay-wares painted the other');
});

test('ids separate the overworld, each level and each cave', () => {
  const ids = new Set([
    overworldWorldId(),
    dungeonWorldId(1),
    dungeonWorldId(2),
    caveWorldId(3),
    cellarWorldId(1, 0x7f),
  ]);
  assert.equal(ids.size, 5);
  assert.equal(isCellarWorldId(cellarWorldId(1, 0x7f)), true);
  assert.equal(isCellarWorldId(dungeonWorldId(1)), false);
  assert.deepEqual(parseCellarWorldId(cellarWorldId(1, 0x7f)), {
    level: 1,
    cellarRoomId: 127,
  });
  assert.equal(parseCellarWorldId(dungeonWorldId(1)), null);
});

test('two players walking into one labyrinth land in the same world', () => {
  const worlds = createWorldRegistry();
  const first = worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  const second = worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  assert.equal(second, first, 'not a second copy of the same place');
  assert.equal(worlds.size, 1);
});

test('a world is built with the mode it was entered as', () => {
  const worlds = createWorldRegistry();
  const cave = worlds.enter(caveWorldId(7), { mode: 'cave' });
  assert.equal(cave.mode, 'cave');
  assert.equal(cave.id, 'cave:7', 'the id wins over anything passed in');
  assert.equal(cave.roomId, 0, 'cave worlds default roomId to 0; take-any flags must not use it');
});

test('the last player out takes the lights with them', () => {
  const worlds = createWorldRegistry();
  const ow = worlds.enter(overworldWorldId());
  const level = worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  const p1 = at(ow);
  const p2 = at(ow);

  p1.world = level;
  assert.deepEqual(worlds.prune([p1, p2]), [], 'p2 is still in the overworld');

  p2.world = level;
  assert.deepEqual(worlds.prune([p1, p2]), [ow], 'now nobody is');
  assert.equal(worlds.get(overworldWorldId()), null);
});

test('re-entering a discarded world builds a fresh one', () => {
  // This is what makes a solo player see respawned foes after a labyrinth.
  const worlds = createWorldRegistry();
  const ow = worlds.enter(overworldWorldId());
  ow.enemies.push({ kind: 'octorok' });
  const p = at(ow);

  p.world = worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  worlds.prune([p]);
  const returned = worlds.enter(overworldWorldId());

  assert.notEqual(returned, ow);
  assert.deepEqual(returned.enemies, [], 'the old octorok did not survive');
});

test('ids name the live worlds in entry order', () => {
  const worlds = createWorldRegistry();
  worlds.enter(overworldWorldId());
  worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  assert.deepEqual(worlds.ids(), ['overworld', 'dungeon:1']);
});

test('occupied groups players by the world they are standing in', () => {
  const worlds = createWorldRegistry();
  const ow = worlds.enter(overworldWorldId());
  const level = worlds.enter(dungeonWorldId(1), { mode: 'dungeon' });
  const p1 = at(ow);
  const p2 = at(level);
  const p3 = at(ow);

  const byWorld = worlds.occupied([p1, p2, p3]);
  assert.equal(byWorld.size, 2, 'one entry per place, not per player');
  assert.deepEqual(byWorld.get(ow), [p1, p3]);
  assert.deepEqual(byWorld.get(level), [p2]);
});

test('a player with nowhere to be is not a world', () => {
  const worlds = createWorldRegistry();
  assert.equal(worlds.occupied([{ world: null }]).size, 0);
});
