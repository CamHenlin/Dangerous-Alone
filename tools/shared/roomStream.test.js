import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import { PLAY_W } from './continuousCamera.js';
import {
  chaseBoundsForCamera,
  claimLivingSpawnPoints,
  clearSpawnClaimsForRoom,
  cullOffscreenEnemies,
  enemiesInRoom,
  filterUnoccupiedSpawnPoints,
  mazeLoopSpawn,
  orphanedEnemySpriteIds,
  releaseSpawnLatch,
  roomFullyOffAllCameras,
  roomHasLivingEnemies,
  roomsNeedingSpawn,
  shiftPositions,
  spawnPointKey,
  streamMissingVisibleRooms,
  tagEnemyHomeRoom,
  uwEnemyBoundsForRoom,
} from './roomStream.js';

test('streamMissingVisibleRooms is true when a neighbour is not drawn', () => {
  const have = new Set([0x00]);
  const stream = { get: (id) => (have.has(id & 0xff) ? {} : null) };
  const cam = [{ worldCamX: 0, worldCamY: 0 }];
  assert.equal(streamMissingVisibleRooms(stream, cam, { margin: 1 }), true);
  for (const id of [0x00, 0x01, 0x10, 0x11]) have.add(id);
  assert.equal(streamMissingVisibleRooms(stream, cam, { margin: 1 }), false);
});

test('tagEnemyHomeRoom', () => {
  const foes = [{ id: 1 }, { id: 2, homeRoomId: 0x10, slotIndex: 3 }];
  tagEnemyHomeRoom(foes, 0x45);
  assert.equal(foes[0].homeRoomId, 0x45);
  assert.equal(foes[1].homeRoomId, 0x10);
  // No slotIndex → not a ROM spawn point (Zora / Armos / splits).
  assert.equal(foes[0].spawnPointKey, undefined);
  assert.equal(foes[1].spawnPointKey, spawnPointKey(0x10, 3));
});

test('filterUnoccupiedSpawnPoints blocks duplicate spawn keys', () => {
  const claims = new Set([spawnPointKey(0x45, 3)]);
  const existing = [
    { alive: true, spawnPointKey: spawnPointKey(0x45, 1) },
  ];
  const wave = [
    { alive: true, spawnPointKey: spawnPointKey(0x45, 1), id: 'a' },
    { alive: true, spawnPointKey: spawnPointKey(0x45, 2), id: 'b' },
    { alive: true, spawnPointKey: spawnPointKey(0x45, 2), id: 'c' },
    { alive: true, spawnPointKey: spawnPointKey(0x45, 3), id: 'd' },
  ];
  const fresh = filterUnoccupiedSpawnPoints(wave, existing, claims);
  assert.deepEqual(fresh.map((e) => e.id), ['b']);
});

test('claimed spawn points stay blocked after foe death until room leave', () => {
  const claims = new Set();
  const wave = [
    { alive: true, spawnPointKey: spawnPointKey(0x70, 1), id: 1 },
    { alive: true, spawnPointKey: spawnPointKey(0x70, 2), id: 2 },
  ];
  const first = filterUnoccupiedSpawnPoints(wave, [], claims);
  claimLivingSpawnPoints(first, claims);
  assert.equal(first.length, 2);
  // Kill both — claims must still reject a refill mid-visit.
  const refill = filterUnoccupiedSpawnPoints(wave, [], claims);
  assert.equal(refill.length, 0);

  const spawned = new Set([0x70]);
  releaseSpawnLatch(spawned, [0x70], 0, 0, 0x00, { spawnClaims: claims });
  assert.equal(spawned.has(0x70), false);
  assert.equal(claims.size, 0);

  const again = filterUnoccupiedSpawnPoints(wave, [], claims);
  assert.equal(again.length, 2);
});

test('claimLivingSpawnPoints records straggler keys', () => {
  const claims = new Set();
  claimLivingSpawnPoints(
    [
      { alive: true, spawnPointKey: spawnPointKey(0x11, 1) },
      { alive: false, spawnPointKey: spawnPointKey(0x11, 2) },
    ],
    claims,
  );
  assert.ok(claims.has(spawnPointKey(0x11, 1)));
  assert.equal(claims.has(spawnPointKey(0x11, 2)), false);
});

test('clearSpawnClaimsForRoom is scoped', () => {
  const claims = new Set([spawnPointKey(0x10, 1), spawnPointKey(0x11, 1)]);
  clearSpawnClaimsForRoom(claims, 0x10);
  assert.equal(claims.has(spawnPointKey(0x10, 1)), false);
  assert.ok(claims.has(spawnPointKey(0x11, 1)));
});

test('shiftPositions rebases entities', () => {
  const objs = [{ x: 10, y: 20 }, { x: 0, y: HUD_HEIGHT }];
  shiftPositions(objs, PLAY_W, 0);
  assert.equal(objs[0].x, 10 + PLAY_W);
  assert.equal(objs[1].x, PLAY_W);
});

test('shiftPositions rebases a floor-item home with its sprite', () => {
  const item = { x: 0x78, y: 0x8d, homeX: 0x78, homeY: 0x8d };
  shiftPositions([item], 0, -176);
  assert.equal(item.x, 0x78);
  assert.equal(item.homeX, 0x78);
  assert.equal(item.y, 0x8d - 176);
  assert.equal(item.homeY, 0x8d - 176);
});

test('cullOffscreenEnemies removes foes when sprite and home leave view', () => {
  const foes = [
    { alive: true, homeRoomId: 0x45, x: 0x80, y: 0x8d },
    { alive: true, homeRoomId: 0x44, x: -300, y: 0x8d },
  ];
  // worldCam at origin: rooms $44/$45 are fully off → off-sprite foe may cull.
  const { kept, emptiedRooms } = cullOffscreenEnemies(foes, 0, 0, 8, {
    worldCamX: 0,
    worldCamY: 0,
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].homeRoomId, 0x45);
  assert.ok(emptiedRooms.has(0x44));
});

test('cullOffscreenEnemies keeps off-view foes whose home room is visible', () => {
  const foes = [
    { alive: true, homeRoomId: 0x00, x: -40, y: 0x8d },
  ];
  const { kept, emptiedRooms } = cullOffscreenEnemies(foes, 0, 0, 8, {
    worldCamX: 0,
    worldCamY: 0,
  });
  assert.equal(kept.length, 1);
  assert.equal(emptiedRooms.size, 0);
});

test('cullOffscreenEnemies keep predicate preserves Wallmaster capture slides', () => {
  const foes = [
    {
      alive: true,
      homeRoomId: 0x44,
      x: -300,
      y: 0x8d,
      wallmasterGrab: true,
      objType: 0x27,
    },
  ];
  const { kept } = cullOffscreenEnemies(foes, 0, 0, 8, {
    worldCamX: 0,
    worldCamY: 0,
    keep: (e) => Boolean(e.wallmasterGrab),
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].wallmasterGrab, true);
});

test('orphanedEnemySpriteIds finds leaks even when dead corpses inflate the list', () => {
  // Live foe 1 has a sprite; dead foe 2 has none; orphan 99 has a sprite but
  // no enemy. enemyGfx.size (2) <= enemies.length (2), so a size gate would
  // skip the sweep and leave the frozen "background" monster on screen.
  const foes = [
    { id: 1, alive: true },
    { id: 2, alive: false },
  ];
  const spriteIds = [1, 99];
  assert.equal(spriteIds.length <= foes.length, true);
  assert.deepEqual(orphanedEnemySpriteIds(foes, spriteIds), [99]);
});

test('roomsNeedingSpawn respects visit + latch', () => {
  const need = roomsNeedingSpawn({
    candidateRooms: [0x10, 0x11],
    currentRoomId: 0x11,
    visited: new Set([0x11]),
    spawnedRooms: new Set([0x11]),
    clearedRooms: new Set(),
    worldCamX: 0,
    worldCamY: 0,
  });
  assert.deepEqual(need, []);

  const need2 = roomsNeedingSpawn({
    candidateRooms: [0x10, 0x11],
    currentRoomId: 0x11,
    visited: new Set([0x11]),
    spawnedRooms: new Set(),
    clearedRooms: new Set(),
    worldCamX: 0,
    worldCamY: 0,
  });
  assert.ok(need2.includes(0x11));
  assert.equal(need2.includes(0x10), false); // unvisited
});

test('roomsNeedingSpawn does not refill a latched empty room', () => {
  // Kill-all left latch set with no living foes — must not respawn mid-visit.
  const need = roomsNeedingSpawn({
    candidateRooms: [0x00],
    currentRoomId: 0x00,
    visited: new Set([0x00]),
    spawnedRooms: new Set([0x00]),
    clearedRooms: new Set(),
    worldCamX: 0,
    worldCamY: 0,
  });
  assert.deepEqual(need, []);
});

test('releaseSpawnLatch clears rooms that left the camera', () => {
  const spawned = new Set([0x00, 0x70]);
  // Camera at top-left; room $70 is far south.
  releaseSpawnLatch(spawned, [0x00, 0x70], 0, 0, 0x00);
  assert.ok(spawned.has(0x00));
  assert.equal(spawned.has(0x70), false);
});

test('releaseSpawnLatch keeps emptied rooms still on camera', () => {
  const spawned = new Set([0x00, 0x01]);
  releaseSpawnLatch(spawned, [0x00, 0x01], 0, 0, 0x00);
  assert.ok(spawned.has(0x00));
  assert.ok(spawned.has(0x01), 'on-camera cleared room must not mid-visit respawn');
});

test('releaseSpawnLatch keeps rooms with chased living foes', () => {
  const spawned = new Set([0x70]);
  const foes = [{ alive: true, homeRoomId: 0x70, x: 0x80, y: 0x8d }];
  // Room $70 is far south of cam (0,0), but a straggler still lives.
  releaseSpawnLatch(spawned, [0x70], 0, 0, 0x00, { enemies: foes });
  assert.ok(spawned.has(0x70), 'must not respawn while home foes still live');
  foes[0].alive = false;
  releaseSpawnLatch(spawned, [0x70], 0, 0, 0x00, { enemies: foes });
  assert.equal(spawned.has(0x70), false);
});

test('roomHasLivingEnemies ignores dead / other homes', () => {
  const foes = [
    { alive: true, homeRoomId: 0x45 },
    { alive: false, homeRoomId: 0x46 },
    { alive: true, homeRoomId: 0x47 },
  ];
  assert.equal(roomHasLivingEnemies(foes, 0x45), true);
  assert.equal(roomHasLivingEnemies(foes, 0x46), false);
  assert.equal(roomHasLivingEnemies(foes, 0x10), false);
});

test('leave camera then revisit can refill after latch release', () => {
  const spawned = new Set([0x70]);
  // Room $70 is far south of a camera parked at the top-left.
  releaseSpawnLatch(spawned, [0x70], 0, 0, 0x00);
  assert.equal(spawned.has(0x70), false);
  const need = roomsNeedingSpawn({
    candidateRooms: [0x70],
    currentRoomId: 0x70,
    visited: new Set([0x70]),
    spawnedRooms: spawned,
    clearedRooms: new Set(),
    worldCamX: 0,
    worldCamY: 7 * 176,
  });
  assert.ok(need.includes(0x70));
});

test('mazeLoopSpawn wraps to opposite edge', () => {
  const link = { x: 0, y: 0x8d };
  mazeLoopSpawn(link, DIR.LEFT);
  assert.equal(link.x, 0xe0);
});

test('chaseBoundsForCamera expands past one screen', () => {
  const b = chaseBoundsForCamera(0, 0);
  assert.ok(b.maxX > PLAY_W);
  assert.ok(b.minX < 0);
});

test('uwEnemyBoundsForRoom is BoundByRoom at the home origin', () => {
  const b = uwEnemyBoundsForRoom(0x6e, 0x6e);
  assert.equal(b.minX, 0x21);
  assert.equal(b.minY, 0x5e);
  assert.equal(b.maxX, 0xd0 + 16);
  assert.equal(b.maxY, 0xbd + 16);
});

test('uwEnemyBoundsForRoom offsets when home ≠ anchor', () => {
  const b = uwEnemyBoundsForRoom(0x6f, 0x6e); // east neighbor
  assert.equal(b.minX, 0x21 + PLAY_W);
  assert.equal(b.minY, 0x5e);
});

test('enemiesInRoom scopes room rules to one room', () => {
  const foes = [
    { id: 1, homeRoomId: 0x45 },
    { id: 2, homeRoomId: 0x46 },
    { id: 3, homeRoomId: 0x45 },
  ];
  assert.deepEqual(enemiesInRoom(foes, 0x45).map((e) => e.id), [1, 3]);
  assert.deepEqual(enemiesInRoom(foes, 0x46).map((e) => e.id), [2]);
  assert.deepEqual(enemiesInRoom(foes, 0x99), []);
});

test('enemiesInRoom counts untagged foes as members', () => {
  // Caves / single-screen modes never tag a home room.
  const foes = [{ id: 1 }, { id: 2, homeRoomId: 0x46 }];
  assert.deepEqual(enemiesInRoom(foes, 0x45).map((e) => e.id), [1]);
});

test('a visible neighbour cannot hold a room from clearing', () => {
  // The bug: `roomAllDead(enemies)` over the whole streamed list kept shutters
  // shut while any streamed neighbour still had a living foe.
  const foes = [
    { id: 1, homeRoomId: 0x45, alive: false },
    { id: 2, homeRoomId: 0x46, alive: true },
  ];
  assert.equal(enemiesInRoom(foes, 0x45).some((e) => e.alive), false);
  assert.equal(enemiesInRoom(foes, 0x46).some((e) => e.alive), true);
});

// --- Phase 23: the room lifecycle answers to every camera, not just one. ---

/** Room $44 sits at column 4, row 4 of the play map. */
const ROOM_44_CAM = { worldCamX: 4 * 256, worldCamY: 4 * 176 };
const ORIGIN_CAM = { worldCamX: 0, worldCamY: 0 };

test('roomFullyOffAllCameras is false while any camera sees the room', () => {
  assert.equal(roomFullyOffAllCameras(0x44, [ORIGIN_CAM]), true);
  assert.equal(roomFullyOffAllCameras(0x44, [ORIGIN_CAM, ROOM_44_CAM]), false);
  assert.equal(roomFullyOffAllCameras(0x00, [ORIGIN_CAM, ROOM_44_CAM]), false);
});

test('cullOffscreenEnemies keeps a foe whose home room another player can see', () => {
  const foes = [{ alive: true, homeRoomId: 0x44, x: -300, y: 0x8d }];
  const { kept, emptiedRooms } = cullOffscreenEnemies(foes, 0, 0, 8, {
    cameras: [ORIGIN_CAM, ROOM_44_CAM],
  });
  assert.equal(kept.length, 1);
  assert.equal(emptiedRooms.size, 0);
  assert.equal(foes[0].alive, true);
});

test('releaseSpawnLatch holds while a second camera is still in the room', () => {
  const held = new Set([0x44]);
  releaseSpawnLatch(held, [0x44], 0, 0, 0x00, {
    cameras: [ORIGIN_CAM, ROOM_44_CAM],
  });
  assert.equal(held.has(0x44), true, 'player 2 is standing in it');

  const freed = new Set([0x44]);
  releaseSpawnLatch(freed, [0x44], 0, 0, 0x00, { cameras: [ORIGIN_CAM] });
  assert.equal(freed.has(0x44), false, 'nobody is looking any more');
});

test('roomsNeedingSpawn covers rooms only a second camera can see', () => {
  const args = {
    candidateRooms: [0x44],
    currentRoomId: 0x00,
    visited: new Set([0x44]),
    spawnedRooms: new Set(),
    clearedRooms: new Set(),
    worldCamX: 0,
    worldCamY: 0,
  };
  assert.deepEqual(roomsNeedingSpawn(args), []);
  assert.deepEqual(
    roomsNeedingSpawn({ ...args, cameras: [ORIGIN_CAM, ROOM_44_CAM] }),
    [0x44],
  );
});

test('an empty camera list falls back to the positional camera', () => {
  const held = new Set([0x44]);
  releaseSpawnLatch(held, [0x44], ROOM_44_CAM.worldCamX, ROOM_44_CAM.worldCamY, 0x00, {
    cameras: [],
  });
  assert.equal(held.has(0x44), true);
});
