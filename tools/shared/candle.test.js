import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTO_LIGHT_DELAY_FRAMES,
  CANDLE,
  FLAME_MOVE_DIST,
  FLAME_STAND_TIME,
  armDarkRoomAutoLight,
  createCandleRoomState,
  createOwFlame,
  roomIsDark,
  stepDarkRoomAutoLight,
  stepOwFlame,
  tryUseCandle,
} from './candle.js';
import { DIR } from './collision.js';

test('dark room is dark until lit', () => {
  const room = { floorItem: { dark: true } };
  const state = createCandleRoomState();
  assert.equal(roomIsDark(room, state), true);
  state.lit = true;
  assert.equal(roomIsDark(room, state), false);
});

test('blue candle lights once per room stay', () => {
  const room = { floorItem: { dark: true } };
  const state = createCandleRoomState();
  const inv = { candle: CANDLE.BLUE };
  assert.equal(tryUseCandle(inv, state, room).ok, true);
  assert.equal(state.lit, true);
  assert.equal(tryUseCandle(inv, state, room).ok, false);
  // Re-enter resets.
  const again = createCandleRoomState();
  assert.equal(tryUseCandle(inv, again, room).ok, true);
});

test('red candle can be used repeatedly', () => {
  const room = { floorItem: { dark: true } };
  const state = createCandleRoomState();
  const inv = { candle: CANDLE.RED };
  assert.equal(tryUseCandle(inv, state, room).ok, true);
  assert.equal(tryUseCandle(inv, state, room).ok, true);
});

test('candle in lit room still consumes blue use', () => {
  const room = { floorItem: { dark: false } };
  const state = createCandleRoomState();
  const inv = { candle: CANDLE.BLUE };
  const r = tryUseCandle(inv, state, room);
  assert.equal(r.ok, true);
  assert.equal(r.lit, false);
  assert.equal(state.usedCandle, true);
});

test('auto-light arms only for dark rooms when owning a candle', () => {
  const dark = { floorItem: { dark: true } };
  const litRoom = { floorItem: { dark: false } };
  const withCandle = { candle: CANDLE.BLUE };
  const noCandle = { candle: CANDLE.NONE };

  const armed = createCandleRoomState();
  armDarkRoomAutoLight(armed, dark, withCandle);
  assert.equal(armed.autoLightTimer, AUTO_LIGHT_DELAY_FRAMES);

  const noItem = createCandleRoomState();
  armDarkRoomAutoLight(noItem, dark, noCandle);
  assert.equal(noItem.autoLightTimer, 0);

  const bright = createCandleRoomState();
  armDarkRoomAutoLight(bright, litRoom, withCandle);
  assert.equal(bright.autoLightTimer, 0);
});

test('auto-light brightens after delay without consuming blue use', () => {
  const room = { floorItem: { dark: true } };
  const state = createCandleRoomState();
  armDarkRoomAutoLight(state, room, { candle: CANDLE.BLUE });
  assert.equal(roomIsDark(room, state), true);

  for (let i = 0; i < AUTO_LIGHT_DELAY_FRAMES - 1; i += 1) {
    assert.equal(stepDarkRoomAutoLight(state), false);
  }
  assert.equal(roomIsDark(room, state), true);
  assert.equal(stepDarkRoomAutoLight(state), true);
  assert.equal(state.lit, true);
  assert.equal(state.usedCandle, false);
  assert.equal(roomIsDark(room, state), false);
  // Blue flame still available after QoL light.
  assert.equal(tryUseCandle({ candle: CANDLE.BLUE }, state, room).ok, true);
});

test('manual candle cancels pending auto-light', () => {
  const room = { floorItem: { dark: true } };
  const state = createCandleRoomState();
  armDarkRoomAutoLight(state, room, { candle: CANDLE.RED });
  assert.ok(state.autoLightTimer > 0);
  tryUseCandle({ candle: CANDLE.RED }, state, room);
  assert.equal(state.autoLightTimer, 0);
  assert.equal(stepDarkRoomAutoLight(state), false);
});

test('flame walks $10 then stands $3F', () => {
  const flame = createOwFlame(0x40, 0x80, DIR.RIGHT);
  assert.equal(flame.phase, 'move');
  for (let i = 0; i < FLAME_MOVE_DIST; i += 1) stepOwFlame(flame);
  assert.equal(flame.phase, 'stand');
  assert.equal(flame.timer, FLAME_STAND_TIME);
  for (let i = 0; i < FLAME_STAND_TIME; i += 1) stepOwFlame(flame);
  assert.equal(flame.alive, false);
});
