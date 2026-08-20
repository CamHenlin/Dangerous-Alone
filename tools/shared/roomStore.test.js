import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoomStore } from './roomStore.js';

const grid = (fill) => [[fill, fill], [fill, fill]];

test('upsert creates a room and returns it', () => {
  const store = createRoomStore();
  const entry = store.upsert(0x77, { tileGrid: grid(1), pack: { attrs: {} } });
  assert.equal(entry.roomId, 0x77);
  assert.equal(store.size, 1);
  assert.ok(store.has(0x77));
  assert.equal(store.tileGrid(0x77), entry.tileGrid);
});

test('room ids are masked to a byte, so $177 and $77 are one room', () => {
  const store = createRoomStore();
  store.upsert(0x177, { tileGrid: grid(2) });
  assert.equal(store.size, 1);
  assert.ok(store.has(0x77));
  assert.equal(store.get(0x77)?.roomId, 0x77);
});

test('upsert merges: refreshing fog does not blank the grid or pack', () => {
  const store = createRoomStore();
  const tiles = grid(3);
  const pack = { attrs: { wave: true } };
  store.upsert(0x12, { tileGrid: tiles, pack });
  store.upsert(0x12, { fogged: true });
  assert.equal(store.tileGrid(0x12), tiles);
  assert.equal(store.pack(0x12), pack);
  assert.equal(store.isFogged(0x12), true);
});

test('missing rooms read as null rather than throwing', () => {
  const store = createRoomStore();
  assert.equal(store.get(0x40), null);
  assert.equal(store.tileGrid(0x40), null);
  assert.equal(store.pack(0x40), null);
  assert.equal(store.isFogged(0x40), false);
  assert.equal(store.has(0x40), false);
});

test('setFog only touches rooms that exist', () => {
  const store = createRoomStore();
  store.upsert(0x30, { tileGrid: grid(1) });
  store.setFog(0x30, true);
  assert.equal(store.isFogged(0x30), true);
  store.setFog(0x31, true);
  assert.equal(store.has(0x31), false);
});

test('gridMap carries only rooms that have a grid', () => {
  const store = createRoomStore();
  store.upsert(0x10, { tileGrid: grid(1) });
  store.upsert(0x11, { pack: {} });
  store.upsert(0x12, { tileGrid: grid(2) });
  const map = store.gridMap();
  assert.deepEqual([...map.keys()].sort(), [0x10, 0x12]);
});

test('pruneTo drops the rest and reports what it dropped', () => {
  const store = createRoomStore();
  for (const id of [0x10, 0x11, 0x12, 0x13]) store.upsert(id, { tileGrid: grid(id) });
  const dropped = store.pruneTo([0x11, 0x13]);
  assert.deepEqual(dropped.sort(), [0x10, 0x12]);
  assert.equal(store.size, 2);
  assert.ok(store.has(0x11) && store.has(0x13));
});

test('pruneTo masks the keep set the same way ids are stored', () => {
  const store = createRoomStore();
  store.upsert(0x22, { tileGrid: grid(1) });
  assert.deepEqual(store.pruneTo([0x122]), []);
  assert.ok(store.has(0x22));
});

test('clear empties the store', () => {
  const store = createRoomStore();
  store.upsert(0x10, { tileGrid: grid(1) });
  store.clear();
  assert.equal(store.size, 0);
  assert.equal(store.gridMap().size, 0);
});
