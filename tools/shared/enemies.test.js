import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  OBJ,
  LEEVER_PHASE,
  canEnemyMove,
  consumeQSpeedPixels,
  createEnemy,
  alignEnemySpawnCell,
  ejectEnemyFromSolid,
  enemyIgnoresTiles,
  enemyIsHidden,
  enemyIsHostile,
  enemyTouchesLink,
  hpForType,
  isEnemyStandingSolid,
  pickUnblockedDir,
  spawnOverworldEnemies,
  stepEnemy,
  OW_ENEMY_BOUNDS,
  trySwordHitEnemy,
  wallmasterIsCapturing,
} from './enemies.js';
import { SWORD } from './inventory.js';
import { SWORD_PHASE, createSwordState } from './sword.js';

test('red octorok HP is one wood sword ($10)', () => {
  assert.equal(hpForType(OBJ.RED_OCTOROK_SLOW), 0x10);
});

test('Aquamentus HP is $60', () => {
  assert.equal(hpForType(OBJ.AQUAMENTUS), 0x60);
});

test('OW attrs spawn octoroks', () => {
  const list = spawnOverworldEnemies(
    { monsterId: 7, monsterCountIndex: 1, useMonsterGroups: false },
    DIR.UP,
  );
  assert.equal(list.length, 4);
  assert.equal(list[0].objType, OBJ.RED_OCTOROK_SLOW);
  assert.equal(list[0].alive, true);
});

test('start screen attrs spawn nothing', () => {
  assert.deepEqual(
    spawnOverworldEnemies({ monsterId: 0, monsterCountIndex: 0 }, DIR.UP),
    [],
  );
});

test('wood sword kills octorok', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3; // mid-arc faces forward
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, 0x80 - 20, 0x80, SWORD.WOOD), true);
  assert.equal(e.alive, false);
});

test('stepEnemy moves and stays in bounds', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x40, y: 0x80 });
  e.dir = DIR.LEFT;
  for (let i = 0; i < 200; i += 1) stepEnemy(e, OW_ENEMY_BOUNDS);
  assert.ok(e.x >= OW_ENEMY_BOUNDS.minX);
  assert.ok(e.x <= OW_ENEMY_BOUNDS.maxX);
});

test('InitDarknut QSpeed: red $20 / blue $28', () => {
  const red = createEnemy({ objType: OBJ.RED_DARKNUT, x: 0x80, y: 0x80 });
  const blue = createEnemy({ objType: OBJ.BLUE_DARKNUT, x: 0x80, y: 0x80 });
  assert.equal(red.qSpeedFrac, 0x20);
  assert.equal(blue.qSpeedFrac, 0x28);
  assert.equal(red.qSpeed, 0);
  assert.equal(blue.qSpeed, 0);
});

test('blue darknut MoveObject averages 0.625 px/frame', () => {
  // 4 × $28 = $A0 added to ObjPosFrac per frame → 5 px every 8 frames.
  const e = { qSpeedFrac: 0x28, posFrac: 0 };
  let pixels = 0;
  for (let i = 0; i < 8; i += 1) pixels += consumeQSpeedPixels(e);
  assert.equal(pixels, 5);
  assert.equal(e.posFrac, 0);
});

test('blue darknut walks slower than the old 2 px/frame approx', () => {
  const wide = {
    minX: 0x20,
    maxX: 0xe0,
    minY: 0x50,
    maxY: 0xc0,
  };
  const e = createEnemy({ objType: OBJ.BLUE_DARKNUT, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 0xff; // avoid facing changes mid-measure
  const x0 = e.x;
  for (let i = 0; i < 64; i += 1) stepEnemy(e, wide);
  const moved = e.x - x0;
  // ROM: 0.625 × 64 = 40. Old bug was 2 × 64 = 128.
  assert.ok(moved >= 36 && moved <= 44, `moved ${moved} px in 64 frames`);
});

test('keese ignore tiles; octoroks do not', () => {
  assert.equal(enemyIgnoresTiles(OBJ.BLUE_KEESE), true);
  assert.equal(enemyIgnoresTiles(OBJ.RED_OCTOROK_SLOW), false);
});

test('octorok turns instead of walking into solid tiles', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Solid wall covering the left half of the screen.
  for (let r = 0; r < 22; r += 1) {
    for (let c = 0; c < 16; c += 1) grid[r][c] = 0xd8;
  }
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  e.dir = DIR.LEFT;
  e.timer = 100;
  // Seed frac so QSpeed $20 yields a whole pixel this frame.
  e.posFrac = 0x80;
  assert.equal(canEnemyMove(grid, e.x, e.y, DIR.LEFT), false);
  const xBefore = e.x;
  stepEnemy(e, OW_ENEMY_BOUNDS, grid);
  // Reverse away from the wall and continue moving that frame.
  assert.equal(e.dir, DIR.RIGHT);
  assert.ok(e.x > xBefore);
});

test('mid-stride walkers skip tile checks (NES gridOffset <> 0)', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Solid column immediately to the right of the enemy.
  for (let r = 0; r < 22; r += 1) {
    for (let c = 18; c < 22; c += 1) grid[r][c] = 0xb0;
  }
  const e = createEnemy({ objType: OBJ.VIRE, x: 0x80, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.gridOffset = 8; // mid-cell: Walker_CheckTileCollision returns early
  e.timer = 100;
  e.posFrac = 0x80;
  const xBefore = e.x;
  stepEnemy(e, OW_ENEMY_BOUNDS, grid, { firstUnwalkable: 0x78 });
  assert.ok(e.x > xBefore, 'should keep moving through the stride');
});

test('Vire hop shifts Y while moving horizontally', () => {
  const e = createEnemy({ objType: OBJ.VIRE, x: 0x80, y: 0x90 });
  e.dir = DIR.RIGHT;
  e.gridOffset = 0;
  e.timer = 100;
  e.posFrac = 0x80; // QSpeed $20 → 1 px this frame
  const y0 = e.y;
  stepEnemy(e, OW_ENEMY_BOUNDS, null);
  // After one step gridOffset=1 → hop -3
  assert.equal(e.gridOffset & 0x0f, 1);
  assert.equal(e.y, y0 - 3);
});

test('enemy contact matches NES $09 center threshold', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  assert.equal(enemyTouchesLink(e, 0x80, 0x80), true);
  assert.equal(enemyTouchesLink(e, 0x88, 0x80), true);
  assert.equal(enemyTouchesLink(e, 0x89, 0x80), false);
  assert.equal(enemyTouchesLink(e, 0x90, 0x80), false);
});

test('ejectEnemyFromSolid slides octorok off water onto sand', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Water lake on the left half.
  for (let r = 0; r < 22; r += 1) {
    for (let c = 0; c < 16; c += 1) grid[r][c] = 0x95;
  }
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x30, y: 0x6d });
  assert.equal(isEnemyStandingSolid(grid, e.x, e.y), true);
  const r = ejectEnemyFromSolid(e, grid);
  assert.equal(r.ejected, true);
  assert.equal(isEnemyStandingSolid(grid, e.x, e.y), false);
  assert.ok(e.x >= 0x80, `expected east of shoreline, x=${e.x.toString(16)}`);
});

test('ejectEnemyFromSolid slides octorok off a bush onto sand', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Standing at (0x80, $8D) samples play row 11 / col 16 — plant a bush there.
  for (let r = 11; r <= 12; r += 1) {
    for (let c = 16; c <= 17; c += 1) grid[r][c] = 0xc5;
  }
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x8d });
  assert.equal(isEnemyStandingSolid(grid, e.x, e.y), true);
  const r = ejectEnemyFromSolid(e, grid);
  assert.equal(r.ejected, true);
  assert.equal(isEnemyStandingSolid(grid, e.x, e.y), false);
  assert.ok(
    canEnemyMove(grid, e.x, e.y, DIR.UP)
      || canEnemyMove(grid, e.x, e.y, DIR.DOWN)
      || canEnemyMove(grid, e.x, e.y, DIR.LEFT)
      || canEnemyMove(grid, e.x, e.y, DIR.RIGHT),
    'ejected cell should allow movement',
  );
});

test('alignEnemySpawnCell does not fold multi-screen coordinates', () => {
  // Classic `& $F0` would turn 272 → 16 and 317 → 0x3D.
  assert.deepEqual(alignEnemySpawnCell(272, 317), { x: 272, y: 317 });
  assert.deepEqual(alignEnemySpawnCell(0x80, 0x8d), { x: 0x80, y: 0x8d });
  assert.deepEqual(alignEnemySpawnCell(-16, -3), { x: -16, y: -3 });
});

test('ejectEnemyFromSolid leaves Zora on water', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x95));
  const e = createEnemy({ objType: OBJ.ZORA, x: 0x30, y: 0x6d });
  const r = ejectEnemyFromSolid(e, grid);
  assert.equal(r.ejected, false);
  assert.equal(e.x, 0x30);
});

test('OW $48 red leevers spawn buried', () => {
  const list = spawnOverworldEnemies(
    { monsterId: 0x10, monsterCountIndex: 1, useMonsterGroups: false },
    DIR.UP,
  );
  assert.equal(list.length, 4);
  assert.equal(list[0].objType, OBJ.RED_LEEVER);
  assert.equal(list[0].leeverPhase, LEEVER_PHASE.BURIED);
  assert.equal(enemyIsHidden(list[0]), true);
  assert.equal(enemyIsHostile(list[0]), false);
});

test('red leever HP is $20', () => {
  assert.equal(hpForType(OBJ.RED_LEEVER), 0x20);
});

test('leever emerges then becomes hostile', () => {
  const e = createEnemy({ objType: OBJ.RED_LEEVER, x: 0x80, y: 0x80 });
  e.timer = 1;
  stepEnemy(e, OW_ENEMY_BOUNDS, null, { chase: { x: 0x40, y: 0x80 } });
  assert.equal(e.leeverPhase, LEEVER_PHASE.EMERGE);
  e.timer = 1;
  stepEnemy(e, OW_ENEMY_BOUNDS, null, { chase: { x: 0x40, y: 0x80 } });
  assert.equal(e.leeverPhase, LEEVER_PHASE.ACTIVE);
  assert.equal(enemyIsHostile(e), true);
  assert.equal(enemyTouchesLink(e, 0x80, 0x80), true);
});

test('buried leever ignores sword', () => {
  const e = createEnemy({ objType: OBJ.RED_LEEVER, x: 0x80, y: 0x80 });
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 3; // mid-arc faces forward (overlap, but buried → no hit)
  sword.dir = DIR.RIGHT;
  assert.equal(trySwordHitEnemy(e, sword, 0x80 - 20, 0x80, SWORD.WOOD), false);
  assert.equal(e.alive, true);
});

test('wallmaster capture slides Link toward a wall before warp', () => {
  const e = createEnemy({ objType: OBJ.WALLMASTER, x: 0x80, y: 0x80 });
  const link = { x: 0x80, y: 0x80 };
  e.wallmasterGrab = true;
  e.dir = DIR.RIGHT;

  const startX = e.x;
  for (let i = 0; i < 40 && !e.wallmasterWarpPending; i += 1) {
    stepEnemy(e, OW_ENEMY_BOUNDS, null, { link });
  }

  assert.equal(wallmasterIsCapturing(e), true);
  assert.ok(e.wallmasterRetreatDir != null, 'picks a retreat wall');
  // Hand and Link move together off the spawn cell.
  assert.ok(Math.abs(e.x - startX) + Math.abs(e.y - 0x80) > 0);
  assert.equal(link.x, e.x);
  assert.equal(link.y, e.y);

  // Finish the trip (7 tiles or off-screen).
  for (let i = 0; i < 400 && !e.wallmasterWarpPending; i += 1) {
    stepEnemy(e, OW_ENEMY_BOUNDS, null, { link });
  }
  assert.equal(e.wallmasterWarpPending, true);
  assert.ok(
    (e.wallmasterTilesCrossed ?? 0) >= 3
      || e.x < OW_ENEMY_BOUNDS.minX
      || e.x > OW_ENEMY_BOUNDS.maxX
      || e.y < OW_ENEMY_BOUNDS.minY
      || e.y > OW_ENEMY_BOUNDS.maxY,
  );
});

test('blocked vertical corridor picks a sideways exit', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // From (0x80,$80): UP probes row 7, DOWN probes row 10. Leave mid rows open for L/R.
  for (let c = 0; c < 32; c += 1) {
    grid[7][c] = 0xd8;
    grid[10][c] = 0xd8;
  }
  const x = 0x80;
  const y = 0x80;
  assert.equal(canEnemyMove(grid, x, y, DIR.UP), false);
  assert.equal(canEnemyMove(grid, x, y, DIR.DOWN), false);
  assert.equal(canEnemyMove(grid, x, y, DIR.LEFT), true);
  assert.equal(canEnemyMove(grid, x, y, DIR.RIGHT), true);

  const picked = pickUnblockedDir(grid, x, y, DIR.UP, 0);
  assert.ok(picked === DIR.LEFT || picked === DIR.RIGHT);

  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x, y });
  e.dir = DIR.UP;
  e.timer = 100;
  stepEnemy(e, OW_ENEMY_BOUNDS, grid);
  assert.ok(e.dir === DIR.LEFT || e.dir === DIR.RIGHT);
});
