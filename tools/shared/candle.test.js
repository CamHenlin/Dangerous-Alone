import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANDLE,
  FLAME_MOVE_DIST,
  FLAME_STAND_TIME,
  createCandleRoomState,
  createOwFlame,
  roomIsDark,
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

test('flame walks $10 then stands $3F', () => {
  const flame = createOwFlame(0x40, 0x80, DIR.RIGHT);
  assert.equal(flame.phase, 'move');
  for (let i = 0; i < FLAME_MOVE_DIST; i += 1) stepOwFlame(flame);
  assert.equal(flame.phase, 'stand');
  assert.equal(flame.timer, FLAME_STAND_TIME);
  for (let i = 0; i < FLAME_STAND_TIME; i += 1) stepOwFlame(flame);
  assert.equal(flame.alive, false);
});
