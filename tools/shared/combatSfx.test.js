import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { sfxNamesForWeaponHit, WEAPON_PARRY } from './combatSfx.js';
import {
  OBJ,
  createEnemy,
  tryArrowHitEnemy,
  tryBeamOrRodHitEnemy,
  tryBombHitEnemy,
  tryBoomerangHitEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import { SWORD } from './inventory.js';
import { throwBoomerang } from './boomerang.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { BOSS } from './bosses.js';
import { GOHMA_EYE } from './bossAi.js';
import { shootArrow, shootSwordBeam } from './projectiles.js';
import { placeBomb } from './bomb.js';

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

test('darknut side slash connects', () => {
  const e = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.LEFT;
  const hp = e.hp;
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3;
  sword.dir = DIR.UP;
  assert.equal(trySwordHitEnemy(e, sword, 0x80, 0x80 + 20, SWORD.WOOD), true);
  assert.ok(e.hp < hp);
});

test('darknut sword beam face-block returns parry', () => {
  const e = createEnemy({ objType: OBJ.BLUE_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.DOWN;
  const beam = shootSwordBeam(e.x, e.y + 20, DIR.UP, SWORD.WOOD);
  beam.x = e.x + 4;
  beam.y = e.y + 4;
  assert.equal(tryBeamOrRodHitEnemy(e, beam), 'parry');
  assert.equal(beam.alive, false);
  assert.equal(e.invuln, 0);
});

test('darknut bomb face-block returns parry', () => {
  const e = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.LEFT;
  const hp = e.hp;
  const bomb = placeBomb(e.x - 20, e.y, DIR.RIGHT);
  bomb.phase = 'explode';
  bomb.x = e.x;
  bomb.y = e.y;
  assert.equal(tryBombHitEnemy(e, bomb), 'parry');
  assert.equal(e.hp, hp);
  assert.equal(e.invuln, 0);
});

test('darknut bomb from behind connects', () => {
  const e = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.LEFT;
  const hp = e.hp;
  const bomb = placeBomb(e.x + 20, e.y, DIR.LEFT);
  bomb.phase = 'explode';
  bomb.x = e.x;
  bomb.y = e.y;
  assert.equal(tryBombHitEnemy(e, bomb), true);
  assert.ok(e.hp < hp);
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
