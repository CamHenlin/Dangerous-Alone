import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import { createEnemy } from './enemies.js';
import {
  PASSIVE_FADE_FRAMES,
  squareFromCollisionSample,
  trySpawnPassiveTileObject,
} from './passiveTileObjects.js';
import { armosSecretAt, ARMOS_STAIRS_TILE } from './armosSecrets.js';

/** Minimal OW grid with Armos square $C0 at ($90, $80). */
function gridWithArmosAt(worldX, worldY) {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const col = Math.floor(worldX / 8);
  const row = Math.floor((worldY - HUD_HEIGHT) / 8);
  grid[row][col] = 0xc0;
  grid[row][col + 1] = 0xc2;
  grid[row + 1][col] = 0xc1;
  grid[row + 1][col + 1] = 0xc3;
  return grid;
}

test('square snap from collision sample', () => {
  const s = squareFromCollisionSample(0x90, 0x80);
  assert.equal(s.x, 0x90);
  assert.equal(s.y, 0x80);
});

test('OW $3D right Armos wake reveals stairs secret', () => {
  assert.equal(armosSecretAt(0x3d, { x: 0x90, y: 0x80 })?.tile, ARMOS_STAIRS_TILE);
  assert.equal(armosSecretAt(0x3d, { x: 0x60, y: 0x80 }), null);
});

test('trySpawnPassiveTileObject spawns fading Armos from $C0', () => {
  const grid = gridWithArmosAt(0x90, 0x80);
  // Stand left of the statue at the same row (NES ObjY ≈ $80).
  const link = { x: 0x80, y: 0x80, dir: DIR.RIGHT, gridOffset: 0 };
  const enemies = [];
  const e = trySpawnPassiveTileObject(link, grid, DIR.RIGHT, enemies, createEnemy);
  assert.ok(e);
  assert.equal(e.objType, 0x1e);
  assert.equal(e.x, 0x90);
  assert.equal(e.y, 0x80);
  assert.equal(e.armosStatue, false);
  assert.equal(e.armosFade, PASSIVE_FADE_FRAMES);

  // Second call does not duplicate.
  assert.equal(
    trySpawnPassiveTileObject(link, grid, DIR.RIGHT, [e], createEnemy),
    null,
  );
});

test('mid-stride does not spawn', () => {
  const grid = gridWithArmosAt(0x90, 0x80);
  const link = { x: 0x80, y: 0x80, dir: DIR.RIGHT, gridOffset: 4 };
  assert.equal(
    trySpawnPassiveTileObject(link, grid, DIR.RIGHT, [], createEnemy),
    null,
  );
});
