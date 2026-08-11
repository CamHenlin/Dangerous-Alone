import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOMB_EXPLODE, BOMB_FUSE, bombHits, placeBomb, stepBomb } from './bomb.js';

test('placeBomb offsets by facing', () => {
  const up = placeBomb(0x80, 0x80, DIR.UP);
  assert.equal(up.y, 0x80 + 2 - 16);
  assert.equal(up.x, 0x80 + 4);
  assert.equal(up.phase, 'fuse');
  assert.equal(up.timer, BOMB_FUSE);
  assert.equal(up.dir, DIR.UP);
  const right = placeBomb(0x80, 0x80, DIR.RIGHT);
  assert.equal(right.x, 0x80 + 4 + 16);
  assert.equal(right.dir, DIR.RIGHT);
});

test('fuse then explode then done', () => {
  let bomb = placeBomb(0x40, 0x40, DIR.DOWN);
  for (let i = 0; i < BOMB_FUSE - 1; i += 1) bomb = stepBomb(bomb);
  assert.equal(bomb.phase, 'fuse');
  bomb = stepBomb(bomb);
  assert.equal(bomb.phase, 'explode');
  assert.equal(bomb.timer, BOMB_EXPLODE);
  for (let i = 0; i < BOMB_EXPLODE - 1; i += 1) bomb = stepBomb(bomb);
  bomb = stepBomb(bomb);
  assert.equal(bomb.phase, 'done');
});

test('bombHits only while exploding', () => {
  const bomb = placeBomb(0x40, 0x40, DIR.RIGHT);
  const target = { x: 0x48, y: 0x48, w: 16, h: 16 };
  assert.equal(bombHits(bomb, target), false);
  bomb.phase = 'explode';
  assert.equal(bombHits(bomb, target), true);
});
