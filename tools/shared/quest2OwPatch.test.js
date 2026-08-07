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
  quest2NeedsLayoutOverlay,
} from './quest2OwPatch.js';

const romPath = path.join(ROOT, 'zelda.nes');
const schemaPath = path.join(ROOT, 'assets', 'schema', 'overworld.json');

test('Q2 AttrsB remaps cave ids', () => {
  assert.equal((Q2_ATTRS_B[0x0e] >> 2) & 0x3f, 30);
  assert.equal((Q2_ATTRS_B[0x74] >> 2) & 0x3f, 30);
});

test('layout rooms need overlays', () => {
  assert.equal(quest2NeedsLayoutOverlay(0x0b), true);
  assert.equal(quest2NeedsLayoutOverlay(0x3c), true);
  assert.equal(quest2NeedsLayoutOverlay(0x74), true);
  assert.equal(quest2NeedsLayoutOverlay(0x0e), false);
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
