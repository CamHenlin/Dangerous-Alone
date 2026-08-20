import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { DOORWAY_CENTER_X } from './dungeonDoors.js';
import { dungeonEntranceSpawn } from './dungeonPlay.js';

test('the wallmaster dump is the start-room south door', () => {
  const spawn = dungeonEntranceSpawn({ startRoom: 0x73, startY: 0xdd });
  assert.equal(spawn.roomId, 0x73);
  assert.equal(spawn.x, DOORWAY_CENTER_X);
  assert.equal(spawn.y, 0xdd);
  assert.equal(spawn.dir, DIR.UP);
});
