import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDoorState, openDoorPair } from './dungeonDoors.js';
import {
  SHUTTER_ANIM_FRAMES,
  SHUTTER_HALF_TRAVEL,
  createShutterAnim,
  cropRgba,
  neighborShutterRef,
  shutterAnimKey,
  shutterAnimProgress,
  shutterHalfOffsets,
  shutterSidesNeedingOpen,
  shutterSpritePlacements,
  splitDoorFaceRgba,
  stepShutterAnim,
  visualOpenSides,
} from './shutterAnim.js';

const shutterRoom = {
  roomId: 0x21,
  doors: {
    north: { type: 'open' },
    south: { type: 'shutter' },
    west: { type: 'wall' },
    east: { type: 'bombable' },
  },
};

test('shutterSidesNeedingOpen lists closed shutters only', () => {
  const state = createDoorState();
  assert.deepEqual(shutterSidesNeedingOpen(state, shutterRoom), ['south']);
  openDoorPair(state, shutterRoom.roomId, 'south');
  assert.deepEqual(shutterSidesNeedingOpen(state, shutterRoom), []);
});

test('visualOpenSides includes a sliding shutter the doorState has not opened', () => {
  const state = createDoorState();
  const anim = createShutterAnim(0x21, 'south', 'open');
  const sides = visualOpenSides(shutterRoom, state, [anim]);
  assert.equal(sides.includes('south'), true);
  assert.equal(sides.includes('north'), true);
});

test('visualOpenSides ignores another room\'s anim', () => {
  const state = createDoorState();
  const anim = createShutterAnim(0x22, 'south', 'open');
  const sides = visualOpenSides(shutterRoom, state, [anim]);
  assert.equal(sides.includes('south'), false);
});

test('open progress goes 0 → 1 over DoorTimer frames; close is the reverse', () => {
  const open = createShutterAnim(0x21, 'south', 'open');
  assert.equal(shutterAnimProgress(open), 0);
  let done = false;
  for (let i = 0; i < SHUTTER_ANIM_FRAMES; i += 1) {
    done = stepShutterAnim(open);
  }
  assert.equal(done, true);
  assert.equal(open.frame, SHUTTER_ANIM_FRAMES);
  assert.equal(shutterAnimProgress(open), 1);

  const close = createShutterAnim(0x21, 'south', 'close');
  assert.equal(shutterAnimProgress(close), 1);
  for (let i = 0; i < SHUTTER_ANIM_FRAMES; i += 1) stepShutterAnim(close);
  assert.equal(shutterAnimProgress(close), 0);
});

test('shutterHalfOffsets: N/S split left/right, E/W split top/bottom', () => {
  assert.deepEqual(shutterHalfOffsets('south', 0), [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]);
  assert.deepEqual(shutterHalfOffsets('south', 1), [
    { dx: -SHUTTER_HALF_TRAVEL, dy: 0 },
    { dx: SHUTTER_HALF_TRAVEL, dy: 0 },
  ]);
  assert.deepEqual(shutterHalfOffsets('west', 1), [
    { dx: 0, dy: -SHUTTER_HALF_TRAVEL },
    { dx: 0, dy: SHUTTER_HALF_TRAVEL },
  ]);
});

test('neighborShutterRef is the shared wall\'s opposite face', () => {
  assert.deepEqual(neighborShutterRef(0x21, 'south'), { roomId: 0x31, side: 'north' });
  assert.deepEqual(neighborShutterRef(0x21, 'east'), { roomId: 0x22, side: 'west' });
});

test('splitDoorFaceRgba cuts N/S on X and E/W on Y', () => {
  const width = 4;
  const height = 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = i;
    rgba[i + 3] = 255;
  }
  const [left, right] = splitDoorFaceRgba(rgba, width, height, 'south');
  assert.equal(left.width, 2);
  assert.equal(right.width, 2);
  assert.equal(left.height, 2);
  assert.equal(left.rgba[0], 0);
  assert.equal(right.rgba[0], 8);

  const [top, bottom] = splitDoorFaceRgba(rgba, width, height, 'west');
  assert.equal(top.height, 1);
  assert.equal(bottom.height, 1);
  assert.equal(top.width, 4);
});

test('shutterSpritePlacements sit on the door-face rect', () => {
  const anim = createShutterAnim(0x21, 'south', 'open');
  const atRest = shutterSpritePlacements(anim);
  assert.equal(atRest.length, 2);
  assert.equal(atRest[0].x, 112);
  assert.equal(atRest[0].y, 144);
  assert.equal(atRest[1].x, 128);
  anim.frame = SHUTTER_ANIM_FRAMES;
  const open = shutterSpritePlacements(anim);
  assert.equal(open[0].x, 112 - SHUTTER_HALF_TRAVEL);
  assert.equal(open[1].x, 128 + SHUTTER_HALF_TRAVEL);
});

test('cropRgba copies a window', () => {
  const src = new Uint8Array(2 * 2 * 4);
  src[4] = 9;
  const { width, height, rgba } = cropRgba(src, 2, 2, 1, 0, 1, 1);
  assert.equal(width, 1);
  assert.equal(height, 1);
  assert.equal(rgba[0], 9);
});

test('shutterAnimKey is room:side', () => {
  assert.equal(shutterAnimKey(0x121, 'south'), '33:south');
});
