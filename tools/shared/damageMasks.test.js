import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAMAGE, invincibilityMaskForType, isImmuneToDamage } from './damageMasks.js';

test('Darknut mask allows sword and bomb only', () => {
  const m = invincibilityMaskForType(0x0b);
  assert.equal(isImmuneToDamage(m, DAMAGE.SWORD), false);
  assert.equal(isImmuneToDamage(m, DAMAGE.BOMB), false);
  assert.equal(isImmuneToDamage(m, DAMAGE.ARROW), true);
  assert.equal(isImmuneToDamage(m, DAMAGE.BOOMERANG), true);
});

test('Pols Voice mask is sword-only (arrow handled separately)', () => {
  const m = invincibilityMaskForType(0x16);
  assert.equal(isImmuneToDamage(m, DAMAGE.SWORD), false);
  assert.equal(isImmuneToDamage(m, DAMAGE.BOMB), true);
  assert.equal(isImmuneToDamage(m, DAMAGE.ARROW), true);
});

test('Bubbles / traps are weapon-immortal', () => {
  assert.equal(isImmuneToDamage(invincibilityMaskForType(0x2b), DAMAGE.SWORD), true);
  assert.equal(isImmuneToDamage(invincibilityMaskForType(0x49), DAMAGE.BOMB), true);
});
