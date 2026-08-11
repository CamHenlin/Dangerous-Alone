import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENHANCED_TILE_PX, enhanceTile } from './enhanceTile.js';
import { scale2x } from './scale2x.js';
import { edgeDistance } from './shading.js';
import { MATERIAL, classifyTile } from './classify.js';
import { findRegions } from './regions.js';
import { BASE_SHADE, packPixel, splitPixel } from '../shared/masterPalette.js';

/** 8x8 slot grid from a compact string, one char per pixel. */
function tile(rows) {
  return Uint8Array.from(rows.join('').split('').map(Number));
}

const BLOB = tile([
  '00000000',
  '00111100',
  '01111110',
  '01111110',
  '01111110',
  '01111110',
  '00111100',
  '00000000',
]);

const SOLID = tile([
  '22222222',
  '22222222',
  '22222222',
  '22222222',
  '22222222',
  '22222222',
  '22222222',
  '22222222',
]);

test('output is a 16x16 tile', () => {
  const { pixels, size } = enhanceTile(BLOB, { kind: 'sprites' });
  assert.equal(size, ENHANCED_TILE_PX);
  assert.equal(pixels.length, ENHANCED_TILE_PX * ENHANCED_TILE_PX);
});

test('shading never changes a pixel to a different palette slot', () => {
  // The whole palette-swap architecture rests on this: shade is extra detail
  // within a colour's own ramp, never a change of colour.
  const upscaled = scale2x(BLOB, 8, 8).pixels;
  const { pixels } = enhanceTile(BLOB, { kind: 'sprites' });
  for (let i = 0; i < pixels.length; i += 1) {
    assert.equal(splitPixel(pixels[i]).slot, upscaled[i], `pixel ${i} changed slot`);
  }
});

test('slot 0 stays fully untouched', () => {
  // Transparent on a sprite, shared backdrop on a background — either way it
  // must not pick up shading.
  const { pixels } = enhanceTile(BLOB, { kind: 'sprites' });
  const upscaled = scale2x(BLOB, 8, 8).pixels;
  for (let i = 0; i < pixels.length; i += 1) {
    // Slot 0 is what the sheet bakes as transparent, whatever its shade.
    if (upscaled[i] === 0) assert.equal(splitPixel(pixels[i]).slot, 0);
  }
});

test('enhancement is deterministic', () => {
  const a = enhanceTile(BLOB, { sheetId: 's', tileIndex: 3, kind: 'sprites' });
  const b = enhanceTile(BLOB, { sheetId: 's', tileIndex: 3, kind: 'sprites' });
  assert.deepEqual([...a.pixels], [...b.pixels]);
});

test('the seed changes the grain but not the shape', () => {
  const a = enhanceTile(SOLID, { sheetId: 's', tileIndex: 0, seed: 1 });
  const b = enhanceTile(SOLID, { sheetId: 's', tileIndex: 0, seed: 2 });
  assert.notDeepEqual([...a.pixels], [...b.pixels]);
  for (let i = 0; i < a.pixels.length; i += 1) {
    assert.equal(splitPixel(a.pixels[i]).slot, splitPixel(b.pixels[i]).slot);
  }
});

test('a solid background tile gets texture rather than being left flat', () => {
  // Open sand and dungeon floor are the most-drawn tiles in the game; if these
  // came back uniform, most of the screen would look untouched.
  const { pixels, material } = enhanceTile(SOLID, { kind: 'background' });
  assert.equal(material, MATERIAL.GROUND);
  const shades = new Set([...pixels].map((p) => splitPixel(p).shade));
  assert.ok(shades.size > 1, 'solid ground tile received no shading variation');
});

test('an empty tile is left completely alone', () => {
  const empty = new Uint8Array(64);
  const { pixels, material } = enhanceTile(empty, { kind: 'background' });
  assert.equal(material, MATERIAL.FLAT);
  // Every pixel is slot 0 at the base shade — the untouched backdrop colour.
  // Writing a plain 0 here would decode as slot 0's *darkest* ramp step and
  // dim every non-black backdrop in the game.
  assert.ok([...pixels].every((p) => p === packPixel(0, BASE_SHADE)));
});

test('slot 0 keeps the exact backdrop colour, not a darkened one', () => {
  const withHole = tile([
    '00000000',
    '01111110',
    '01111110',
    '01111110',
    '01111110',
    '01111110',
    '01111110',
    '00000000',
  ]);
  const { pixels } = enhanceTile(withHole, { kind: 'background' });
  const upscaled = scale2x(withHole, 8, 8).pixels;
  for (let i = 0; i < pixels.length; i += 1) {
    if (upscaled[i] === 0) assert.deepEqual(splitPixel(pixels[i]), { slot: 0, shade: BASE_SHADE });
  }
});

test('scale2x does not round corners at the tile border', () => {
  // Background tiles are enhanced without knowing their neighbours, so any
  // rounding at the boundary would show up as a seam on every wall and lake.
  const halves = tile([
    '11112222',
    '11112222',
    '11112222',
    '11112222',
    '11112222',
    '11112222',
    '11112222',
    '11112222',
  ]);
  const { pixels, width } = scale2x(halves, 8, 8);
  for (let y = 0; y < 16; y += 1) {
    assert.equal(pixels[y * width], 1, `left border row ${y} was altered`);
    assert.equal(pixels[y * width + width - 1], 2, `right border row ${y} was altered`);
  }
});

test('font tiles are detected as glyphs and left crisp', () => {
  // The ROM's letter "B" from common_background, verbatim. Chunky rather than
  // thin — which is exactly why detection keys on the padded character cell
  // (clear bottom row and right column) rather than on stroke thinness.
  const letterB = tile([
    '11111100',
    '11000110',
    '11000110',
    '11111100',
    '11000110',
    '11000110',
    '11111100',
    '00000000',
  ]);
  const { material } = classifyTile(letterB, { kind: 'background' });
  assert.equal(material, MATERIAL.GLYPH);

  // Glyphs take an embossed edge but must never dither: the inside of a stroke
  // has to stay one solid colour, or text breaks up into speckle at read size.
  const { pixels } = enhanceTile(letterB, { kind: 'background' });
  const upscaled = scale2x(letterB, 8, 8).pixels;
  const depth = edgeDistance(upscaled, 16, 16);
  const coreShades = new Set();
  for (let i = 0; i < pixels.length; i += 1) {
    if (upscaled[i] === 1 && depth[i] >= 1) coreShades.add(splitPixel(pixels[i]).shade);
  }
  assert.equal(coreShades.size, 1, `glyph stroke interior broke into ${coreShades.size} shades`);
});

test('regions touching the tile border are not treated as objects', () => {
  // Only enclosed regions may take a body gradient — otherwise the gradient
  // restarts every tile and paints a grid across large surfaces.
  const { regions, labels } = findRegions(scale2x(BLOB, 8, 8).pixels, 16, 16);
  const background = regions[labels[0]];
  assert.equal(background.enclosed, false);
  const blob = regions.find((r) => r.slot === 1);
  assert.equal(blob.enclosed, true);
});
