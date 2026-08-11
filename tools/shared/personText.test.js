import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { linesForTextId } from './caveText.js';
import {
  dismissLevel9EntranceGate,
  filterLevel9EntranceGate,
  isLevel9EntranceGate,
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

test('Grumble uses PersonText selector $24', () => {
  assert.equal(textIdForUnderworldPerson(7, 0x36), 0x24);
  assert.deepEqual(linesForUnderworldPerson(textLines, 7, 0x36), ['GRUMBLE!GRUMBLE']);
});

test('L9 entrance gate opens only with full triforce and person $4B', () => {
  assert.equal(isLevel9EntranceGate(9, { triforce: 0xff }, 0x4b), true);
  assert.equal(isLevel9EntranceGate(9, { triforce: 0x7f }, 0x4b), false);
  assert.equal(isLevel9EntranceGate(9, { triforce: 0xff }, 0x4c), false);
  assert.equal(isLevel9EntranceGate(8, { triforce: 0xff }, 0x4b), false);
});

test('filterLevel9EntranceGate drops the gatekeeper and requests shutters', () => {
  const spawned = [{ objType: 0x4b }, { objType: 0x12 }];
  const full = filterLevel9EntranceGate(spawned, 9, { triforce: 0xff });
  assert.equal(full.openShutters, true);
  assert.deepEqual(full.remaining.map((e) => e.objType), [0x12]);
  const incomplete = filterLevel9EntranceGate(spawned, 9, { triforce: 0x0f });
  assert.equal(incomplete.openShutters, false);
  assert.equal(incomplete.remaining.length, 2);
});

test('dismissLevel9EntranceGate clears a live gate person', () => {
  const foes = [{ alive: true, objType: 0x4b, hp: 1 }];
  assert.equal(dismissLevel9EntranceGate(foes, 9, { triforce: 0xff }), true);
  assert.equal(foes[0].alive, false);
  assert.equal(dismissLevel9EntranceGate(foes, 9, { triforce: 0xff }), false);
});
