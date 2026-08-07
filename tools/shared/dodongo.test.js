import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOSS } from './bosses.js';
import {
  DODONGO_BLOATED_SUB,
  DODONGO_STATE,
  dodongoIsSwelling,
  dodongoIsVisible,
  stepBossAi,
  tryDodongoEatBomb,
} from './bossAi.js';
import { dodongoBloatedDraw, dodongoWalkDraw } from './bossSpriteLayouts.js';
import { createEnemy } from './enemies.js';

test('dodongo horizontal draw swaps halves when facing left', () => {
  const right = dodongoWalkDraw(DIR.RIGHT, 0);
  assert.deepEqual(
    { left: right.leftTile, right: right.rightTile, flip: right.flipH },
    { left: 0xdc, right: 0xe0, flip: false },
  );
  const left = dodongoWalkDraw(DIR.LEFT, 0);
  assert.deepEqual(
    { left: left.leftTile, right: left.rightTile, flip: left.flipH },
    { left: 0xe0, right: 0xdc, flip: true },
  );
  const right1 = dodongoWalkDraw(DIR.RIGHT, 1);
  assert.equal(right1.leftTile, 0xe4);
  assert.equal(right1.rightTile, 0xe8);
});

test('dodongo bloated draw uses swell tiles', () => {
  const right = dodongoBloatedDraw(DIR.RIGHT);
  assert.deepEqual(
    { left: right.leftTile, right: right.rightTile, flip: right.flipH },
    { left: 0xec, right: 0xf0, flip: false },
  );
  const left = dodongoBloatedDraw(DIR.LEFT);
  assert.deepEqual(
    { left: left.leftTile, right: left.rightTile, flip: left.flipH },
    { left: 0xf0, right: 0xec, flip: true },
  );
  assert.equal(dodongoBloatedDraw(DIR.DOWN).leftTile, 0xf8);
  assert.equal(dodongoBloatedDraw(DIR.UP).leftTile, 0xfe);
});

test('dodongo walks with wanderer-style motion', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x90 });
  assert.ok(e.dir === DIR.LEFT || e.dir === DIR.RIGHT);
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x50, maxY: 0xc0 };
  const startX = e.x;
  const startY = e.y;
  for (let i = 0; i < 120; i += 1) {
    e.anim += 1;
    stepBossAi(e, bounds, { chase: { x: 0x40, y: 0x70 } });
  }
  assert.ok(
    e.x !== startX || e.y !== startY,
    `expected Dodongo to move from (${startX},${startY}), got (${e.x},${e.y})`,
  );
});

test('dodongo bomb eat runs wait → swell → resume', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  assert.equal(tryDodongoEatBomb(e, { x: e.x, y: e.y, phase: 'fuse' }), true);
  assert.equal(e.bossState, DODONGO_STATE.BLOATED);
  assert.equal(e.bloatedSubstate, DODONGO_BLOATED_SUB.WAIT0);
  assert.equal(dodongoIsSwelling(e), false);

  // Drain wait0.
  e.timer = 0;
  stepBossAi(e, bounds);
  assert.equal(e.bloatedSubstate, DODONGO_BLOATED_SUB.SWELL);
  assert.equal(dodongoIsSwelling(e), true);

  // Non-lethal: after swell → end → move.
  e.timer = 0;
  stepBossAi(e, bounds);
  assert.equal(e.bloatedSubstate, DODONGO_BLOATED_SUB.END);
  stepBossAi(e, bounds);
  assert.equal(e.bossState, DODONGO_STATE.MOVE);
  assert.equal(e.alive, true);
});

test('dodongo second bomb swells then fades before death', () => {
  const e = createEnemy({ objType: BOSS.DODONGO, x: 0x80, y: 0x80 });
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  e.bombsEaten = 1;
  assert.equal(tryDodongoEatBomb(e, { x: e.x, y: e.y, phase: 'fuse' }), true);
  assert.equal(e.bombsEaten, 2);

  e.timer = 0;
  stepBossAi(e, bounds); // → SWELL
  e.timer = 0;
  stepBossAi(e, bounds); // → FADE (lethal)
  assert.equal(e.bloatedSubstate, DODONGO_BLOATED_SUB.FADE);
  e.anim = 0;
  assert.equal(dodongoIsVisible(e), false);
  e.anim = 2;
  assert.equal(dodongoIsVisible(e), true);

  e.timer = 0;
  stepBossAi(e, bounds); // → DIE
  stepBossAi(e, bounds); // → dead
  assert.equal(e.alive, false);
});
