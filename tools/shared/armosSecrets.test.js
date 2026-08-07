import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyArmosFloorReveal,
  armosSecretAt,
  ARMOS_BRACELET_ITEM,
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
