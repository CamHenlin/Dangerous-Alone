import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { GRUMBLE } from './grumble.js';
import {
  PERSON_BLOCK_Y,
  applyPersonBlocking,
  isPersonBlocker,
  isPersonBlockerType,
  roomHasPersonBlocker,
} from './personBlocking.js';

test('Grumble and UW persons are blockers', () => {
  assert.equal(isPersonBlockerType(GRUMBLE), true);
  assert.equal(isPersonBlockerType(0x4b), true);
  assert.equal(isPersonBlockerType(0x05), false);
  assert.equal(isPersonBlocker({ alive: true, objType: GRUMBLE, grumble: true }), true);
  assert.equal(isPersonBlocker({ alive: false, objType: GRUMBLE, grumble: true }), false);
});

test('CheckPersonBlocking clears UP only when Y < $8E', () => {
  assert.equal(applyPersonBlocking(0x8d, DIR.UP), 0);
  assert.equal(applyPersonBlocking(PERSON_BLOCK_Y, DIR.UP), DIR.UP);
  assert.equal(applyPersonBlocking(0x9d, DIR.UP | DIR.RIGHT), DIR.UP | DIR.RIGHT);
  assert.equal(applyPersonBlocking(0x80, DIR.DOWN), DIR.DOWN);
  assert.equal(applyPersonBlocking(0x80, DIR.UP | DIR.LEFT), DIR.LEFT);
});

test('roomHasPersonBlocker ignores dead / ordinary foes', () => {
  assert.equal(roomHasPersonBlocker([{ alive: true, objType: 0x05 }]), false);
  assert.equal(
    roomHasPersonBlocker([
      { alive: true, objType: 0x05 },
      { alive: true, objType: GRUMBLE, grumble: true },
    ]),
    true,
  );
});
