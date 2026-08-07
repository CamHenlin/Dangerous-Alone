import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodePatternBlock,
  decodeTileIndices,
  parseLevelInfoPalettes,
  renderTilesRgba,
} from './nes2bpp.js';
import { encodePngRgba } from './png.js';
import { GREY_PREVIEW } from './nesPalette.js';

test('decodeTileIndices reads both bitplanes', () => {
  // Row 0: plane0 bit7=1, plane1 bit7=1 → color 3 at (0,0)
  const tile = Buffer.alloc(16, 0);
  tile[0] = 0b10000000;
  tile[8] = 0b10000000;
  const indices = decodeTileIndices(tile);
  assert.equal(indices[0], 3);
  assert.equal(indices[1], 0);
});

test('decodePatternBlock requires 16-byte tiles', () => {
  assert.throws(() => decodePatternBlock(Buffer.alloc(15)), /multiple of 16/);
  assert.equal(decodePatternBlock(Buffer.alloc(32)).length, 2);
});

test('renderTilesRgba lays out a 16-wide sheet', () => {
  const tiles = decodePatternBlock(Buffer.alloc(16 * 17, 0));
  const palette = GREY_PREVIEW.map(([r, g, b], i) => ({ r, g, b, a: i === 0 ? 0 : 255 }));
  const { width, height, rgba } = renderTilesRgba(tiles, palette, 16);
  assert.equal(width, 128);
  assert.equal(height, 16);
  assert.equal(rgba.length, width * height * 4);
});

test('parseLevelInfoPalettes reads transfer header', () => {
  const buf = Buffer.alloc(36, 0);
  buf[0] = 0x3f;
  buf[1] = 0x00;
  buf[2] = 0x20;
  buf[3] = 0x0f;
  buf[4] = 0x30;
  buf[5] = 0x00;
  buf[6] = 0x12;
  buf[35] = 0xff;
  const parsed = parseLevelInfoPalettes(buf);
  assert.deepEqual(parsed.rows[0], [0x0f, 0x30, 0x00, 0x12]);
  assert.equal(parsed.rows.length, 8);
});

test('encodePngRgba writes a recognizable PNG', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const png = encodePngRgba(2, 2, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.length > 50);
});
