import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, UW_FIRST_UNWALKABLE } from './collision.js';
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
  enemyNeedsWalkableGround,
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

test('keese and tektites ignore tiles; octoroks do not', () => {
  assert.equal(enemyIgnoresTiles(OBJ.BLUE_KEESE), true);
  assert.equal(enemyIgnoresTiles(OBJ.BLUE_TEKTITE), true);
  assert.equal(enemyIgnoresTiles(OBJ.RED_TEKTITE), true);
  assert.equal(enemyIgnoresTiles(OBJ.RED_OCTOROK_SLOW), false);
});

test('ejectEnemyFromSolid leaves tektites on rocks and water', () => {
  const rockGrid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const waterGrid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  for (let r = 0; r < 22; r += 1) {
    for (let c = 0; c < 16; c += 1) {
      rockGrid[r][c] = 0xd8;
      waterGrid[r][c] = 0x95;
    }
  }
  const onRock = createEnemy({ objType: OBJ.RED_TEKTITE, x: 0x30, y: 0x6d });
  const onWater = createEnemy({ objType: OBJ.BLUE_TEKTITE, x: 0x30, y: 0x6d });
  assert.equal(isEnemyStandingSolid(rockGrid, onRock.x, onRock.y), true);
  assert.equal(isEnemyStandingSolid(waterGrid, onWater.x, onWater.y), true);
  assert.equal(ejectEnemyFromSolid(onRock, rockGrid).ejected, false);
  assert.equal(ejectEnemyFromSolid(onWater, waterGrid).ejected, false);
  assert.equal(onRock.x, 0x30);
  assert.equal(onWater.x, 0x30);
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
  const yBefore = e.y;
  stepEnemy(e, OW_ENEMY_BOUNDS, grid);
  // Walker_GetNextAltDir tries perpendiculars first (UP/DOWN when facing LEFT).
  assert.ok(e.dir === DIR.UP || e.dir === DIR.DOWN, `dir=${e.dir}`);
  assert.ok(e.x !== xBefore || e.y !== yBefore, 'should still move this frame');
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

test('ejectEnemyFromSolid leaves Wizzrobes / Pols Voice on UW blocks', () => {
  // Blue Wizzrobes fade through $B0; Pols Voice hops them. Ejecting either
  // mid-phase wedges them against the block edge (foes=2 diamond rooms).
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  for (let r = 11; r <= 12; r += 1) {
    for (let c = 16; c <= 17; c += 1) grid[r][c] = 0xb0;
  }
  const tileOpts = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };
  const blue = createEnemy({ objType: OBJ.BLUE_WIZZROBE, x: 0x80, y: 0x8d });
  const red = createEnemy({ objType: OBJ.RED_WIZZROBE, x: 0x80, y: 0x8d });
  const pols = createEnemy({ objType: OBJ.POLS_VOICE, x: 0x80, y: 0x8d });
  assert.equal(enemyNeedsWalkableGround(blue), false);
  assert.equal(enemyNeedsWalkableGround(red), false);
  assert.equal(enemyNeedsWalkableGround(pols), false);
  for (const e of [blue, red, pols]) {
    const r = ejectEnemyFromSolid(e, grid, { tileOpts });
    assert.equal(r.ejected, false, `objType $${e.objType.toString(16)}`);
    assert.equal(e.x, 0x80);
    assert.equal(e.y, 0x8d);
  }
});

test('blue Wizzrobe finishes fading through a block without eject wedging', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // One $B0 square at (0x80, $8D); walk in from the left.
  for (let r = 11; r <= 12; r += 1) {
    for (let c = 16; c <= 17; c += 1) grid[r][c] = 0xb0;
  }
  const tileOpts = { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: [] };
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x5d, maxY: 0xbd };
  const e = createEnemy({ objType: OBJ.BLUE_WIZZROBE, x: 0x60, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.wizzTimer = 0xff;

  let sawFade = false;
  let maxX = e.x;
  for (let i = 0; i < 200; i += 1) {
    stepEnemy(e, bounds, grid, { ...tileOpts, link: null });
    ejectEnemyFromSolid(e, grid, { tileOpts });
    if ((e.wizzRemDistance ?? 0) > 0) sawFade = true;
    if (e.x > maxX) maxX = e.x;
  }
  assert.equal(sawFade, true, 'should begin fading through the block');
  assert.ok(maxX > 0x90, `should clear past the block (maxX=$${maxX.toString(16)})`);
  assert.equal(e.wizzRemDistance ?? 0, 0, 'fade should finish');
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

  // Walker_GetNextAltDir: perpendiculars first (LEFT/RIGHT when facing UP).
  const picked = pickUnblockedDir(grid, x, y, DIR.UP, 0);
  assert.ok(picked === DIR.LEFT || picked === DIR.RIGHT);

  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x, y });
  e.dir = DIR.UP;
  e.timer = 100;
  stepEnemy(e, OW_ENEMY_BOUNDS, grid);
  assert.ok(e.dir === DIR.LEFT || e.dir === DIR.RIGHT);
});

test('pickUnblockedDir prefers perpendicular over reverse (Walker_GetNextAltDir)', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Facing RIGHT into a wall; LEFT (reverse) and UP open; DOWN blocked.
  // NES tries perpendiculars first → UP, not reverse LEFT.
  // RIGHT probe from (0x80,$80): sampleX=$90 → col 18.
  for (let r = 0; r < 22; r += 1) {
    grid[r][18] = 0xd8;
  }
  // DOWN probe samples row 10.
  for (let c = 0; c < 32; c += 1) {
    grid[10][c] = 0xd8;
  }
  const x = 0x80;
  const y = 0x80;
  assert.equal(canEnemyMove(grid, x, y, DIR.RIGHT), false);
  assert.equal(canEnemyMove(grid, x, y, DIR.UP), true);
  assert.equal(canEnemyMove(grid, x, y, DIR.LEFT), true);
  assert.equal(canEnemyMove(grid, x, y, DIR.DOWN), false);

  // bit7 clear → first perp is UP (horizontal facing → ReverseDirections[0]=UP).
  assert.equal(pickUnblockedDir(grid, x, y, DIR.RIGHT, 0, {}, () => 0x00), DIR.UP);
  // bit7 set → first perp is DOWN (blocked) → other perp UP.
  assert.equal(pickUnblockedDir(grid, x, y, DIR.RIGHT, 0, {}, () => 0x80), DIR.UP);
});

test('pickUnblockedDir returns 0 when fully boxed in', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0xd8));
  // Open standing cell only — every move probe hits solid.
  for (let r = 8; r <= 9; r += 1) {
    for (let c = 15; c <= 16; c += 1) grid[r][c] = 0x26;
  }
  assert.equal(pickUnblockedDir(grid, 0x80, 0x80, DIR.RIGHT, 0), 0);
});

test('darknut turn timer ticks mid-tile (NES every-frame DEC)', () => {
  const wide = {
    minX: 0x20,
    maxX: 0xe0,
    minY: 0x50,
    maxY: 0xc0,
  };
  const e = createEnemy({ objType: OBJ.BLUE_DARKNUT, x: 0x40, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 10;
  e.gridOffset = 5; // mid-stride — old bug only ticked on boundaries
  stepEnemy(e, wide, null, {
    chase: { x: 0xa0, y: 0x80 },
    rngByte: () => 0xff, // rate $80 < $FF → no chase reface
  });
  assert.equal(e.turnTimer, 9);
});

test('darknut refaces after landing on a square, not before the move', () => {
  const wide = {
    minX: 0x20,
    maxX: 0xe0,
    minY: 0x50,
    maxY: 0xc0,
  };
  const e = createEnemy({ objType: OBJ.BLUE_DARKNUT, x: 0x80, y: 0x80 });
  e.dir = DIR.RIGHT;
  e.turnTimer = 0;
  e.turnRate = 0xff;
  e.gridOffset = 0x0f; // one pixel shy of a square
  e.qSpeedFrac = 0x40; // exactly 1 px this frame
  e.posFrac = 0;
  const chase = { x: 0x80, y: 0xa0 }; // aligned in X → face DOWN after land
  stepEnemy(e, wide, null, { chase, rngByte: () => 0x00 });
  // Moved 1px right onto the square, then truncated + faced toward chase.
  assert.equal(e.x, 0x81);
  assert.equal(e.gridOffset, 0);
  assert.equal(e.dir, DIR.DOWN);
});
