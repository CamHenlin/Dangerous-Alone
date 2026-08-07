import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { SWORD } from './inventory.js';
import {
  SWORD_PHASE,
  createSwordState,
  isSwordActive,
  rectsOverlap,
  stepSword,
  swordAttackBaseTile,
  swordDamage,
  swordDoesDamage,
  swordDrawPos,
  swordHitbox,
  tryStartSword,
} from './sword.js';

test('tryStartSword requires wood+', () => {
  const sword = createSwordState();
  assert.equal(tryStartSword(sword, DIR.RIGHT, SWORD.NONE), false);
  assert.equal(tryStartSword(sword, DIR.RIGHT, SWORD.WOOD), true);
  assert.equal(sword.phase, SWORD_PHASE.WINDUP);
  assert.equal(tryStartSword(sword, DIR.LEFT, SWORD.WOOD), false); // already swinging
});

test('swing lasts 16 frames with 8-frame hit window', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.UP, SWORD.WOOD);
  let frames = 0;
  let hitFrames = 0;
  while (isSwordActive(sword)) {
    if (swordDoesDamage(sword)) hitFrames += 1;
    stepSword(sword);
    frames += 1;
  }
  assert.equal(frames, 16); // 5+8+1+1+1
  assert.equal(hitFrames, 8);
});

test('swordDamage by tier', () => {
  assert.equal(swordDamage(SWORD.WOOD), 0x10);
  assert.equal(swordDamage(SWORD.WHITE), 0x20);
  assert.equal(swordDamage(SWORD.MAGIC), 0x40);
});

test('hitbox only during HIT phase', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.RIGHT, SWORD.WOOD);
  assert.equal(swordHitbox(sword, 0x80, 0x80), null);
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  const box = swordHitbox(sword, 0x80, 0x80);
  assert.ok(box);
  assert.equal(box.x, 0x80 + 11);
});

test('attack base tiles match CHR', () => {
  assert.equal(swordAttackBaseTile(DIR.LEFT), 0x10);
  assert.equal(swordAttackBaseTile(DIR.DOWN), 0x14);
  assert.equal(swordAttackBaseTile(DIR.UP), 0x18);
});

test('rectsOverlap', () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 8, h: 8 }, { x: 7, y: 7, w: 8, h: 8 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 8, h: 8 }, { x: 8, y: 0, w: 8, h: 8 }), false);
});

test('sword blade hidden in windup, shown in hit', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.RIGHT, SWORD.WOOD);
  assert.equal(swordDrawPos(sword, 0x80, 0x80), null);
  sword.phase = SWORD_PHASE.HIT;
  const pos = swordDrawPos(sword, 0x80, 0x80);
  assert.ok(pos);
  assert.equal(pos.x, 0x80 + 11);
  assert.equal(pos.dir, DIR.RIGHT);
});
