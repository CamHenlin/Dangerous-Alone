import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  decodeColumnSquares,
  decodeScreen,
  loadOverworldTables,
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
  assert.equal(tables.roomLayouts.length, 1936);
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
