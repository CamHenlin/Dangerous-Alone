import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { expandTrapGenerator, isTrapType, stepTrap, TRAP_STATE } from './trapAi.js';

test('trap $49 expands to 6 children; $4A to 4', () => {
  assert.equal(expandTrapGenerator(0x49).length, 6);
  assert.equal(expandTrapGenerator(0x4a).length, 4);
  assert.equal(isTrapType(0x07), false);
});

test('trap senses Link on axis and rushes', () => {
  const e = {
    x: 0x20,
    y: 0x5d,
    dir: DIR.RIGHT,
    trapIndex: 0,
    trapState: TRAP_STATE.SENSE,
    qSpeed: 0,
  };
  stepTrap(e, { x: 0x80, y: 0x5d }, { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd });
  assert.equal(e.trapState, TRAP_STATE.RUSH);
  assert.equal(e.dir, DIR.RIGHT);
});
