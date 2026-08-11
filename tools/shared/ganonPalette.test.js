import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GANON_PHASE } from './bossAi.js';
import { nesColor } from './nesPalette.js';
import { GANON_PALETTE_NES, ganonPaletteRgb } from './ganonPalette.js';

test('ganon NES color sets match GanonColorSets brown/blue', () => {
  assert.deepEqual([...GANON_PALETTE_NES.BROWN], [0x0f, 0x07, 0x17, 0x30]);
  assert.deepEqual([...GANON_PALETTE_NES.BLUE], [0x0f, 0x16, 0x2c, 0x3c]);
});

test('ganonPaletteRgb picks brown vs blue by phase', () => {
  const brown = ganonPaletteRgb(GANON_PHASE.BROWN);
  const blue = ganonPaletteRgb(GANON_PHASE.BLUE);
  assert.deepEqual([...brown[1]], [...nesColor(0x07)]);
  assert.deepEqual([...brown[2]], [...nesColor(0x17)]);
  assert.deepEqual([...brown[3]], [...nesColor(0x30)]);
  assert.deepEqual([...blue[1]], [...nesColor(0x16)]);
  assert.deepEqual([...blue[2]], [...nesColor(0x2c)]);
  assert.deepEqual([...blue[3]], [...nesColor(0x3c)]);
});
