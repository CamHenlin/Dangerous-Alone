import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { sfxNamesForWeaponHit, WEAPON_PARRY } from './combatSfx.js';
import {
  OBJ,
  createEnemy,
  tryArrowHitEnemy,
  tryBoomerangHitEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import { SWORD } from './inventory.js';
import { throwBoomerang } from './boomerang.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { BOSS } from './bosses.js';
import { GOHMA_EYE } from './bossAi.js';
import { shootArrow } from './projectiles.js';

test('harmed monster posts enemy_die', () => {
  assert.deepEqual(
    sfxNamesForWeaponHit(true, { alive: true, invuln: 16 }),
    ['enemy_die'],
  );
});

test('boss harm posts enemy_die then boss_hit', () => {
  assert.deepEqual(
    sfxNamesForWeaponHit(true, { alive: true, invuln: 16 }, { isBoss: true }),
    ['enemy_die', 'boss_hit'],
  );
});

test('parry posts shield only', () => {
  assert.deepEqual(sfxNamesForWeaponHit(WEAPON_PARRY, { alive: true }), ['shield']);
});

test('dodongo eat/stun (true without invuln/stun) is silent', () => {
  assert.deepEqual(
    sfxNamesForWeaponHit(true, { alive: true, invuln: 0, stunTimer: 0 }),
    [],
  );
});

test('boomerang stun posts enemy_die', () => {
  assert.deepEqual(
    sfxNamesForWeaponHit(true, { alive: true, invuln: 0, stunTimer: 0x50 }),
    ['enemy_die'],
  );
});

test('darknut face-block returns parry', () => {
  const e = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.LEFT;
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3;
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, 0x80 - 20, 0x80, SWORD.WOOD), 'parry');
  assert.equal(e.alive, true);
  assert.equal(e.invuln, 0);
});

test('gohma closed eye returns parry', () => {
  const e = createEnemy({ objType: BOSS.GOHMA, x: 0x80, y: 0x80 });
  e.eyeState = GOHMA_EYE.CLOSED;
  const arrow = shootArrow(e.x, e.y + 20, DIR.UP, 1);
  arrow.x = e.x + 4;
  arrow.y = e.y + 4;
  assert.equal(tryArrowHitEnemy(e, arrow), 'parry');
  assert.equal(arrow.alive, false);
});

test('boomerang-immune foe returns parry', () => {
  const e = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0xb0, y: 0x80 });
  const boom = throwBoomerang(e.x, e.y, DIR.LEFT);
  boom.x = e.x + 4;
  boom.y = e.y + 4;
  assert.equal(tryBoomerangHitEnemy(e, boom), 'parry');
  assert.equal(boom.hit, true);
});
