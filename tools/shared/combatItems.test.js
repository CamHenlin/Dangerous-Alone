import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, UW_FIRST_UNWALKABLE } from './collision.js';
import {
  BOOM_PHASE,
  BOOMERANG_STUN_FRAMES,
  throwBoomerang,
} from './boomerang.js';
import { enemyChasesBait, placeBait } from './bait.js';
import {
  OBJ,
  createEnemy,
  stepEnemy,
  tryBoomerangHitEnemy,
} from './enemies.js';
import { tryEdgeSpawn } from './spawn.js';
import { buildDungeonPlayGrid, dungeonTileOpts } from './dungeonPlay.js';

test('boomerang stuns octorok for ~$A0 frames', () => {
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_SLOW, x: 0x80, y: 0x80 });
  const boom = throwBoomerang(0x80, 0x80, DIR.RIGHT);
  boom.x = e.x + 4;
  boom.y = e.y + 4;
  assert.equal(tryBoomerangHitEnemy(e, boom), true);
  assert.equal(e.stunTimer, BOOMERANG_STUN_FRAMES);
  assert.equal(boom.hit, true);
  const dirBefore = e.dir;
  stepEnemy(e, { minX: 0, maxX: 0xff, minY: 0, maxY: 0xff });
  assert.equal(e.stunTimer, BOOMERANG_STUN_FRAMES - 1);
  assert.equal(e.dir, dirBefore);
});

test('boomerang DealDamage(0) kills Gel', () => {
  const e = createEnemy({ objType: OBJ.GEL, x: 0x80, y: 0x80 });
  assert.equal(e.hp, 0);
  const boom = throwBoomerang(0x80, 0x80, DIR.RIGHT);
  boom.x = e.x + 2;
  boom.y = e.y + 2;
  assert.equal(tryBoomerangHitEnemy(e, boom), true);
  assert.equal(e.alive, false);
});

test('aquamentus is boomerang-immune', () => {
  const e = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0xb0, y: 0x80 });
  const boom = throwBoomerang(e.x, e.y, DIR.LEFT);
  boom.x = e.x + 4;
  boom.y = e.y + 4;
  assert.equal(tryBoomerangHitEnemy(e, boom), false);
  assert.equal(e.stunTimer, 0);
  assert.equal(boom.hit, true); // still returns
  assert.equal(boom.phase, BOOM_PHASE.OUT);
});

test('bait attracts octorok family', () => {
  assert.equal(enemyChasesBait(OBJ.RED_OCTOROK_SLOW), true);
  assert.equal(enemyChasesBait(OBJ.AQUAMENTUS), false);
  const bait = placeBait(0x80, 0x80, DIR.RIGHT);
  assert.equal(bait.alive, true);
  assert.ok(bait.x > 0x80);
});

test('monsterEntry spawns are edge-pending until placed', () => {
  const open = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const pending = { objType: 7, edgePending: true };
  const placed = tryEdgeSpawn(pending, open, { x: 0x80, y: 0x80 }, () => 0);
  assert.ok(placed);
  assert.equal(placed.edgePending, false);
  assert.ok(placed.x === 0x20 || placed.x === 0xd0 || placed.y === 0x4d || placed.y === 0xd0);
});

test('UW first unwalkable is $78', () => {
  assert.equal(UW_FIRST_UNWALKABLE, 0x78);
  const opts = dungeonTileOpts();
  assert.equal(opts.firstUnwalkable, 0x78);
});

test('buildDungeonPlayGrid composes walls around floor', () => {
  const room = {
    squares: Array.from({ length: 7 }, () => Array(12).fill(0)),
    doors: {
      north: { code: 1, type: 'wall' },
      south: { code: 0, type: 'open' },
      west: { code: 1, type: 'wall' },
      east: { code: 1, type: 'wall' },
    },
  };
  const grid = buildDungeonPlayGrid(room, { x: 0, y: 64 });
  assert.equal(grid.length, 22);
  assert.equal(grid[0].length, 32);
  // Outer brick / wall tiles — not empty.
  assert.notEqual(grid[1][1], 0);
  // Floor origin (col 4, row 4) gets a primary square tile.
  assert.equal(grid[4][4], 0xb0);
});
