import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from './paths.js';
import { decodeScreen, loadOverworldTables } from './overworld.js';
import {
  Q2_ATTRS_B,
  Q2_LAYOUT,
  applyQuest2AttrsToPack,
  applyQuest2OverworldPatch,
  cloneOverworldTables,
  quest2CaveId,
  quest2NeedsLayoutOverlay,
} from './quest2OwPatch.js';
import { fluteActionForRoom } from './whirlwind.js';

const romPath = path.join(ROOT, 'zelda.nes');
const schemaPath = path.join(ROOT, 'assets', 'schema', 'overworld.json');

test('Q2 AttrsB remaps cave ids', () => {
  assert.equal((Q2_ATTRS_B[0x0e] >> 2) & 0x3f, 30);
  assert.equal((Q2_ATTRS_B[0x74] >> 2) & 0x3f, 30);
  assert.equal(quest2CaveId(0x34), 3);
  assert.equal(quest2CaveId(0x3c), 2);
  assert.equal(quest2CaveId(0x37), null);
});

test('layout rooms need overlays', () => {
  assert.equal(quest2NeedsLayoutOverlay(0x0b), true);
  assert.equal(quest2NeedsLayoutOverlay(0x3c), true);
  assert.equal(quest2NeedsLayoutOverlay(0x74), true);
  assert.equal(quest2NeedsLayoutOverlay(0x0e), false);
});

test('cloneOverworldTables does not need Node Buffer', () => {
  const had = globalThis.Buffer;
  delete globalThis.Buffer;
  try {
    const tables = {
      roomLayouts: Uint8Array.from([1, 2, 3]),
      columnHeap: Uint8Array.from([4]),
      screenTable1: Uint8Array.from([5]),
      screenTable2: Uint8Array.from([6]),
      screenTable3: Uint8Array.from([7]),
      monsterTable: Uint8Array.from([8]),
      arrangement: Uint8Array.from([9]),
      columnTableOffsets: [0],
      secretsTable: [0],
      primarySquares: [0],
    };
    const clone = cloneOverworldTables(tables);
    clone.roomLayouts[0] = 99;
    assert.equal(tables.roomLayouts[0], 1);
  } finally {
    globalThis.Buffer = had;
  }
});

test('applyQuest2AttrsToPack updates caveId', () => {
  const pack = {
    mapIndex: 0x0e,
    attrs: { caveId: 24, table2: 0, innerPalette: 0 },
  };
  applyQuest2AttrsToPack(pack);
  assert.equal(pack.attrs.caveId, 30);
});

test('patched tables change layouts for $0B/$3C/$74', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = loadOverworldTables(prg, schema);
  const q1 = decodeScreen(tables, 0x0b);
  const q2 = decodeScreen(applyQuest2OverworldPatch(cloneOverworldTables(tables)), 0x0b);
  assert.notEqual(q1.layoutId, q2.layoutId);
  assert.equal(q2.layoutId, Q2_LAYOUT[0x0b] & 0x7f);
});

test('Q2 $3C layout $7B is a sealed monument, not a truncated rock field', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const q2Tables = applyQuest2OverworldPatch(
    cloneOverworldTables(loadOverworldTables(prg, schema)),
  );
  const screen = decodeScreen(q2Tables, 0x3c);
  assert.equal(screen.layoutId, 0x7b);
  assert.equal(screen.attrs.caveId, 2);
  const squares = screen.squares.flat();
  assert.ok(new Set(squares).size > 1, 'layout $7B must not collapse to one square');
  assert.ok(!squares.includes(0x0c), 'Q2 L2 has no open cave-mouth square');
  assert.equal(fluteActionForRoom(0x3c, 2), 'reveal');
});
