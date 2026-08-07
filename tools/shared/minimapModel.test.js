import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dungeonMapRooms,
  dungeonMinimapCell,
  overworldMarker,
  roomBounds,
} from './minimapModel.js';

const level = {
  bossRoom: 0x35,
  triforceRoom: 0x36,
  cellarRooms: [0x7f],
  rooms: [
    { roomId: 0x73 },
    { roomId: 0x63 },
    { roomId: 0x35 },
    { roomId: 0x36 },
    { roomId: 0x7f },
  ],
};

test('dungeonMapRooms drops cellars', () => {
  const onMap = dungeonMapRooms(level);
  assert.equal(onMap.has(0x73), true);
  assert.equal(onMap.has(0x7f), false);
});

test('roomBounds crops to occupied columns/rows', () => {
  const b = roomBounds(dungeonMapRooms(level));
  assert.deepEqual(b, { minCol: 3, maxCol: 6, minRow: 3, maxRow: 7 });
});

test('dungeonMinimapCell respects map / visit / compass', () => {
  const onMap = dungeonMapRooms(level);
  const visited = new Set([0x73]);
  const cur = dungeonMinimapCell(0x73, {
    onMap,
    visited,
    currentRoomId: 0x73,
    hasMap: false,
    hasCompass: false,
  });
  assert.equal(cur.visible, true);
  assert.equal(cur.current, true);

  const fog = dungeonMinimapCell(0x63, {
    onMap,
    visited,
    currentRoomId: 0x73,
    hasMap: false,
    hasCompass: false,
  });
  assert.equal(fog.visible, false);

  const mapped = dungeonMinimapCell(0x63, {
    onMap,
    visited,
    currentRoomId: 0x73,
    hasMap: true,
    hasCompass: false,
  });
  assert.equal(mapped.visible, true);
  assert.equal(mapped.visited, false);

  const boss = dungeonMinimapCell(0x35, {
    onMap,
    visited,
    currentRoomId: 0x73,
    hasMap: false,
    hasCompass: true,
    bossRoom: 0x35,
    triforceRoom: 0x36,
  });
  assert.equal(boss.compassOnly, true);
  assert.equal(boss.bossMark, true);

  const tip = dungeonMinimapCell(0x36, {
    onMap,
    visited,
    currentRoomId: 0x73,
    hasMap: false,
    hasCompass: false,
    hintRooms: [0x36],
  });
  assert.equal(tip.hintMark, true);
  assert.equal(tip.compassOnly, true);
});

test('overworldMarker decodes screen id', () => {
  assert.deepEqual(overworldMarker(0x77), { col: 7, row: 7 });
  assert.equal(overworldMarker(null), null);
});
