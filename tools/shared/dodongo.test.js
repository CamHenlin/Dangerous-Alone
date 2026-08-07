import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOSS } from './bosses.js';
import { stepBossAi } from './bossAi.js';
import { dodongoWalkDraw } from './bossSpriteLayouts.js';
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
