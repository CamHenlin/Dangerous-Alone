import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAY_H } from './continuousCamera.js';
import { spawnDungeonEnemies } from './enemies.js';
import { countsTowardRoomClear, roomAllDead } from './roomSecrets.js';
import {
  RUPEE_STASH,
  expandRupeeStash,
  isRupeeStash,
  tryTakeRupeeStash,
} from './rupeeStash.js';
import { hasEnemySprite } from './enemyAnim.js';

test('rupee stash expands to 10 fixed positions', () => {
  const kids = expandRupeeStash();
  assert.equal(kids.length, 10);
  assert.ok(kids.every((k) => k.objType === RUPEE_STASH));
  assert.equal(kids[0].x, 0x78);
  assert.equal(kids[0].y, 0x70);
  assert.equal(kids[9].x, 0x78);
  assert.equal(kids[9].y, 0xb0);
});

test('rupee stash expand respects room origin', () => {
  const kids = expandRupeeStash({ x: 0, y: PLAY_H });
  assert.equal(kids[0].y, 0x70 + PLAY_H);
});

test('L7 room $08 spawns 10 stash rupees with sprites', () => {
  const room = {
    roomId: 0x08,
    layoutId: 0x01,
    monster: { countIndex: 0, id: 0x35 },
    useMonsterGroups: false,
  };
  const foes = spawnDungeonEnemies(room, { x: 0, y: 0 }, 8);
  assert.equal(foes.length, 10);
  assert.ok(foes.every((e) => isRupeeStash(e.objType)));
  assert.ok(foes.every((e) => hasEnemySprite(e.objType)));
  assert.ok(foes.every((e) => countsTowardRoomClear(e)));
});

test('taking one rupee opens room clear while leaving the rest', () => {
  const foes = expandRupeeStash().map((s, i) => ({
    ...s,
    alive: true,
    hp: 1,
    id: i + 1,
  }));
  const inv = { rupees: 5 };
  // Stand on the first stash position.
  const got = tryTakeRupeeStash(foes, { x: 0x78, y: 0x70 }, inv);
  assert.equal(got.taken, true);
  assert.equal(got.openedRoom, true);
  assert.equal(inv.rupees, 6);
  assert.equal(foes.filter((e) => e.alive).length, 9);
  assert.equal(roomAllDead(foes), true, 'RoomObjCount zeroed after one take');
  // Remaining pickups still work.
  const again = tryTakeRupeeStash(foes, { x: 0x70, y: 0x80 }, inv);
  assert.equal(again.taken, true);
  assert.equal(inv.rupees, 7);
});
