import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  roomItemPlaysFanfare,
  sessionMusicApplies,
  sessionMusicName,
  sessionMusicPlayer,
} from './sessionMusic.js';

test('the song follows seat 0 even when they are dead', () => {
  const p1 = { index: 0, inv: { dead: true } };
  const p2 = { index: 1, inv: { dead: false } };
  assert.equal(sessionMusicPlayer([p1, p2]), p1);
  assert.equal(sessionMusicApplies(p1), true);
  assert.equal(sessionMusicApplies(p2), false);
});

test('an empty roster has no music owner', () => {
  assert.equal(sessionMusicPlayer([]), null);
  assert.equal(sessionMusicPlayer(null), null);
  assert.equal(sessionMusicApplies(null), false);
});

test('caves keep the overworld playlist; level 9 has its own', () => {
  assert.equal(sessionMusicName('overworld'), 'overworld');
  assert.equal(sessionMusicName('cave'), 'overworld');
  assert.equal(sessionMusicName('dungeon', 1), 'underworld');
  assert.equal(sessionMusicName('dungeon', 9), 'level9');
  assert.equal(sessionMusicName('title'), null);
});

test('floor pickups do not replace the song; the triforce shard does', () => {
  assert.equal(roomItemPlaysFanfare(0x16), false, 'compass');
  assert.equal(roomItemPlaysFanfare(0x17), false, 'map');
  assert.equal(roomItemPlaysFanfare(0x19), false, 'key');
  assert.equal(roomItemPlaysFanfare(0x1a), false, 'heart container');
  assert.equal(roomItemPlaysFanfare(0x1b), true, 'triforce');
});
