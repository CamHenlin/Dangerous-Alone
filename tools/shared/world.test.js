import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { createLinkState, stepLink } from './linkMotion.js';
import { ROOT } from './paths.js';
import {
  checkCaveEntry,
  checkScreenTransition,
  neighborRoomId,
  overworldExitSpawn,
  standingTile,
} from './world.js';

test('neighborRoomId respects 16×8 map edges', () => {
  assert.equal(neighborRoomId(0x77, DIR.UP), 0x67);
  assert.equal(neighborRoomId(0x77, DIR.DOWN), null); // bottom row
  assert.equal(neighborRoomId(0x70, DIR.LEFT), null);
  assert.equal(neighborRoomId(0x37, DIR.RIGHT), 0x38);
  assert.equal(neighborRoomId(0x37, DIR.UP), 0x27);
});

test('screen transition from north edge', () => {
  const link = { x: 0x78, y: 0x3d, dir: DIR.UP, gridOffset: 0 };
  const t = checkScreenTransition(link, 0x77);
  assert.ok(t);
  assert.equal(t.nextRoomId, 0x67);
  assert.equal(t.y, 0xcd);
  assert.equal(t.x, 0x78);
  assert.equal(t.y & 7, 5);
});

test('transition still fires mid-cell at the edge', () => {
  // Reaching the edge often stops with gridOffset !== 0.
  const link = { x: 0x78, y: 0x3d, dir: DIR.UP, gridOffset: -1 };
  const t = checkScreenTransition(link, 0x77);
  assert.ok(t);
  assert.equal(t.nextRoomId, 0x67);
});

test('south-then-north transitions keep working', async () => {
  const { createLinkState, stepLink, LINK_QSPEED } = await import('./linkMotion.js');
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Arrive as if we just came from the south (top of screen).
  const link = createLinkState(0x78, 0x4d, DIR.DOWN);
  let transitions = 0;
  let room = 0x57;
  for (let i = 0; i < 400; i += 1) {
    stepLink(link, grid, DIR.UP, LINK_QSPEED, room);
    const t = checkScreenTransition(link, room);
    if (t) {
      transitions += 1;
      room = t.nextRoomId;
      link.x = t.x;
      link.y = t.y;
      link.dir = t.dir;
      link.gridOffset = 0;
      link.posFrac = 0;
      if (transitions >= 3) break;
    }
  }
  assert.equal(transitions, 3);
});

test('cave entry on warp tile with standing Y', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Feet at y=$8D → play Y = $8D+$0B-$40 = $58 → row 11; X=$80 → col 16
  grid[11][16] = 0x24;
  const link = { x: 0x80, y: 0x8d, gridOffset: 0 };
  assert.deepEqual(checkCaveEntry(link, grid, { caveId: 1 }), { kind: 'level', id: 1 });
  assert.equal(checkCaveEntry(link, grid, { caveId: 0x10 }).kind, 'cave');
  // Mid-cell grid offset blocks; "moving" alone does not (NES CheckWarps).
  assert.equal(checkCaveEntry({ ...link, gridOffset: 1 }, grid, { caveId: 1 }), null);
  assert.deepEqual(
    checkCaveEntry({ ...link, moving: true }, grid, { caveId: 1 }),
    { kind: 'level', id: 1 },
  );
  // Off the mouth column: standing tile is sand, not warp.
  assert.equal(checkCaveEntry({ ...link, x: 0x78 }, grid, { caveId: 1 }), null);
  // Mid-tile X on the mouth column still enters (waterfall softlock fix).
  assert.deepEqual(
    checkCaveEntry({ ...link, x: 0x84 }, grid, { caveId: 1 }),
    { kind: 'level', id: 1 },
  );
});

test('can walk onto start-screen sword cave and trigger entry', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '77.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  // Below the mouth (ground), then walk up onto $24 at Y=$4D.
  const link = createLinkState(0x40, 0x5d, DIR.UP);
  let entered = null;
  for (let i = 0; i < 40; i += 1) {
    stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x77);
    entered = checkCaveEntry(link, scr.tileGrid, scr.attrs);
    if (entered) break;
  }
  assert.equal(link.y, 0x4d, `expected Y=$4D on cave mouth, got $${link.y.toString(16)}`);
  assert.deepEqual(entered, { kind: 'cave', id: 0x10 });
});

test('OW $0F secret cave enters from both mouth columns', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '0f.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(scr.attrs.caveId, 34);
  // The mouth is the 16px square at cols $10/$11 → X $80 and $88. X=$78 is
  // *not* a mouth column: Link's left half would stand on the mountain tile
  // $A5, and the mid-cell standing test correctly snaps him back to $85.
  for (const x of [0x80, 0x88]) {
    const link = createLinkState(x, 0x95, DIR.UP);
    let entered = null;
    for (let i = 0; i < 120; i += 1) {
      stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x0f);
      entered = checkCaveEntry(link, scr.tileGrid, scr.attrs, 0x0f);
      if (entered) break;
    }
    assert.deepEqual(
      entered,
      { kind: 'cave', id: 34 },
      `expected cave entry from x=$${x.toString(16)}, ended at $${link.x.toString(16)},$${link.y.toString(16)}`,
    );
  }
});

test('raft arrival Y=$CD can walk into Level 4 mouth on $45', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '45.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(scr.attrs.caveId, 4);
  // Off-grid Y on the mouth (stair QSpeed / soft-cross) must still enter.
  const bad = createLinkState(0x80, 0xd0, DIR.UP);
  let badEntered = null;
  for (let i = 0; i < 100; i += 1) {
    stepLink(bad, scr.tileGrid, DIR.UP, undefined, 0x45);
    badEntered = checkCaveEntry(bad, scr.tileGrid, scr.attrs);
    if (badEntered) break;
  }
  assert.deepEqual(badEntered, { kind: 'level', id: 4 });

  const link = createLinkState(0x80, 0xcd, DIR.UP);
  let entered = null;
  for (let i = 0; i < 100; i += 1) {
    stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x45);
    entered = checkCaveEntry(link, scr.tileGrid, scr.attrs);
    if (entered) break;
  }
  assert.deepEqual(entered, { kind: 'level', id: 4 });
  assert.equal(link.y, 0x7d);
});

test('Level 1 mouth enters when Y is off the NES $?D walk grid', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '37.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(scr.attrs.caveId, 1);
  // Repro: continuous climb parks Link on $24 at Y=$84 with solid look-ahead.
  for (const y of [0x80, 0x84]) {
    const link = createLinkState(0x70, y, DIR.UP);
    assert.equal(standingTile(scr.tileGrid, link.x, link.y), 0x24);
    assert.deepEqual(
      checkCaveEntry(link, scr.tileGrid, scr.attrs, 0x37),
      { kind: 'level', id: 1 },
      `expected entry at y=$${y.toString(16)}`,
    );
  }
});

test('Level 1 leftover warp uses that screen\'s cave id, not the start cave', () => {
  // Occupying $37 with the start screen still the stream anchor must not
  // treat the dungeon mouth as cave $10. Callers pass the occupying pack.
  const startPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '77.json');
  const l1Path = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '37.json');
  if (!fs.existsSync(startPath) || !fs.existsSync(l1Path)) return;
  const start = JSON.parse(fs.readFileSync(startPath, 'utf8'));
  const l1 = JSON.parse(fs.readFileSync(l1Path, 'utf8'));
  const link = createLinkState(0x70, 0x80, DIR.UP);
  assert.equal(start.attrs.caveId, 0x10);
  assert.deepEqual(
    checkCaveEntry(link, l1.tileGrid, start.attrs, 0x37),
    { kind: 'cave', id: 0x10 },
    'the start screen\'s caveId would open the sword cave from leftover $37',
  );
  assert.deepEqual(
    checkCaveEntry(link, l1.tileGrid, l1.attrs, 0x37),
    { kind: 'level', id: 1 },
  );
});

test('Level 1 overworld exit spawn', () => {
  const spawn = overworldExitSpawn({ exitX: 7, exitY: 3 });
  assert.equal(spawn.x, 0x70);
  assert.equal(spawn.y, 0x7d);
});

test('standingTile samples play grid (GetCollidableTileStill)', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  grid[11][16] = 0x70;
  // ObjX &$F8 → col 16 when X=$80 (not X+8).
  assert.equal(standingTile(grid, 0x80, 0x8d), 0x70);
  assert.equal(standingTile(grid, 0x78, 0x8d), 0x26);
});

test('northern-edge cave on OW $0A reaches Y=$4D', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '0a.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(scr.attrs.caveId, 0x12);
  assert.equal(overworldExitSpawn(scr.attrs).y, 0x4d);
  const link = createLinkState(0x20, 0x5d, DIR.UP);
  let entered = null;
  for (let i = 0; i < 80; i += 1) {
    stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x0a);
    entered = checkCaveEntry(link, scr.tileGrid, scr.attrs, 0x0a);
    if (entered) break;
  }
  assert.equal(link.y, 0x4d, `expected Y=$4D on cave mouth, got $${link.y.toString(16)}`);
  assert.deepEqual(entered, { kind: 'cave', id: 0x12 });
});

test('northern-edge caves $04/$0C also enter', () => {
  for (const [id, caveId, x] of [
    [0x04, 0x1a, 0xc0],
    [0x0c, 0x1e, 0x80],
  ]) {
    const packPath = path.join(
      ROOT,
      'assets',
      'extracted',
      'play',
      'screens',
      id.toString(16).padStart(2, '0') + '.json',
    );
    if (!fs.existsSync(packPath)) continue;
    const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
    const link = createLinkState(x, 0x5d, DIR.UP);
    let entered = null;
    for (let i = 0; i < 80; i += 1) {
      stepLink(link, scr.tileGrid, DIR.UP, undefined, id);
      entered = checkCaveEntry(link, scr.tileGrid, scr.attrs, id);
      if (entered) break;
    }
    assert.deepEqual(
      entered,
      { kind: 'cave', id: caveId },
      `room $${id.toString(16)} expected cave $${caveId.toString(16)}`,
    );
  }
});

test('waterfall cave on OW $1A at X=$60', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '1a.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(scr.attrs.caveId, 0x1b);
  const link = createLinkState(0x60, 0x8d, DIR.UP);
  let entered = null;
  for (let i = 0; i < 80; i += 1) {
    stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x1a);
    entered = checkCaveEntry(link, scr.tileGrid, scr.attrs, 0x1a);
    if (entered) break;
  }
  assert.equal(link.x, 0x60);
  assert.equal(link.y, 0x7d);
  assert.deepEqual(entered, { kind: 'cave', id: 0x1b });
  // Off-column: water / rock blocks the mouth approach.
  const left = createLinkState(0x58, 0x8d, DIR.UP);
  for (let i = 0; i < 80; i += 1) stepLink(left, scr.tileGrid, DIR.UP, undefined, 0x1a);
  assert.equal(checkCaveEntry(left, scr.tileGrid, scr.attrs, 0x1a), null);
});

test('waterfall cave accepts centered approach X=$64 (no softlock)', () => {
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'screens', '1a.json');
  if (!fs.existsSync(packPath)) return;
  const scr = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const link = createLinkState(0x64, 0x8d, DIR.UP);
  let entered = null;
  for (let i = 0; i < 80; i += 1) {
    stepLink(link, scr.tileGrid, DIR.UP, undefined, 0x1a);
    entered = checkCaveEntry(link, scr.tileGrid, scr.attrs, 0x1a);
    if (entered) break;
  }
  assert.equal(link.y, 0x7d);
  assert.deepEqual(entered, { kind: 'cave', id: 0x1b });
});
