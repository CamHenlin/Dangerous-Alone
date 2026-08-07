import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  OBJ,
  OW_ENEMY_BOUNDS,
  createEnemy,
  stepEnemy,
} from './enemies.js';
import {
  PROJ,
  tryCardinalShot,
  tryEnemyShoot,
} from './projectiles.js';
import {
  goriyaDecideFacing,
  isGoriyaStyleFacing,
} from './wandererAi.js';

test('Lynel and Goriya use Goriya-style facing', () => {
  assert.equal(isGoriyaStyleFacing(OBJ.RED_LYNEL), true);
  assert.equal(isGoriyaStyleFacing(OBJ.BLUE_LYNEL), true);
  assert.equal(isGoriyaStyleFacing(OBJ.RED_GORIYA), true);
  assert.equal(isGoriyaStyleFacing(OBJ.RED_MOBLIN), false);
  assert.equal(isGoriyaStyleFacing(OBJ.RED_OCTOROK_SLOW), false);
});

test('goriyaDecideFacing aims on longer axis within $51', () => {
  const e = { x: 0x80, y: 0x80, dir: DIR.LEFT, wantsToShoot: false };
  // Mostly horizontal, within range → face right and want to shoot.
  assert.equal(goriyaDecideFacing(e, { x: 0xb0, y: 0x84 }), true);
  assert.equal(e.dir, DIR.RIGHT);
  assert.equal(e.wantsToShoot, true);

  // Beyond $51 → no shot intent.
  e.wantsToShoot = true;
  assert.equal(goriyaDecideFacing(e, { x: 0x80 + 0x51, y: 0x80 }), false);
  assert.equal(e.wantsToShoot, false);
});

test('Lynel charges sword shot then fires at timer $10', () => {
  const e = createEnemy({ objType: OBJ.RED_LYNEL, x: 0x80, y: 0x80 });
  e.wantsToShoot = true;
  e.shootTimer = 0;
  e.dir = DIR.LEFT;
  const out = [];

  tryCardinalShot(e, out, PROJ.SWORD_SHOT, { speed: 3, rngByte: () => 0xff });
  assert.equal(out.length, 0);
  assert.equal(e.shootTimer, 0x30);
  assert.equal(e.qSpeedFrac, 0, 'charging freezes ObjQSpeedFrac');

  e.shootTimer = 0x11;
  tryCardinalShot(e, out, PROJ.SWORD_SHOT, { speed: 3, rngByte: () => 0xff });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, PROJ.SWORD_SHOT);
  assert.equal(e.wantsToShoot, false);
  assert.equal(e.shootTimer, 0x10);
  assert.equal(e.qSpeedFrac, 0);
});

test('blue Lynel rarely starts a shot without prior timer', () => {
  const e = createEnemy({ objType: OBJ.BLUE_LYNEL, x: 0x80, y: 0x80 });
  e.wantsToShoot = true;
  e.shootTimer = 0;
  const out = [];
  tryCardinalShot(e, out, PROJ.SWORD_SHOT, { rngByte: () => 0x00 });
  assert.equal(out.length, 0);
  assert.equal(e.shootTimer, 0);
  assert.equal(e.qSpeedFrac, 0x20, 'keeps room-default walk speed when not firing');
});

test('stepEnemy Lynel faces Link on tile boundary when close', () => {
  const e = createEnemy({ objType: OBJ.RED_LYNEL, x: 0x80, y: 0x80 });
  e.gridOffset = 0;
  e.dir = DIR.UP;
  stepEnemy(e, OW_ENEMY_BOUNDS, null, { chase: { x: 0xa0, y: 0x82 } });
  assert.equal(e.dir, DIR.RIGHT);
  assert.equal(e.wantsToShoot, true);
});

test('tryEnemyShoot Lynel emits sword shot via charge', () => {
  const e = createEnemy({ objType: OBJ.RED_LYNEL, x: 0x80, y: 0x80 });
  e.wantsToShoot = true;
  e.shootTimer = 0x11;
  e.dir = DIR.DOWN;
  const out = [];
  tryEnemyShoot(e, out, undefined, { rngByte: () => 0xff });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, PROJ.SWORD_SHOT);
});
