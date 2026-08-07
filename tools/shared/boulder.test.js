import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOULDER,
  BOULDER_DESTROY_Y,
  BOULDER_SET,
  BOULDER_SPAWN_Y,
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
