import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeCaveLines, linesForTextId } from './caveText.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prg = fs.readFileSync(path.join(ROOT, 'zelda.nes')).subarray(16);

test('sword cave text is two full lines', () => {
  const lines = linesForTextId(prg, 0);
  assert.deepEqual(lines, ["IT'S DANGEROUS TO GO", 'ALONE! TAKE THIS']);
});

test('decodeCaveLines honors end-of-message', () => {
  const lo = prg[0x4000];
  const hi = prg[0x4001];
  const cpu = lo | (hi << 8);
  const lines = decodeCaveLines(prg, cpu);
  assert.ok(lines.join(' ').includes('ALONE'));
  assert.ok(!lines.join(' ').includes('['));
});
