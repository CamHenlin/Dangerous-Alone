import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import {
  GRAVE_PUSH_HOLD,
  SECRET_ACTION,
  SECRET_CAVE_TILES,
  collectScreenSecrets,
  revealSecretTiles,
  secretAction,
  tryPushGraveSecret,
  tryRevealSecrets,
} from './owSecrets.js';

test('secret marker actions match ROM tile objects', () => {
  assert.equal(SECRET_ACTION[0xe5], 'push');
  assert.equal(SECRET_ACTION[0xe6], 'bomb');
  assert.equal(SECRET_ACTION[0xe7], 'burn');
  assert.equal(SECRET_ACTION[0xe8], 'push');
});

test('secretAction prefers marker over stale baked JSON action', () => {
  assert.equal(secretAction({ marker: 0xe6, action: 'burn' }), 'bomb');
  assert.equal(secretAction({ marker: 0xe7, action: 'bomb' }), 'burn');
});

test('collectScreenSecrets respects ignore flags', () => {
  const primary = Array(56).fill(0);
  primary[0x27] = 0xe6;
  const squares = Array.from({ length: 11 }, () => Array(16).fill(0));
  squares[5][8] = 0x27;
  assert.equal(collectScreenSecrets(squares, primary, {}, 1).length, 1);
  assert.equal(
    collectScreenSecrets(squares, primary, { ignoreSecretQ1: true }, 1).length,
    0,
  );
  const [sec] = collectScreenSecrets(squares, primary, {}, 1);
  assert.equal(sec.action, 'bomb');
  assert.equal(sec.requiresBracelet, true);
});

test('bomb wall reveals cave mouth tiles (MakeCave $0C)', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xd8));
  // Stale baked action 'burn' must still open via marker $E6 → bomb.
  const secrets = [{ row: 3, col: 4, marker: 0xe6, action: 'burn' }];
  const revealed = new Set();
  const opened = tryRevealSecrets(
    secrets,
    revealed,
    0x10,
    'bomb',
    4 * 16,
    0x3d + 3 * 16,
    tileGrid,
  );
  assert.equal(opened.length, 1);
  assert.equal(tileGrid[6][8], SECRET_CAVE_TILES[0]);
  assert.equal(tileGrid[7][8], SECRET_CAVE_TILES[1]);
  assert.equal(tileGrid[6][9], SECRET_CAVE_TILES[2]);
  assert.equal(tileGrid[7][9], SECRET_CAVE_TILES[3]);
});

test('burn tree reveals stairs', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xc4));
  const secrets = [{ row: 3, col: 4, marker: 0xe7, action: 'bomb' }];
  const revealed = new Set();
  const opened = tryRevealSecrets(
    secrets,
    revealed,
    0x6d,
    'burn',
    4 * 16,
    0x3d + 3 * 16,
    tileGrid,
  );
  assert.equal(opened.length, 1);
  assert.equal(tileGrid[6][8], 0x70);
  assert.equal(
    tryRevealSecrets(secrets, revealed, 0x6d, 'burn', 4 * 16, 0x3d + 3 * 16, tileGrid)
      .length,
    0,
  );
  assert.equal(revealSecretTiles(tileGrid, 0, 0, 0xe7), true);
});

test('grave push needs exact X + hold frames', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xd8));
  const secrets = [{ row: 3, col: 4, marker: 0xe8, action: 'push' }];
  const revealed = new Set();
  const hold = new Map();
  const link = { x: 4 * 16, y: HUD_HEIGHT + 3 * 16 + 8, dir: DIR.UP };
  let opened = [];
  for (let i = 0; i < GRAVE_PUSH_HOLD; i += 1) {
    opened = tryPushGraveSecret(
      secrets,
      revealed,
      1,
      link,
      tileGrid,
      DIR.UP,
      hold,
      { bracelet: 1 },
    );
    if (i < GRAVE_PUSH_HOLD - 1) assert.equal(opened.length, 0);
  }
  assert.equal(opened.length, 1);
  assert.equal(tileGrid[6][8], 0x70);
  // Gravestone does not need bracelet.
  const holdGrave = new Map();
  const revealedGrave = new Set();
  const tileGrid2 = Array.from({ length: 22 }, () => Array(32).fill(0xd8));
  for (let i = 0; i < GRAVE_PUSH_HOLD; i += 1) {
    opened = tryPushGraveSecret(
      secrets,
      revealedGrave,
      1,
      link,
      tileGrid2,
      DIR.UP,
      holdGrave,
      { bracelet: 0 },
    );
  }
  assert.equal(opened.length, 1);
  // Rocks ($E5) need bracelet.
  const rock = [{ row: 3, col: 4, marker: 0xe5, action: 'push' }];
  const hold0 = new Map();
  const revealed0 = new Set();
  assert.equal(
    tryPushGraveSecret(rock, revealed0, 1, link, tileGrid, DIR.UP, hold0, {
      bracelet: 0,
    }).length,
    0,
  );
  // Wrong X never opens.
  const hold2 = new Map();
  const revealed2 = new Set();
  const linkBad = { ...link, x: link.x + 1 };
  for (let i = 0; i < GRAVE_PUSH_HOLD + 2; i += 1) {
    assert.equal(
      tryPushGraveSecret(
        secrets,
        revealed2,
        2,
        linkBad,
        tileGrid,
        DIR.UP,
        hold2,
        { bracelet: 1 },
      ).length,
      0,
    );
  }
});
