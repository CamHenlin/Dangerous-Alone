import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, UW_FIRST_UNWALKABLE } from './collision.js';
import {
  OBJ,
  OW_ENEMY_BOUNDS,
  createEnemy,
  stepEnemy,
  tryBoomerangHitEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import { SWORD } from './inventory.js';
import { throwBoomerang } from './boomerang.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import {
  ENEMY_SHOVE_PIXELS,
  ENEMY_SHOVE_SPEED,
  beginEnemyShove,
  enemyMovesOnShove,
  shoveIsPerpendicular,
  stepEnemyShove,
} from './enemyShove.js';

function hitSword(dir = DIR.RIGHT) {
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3;
  sword.dir = dir;
  return sword;
}

function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x26));
}

test('octoroks and darknuts move on shove; keese and Aquamentus do not', () => {
  const octo = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  const keese = createEnemy({ objType: OBJ.BLUE_KEESE, x: 0x80, y: 0x80 });
  const aqua = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0x80, y: 0x80 });
  assert.equal(enemyMovesOnShove(octo), true);
  assert.equal(enemyMovesOnShove(keese), false);
  assert.equal(enemyMovesOnShove(aqua), false);
});

test('a surviving sword hit arms $40 px of shove in the blade direction', () => {
  const e = createEnemy({ objType: OBJ.BLUE_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  e.hp = 0x40;
  e.dir = DIR.LEFT;
  assert.equal(trySwordHitEnemy(e, hitSword(DIR.RIGHT), 0x80 - 20, 0x80, SWORD.WOOD), true);
  assert.equal(e.alive, true);
  assert.equal(e.shoveDir, DIR.RIGHT);
  assert.equal(e.shovePixels, ENEMY_SHOVE_PIXELS);
});

test('a killing blow does not shove a corpse', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  assert.equal(trySwordHitEnemy(e, hitSword(DIR.RIGHT), 0x80 - 20, 0x80, SWORD.WOOD), true);
  assert.equal(e.alive, false);
  assert.equal(e.shovePixels ?? 0, 0);
});

test('boomerang stuns without shoving', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  e.hp = 0x40;
  const boom = throwBoomerang(e.x, e.y, DIR.RIGHT);
  boom.x = e.x + 4;
  boom.y = e.y + 4;
  assert.equal(tryBoomerangHitEnemy(e, boom), true);
  assert.ok(e.stunTimer > 0);
  assert.equal(e.shovePixels ?? 0, 0);
});

test('shove slides 4px/frame and stops at a solid', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  beginEnemyShove(e, DIR.RIGHT);
  const grid = openGrid();
  for (let r = 0; r < 22; r += 1) {
    for (let c = 20; c < 32; c += 1) grid[r][c] = 0xd8;
  }
  const x0 = e.x;
  stepEnemyShove(e, OW_ENEMY_BOUNDS, grid);
  assert.equal(e.x, x0 + ENEMY_SHOVE_SPEED);
  assert.equal(e.shovePixels, ENEMY_SHOVE_PIXELS - ENEMY_SHOVE_SPEED);

  e.x = 0xa0;
  e.gridOffset = 0;
  e.shovePixels = ENEMY_SHOVE_PIXELS;
  e.shoveDir = DIR.RIGHT;
  stepEnemyShove(e, OW_ENEMY_BOUNDS, grid);
  assert.equal(e.x, 0xa0, 'square-aligned shove into a wall must not enter it');
  assert.equal(e.shovePixels, 0);
});

test('a mid-tile perpendicular hit is cancelled', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.gridOffset = 8;
  assert.equal(shoveIsPerpendicular(DIR.RIGHT, DIR.UP), true);
  assert.equal(beginEnemyShove(e, DIR.UP), false);
  assert.equal(e.shovePixels ?? 0, 0);
  assert.equal(e.y, 0x8d);
});

test('an aligned mid-tile hit still shoves', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.gridOffset = 8;
  assert.equal(beginEnemyShove(e, DIR.RIGHT), true);
  assert.equal(e.shoveDir, DIR.RIGHT);
});

test('stepEnemy slides instead of walking while shoved', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  e.dir = DIR.LEFT;
  e.hp = 0x40;
  e.turnTimer = 0xff;
  trySwordHitEnemy(e, hitSword(DIR.RIGHT), 0x80 - 20, 0x8d, SWORD.WOOD);
  const x0 = e.x;
  stepEnemy(e, OW_ENEMY_BOUNDS, openGrid());
  assert.equal(e.x, x0 + ENEMY_SHOVE_SPEED);
  assert.equal(e.dir, DIR.LEFT, 'knockback does not turn the walker');
});

test('shove still runs while stunned', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.stunTimer = 20;
  beginEnemyShove(e, DIR.RIGHT);
  const x0 = e.x;
  stepEnemy(e, OW_ENEMY_BOUNDS, openGrid());
  assert.equal(e.x, x0 + ENEMY_SHOVE_SPEED);
  assert.equal(e.stunTimer, 19);
});

test('Zol faces the weapon that hit it', () => {
  const e = createEnemy({ objType: OBJ.ZOL, x: 0x80, y: 0x80 });
  e.hp = 0x40;
  e.dir = DIR.LEFT;
  trySwordHitEnemy(e, hitSword(DIR.DOWN), 0x80, 0x80 - 20, SWORD.WOOD);
  assert.equal(e.dir, DIR.DOWN);
  assert.equal(e.shoveDir, DIR.DOWN);
});

test('keese are not shoved by a sword', () => {
  const e = createEnemy({ objType: OBJ.BLUE_KEESE, x: 0x80, y: 0x80 });
  e.hp = 0x40;
  trySwordHitEnemy(e, hitSword(DIR.RIGHT), 0x80 - 20, 0x80, SWORD.WOOD);
  assert.equal(e.shovePixels ?? 0, 0);
});

test('UW first-unwalkable is honored during shove', () => {
  const e = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x40, y: 0x8d });
  e.dir = DIR.RIGHT;
  beginEnemyShove(e, DIR.RIGHT);
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  for (let c = 10; c < 32; c += 1) grid[11][c] = 0x78;
  e.x = 0x50;
  e.gridOffset = 0;
  stepEnemyShove(e, OW_ENEMY_BOUNDS, grid, { firstUnwalkable: UW_FIRST_UNWALKABLE });
  assert.equal(e.x, 0x50);
  assert.equal(e.shovePixels, 0);
});
