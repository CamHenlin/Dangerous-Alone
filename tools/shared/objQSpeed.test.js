import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLUE_LEEVER_STATE_QSPEEDS,
  DEFAULT_OBJ_QSPEED_FRAC,
  QSPEED,
  RED_LEEVER_STATE_QSPEEDS,
  armosQSpeedFrac,
  consumeQSpeedPixels,
  qSpeedFracForType,
  qSpeedToPxPerFrame,
  usesObjQSpeed,
} from './objQSpeed.js';
import { OBJ, createEnemy, stepEnemy } from './enemies.js';
import { DIR } from './collision.js';

test('room-default and named Init speeds match the ROM', () => {
  assert.equal(DEFAULT_OBJ_QSPEED_FRAC, 0x20);
  assert.equal(qSpeedFracForType(OBJ.RED_LYNEL), 0x20);
  assert.equal(qSpeedFracForType(OBJ.RED_OCTOROK_SLOW), 0x20);
  assert.equal(qSpeedFracForType(OBJ.RED_OCTOROK_FAST), 0x30);
  assert.equal(qSpeedFracForType(OBJ.BLUE_OCTOROK_FAST), 0x30);
  assert.equal(qSpeedFracForType(OBJ.RED_DARKNUT), 0x20);
  assert.equal(qSpeedFracForType(OBJ.BLUE_DARKNUT), 0x28);
  assert.equal(qSpeedFracForType(OBJ.ZOL), 0x18);
  assert.equal(qSpeedFracForType(OBJ.GEL), 0x40);
  assert.equal(qSpeedFracForType(OBJ.BUBBLE), 0x40);
  assert.equal(qSpeedFracForType(OBJ.BUBBLE_BLUE), 0x40);
  assert.equal(qSpeedFracForType(OBJ.ROPE), 0x20);
  assert.equal(qSpeedFracForType(OBJ.WALLMASTER), 0x18);
  assert.equal(qSpeedFracForType(OBJ.GHINI), 0x20);
  assert.equal(qSpeedFracForType(OBJ.STALFOS), 0x20);
  assert.equal(qSpeedFracForType(OBJ.GIBDO), 0x20);
  assert.equal(qSpeedFracForType(OBJ.TRAP), 0);
});

test('flyers and jumpers do not use ObjQSpeedFrac', () => {
  assert.equal(usesObjQSpeed(OBJ.PEAHAT), false);
  assert.equal(usesObjQSpeed(OBJ.BLUE_KEESE), false);
  assert.equal(usesObjQSpeed(OBJ.BLUE_TEKTITE), false);
  assert.equal(usesObjQSpeed(OBJ.ZORA), true, 'Zora shares BlueLeeverStateQSpeeds');
  assert.equal(qSpeedFracForType(OBJ.PEAHAT), undefined);
  assert.equal(qSpeedFracForType(OBJ.ZORA), BLUE_LEEVER_STATE_QSPEEDS[0]);
});

test('MoveObject averages match disassembly comments', () => {
  assert.equal(qSpeedToPxPerFrame(0x20), 0.5);
  assert.equal(qSpeedToPxPerFrame(0x28), 0.625);
  assert.equal(qSpeedToPxPerFrame(0x30), 0.75);
  assert.equal(qSpeedToPxPerFrame(0x40), 1);
  assert.equal(qSpeedToPxPerFrame(0x60), 1.5);
  assert.equal(qSpeedToPxPerFrame(0x70), 1.75);

  const e = { qSpeedFrac: 0x20, posFrac: 0 };
  let px = 0;
  for (let i = 0; i < 2; i += 1) px += consumeQSpeedPixels(e);
  assert.equal(px, 1, '$20 → 1 px every 2 frames');

  const fast = { qSpeedFrac: 0x30, posFrac: 0 };
  px = 0;
  for (let i = 0; i < 4; i += 1) px += consumeQSpeedPixels(fast);
  assert.equal(px, 3, '$30 → 3 px every 4 frames');
});

test('leever state tables match Z_04.asm', () => {
  assert.deepEqual([...BLUE_LEEVER_STATE_QSPEEDS], [0x08, 0x0a, 0x10, 0x20, 0x10, 0x0a]);
  assert.deepEqual([...RED_LEEVER_STATE_QSPEEDS], [0x00, 0x00, 0x00, 0x20, 0x00, 0x00]);
});

test('armos wake picks $20 or $60 from Random', () => {
  assert.equal(armosQSpeedFrac(0x7f), QSPEED.ARMOS_SLOW);
  assert.equal(armosQSpeedFrac(0x80), QSPEED.ARMOS_FAST);
});

test('createEnemy stamps ROM QSpeedFrac on walkers', () => {
  const samples = [
    [OBJ.RED_MOBLIN, 0x20],
    [OBJ.BLUE_OCTOROK_FAST, 0x30],
    [OBJ.BLUE_DARKNUT, 0x28],
    [OBJ.ZOL, 0x18],
    [OBJ.GEL, 0x40],
    [OBJ.BUBBLE_RED, 0x40],
    [OBJ.ROPE, 0x20],
    [OBJ.WALLMASTER, 0x18],
  ];
  for (const [type, frac] of samples) {
    const e = createEnemy({ objType: type, x: 0x80, y: 0x80 });
    assert.equal(e.qSpeedFrac, frac, `type $${type.toString(16)}`);
    assert.equal(e.walkQSpeedFrac, frac);
  }
});

test('slow octorok walks at 0.5 px/frame (not 1)', () => {
  const wide = { minX: 0x20, maxX: 0xe0, minY: 0x50, maxY: 0xc0 };
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 0xff;
  const x0 = e.x;
  for (let i = 0; i < 64; i += 1) stepEnemy(e, wide);
  const moved = e.x - x0;
  // $20 × 64 frames → 32 px.
  assert.ok(moved >= 28 && moved <= 36, `moved ${moved}`);
});

test('fast octorok walks at 0.75 px/frame', () => {
  const wide = { minX: 0x20, maxX: 0xe0, minY: 0x50, maxY: 0xc0 };
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_FAST, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 0xff;
  const x0 = e.x;
  for (let i = 0; i < 64; i += 1) stepEnemy(e, wide);
  const moved = e.x - x0;
  // $30 × 64 → 48 px.
  assert.ok(moved >= 44 && moved <= 52, `moved ${moved}`);
});

test('bubble walks at 1 px/frame', () => {
  const wide = { minX: 0x20, maxX: 0xe0, minY: 0x50, maxY: 0xc0 };
  const e = createEnemy({ objType: OBJ.BUBBLE, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 0xff;
  const x0 = e.x;
  for (let i = 0; i < 32; i += 1) stepEnemy(e, wide);
  assert.equal(e.x - x0, 32);
});

test('rope rush uses QSpeed $60 (1.5 px/frame)', () => {
  const wide = { minX: 0x20, maxX: 0xe0, minY: 0x50, maxY: 0xc0 };
  const e = createEnemy({ objType: OBJ.ROPE, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  // Axis-aligned with Link horizontally → rush.
  const x0 = e.x;
  for (let i = 0; i < 16; i += 1) {
    stepEnemy(e, wide, null, { link: { x: 0xc0, y: 0x80 } });
  }
  assert.equal(e.qSpeedFrac, QSPEED.ROPE_RUSH);
  const moved = e.x - x0;
  // 1.5 × 16 = 24.
  assert.ok(moved >= 20 && moved <= 28, `rushed ${moved}`);
});
