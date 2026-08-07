import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyArmosFloorReveal,
  armosSecretAt,
  restoreArmosReveals,
  ARMOS_BRACELET_ITEM,
  ARMOS_FLOOR_TILE,
  ARMOS_STAIRS_TILE,
} from './armosSecrets.js';
import { HUD_HEIGHT } from './collision.js';

test('bracelet under Armos in room $24 at $E0,$80', () => {
  const s = armosSecretAt(0x24, { x: 0xe0, y: 0x80 });
  assert.equal(s?.kind, 'bracelet');
  assert.equal(s?.itemType, ARMOS_BRACELET_ITEM);
});

test('stairs under Armos in room $0B at $B0,$80', () => {
  const s = armosSecretAt(0x0b, { x: 0xb0, y: 0x80 });
  assert.equal(s?.kind, 'stairs');
  assert.equal(s?.tile, ARMOS_STAIRS_TILE);
});

test('applyArmosFloorReveal writes stairs tiles', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const armos = { x: 0xb0, y: HUD_HEIGHT + 0x40 }; // play row 4 → but secret needs y=$80
  // Use exact NES screen Y $80.
  const a = { x: 0xb0, y: 0x80 };
  const secret = applyArmosFloorReveal(grid, 0x0b, a);
  assert.equal(secret?.kind, 'stairs');
  const col = Math.floor(0xb0 / 16);
  const row = Math.floor((0x80 - HUD_HEIGHT) / 16);
  assert.equal(grid[row * 2][col * 2], 0x70);
});

test('restoring reveals keeps each Armos on its own square', () => {
  // `$0B` rings the Level 5 door with eight statues; only the one at square
  // (row 4, col 11) hides stairs. The plain statue directly below it shares
  // that column, and used to come back as a second staircase because the
  // restore forced the secret's Y instead of using the stored row.
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const revealed = new Set(['armos:11:4:11', 'armos:11:6:11']);
  restoreArmosReveals(grid, 0x0b, revealed);
  assert.equal(grid[4 * 2][11 * 2], ARMOS_STAIRS_TILE, 'row 4 is the real stairway');
  assert.equal(grid[6 * 2][11 * 2], ARMOS_FLOOR_TILE, 'row 6 must stay plain floor');
});

test('restoring a reveal round-trips applyArmosFloorReveal', () => {
  const live = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  const secret = applyArmosFloorReveal(live, 0x0b, { x: 0xb0, y: 0x80 });
  const reloaded = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  restoreArmosReveals(reloaded, 0x0b, new Set([secret.key]));
  assert.deepEqual(reloaded, live);
});

test('a plain Armos round-trips as floor, not stairs', () => {
  const live = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Same column as the secret, one square lower — screen Y $A0.
  const secret = applyArmosFloorReveal(live, 0x0b, { x: 0xb0, y: 0xa0 });
  assert.notEqual(secret?.kind, 'stairs');
  const reloaded = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  restoreArmosReveals(reloaded, 0x0b, new Set([secret.key]));
  assert.deepEqual(reloaded, live);
});
