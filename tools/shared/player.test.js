import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { DROP_ITEM, grantDroppedItem } from './enemyDrops.js';
import { createInventory } from './inventory.js';
import { createLinkState } from './linkMotion.js';
import {
  PER_PLAYER_INVENTORY_KEYS,
  activeLinks,
  activePlayers,
  createInventoryView,
  createPlayer,
  sharedInventoryKeys,
} from './player.js';
import { applyInventorySnapshot, snapshotInventory } from './save.js';
import { createSwordState } from './sword.js';

const hero = (index = 0, active = true) =>
  createPlayer({
    index,
    active,
    link: createLinkState(0x80, 0x8d, DIR.UP),
    sword: createSwordState(),
  });

test('a player holds the very objects it was given', () => {
  const link = createLinkState(0x80, 0x8d, DIR.UP);
  const sword = createSwordState();
  const p = createPlayer({ link, sword });
  // The whole migration rests on this: `players[0].link === link`, so the
  // ~1300 existing references keep working while the structure goes in.
  assert.equal(p.link, link);
  assert.equal(p.sword, sword);
  assert.equal(p.index, 0);
  assert.equal(p.active, true);
  assert.equal(p.caveExitLatch, false);
  assert.equal(p.caveInteractLatch, false);
  assert.equal(p.raftRide.active, false);
});

test('activePlayers skips the ones who have not joined', () => {
  const players = [hero(0), hero(1, false), hero(2)];
  assert.deepEqual(
    activePlayers(players).map((p) => p.index),
    [0, 2],
  );
});

test('activeLinks hands back live records in player order', () => {
  const players = [hero(0), hero(1, false), hero(2)];
  const links = activeLinks(players);
  assert.equal(links.length, 2);
  assert.equal(links[0], players[0].link, 'live, not a copy');
  assert.equal(links[1], players[2].link);
});

test('two players do not share a raft ride', () => {
  const a = hero(0);
  const b = hero(1);
  a.raftRide.active = true;
  assert.equal(b.raftRide.active, false, 'boarding must not freeze the ally');
});

test('an empty roster is not an error', () => {
  assert.deepEqual(activePlayers([]), []);
  assert.deepEqual(activeLinks([]), []);
  assert.deepEqual(activePlayers(null), []);
});

test('every per-player key is really in the inventory today', () => {
  // Guards against the list rotting: a renamed field would silently drop out
  // of the split and quietly become shared.
  const inv = createInventory();
  for (const key of PER_PLAYER_INVENTORY_KEYS) {
    assert.ok(key in inv, `${key} is missing from createInventory()`);
  }
});

test('the split covers the inventory exactly once', () => {
  const inv = createInventory();
  const shared = sharedInventoryKeys(inv);
  const perPlayer = new Set(PER_PLAYER_INVENTORY_KEYS);
  assert.equal(shared.length + perPlayer.size, Object.keys(inv).length);
  for (const key of shared) assert.equal(perPlayer.has(key), false);
});

test('the bag, the purse and the clock are shared', () => {
  const shared = new Set(sharedInventoryKeys(createInventory()));
  for (const key of ['rupees', 'keys', 'bombs', 'sword', 'triforce', 'quest', 'clock']) {
    assert.ok(shared.has(key), `${key} should be shared`);
  }
});

test('hearts, knockback, death and the B slot are not', () => {
  const shared = new Set(sharedInventoryKeys(createInventory()));
  for (const key of ['halfHearts', 'shovePixels', 'dead', 'selectedB', 'invuln']) {
    assert.equal(shared.has(key), false, `${key} should be per-player`);
  }
});

// --- The inventory view ---------------------------------------------------

test('a lone view behaves exactly like a plain inventory', () => {
  const fresh = createInventory();
  const view = createInventoryView(createInventory());
  for (const key of Object.keys(fresh)) {
    assert.deepEqual(view[key], fresh[key], key);
  }
});

test('spending through a view ratchets the shared ceiling', () => {
  const shared = createInventory();
  shared.rupeeCapFloor = 255;
  shared.rupeeCap = 400;
  shared.rupees = 400;
  const view = createInventoryView(shared);
  view.rupees -= 50;
  assert.equal(shared.rupees, 350);
  assert.equal(shared.rupeeCap, 350);
  view.rupees -= 200;
  assert.equal(shared.rupeeCap, 255, 'the floor holds once the pile is under it');
});

test('two players share the purse', () => {
  const shared = createInventory();
  const p1 = createInventoryView(shared);
  const p2 = createInventoryView(shared);

  p1.rupees += 30;
  assert.equal(p2.rupees, 30, 'a rupee taken by one is taken by all');
  p2.keys += 1;
  assert.equal(p1.keys, 1);
  p2.bombs = 4;
  assert.equal(p1.bombs, 4);
  p1.sword = 2;
  assert.equal(p2.sword, 2, 'the sword upgrade is the group\'s');
});

test('two players do not share hearts', () => {
  const shared = createInventory();
  const p1 = createInventoryView(shared);
  const p2 = createInventoryView(shared);

  p1.halfHearts -= 3;
  assert.equal(p1.halfHearts, 3);
  assert.equal(p2.halfHearts, 6, 'taking a hit is personal');

  p1.dead = true;
  assert.equal(p2.dead, false, 'one player dying does not kill the party');

  p1.selectedB = 'bomb';
  p2.selectedB = 'boomerang';
  assert.equal(p1.selectedB, 'bomb', 'one bag, four loadouts');

  p1.invuln = 48;
  assert.equal(p2.invuln, 0);
});

test('the group inventory stops carrying per-player fields', () => {
  const shared = createInventory();
  createInventoryView(shared);
  for (const key of PER_PLAYER_INVENTORY_KEYS) {
    assert.equal(key in shared, false, `${key} should have moved off the group bag`);
  }
});

test('a view enumerates and serialises like the real thing', () => {
  // save.js walks keys off the inventory, so the view has to look like one.
  const view = createInventoryView(createInventory());
  view.rupees = 42;
  view.halfHearts = 2;
  const keys = Object.keys(view);
  assert.equal(keys.length, Object.keys(createInventory()).length);
  const round = JSON.parse(JSON.stringify(view));
  assert.equal(round.rupees, 42);
  assert.equal(round.halfHearts, 2);
});

test('a bulk reset writes through to both halves', () => {
  // main.js resets a game with Object.assign(inv, createInventory()).
  const shared = createInventory();
  const view = createInventoryView(shared);
  view.rupees = 99;
  view.halfHearts = 1;
  Object.assign(view, createInventory());
  assert.equal(view.rupees, 0);
  assert.equal(view.halfHearts, 6);
  assert.equal(shared.rupees, 0, 'the shared half really moved');
});

test('a view survives a save round-trip', () => {
  const shared = createInventory();
  const view = createInventoryView(shared);
  view.rupees = 55;
  view.bombs = 4;
  view.halfHearts = 3;
  view.maxHalfHearts = 10;
  view.invuln = 40;

  const snap = snapshotInventory(view);
  const reloaded = createInventoryView(createInventory());
  applyInventorySnapshot(reloaded, snap);

  assert.equal(reloaded.rupees, 55, 'shared half persisted');
  assert.equal(reloaded.bombs, 4);
  assert.equal(reloaded.halfHearts, 3, 'per-player half persisted');
  assert.equal(reloaded.maxHalfHearts, 10);
  assert.equal(reloaded.invuln, 0, 'you do not resume mid-flicker');
});

test('a player carries its own view', () => {
  const shared = createInventory();
  const p = createPlayer({
    index: 1,
    link: createLinkState(0, 0, DIR.UP),
    sword: createSwordState(),
    inv: createInventoryView(shared),
  });
  p.inv.rupees = 7;
  assert.equal(shared.rupees, 7);
});

test('a heart heals only the hero who picked it up', () => {
  const shared = createInventory();
  const p1 = createInventoryView(shared);
  const p2 = createInventoryView(shared);
  p1.maxHalfHearts = 16;
  p1.halfHearts = 4;
  p2.maxHalfHearts = 16;
  p2.halfHearts = 4;
  grantDroppedItem(p2, DROP_ITEM.HEART);
  assert.equal(p2.halfHearts, 6, 'the picker should gain a heart');
  assert.equal(p1.halfHearts, 4, 'the ally should keep their own glass');
  assert.equal(shared.rupees, 0);
});
