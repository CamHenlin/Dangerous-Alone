import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  BOOM_PHASE,
  boomerangReturnPos,
  enemyBoomerangHitsLink,
  liveBoomerangs,
  playerBoomerang,
  stepBoomerang,
  throwBoomerang,
  throwEnemyBoomerang,
} from './boomerang.js';

test('a throw remembers which player tossed it', () => {
  const boom = throwBoomerang(0x40, 0x8d, DIR.RIGHT, false, 1);
  assert.equal(boom.owner, 1);
  assert.equal(throwBoomerang(0x40, 0x8d, DIR.RIGHT).owner, 0);
});

test('the return target is the thrower, not whoever is standing nearby', () => {
  const p1 = { index: 0, x: 0x30, y: 0x8d };
  const p2 = { index: 1, x: 0xc0, y: 0x8d };
  const boom = throwBoomerang(p2.x, p2.y, DIR.RIGHT, false, 1);
  assert.deepEqual(boomerangReturnPos(boom, [p1, p2], p1), { x: p2.x, y: p2.y });
  assert.deepEqual(boomerangReturnPos(boom, [p1], p1), p1, 'gone thrower falls back');
});

test('a thrown boom flies back to its owner', () => {
  const p1 = { index: 0, x: 0x30, y: 0x8d };
  const p2 = { index: 1, x: 0xc0, y: 0x8d };
  const boom = throwBoomerang(p2.x, p2.y, DIR.RIGHT, false, 1);
  for (let i = 0; i < 80; i += 1) {
    const t = boomerangReturnPos(boom, [p1, p2], p1);
    stepBoomerang(boom, t.x, t.y);
    if (boom.phase === BOOM_PHASE.DONE) break;
  }
  assert.equal(boom.phase, BOOM_PHASE.DONE);
  assert.ok(Math.abs(boom.x - (p2.x + 4)) <= 8, `caught at x=${boom.x}, thrower at ${p2.x}`);
  assert.ok(Math.abs(boom.x - (p1.x + 4)) > 40, 'landed on the other hero');
});

test('each hero owns their own throw in a shared list', () => {
  const p0 = throwBoomerang(0x30, 0x8d, DIR.RIGHT, false, 0);
  const p1 = throwBoomerang(0xc0, 0x8d, DIR.LEFT, false, 1);
  const list = [p0, p1];
  assert.equal(liveBoomerangs(list).length, 2);
  assert.equal(playerBoomerang(list, 0), p0);
  assert.equal(playerBoomerang(list, 1), p1);
  p0.phase = BOOM_PHASE.DONE;
  assert.equal(playerBoomerang(list, 0), null);
  assert.equal(liveBoomerangs(list).length, 1);
});

test('a Goriya boom can catch any hero standing in it', () => {
  const boom = throwEnemyBoomerang(0x40, 0x8d, DIR.RIGHT, 7);
  assert.equal(enemyBoomerangHitsLink(boom, 0x40, 0x8d), true);
  assert.equal(enemyBoomerangHitsLink(boom, 0xc0, 0x8d), false);
  // The focused hero is not special: whoever overlaps is a valid victim.
  const stacked = { x: 0x40, y: 0x8d };
  assert.equal(enemyBoomerangHitsLink(boom, stacked.x, stacked.y), true);
});
