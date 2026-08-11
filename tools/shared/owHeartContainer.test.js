import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OW_HEART_ITEM,
  OW_HEART_ROOM,
  OW_HEART_X,
  OW_HEART_Y,
  createOwHeartContainer,
  isOwHeartRoom,
} from './owHeartContainer.js';

test('isOwHeartRoom only matches $5F', () => {
  assert.equal(isOwHeartRoom(0x5f), true);
  assert.equal(isOwHeartRoom(0x15f), true);
  assert.equal(isOwHeartRoom(0x4f), false);
  assert.equal(isOwHeartRoom(0x5e), false);
});

test('createOwHeartContainer places $1A at $C0,$90 on room $5F', () => {
  const item = createOwHeartContainer(0x5f);
  assert.ok(item);
  assert.equal(item.itemType, OW_HEART_ITEM);
  assert.equal(item.x, OW_HEART_X);
  assert.equal(item.y, OW_HEART_Y);
  assert.equal(item.homeX, OW_HEART_X);
  assert.equal(item.homeY, OW_HEART_Y);
  assert.equal(item.visible, true);
  assert.equal(item.taken, false);
  assert.equal(item.effect, 0);
});

test('createOwHeartContainer is null off $5F or when taken', () => {
  assert.equal(createOwHeartContainer(0x4f), null);
  assert.equal(createOwHeartContainer(OW_HEART_ROOM, new Set([OW_HEART_ROOM])), null);
  assert.equal(createOwHeartContainer(OW_HEART_ROOM, [0x5f]), null);
  assert.ok(createOwHeartContainer(OW_HEART_ROOM, new Set([0x10])));
});
