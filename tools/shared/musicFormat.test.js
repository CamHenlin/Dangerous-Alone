import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  expandSong,
  finalizeSongDuration,
  noteToHz,
  periodToHz,
  readSongDescriptor,
} from './musicFormat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bank0 = fs.readFileSync(path.join(ROOT, 'zelda.nes')).subarray(16, 16 + 0x4000);

test('periodToHz matches CA G7 ~3107', () => {
  assert.ok(Math.abs(periodToHz(0x23) - 3107.6) < 2);
});

function delaySetsFromBank() {
  /** @type {number[][]} */
  const delaySets = [];
  for (let i = 0; i < 5; i += 1) {
    delaySets.push([...bank0.subarray(0x1fd1 + i * 8, 0x1fd1 + i * 8 + 8)]);
  }
  return delaySets;
}

test('overworld A1 song expands with melody + bass', () => {
  const noteTable = bank0.subarray(0x1f00, 0x1f00 + 114);
  const delaySets = delaySetsFromBank();
  const desc = readSongDescriptor(bank0, 0x7d);
  assert.equal(desc.delaySetBase, 0x10); // indexes NoteDelaySet+$10 = main-theme set
  assert.equal(desc.delaySet, 2);
  const song = finalizeSongDuration(expandSong(desc, bank0, delaySets, noteTable));
  assert.ok(song.channels.sq1.length > 5);
  assert.ok(song.channels.triangle.length > 5);
  assert.ok(song.durationFrames > 60);
  // Bb4 at note $32
  assert.ok(noteToHz(noteTable, 0x32) > 450 && noteToHz(noteTable, 0x32) < 480);
});

test('item fanfare duration follows voice A (not OW script bleed)', () => {
  const noteTable = bank0.subarray(0x1f00, 0x1f00 + 114);
  const song = finalizeSongDuration(
    expandSong(readSongDescriptor(bank0, 0x67), bank0, delaySetsFromBank(), noteTable),
  );
  const sq1End = song.channels.sq1.reduce((m, e) => Math.max(m, e.t + e.dur), 0);
  assert.equal(song.durationFrames, 84);
  assert.ok(sq1End > song.durationFrames, 'harmony script continues past phrase');
});
