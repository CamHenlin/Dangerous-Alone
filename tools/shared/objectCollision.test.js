import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LINK_CONTACT_THRESHOLD,
  objectMiddle,
  objectTouchesLink,
  objectsCollide,
} from './objectCollision.js';

test('objectMiddle defaults to +8,+8', () => {
  assert.deepEqual(objectMiddle(0x80, 0x90), { x: 0x88, y: 0x98 });
});

test('objectMiddle halfWidth uses +4 X', () => {
  assert.deepEqual(objectMiddle(0x80, 0x90, { halfWidth: true }), { x: 0x84, y: 0x98 });
});

test('DoObjectsCollide threshold $09', () => {
  const a = { x: 100, y: 100 };
  assert.equal(objectsCollide(a, { x: 100, y: 100 }, 9), true);
  assert.equal(objectsCollide(a, { x: 108, y: 100 }, 9), true); // 8 < 9
  assert.equal(objectsCollide(a, { x: 109, y: 100 }, 9), false); // 9 >= 9
  assert.equal(objectsCollide(a, { x: 100, y: 109 }, 9), false);
});

test('one tile beside Link does not contact (NES)', () => {
  // Same Y, X differs by 16 (one tile). Centers also 16 apart → no hit.
  assert.equal(objectTouchesLink(0x90, 0x80, 0x80, 0x80), false);
  assert.equal(LINK_CONTACT_THRESHOLD, 0x09);
});

test('near overlap still contacts', () => {
  assert.equal(objectTouchesLink(0x80, 0x80, 0x80, 0x80), true);
  assert.equal(objectTouchesLink(0x88, 0x80, 0x80, 0x80), true); // dx 8 < 9
  assert.equal(objectTouchesLink(0x89, 0x80, 0x80, 0x80), false); // dx 9
});
