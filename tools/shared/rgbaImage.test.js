import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyRgbaPixels } from './rgbaImage.js';

test('copyRgbaPixels copies pixels into a tightly sized buffer', () => {
  const src = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128]);
  const { width, height, data } = copyRgbaPixels(2, 1, src);
  assert.equal(width, 2);
  assert.equal(height, 1);
  assert.deepEqual([...data], [...src]);
  data[0] = 99;
  assert.equal(src[0], 10, 'must not alias the pack buffer');
});

test('copyRgbaPixels pads a short buffer with zeros', () => {
  const { data } = copyRgbaPixels(1, 1, new Uint8Array([1, 2, 3]));
  assert.deepEqual([...data], [1, 2, 3, 0]);
});
