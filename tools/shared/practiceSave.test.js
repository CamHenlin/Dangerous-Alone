import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory, SWORD } from './inventory.js';
import { PRACTICE_KEY, createPracticeStore } from './practiceSave.js';
import { SLOT_KEY_PREFIX } from './save.js';

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
    _map: map,
  };
}

test('practice store does not touch file slots', () => {
  const storage = memoryStorage();
  const store = createPracticeStore(storage);
  const inv = createInventory();
  inv.sword = SWORD.WOOD;
  store.save({
    name: 'PRACTICE',
    inv,
    mode: 'overworld',
    roomId: 0x77,
    x: 0x40,
    y: 0x8d,
    dir: 1,
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    dungeonProgress: new Map(),
  });
  assert.ok(storage.getItem(PRACTICE_KEY));
  assert.equal(storage.getItem(`${SLOT_KEY_PREFIX}0`), null);
  const bags = {
    inv: createInventory(),
    owSecretsRevealed: new Set(),
    caveTaken: new Set(),
    dungeonProgress: new Map(),
  };
  const meta = store.hydrateInto(bags);
  assert.equal(bags.inv.sword, SWORD.WOOD);
  assert.equal(meta.position.roomId, 0x77);
});
