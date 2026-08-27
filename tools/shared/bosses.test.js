import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { UW_BOUNDS } from './collision.js';
import {
  BOSS,
  bossHp,
  bossNeedsArrow,
  bossNoiseSfx,
  bossRoarSfx,
  enemyUsesUwRoomBounds,
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
import {
  UW_ENEMY_BOUNDS,
  createEnemy,
  tryArrowHitEnemy,
  tryBombHitEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import { chaseBoundsForCamera, uwEnemyBoundsForRoom } from './roomStream.js';
import { shootArrow } from './projectiles.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { SWORD } from './inventory.js';

test('boss type helpers', () => {
  assert.equal(isBossType(BOSS.DODONGO), true);
  assert.equal(isZelda(BOSS.ZELDA), true);
  assert.equal(bossNeedsArrow(BOSS.GOHMA), true);
  assert.equal(bossNeedsArrow(BOSS.DODONGO), false);
  assert.equal(enemyUsesUwRoomBounds(BOSS.MANHANDLA), true);
  assert.equal(enemyUsesUwRoomBounds(BOSS.GLEEOK_HEAD), true);
  assert.equal(enemyUsesUwRoomBounds(0x10), false); // red octorok
});

test('adjacent-room boss noise maps to the same DMC slots as Init', () => {
  assert.equal(bossNoiseSfx(0), null);
  assert.equal(bossNoiseSfx(1), 'boss_roar_1');
  assert.equal(bossNoiseSfx(2), 'boss_roar_2');
  assert.equal(bossNoiseSfx(3), 'boss_roar_3');
  assert.equal(bossNoiseSfx(undefined), null);
  assert.equal(bossRoarSfx(BOSS.AQUAMENTUS), 'boss_roar_1');
  assert.equal(bossRoarSfx(BOSS.DODONGO), 'boss_roar_2');
  assert.equal(bossRoarSfx(BOSS.MANHANDLA), 'boss_roar_3');
});

test('Manhandla stays inside UW BoundByRoom under chase-pad bounds', () => {
  // Phase-18 chaseBoundsForCamera reaches into the HUD (minY=$28 at cam 0).
  // Bosses must clamp to UW_ENEMY_BOUNDS instead so they cannot leave the room.
  const e = createEnemy({ objType: BOSS.MANHANDLA, x: 0x80, y: 0x60 });
  assert.ok(e);
  e.dir = DIR.UP;
  e.timer = 0;
  const room = uwEnemyBoundsForRoom(0x6e, 0x6e);
  assert.equal(room.minY, UW_BOUNDS.top);
  assert.ok(chaseBoundsForCamera(0, 0).minY < UW_BOUNDS.top);
  for (let i = 0; i < 400; i += 1) {
    e.anim = (e.anim ?? 0) + 1;
    stepBossAi(e, room, { chase: { x: 0x80, y: 0x20 } });
  }
  assert.ok(e.x >= UW_ENEMY_BOUNDS.minX);
  assert.ok(e.x <= UW_ENEMY_BOUNDS.maxX - 16);
  assert.ok(e.y >= UW_ENEMY_BOUNDS.minY, `y=${e.y} escaped above UW top`);
  assert.ok(e.y <= UW_ENEMY_BOUNDS.maxY - 16);
});

test('dodongo ignores sword; eats bombs', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3; // mid-arc faces forward
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), 'parry');
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
  e.bloatedSubstate = 2; // fade complete → die next
  e.timer = 0;
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  stepBossAi(e, bounds); // → DIE
  stepBossAi(e, bounds); // → dead
  assert.equal(e.alive, false);
});

test('gohma ignores sword; arrow only when eye open', () => {
  const e = createEnemy({ objType: BOSS.GOHMA, x: 0x80, y: 0x80 });
  e.eyeState = GOHMA_EYE.CLOSED;
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3; // mid-arc faces forward
  sword.dir = DIR.RIGHT;
  // bossNeedsArrow short-circuits before the contact parry path.
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), false);
  const arrowClosed = shootArrow(e.x, e.y + 20, DIR.UP, 1);
  arrowClosed.x = e.x + 4;
  arrowClosed.y = e.y + 4;
  assert.equal(gohmaEyeVulnerable(e, arrowClosed), false);
  assert.equal(tryArrowHitEnemy(e, arrowClosed), 'parry');

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
  sword.timer = 3; // mid-arc faces forward
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.MAGIC), true);
  assert.equal(e.alive, true);
  assert.equal(e.ganonPhase, GANON_PHASE.BROWN);

  // Still in sword invuln frames — miss rather than a brown-phase parry.
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
  sword.timer = 3; // mid-arc faces forward
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, e.x - 20, e.y, SWORD.WOOD), 'parry');

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
