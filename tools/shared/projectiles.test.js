import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { createEnemy, OBJ } from './enemies.js';
import { createInventory } from './inventory.js';
import {
  PROJ,
  SHIELD_RESULT,
  bounceProjectile,
  createProjectile,
  shotBlockedByShield,
  stepProjectile,
  tryEnemyShoot,
} from './projectiles.js';

test('octorok fires rock at shoot timer $10 when aligned', () => {
  const e = createEnemy({ objType: OBJ.BLUE_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  e.wantsToShoot = true;
  e.shootTimer = 0x11;
  e.dir = DIR.LEFT;
  const out = [];
  tryEnemyShoot(e, out, undefined, { rngByte: () => 0xff });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, PROJ.ROCK);
});

test('aquamentus shoots three fireballs', () => {
  const e = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0xb0, y: 0x80 });
  e.shootTimer = 0;
  const out = [];
  tryEnemyShoot(e, out);
  assert.equal(out.length, 3);
  assert.ok(out.every((p) => p.kind === PROJ.FIREBALL));
});

test('projectile expires at bounds', () => {
  const p = createProjectile({ kind: PROJ.ROCK, x: 0, y: 0x80, dir: DIR.LEFT, speed: 4 });
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  for (let i = 0; i < 20; i += 1) stepProjectile(p, bounds);
  assert.equal(p.alive, false);
});

test('wood shield parries rock when facing opposite', () => {
  const inv = createInventory();
  const p = createProjectile({ kind: PROJ.ROCK, x: 0x80, y: 0x80, dir: DIR.LEFT });
  const link = { dir: DIR.RIGHT };
  assert.equal(shotBlockedByShield(p, link, inv), SHIELD_RESULT.PARRY);
});

test('wood shield does not stop fireball', () => {
  const inv = createInventory();
  const p = createProjectile({ kind: PROJ.FIREBALL, x: 0x80, y: 0x80, dir: DIR.LEFT });
  assert.equal(shotBlockedByShield(p, { dir: DIR.RIGHT }, inv), SHIELD_RESULT.HARM);
});

test('magic shield parries fireball', () => {
  const inv = createInventory();
  inv.magicShield = 1;
  const p = createProjectile({ kind: PROJ.FIREBALL, x: 0x80, y: 0x80, dir: DIR.LEFT });
  assert.equal(shotBlockedByShield(p, { dir: DIR.RIGHT }, inv), SHIELD_RESULT.PARRY);
});

test('bounceProjectile reverses facing and clears damage', () => {
  const p = createProjectile({ kind: PROJ.ROCK, x: 0x80, y: 0x80, dir: DIR.LEFT, damage: 2 });
  bounceProjectile(p);
  assert.equal(p.dir, DIR.RIGHT);
  assert.equal(p.damage, 0);
  assert.equal(p.bouncing, true);
});
