import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDungeonMap } from './dungeonMap.js';

test('map shows visited and current; compass marks boss', () => {
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
  const text = formatDungeonMap(level, {
    visited: new Set([0x73, 0x63]),
    currentRoomId: 0x73,
    hasMap: true,
    hasCompass: true,
  });
  assert.match(text, /@/);
  assert.match(text, /B/);
  assert.match(text, /T/);
  assert.doesNotMatch(text, /7/); // cellar not drawn as digit
});
