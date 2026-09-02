import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PAD_BINDS,
  activePadSources,
  analogStickDirs,
  extraAxisDirs,
  formatGamepadSlots,
  formatPadProbe,
  hidDpad,
  hidDpadCodesFromDirs,
  isPadCode,
  newPadSource,
  normalizePadBinds,
  padAxis,
  padBtn,
  padButtonDown,
  padCodeLabel,
  padFallbackDirs,
  padSourceActive,
  povHatDirs,
  twinPadAxes,
  validPadCode,
} from './padBinds.js';

function pad(src = {}) {
  return { buttons: [], axes: [], ...src };
}

test('standard face and D-pad codes match the defaults', () => {
  assert.deepEqual(DEFAULT_PAD_BINDS.a, [padBtn(0)]);
  assert.deepEqual(DEFAULT_PAD_BINDS.b, [padBtn(1)]);
  assert.deepEqual(DEFAULT_PAD_BINDS.start, [padBtn(9)]);
  assert.ok(DEFAULT_PAD_BINDS.left.includes(padBtn(14)));
  assert.ok(DEFAULT_PAD_BINDS.left.includes(padAxis(0, -1)));
});

test('pad codes are distinct from keyboard codes', () => {
  assert.equal(isPadCode('PadBtn:14'), true);
  assert.equal(isPadCode('PadAxis:0-'), true);
  assert.equal(isPadCode('HidDpad:left'), true);
  assert.equal(isPadCode('ArrowLeft'), false);
  assert.equal(validPadCode('PadBtn:'), false);
  assert.equal(validPadCode('PadAxis:0'), false);
  assert.equal(validPadCode('HidDpad:left'), true);
  assert.equal(validPadCode('HidDpad:forward'), false);
});

test('a held button or a half-pressed analog still counts as down', () => {
  assert.equal(padButtonDown({ pressed: true, value: 0 }), true);
  assert.equal(padButtonDown({ pressed: false, touched: true, value: 0 }), true);
  assert.equal(padButtonDown({ pressed: false, value: 0.8 }), true);
  assert.equal(padButtonDown({ pressed: false, value: -0.8 }), true);
  assert.equal(padButtonDown({ pressed: false, value: 0.1 }), false);
  assert.equal(padButtonDown(null), false);
});

test('padSourceActive reads buttons and axis signs', () => {
  const gp = pad({
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0],
  });
  gp.buttons[14] = { pressed: true, value: 1 };
  assert.equal(padSourceActive(gp, padBtn(14)), true);
  assert.equal(padSourceActive(gp, padBtn(15)), false);
  gp.axes[0] = -0.9;
  assert.equal(padSourceActive(gp, padAxis(0, -1)), true);
  assert.equal(padSourceActive(gp, padAxis(0, 1)), false);
  gp.axes[0] = -0.2;
  assert.equal(padSourceActive(gp, padAxis(0, -1)), false);
});

test('newPadSource ignores what was already held and prefers buttons', () => {
  const held = pad({
    buttons: [
      { pressed: false, value: 0 },
      { pressed: true, value: 1 },
    ],
    axes: [0.95, 0],
  });
  assert.equal(newPadSource([held], new Set([padBtn(1)])), padAxis(0, 1));
  const face = pad({
    buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }],
    axes: [0.95, 0],
  });
  assert.equal(newPadSource([face], new Set()), padBtn(0));
});

test('newPadSource can bind a Chrome HID D-pad that the Gamepad API never reports', () => {
  const silent = pad({
    mapping: 'standard',
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    axes: [],
  });
  const hid = hidDpadCodesFromDirs({ up: false, down: false, left: true, right: false });
  assert.deepEqual(hid, [hidDpad('left')]);
  assert.equal(newPadSource([silent], new Set(), undefined, hid), hidDpad('left'));
  assert.equal(newPadSource([silent], new Set(hid), undefined, hid), null);
  assert.equal(
    padSourceActive(silent, hidDpad('left'), undefined, { left: true, right: false, up: false, down: false }),
    true,
  );
  assert.equal(padSourceActive(silent, hidDpad('left')), false);
});

test('activePadSources lists every down button and axis', () => {
  const gp = pad({
    buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }],
    axes: [0, 0.8],
  });
  assert.deepEqual(activePadSources(gp), [padBtn(0), padAxis(1, 1)]);
});

test('normalizePadBinds keeps a remap and fills the rest', () => {
  const n = normalizePadBinds({ left: [padBtn(6)], a: ['ArrowLeft'] });
  assert.deepEqual(n.left, [padBtn(6)]);
  assert.deepEqual(n.a, [...DEFAULT_PAD_BINDS.a]);
  assert.deepEqual(n.right, [...DEFAULT_PAD_BINDS.right]);
  const hid = normalizePadBinds({ left: [hidDpad('left')] });
  assert.deepEqual(hid.left, [hidDpad('left')]);
});

test('pad labels name the standard slots and fall back to indexes', () => {
  assert.equal(padCodeLabel(padBtn(0)), 'Pad A');
  assert.equal(padCodeLabel(padBtn(14)), 'Pad ←');
  assert.equal(padCodeLabel(padBtn(22)), 'Btn 22');
  assert.equal(padCodeLabel(padAxis(0, -1)), 'Stick ←');
  assert.equal(padCodeLabel(padAxis(6, 1)), 'Axis 6+');
  assert.equal(padCodeLabel(hidDpad('left')), 'HID ←');
});

test('a Chrome hat axis maps the four D-pad directions', () => {
  // Values from unmapped DualShock-style hats (axis 9): idle > 1, then
  // clockwise from -1 (up). Safari already turned these into buttons 12–15.
  assert.deepEqual(povHatDirs(1.28571), { up: false, down: false, left: false, right: false });
  assert.deepEqual(povHatDirs(0), { up: false, down: false, left: false, right: false });
  assert.deepEqual(povHatDirs(-1), { up: true, down: false, left: false, right: false });
  assert.deepEqual(povHatDirs(0.14286), { up: false, down: true, left: false, right: false });
  assert.deepEqual(povHatDirs(0.71429), { up: false, down: false, left: true, right: false });
  assert.deepEqual(povHatDirs(-0.42857), { up: false, down: false, left: false, right: true });
});

test('fallback dirs read a hat on axis 9 and a DirectInput D-pad on 6/7', () => {
  const hat = pad({ axes: Array.from({ length: 10 }, () => 0) });
  hat.axes[9] = 0.71429;
  assert.equal(padFallbackDirs(hat).left, true);
  assert.equal(padFallbackDirs(hat).right, false);
  const dinput = pad({ axes: [0, 0, 0, 0, 0, 0, -1, 0] });
  assert.equal(padFallbackDirs(dinput).left, true);
  const standard = pad({ mapping: 'standard', axes: [0, 0, 0, 0] });
  assert.deepEqual(padFallbackDirs(standard), {
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const idleHat = pad({ axes: Array.from({ length: 10 }, () => 0) });
  idleHat.axes[9] = 1.28571;
  assert.equal(padFallbackDirs(idleHat).down, false, 'idle hat must not hold a direction');
});

test('integer and degree hats still yield left/right', () => {
  assert.equal(extraAxisDirs(6).left, true);
  assert.equal(extraAxisDirs(2).right, true);
  assert.equal(extraAxisDirs(270).left, true);
  assert.equal(extraAxisDirs(27000).left, true);
  const gp = pad({ axes: Array.from({ length: 10 }, () => 0) });
  gp.axes[9] = 6;
  assert.equal(padFallbackDirs(gp).left, true);
});

test('pad probe names the device and live axes', () => {
  const gp = pad({
    id: 'USB Gamepad',
    mapping: '',
    buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }],
    axes: [0, 0.2, 0, 0, 0, 0, 0, 0, 0, 0.71],
  });
  const text = formatPadProbe(gp);
  assert.match(text, /USB Gamepad/);
  assert.match(text, /raw/);
  assert.match(text, /9:0\.71/);
  assert.match(text, /D-pad/);
});

test('fallback dirs still read stick X when axes.length is 0', () => {
  const gp = { mapping: 'standard', axes: { length: 0, 0: -0.9, 1: 0 } };
  assert.equal(padFallbackDirs(gp).left, true);
  assert.equal(padFallbackDirs(gp).right, false);
});

test('a twin pad with axes supplies stick dirs Chrome stripped', () => {
  const mapped = pad({ mapping: 'standard', axes: [] });
  const twin = pad({ axes: [-0.9, 0] });
  assert.equal(twinPadAxes(mapped, [mapped, twin]), twin.axes);
  assert.equal(analogStickDirs(twin.axes).left, true);
});

test('gamepad slot probe lists empty and occupied indexes', () => {
  assert.match(formatGamepadSlots([null, { buttons: [1, 2], axes: [] }]), /0:—/);
  assert.match(formatGamepadSlots([null, { buttons: [1, 2], axes: [] }]), /1:2b\/0ax/);
});
