import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chrTileForItemId, itemSpriteLayout } from './itemFrame.js';

test('compass is wide slim-mirrored tile $6A', () => {
  assert.equal(chrTileForItemId(0x16), 0x6a);
  assert.deepEqual(itemSpriteLayout(0x6a), { narrow: false, gap: 7 });
});

test('map / key / bow / heart are narrow', () => {
  assert.equal(chrTileForItemId(0x17), 0x4c);
  assert.equal(itemSpriteLayout(0x4c).narrow, true);
  assert.equal(itemSpriteLayout(0x2e).narrow, true);
  assert.equal(itemSpriteLayout(0x2a).narrow, true);
  assert.equal(itemSpriteLayout(0xf2).narrow, true);
  assert.equal(itemSpriteLayout(0xf3).narrow, true);
});

test('heart container / triforce CHR tiles', () => {
  assert.equal(chrTileForItemId(0x1a), 0x68);
  assert.equal(chrTileForItemId(0x1b), 0x6e);
  assert.deepEqual(itemSpriteLayout(0x68), { narrow: false, gap: 7 });
  assert.deepEqual(itemSpriteLayout(0x6e), { narrow: false, gap: 8 });
});

test('Anim_ItemFrameTiles: recorder is $24, magic key is $2C (not swapped)', () => {
  assert.equal(chrTileForItemId(0x05), 0x24); // recorder
  assert.equal(chrTileForItemId(0x0b), 0x2c); // magic key
  assert.equal(chrTileForItemId(0x19), 0x2e); // key
  assert.equal(chrTileForItemId(0x10), 0x4a); // magical rod
});

test('demo crawl items: fairy / clock / swords / potions / bracelet', () => {
  assert.equal(chrTileForItemId(0x23), 0x50); // fairy
  assert.equal(chrTileForItemId(0x21), 0x66); // clock
  assert.equal(chrTileForItemId(0x01), 0x20); // wood sword
  assert.equal(chrTileForItemId(0x03), 0x20); // magic sword frame-0 (master uses $48 via slot $20)
  assert.equal(chrTileForItemId(0x1f), 0x40); // blue potion
  assert.equal(chrTileForItemId(0x04), 0x22); // bait
  assert.equal(chrTileForItemId(0x15), 0x4c); // letter
  assert.equal(chrTileForItemId(0x14), 0x4e); // bracelet
  assert.equal(chrTileForItemId(0x0d), 0x76); // stepladder (demo bank @ PPU $70)
});
