import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { charFromDemoTile, decodeDemoTextField, decodeDemoTextLines } from './demoText.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROM_PATH = path.join(ROOT, 'zelda.nes');
const SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'demo.json');

test('demo charset maps letters, digits and spaces', () => {
  assert.equal(charFromDemoTile(0x0a), 'A');
  assert.equal(charFromDemoTile(0x23), 'Z');
  assert.equal(charFromDemoTile(0x05), '5');
  assert.equal(charFromDemoTile(0x24), ' ');
  // Unknown / decorative tiles keep a column so padded labels stay aligned.
  assert.equal(charFromDemoTile(0xe4), ' ');
});

test('decodeDemoTextField stops at FF and keeps the column', () => {
  const buf = new Uint8Array([0x07, 0x0a, 0x15, 0x15, 0x24, 0xff, 0x0b]);
  const field = decodeDemoTextField(buf, 0);
  assert.equal(field.column, 7);
  assert.equal(field.text, 'ALL');
  assert.deepEqual(field.tiles, [0x0a, 0x15, 0x15, 0x24]);
});

test('ROM DemoTextFields decode to the treasure crawl labels', { skip: !fs.existsSync(ROM_PATH) }, () => {
  const prg = fs.readFileSync(ROM_PATH).subarray(16);
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const textPrg = Number.parseInt(schema.offsets.textFields.prg, 16);
  const lines = decodeDemoTextLines(prg, textPrg, schema.lineTextOffsets);
  assert.equal(lines.length, 29);
  // Leading/internal space (and decorative) tiles are kept so NT columns stay exact.
  assert.match(lines[0].text, /ALL OF TREASURES/);
  assert.equal(lines[0].text.indexOf('A'), 8);
  assert.equal(lines[1].text, 'HEART     CONTAINER');
  assert.equal(lines[28].text, 'TRIFORCE');
  assert.equal(lines[20].text, 'POWER       RECORDER');
  assert.equal(lines[22].text, 'RAFT       STEPLADDER');
  assert.equal(lines[16].text, 'BLUE          RED');
  // Tile stream keeps NT columns even if the string view is mishandled.
  assert.ok(Array.isArray(lines[7].tiles));
  const whiteAt = lines[7].tiles.findIndex(
    (t, i, a) => t === 0x20 && a[i + 1] === 0x11 && a[i + 2] === 0x12,
  );
  assert.equal(lines[7].column + whiteAt, 20);
});
