import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nesColor } from './nesPalette.js';
import {
  LINK_TUNIC_NES,
  linkPaletteRgb,
  linkTunicNesColor,
} from './linkPalette.js';

test('LinkColors match ROM green / blue / red', () => {
  assert.deepEqual([...LINK_TUNIC_NES], [0x29, 0x32, 0x16]);
  assert.equal(linkTunicNesColor(0), 0x29);
  assert.equal(linkTunicNesColor(1), 0x32);
  assert.equal(linkTunicNesColor(2), 0x16);
  assert.equal(linkTunicNesColor(99), 0x16);
});

test('linkPaletteRgb patches SP0 color 1 from InvRing', () => {
  const set = {
    rowsRgb: Array.from({ length: 8 }, () => [
      [0, 0, 0],
      [184, 248, 24],
      [252, 160, 68],
      [228, 92, 16],
    ]),
  };
  const green = linkPaletteRgb(set, 0);
  assert.deepEqual([...green[1]], nesColor(0x29));
  assert.deepEqual([...green[2]], [252, 160, 68]);

  const blue = linkPaletteRgb(set, 1);
  assert.deepEqual([...blue[1]], nesColor(0x32));
  assert.deepEqual([...blue[2]], [252, 160, 68]);

  const red = linkPaletteRgb(set, 2);
  assert.deepEqual([...red[1]], nesColor(0x16));
});
