import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasCssScale, fitScale, integerScale } from './displayScale.js';

test('solo 256×240 integer-scales 4× on 1080p', () => {
  assert.equal(integerScale(1920 - 32, 1080 - 32, 256, 240), 4);
  assert.equal(
    canvasCssScale({
      availW: 1920 - 32,
      availH: 1080 - 32,
      internalW: 256,
      internalH: 240,
      option: 'auto',
    }),
    4,
  );
});

test('a 512×544 co-op frame fills 1080p instead of snapping to 1×', () => {
  const integer = integerScale(1920 - 32, 1080 - 32, 512, 544);
  assert.equal(integer, 1);
  const auto = canvasCssScale({
    availW: 1920 - 32,
    availH: 1080 - 32,
    internalW: 512,
    internalH: 544,
    option: 'auto',
  });
  assert.ok(auto > 1.5, `expected a fractional fit, got ${auto}`);
  assert.equal(auto, fitScale(1920 - 32, 1080 - 32, 512, 544));
});

test('fixed 1–6× still ignore the window', () => {
  assert.equal(
    canvasCssScale({
      availW: 100,
      availH: 100,
      internalW: 512,
      internalH: 544,
      option: 2,
    }),
    2,
  );
  assert.equal(
    canvasCssScale({
      availW: 4000,
      availH: 4000,
      internalW: 256,
      internalH: 240,
      option: 6,
    }),
    6,
  );
});
