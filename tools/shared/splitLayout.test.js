import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUAD_H, QUAD_W, emptyQuadrants, frameSize, quadrantOrigin } from './splitLayout.js';

test('one player is the ROM frame', () => {
  assert.deepEqual(frameSize(1), { width: 256, height: 240, cols: 1, rows: 1 });
  assert.deepEqual(quadrantOrigin(0, 1), { x: 0, y: 0 });
});

test('two players open the same 2×2 as four, with empty join cells', () => {
  assert.deepEqual(frameSize(2), frameSize(4));
  assert.deepEqual(quadrantOrigin(0, 2), { x: 0, y: 0 });
  assert.deepEqual(quadrantOrigin(1, 2), { x: QUAD_W, y: 0 });
  assert.deepEqual(quadrantOrigin(2, 2), { x: 0, y: QUAD_H });
  assert.deepEqual(quadrantOrigin(3, 2), { x: QUAD_W, y: QUAD_H });
});

test('four players fill a 2×2 with room for a shared bar', () => {
  const f = frameSize(4);
  assert.equal(f.width, 512);
  assert.equal(f.height, QUAD_H * 2 + 64);
  assert.deepEqual(quadrantOrigin(2, 4), { x: 0, y: QUAD_H });
  assert.deepEqual(quadrantOrigin(3, 4), { x: QUAD_W, y: QUAD_H });
});

test('empty quadrants are join prompts in every co-op layout', () => {
  assert.deepEqual(emptyQuadrants([0], 1), []);
  assert.deepEqual(emptyQuadrants([0, 1], 2), [2, 3]);
  assert.deepEqual(emptyQuadrants([0, 1, 2], 3), [3]);
  assert.deepEqual(emptyQuadrants([0, 1, 2, 3], 4), []);
  // Player one left; the remaining seats still occupy their own cells.
  assert.deepEqual(emptyQuadrants([1, 2], 2), [0, 3]);
});

test('a missing count is one player, not a zero-size canvas', () => {
  assert.deepEqual(frameSize(0), frameSize(1));
  assert.deepEqual(frameSize(undefined), frameSize(1));
});
