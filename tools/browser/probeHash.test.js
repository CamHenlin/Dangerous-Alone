import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_TRACE, foldTrace, probeDigest, probeViolations, traceProbes } from './probeHash.js';

/** A minimal well-formed probe. */
const probe = (over = {}) => ({
  frame: 1,
  mode: 'overworld',
  roomId: 0x77,
  screenRoomId: 0x77,
  linkRoom: 0x77,
  gridAliased: true,
  camLocalX: 0,
  camLocalY: 0,
  worldCamX: 0,
  worldCamY: 0,
  link: { x: 0x78, y: 0x8d, dir: 1 },
  spawnedRooms: [0x77],
  spawnClaims: [],
  streamRooms: [0x77],
  enemyIds: [1],
  spriteIds: [1],
  enemies: [
    { id: 1, objType: 7, home: 0x77, alive: true, view: true, edge: false, x: 0x90, y: 0x8d, off: false },
  ],
  ...over,
});

test('the digest moves with the simulation', () => {
  const ref = probeDigest(probe());
  assert.notEqual(probeDigest(probe({ frame: 2 })), ref);
  assert.notEqual(probeDigest(probe({ roomId: 0x78 })), ref);
  assert.notEqual(probeDigest(probe({ link: { x: 0x79, y: 0x8d, dir: 1 } })), ref);
  assert.notEqual(probeDigest(probe({ worldCamX: 16 })), ref);
  assert.notEqual(probeDigest(probe({ streamRooms: [0x77, 0x78] })), ref);
});

test('an on-camera foe is hashed by position', () => {
  const ref = probeDigest(probe());
  const moved = probe({
    enemies: [{ id: 1, objType: 7, home: 0x77, alive: true, view: true, edge: false, x: 0x91, y: 0x8d, off: false }],
  });
  assert.notEqual(probeDigest(moved), ref);
});

test('an off-camera foe is hashed by identity, not position', () => {
  const offAt = (x) => probe({
    enemies: [{ id: 1, objType: 7, home: 0x78, alive: true, view: true, edge: false, x, y: 0x8d, off: true }],
  });
  // Neighbour rooms stream in asynchronously and share one spawn RNG, so where
  // an unseen foe stands is not reproducible; whether it exists and is alive is.
  assert.equal(probeDigest(offAt(0x120)), probeDigest(offAt(0x180)));

  const dead = probe({
    enemies: [{ id: 1, objType: 7, home: 0x78, alive: false, view: true, edge: false, x: 0x120, y: 0x8d, off: true }],
  });
  assert.notEqual(probeDigest(dead), probeDigest(offAt(0x120)), 'liveness still counts');
});

test('the trace folds every frame, not just the last', () => {
  const one = probe({ frame: 1 });
  const two = probe({ frame: 2 });
  const three = probe({ frame: 3 });
  const viaAll = traceProbes([one, two, three]);
  const skippingMiddle = traceProbes([one, three]);
  assert.notEqual(viaAll, skippingMiddle);
  assert.equal(viaAll, foldTrace(foldTrace(foldTrace(EMPTY_TRACE, probeDigest(one)), probeDigest(two)), probeDigest(three)));
});

test('a sound frame has no violations', () => {
  assert.deepEqual(probeViolations(probe()), []);
});

test('a stale screen is a violation', () => {
  const bad = probeViolations(probe({ screenRoomId: 0x10 }));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /screen/);
});

test('Link outside the anchor room is a violation', () => {
  assert.match(probeViolations(probe({ linkRoom: 0x78 }))[0], /anchor/);
});

test('an unaliased collision grid is a violation', () => {
  assert.match(probeViolations(probe({ gridAliased: false }))[0], /collision grid/);
});

test('a leaked sprite is a violation', () => {
  assert.match(probeViolations(probe({ spriteIds: [1, 99] }))[0], /sprite 99/);
});

test('a dungeon screenRoomId of null is not a violation', () => {
  // Only the overworld binds a `screen`; underworld rooms legitimately have none.
  assert.deepEqual(probeViolations(probe({ mode: 'dungeon', screenRoomId: null })), []);
});
