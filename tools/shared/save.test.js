import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory, SWORD } from './inventory.js';
import {
  SAVE_VERSION,
  applyInventorySnapshot,
  applyLoadedSave,
  createSaveStore,
  hydrateDungeonProgress,
  resolveZeroHeartContinue,
  serializeDungeonProgress,
  serializeGameState,
  snapshotInventory,
  slotSummary,
} from './save.js';

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test('snapshotInventory skips ephemeral combat fields', () => {
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  inv.invuln = 40;
  inv.dead = true;
  const snap = snapshotInventory(inv);
  assert.equal(snap.sword, SWORD.WOOD);
  assert.equal('invuln' in snap, false);
  assert.equal('dead' in snap, false);
});

test('serialize / hydrate dungeon progress round-trips', () => {
  const progress = new Map([
    [
      1,
      {
        cleared: new Set([0x73, 0x63]),
        taken: new Set([0x7f]),
        visited: new Set([0x73]),
        pushed: new Set(),
        doors: new Set(['0x73:north']),
        map: 1,
        compass: 1,
      },
    ],
  ]);
  const json = serializeDungeonProgress(progress);
  const back = hydrateDungeonProgress(json);
  assert.equal(back.get('1:1').map, 1);
  assert.ok(back.get('1:1').cleared.has(0x73));
  assert.ok(back.get('1:1').doors.has('0x73:north'));
});

test('createSaveStore persists three slots', () => {
  const store = createSaveStore(memoryStorage());
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  inv.triforce = 0x03;
  store.save(0, {
    name: 'link',
    inv,
    mode: 'overworld',
    roomId: 0x77,
    x: 0x40,
    y: 0x8d,
    dir: 1,
    owSecretsRevealed: new Set(['77:5:6']),
    caveTaken: new Set(['10:0']),
    dungeonProgress: new Map(),
  });
  const slots = store.listSlots();
  assert.equal(slots[0].name, 'LINK');
  assert.equal(slots[0].triforce, 2);
  assert.equal(slots[1], null);

  const loaded = store.load(0);
  assert.equal(loaded.version, SAVE_VERSION);
  const inv2 = createInventory();
  const bags = {
    inv: inv2,
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = applyLoadedSave(loaded, bags);
  assert.equal(inv2.sword, SWORD.WOOD);
  assert.ok(bags.owSecretsRevealed.has('77:5:6'));
  assert.equal(meta.position.roomId, 0x77);

  store.rename(0, 'zelda');
  assert.equal(store.listSlots()[0].name, 'ZELDA');
  assert.equal(store.load(0).inv.sword, SWORD.WOOD);

  store.erase(0);
  assert.equal(store.listSlots()[0], null);
});

test('applyInventorySnapshot clears ephemeral state', () => {
  const inv = createInventory();
  inv.dead = true;
  inv.invuln = 10;
  applyInventorySnapshot(inv, { sword: SWORD.WHITE, rupees: 50 });
  assert.equal(inv.sword, SWORD.WHITE);
  assert.equal(inv.rupees, 50);
  assert.equal(inv.dead, false);
  assert.equal(inv.invuln, 0);
});

test('slotSummary from serializeGameState', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 7;
  const payload = serializeGameState({ name: 'Zelda', inv, roomId: 1, x: 0, y: 0, dir: 1 });
  const summary = slotSummary(payload);
  assert.equal(summary.name, 'ZELDA');
  assert.equal(summary.hearts, 4);
  assert.equal(summary.maxHearts, 5);
});

test('resolveZeroHeartContinue heals and sends OW saves to start', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 0;
  const owStart = { roomId: 0x77, x: 0x40, y: 0x8d, dir: 8 };
  const out = resolveZeroHeartContinue(
    inv,
    { mode: 'overworld', roomId: 0x74, x: 10, y: 20, dir: 1 },
    owStart,
  );
  assert.equal(out.healed, true);
  // Continuing always restores three hearts, not the full container count.
  assert.equal(inv.halfHearts, 6);
  assert.equal(out.position.roomId, 0x77);
  assert.equal(out.position.x, 0x40);
  assert.equal(out.atDungeonEntrance, false);
});

test('resolveZeroHeartContinue resumes dungeon at entrance', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 8;
  inv.halfHearts = 0;
  const owStart = { roomId: 0x77, x: 0x40, y: 0x8d, dir: 8 };
  const out = resolveZeroHeartContinue(
    inv,
    {
      mode: 'dungeon',
      roomId: 0x69,
      x: 100,
      y: 120,
      dir: 4,
      dungeon: { level: 3, fromRoomId: 0x74, roomId: 0x69 },
    },
    owStart,
  );
  assert.equal(out.healed, true);
  assert.equal(out.atDungeonEntrance, true);
  assert.equal(out.position.dungeon.level, 3);
  assert.equal(out.position.dungeon.fromRoomId, 0x74);
  assert.equal(out.position.dungeon.roomId, undefined);
  assert.equal(inv.halfHearts, 6);
});

test('resolveZeroHeartContinue is a no-op when hearts remain', () => {
  const inv = createInventory();
  inv.halfHearts = 3;
  const pos = { mode: 'overworld', roomId: 0x74, x: 10, y: 20, dir: 1 };
  const out = resolveZeroHeartContinue(inv, pos, {
    roomId: 0x77,
    x: 0x40,
    y: 0x8d,
    dir: 8,
  });
  assert.equal(out.healed, false);
  assert.equal(out.position, pos);
  assert.equal(inv.halfHearts, 3);
});
