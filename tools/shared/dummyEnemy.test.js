import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { SWORD } from './inventory.js';
import {
  DUMMY_HP,
  enemyTouchesLink,
  spawnDummiesForScreen,
  trySwordHitEnemy,
} from './dummyEnemy.js';
import { SWORD_PHASE, createSwordState } from './sword.js';

test('start screen has no dummies', () => {
  assert.deepEqual(spawnDummiesForScreen(0x77), []);
});

test('other screens spawn 1–2 dummies', () => {
  const a = spawnDummiesForScreen(0x78);
  assert.ok(a.length >= 1 && a.length <= 2);
  assert.equal(a[0].hp, DUMMY_HP);
});

test('wooden sword kills a dummy in one hit', () => {
  const [e] = spawnDummiesForScreen(0x78);
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.RIGHT;
  // Place Link so blade overlaps enemy
  const linkX = e.x - 20;
  const linkY = e.y;
  assert.equal(trySwordHitEnemy(e, sword, linkX, linkY, SWORD.WOOD), true);
  assert.equal(e.alive, false);
});

test('contact uses NES center threshold ($09)', () => {
  const e = {
    id: 1,
    x: 0x80,
    y: 0x80,
    hp: 1,
    dir: DIR.LEFT,
    invuln: 0,
    alive: true,
    roomId: 0,
  };
  assert.equal(enemyTouchesLink(e, 0x80, 0x80), true);
  assert.equal(enemyTouchesLink(e, 0x90, 0x80), false); // one tile beside
  assert.equal(enemyTouchesLink(e, 0xb0, 0x80), false);
});
