import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  BOSS,
  bossHp,
  bossNeedsArrow,
  isBossType,
  isZelda,
  stepBoss,
} from './bosses.js';
import {
  CHILD_DIGDOGGER,
  DODONGO_STATE,
  GANON_PHASE,
  GOHMA_EYE,
  gohmaEyeVulnerable,
  spawnDigdoggerChildren,
  stepBossAi,
  tryDodongoEatBomb,
} from './bossAi.js';
import { createEnemy, tryArrowHitEnemy, tryBombHitEnemy, trySwordHitEnemy } from './enemies.js';
import { shootArrow } from './projectiles.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { SWORD } from './inventory.js';

test('boss type helpers', () => {
  assert.equal(isBossType(BOSS.DODONGO), true);
  assert.equal(isZelda(BOSS.ZELDA), true);
  assert.equal(bossNeedsArrow(BOSS.GOHMA), true);
  assert.equal(bossNeedsArrow(BOSS.DODONGO), false);
});

test('dodongo ignores sword; eats bombs', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), false);
  const bomb = { x: e.x, y: e.y, phase: 'fuse' };
  assert.equal(tryDodongoEatBomb(e, bomb), true);
  assert.equal(e.bossState, DODONGO_STATE.BLOATED);
  assert.equal(e.bombsEaten, 1);
  assert.equal(bomb.phase, 'done');
});

test('$31 dodongo is a boss; explode dust stuns', () => {
  assert.equal(isBossType(BOSS.DODONGO_1), true);
  assert.equal(isBossType(BOSS.GOHMA_RED), true);
  assert.equal(bossNeedsArrow(BOSS.GOHMA_RED), true);
  const e = createEnemy({ objType: BOSS.DODONGO_1, x: 0x80, y: 0x80 });
  assert.equal(tryBombHitEnemy(e, { x: e.x, y: e.y, phase: 'explode' }), true);
  assert.equal(e.bossState, DODONGO_STATE.STUNNED);
});

test('dodongo dies after two swallowed bombs', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  e.bombsEaten = 2;
  e.bossState = DODONGO_STATE.BLOATED;
  e.timer = 0;
  stepBossAi(e, { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 });
  assert.equal(e.alive, false);
});

test('gohma ignores sword; arrow only when eye open', () => {
  const e = createEnemy({ objType: BOSS.GOHMA, x: 0x80, y: 0x80 });
  e.eyeState = GOHMA_EYE.CLOSED;
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), false);
  const arrowClosed = shootArrow(e.x, e.y + 20, DIR.UP, 1);
  arrowClosed.x = e.x + 4;
  arrowClosed.y = e.y + 4;
  assert.equal(gohmaEyeVulnerable(e, arrowClosed), false);
  assert.equal(tryArrowHitEnemy(e, arrowClosed), false);

  e.eyeState = GOHMA_EYE.OPEN;
  e.invuln = 0;
  const arrow = shootArrow(e.x, e.y + 20, DIR.UP, 1);
  arrow.x = e.x + 4;
  arrow.y = e.y + 4;
  assert.equal(tryArrowHitEnemy(e, arrow), true);
  assert.ok(e.hp < bossHp(BOSS.GOHMA, 0));
});

test('ganon blue→brown on sword KO; silver only in brown', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0x80 });
  e.hp = 1;
  e.ganonPhase = GANON_PHASE.BLUE;
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.MAGIC), true);
  assert.equal(e.alive, true);
  assert.equal(e.ganonPhase, GANON_PHASE.BROWN);

  const wood = shootArrow(e.x, e.y, DIR.RIGHT, 1);
  wood.x = e.x + 4;
  wood.y = e.y + 4;
  assert.equal(tryArrowHitEnemy(e, wood), false);

  let guard = 0;
  while (e.alive && guard < 20) {
    e.invuln = 0;
    const a = shootArrow(e.x, e.y, DIR.RIGHT, 2);
    a.x = e.x + 4;
    a.y = e.y + 4;
    tryArrowHitEnemy(e, a);
    guard += 1;
  }
  assert.equal(e.alive, false);
});

test('stepBoss paces without crashing', () => {
  const e = createEnemy({ objType: BOSS.MANHANDLA, x: 0x80, y: 0x80 });
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  for (let i = 0; i < 60; i += 1) stepBoss(e, bounds);
  assert.equal(e.alive, true);
});

test('tryBombHitEnemy routes dodongo fuse eat', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  assert.equal(tryBombHitEnemy(e, { x: e.x, y: e.y, phase: 'fuse' }), true);
});

test('digdogger ignores sword until flute split', () => {
  const e = createEnemy({ objType: BOSS.DIGDOGGER, x: 0x80, y: 0x80 });
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), false);

  /** @type {import('./enemies.js').Enemy[]} */
  const kids = [];
  stepBossAi(
    e,
    { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 },
    {
      fluteJustUsed: true,
      onDigdoggerSplit: (parent) => {
        kids.push(...spawnDigdoggerChildren(parent, createEnemy));
      },
    },
  );
  assert.equal(e.alive, false);
  assert.equal(kids.length, 3);
  assert.equal(kids[0].objType, CHILD_DIGDOGGER);
});
