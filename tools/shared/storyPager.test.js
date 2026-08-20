import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStoryPager } from './storyPager.js';

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
