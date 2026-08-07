import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOSS, gleeokHeadCount, isGleeok, isPatra } from './bosses.js';
import {
  damageGleeok,
  damageManhandla,
  patraParentVulnerable,
  spawnGleeokHead,
  spawnPatraChildren,
  stepBossAi,
} from './bossAi.js';
import {
  createEnemy,
  spawnDungeonEnemies,
  trySwordHitEnemy,
} from './enemies.js';
import { applyQuest2LevelInfo, Q2_LEVEL_INFO_REPLACEMENTS } from './quest2LevelInfo.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { SWORD } from './inventory.js';

test('Manhandla dies after four mouth pools', () => {
  const e = createEnemy({ objType: BOSS.MANHANDLA, x: 0x80, y: 0x80 });
  assert.equal(e.mouthHp.length, 4);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(damageManhandla(e, 0x40), true);
  }
  assert.equal(e.alive, false);
});

test('Manhandla speeds up when a mouth dies', () => {
  const e = createEnemy({ objType: BOSS.MANHANDLA, x: 0x80, y: 0x80 });
  const frac = e.speedFrac;
  damageManhandla(e, 0x40);
  assert.ok((e.speedFrac ?? 0) + (e.speedWhole ?? 0) * 0x100 > frac);
});

test('Gleeok head count from type', () => {
  assert.equal(gleeokHeadCount(BOSS.GLEEOK_2), 2);
  assert.equal(gleeokHeadCount(BOSS.GLEEOK_3), 3);
  assert.equal(gleeokHeadCount(BOSS.GLEEOK_4), 4);
});

test('Gleeok detaches heads then dies', () => {
  const e = createEnemy({ objType: BOSS.GLEEOK_2, x: 0x80, y: 0x80 });
  assert.equal(e.headHp.length, 2);
  /** @type {import('./enemies.js').Enemy[]} */
  const heads = [];
  // Kill first head.
  while (e.headHp[0] > 0) {
    damageGleeok(e, 0x40, (body) => {
      const h = spawnGleeokHead(body, createEnemy);
      if (h) heads.push(h);
    });
  }
  assert.equal(heads.length, 1);
  assert.equal(heads[0].immortal, true);
  assert.equal(e.alive, true);
  // Kill second head → body dies.
  while (e.alive) {
    damageGleeok(e, 0x40, (body) => {
      const h = spawnGleeokHead(body, createEnemy);
      if (h) heads.push(h);
    });
  }
  assert.equal(e.alive, false);
  assert.equal(heads.length, 2);
});

test('Patra parent invulnerable until children dead', () => {
  const parent = createEnemy({ objType: BOSS.PATRA, x: 0x80, y: 0x70 });
  const kids = spawnPatraChildren(parent, createEnemy);
  assert.equal(kids.length, 8);
  const enemies = [parent, ...kids];
  assert.equal(patraParentVulnerable(parent, enemies), false);
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  sword.timer = 8;
  sword.dir = DIR.UP;
  assert.equal(
    trySwordHitEnemy(parent, sword, parent.x - 8, parent.y + 20, SWORD.MAGIC, {
      enemies,
    }),
    false,
  );
  for (const k of kids) k.alive = false;
  assert.equal(patraParentVulnerable(parent, enemies), true);
  assert.equal(
    trySwordHitEnemy(parent, sword, parent.x - 8, parent.y + 20, SWORD.MAGIC, {
      enemies,
    }),
    true,
  );
});

test('Patra spawn expands in dungeon room', () => {
  // NES stores Patra as listId $47 = groups bit + id $07.
  const room = {
    roomId: 0x52,
    monster: { id: 0x07, countIndex: 0 },
    useMonsterGroups: true,
  };
  const list = spawnDungeonEnemies(room, { x: 0, y: 0 }, DIR.UP);
  assert.ok(
    list.some((e) => isPatra(e.objType)),
    `types=${list.map((e) => e.objType.toString(16)).join(',')}`,
  );
  assert.equal(list.filter((e) => e.objType === 0x25).length, 8);
});

test('Gleeok step does not crash', () => {
  const e = createEnemy({ objType: BOSS.GLEEOK_3, x: 0x80, y: 0x80 });
  assert.ok(isGleeok(e.objType));
  assert.equal(e.x, 0x74);
  assert.equal(e.y, 0x57);
  assert.equal(e.necks.length, 3);
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  for (let i = 0; i < 30; i += 1) stepBossAi(e, bounds, { chase: { x: 0x40, y: 0x80 } });
  assert.equal(e.alive, true);
  assert.equal(e.x, 0x74);
  assert.equal(e.y, 0x57);
  // Heads wander off the shared base column.
  const moved = e.necks.some((n) => n.headX !== 0x7c || n.headY !== 0x88);
  assert.ok(moved, 'expected at least one neck head to move');
});

test('Q2 LevelInfo L1 start/boss/item from replacements', () => {
  assert.equal(Q2_LEVEL_INFO_REPLACEMENTS.length, 9);
  const level = {
    quest: 2,
    level: 1,
    startRoom: 0x73,
    bossRoom: 0x35,
    triforceRoom: 0x36,
    cellarRooms: [0x7f],
    itemPositions: [],
    drawnMap: [],
  };
  applyQuest2LevelInfo(level);
  assert.equal(level.startRoom, 0x77);
  assert.equal(level.bossRoom, 0x07);
  assert.equal(level.triforceRoom, 0x08);
  assert.deepEqual(level.cellarRooms, [0x28]);
  assert.equal(level.itemPositions[3].packed, 0xb7);
});
