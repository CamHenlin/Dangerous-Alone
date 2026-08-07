import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROOM_ITEM,
  SECRET,
  applyRoomClear,
  countsTowardRoomClear,
  createRoomItem,
  decodeItemPosByte,
  persistsAfterRoomClear,
  roomAllDead,
  roomHasClearCountingType,
  roomItemCarrier,
  syncRoomItemPosition,
  tryPickupRoomItem,
  tryRingleaderClear,
} from './roomSecrets.js';

test('foes-for-item hides until clear', () => {
  const room = {
    floorItem: { itemType: ROOM_ITEM.HEART_CONTAINER },
    specialItem: { effectType: SECRET.FOES_FOR_ITEM, positionIndex: 0 },
  };
  const item = createRoomItem(room, { x: 0, y: 0 });
  assert.equal(item.visible, false);
  const { revealItem, shutter } = applyRoomClear(item, true);
  assert.equal(revealItem, true);
  assert.equal(shutter, true);
  assert.equal(item.visible, true);
});

test('ALL_DEAD opens shutters without a floor item', () => {
  const { shutter, revealItem } = applyRoomClear(null, true, SECRET.ALL_DEAD);
  assert.equal(shutter, true);
  assert.equal(revealItem, false);
});

test('item positions are screen-absolute (not floor-relative)', () => {
  const room = {
    floorItem: { itemType: ROOM_ITEM.KEY },
    specialItem: { effectType: SECRET.NONE, positionIndex: 0 },
  };
  // Origin must not shift NES LevelInfo coords.
  const item = createRoomItem(room, { x: 32, y: 96 });
  assert.equal(item.visible, true);
  assert.equal(item.x, 0xc0);
  assert.equal(item.y, 0x90);
  assert.deepEqual(decodeItemPosByte(0xc9), { x: 0xc0, y: 0x90 });
});

test('stalfos carries the room key until death', () => {
  const room = {
    floorItem: { itemType: ROOM_ITEM.KEY },
    specialItem: { effectType: SECRET.NONE, positionIndex: 0 },
  };
  const item = createRoomItem(room);
  const stalfos = { alive: true, objType: 0x2a, x: 0x70, y: 0x8d, npc: false };
  assert.equal(roomItemCarrier([stalfos]), stalfos);
  syncRoomItemPosition(item, [stalfos]);
  assert.equal(item.carried, true);
  assert.equal(item.x, 0x70);
  assert.equal(item.y, 0x8d);
  stalfos.alive = false;
  syncRoomItemPosition(item, [stalfos]);
  assert.equal(item.carried, false);
  assert.equal(item.x, 0x70); // left where it “dropped”
  assert.equal(item.y, 0x8d);
});

test('pickup consumes item', () => {
  const item = {
    itemType: ROOM_ITEM.BOW,
    effect: 0,
    x: 0x80,
    y: 0x80,
    visible: true,
    taken: false,
  };
  assert.equal(tryPickupRoomItem(item, 0x80, 0x80), ROOM_ITEM.BOW);
  assert.equal(item.taken, true);
  assert.equal(tryPickupRoomItem(item, 0x80, 0x80), null);
});

test('roomAllDead ignores living foes', () => {
  assert.equal(roomAllDead([{ alive: false, objType: 0x07 }, { alive: false, objType: 0x07 }]), true);
  assert.equal(roomAllDead([{ alive: true, objType: 0x07 }]), false);
});

test('roomAllDead ignores bubbles and traps (NES RoomAllDead)', () => {
  assert.equal(countsTowardRoomClear({ alive: true, objType: 0x2b }), false);
  assert.equal(countsTowardRoomClear({ alive: true, objType: 0x49 }), false);
  assert.equal(countsTowardRoomClear({ alive: true, objType: 0x07 }), true);
  assert.equal(
    roomAllDead([
      { alive: true, objType: 0x2b },
      { alive: true, objType: 0x4a },
      { alive: false, objType: 0x07 },
    ]),
    true,
  );
});

test('persons persist after room clear; tip rooms are not fight rooms', () => {
  assert.equal(persistsAfterRoomClear(0x4b), true);
  assert.equal(persistsAfterRoomClear(0x51), true);
  assert.equal(persistsAfterRoomClear(0x49), true);
  assert.equal(persistsAfterRoomClear(0x07), false);
  assert.equal(roomHasClearCountingType([{ alive: true, objType: 0x4b, npc: true }]), false);
  assert.equal(roomHasClearCountingType([{ alive: false, objType: 0x2a, npc: false }]), true);
});

test('ringleader kills remaining clear-counting foes when slot 1 empty', () => {
  const foes = [
    { alive: false, objType: 0x07 },
    { alive: true, objType: 0x07, hp: 16 },
    { alive: true, objType: 0x2b, hp: 16 },
  ];
  assert.equal(tryRingleaderClear(foes), true);
  assert.equal(foes[1].alive, false);
  assert.equal(foes[2].alive, true); // bubble ignored
});

test('LAST_BOSS clear needs lastBossDefeated flag', () => {
  const item = createRoomItem({
    floorItem: { itemType: ROOM_ITEM.HEART_CONTAINER },
    specialItem: { effectType: SECRET.LAST_BOSS, positionIndex: 0 },
  });
  assert.equal(applyRoomClear(item, true, SECRET.LAST_BOSS).shutter, false);
  const ok = applyRoomClear(item, false, SECRET.LAST_BOSS, { lastBossDefeated: true });
  assert.equal(ok.shutter, true);
  assert.equal(ok.revealItem, true);
});
