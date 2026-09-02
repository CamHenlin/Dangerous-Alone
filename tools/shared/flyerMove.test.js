import test from 'node:test';
import assert from 'node:assert/strict';
import { DIR } from './collision.js';
import {
  BLUE_KEESE_INIT_SPEED,
  DIRECTIONS8,
  FAIRY_FLYING_MAX_SPEED_FRAC,
  FLYER_DECIDE,
  FLYER_STATE,
  KEESE_FLYING_MAX_SPEED_FRAC,
  PEAHAT_FLYING_MAX_SPEED_FRAC,
  PEAHAT_INIT_SPEED,
  RED_BLACK_KEESE_INIT_SPEED,
  boundFlyer,
  flyerDecideForType,
  flyerDecideState,
  flyerDelayTimer,
  flyerInitMaxSpeed,
  flyerInitSpeed,
  flyerSpeedThresholdTransition,
  flyerSpeedToPxPerFrame,
  flyerWholeSpeed,
  keeseInitFlyerSpeed,
  moveFlyer,
  reverseDir8,
  turnRandomlyDir8,
  turnTowardsPlayer8,
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

test('TurnRandomlyDir8 keeps, turns right, or turns left', () => {
  const up = DIR.UP;
  assert.equal(turnRandomlyDir8(up, 0xa0), up);
  assert.equal(turnRandomlyDir8(up, 0x50), DIRECTIONS8[1]);
  assert.equal(turnRandomlyDir8(up, 0x4f), DIRECTIONS8[7]);
});

test('BoundFlyer reverses 8-way heading at the room lip', () => {
  const e = { x: 0xe0, y: 0x80, dir: DIR.RIGHT };
  const bounds = { minX: 0x11, maxX: 0xdf, minY: 0x4e, maxY: 0xcc };
  assert.equal(boundFlyer(e, bounds), true);
  assert.equal(e.x, bounds.maxX);
  assert.equal(e.dir, reverseDir8(DIR.RIGHT));
  assert.equal(e.dir, DIR.LEFT);
});

test('fairy max speed is slower than keese', () => {
  assert.equal(flyerSpeedToPxPerFrame(FAIRY_FLYING_MAX_SPEED_FRAC), 0.625);
  assert.ok(FAIRY_FLYING_MAX_SPEED_FRAC < KEESE_FLYING_MAX_SPEED_FRAC);
});

test('InitPeahat stamps EndInitFlyer speed $1F and max $A0, facing up', () => {
  const e = createEnemy({ objType: OBJ.PEAHAT, x: 0x80, y: 0x80 });
  assert.equal(e.dir, DIR.UP);
  assert.equal(e.flyerState, FLYER_STATE.SPEED_UP);
  assert.equal(e.flyerSpeed, PEAHAT_INIT_SPEED);
  assert.equal(e.flyingMaxSpeedFrac, PEAHAT_FLYING_MAX_SPEED_FRAC);
  assert.equal(e.timer, 0);
  assert.equal(flyerInitSpeed(OBJ.PEAHAT), PEAHAT_INIT_SPEED);
  assert.equal(flyerInitMaxSpeed(OBJ.PEAHAT), PEAHAT_FLYING_MAX_SPEED_FRAC);
  assert.equal(flyerSpeedToPxPerFrame(PEAHAT_FLYING_MAX_SPEED_FRAC), 0.625);
});

test('Flyer_PeahatDecideState gates differ from keese', () => {
  assert.equal(flyerDecideState(0xb0, FLYER_DECIDE.PEAHAT.chaseMin, FLYER_DECIDE.PEAHAT.wanderMin), FLYER_STATE.CHASE);
  assert.equal(flyerDecideState(0xaf, FLYER_DECIDE.PEAHAT.chaseMin, FLYER_DECIDE.PEAHAT.wanderMin), FLYER_STATE.WANDER);
  assert.equal(flyerDecideState(0x1f, FLYER_DECIDE.PEAHAT.chaseMin, FLYER_DECIDE.PEAHAT.wanderMin), FLYER_STATE.SLOW_DOWN);
  // Keese chase starts at $A0; peahat needs $B0.
  assert.equal(flyerDecideForType(OBJ.BLUE_KEESE, 0xa0), FLYER_STATE.CHASE);
  assert.equal(flyerDecideForType(OBJ.PEAHAT, 0xa0), FLYER_STATE.WANDER);
  assert.equal(flyerDecideForType(OBJ.FLYING_GHINI, 0x08), FLYER_STATE.WANDER);
  assert.equal(flyerDecideForType(OBJ.FLYING_GHINI, 0x07), FLYER_STATE.SLOW_DOWN);
});

test('Flyer_SlowDown rest timer is Random AND $3F OR $40', () => {
  assert.equal(flyerDelayTimer(0x00), 0x40);
  assert.equal(flyerDelayTimer(0x3f), 0x7f);
  assert.equal(flyerDelayTimer(0xff), 0x7f);
});

test('TurnTowardsPlayer8 keeps heading when already aimed within one turn', () => {
  // Facing up, player also up (same X, smaller Y) → exact match on current → keep.
  assert.equal(turnTowardsPlayer8(DIR.UP, 0x80, 0x90, 0x80, 0x70), DIR.UP);
});

test('TurnTowardsPlayer8 turns up-right when facing up with player to the right', () => {
  assert.equal(turnTowardsPlayer8(DIR.UP, 0x80, 0x90, 0x90, 0x90), DIRECTIONS8[1]);
});

test('peahat ramps then rests when decide always picks slow', () => {
  const e = createEnemy({ objType: OBJ.PEAHAT, x: 0x80, y: 0x80 });
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd };
  let sawRest = false;
  for (let i = 0; i < 800; i += 1) {
    stepEnemy(e, bounds, null, { rngByte: () => 0x10 });
    if (e.flyerState === FLYER_STATE.DELAY) sawRest = true;
  }
  assert.ok(sawRest, 'expected flyer state 5 (delay/rest)');
  assert.ok((e.flyerSpeed ?? 0) < 0xa0);
});

test('two peahats with independent rng do not stay stacked', () => {
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd };
  const a = createEnemy({ objType: OBJ.PEAHAT, x: 0x80, y: 0x80 });
  const b = createEnemy({ objType: OBJ.PEAHAT, x: 0x80, y: 0x80 });
  let n = 1;
  const rngA = () => {
    n += 17;
    return n & 0xff;
  };
  const rngB = () => {
    n += 29;
    return n & 0xff;
  };
  for (let i = 0; i < 500; i += 1) {
    stepEnemy(a, bounds, null, { rngByte: rngA, chase: { x: 0x40, y: 0x70 } });
    stepEnemy(b, bounds, null, { rngByte: rngB, chase: { x: 0xc0, y: 0xb0 } });
  }
  const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  assert.ok(dist > 8, `peahats still clustered (manhattan ${dist})`);
});
