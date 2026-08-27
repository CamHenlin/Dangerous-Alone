import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStoryPager, storyReaders } from './storyPager.js';

function p(index, id, mode, active = true) {
  return { index, active, world: { id, mode } };
}

test('labyrinth-entry is only for people standing in a labyrinth', () => {
  const party = [
    p(0, 'overworld', 'overworld'),
    p(1, 'dungeon:1', 'dungeon'),
    p(2, 'cave:16', 'cave'),
    p(3, 'cellar:1:127', 'dungeon'),
  ];
  assert.deepEqual(
    storyReaders(party, 'levelEntry').map((r) => r.index),
    [1, 3],
  );
});

test('a briefing still reaches the overworld, but not a cave', () => {
  const party = [
    p(0, 'overworld', 'overworld'),
    p(1, 'dungeon:1', 'dungeon'),
    p(2, 'cave:16', 'cave'),
  ];
  assert.deepEqual(
    storyReaders(party, 'briefing').map((r) => r.index),
    [0, 1],
  );
});

test('an inactive seat is not a reader', () => {
  const party = [p(0, 'dungeon:1', 'dungeon', false), p(1, 'dungeon:1', 'dungeon')];
  assert.deepEqual(
    storyReaders(party, 'levelEntry').map((r) => r.index),
    [1],
  );
});

test('each reader turns their own pages', () => {
  const pager = createStoryPager([0, 1], 3);
  assert.equal(pager.holding(), true);
  assert.deepEqual(pager.advance(0), { turned: true, closed: false, allDone: false });
  assert.equal(pager.pageOf(0), 1);
  assert.equal(pager.pageOf(1), 0);
  pager.advance(0);
  pager.advance(0);
  assert.equal(pager.finished(0), true);
  assert.equal(pager.holding(), true, 'player two is still reading');
  pager.advance(1);
  pager.advance(1);
  const last = pager.advance(1);
  assert.equal(last.allDone, true);
  assert.equal(pager.holding(), false);
});

test('a one-page briefing still waits for every reader', () => {
  const pager = createStoryPager([0, 1], 1);
  assert.equal(pager.advance(0).allDone, false);
  assert.equal(pager.advance(1).allDone, true);
});
