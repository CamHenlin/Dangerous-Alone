import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  onTileBoundary,
  turnRateForType,
  wandererDecideFacing,
} from './wandererAi.js';

test('turn rates match NES Update* constants', () => {
  assert.equal(turnRateForType(0x07), 0x70); // slow octorok
  assert.equal(turnRateForType(0x03), 0xa0); // moblin
  assert.equal(turnRateForType(0x30), 0x80); // gibdo
});

test('wanderer faces chase when axis-aligned and rate wins', () => {
  const e = { objType: 0x07, x: 0x80, y: 0x80, dir: DIR.LEFT, turnTimer: 0, turnRate: 0xff };
  wandererDecideFacing(e, { x: 0x80, y: 0xa0 }, () => 0);
  assert.equal(e.dir, DIR.DOWN);
  assert.equal(e.wantsToShoot, true);
});

test('onTileBoundary requires low nibble 0', () => {
  assert.equal(onTileBoundary({ gridOffset: 0 }), true);
  assert.equal(onTileBoundary({ gridOffset: 0x10 }), true);
  assert.equal(onTileBoundary({ gridOffset: 0x05 }), false);
});
