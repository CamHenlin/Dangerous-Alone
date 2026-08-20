import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPartySnapshot, snapshotParty } from './partySave.js';
import { createInventory } from './inventory.js';
import { createInventoryView, createPlayer } from './player.js';

function hero(index, { x = 0, y = 0, hh = 6, max = 6 } = {}) {
  const inv = createInventoryView(createInventory());
  inv.halfHearts = hh;
  inv.maxHalfHearts = max;
  return createPlayer({
    index,
    link: { x, y, dir: 4 },
    sword: {},
    inv,
    world: { id: 'overworld' },
  });
}

test('a party snapshot remembers each hero\'s glass and pose', () => {
  const a = hero(0, { x: 10, y: 20, hh: 4, max: 8 });
  const b = hero(1, { x: 30, y: 40, hh: 6, max: 8 });
  b.active = false;
  const snap = snapshotParty([a, b]);
  assert.equal(snap.length, 1);
  assert.equal(snap[0].halfHearts, 4);
  assert.equal(snap[0].x, 10);
  assert.equal(snap[0].worldId, 'overworld');
});

test('a snapshot names the cave or cellar a hero is standing in', () => {
  const a = hero(0, { x: 10, y: 20 });
  const b = hero(1, { x: 30, y: 40 });
  a.world = { id: 'cave:29' };
  b.world = { id: 'cellar:1:127' };
  const snap = snapshotParty([a, b]);
  assert.equal(snap[0].worldId, 'cave:29');
  assert.equal(snap[1].worldId, 'cellar:1:127');
});

test('loading writes onto the seats that are already filled', () => {
  const a = hero(0, { hh: 6, max: 6, x: 0, y: 0 });
  const b = hero(1, { hh: 6, max: 6, x: 0, y: 0 });
  applyPartySnapshot([a, b], [
    { index: 0, halfHearts: 2, maxHalfHearts: 10, x: 8, y: 9, dir: 1 },
    { index: 1, halfHearts: 8, maxHalfHearts: 10, x: 11, y: 12, dir: 4 },
  ]);
  assert.equal(a.inv.halfHearts, 2);
  assert.equal(a.inv.maxHalfHearts, 10);
  assert.equal(a.link.x, 8);
  assert.equal(b.inv.halfHearts, 8);
  assert.equal(b.link.y, 12);
});

test('a continue can keep player one where the world restore put them', () => {
  const a = hero(0, { x: 40, y: 50, hh: 6 });
  applyPartySnapshot(
    [a],
    [{ index: 0, halfHearts: 2, x: 1, y: 2, dir: 8 }],
    { skipPose: [0] },
  );
  assert.equal(a.inv.halfHearts, 2);
  assert.equal(a.link.x, 40);
  assert.equal(a.link.y, 50);
});
