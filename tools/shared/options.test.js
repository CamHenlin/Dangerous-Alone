import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_BINDS,
  DEFAULT_BINDS_P2,
  DEFAULT_BINDS_P3,
  DEFAULT_BINDS_P4,
  DEFAULT_PAD_BINDS,
  DEFAULT_PAD_SLOTS,
  DEFAULT_PLAYER_BINDS,
  bindsForPlayer,
  codeLabel,
  loadOptions,
  normalizeOptions,
  padBindsForPlayer,
  padsForPlayer,
  saveOptions,
} from './options.js';
import { padBtn } from './padBinds.js';

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
  };
}

test('normalizeOptions clamps scale and filter', () => {
  const o = normalizeOptions({ scale: 9, filter: 'crt', binds: { a: ['KeyQ'] } });
  assert.equal(o.scale, 'auto');
  assert.equal(o.filter, 'integer');
  assert.deepEqual(o.binds.a, ['KeyQ']);
  assert.deepEqual(o.binds.up, [...DEFAULT_BINDS.up]);
});

test('load/save options round-trip', () => {
  const storage = memoryStorage();
  saveOptions({ scale: 3, filter: 'smooth', fullscreen: true }, storage);
  const o = loadOptions(storage);
  assert.equal(o.scale, 3);
  assert.equal(o.filter, 'smooth');
  assert.equal(o.fullscreen, true);
});

test('one player reads every pad; two players read one each', () => {
  const pads = [{ id: 'a' }, null, { id: 'c' }];
  assert.deepEqual(padsForPlayer(pads), [{ id: 'a' }, { id: 'c' }], 'solo takes them all');
  assert.deepEqual(padsForPlayer(pads, 0), [{ id: 'a' }]);
  assert.deepEqual(padsForPlayer(pads, 2), [{ id: 'c' }]);
  assert.deepEqual(padsForPlayer(pads, 1), [], 'an empty slot drives nobody');
  assert.deepEqual(padsForPlayer(pads, 9), [], 'nor does one that is not there');
  assert.deepEqual(padsForPlayer(null), []);
});

test('no key drives two heroes at once', () => {
  // The failure here is subtle in play — a shared key moves both players
  // together and reads as a physics bug rather than a binding one.
  const keys = (binds) => new Set(Object.values(binds).flat());
  const sets = [DEFAULT_BINDS, DEFAULT_BINDS_P2, DEFAULT_BINDS_P3, DEFAULT_BINDS_P4].map(keys);
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const shared = [...sets[j]].filter((k) => sets[i].has(k));
      assert.deepEqual(shared, [], `player ${i + 1} and ${j + 1} share ${shared}`);
    }
  }
});

test('both players can walk, swing and use an item', () => {
  for (const [i, binds] of DEFAULT_PLAYER_BINDS.entries()) {
    for (const action of ['up', 'down', 'left', 'right', 'a', 'b']) {
      assert.ok(binds[action]?.length, `player ${i + 1} cannot ${action}`);
    }
  }
});

test('a player-one remap still fills seat 0 after the party fields land', () => {
  const o = normalizeOptions({ binds: { a: ['KeyQ'] } });
  assert.deepEqual(o.binds.a, ['KeyQ']);
  assert.deepEqual(o.playerBinds[0].a, ['KeyQ']);
  assert.deepEqual(o.playerBinds[1].a, [...DEFAULT_BINDS_P2.a]);
  assert.deepEqual(o.padSlots, [...DEFAULT_PAD_SLOTS]);
});

test('per-seat binds and pads survive a round-trip', () => {
  const storage = memoryStorage();
  const saved = saveOptions(
    {
      playerBinds: [{ ...DEFAULT_BINDS, b: ['KeyM'] }, { ...DEFAULT_BINDS_P2, start: ['KeyU'] }],
      padSlots: [0, 2, 1, 3],
    },
    storage,
  );
  assert.deepEqual(saved.playerBinds[0].b, ['KeyM']);
  assert.deepEqual(saved.binds.b, ['KeyM']);
  const loaded = loadOptions(storage);
  assert.deepEqual(bindsForPlayer(loaded, 0).b, ['KeyM']);
  assert.deepEqual(bindsForPlayer(loaded, 1).start, ['KeyU']);
  assert.deepEqual(loaded.padSlots, [0, 2, 1, 3]);
});

test('a missing pad remap still uses the standard layout', () => {
  const o = normalizeOptions({ binds: { a: ['KeyQ'] } });
  assert.deepEqual(padBindsForPlayer(o, 0).left, [...DEFAULT_PAD_BINDS.left]);
  assert.deepEqual(padBindsForPlayer(o, 1).a, [...DEFAULT_PAD_BINDS.a]);
});

test('per-seat pad remaps survive a round-trip', () => {
  const storage = memoryStorage();
  saveOptions(
    {
      playerPadBinds: [{ ...DEFAULT_PAD_BINDS, left: [padBtn(6)] }, DEFAULT_PAD_BINDS],
    },
    storage,
  );
  const loaded = loadOptions(storage);
  assert.deepEqual(padBindsForPlayer(loaded, 0).left, [padBtn(6)]);
  assert.deepEqual(padBindsForPlayer(loaded, 1).left, [...DEFAULT_PAD_BINDS.left]);
});

test('codeLabel names pad sources the same way as keys', () => {
  assert.equal(codeLabel('PadBtn:14'), 'Pad ←');
  assert.equal(codeLabel('KeyJ'), 'J');
});
