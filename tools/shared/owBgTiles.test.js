import assert from 'node:assert/strict';
import { test } from 'node:test';
import { owBgTileSheetIndex, owBgTileSourceRect } from './owBgTiles.js';

test('stairs $70–$73 are first tiles of overworld_bg sheet', () => {
  for (let i = 0; i < 4; i += 1) {
    const loc = owBgTileSheetIndex(0x70 + i);
    assert.deepEqual(loc, { sheetKey: 'overworldBg', index: i, cols: 16 });
    assert.deepEqual(owBgTileSourceRect(0x70 + i), {
      sheetKey: 'overworldBg',
      sx: i * 8,
      sy: 0,
    });
  }
});

test('black entrance $24 comes from common background', () => {
  assert.deepEqual(owBgTileSheetIndex(0x24), {
    sheetKey: 'commonBg',
    index: 0x24,
    cols: 16,
  });
});

test('misc $F3 is sheet-local index 1', () => {
  assert.deepEqual(owBgTileSheetIndex(0xf3), {
    sheetKey: 'misc',
    index: 1,
    cols: 14,
  });
});
