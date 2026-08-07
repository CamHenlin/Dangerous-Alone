import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { PLAY_H } from './continuousCamera.js';
import { shiftPositions } from './roomStream.js';
import {
  expandTrapGenerator,
  isTrapType,
  stepTrap,
  TRAP_RUSH_Y,
  TRAP_STATE,
  TRAP_YS,
} from './trapAi.js';

test('trap $49 expands to 6 children; $4A to 4', () => {
  assert.equal(expandTrapGenerator(0x49).length, 6);
  assert.equal(expandTrapGenerator(0x4a).length, 4);
  assert.equal(isTrapType(0x07), false);
});

test('trap expand records home-room origin', () => {
  const kids = expandTrapGenerator(0x49, { x: 0, y: PLAY_H });
  assert.equal(kids[0].trapOriginX, 0);
  assert.equal(kids[0].trapOriginY, PLAY_H);
  assert.equal(kids[0].y, TRAP_YS[0] + PLAY_H);
});

test('trap senses Link on axis and rushes', () => {
  const e = {
    x: 0x20,
    y: 0x5d,
    dir: DIR.RIGHT,
    trapIndex: 0,
    trapState: TRAP_STATE.SENSE,
    trapOriginX: 0,
    trapOriginY: 0,
    qSpeed: 0,
  };
  stepTrap(e, { x: 0x80, y: 0x5d }, { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd });
  assert.equal(e.trapState, TRAP_STATE.RUSH);
  assert.equal(e.dir, DIR.RIGHT);
});

test('rebased neighbour trap rushes to home-room center, not anchor $90', () => {
  // Soft-enter north from a trap room: positions shift by +PLAY_H.
  // Index 1 is the SW corner (allowed RIGHT|UP) — the one that can chase Link up.
  const e = {
    x: 0x20,
    y: TRAP_YS[1] + PLAY_H,
    dir: DIR.UP,
    trapIndex: 1,
    trapState: TRAP_STATE.SENSE,
    trapOriginX: 0,
    trapOriginY: PLAY_H,
    qSpeedFrac: 0,
  };
  // Link shares the trap's X column in the neighbour room above.
  stepTrap(e, { x: 0x20, y: 0x8d }, { minX: -999, maxX: 999, minY: -999, maxY: 999 });
  assert.equal(e.trapState, TRAP_STATE.RUSH);
  assert.equal(e.dir, DIR.UP);

  for (let i = 0; i < 200; i += 1) {
    stepTrap(e, { x: 0x20, y: 0x8d }, { minX: -999, maxX: 999, minY: -999, maxY: 999 });
    if (e.trapState === TRAP_STATE.RETRACT) break;
  }
  assert.equal(e.trapState, TRAP_STATE.RETRACT);
  // Must stop at the south room's center, not the visible room's $90.
  assert.ok(Math.abs(e.y - (TRAP_RUSH_Y + PLAY_H)) < 5);
  assert.ok(e.y > PLAY_H, 'trap must not migrate into the anchor room');
});

test('shiftPositions rebases trap anchors with the sprite', () => {
  const e = {
    x: 0x20,
    y: 0x5d,
    dir: DIR.UP,
    trapHome: 0x5d,
    trapOriginX: 0,
    trapOriginY: 0,
  };
  shiftPositions([e], 0, PLAY_H);
  assert.equal(e.y, 0x5d + PLAY_H);
  assert.equal(e.trapOriginY, PLAY_H);
  assert.equal(e.trapHome, 0x5d + PLAY_H);
});
