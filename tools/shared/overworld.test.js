import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  OW_TREE_PALETTE,
  contrastingTreePaletteRow,
  decodeColumnSquares,
  decodeScreen,
  loadOverworldTables,
  owScreenNesScale,
  paletteRowForSquareWithBurnHint,
  recolorBurnTreeSquareRgba,
  squareToTiles,
} from './overworld.js';
import { ROOT } from './paths.js';

const romPath = path.join(ROOT, 'zelda.nes');
const schemaPath = path.join(ROOT, 'assets', 'schema', 'overworld.json');

function load() {
  if (!fs.existsSync(romPath)) {
    return null;
  }
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return loadOverworldTables(prg, schema);
}

test('overworld tables load on PRG1 ROM', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  assert.equal(tables.roomLayouts.length, 1984);
  assert.equal(tables.arrangement.length, 128);
  assert.equal(tables.startScreen, 0x77);
});

test('Level 1 cave is on screen $37', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const screen = decodeScreen(tables, 0x37);
  assert.equal(screen.attrs.caveId, 1);
  assert.equal(screen.squares.length, 11);
  assert.equal(screen.squares[0].length, 16);
});

test('start screen decodes 11x16 squares', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const screen = decodeScreen(tables, tables.startScreen);
  assert.equal(screen.layoutId, tables.arrangement[tables.startScreen] & 0x7f);
  // Ground square $0E is type-3 (secondary), not consecutive primaries.
  assert.ok(screen.squares[5][7] < 0x10);
  const tiles = squareToTiles(
    screen.squares[5][7],
    tables.primarySquares,
    tables.secondarySquares,
    tables.secretsTable,
  );
  assert.deepEqual(tiles, [0x26, 0x26, 0x26, 0x26]);
});

test('square index chooses secondary vs primary tile mode', () => {
  const primary = Array(56).fill(0x70);
  primary[0x10] = 0x03; // type-1 base tile (value < $10 is fine when index >= $10)
  const secondary = Buffer.alloc(64, 0x24);
  secondary[0] = 0xaa;
  secondary[1] = 0xbb;
  secondary[2] = 0xcc;
  secondary[3] = 0xdd;
  assert.deepEqual(squareToTiles(0, primary, secondary, []), [0xaa, 0xbb, 0xcc, 0xdd]);
  assert.deepEqual(squareToTiles(0x10, primary, secondary, []), [0x03, 0x04, 0x05, 0x06]);
});

test('column decode yields 11 squares', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const squares = decodeColumnSquares(
    tables.columnHeap,
    tables.columnHeapStart,
    tables.columnTableOffsets,
    0x00,
  );
  assert.equal(squares.length, 11);
});

test('contrastingTreePaletteRow flips green ↔ orange forest rows', () => {
  assert.equal(contrastingTreePaletteRow(OW_TREE_PALETTE.GREEN), OW_TREE_PALETTE.ORANGE);
  assert.equal(contrastingTreePaletteRow(OW_TREE_PALETTE.ORANGE), OW_TREE_PALETTE.GREEN);
  assert.equal(contrastingTreePaletteRow(0), 0);
  assert.equal(contrastingTreePaletteRow(1), 1);
});

test('burn secret squares use the opposite forest palette', () => {
  const secrets = [{ row: 5, col: 8, marker: 0xe7, action: 'burn' }];
  assert.equal(
    paletteRowForSquareWithBurnHint(5, 8, 2, 2, secrets),
    OW_TREE_PALETTE.ORANGE,
  );
  assert.equal(
    paletteRowForSquareWithBurnHint(5, 8, 3, 3, secrets),
    OW_TREE_PALETTE.GREEN,
  );
  // Neighbor squares stay on the local forest colour.
  assert.equal(paletteRowForSquareWithBurnHint(5, 7, 2, 2, secrets), 2);
  // Bomb walls are not retinted.
  const bomb = [{ row: 5, col: 8, marker: 0xe6, action: 'bomb' }];
  assert.equal(paletteRowForSquareWithBurnHint(5, 8, 2, 2, bomb), 2);
});

test('recolorBurnTreeSquareRgba swaps only foliage and is idempotent', () => {
  const green = [
    [0, 0, 0],
    [0, 168, 0],
    [252, 224, 168],
    [0, 88, 248],
  ];
  const orange = [
    [0, 0, 0],
    [228, 92, 16],
    [252, 224, 168],
    [0, 88, 248],
  ];
  // One 16×16 square at (0,0) inside a 16-wide strip.
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i += 1) {
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 168;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  // Stamp a cream pixel that must survive.
  rgba[0] = 252;
  rgba[1] = 224;
  rgba[2] = 168;
  assert.equal(recolorBurnTreeSquareRgba(rgba, 16, 0, 0, green, orange), true);
  assert.equal(rgba[0], 252);
  assert.equal(rgba[1], 224);
  assert.equal(rgba[4], 228);
  assert.equal(rgba[5], 92);
  assert.equal(rgba[6], 16);
  // Already orange — second pass is a no-op.
  assert.equal(recolorBurnTreeSquareRgba(rgba, 16, 0, 0, green, orange), false);
});

test('owScreenNesScale maps a 2×-wide backing store onto NES columns', () => {
  assert.deepEqual(owScreenNesScale(256, 176), { scaleX: 1, scaleY: 1 });
  assert.deepEqual(owScreenNesScale(512, 176), { scaleX: 2, scaleY: 1 });
  assert.deepEqual(owScreenNesScale(512, 352), { scaleX: 2, scaleY: 2 });
});

test('recolorBurnTreeSquareRgba on a 2×-wide texture hits NES col 11, not col 5', () => {
  const green = [
    [0, 0, 0],
    [0, 168, 0],
    [252, 224, 168],
    [0, 88, 248],
  ];
  const orange = [
    [0, 0, 0],
    [228, 92, 16],
    [252, 224, 168],
    [0, 88, 248],
  ];
  const width = 512;
  const height = 176;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 168;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  const { scaleX, scaleY } = owScreenNesScale(width, height);
  assert.equal(
    recolorBurnTreeSquareRgba(rgba, width, 11, 7, green, orange, { scaleX, scaleY }),
    true,
  );
  const at = (col, row) => {
    const x = Math.round(col * 16 * scaleX);
    const y = Math.round(row * 16 * scaleY);
    const o = (y * width + x) * 4;
    return [rgba[o], rgba[o + 1], rgba[o + 2]];
  };
  assert.deepEqual(at(11, 7), [228, 92, 16]);
  assert.deepEqual(at(5, 7), [0, 168, 0]);
});
