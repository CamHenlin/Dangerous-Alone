import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { linesForTextId } from './caveText.js';
import {
  linesForUnderworldPerson,
  personTextTableForLevel,
  textIdForUnderworldPerson,
} from './personText.js';

const prg = readFileSync(new URL('../../zelda.nes', import.meta.url)).subarray(16);

/** @type {Record<number, string[]>} */
const textLines = {};
for (let id = 0; id < 76; id += 2) {
  textLines[id] = linesForTextId(prg, id);
}

test('level 4 uses selector table B', () => {
  assert.equal(personTextTableForLevel(4), 'b');
  assert.equal(personTextTableForLevel(1), 'a');
  assert.equal(personTextTableForLevel(9), 'c');
});

test('L4 person $4E says walk into the waterfall', () => {
  assert.equal(textIdForUnderworldPerson(4, 0x4e), 0x2c);
  assert.deepEqual(linesForUnderworldPerson(textLines, 4, 0x4e), [
    'WALK INTO THE',
    'WATERFALL',
  ]);
});

test('L1 person $4C is eastmost peninsula tip', () => {
  assert.deepEqual(linesForUnderworldPerson(textLines, 1, 0x4c), [
    'EASTMOST PENNINSULA',
    'IS THE SECRET',
  ]);
});

test('money-or-life uses fixed selector', () => {
  assert.equal(textIdForUnderworldPerson(1, 0x51), 0x36);
  assert.deepEqual(linesForUnderworldPerson(textLines, 5, 0x51), [
    'LEAVE YOUR LIFE',
    'OR MONEY',
  ]);
});
