import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout } from './pixiBoot.js';

test('withTimeout resolves before the deadline', async () => {
  const value = await withTimeout(Promise.resolve(42), 1000, 'late');
  assert.equal(value, 42);
});

test('withTimeout rejects when the promise never settles', async () => {
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 20, 'timed out'),
    /timed out/,
  );
});
