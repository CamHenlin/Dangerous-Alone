import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  onTileBoundary,
  tickWandererTurnTimer,
  truncateWandererGridOffset,
  turnRateForType,
  wandererDecideFacing,
} from './wandererAi.js';

test('turn rates match NES Update* constants', () => {
  assert.equal(turnRateForType(0x07), 0x70); // slow octorok
  assert.equal(turnRateForType(0x03), 0xa0); // moblin
  assert.equal(turnRateForType(0x0b), 0x80); // red darknut
  assert.equal(turnRateForType(0x0c), 0x80); // blue darknut
  assert.equal(turnRateForType(0x30), 0x80); // gibdo
});

test('wanderer faces chase when axis-aligned and rate wins', () => {
  const e = { objType: 0x07, x: 0x80, y: 0x80, dir: DIR.LEFT, turnTimer: 0, turnRate: 0xff };
  wandererDecideFacing(e, { x: 0x80, y: 0xa0 }, () => 0);
  assert.equal(e.dir, DIR.DOWN);
  assert.equal(e.wantsToShoot, true);
});

test('wandererDecideFacing does not tick the turn timer', () => {
  // Timer is decremented by tickWandererTurnTimer every frame (including mid-tile).
  const e = {
    objType: 0x0c,
    x: 0x40,
    y: 0x80,
    dir: DIR.RIGHT,
    turnTimer: 5,
    turnRate: 0x00, // never chase
  };
  wandererDecideFacing(e, { x: 0x80, y: 0x80 }, () => 0xff);
  assert.equal(e.turnTimer, 5);
});

test('tickWandererTurnTimer decrements every call', () => {
  const e = { turnTimer: 3 };
  tickWandererTurnTimer(e);
  assert.equal(e.turnTimer, 2);
  tickWandererTurnTimer(e);
  tickWandererTurnTimer(e);
  assert.equal(e.turnTimer, 0);
  tickWandererTurnTimer(e);
  assert.equal(e.turnTimer, 0);
});

test('onTileBoundary requires low nibble 0', () => {
  assert.equal(onTileBoundary({ gridOffset: 0 }), true);
  assert.equal(onTileBoundary({ gridOffset: 0x10 }), true);
  assert.equal(onTileBoundary({ gridOffset: 0x05 }), false);
});

test('truncateWandererGridOffset zeros multiples of $10', () => {
  const e = { gridOffset: 0x10 };
  truncateWandererGridOffset(e);
  assert.equal(e.gridOffset, 0);
  e.gridOffset = 0x05;
  truncateWandererGridOffset(e);
  assert.equal(e.gridOffset, 0x05);
});

test('expired turn timer turns perpendicular toward chase', () => {
  const e = {
    objType: 0x0c,
    x: 0x40,
    y: 0x40,
    dir: DIR.RIGHT,
    turnTimer: 0,
    turnRate: 0x00, // skip axis chase
  };
  // Facing horizontal → turn vertically toward chase below.
  wandererDecideFacing(e, { x: 0x80, y: 0xa0 }, () => 0x40);
  assert.equal(e.dir, DIR.DOWN);
  assert.equal(e.turnTimer, 0x40);
});
