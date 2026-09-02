import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStreamFetch } from './streamFetch.js';

test('a second begin on the same stream cancels the first fetch', () => {
  const load = createStreamFetch();
  const first = load.begin();
  assert.equal(load.busy, true);
  const second = load.begin();
  assert.equal(load.stale(first), true);
  assert.equal(load.stale(second), false);
  load.end(first);
  assert.equal(load.busy, true, 'ending a stale token must not clear the live fetch');
  load.end(second);
  assert.equal(load.busy, false);
});

test('invalidate drops an in-flight fetch without starting another', () => {
  const load = createStreamFetch();
  const token = load.begin();
  load.invalidate();
  assert.equal(load.stale(token), true);
  assert.equal(load.busy, false);
});

test('two streams fetch independently', () => {
  const overworld = createStreamFetch();
  const dungeon = createStreamFetch();
  const ow = overworld.begin();
  dungeon.begin();
  assert.equal(
    overworld.stale(ow),
    false,
    'a labyrinth load must not cancel the overworld neighbour fetch',
  );
  assert.equal(overworld.busy, true);
});
