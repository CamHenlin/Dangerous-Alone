import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BASE_SHADE,
  masterPalette,
  MASTER_SIZE,
  SHADES,
  expandRowIndices,
  expandRowRgb,
  masterColor,
  masterIndex,
  packPixel,
  splitPixel,
  toClassicSlots,
} from './masterPalette.js';
import { NES_MASTER_PALETTE, nesColor } from './nesPalette.js';

test('master palette is one full ramp per NES colour', () => {
  assert.equal(MASTER_SIZE, NES_MASTER_PALETTE.length * SHADES);
  assert.equal(masterPalette().length, MASTER_SIZE);
});

test('base shade round-trips every NES color exactly', () => {
  // This is the whole basis of Classic mode: nothing may drift at shade 2.
  for (let i = 0; i < NES_MASTER_PALETTE.length; i += 1) {
    assert.deepEqual([...masterColor(masterIndex(i, BASE_SHADE))], [...nesColor(i)]);
  }
});

test('ramp runs monotonically dark to light', () => {
  const lum = (rgb) => 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  for (let i = 0; i < NES_MASTER_PALETTE.length; i += 1) {
    const steps = Array.from({ length: SHADES }, (_, s) => lum(masterColor(masterIndex(i, s))));
    for (let s = 1; s < SHADES; s += 1) {
      // With 256 levels each step is a fraction of a unit, so per-channel
      // rounding can invert two neighbours by a hair. What matters is that the
      // ramp never visibly goes backwards, hence the tolerance.
      assert.ok(
        steps[s] >= steps[s - 1] - 0.5,
        `NES ${i} shade ${s} (${steps[s]}) below shade ${s - 1} (${steps[s - 1]})`,
      );
    }
  }
});

test('expandRowRgb keeps the original color at each slot base shade', () => {
  const row = [nesColor(0x0f), nesColor(0x30), nesColor(0x12), nesColor(0x16)];
  const expanded = expandRowRgb(row);
  assert.equal(expanded.length, 4 * SHADES);
  for (let slot = 0; slot < 4; slot += 1) {
    assert.deepEqual(expanded[slot * SHADES + BASE_SHADE], [...row[slot]]);
  }
});

test('expandRowIndices maps 4 NES indices onto their full ramps', () => {
  const expanded = expandRowIndices([0x0f, 0x30, 0x12, 0x16]);
  assert.equal(expanded.length, 4 * SHADES);
  assert.equal(expanded[0], 0x0f * SHADES);
  assert.equal(expanded[SHADES + BASE_SHADE], 0x30 * SHADES + BASE_SHADE);
});

test('pixels pack and split symmetrically', () => {
  for (let slot = 0; slot < 4; slot += 1) {
    for (let shade = 0; shade < SHADES; shade += 1) {
      assert.deepEqual(splitPixel(packPixel(slot, shade)), { slot, shade });
    }
  }
});

test('toClassicSlots recovers the original 2bpp art', () => {
  // Uint16: a packed pixel is slot * SHADES + shade, which exceeds a byte once
  // the shade is continuous.
  const original = Uint16Array.from([0, 1, 2, 3, 3, 2, 1, 0]);
  // Any shading applied on top must still flatten back to the source pixels.
  const enhanced = Uint16Array.from(original, (slot, i) => packPixel(slot, i % SHADES));
  assert.deepEqual([...toClassicSlots(enhanced)], [...original]);
});
