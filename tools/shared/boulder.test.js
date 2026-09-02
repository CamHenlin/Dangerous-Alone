import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOULDER,
  BOULDER_DESTROY_Y,
  BOULDER_SET,
  BOULDER_SPAWN_Y,
  boulderRoomOffset,
  boulderScrapY,
  boulderSpawnX,
  countActiveBoulders,
  stepBoulderSet,
} from './boulder.js';
import {
  OBJ,
  OW_ENEMY_BOUNDS,
  createEnemy,
  enemyIsHidden,
  enemyIsHostile,
  enemyNeedsWalkableGround,
  spawnOverworldEnemies,
  stepEnemy,
} from './enemies.js';
import { DIR } from './collision.js';
import { PLAY_H, PLAY_W } from './continuousCamera.js';
import { enemyDrawFlags, enemyFrameTile, hasEnemySprite } from './enemyAnim.js';

test('boulder types have sprite coverage (set invisible, rock CHR)', () => {
  assert.equal(OBJ.BOULDER_SET, BOULDER_SET);
  assert.equal(OBJ.BOULDER, BOULDER);
  assert.equal(hasEnemySprite(OBJ.BOULDER_SET), true);
  assert.equal(hasEnemySprite(OBJ.BOULDER), true);
  assert.equal(enemyFrameTile(OBJ.BOULDER, 0), 0x90);
  assert.equal(enemyFrameTile(OBJ.BOULDER, 1), 0xe8);
  assert.equal(enemyDrawFlags(OBJ.BOULDER, DIR.RIGHT, 0).mirror, false);
});

test('BoulderSet spawns hidden and non-hostile', () => {
  const list = spawnOverworldEnemies(
    { monsterId: 0x1f, monsterCountIndex: 0, useMonsterGroups: false },
    DIR.UP,
  );
  assert.ok(list.length >= 1);
  assert.equal(list[0].objType, OBJ.BOULDER_SET);
  assert.equal(enemyIsHidden(list[0]), true);
  assert.equal(enemyIsHostile(list[0]), false);
  assert.equal(enemyNeedsWalkableGround(list[0]), false);
});

test('boulderSpawnX matches chase-target half', () => {
  assert.equal(boulderSpawnX(0x40, 0xff), 0x7f);
  assert.equal(boulderSpawnX(0xc0, 0x01), 0x81);
});

test('BoulderSet spawns up to 3 rocks at Y=$40', () => {
  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: 0x80, y: 0x80 });
  set.timer = 0;
  /** @type {import('./enemies.js').Enemy[]} */
  const enemies = [set];
  let seq = 0;
  const rngByte = () => {
    const bytes = [0x10, 0x00, 0x90, 0x00, 0x20, 0x00, 0xa0, 0x00];
    return bytes[seq++ % bytes.length];
  };

  for (let i = 0; i < 3; i += 1) {
    set.timer = 0;
    const spawn = stepBoulderSet(set, enemies, {
      chase: { x: 0xc0, y: 0x80 },
      rngByte,
    });
    assert.ok(spawn, `spawn ${i}`);
    assert.equal(spawn.objType, OBJ.BOULDER);
    assert.equal(spawn.y, BOULDER_SPAWN_Y);
    assert.ok(spawn.x >= 0x80);
    enemies.push(createEnemy(spawn));
  }
  assert.equal(countActiveBoulders(enemies), 3);

  set.timer = 0;
  assert.equal(
    stepBoulderSet(set, enemies, { chase: { x: 0xc0, y: 0x80 }, rngByte }),
    null,
  );
  assert.ok(set.timer > 0);
});

test('boulder falls off bottom and dies', () => {
  const e = createEnemy({
    objType: OBJ.BOULDER,
    x: 0x80,
    y: BOULDER_DESTROY_Y - 2,
    dir: DIR.DOWN,
  });
  e.jumperState = 1;
  e.jumperVy = 4;
  e.jumperTargetY = BOULDER_DESTROY_Y + 0x40;
  stepEnemy(e, OW_ENEMY_BOUNDS, null, { chase: { x: 0x80, y: 0x80 } });
  assert.equal(e.alive, false);
  assert.ok(e.y >= BOULDER_DESTROY_Y);
});

test('stepEnemy BoulderSet pushes into enemies list', () => {
  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: 0x80, y: 0x80 });
  set.timer = 0;
  /** @type {import('./enemies.js').Enemy[]} */
  const enemies = [set];
  stepEnemy(set, OW_ENEMY_BOUNDS, null, {
    enemies,
    chase: { x: 0x40, y: 0x80 },
    rngByte: () => 0x22,
  });
  assert.equal(enemies.length, 2);
  assert.equal(enemies[1].objType, OBJ.BOULDER);
  assert.equal(enemies[1].y, BOULDER_SPAWN_Y);
});

test('boulderRoomOffset is zero when home is the streaming anchor', () => {
  assert.deepEqual(boulderRoomOffset(0x77, 0x77), { dx: 0, dy: 0 });
  assert.deepEqual(boulderRoomOffset(null, 0x77), { dx: 0, dy: 0 });
  assert.equal(boulderScrapY(0x77, 0x77), BOULDER_DESTROY_Y);
});

test('rocks spawn in the BoulderSet home room, not the streaming anchor', () => {
  // Player one holds `$77`; the mountain cell `$78` is leftover to the east.
  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: PLAY_W + 0x80, y: 0x80 });
  set.homeRoomId = 0x78;
  set.timer = 0;
  const spawn = stepBoulderSet(set, [set], {
    chase: { x: PLAY_W + 0xc0, y: 0x80 },
    rngByte: () => 0x00,
    anchorRoomId: 0x77,
  });
  assert.ok(spawn);
  assert.equal(spawn.y, BOULDER_SPAWN_Y);
  assert.ok(spawn.x >= PLAY_W, `spawned in the anchor at x=${spawn.x}`);
  assert.ok(spawn.x < PLAY_W * 2, `spawned past the home cell at x=${spawn.x}`);
  assert.ok(spawn.x >= PLAY_W + 0x80, 'half-screen test uses home-local chase X');
});

test('a south leftover mountain drops rocks at that cell\'s $40, not the anchor\'s', () => {
  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: 0x80, y: PLAY_H + 0x80 });
  set.homeRoomId = 0x87;
  set.timer = 0;
  const spawn = stepBoulderSet(set, [set], {
    chase: { x: 0x40, y: PLAY_H + 0x80 },
    rngByte: () => 0x00,
    anchorRoomId: 0x77,
  });
  assert.ok(spawn);
  assert.equal(spawn.y, BOULDER_SPAWN_Y + PLAY_H);
  assert.ok(spawn.x < 0x80, 'left-half chase stays in the home cell');
});

test('ActiveBoulders is a per-home-room cap', () => {
  const mountain = createEnemy({ objType: OBJ.BOULDER, x: PLAY_W + 0x80, y: 0x40 });
  mountain.homeRoomId = 0x78;
  const here = createEnemy({ objType: OBJ.BOULDER, x: 0x80, y: 0x40 });
  here.homeRoomId = 0x77;
  const enemies = [mountain, here];
  assert.equal(countActiveBoulders(enemies, 0x78), 1);
  assert.equal(countActiveBoulders(enemies, 0x77), 1);
  assert.equal(countActiveBoulders(enemies), 2);

  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: PLAY_W + 0x80, y: 0x80 });
  set.homeRoomId = 0x78;
  set.timer = 0;
  const spawn = stepBoulderSet(set, enemies, {
    chase: { x: PLAY_W + 0xc0, y: 0x80 },
    rngByte: () => 0x00,
    anchorRoomId: 0x77,
  });
  assert.ok(spawn, 'a rock in `$77` must not fill `$78`\'s cap');
});

test('a leftover boulder does not die at the streaming anchor\'s $F0', () => {
  // Top of `$87` is $40 + PLAY_H, which is the same byte as the NES scrap
  // zone on the `$77` screen. Comparing Y against a raw $F0 would kill the
  // rock the frame it spawned.
  const e = createEnemy({
    objType: OBJ.BOULDER,
    x: 0x80,
    y: BOULDER_SPAWN_Y + PLAY_H,
    dir: DIR.DOWN,
  });
  e.homeRoomId = 0x87;
  e.jumperState = 1;
  e.jumperVy = 1;
  e.jumperTargetY = e.y + 0x20;
  const wide = {
    minX: 0,
    maxX: 0xff,
    minY: 0,
    maxY: BOULDER_DESTROY_Y + PLAY_H + 0x20,
  };
  stepEnemy(e, wide, null, {
    chase: { x: 0x80, y: PLAY_H + 0x80 },
    anchorRoomId: 0x77,
  });
  assert.equal(e.alive, true, 'anchor $F0 is still the top of this cell');
});

test('a leftover boulder dies at its home cell\'s $F0, not the anchor\'s', () => {
  const e = createEnemy({
    objType: OBJ.BOULDER,
    x: 0x80,
    y: BOULDER_DESTROY_Y + PLAY_H - 2,
    dir: DIR.DOWN,
  });
  e.homeRoomId = 0x87;
  e.jumperState = 1;
  e.jumperVy = 4;
  e.jumperTargetY = BOULDER_DESTROY_Y + PLAY_H + 0x40;
  const wide = {
    minX: 0,
    maxX: 0xff,
    minY: 0,
    maxY: BOULDER_DESTROY_Y + PLAY_H + 0x20,
  };
  stepEnemy(e, wide, null, {
    chase: { x: 0x80, y: PLAY_H + 0x80 },
    anchorRoomId: 0x77,
  });
  assert.equal(e.alive, false);
  assert.ok(e.y >= boulderScrapY(0x87, 0x77));
});

test('stepEnemy offsets leftover BoulderSet rocks into the home cell', () => {
  const set = createEnemy({ objType: OBJ.BOULDER_SET, x: PLAY_W + 0x80, y: 0x80 });
  set.homeRoomId = 0x78;
  set.timer = 0;
  set.viewActivated = true;
  /** @type {import('./enemies.js').Enemy[]} */
  const enemies = [set];
  stepEnemy(set, OW_ENEMY_BOUNDS, null, {
    enemies,
    chase: { x: PLAY_W + 0xc0, y: 0x80 },
    rngByte: () => 0x00,
    anchorRoomId: 0x77,
  });
  assert.equal(enemies.length, 2);
  assert.equal(enemies[1].objType, OBJ.BOULDER);
  assert.equal(enemies[1].homeRoomId, 0x78);
  assert.ok(enemies[1].x >= PLAY_W, 'rock must not appear on the anchor screen');
  assert.equal(enemies[1].y, BOULDER_SPAWN_Y);
});
