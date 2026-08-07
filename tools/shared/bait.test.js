import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BAIT_PHASES, enemyChasesBait, placeBait, stepBait } from './bait.js';

test('bait lasts 3×$FF phases', () => {
  const b = placeBait(40, 80, DIR.UP);
  assert.equal(b.phase, 0);
  assert.equal(b.alive, true);
  for (let phase = 0; phase < BAIT_PHASES; phase += 1) {
    b.life = 1;
    stepBait(b);
    if (phase < BAIT_PHASES - 1) {
      assert.equal(b.alive, true);
      assert.equal(b.phase, phase + 1);
    }
  }
  assert.equal(b.alive, false);
});

test('Lynel does not chase bait', () => {
  assert.equal(enemyChasesBait(0x01), false);
  assert.equal(enemyChasesBait(0x03), true);
});
