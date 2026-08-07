import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { createEnemy, OBJ } from './enemies.js';
import {
  aimFireball,
  calcDiagonalSpeedIndex,
  directionsAndDistancesToTarget,
  stepFireballAxes,
} from './fireball.js';
import {
  PROJ,
  shootFireball,
  stepProjectile,
  tryEnemyShoot,
} from './projectiles.js';

test('directionsAndDistancesToTarget faces Link on both axes', () => {
  const d = directionsAndDistancesToTarget(0x40, 0x80, 0xa0, 0x50);
  assert.equal(d.dirX, DIR.RIGHT);
  assert.equal(d.dirY, DIR.UP);
  assert.equal(d.distX, 0x60);
  assert.equal(d.distY, 0x30);
});

test('calcDiagonalSpeedIndex is 4 when distances are close', () => {
  assert.equal(calcDiagonalSpeedIndex(40, 40), 4);
  assert.equal(calcDiagonalSpeedIndex(40, 45), 4);
});

test('calcDiagonalSpeedIndex leans horizontal when X dominates', () => {
  assert.ok(calcDiagonalSpeedIndex(100, 10) <= 2);
});

test('calcDiagonalSpeedIndex leans vertical when Y dominates', () => {
  assert.ok(calcDiagonalSpeedIndex(10, 100) >= 6);
});

test('aimFireball southeast picks RIGHT|DOWN', () => {
  const a = aimFireball(0x40, 0x40, 0xb0, 0xb0);
  assert.equal(a.dirX, DIR.RIGHT);
  assert.equal(a.dirY, DIR.DOWN);
  assert.equal(a.dir, DIR.RIGHT | DIR.DOWN);
  assert.ok(a.qSpeedX > 0);
  assert.ok(a.qSpeedY > 0);
});

test('stepFireballAxes moves toward target over frames', () => {
  const p = { x: 0x40, y: 0x80, posFracX: 0, posFracY: 0 };
  const a = aimFireball(p.x, p.y, 0xc0, 0x80);
  for (let i = 0; i < 30; i += 1) {
    stepFireballAxes(p, a.dirX, a.dirY, a.qSpeedX, a.qSpeedY);
  }
  assert.ok(p.x > 0x40, `expected rightward, x=${p.x}`);
  assert.equal(p.y, 0x80); // pure horizontal aim
});

test('Zora fireball aims at Link, not facing dir', () => {
  const e = createEnemy({ objType: OBJ.ZORA, x: 0x30, y: 0x6d });
  e.zoraState = 3;
  e.shootTimer = 0;
  e.dir = DIR.UP; // facing must not decide the shot
  const out = [];
  tryEnemyShoot(e, out, undefined, { target: { x: 0xd0, y: 0xc0 } });
  assert.equal(out.length, 1);
  const p = out[0];
  assert.equal(p.kind, PROJ.FIREBALL);
  assert.equal(p.homing, true);
  assert.equal(p.dirX, DIR.RIGHT);
  assert.equal(p.dirY, DIR.DOWN);
  assert.ok(p.delay > 0);
});

test('homing fireball drifts toward target after delay', () => {
  const p = shootFireball(PROJ.FIREBALL, 0x40, 0x80, 0xc0, 0x40, { delay: 0 });
  const bounds = { minX: 0x10, maxX: 0xf0, minY: 0x40, maxY: 0xd0 };
  const x0 = p.x;
  const y0 = p.y;
  for (let i = 0; i < 40; i += 1) stepProjectile(p, bounds);
  assert.ok(p.x > x0);
  assert.ok(p.y < y0);
});
