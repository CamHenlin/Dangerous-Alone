import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasCssScale, canvasFitPad, fitScale, integerScale, visibleAvail } from './displayScale.js';
import { frameSize } from './splitLayout.js';

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

test('a co-op frame fills 1080p instead of snapping to an integer postage stamp', () => {
  const { width, height } = frameSize(4);
  const integer = integerScale(1920 - 32, 1080 - 32, width, height);
  const auto = canvasCssScale({
    availW: 1920 - 32,
    availH: 1080 - 32,
    internalW: width,
    internalH: height,
    option: 'auto',
  });
  assert.ok(auto > integer, `expected a fractional fit, got ${auto}`);
  assert.equal(auto, fitScale(1920 - 32, 1080 - 32, width, height));
});

test('a stage taller than the window only counts the visible slice', () => {
  const grown = { left: 0, top: 48, right: 1280, bottom: 48 + 960 };
  const vis = visibleAvail(grown, { width: 1280, height: 720 }, 32);
  assert.equal(vis.availW, 1280 - 32);
  assert.equal(vis.availH, 720 - 48 - 32);
  const scale = canvasCssScale({
    ...vis,
    internalW: 256,
    internalH: 240,
    option: 'auto',
  });
  assert.ok(256 * scale <= vis.availW);
  assert.ok(240 * scale <= vis.availH);
  assert.ok(
    240 * scale < 720,
    'cinematic 256×240 must not keep the co-op stage height',
  );
});

test('a short window shrinks the ROM frame instead of clipping it', () => {
  const scale = canvasCssScale({
    availW: 800,
    availH: 180,
    internalW: 256,
    internalH: 240,
    option: 'auto',
  });
  assert.ok(scale < 1);
  assert.equal(scale, fitScale(800, 180, 256, 240));
});

test('fixed 1–6× still ignore the window', () => {
  const coop = frameSize(4);
  assert.equal(
    canvasCssScale({
      availW: 100,
      availH: 100,
      internalW: coop.width,
      internalH: coop.height,
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

test('immersive mode uses the full stage; chrome keeps a 32px gutter', () => {
  assert.equal(canvasFitPad(false), 32);
  assert.equal(canvasFitPad(true), 0);
});
