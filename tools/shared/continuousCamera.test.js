import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import {
  PLAY_H,
  PLAY_W,
  adoptCameraSolution,
  cameraForLink,
  cameraLocalForLink,
  clampMapEdgePos,
  detectRoomCross,
  foggedRooms,
  hitsMapEdgeLimit,
  canClaimAnchorCross,
  inAnchorPlayArea,
  localToWorld,
  occupyingRoom,
  localInRoom,
  rebaseDelta,
  resolveUwOccupyingRoomId,
  rectFullyOffCamera,
  roomPlayOrigin,
  createCamera,
  roomsForCamera,
  roomsForCameras,
  rectFullyOffEveryCamera,
  solvePlayCamera,
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

test('a wallmaster dump from $74 sits in $73 in world space', () => {
  // Entrance spawn is $73-local; the world's anchor is still $74 (the
  // ally's cell). Convert the same way poseAtDungeonEntrance does.
  const here = localInRoom(0x73, 0x74, 0x78, 0xdd);
  assert.equal(here.x, 0x78 - PLAY_W);
  assert.equal(here.y, 0xdd);
  assert.equal(occupyingRoom(0x74, here.x, here.y).roomId, 0x73);
});

test('a late dungeon descent sits at the mouth, not on the occupant', () => {
  const occupant = { x: 0x78, y: 0x8d };
  const inStart = localInRoom(0x73, 0x73, 0x78, 0xdd);
  assert.equal(inStart.x, occupant.x);
  assert.notEqual(inStart.y, occupant.y);
  const fromEast = localInRoom(0x73, 0x74, 0x78, 0xdd);
  assert.equal(occupyingRoom(0x74, fromEast.x, fromEast.y).roomId, 0x73);
  assert.notEqual(fromEast.y, occupant.y);
});

test('occupyingRoom follows a hero left in the previous cell', () => {
  // South rebase: the wanderer is in $76, the ally is still in $66 at
  // negative play-Y. The world's anchor is $76.
  const wanderer = occupyingRoom(0x76, 0x78, HUD_HEIGHT + 20);
  assert.equal(wanderer.roomId, 0x76);
  const ally = occupyingRoom(0x76, 0x78, HUD_HEIGHT - PLAY_H + 80);
  assert.equal(ally.roomId, 0x66);
  assert.equal(inAnchorPlayArea(0x78, HUD_HEIGHT + 20), true);
  assert.equal(inAnchorPlayArea(0x78, HUD_HEIGHT - PLAY_H + 80), false);
});

test('a stale dungeon occupancy latch yields to where the feet actually are', () => {
  // goRoom($72) while an ally still thinks they occupy $73: their x,y now
  // mean $72-local, so converting to $73 puts them on that room's west wall.
  const stale = resolveUwOccupyingRoomId(0x72, 0x78, 0x8d, 0x73);
  assert.equal(stale, 0x72);
  // Leftover after a real west cross: coords sit in $73, latch matches.
  const leftover = resolveUwOccupyingRoomId(0x72, PLAY_W + 0x78, 0x8d, 0x73);
  assert.equal(leftover, 0x73);
  // Mid-stride out the west door of the latched room — keep $73 so the
  // cross can finish instead of flipping to $72 one pixel early.
  const lip = resolveUwOccupyingRoomId(0x73, -0x13, 0x8d, 0x73);
  assert.equal(lip, 0x73);
  assert.equal(resolveUwOccupyingRoomId(0x72, 0x78, 0x8d, null), 0x72);
});

test('the exact seam pixel can still claim the anchor', () => {
  // playY === PLAY_H is the first south-exit pixel. It is *not* inside the
  // play rectangle, and a stride often lands here with gridOffset still set.
  // Skipping the claim here is what wedged Link in a south doorway.
  const seamY = HUD_HEIGHT + PLAY_H;
  assert.equal(inAnchorPlayArea(0x78, seamY), false);
  assert.equal(canClaimAnchorCross(0x78, seamY), true);
  assert.equal(canClaimAnchorCross(0x78, seamY + 8), true);
  assert.equal(canClaimAnchorCross(0x78, HUD_HEIGHT - PLAY_H + 80), false);
  assert.equal(canClaimAnchorCross(0x78, HUD_HEIGHT + 20), true);
  // Just inside the NES east lip, then shifted by an ally's east rebase.
  assert.equal(canClaimAnchorCross(-0x13, 0x8d), true);
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

test('a cave draws at the origin and leaves the world camera alone', () => {
  const cam = solvePlayCamera({ mode: 'cave', roomId: 0x77, linkX: 120, linkY: 140 });
  assert.equal(cam.fieldX, 0);
  assert.equal(cam.fieldY, 0);
  assert.equal(cam.tracks, false);
  assert.equal(cam.layout, 'none');
});

test('a pinned cellar sits on its own room and still lays out the dungeon', () => {
  const cam = solvePlayCamera({
    mode: 'dungeon',
    roomId: 0x34,
    linkX: 200,
    linkY: 150,
    pinned: true,
  });
  const origin = roomPlayOrigin(0x34);
  assert.equal(cam.fieldX, 0);
  assert.equal(cam.fieldY, 0);
  assert.equal(cam.tracks, true);
  assert.deepEqual([cam.camLocalX, cam.camLocalY], [0, 0]);
  assert.deepEqual([cam.worldCamX, cam.worldCamY], [origin.ox, origin.oy]);
  assert.equal(cam.layout, 'dungeon');
});

test('a pinned cellar ignores where Link is standing', () => {
  const near = solvePlayCamera({
    mode: 'dungeon',
    roomId: 0x34,
    linkX: 0,
    linkY: HUD_HEIGHT,
    pinned: true,
  });
  const far = solvePlayCamera({
    mode: 'dungeon',
    roomId: 0x34,
    linkX: 240,
    linkY: HUD_HEIGHT + 160,
    pinned: true,
  });
  assert.deepEqual(near, far);
});

test('following Link negates and rounds the camera into a playfield offset', () => {
  const cam = solvePlayCamera({
    mode: 'overworld',
    roomId: 0x44,
    linkX: 120,
    linkY: HUD_HEIGHT + 80,
  });
  const expected = cameraLocalForLink(0x44, 120, HUD_HEIGHT + 80, { cols: 16, rows: 8 });
  // `|| 0` folds -0, which the solver deliberately avoids emitting.
  assert.equal(cam.fieldX, -Math.round(expected.camX) || 0);
  assert.equal(cam.fieldY, -Math.round(expected.camY) || 0);
  assert.ok(!Object.is(cam.fieldX, -0), 'never negative zero');
  assert.ok(!Object.is(cam.fieldY, -0), 'never negative zero');
  assert.equal(cam.tracks, true);
  assert.equal(cam.layout, 'overworld');
});

test('the playfield offset is always a whole pixel', () => {
  for (const x of [0, 7, 13, 121, 199, 255]) {
    const cam = solvePlayCamera({
      mode: 'overworld',
      roomId: 0x44,
      linkX: x,
      linkY: HUD_HEIGHT + 41,
    });
    assert.equal(cam.fieldX, Math.trunc(cam.fieldX), `fieldX for x=${x}`);
    assert.equal(cam.fieldY, Math.trunc(cam.fieldY), `fieldY for x=${x}`);
  }
});

test('at the map rim the camera stops rather than showing past the edge', () => {
  const topLeft = solvePlayCamera({
    mode: 'overworld',
    roomId: 0x00,
    linkX: 0,
    linkY: HUD_HEIGHT,
  });
  assert.deepEqual([topLeft.fieldX, topLeft.fieldY], [0, 0]);
  assert.deepEqual([topLeft.worldCamX, topLeft.worldCamY], [0, 0]);

  const bottomRight = solvePlayCamera({
    mode: 'overworld',
    roomId: 0x7f,
    linkX: PLAY_W - 16,
    linkY: HUD_HEIGHT + PLAY_H - 16,
  });
  assert.equal(bottomRight.worldCamX, 15 * PLAY_W);
  assert.equal(bottomRight.worldCamY, 7 * PLAY_H);
});

test('the dungeon follows Link too, and lays out the dungeon stream', () => {
  const cam = solvePlayCamera({
    mode: 'dungeon',
    roomId: 0x45,
    linkX: 128,
    linkY: HUD_HEIGHT + 88,
  });
  assert.equal(cam.layout, 'dungeon');
  assert.equal(cam.tracks, true);
});

test('an unknown mode tracks the camera but lays out nothing', () => {
  const cam = solvePlayCamera({
    mode: 'ending',
    roomId: 0x22,
    linkX: 64,
    linkY: HUD_HEIGHT + 64,
  });
  assert.equal(cam.layout, 'none');
  assert.equal(cam.tracks, true);
});

test('a camera adopts a solution without taking its render fields', () => {
  const cam = createCamera();
  const solution = solvePlayCamera({
    mode: 'overworld',
    roomId: 0x77,
    linkX: 120,
    linkY: HUD_HEIGHT + 80,
  });
  assert.equal(adoptCameraSolution(cam, solution), cam, 'moves in place');
  assert.deepEqual(Object.keys(cam), [
    'camLocalX',
    'camLocalY',
    'worldCamX',
    'worldCamY',
  ]);
  assert.equal(cam.worldCamX, solution.worldCamX);
  assert.equal(cam.camLocalY, solution.camLocalY);
});

test('two cameras move independently', () => {
  const a = createCamera();
  const b = createCamera();
  adoptCameraSolution(
    a,
    solvePlayCamera({ mode: 'overworld', roomId: 0x77, linkX: 120, linkY: HUD_HEIGHT + 80 }),
  );
  assert.notEqual(a.worldCamX, b.worldCamX, 'one player walking does not move the other');
  assert.equal(b.worldCamX, 0);
});

test('roomsForCameras is the union of each view', () => {
  const left = roomsForCamera(0, 0, { margin: 0 });
  const right = roomsForCamera(PLAY_W * 2, 0, { margin: 0 });
  const both = roomsForCameras(
    [
      { worldCamX: 0, worldCamY: 0 },
      { worldCamX: PLAY_W * 2, worldCamY: 0 },
    ],
    { margin: 0 },
  );
  assert.ok(left.every((id) => both.includes(id)));
  assert.ok(right.every((id) => both.includes(id)));
  assert.ok(both.length > left.length, 'the second camera adds rooms');
});

test('a foe on the other screen is not off every camera', () => {
  const foe = { x: 200, y: HUD_HEIGHT + 80 };
  const here = { camLocalX: 0, camLocalY: 0 };
  const there = { camLocalX: PLAY_W * 2, camLocalY: 0 };
  assert.equal(rectFullyOffEveryCamera(foe, [here]), false);
  assert.equal(rectFullyOffEveryCamera(foe, [there]), true);
  assert.equal(rectFullyOffEveryCamera(foe, [here, there]), false);
});
