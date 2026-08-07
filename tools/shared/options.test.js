import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_BINDS,
  loadOptions,
  normalizeOptions,
  saveOptions,
} from './options.js';

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
