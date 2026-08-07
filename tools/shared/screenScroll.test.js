import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  PLAY_H,
  PLAY_W,
  beginScreenScroll,
  createScreenScroll,
  isScrolling,
  stepScreenScroll,
} from './screenScroll.js';

function driveUntilDone(state, maxFrames = 300) {
  /** @type {ReturnType<typeof stepScreenScroll>[]} */
  const steps = [];
  for (let i = 0; i < maxFrames; i += 1) {
    const r = stepScreenScroll(state);
    steps.push(r);
    if (r.done) break;
  }
  return steps;
}

test('OW right: 4px/frame, completes in 64 frames', () => {
  const state = createScreenScroll();
  beginScreenScroll(state, {
    dir: DIR.RIGHT,
    nextRoomId: 0x78,
    spawn: { x: 0x10, y: 0x8d, dir: DIR.RIGHT },
    mode: 'overworld',
  });
  assert.equal(isScrolling(state), true);
  assert.equal(state.total, PLAY_W);

  const steps = driveUntilDone(state);
  assert.equal(steps.length, 64);
  assert.equal(steps[0].linkDX, -4);
  assert.equal(steps[0].offsetX, -4);
  assert.equal(steps.at(-1)?.done, true);
  assert.equal(steps.at(-1)?.offsetX, -PLAY_W);
  assert.equal(isScrolling(state), false);
});

test('UW right: 2px/frame, completes in 128 frames', () => {
  const state = createScreenScroll();
  beginScreenScroll(state, {
    dir: DIR.RIGHT,
    nextRoomId: 0x73,
    mode: 'dungeon',
  });

  const steps = driveUntilDone(state);
  assert.equal(steps.length, 128);
  assert.equal(steps[0].linkDX, -2);
  assert.equal(steps[0].offsetX, -2);
  assert.equal(steps.at(-1)?.offsetX, -PLAY_W);
});

test('OW up: 8px every 2 frames', () => {
  const state = createScreenScroll();
  beginScreenScroll(state, {
    dir: DIR.UP,
    nextRoomId: 0x67,
    spawn: { x: 0x78, y: 0xcd, dir: DIR.UP },
    mode: 'overworld',
  });
  assert.equal(state.total, PLAY_H);

  const r0 = stepScreenScroll(state);
  assert.equal(r0.linkDY, 0);
  assert.equal(r0.offsetY, 0);
  assert.equal(state.progress, 0);

  const r1 = stepScreenScroll(state);
  assert.equal(r1.linkDY, 8);
  assert.equal(r1.offsetY, 8);
  assert.equal(state.progress, 8);

  const steps = [r0, r1, ...driveUntilDone(state)];
  // 176 / 8 = 22 vertical steps × 2 frames = 44 frames total.
  assert.equal(steps.length, 44);
  assert.equal(steps.at(-1)?.done, true);
  assert.equal(steps.at(-1)?.offsetY, PLAY_H);
});

test('link deltas match scroll (right → linkDX negative)', () => {
  const state = createScreenScroll();
  beginScreenScroll(state, {
    dir: DIR.RIGHT,
    nextRoomId: 1,
    mode: 'overworld',
  });
  const r = stepScreenScroll(state);
  assert.ok(r.linkDX < 0);
  assert.equal(r.linkDX, r.offsetX); // first frame: both −4

  const left = createScreenScroll();
  beginScreenScroll(left, { dir: DIR.LEFT, nextRoomId: 0, mode: 'overworld' });
  const lr = stepScreenScroll(left);
  assert.ok(lr.linkDX > 0);
  assert.equal(lr.linkDX, lr.offsetX);

  const down = createScreenScroll();
  beginScreenScroll(down, { dir: DIR.DOWN, nextRoomId: 0, mode: 'dungeon' });
  // UW vertical: first step on frame 4.
  let dr = { linkDY: 0, offsetY: 0 };
  for (let i = 0; i < 4; i += 1) dr = stepScreenScroll(down);
  assert.equal(dr.linkDY, -8);
  assert.equal(dr.offsetY, -8);
});

test('isScrolling false before begin and after done', () => {
  const state = createScreenScroll();
  assert.equal(isScrolling(state), false);
  beginScreenScroll(state, { dir: DIR.LEFT, nextRoomId: 0, mode: 'overworld' });
  assert.equal(isScrolling(state), true);
  driveUntilDone(state);
  assert.equal(isScrolling(state), false);
});
