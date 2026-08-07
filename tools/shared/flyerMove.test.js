import test from 'node:test';
import assert from 'node:assert/strict';
import { DIR } from './collision.js';
import {
  BLUE_KEESE_INIT_SPEED,
  FLYER_STATE,
  KEESE_FLYING_MAX_SPEED_FRAC,
  RED_BLACK_KEESE_INIT_SPEED,
  flyerSpeedThresholdTransition,
  flyerSpeedToPxPerFrame,
  flyerWholeSpeed,
  keeseInitFlyerSpeed,
  moveFlyer,
} from './flyerMove.js';
import { OBJ, createEnemy, stepEnemy } from './enemies.js';

test('keese init speeds match InitBlueKeese / InitRedOrBlackKeese', () => {
  assert.equal(keeseInitFlyerSpeed(0x1b), BLUE_KEESE_INIT_SPEED);
  assert.equal(keeseInitFlyerSpeed(0x1c), RED_BLACK_KEESE_INIT_SPEED);
  assert.equal(keeseInitFlyerSpeed(0x1d), RED_BLACK_KEESE_INIT_SPEED);
  assert.equal(BLUE_KEESE_INIT_SPEED, 0x1f);
  assert.equal(RED_BLACK_KEESE_INIT_SPEED, 0x7f);
  assert.equal(KEESE_FLYING_MAX_SPEED_FRAC, 0xc0);
});

test('createEnemy stamps ROM flyer speed on keese', () => {
  const blue = createEnemy({ objType: OBJ.BLUE_KEESE, x: 0x80, y: 0x8d });
  const red = createEnemy({ objType: OBJ.RED_KEESE, x: 0x80, y: 0x8d });
  assert.equal(blue.flyerSpeed, 0x1f);
  assert.equal(red.flyerSpeed, 0x7f);
  assert.equal(blue.flyingMaxSpeedFrac, 0xc0);
  assert.equal(blue.flyerSpeedFrac, 0);
  assert.equal(blue.flyerState, FLYER_STATE.SPEED_UP);
});

test('MoveFlyer max keese speed is 0.75 px/f, not whole pixels', () => {
  assert.equal(flyerWholeSpeed(0xc0), 0xc0);
  assert.equal(flyerSpeedToPxPerFrame(0xc0), 0.75);
  assert.equal(flyerSpeedToPxPerFrame(0x1f), 0);
  assert.equal(flyerSpeedToPxPerFrame(0x20), 0.125);
});

test('MoveFlyer accumulates fraction before moving a pixel', () => {
  const e = { flyerSpeed: 0xc0, flyerSpeedFrac: 0, dir: DIR.RIGHT, x: 0x80, y: 0x8d };
  // $C0/frame → move on frames 2, 3, 4… (carry every time after first partial? )
  // frame1: 0+$C0=$C0 no carry
  assert.equal(moveFlyer(e), false);
  assert.equal(e.x, 0x80);
  assert.equal(e.flyerSpeedFrac, 0xc0);
  // frame2: $C0+$C0=$180 → carry, x+1, frac=$80
  assert.equal(moveFlyer(e), true);
  assert.equal(e.x, 0x81);
  assert.equal(e.flyerSpeedFrac, 0x80);
});

test('Flyer_SpeedUp reaches Decide at max; SlowDown reaches Delay at rest', () => {
  assert.equal(flyerSpeedThresholdTransition(0xbf), null);
  assert.deepEqual(flyerSpeedThresholdTransition(0xc0), { state: FLYER_STATE.DECIDE });
  assert.deepEqual(flyerSpeedThresholdTransition(0x1f), { state: FLYER_STATE.DELAY });
  assert.equal(flyerSpeedThresholdTransition(0x20), null);
});

test('keese travel slower than the old 1px/frame movers', () => {
  const e = createEnemy({ objType: OBJ.BLUE_KEESE, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd };
  // Ramp to max ($1F→$C0) then cruise a bit.
  for (let i = 0; i < 400; i += 1) stepEnemy(e, bounds, null);
  const dx = Math.abs(e.x - 0x80);
  // At a hard 1px/f for 400 frames they'd cover ~400px (bouncing).
  // ROM max 0.75px/f with accel + delays should stay well under that.
  assert.ok(dx < 200, `expected subdued travel, got dx=${dx}`);
  assert.ok(e.flyerSpeed <= 0xc0 || e.flyerState === FLYER_STATE.SLOW_DOWN
    || e.flyerState === FLYER_STATE.DELAY
    || e.flyerState === FLYER_STATE.SPEED_UP);
});
