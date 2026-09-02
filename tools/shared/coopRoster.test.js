import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canLeave,
  copyJoiningBSlot,
  createPadStartEdges,
  fillJoiningHearts,
  hostPadIndex,
  hostPlayer,
  joiningPads,
  nextJoinIndex,
  padsAreClones,
  seatForJoiningPad,
  snapToHost,
} from './coopRoster.js';
import { B_ITEM, createInventory } from './inventory.js';
import { createInventoryView, createPlayer } from './player.js';

function hero(index, { active = true, x = 0, y = 0 } = {}) {
  return createPlayer({
    index,
    active,
    link: { x, y, dir: 4, posFrac: 0, gridOffset: 0, moving: false },
    sword: {},
    inv: createInventoryView(createInventory()),
  });
}

test('the host is the lowest-numbered player still in', () => {
  const a = hero(0, { active: false });
  const b = hero(1);
  assert.equal(hostPlayer([a, b]), b);
  assert.equal(hostPlayer([a]), null);
});

test('the last player cannot leave', () => {
  const a = hero(0);
  const b = hero(1);
  assert.equal(canLeave([a, b], a), true);
  assert.equal(canLeave([a], a), false);
  assert.equal(canLeave([a, b], b), true);
  b.active = false;
  assert.equal(canLeave([a, b], a), false);
});

test('the next seat is the first empty one', () => {
  assert.equal(nextJoinIndex([hero(0)]), 1);
  assert.equal(nextJoinIndex([hero(0), hero(1)]), 2);
  assert.equal(nextJoinIndex([hero(0), hero(1)], 2), -1);
  assert.equal(nextJoinIndex([hero(0), hero(1, { active: false })]), 1);
});

test('a joiner gets a full glass at the host\'s containers', () => {
  const host = hero(0);
  host.inv.maxHalfHearts = 10;
  host.inv.halfHearts = 3;
  const joiner = hero(1);
  fillJoiningHearts(joiner.inv, host.inv);
  assert.equal(joiner.inv.maxHalfHearts, 10);
  assert.equal(joiner.inv.halfHearts, 10);
  assert.equal(joiner.inv.dead, false);
});

test('a joiner copies the host B slot', () => {
  const shared = createInventory();
  shared.bombs = 8;
  shared.boomerang = 1;
  const host = createInventoryView(shared);
  const joiner = createInventoryView(shared);
  host.selectedB = B_ITEM.BOOMERANG;
  copyJoiningBSlot(joiner, host);
  assert.equal(joiner.selectedB, B_ITEM.BOOMERANG);
  assert.equal(host.selectedB, B_ITEM.BOOMERANG);
});

test('a joiner takes the first owned item when the host slot is empty', () => {
  const shared = createInventory();
  shared.bombs = 8;
  shared.candle = 1;
  const host = createInventoryView(shared);
  const joiner = createInventoryView(shared);
  host.selectedB = B_ITEM.NONE;
  copyJoiningBSlot(joiner, host);
  assert.equal(joiner.selectedB, B_ITEM.BOMB);
  assert.equal(host.selectedB, B_ITEM.NONE);
});

test('a joiner stays empty when the bag has nothing to put on B', () => {
  const shared = createInventory();
  const host = createInventoryView(shared);
  const joiner = createInventoryView(shared);
  copyJoiningBSlot(joiner, host);
  assert.equal(joiner.selectedB, B_ITEM.NONE);
});

test('a joiner stands on the host', () => {
  const host = hero(0, { x: 40, y: 80 });
  host.world = { id: 'overworld' };
  host.uwOccRoomId = 0x72;
  host.uwDoorwayBlockSide = 'east';
  const joiner = hero(1, { x: 0, y: 0 });
  snapToHost(joiner, host);
  assert.equal(joiner.link.x, 40);
  assert.equal(joiner.link.y, 80);
  assert.equal(joiner.world, host.world);
  assert.equal(joiner.uwOccRoomId, 0x72);
  assert.equal(joiner.uwDoorwayBlockSide, 'east');
});

test('a joiner in a cave keeps the host\'s mouth latch', () => {
  const host = hero(0, { x: 0x78, y: 0xb8 });
  host.world = { id: 'cave:29' };
  host.caveExitLatch = true;
  host.caveInteractLatch = 'ware:0';
  const joiner = hero(1, { x: 0, y: 0 });
  snapToHost(joiner, host);
  assert.equal(joiner.caveExitLatch, true);
  assert.equal(joiner.caveInteractLatch, 'ware:0');
  assert.equal(joiner.world, host.world);
});

test('the first plugged-in pad is the host; extras are join devices', () => {
  const pads = [null, { id: 'a' }, { id: 'b' }];
  assert.equal(hostPadIndex(pads), 1);
  assert.deepEqual(joiningPads(pads, { padSlots: [null, 1, 2, 3], activeIndexes: [0] }), [2]);
  assert.deepEqual(joiningPads([{ id: 'only' }], { padSlots: [null, 1, 2, 3], activeIndexes: [0] }), []);
});

test('a pad cloned into later GamepadList slots is not three join devices', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  buttons[9] = { pressed: true };
  const clone = { id: 'USB Gamepad', buttons };
  const pads = [clone, clone, clone, clone];
  assert.equal(padsAreClones(clone, clone), true);
  assert.equal(padsAreClones(clone, { id: 'USB Gamepad', buttons }), true);
  assert.deepEqual(joiningPads(pads, { padSlots: [null, 1, 2, 3], activeIndexes: [0] }), []);
  const extra = { id: 'Xbox', buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  extra.buttons[9] = { pressed: true };
  assert.deepEqual(
    joiningPads([clone, extra], { padSlots: [null, 1, 2, 3], activeIndexes: [0] }),
    [1],
  );
});

test('Start on a spare pad sits the next empty seat, and claims that pad', () => {
  const party = [hero(0)];
  assert.equal(seatForJoiningPad(1, { padSlots: [null, 1, 2, 3], players: party }), 1);
  assert.equal(seatForJoiningPad(2, { padSlots: [null, 1, 2, 3], players: party }), 2);
  assert.equal(seatForJoiningPad(0, { padSlots: [null, 1, 2, 3], players: [hero(0), hero(1)] }), 2);
});

test('holding Start on a spare pad only joins once', () => {
  const edges = createPadStartEdges();
  const pads = [{ buttons: { 9: { pressed: true } } }, { buttons: { 9: { pressed: true } } }];
  assert.deepEqual(edges.rising([1], pads), [1]);
  assert.deepEqual(edges.rising([1], pads), [], 'still held');
  pads[1].buttons[9].pressed = false;
  assert.deepEqual(edges.rising([1], pads), []);
  pads[1].buttons[9].pressed = true;
  assert.deepEqual(edges.rising([1], pads), [1]);
});
