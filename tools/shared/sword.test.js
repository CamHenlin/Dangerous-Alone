import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { SWORD } from './inventory.js';
import {
  ROD_MELEE_DAMAGE,
  SWORD_PHASE,
  SWING_KIND,
  cancelSword,
  createSwordState,
  isRodSwing,
  isSwordActive,
  rectsOverlap,
  stepSword,
  swordArcAngle,
  swordArcProgress,
  swordAttackBaseTile,
  swordDamage,
  swordDoesDamage,
  swordDrawPos,
  swordHitbox,
  swordSpawnsShot,
  swordSpriteRotation,
  swingMeleeDamage,
  tryStartRod,
  tryStartSword,
} from './sword.js';

test('cancelSword aborts a mid-swing blade', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.UP, SWORD.WOOD);
  assert.equal(isSwordActive(sword), true);
  cancelSword(sword);
  assert.equal(isSwordActive(sword), false);
  assert.equal(sword.phase, 0);
  assert.equal(sword.timer, 0);
});

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

test('hitbox only during HIT phase and sweeps with the arc', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.RIGHT, SWORD.WOOD);
  assert.equal(swordHitbox(sword, 0x80, 0x80), null);
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  const early = swordHitbox(sword, 0x80, 0x80);
  assert.ok(early);
  sword.timer = 1;
  const late = swordHitbox(sword, 0x80, 0x80);
  assert.ok(late);
  // Arc should move the box — not a static poke at +11.
  assert.ok(early.x !== late.x || early.y !== late.y);
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

test('sword blade hidden in windup, shown in hit with angle', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.RIGHT, SWORD.WOOD);
  assert.equal(swordDrawPos(sword, 0x80, 0x80), null);
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  const pos = swordDrawPos(sword, 0x80, 0x80);
  assert.ok(pos);
  assert.equal(pos.dir, DIR.RIGHT);
  assert.equal(typeof pos.angle, 'number');
  assert.ok(Number.isFinite(swordSpriteRotation(pos.angle)));
});

test('arc progress advances across the hit window', () => {
  const sword = createSwordState();
  tryStartSword(sword, DIR.DOWN, SWORD.WOOD);
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  const a0 = swordArcAngle(sword);
  const p0 = swordArcProgress(sword);
  sword.timer = 1;
  const a1 = swordArcAngle(sword);
  const p1 = swordArcProgress(sword);
  assert.ok(p1 > p0);
  assert.ok(a1 !== a0);
});

test('tryStartRod uses the sword swing without needing a blade', () => {
  const sword = createSwordState();
  assert.equal(tryStartRod(sword, DIR.UP), true);
  assert.equal(isSwordActive(sword), true);
  assert.equal(isRodSwing(sword), true);
  assert.equal(sword.kind, SWING_KIND.ROD);
  assert.equal(tryStartSword(sword, DIR.LEFT, SWORD.WOOD), false);
  assert.equal(tryStartRod(sword, DIR.DOWN), false);
});

test('rod swing still fires MakeMagicShot at RECOVER_A', () => {
  const sword = createSwordState();
  assert.equal(tryStartRod(sword, DIR.RIGHT), true);
  let spawnFrames = 0;
  while (isSwordActive(sword)) {
    const prev = sword.phase;
    stepSword(sword);
    if (swordSpawnsShot(sword, prev)) spawnFrames += 1;
  }
  assert.equal(spawnFrames, 1);
  assert.equal(isRodSwing(sword), false);
});

test('rod melee is a fixed $20', () => {
  const sword = createSwordState();
  tryStartRod(sword, DIR.RIGHT);
  assert.equal(swingMeleeDamage(sword, SWORD.WOOD), ROD_MELEE_DAMAGE);
  assert.equal(swingMeleeDamage(sword, SWORD.MAGIC), ROD_MELEE_DAMAGE);
});
