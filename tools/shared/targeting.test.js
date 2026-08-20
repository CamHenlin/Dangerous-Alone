import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAY_W } from './continuousCamera.js';
import { enemyTarget, nearestTarget, nearestTargetIndex, targetInFoeHome } from './targeting.js';

const at = (x, y) => ({ x, y });

test('nearestTarget picks the closest', () => {
  const near = at(0x20, 0x20);
  const far = at(0xf0, 0xf0);
  assert.equal(nearestTarget([far, near], 0x28, 0x24), near);
  assert.equal(nearestTarget([near, far], 0xe0, 0xe8), far);
});

test('nearestTargetIndex is empty-safe', () => {
  assert.equal(nearestTargetIndex([], 0, 0), -1);
  assert.equal(nearestTargetIndex(null, 0, 0), -1);
  assert.equal(nearestTargetIndex([null, undefined], 0, 0), -1);
  assert.equal(nearestTarget([], 0, 0), null);
});

test('ties go to the earlier player, and stay there', () => {
  const p1 = at(0x00, 0x00);
  const p2 = at(0x20, 0x00);
  // Exactly between the two.
  assert.equal(nearestTargetIndex([p1, p2], 0x10, 0x00), 0);
  // Same answer next frame — an equidistant foe must not oscillate.
  assert.equal(nearestTargetIndex([p1, p2], 0x10, 0x00), 0);
});

test('a hole in the list does not shift the indices', () => {
  const p2 = at(0x20, 0x00);
  assert.equal(nearestTargetIndex([null, p2], 0x20, 0x00), 1);
});

test('a single player is always the target', () => {
  const solo = at(0x80, 0x8d);
  const { chase, index } = enemyTarget(at(0x10, 0x10), { targets: [solo] });
  assert.equal(index, 0);
  assert.deepEqual(chase, { x: 0x80, y: 0x8d });
});

test('chase is a copy, so pursuit maths cannot move the player', () => {
  const solo = at(0x80, 0x8d);
  const { chase } = enemyTarget(at(0, 0), { targets: [solo] });
  assert.notEqual(chase, solo);
  chase.x = 0;
  assert.equal(solo.x, 0x80);
});

test('bait outranks every hero, but still says who was nearest', () => {
  const solo = at(0x80, 0x8d);
  const bait = { x: 0x30, y: 0x40, alive: true };
  const { chase, index } = enemyTarget(at(0x20, 0x20), { targets: [solo], bait });
  assert.deepEqual(chase, { x: 0x30, y: 0x40 }, 'walks to the bait');
  assert.equal(index, 0, 'but still knows whose door to knock on');
});

test('eaten bait stops distracting', () => {
  const solo = at(0x80, 0x8d);
  const bait = { x: 0x30, y: 0x40, alive: false };
  const { chase } = enemyTarget(at(0x20, 0x20), { targets: [solo], bait });
  assert.deepEqual(chase, { x: 0x80, y: 0x8d });
});

test('with no living players there is nothing to chase', () => {
  const { chase, index } = enemyTarget(at(0x20, 0x20), { targets: [] });
  assert.equal(chase, null);
  assert.equal(index, -1);
});

test('each foe gets its own answer', () => {
  const targets = [at(0x10, 0x10), at(0xe0, 0xe0)];
  assert.equal(enemyTarget(at(0x18, 0x14), { targets }).index, 0);
  assert.equal(enemyTarget(at(0xd0, 0xd8), { targets }).index, 1);
});

test('a dungeon foe does not chase a hero who already left the room', () => {
  const foe = { x: 0x80, y: 0x8d, homeRoomId: 0x77 };
  const stillHere = at(0x40, 0x8d);
  // First pixel into $76 while the world is still anchored on $77.
  const leftWest = at(-1, 0x8d);
  assert.equal(targetInFoeHome(stillHere, foe, 0x77), true);
  assert.equal(targetInFoeHome(leftWest, foe, 0x77), false);

  const { chase, index } = enemyTarget(foe, {
    targets: [leftWest],
    anchorRoomId: 0x77,
    confineToHome: true,
  });
  assert.equal(chase, null, 'must wander, not walk to the west door');
  assert.equal(index, -1);

  const stay = enemyTarget(foe, {
    targets: [stillHere],
    anchorRoomId: 0x77,
    confineToHome: true,
  });
  assert.deepEqual(stay.chase, stillHere);

  // After the player crosses west, the $77 foe is at x+PLAY_W under a $76
  // anchor. The hero is in $76; the foe must still ignore them.
  const after = { x: 0x80 + PLAY_W, y: 0x8d, homeRoomId: 0x77 };
  const heroIn76 = at(0x80, 0x8d);
  const away = enemyTarget(after, {
    targets: [heroIn76],
    anchorRoomId: 0x76,
    confineToHome: true,
  });
  assert.equal(away.chase, null);
});

test('overworld chase still crosses a seam when not confined', () => {
  const foe = { x: 0x10, y: 0x8d, homeRoomId: 0x77 };
  const nextRoom = at(0x10 + PLAY_W, 0x8d);
  const { chase } = enemyTarget(foe, {
    targets: [nextRoom],
    anchorRoomId: 0x77,
    confineToHome: false,
  });
  assert.deepEqual(chase, nextRoom);
});

test('bait in another dungeon room is ignored', () => {
  const foe = { x: 0x80, y: 0x8d, homeRoomId: 0x77 };
  const hero = at(0x40, 0x8d);
  const inRoom = enemyTarget(foe, {
    targets: [hero],
    bait: { x: 0x20, y: 0x8d, alive: true },
    anchorRoomId: 0x77,
    confineToHome: true,
  });
  assert.deepEqual(inRoom.chase, { x: 0x20, y: 0x8d }, 'in-room bait still wins');

  const away = enemyTarget(foe, {
    targets: [hero],
    bait: { x: 0x20 - PLAY_W, y: 0x8d, alive: true },
    anchorRoomId: 0x77,
    confineToHome: true,
  });
  assert.deepEqual(away.chase, hero, 'out-of-room bait must not steal the chase');
});

test('a fairy drop chases the nearest living hero', () => {
  const p1 = at(0x20, 0x8d);
  const p2 = at(0xc0, 0x8d);
  const drop = at(0xb8, 0x8d);
  assert.equal(nearestTarget([p1, p2], drop.x, drop.y), p2);
  assert.equal(nearestTarget([p1, p2], 0x28, 0x8d), p1);
});
