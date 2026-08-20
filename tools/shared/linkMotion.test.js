import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  LINK_QSPEED,
  NO_ROOM_BOUNDS,
  UW_ROOM_BOUNDS,
  applyDirOnGridLine,
  canLinkMove,
  createLinkState,
  ejectLinkFromSolid,
  isLinkStandingSolid,
  linkWalkSprite,
  onGrid,
  overworldLinkQSpeed,
  pickSingleDir,
  snapToGridCellStart,
  stepLink,
  stepShove,
  writeLinkMotion,
} from './linkMotion.js';
import { dungeonTileOpts, buildDungeonPlayGrid, dungeonPlayOrigin } from './dungeonPlay.js';
import {
  DOORWAY_CENTER_X,
  DOORWAY_CENTER_Y,
  checkDungeonRoomExit,
  clampUwDoorwayPos,
  linkInDoorwayCorridor,
} from './dungeonDoors.js';
import { ROOT } from './paths.js';

/** Mirror `stepDungeon` doorway bound skip + screen-edge clamp. */
function stepDungeonLink(link, grid, room, dir, opts) {
  const inDoor = linkInDoorwayCorridor(link, room, {});
  const roomId = inDoor ? NO_ROOM_BOUNDS : UW_ROOM_BOUNDS;
  const tiles = inDoor
    ? Array.from({ length: 22 }, () => Array(32).fill(0x26))
    : grid;
  stepLink(link, tiles, dir, LINK_QSPEED, roomId, opts);
  if (inDoor) clampUwDoorwayPos(link);
}

const romPath = path.join(ROOT, 'zelda.nes');

function openGrid() {
  return Array.from({ length: 22 }, () => Array(32).fill(0x26));
}

test('writeLinkMotion copies the whole walk cycle, not just the pose', () => {
  // Dungeon walking steps a local copy and writes it back. Dropping
  // animFrame here is how a hero slides without alternating feet.
  const src = createLinkState(0x40, 0x50, DIR.DOWN);
  src.animFrame = 1;
  src.animCounter = 2;
  src.gridOffset = 4;
  src.posFrac = 0x30;
  src.moving = true;
  const dst = createLinkState(0, 0, DIR.UP);
  writeLinkMotion(dst, src, 0x80, 0x90);
  assert.equal(dst.x, 0x80);
  assert.equal(dst.y, 0x90);
  assert.equal(dst.dir, DIR.DOWN);
  assert.equal(dst.animFrame, 1);
  assert.equal(dst.animCounter, 2);
  assert.equal(dst.gridOffset, 4);
  assert.equal(dst.posFrac, 0x30);
  assert.equal(dst.moving, true);
  assert.deepEqual(
    Object.keys(createLinkState(0, 0)).sort(),
    ['animCounter', 'animFrame', 'dir', 'gridOffset', 'moving', 'posFrac', 'x', 'y'],
    'a new LinkState field must be copied by writeLinkMotion',
  );
});

test('pickSingleDir prefers up then down then left then right', () => {
  assert.equal(pickSingleDir(DIR.UP | DIR.RIGHT), DIR.UP);
  assert.equal(pickSingleDir(DIR.LEFT | DIR.RIGHT), DIR.LEFT);
  assert.equal(pickSingleDir(0), 0);
});

test('spawn point is on NES walk grid', () => {
  assert.equal(onGrid(0x78, 0x8d), true);
});

test('four QSpeed steps average 1.5 px/frame on open ground', () => {
  const link = createLinkState(0x78, 0x8d, DIR.RIGHT);
  let moved = 0;
  for (let i = 0; i < 2; i += 1) {
    const x0 = link.x;
    stepLink(link, openGrid(), DIR.RIGHT, LINK_QSPEED);
    moved += link.x - x0;
  }
  assert.equal(moved, 3); // 1.5 * 2
});

test('solid tile blocks movement', () => {
  const grid = openGrid();
  // Wall to the right of spawn hotspot path
  for (let r = 0; r < 22; r += 1) {
    for (let c = 16; c < 32; c += 1) {
      grid[r][c] = 0xd8;
    }
  }
  const link = createLinkState(0x78, 0x8d, DIR.RIGHT);
  const x0 = link.x;
  for (let i = 0; i < 10; i += 1) {
    stepLink(link, grid, DIR.RIGHT);
  }
  assert.ok(link.x - x0 < 16, `only slid a little before wall, got Δ=${link.x - x0}`);
});

test('can turn left/right after walking into a north wall', () => {
  const grid = openGrid();
  // Solid band above the spawn row so UP eventually blocks.
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 32; c += 1) {
      grid[r][c] = 0xd8;
    }
  }
  const link = createLinkState(0x78, 0x8d, DIR.UP);
  for (let i = 0; i < 80; i += 1) {
    stepLink(link, grid, DIR.UP);
  }
  assert.equal(link.moving, false);
  const x0 = link.x;
  for (let i = 0; i < 20; i += 1) {
    stepLink(link, grid, DIR.LEFT);
  }
  assert.ok(link.x < x0, `expected left movement after wall stop, x0=${x0} x=${link.x}`);
  assert.equal(link.dir, DIR.LEFT);
});

test('can turn left after hitting OW top room bound', { skip: !fs.existsSync(romPath) }, () => {
  // Uses extracted start screen: open tiles above spawn; y clamps at walk-grid $4D.
  const packPath = path.join(ROOT, 'assets', 'extracted', 'play', 'start_screen.json');
  if (!fs.existsSync(packPath)) return;
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const link = createLinkState(pack.startX, pack.startY, DIR.UP);
  for (let i = 0; i < 120; i += 1) {
    stepLink(link, pack.tileGrid, DIR.UP);
  }
  assert.equal(link.y, 0x4d);
  const x0 = link.x;
  for (let i = 0; i < 24; i += 1) {
    stepLink(link, pack.tileGrid, DIR.LEFT);
  }
  assert.ok(link.x < x0, `expected left after top bound, x0=${x0} x=${link.x}`);
});

test('walk sprite bases match ObjAnimFrameHeap (+ down wood-shield patch)', () => {
  assert.deepEqual(linkWalkSprite(DIR.UP, 0), {
    leftTile: 0x0c,
    rightTile: 0x0e,
    flipLeft: false,
    flipRight: false,
    baseTile: 0x0c,
    flipH: false,
  });
  // Facing down: NES adds `$50` to the left OAM tile after the walk flip swap.
  assert.deepEqual(linkWalkSprite(DIR.DOWN, 0), {
    leftTile: 0x58,
    rightTile: 0x0a,
    flipLeft: false,
    flipRight: false,
    baseTile: 0x58,
    flipH: false,
  });
  assert.deepEqual(linkWalkSprite(DIR.DOWN, 1), {
    leftTile: 0x5a,
    rightTile: 0x08,
    flipLeft: false,
    flipRight: true,
    baseTile: 0x5a,
    flipH: true,
  });
  assert.deepEqual(linkWalkSprite(DIR.DOWN, 0, { magicShield: true }), {
    leftTile: 0x60,
    rightTile: 0x0a,
    flipLeft: false,
    flipRight: false,
    baseTile: 0x60,
    flipH: false,
  });
  assert.deepEqual(linkWalkSprite(DIR.LEFT, 0), {
    leftTile: 0x02,
    rightTile: 0x00,
    flipLeft: true,
    flipRight: true,
    baseTile: 0x00,
    flipH: true,
  });
  assert.deepEqual(linkWalkSprite(DIR.RIGHT, 1), {
    leftTile: 0x04,
    rightTile: 0x06,
    flipLeft: false,
    flipRight: false,
    baseTile: 0x04,
    flipH: false,
  });
});

test('shove stops at solid tiles and clears remaining pixels', () => {
  const grid = openGrid();
  // Solid column on the right half of the playfield.
  for (let r = 0; r < 22; r += 1) {
    for (let c = 20; c < 32; c += 1) grid[r][c] = 0xd8;
  }
  const link = createLinkState(0x90, 0x8d, DIR.RIGHT); // just left of solids
  const first = stepShove(link, grid, DIR.RIGHT, 0x20, { pixelsPerFrame: 4 });
  assert.equal(first.blocked, true);
  assert.equal(first.shovePixels, 0);
  // Must remain on walkable ground (not inside the tree column).
  assert.ok(link.x < 0xa0, `shove entered wall x=${link.x}`);
});

test('shove on open ground moves full frame step', () => {
  const link = createLinkState(0x78, 0x8d, DIR.LEFT);
  const r = stepShove(link, openGrid(), DIR.LEFT, 0x20, { pixelsPerFrame: 4 });
  assert.equal(r.blocked, false);
  assert.equal(r.moved, 4);
  assert.equal(r.shovePixels, 0x1c);
  assert.equal(link.x, 0x78 - 4);
});

test('ejectLinkFromSolid slides out of an embedded wall', () => {
  const grid = openGrid();
  // Solid column covering standing samples around x≈$A8.
  for (let r = 0; r < 22; r += 1) {
    for (let c = 20; c < 24; c += 1) grid[r][c] = 0xd8;
  }
  const link = createLinkState(0xa0, 0x8d, DIR.RIGHT);
  assert.equal(isLinkStandingSolid(grid, link.x, link.y), true);
  const r = ejectLinkFromSolid(link, grid, { preferDir: DIR.LEFT });
  assert.equal(r.ejected, true);
  assert.equal(isLinkStandingSolid(grid, link.x, link.y), false);
  assert.ok(link.x < 0xa0, `expected left eject, x=${link.x}`);
});

test('ejectLinkFromSolid is a no-op on open ground', () => {
  const link = createLinkState(0x78, 0x8d, DIR.UP);
  const r = ejectLinkFromSolid(link, openGrid(), { preferDir: DIR.LEFT });
  assert.equal(r.ejected, false);
  assert.equal(link.x, 0x78);
  assert.equal(link.y, 0x8d);
});

test('NO_ROOM_BOUNDS allows walking out of dungeon door spawn X=$E8', () => {
  const grid = openGrid();
  // East cavity spawn sits past OW right bound ($E0).
  const stuck = createLinkState(0xe8, 0x8d, DIR.LEFT);
  for (let i = 0; i < 20; i += 1) stepLink(stuck, grid, DIR.LEFT);
  assert.equal(stuck.x, 0xe8, 'OW clamp must trap door-edge spawn outside right bound');

  const free = createLinkState(0xe8, 0x8d, DIR.LEFT);
  for (let i = 0; i < 20; i += 1) stepLink(free, grid, DIR.LEFT, LINK_QSPEED, NO_ROOM_BOUNDS);
  assert.ok(free.x < 0xe0, `expected walk into room, x=${free.x}`);
});

test('thin solid column does not embed Link past the wall face', () => {
  const grid = openGrid();
  // Single 8px column at x=$80 (col 16). RIGHT look-ahead from $78 samples $88
  // (open), so collision must catch the standing tile mid-step.
  for (let r = 0; r < 22; r += 1) {
    grid[r][16] = 0xd8;
  }
  const link = createLinkState(0x78, 0x8d, DIR.RIGHT);
  for (let i = 0; i < 40; i += 1) {
    stepLink(link, grid, DIR.RIGHT);
  }
  assert.ok(link.x < 0x80, `must stay left of thin wall, x=${link.x.toString(16)}`);
  assert.equal(isLinkStandingSolid(grid, link.x, link.y), false);
  assert.equal(onGrid(link.x, link.y), true);
  assert.equal(link.gridOffset, 0);
});

test('blocked mid-step snaps back onto the walk grid', () => {
  const grid = openGrid();
  for (let r = 0; r < 22; r += 1) grid[r][16] = 0xd8;
  const link = createLinkState(0x78, 0x8d, DIR.RIGHT);
  // Force a mid-cell commit that cannot advance into the solid.
  link.x = 0x7f;
  link.gridOffset = 7;
  link.posFrac = 0;
  stepLink(link, grid, DIR.RIGHT);
  assert.equal(link.x, 0x78);
  assert.equal(link.y, 0x8d);
  assert.equal(link.gridOffset, 0);
  assert.equal(onGrid(link.x, link.y), true);
});

test('snapToGridCellStart rewinds by gridOffset along facing', () => {
  const link = createLinkState(0x7b, 0x8d, DIR.RIGHT);
  link.gridOffset = 3;
  snapToGridCellStart(link);
  assert.equal(link.x, 0x78);
  assert.equal(link.gridOffset, 0);
  assert.equal(link.posFrac, 0);
});

test('applyDirOnGridLine adopts opposite input without flipping offset', () => {
  const link = createLinkState(0x7b, 0x8d, DIR.RIGHT);
  link.gridOffset = 3;
  assert.equal(applyDirOnGridLine(link, DIR.LEFT), DIR.LEFT);
  assert.equal(link.dir, DIR.LEFT);
  assert.equal(link.gridOffset, 3);
});

test('applyDirOnGridLine early perpendicular reverses and flips offset', () => {
  const link = createLinkState(0x7b, 0x8d, DIR.RIGHT);
  link.gridOffset = 3;
  assert.equal(applyDirOnGridLine(link, DIR.UP), DIR.LEFT);
  assert.equal(link.dir, DIR.LEFT);
  assert.equal(link.gridOffset, -5); // 3 → -5
});

test('applyDirOnGridLine late perpendicular keeps facing', () => {
  const link = createLinkState(0x7d, 0x8d, DIR.RIGHT);
  link.gridOffset = 5;
  assert.equal(applyDirOnGridLine(link, DIR.UP), DIR.RIGHT);
  assert.equal(link.dir, DIR.RIGHT);
  assert.equal(link.gridOffset, 5);
});

test('mid-cell opposite input walks back toward the cell start', () => {
  const link = createLinkState(0x78, 0x8d, DIR.RIGHT);
  // Advance a few frames into the cell.
  for (let i = 0; i < 3; i += 1) stepLink(link, openGrid(), DIR.RIGHT);
  assert.ok(link.gridOffset !== 0 || link.x > 0x78);
  const xMid = link.x;
  for (let i = 0; i < 8; i += 1) stepLink(link, openGrid(), DIR.LEFT);
  assert.ok(link.x <= xMid, `expected reverse, mid=${xMid} x=${link.x}`);
  assert.equal(link.dir, DIR.LEFT);
});

test('cave-mouth approach under overhanging rock is not frozen mid-cell', () => {
  const grid = openGrid();
  // Standing row walkable ($88 cave); rock look-ahead above (solid).
  // Play Y $8D → standing row floor((0x8d+0x0b-0x40)/8)=floor(0x58/8)=11
  // UP look-ahead samples ~row 10.
  const standRow = 11;
  const rockRow = 10;
  const col = 0x78 >> 3;
  grid[rockRow][col] = 0xd8;
  grid[standRow][col] = 0x88;
  const link = createLinkState(0x78, 0x8d, DIR.UP);
  // Seed a committed step toward the mouth (as if look-ahead was clear earlier).
  link.gridOffset = -2;
  link.y = 0x8b;
  const y0 = link.y;
  stepLink(link, grid, DIR.UP);
  assert.ok(link.y < y0 || link.gridOffset !== -2, 'must continue mid-cell under rock');
  assert.equal(isLinkStandingSolid(grid, link.x, link.y), false);
});

test('mountain stair QSpeed $30 can climb OW $3C without snap softlock', () => {
  const screenPath = path.join(ROOT, 'assets/extracted/play/screens/3c.json');
  if (!fs.existsSync(screenPath)) {
    assert.fail('missing extracted screen 3c.json — run overworld extract');
  }
  const { tileGrid } = JSON.parse(fs.readFileSync(screenPath, 'utf8'));
  const link = createLinkState(0x70, 0xcd, DIR.UP);
  const startY = link.y;
  for (let i = 0; i < 64; i += 1) {
    const qs = overworldLinkQSpeed(link, tileGrid);
    stepLink(link, tileGrid, DIR.UP, qs, 0x3c);
  }
  assert.ok(
    link.y < startY - 8,
    `expected climb off stair mouth, start=$${startY.toString(16)} y=$${link.y.toString(16)}`,
  );
});

test('L4 $71: left stops against face at X=$40, not a tile early', () => {
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  if (!fs.existsSync(levelPath)) {
    assert.fail('missing level_4 extract');
  }
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  assert.ok(room);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const link = createLinkState(0x48, 0x65, DIR.LEFT);
  for (let i = 0; i < 40; i += 1) {
    stepLink(link, grid, DIR.LEFT, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
  }
  assert.equal(link.x, 0x40, `stop at face lip, got $${link.x.toString(16)}`);
  assert.equal(canLinkMove(grid, link.x, link.y, DIR.LEFT, UW_ROOM_BOUNDS, opts), false);
  assert.equal(isLinkStandingSolid(grid, link.x, link.y, opts), false);
});

test('L4 $71: mid-cell approach reaches face lip at X=$A0 (no look-ahead snap)', () => {
  // Face at X=$90–$9F; NES finishes the $A8→$A0 cell even though look-ahead
  // hits the face mid-cell (gridOffset ≠ 0 skips tile checks).
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const fromCell = createLinkState(0xa8, 0x65, DIR.LEFT);
  for (let i = 0; i < 40; i += 1) {
    stepLink(fromCell, grid, DIR.LEFT, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
  }
  assert.equal(fromCell.x, 0xa0, `finish cell to face lip, got $${fromCell.x.toString(16)}`);
  const fromRight = createLinkState(0xb0, 0x65, DIR.LEFT);
  for (let i = 0; i < 80; i += 1) {
    stepLink(fromRight, grid, DIR.LEFT, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
  }
  assert.equal(fromRight.x, 0xa0, `walk from $B0 to face lip, got $${fromRight.x.toString(16)}`);
});

test('L4 $71: top-left wall uses tiles + UW bound, doorway still reaches X<$21', () => {
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const link = createLinkState(0x40, 0x5d, DIR.LEFT);
  for (let i = 0; i < 48; i += 1) {
    stepLink(link, grid, DIR.LEFT, LINK_QSPEED, UW_ROOM_BOUNDS, opts);
  }
  assert.ok(link.x <= 0x28, `should reach left floor lip, x=$${link.x.toString(16)}`);
  assert.ok(link.x >= 0x20, `must not leave through wall tiles, x=$${link.x.toString(16)}`);
  // West doorway cavity (DoorwayDir): bounds skipped.
  const inDoor = createLinkState(0x18, 0x8d, DIR.LEFT);
  stepLink(inDoor, grid, DIR.LEFT, LINK_QSPEED, NO_ROOM_BOUNDS, opts);
  assert.ok(inDoor.x < 0x21, `doorway must allow X<$21, x=$${inDoor.x.toString(16)}`);
});

test('L4 $71: west door from floor lip exits without overshoot softlock', () => {
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const link = createLinkState(0x28, DOORWAY_CENTER_Y, DIR.LEFT);
  let exit = null;
  for (let i = 0; i < 80; i += 1) {
    stepDungeonLink(link, grid, room, DIR.LEFT, opts);
    assert.ok(link.x >= 0, `must not leave screen, x=$${link.x.toString(16)}`);
    exit = checkDungeonRoomExit(link, room, {}, {}, { rooms: level.rooms });
    if (exit) break;
  }
  assert.ok(exit, `west exit, x=$${link.x.toString(16)} y=$${link.y.toString(16)}`);
  assert.equal(exit.side, 'west');
});

test('L4 $71: down+right on south BoundByRoom lip enters door (no reverse-oscillate)', () => {
  // Regression: pickSingleDir preferred DOWN (blocked by $BD); mid-cell
  // perpendicular handling then reversed RIGHT↔LEFT and never reached the door.
  // Walk column $70 is a valid N/S DoorwayDir lane (±8 of $78), so entry does
  // not require sliding all the way to the NES center first.
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const link = createLinkState(0x70, 0xbd, DIR.DOWN);
  for (let i = 0; i < 80; i += 1) {
    stepDungeonLink(link, grid, room, DIR.DOWN | DIR.RIGHT, opts);
    if (link.y >= 0xd4 && link.gridOffset === 0) break;
  }
  assert.ok(link.x >= 0x70 && link.x <= 0x80, `stay in door lanes, x=$${link.x.toString(16)}`);
  assert.ok(link.y >= 0xd4, `enter south cavity, y=$${link.y.toString(16)}`);
  assert.equal(linkInDoorwayCorridor(link, room), true);
});

test('L4 $71: BoundByRoom lip does not snap-loop — can enter N/S/W doorways', () => {
  // Regression: per-pixel UW bound rejection bounced Link at $BC/$21 and
  // never engaged DoorwayDir, so doors were unreachable.
  const levelPath = path.join(ROOT, 'assets/extracted/dungeons/q1/level_4/level.json');
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const room = level.rooms.find((r) => r.roomId === 0x71);
  const grid = buildDungeonPlayGrid(room, dungeonPlayOrigin());
  const opts = dungeonTileOpts();
  const roomCtx = { rooms: level.rooms };

  const walkToExit = (start, dir) => {
    const link = createLinkState(start.x, start.y, dir);
    for (let i = 0; i < 160; i += 1) {
      stepDungeonLink(link, grid, room, dir, opts);
      const exit = checkDungeonRoomExit(link, room, {}, {}, roomCtx);
      if (exit) return { link, exit };
    }
    return { link, exit: null };
  };

  // South door is open but $71 is on map row 7 — no dungeon neighbor.
  // Still must enter the overflow cavity (no snap-loop at $BC).
  const south = createLinkState(DOORWAY_CENTER_X, 0x8d, DIR.DOWN);
  for (let i = 0; i < 120; i += 1) stepDungeonLink(south, grid, room, DIR.DOWN, opts);
  assert.ok(south.y >= 0xbd, `south into overflow, y=$${south.y.toString(16)}`);
  assert.equal(linkInDoorwayCorridor(south, room), true);

  const west = walkToExit({ x: 0x28, y: DOORWAY_CENTER_Y }, DIR.LEFT);
  assert.ok(west.exit, `west exit from $${west.link.x.toString(16)},$${west.link.y.toString(16)}`);
  assert.equal(west.exit.side, 'west');

  const north = walkToExit({ x: DOORWAY_CENTER_X, y: 0x6d }, DIR.UP);
  assert.ok(north.exit, `north exit from $${north.link.x.toString(16)},$${north.link.y.toString(16)}`);
  assert.equal(north.exit.side, 'north');
});

test('UW east BoundByRoom lip: hold right turns facing for locked key bump', () => {
  // Regression: filterInputByRoomBounds cleared RIGHT at X=$D0, so Link stuck
  // facing south/north at the east lip could never turn into a locked key door.
  const grid = openGrid();
  const link = createLinkState(0xd0, DOORWAY_CENTER_Y, DIR.DOWN);
  stepLink(link, grid, DIR.RIGHT, LINK_QSPEED, UW_ROOM_BOUNDS);
  assert.equal(link.dir, DIR.RIGHT, 'must face the east lip when holding right');
  assert.equal(link.x, 0xd0, 'must stay on BoundByRoom lip');
});
