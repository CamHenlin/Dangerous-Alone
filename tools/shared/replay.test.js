import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { hashGameState, holdDir, openTileGrid, runReplay } from './replay.js';
import { createIntRng, mulberry32 } from './rng.js';

test('mulberry32 is deterministic', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test('createIntRng stays in range', () => {
  const rng = createIntRng(7);
  for (let i = 0; i < 50; i += 1) {
    const n = rng(4);
    assert.ok(n >= 0 && n < 4);
  }
});

test('replay walk right is stable hash', () => {
  const frames = holdDir(DIR.RIGHT, 40);
  const a = runReplay({
    seed: 1,
    startX: 0x40,
    startY: 0x8d,
    startDir: DIR.RIGHT,
    tileGrid: openTileGrid(),
    frames,
  });
  const b = runReplay({
    seed: 1,
    startX: 0x40,
    startY: 0x8d,
    startDir: DIR.RIGHT,
    tileGrid: openTileGrid(),
    frames,
  });
  assert.equal(a.hash, b.hash);
  assert.ok(a.link.x > 0x40);
  assert.equal(a.hash, hashGameState({ seed: 1, frame: 40, link: a.link }));
});

test('different seeds do not affect pure walk hash when unused', () => {
  const frames = holdDir(DIR.DOWN, 20);
  const a = runReplay({ seed: 1, frames, startX: 0x80, startY: 0x60 });
  const b = runReplay({ seed: 99, frames, startX: 0x80, startY: 0x60 });
  // seed is part of hashGameState — hashes differ even if motion matches
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.link.x, b.link.x);
  assert.equal(a.link.y, b.link.y);
});
