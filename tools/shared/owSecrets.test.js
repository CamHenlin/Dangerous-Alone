import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import { PLAY_W, occupyingRoom } from './continuousCamera.js';
import { createOwFlame } from './candle.js';
import {
  CONTINUOUS_OW,
  LINK_QSPEED,
  createLinkState,
  stepLink,
} from './linkMotion.js';
import {
  decodeScreen,
  loadOverworldTables,
  screenSecrets,
  screenToTileGrid,
} from './overworld.js';
import {
  GRAVE_PUSH_HOLD,
  GRAVE_PUSH_TILES,
  OW_FLOOR_TILES,
  OW_SHORTCUT_POS_PACKED,
  ROCK_PUSH_TILES,
  SECRET_ACTION,
  SECRET_CAVE_TILES,
  applyGravePushTiles,
  collectScreenSecrets,
  nudgeLinkOntoGraveAxis,
  owShortcutStairsPos,
  revealSecretTiles,
  secretAction,
  secretWorldRect,
  tryPushGraveSecret,
  tryRevealSecrets,
} from './owSecrets.js';
import { ROOT } from './paths.js';

const romPath = path.join(ROOT, 'zelda.nes');
const owSchemaPath = path.join(ROOT, 'assets/schema/overworld.json');

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
  // Dest is one square north — the grave slides off the warp instead of vanishing.
  assert.equal(tileGrid[4][8], GRAVE_PUSH_TILES[0]);
  assert.ok(opened[0].dest, 'push must record the dest square');
  assert.equal(opened[0].dest.row, 2);
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

test('grave nudge slides Link onto exact X then push opens', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xd8));
  const secrets = [{ row: 3, col: 4, marker: 0xe8, action: 'push' }];
  const revealed = new Set();
  const hold = new Map();
  // One walk-column left of the grave — looks under it, fails exact CMP.
  const link = { x: 4 * 16 - 8, y: HUD_HEIGHT + 3 * 16 + 5, gridOffset: 0, dir: DIR.UP };
  let opened = [];
  for (let i = 0; i < 8 + GRAVE_PUSH_HOLD; i += 1) {
    nudgeLinkOntoGraveAxis(secrets, revealed, 1, link, DIR.UP, {});
    opened = tryPushGraveSecret(
      secrets,
      revealed,
      1,
      link,
      tileGrid,
      DIR.UP,
      hold,
      {},
    );
    if (opened.length) break;
  }
  assert.equal(link.x, 4 * 16);
  assert.equal(opened.length, 1);
  assert.equal(tileGrid[6][8], 0x70);
  assert.equal(tileGrid[4][8], GRAVE_PUSH_TILES[0]);
});

test('OW $21 magic-sword grave dest stays solid north of the warp', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(owSchemaPath, 'utf8'));
  const tables = loadOverworldTables(prg, schema);
  const screen = decodeScreen(tables, 0x21);
  const grave = screenSecrets(screen, tables, 1).find((s) => s.marker === 0xe8);
  assert.ok(grave, '$21 must keep the gravestone secret');
  assert.equal(grave.row, 5);
  assert.equal(grave.col, 9);

  const grid = screenToTileGrid(screen, tables);
  const applied = applyGravePushTiles(grid, grave, DIR.UP, { stairPositionIndex: 2 });
  assert.equal(applied.dest?.row, 4);
  assert.equal(applied.dest?.col, 9);
  assert.equal(applied.stairs.col, 9);
  assert.equal(applied.stairs.row, 5);
  assert.equal(grid[10][18], 0x70, 'shortcut stairs stay on the grave square');
  assert.equal(grid[8][18], GRAVE_PUSH_TILES[0], 'dest north keeps grave CHR');

  const destX = grave.col * 16;
  const destY = HUD_HEIGHT + 4 * 16;
  const walkUntilStop = (link, dir, frames = 80) => {
    for (let i = 0; i < frames; i += 1) {
      const x0 = link.x;
      const y0 = link.y;
      stepLink(link, grid, dir, LINK_QSPEED, CONTINUOUS_OW, {});
      if (link.x === x0 && link.y === y0) break;
    }
    return { x: link.x, y: link.y };
  };

  const fromWest = walkUntilStop(createLinkState(destX - 0x20, destY - 3, DIR.RIGHT), DIR.RIGHT);
  const fromEast = walkUntilStop(createLinkState(destX + 0x20, destY - 3, DIR.LEFT), DIR.LEFT);
  assert.equal(fromWest.x, destX - 0x10, `dest left-stop x=$${fromWest.x.toString(16)}`);
  assert.equal(fromEast.x, destX + 0x10, `dest right-stop x=$${fromEast.x.toString(16)}`);
});

test('OW shortcut stairs match LevelInfoOW packed bytes', () => {
  assert.deepEqual(
    [...OW_SHORTCUT_POS_PACKED],
    [0x57, 0x49, 0x99, 0x69],
  );
  assert.deepEqual(owShortcutStairsPos(0), { x: 0x50, y: 0x70, col: 5, row: 3 });
  assert.deepEqual(owShortcutStairsPos(2), { x: 0x90, y: 0x90, col: 9, row: 5 });
});

test('OW $79 rock push puts stairs in the shortcut gap, not under the rock', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(owSchemaPath, 'utf8'));
  const tables = loadOverworldTables(prg, schema);
  const screen = decodeScreen(tables, 0x79);
  assert.equal(screen.attrs.stairPositionIndex, 2);
  const rock = screenSecrets(screen, tables, 1).find((s) => s.marker === 0xe5);
  assert.ok(rock, '$79 must keep the bracelet-rock secret');
  assert.equal(rock.row, 5);
  assert.equal(rock.col, 8);

  const grid = screenToTileGrid(screen, tables);
  const applied = applyGravePushTiles(grid, rock, DIR.UP, {
    stairPositionIndex: screen.attrs.stairPositionIndex,
  });
  assert.equal(applied.dest?.row, 4);
  assert.equal(applied.dest?.col, 8);
  assert.equal(applied.stairs.col, 9);
  assert.equal(applied.stairs.row, 5);
  assert.equal(grid[10][16], OW_FLOOR_TILES[0], 'origin must be sand, not stairs');
  assert.equal(grid[8][16], ROCK_PUSH_TILES[0], 'dest north keeps rock CHR');
  assert.equal(grid[10][18], 0x70, 'stairs belong in the $90,$90 gap');
});

test('every Q1 push secret paints stairs at ShortcutOrItemXY', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(owSchemaPath, 'utf8'));
  const tables = loadOverworldTables(prg, schema);
  let rooms = 0;
  for (let id = 0; id < 128; id += 1) {
    const screen = decodeScreen(tables, id);
    const secrets = screenSecrets(screen, tables, 1).filter(
      (s) => s.marker === 0xe5 || s.marker === 0xe8,
    );
    if (!secrets.length) continue;
    rooms += 1;
    const expect = owShortcutStairsPos(screen.attrs.stairPositionIndex);
    for (const secret of secrets) {
      const grid = screenToTileGrid(screen, tables);
      const applied = applyGravePushTiles(grid, secret, DIR.UP, {
        stairPositionIndex: screen.attrs.stairPositionIndex,
      });
      assert.equal(
        applied.stairs.col,
        expect.col,
        `$${id.toString(16)} stairs col`,
      );
      assert.equal(
        applied.stairs.row,
        expect.row,
        `$${id.toString(16)} stairs row`,
      );
      const originUl = grid[secret.row * 2][secret.col * 2];
      const originIsShortcut =
        secret.row === expect.row && secret.col === expect.col;
      assert.equal(
        originUl,
        originIsShortcut ? 0x70 : OW_FLOOR_TILES[0],
        `$${id.toString(16)} origin UL`,
      );
    }
  }
  assert.ok(rooms >= 4, 'Q1 has several bracelet-rock / grave rooms');
});

test('candle flame beside $47 burn tree opens it', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xc4));
  const secrets = [{ row: 7, col: 11, marker: 0xe7, action: 'burn' }];
  const rect = secretWorldRect(secrets[0]);
  const flame = createOwFlame(rect.x - 16, rect.y, DIR.RIGHT);
  const opened = tryRevealSecrets(
    secrets,
    new Set(),
    0x47,
    'burn',
    flame.x,
    flame.y,
    tileGrid,
  );
  assert.equal(opened.length, 1);
  assert.equal(tileGrid[14][22], 0x70);
});

test('burn reveal uses occupying-room local, not the stream anchor', () => {
  const tileGrid = Array.from({ length: 22 }, () => Array(32).fill(0xc4));
  const secrets = [{ row: 7, col: 11, marker: 0xe7, action: 'burn' }];
  // Anchor $46: leftover $47's burn tree is one screen to the east.
  const flame = { x: PLAY_W + 11 * 16, y: HUD_HEIGHT + 7 * 16 };
  const occ = occupyingRoom(0x46, flame.x, flame.y);
  assert.equal(occ.roomId, 0x47);
  assert.equal(
    tryRevealSecrets(secrets, new Set(), occ.roomId, 'burn', occ.x, occ.y, tileGrid)
      .length,
    1,
  );
  // Same flame against the anchor room id / raw coords misses $47's square.
  assert.equal(
    tryRevealSecrets(secrets, new Set(), 0x46, 'burn', flame.x, flame.y, tileGrid)
      .length,
    0,
  );
});
