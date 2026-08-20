import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeBomb } from './bomb.js';
import { bombHitsHero, bombHurtsEligible, bombHurtsHero } from './coopCombat.js';

test('your own bomb can still catch you', () => {
  const bomb = { ...placeBomb(0x40, 0x40, 0), phase: 'explode', owner: 0 };
  const you = { index: 0, link: { x: bomb.x, y: bomb.y } };
  const ally = { index: 1, link: { x: bomb.x, y: bomb.y } };
  assert.equal(bombHurtsEligible(bomb, you), true);
  assert.equal(bombHurtsEligible(bomb, ally), false);
  assert.equal(bombHurtsHero(bomb, you), true);
  assert.equal(bombHurtsHero(bomb, ally), false);
});

test('an unowned bomb is the solo ROM: it hits whoever is there', () => {
  const bomb = { ...placeBomb(0x40, 0x40, 0), phase: 'explode' };
  assert.equal(bombHitsHero(bomb, { x: bomb.x, y: bomb.y }), true);
  assert.equal(bombHurtsEligible(bomb, { index: 0 }), true);
  assert.equal(bombHurtsEligible(bomb, { index: 1 }), true);
});
