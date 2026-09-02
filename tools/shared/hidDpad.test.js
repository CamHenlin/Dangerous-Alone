import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  padHasStrippedDpad,
  padIdIsDragonRise0011,
  parse2Axes8KeysDpad,
} from './hidDpad.js';

test('0079:0011 is the Chrome-stripped DragonRise clone', () => {
  const id = 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)';
  assert.equal(padIdIsDragonRise0011(id), true);
  assert.equal(padHasStrippedDpad({ id, axes: [] }), true);
  assert.equal(padHasStrippedDpad({ id: 'USB Gamepad (Vendor: 0079 Product: 0006)', axes: [] }), true);
  assert.equal(padHasStrippedDpad({ id, axes: [0, 0] }), false);
});

test('2Axes 8Keys X/Y bytes become a D-pad', () => {
  assert.deepEqual(parse2Axes8KeysDpad([127, 127]), {
    up: false,
    down: false,
    left: false,
    right: false,
  });
  assert.equal(parse2Axes8KeysDpad([0, 127]).left, true);
  assert.equal(parse2Axes8KeysDpad([255, 127]).right, true);
  assert.equal(parse2Axes8KeysDpad([127, 0]).up, true);
  assert.equal(parse2Axes8KeysDpad([127, 255]).down, true);
});

test('a report-id prefix still yields left/right from X/Y', () => {
  assert.equal(parse2Axes8KeysDpad([1, 30, 127]).left, true);
  assert.equal(parse2Axes8KeysDpad([1, 255, 127]).right, true);
  assert.equal(parse2Axes8KeysDpad([127, 127, 0]).left, false);
});

test('0079:0011 Chrome reports put left/right on the second stick', () => {
  const rest = [0x01, 0x7f, 0x7f, 0x7f, 0x7f, 0x0f, 0x00, 0x00];
  const left = [0x01, 0x7f, 0x7f, 0x00, 0x7f, 0x0f, 0x00, 0x00];
  const right = [0x01, 0x7f, 0x7f, 0xff, 0x7f, 0x0f, 0x00, 0x00];
  const up = [0x01, 0x7f, 0x7f, 0x7f, 0x00, 0x0f, 0x00, 0x00];
  const down = [0x01, 0x7f, 0x7f, 0x7f, 0xff, 0x0f, 0x00, 0x00];
  assert.deepEqual(parse2Axes8KeysDpad(rest), {
    up: false,
    down: false,
    left: false,
    right: false,
  });
  assert.equal(parse2Axes8KeysDpad(left).left, true);
  assert.equal(parse2Axes8KeysDpad(left).right, false);
  assert.equal(parse2Axes8KeysDpad(right).right, true);
  assert.equal(parse2Axes8KeysDpad(right).left, false);
  assert.equal(parse2Axes8KeysDpad(up).up, true);
  assert.equal(parse2Axes8KeysDpad(down).down, true);
});
