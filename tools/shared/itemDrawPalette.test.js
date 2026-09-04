import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROP_ITEM } from './enemyDrops.js';
import { itemDrawPalette, itemFlashPalette } from './itemDrawPalette.js';
import { caveItemSpritePalette } from './caveItems.js';

test('itemFlashPalette toggles SP1/SP2 every 8 frames', () => {
  assert.equal(itemFlashPalette(0x00), 1);
  assert.equal(itemFlashPalette(0x07), 1);
  assert.equal(itemFlashPalette(0x08), 2);
  assert.equal(itemFlashPalette(0x0f), 2);
  assert.equal(itemFlashPalette(0x10), 1);
});

test('bomb drop uses blue sprite palette (slot $01 → $01)', () => {
  assert.equal(itemDrawPalette(DROP_ITEM.BOMB, 0), 1);
  assert.equal(itemDrawPalette(DROP_ITEM.BOMB, 0x08), 1);
});

test('1-rupee flashes red/blue; 5-rupee stays blue', () => {
  assert.equal(itemDrawPalette(DROP_ITEM.RUPEE1, 0x00), 1);
  assert.equal(itemDrawPalette(DROP_ITEM.RUPEE1, 0x08), 2);
  assert.equal(itemDrawPalette(DROP_ITEM.RUPEE5, 0x00), 1);
  assert.equal(itemDrawPalette(DROP_ITEM.RUPEE5, 0x08), 1);
});

test('heart flashes red/blue like NES slot $19', () => {
  assert.equal(itemDrawPalette(DROP_ITEM.HEART, 0x00), 1);
  assert.equal(itemDrawPalette(DROP_ITEM.HEART, 0x08), 2);
});

test('clock and fairy use absolute slot palettes', () => {
  assert.equal(itemDrawPalette(DROP_ITEM.CLOCK, 0), 2);
  assert.equal(itemDrawPalette(DROP_ITEM.FAIRY, 0), 2);
});

test('wood/white/magic swords use grade palettes', () => {
  assert.equal(itemDrawPalette(0x01, 0), 0); // wood → SP0
  assert.equal(itemDrawPalette(0x02, 0), 1); // white → SP1
  assert.equal(itemDrawPalette(0x03, 0), 2); // magic → SP2
});

test('wood/silver arrows use grade palettes (slot $02)', () => {
  assert.equal(itemDrawPalette(0x08, 0), 0); // wood → SP0
  assert.equal(itemDrawPalette(0x09, 0), 1); // silver → SP1
});

test('wood/magic boomerangs use item $1D/$1E palettes', () => {
  assert.equal(itemDrawPalette(0x1d, 0), 0); // wood → SP0
  assert.equal(itemDrawPalette(0x1e, 0), 1); // magic → SP1 blue
  assert.equal(caveItemSpritePalette(0x1d), 0);
  assert.equal(caveItemSpritePalette(0x1e), 1);
});
