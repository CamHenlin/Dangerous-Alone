import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEnemySprite } from './enemyAnim.js';
import { OBJ_LISTS_BLOB } from './spawn.js';
import { spawnDungeonEnemies, OBJ } from './enemies.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

/**
 * Object types that appear as spawn list entries but are not drawn as
 * room monsters (shots, people, whirlwind, etc.) — skip coverage.
 */
const NON_MONSTER_LIST_TYPES = new Set([
  0x00,
  0x2e, // whirlwind
  0x35, // rupee stash
]);

test('every ObjLists monster type has a sprite mapping', () => {
  const types = new Set(
    OBJ_LISTS_BLOB.filter(
      (t) => t > 0 && t < 0x53 && !NON_MONSTER_LIST_TYPES.has(t),
    ),
  );
  const missing = [...types].filter((t) => !hasEnemySprite(t)).sort((a, b) => a - b);
  assert.deepEqual(
    missing,
    [],
    `missing sprites for: ${missing.map((t) => `$${t.toString(16).padStart(2, '0')}`).join(', ')}`,
  );
});

test('every Q1 dungeon spawn type has a sprite (no color stubs)', () => {
  /** @type {Map<number, string[]>} */
  const missing = new Map();
  for (let lv = 1; lv <= 9; lv += 1) {
    const path = join(ROOT, 'assets/extracted/dungeons/q1', `level_${lv}`, 'level.json');
    let level;
    try {
      level = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    for (const room of level.rooms ?? []) {
      const spawns = spawnDungeonEnemies(room, { x: 0, y: 0x40 }, 8);
      for (const e of spawns) {
        if (!hasEnemySprite(e.objType)) {
          if (!missing.has(e.objType)) missing.set(e.objType, []);
          missing.get(e.objType).push(`L${lv}$${room.roomId.toString(16)}`);
        }
      }
    }
  }
  assert.equal(
    missing.size,
    0,
    [...missing.entries()]
      .map(([t, rooms]) => {
        const name = Object.entries(OBJ).find(([, v]) => v === t)?.[0] ?? '?';
        return `$${t.toString(16)} ${name} @ ${rooms.slice(0, 4).join(',')}`;
      })
      .join('; '),
  );
});

test('OW roamers and dungeon commons are mapped', () => {
  const required = [
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, // lynel / moblin / goriya
    0x0b, 0x0c, // darknut
    0x11, 0x12, 0x13, 0x14, 0x15, // zora / vire / zol / gel
    0x16, 0x17, // pols / like-like
    0x1a, 0x1e, 0x1f, 0x20, 0x21, 0x22, // peahat / armos / boulder / ghini
    0x23, 0x24, // wizzrobe
    0x27, 0x28, 0x2a, // wallmaster / rope / stalfos
    0x2b, 0x2c, 0x2d, 0x2f, 0x30, // bubbles / pond fairy / gibdo
    0x36, 0x37, // grumble / zelda
    0x3c, 0x3d, 0x41, // manhandla / aquamentus / moldorm
    0x49, 0x4a, // traps
    0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, // UW persons
  ];
  for (const t of required) {
    assert.equal(hasEnemySprite(t), true, `$${t.toString(16).padStart(2, '0')}`);
  }
});
