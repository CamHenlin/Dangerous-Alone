import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import {
  PLAY_H,
  PLAY_W,
  cameraForLink,
  cameraLocalForLink,
  clampMapEdgePos,
  detectRoomCross,
  foggedRooms,
  hitsMapEdgeLimit,
  localToWorld,
  rebaseDelta,
  rectFullyOffCamera,
  roomPlayOrigin,
  roomsForCamera,
  worldToLocal,
} from './continuousCamera.js';

test('roomPlayOrigin matches 16×8 grid', () => {
  assert.deepEqual(roomPlayOrigin(0x00), { ox: 0, oy: 0 });
  assert.deepEqual(roomPlayOrigin(0x01), { ox: PLAY_W, oy: 0 });
  assert.deepEqual(roomPlayOrigin(0x10), { ox: 0, oy: PLAY_H });
  assert.deepEqual(roomPlayOrigin(0x77), { ox: 7 * PLAY_W, oy: 7 * PLAY_H });
});

test('localToWorld / worldToLocal round-trip', () => {
  const w = localToWorld(0x23, 0x40, HUD_HEIGHT + 20);
  assert.equal(w.x, 3 * PLAY_W + 0x40);
  assert.equal(w.y, 2 * PLAY_H + 20);
  const back = worldToLocal(w.x, w.y);
  assert.equal(back.roomId, 0x23);
  assert.equal(back.x, 0x40);
  assert.equal(back.y, HUD_HEIGHT + 20);
});

test('camera centers Link until map edge', () => {
  // Mid-map room $45: Link at center → camera shows that room centered-ish.
  const mid = localToWorld(0x45, 0x78, 0x8d);
  const cam = cameraForLink(mid.x, mid.y);
  assert.ok(cam.camX > 0);
  assert.ok(cam.camY > 0);
  // Top-left corner of the map: camera sticks at 0,0.
  const corner = localToWorld(0x00, OW_LEFT(), OW_TOP());
  const edgeCam = cameraForLink(corner.x, corner.y);
  assert.equal(edgeCam.camX, 0);
  assert.equal(edgeCam.camY, 0);
});

function OW_LEFT() {
  return 0x11;
}
function OW_TOP() {
  return 0x4d;
}

test('cameraLocalForLink is relative to anchor room', () => {
  const { camX, camY, worldCamX } = cameraLocalForLink(0x01, 0x80, 0x8d);
  assert.equal(worldCamX, roomPlayOrigin(0x01).ox + camX);
  // Link near center of room $01 → local cam near 0.
  assert.ok(Math.abs(camX) < PLAY_W);
  assert.ok(Math.abs(camY) < PLAY_H);
});

test('detectRoomCross rebases across seams', () => {
  const left = detectRoomCross(0x45, -1, 0x8d);
  assert.ok(left);
  assert.equal(left.nextRoomId, 0x44);
  assert.equal(left.dir, DIR.LEFT);
  assert.equal(left.x, PLAY_W - 1);

  const right = detectRoomCross(0x45, PLAY_W, 0x8d);
  assert.equal(right?.nextRoomId, 0x46);

  const up = detectRoomCross(0x45, 0x80, HUD_HEIGHT - 1);
  assert.equal(up?.nextRoomId, 0x35);
  // $3F + PLAY_H = $EF → snap to walk grid $ED (not raw $EF).
  assert.equal(up?.y, 0xed);
  assert.equal(up?.y & 0x0f, 0x0d);

  assert.equal(detectRoomCross(0x00, -1, 0x8d), null); // map edge
});

test('rebaseDelta matches cross directions', () => {
  assert.deepEqual(rebaseDelta(DIR.LEFT), { dx: PLAY_W, dy: 0 });
  assert.deepEqual(rebaseDelta(DIR.RIGHT), { dx: -PLAY_W, dy: 0 });
  assert.deepEqual(rebaseDelta(DIR.UP), { dx: 0, dy: PLAY_H });
  assert.deepEqual(rebaseDelta(DIR.DOWN), { dx: 0, dy: -PLAY_H });
});

test('hitsMapEdgeLimit only at absolute map rim', () => {
  assert.equal(hitsMapEdgeLimit(0x11, 0x8d, DIR.LEFT, 0x00), true);
  assert.equal(hitsMapEdgeLimit(0x00, 0x8d, DIR.LEFT, 0x45), false);
  assert.equal(hitsMapEdgeLimit(0x80, 0x4d, DIR.UP, 0x05), true);
  assert.equal(hitsMapEdgeLimit(0x80, 0x3d, DIR.UP, 0x45), false);
});

test('clampMapEdgePos opens neighbor sides', () => {
  const mid = clampMapEdgePos(-20, 0x8d, 0x45);
  assert.equal(mid.x, -20);
  const edge = clampMapEdgePos(-20, 0x8d, 0x40);
  assert.equal(edge.x, 0x11);
});

test('roomsForCamera includes neighbors', () => {
  const rooms = roomsForCamera(0, 0, { margin: 1 });
  assert.ok(rooms.includes(0x00));
  assert.ok(rooms.includes(0x01));
  assert.ok(rooms.includes(0x10));
});

test('rectFullyOffCamera', () => {
  assert.equal(rectFullyOffCamera({ x: 0x80, y: 0x8d }, 0, 0), false);
  assert.equal(rectFullyOffCamera({ x: -200, y: 0x8d }, 0, 0), true);
});

test('foggedRooms hides unvisited neighbors', () => {
  const fog = foggedRooms([0x10, 0x11, 0x12], new Set([0x11]), 0x11);
  assert.ok(fog.has(0x10));
  assert.ok(fog.has(0x12));
  assert.equal(fog.has(0x11), false);
});
