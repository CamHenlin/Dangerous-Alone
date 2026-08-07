import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OBJ } from './enemies.js';
import {
  BAKED_SPRITE_PALETTE_RGB,
  enemySpritePalette,
  remapPaletteRgba,
  spritePaletteRowsFromSet,
} from './enemyPalette.js';

test('red/blue tektites use different sprite palettes', () => {
  assert.equal(enemySpritePalette(OBJ.BLUE_TEKTITE), 1);
  assert.equal(enemySpritePalette(OBJ.RED_TEKTITE), 2);
});

test('red/blue octoroks and leevers split blue=1 red=2', () => {
  assert.equal(enemySpritePalette(OBJ.BLUE_OCTOROK_SLOW), 1);
  assert.equal(enemySpritePalette(OBJ.RED_OCTOROK_SLOW), 2);
  assert.equal(enemySpritePalette(OBJ.BLUE_LEEVER), 1);
  assert.equal(enemySpritePalette(OBJ.RED_LEEVER), 2);
});

test('remapPaletteRgba swaps baked SP0 green to red SP2', () => {
  const dst = [
    [0, 0, 0],
    [248, 56, 0],
    [252, 160, 68],
    [252, 252, 252],
  ];
  const rgba = new Uint8ClampedArray([
    184, 248, 24, 255, // baked green → red
    0, 0, 0, 0, // transparent
    252, 160, 68, 255, // mid tone stays orange-ish in SP2
  ]);
  remapPaletteRgba(rgba, BAKED_SPRITE_PALETTE_RGB, dst);
  assert.deepEqual([...rgba.subarray(0, 4)], [248, 56, 0, 255]);
  assert.deepEqual([...rgba.subarray(4, 8)], [0, 0, 0, 0]);
  assert.deepEqual([...rgba.subarray(8, 12)], [252, 160, 68, 255]);
});

test('spritePaletteRowsFromSet reads LevelInfo SP rows', () => {
  const set = {
    rowsRgb: Array.from({ length: 8 }, (_, i) => [
      [i, 0, 0],
      [i, 1, 0],
      [i, 2, 0],
      [i, 3, 0],
    ]),
  };
  const rows = spritePaletteRowsFromSet(set);
  assert.equal(rows[0][1][0], 4);
  assert.equal(rows[2][1][0], 6);
});
