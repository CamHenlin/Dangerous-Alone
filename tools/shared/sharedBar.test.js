import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPartyCount, sharedBarOrigin } from './sharedBar.js';

test('the shared strip exists for every co-op frame', () => {
  assert.equal(sharedBarOrigin(1), null);
  assert.deepEqual(sharedBarOrigin(2), { x: 0, y: 480 });
  assert.deepEqual(sharedBarOrigin(3), { x: 0, y: 480 });
  assert.deepEqual(sharedBarOrigin(4), { x: 0, y: 480 });
});

test('four digits keep the NES blank and add a column', () => {
  assert.equal(formatPartyCount(0), 'XXX0');
  assert.equal(formatPartyCount(23), 'XX23');
  assert.equal(formatPartyCount(123), 'X123');
  assert.equal(formatPartyCount(1234), '1234');
  assert.equal(formatPartyCount(9999), '9999');
  assert.equal(formatPartyCount(10000), '9999');
});

test('three digits is still the ROM field', () => {
  assert.equal(formatPartyCount(23, 3), 'X23');
  assert.equal(formatPartyCount(3, 3), 'X3 ');
  assert.equal(formatPartyCount(255, 3), '255');
  assert.equal(formatPartyCount(510, 3), '510');
  assert.equal(formatPartyCount(1000, 3), '999');
});
