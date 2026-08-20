import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allActiveDead,
  deathOutcome,
  labyrinthForCellarAlly,
  livingPlayers,
  respawnAlly,
  respawnBeside,
  shouldFollowAllyWorld,
  targetableLinks,
  tryAutoRevive,
} from './coopDeath.js';
import { createInventory } from './inventory.js';
import { createInventoryView, createPlayer } from './player.js';
import { CONTINUE_HALF_HEARTS } from './continueMenu.js';

function hero(index, { dead = false, potion = 0, x = 0, y = 0 } = {}) {
  const shared = createInventory();
  shared.potion = potion;
  const inv = createInventoryView(shared);
  inv.dead = dead;
  inv.halfHearts = dead ? 0 : 6;
  return createPlayer({
    index,
    link: { x, y, dir: 4, posFrac: 0, gridOffset: 0, moving: false },
    sword: {},
    inv,
  });
}

test('the living are the ones still on their feet', () => {
  const a = hero(0);
  const b = hero(1, { dead: true });
  assert.deepEqual(livingPlayers([a, b]).map((p) => p.index), [0]);
  assert.equal(allActiveDead([a, b]), false);
  assert.equal(allActiveDead([hero(0, { dead: true }), b]), true);
});

test('a potion in the bag stands you back up and is gone', () => {
  const p = hero(0, { dead: true, potion: 1 });
  assert.equal(tryAutoRevive(p.inv), true);
  assert.equal(p.inv.dead, false);
  assert.equal(p.inv.potion, 0);
  assert.ok(p.inv.halfHearts > 0);
});

test('a potion fills only the downed hero', () => {
  const shared = createInventory();
  shared.potion = 1;
  const a = createPlayer({
    index: 0,
    link: { x: 0, y: 0, dir: 4 },
    sword: {},
    inv: createInventoryView(shared),
  });
  const b = createPlayer({
    index: 1,
    link: { x: 80, y: 90, dir: 4 },
    sword: {},
    inv: createInventoryView(shared),
  });
  a.inv.dead = true;
  a.inv.halfHearts = 0;
  b.inv.halfHearts = 2;
  assert.equal(tryAutoRevive(a.inv), true);
  assert.equal(a.inv.dead, false);
  assert.equal(a.inv.halfHearts, a.inv.maxHalfHearts);
  assert.equal(b.inv.halfHearts, 2, 'the bottle is not a party heal');
  assert.equal(shared.potion, 0);
});

test('no bottle means the death stands', () => {
  const p = hero(0, { dead: true, potion: 0 });
  assert.equal(tryAutoRevive(p.inv), false);
  assert.equal(p.inv.dead, true);
});

test('someone else standing means you regroup, not game over', () => {
  const a = hero(0, { dead: true, x: 10, y: 10 });
  const b = hero(1, { x: 80, y: 90 });
  assert.equal(deathOutcome([a, b], a), 'respawn');
  assert.equal(respawnAlly([a, b], a), b);
  respawnBeside(a, b);
  assert.equal(a.inv.dead, false);
  assert.equal(a.inv.halfHearts, CONTINUE_HALF_HEARTS);
  assert.equal(a.link.x, 80);
  assert.equal(a.link.y, 90);
});

test('dying upstairs does not follow an ally into a cellar', () => {
  const cellar = { id: 'cellar:1:127', mode: 'dungeon' };
  const dungeon = { id: 'dungeon:1', mode: 'dungeon' };
  const a = hero(0);
  const b = hero(1);
  a.world = dungeon;
  b.world = cellar;
  assert.equal(shouldFollowAllyWorld(a, b), false);
  assert.equal(labyrinthForCellarAlly(b), 'dungeon:1');
});

test('regrouping copies the ally cell latch, not just their tile', () => {
  const a = hero(0, { x: 0xc0, y: 0x8d });
  const b = hero(1, { x: -0x80, y: 0x8d });
  a.uwOccRoomId = 0x74;
  b.uwOccRoomId = 0x73;
  b.uwDoorwayBlockSide = 'west';
  respawnBeside(a, b);
  assert.equal(a.link.x, -0x80);
  assert.equal(a.uwOccRoomId, 0x73);
  assert.equal(a.uwDoorwayBlockSide, 'west');
});

test('dying in the same cellar still regroups there', () => {
  const cellar = { id: 'cellar:1:127', mode: 'dungeon' };
  const a = hero(0);
  const b = hero(1);
  a.world = cellar;
  b.world = cellar;
  assert.equal(shouldFollowAllyWorld(a, b), false);
});

test('dying in a cellar follows the ally back into the labyrinth', () => {
  const cellar = { id: 'cellar:1:127', mode: 'dungeon' };
  const dungeon = { id: 'dungeon:1', mode: 'dungeon' };
  const a = hero(0);
  const b = hero(1);
  a.world = cellar;
  b.world = dungeon;
  assert.equal(shouldFollowAllyWorld(a, b), true);
});

test('the last one down opens the continue menu', () => {
  const a = hero(0, { dead: true });
  const b = hero(1, { dead: true });
  assert.equal(deathOutcome([a, b], a), 'continueMenu');
  assert.equal(respawnAlly([a, b], a), null);
});

test('foes chase the living, and everyone if nobody is', () => {
  const a = hero(0, { x: 1 });
  const b = hero(1, { dead: true, x: 2 });
  assert.deepEqual(targetableLinks([a, b]).map((l) => l.x), [1]);
  a.inv.dead = true;
  assert.deepEqual(targetableLinks([a, b]).map((l) => l.x), [1, 2]);
});

test('foes in one place do not chase a hero in another', () => {
  const ow = { id: 'overworld' };
  const uw = { id: 'dungeon:1' };
  const inside = hero(0, { x: 0x78, y: 0x4d });
  inside.world = uw;
  const outside = hero(1, { x: 0xd0, y: 0x8d });
  outside.world = ow;
  assert.deepEqual(targetableLinks([inside, outside], ow).map((l) => l.x), [0xd0]);
  assert.deepEqual(targetableLinks([inside, outside], uw).map((l) => l.x), [0x78]);
  assert.deepEqual(targetableLinks([inside, outside]).map((l) => l.x), [0x78, 0xd0]);
});
