import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, OW_BOUNDS } from './collision.js';
import { createLinkState, stepLink } from './linkMotion.js';
import {
  CAVE_DWELLER_X,
  CAVE_DWELLER_Y,
  CAVE_ENTER_SPAWN,
  CAVE_FIRE_TILE,
  CAVE_ROAD_XS,
  CAVE_ROAD_Y,
  caveDwellerDraw,
  caveHintLine,
  caveNpcInteractKey,
  caveWareSlots,
  checkCaveExit,
  clearCaveTransitState,
  createCaveTileGrid,
  dwellerKind,
  nearCaveNpc,
  roadStairUnderLink,
  wareUnderLink,
} from './caveRoom.js';
import { ITEM } from './caves.js';
import { sheetForPpuTile } from './enemyAnim.js';
import { createInventory, SWORD } from './inventory.js';
import { cancelSword, createSwordState, isSwordActive, tryStartSword } from './sword.js';

test('dwellerKind maps ROM bytes', () => {
  assert.equal(dwellerKind(0x58), 'old_man');
  assert.equal(dwellerKind(0x5b), 'moblin');
});

test('caveDwellerDraw matches ObjAnimFrameHeap $58–$5B', () => {
  assert.deepEqual(caveDwellerDraw(0x58), { tile: 0x98, pal: 2, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x59), { tile: 0x9a, pal: 2, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x5a), { tile: 0x9c, pal: 0, mirror: true });
  assert.deepEqual(caveDwellerDraw(0x5b), { tile: 0xf8, pal: 2, mirror: false });
  assert.equal(sheetForPpuTile(0x98, 'overworld').sheet, 'overworld');
  assert.equal(sheetForPpuTile(CAVE_FIRE_TILE, 'overworld').sheet, 'common');
});

test('clearCaveTransitState drops shove/sword that softlock Mode B', () => {
  const link = createLinkState(CAVE_ENTER_SPAWN.x, CAVE_ENTER_SPAWN.y, DIR.UP);
  link.posFrac = 0.5;
  link.gridOffset = 4;
  link.moving = true;
  const inv = createInventory();
  inv.shovePixels = 0x20;
  inv.shoveDir = DIR.DOWN;
  inv.paralyzed = 2;
  inv.itemLiftTimer = 0x80;
  const sword = createSwordState();
  tryStartSword(sword, DIR.UP, SWORD.WOOD);
  clearCaveTransitState({ link, inv, sword, cancelSword });
  assert.equal(link.posFrac, 0);
  assert.equal(link.gridOffset, 0);
  assert.equal(link.moving, false);
  assert.equal(inv.shovePixels, 0);
  assert.equal(inv.shoveDir, 0);
  assert.equal(inv.paralyzed, 0);
  assert.equal(inv.itemLiftTimer, 0);
  assert.equal(isSwordActive(sword), false);
});

test('enter spawn is not an immediate exit', () => {
  assert.equal(
    checkCaveExit({ x: CAVE_ENTER_SPAWN.x, y: CAVE_ENTER_SPAWN.y, dir: DIR.UP }),
    false,
  );
  assert.equal(
    checkCaveExit({ x: 0x78, y: OW_BOUNDS.bottom, dir: DIR.DOWN }),
    true,
  );
  // Mid-cell snap can leave Link one pixel shy of $CD.
  assert.equal(checkCaveExit({ x: 0x78, y: OW_BOUNDS.bottom - 1, dir: DIR.DOWN }), true);
  assert.equal(checkCaveExit({ x: 0x78, y: 0xd2, dir: DIR.DOWN }), true);
});

test('walking south from enter spawn can reach cave exit', () => {
  const grid = createCaveTileGrid();
  const link = createLinkState(CAVE_ENTER_SPAWN.x, CAVE_ENTER_SPAWN.y, DIR.UP);
  let sawExit = false;
  for (let i = 0; i < 120; i += 1) {
    stepLink(link, grid, DIR.DOWN);
    // Bound clamp can rewind off $CD the next frame; exit is sensed on arrival.
    if (checkCaveExit(link)) sawExit = true;
  }
  assert.equal(sawExit, true);
  assert.ok(link.y >= OW_BOUNDS.bottom - 5);
});

test('cave tile grid is walkable', () => {
  const g = createCaveTileGrid();
  assert.equal(g.length, 22);
  assert.equal(g[0].length, 32);
});

test('wareUnderLink detects overlap', () => {
  const slots = [{ x: 0x78, y: 0x98, gone: false, index: 1, item: 1, key: 'a' }];
  assert.ok(wareUnderLink({ x: 0x78, y: 0x98 }, slots));
  assert.ok(wareUnderLink({ x: 0x78, y: 0xa0 }, slots)); // Link a bit below ware
  assert.equal(wareUnderLink({ x: 0x20, y: 0x40 }, slots), null);
});

test('caveWareSlots hides owned unique goods', () => {
  const cave = {
    caveId: 0x1d,
    slots: [
      { item: ITEM.MAGIC_SHIELD, price: 130 },
      { item: ITEM.BOMBS, price: 20 },
      { item: ITEM.WOOD_ARROW, price: 80 },
    ],
  };
  const inv = { arrow: 1, magicShield: 0 };
  const slots = caveWareSlots(cave, new Set(), inv);
  assert.equal(slots.find((s) => s.item === ITEM.WOOD_ARROW)?.gone, true);
  assert.equal(slots.find((s) => s.item === ITEM.BOMBS)?.gone, false);
  assert.equal(slots.find((s) => s.item === ITEM.MAGIC_SHIELD)?.gone, false);
});

test('caveWareSlots scopes take-any emptiness to the entrance room', () => {
  const cave = {
    caveId: 0x11,
    kind: 'take_any',
    slots: [
      { item: ITEM.RED_POTION, price: 0 },
      { item: ITEM.NOTHING, price: 0 },
      { item: ITEM.HEART_CONTAINER, price: 0 },
    ],
  };
  const taken = new Set(['123:17:any', '123:17:0', '123:17:2']); // room $7b
  const atL8 = caveWareSlots(cave, taken, null, 0x7b);
  assert.ok(atL8.every((s) => s.gone));
  const atP3 = caveWareSlots(cave, taken, null, 0x2f);
  assert.ok(atP3.every((s) => !s.gone));
  // Legacy global key must not empty every take-any cave.
  const legacy = caveWareSlots(cave, new Set(['17:any']), null, 0x2f);
  assert.ok(legacy.every((s) => !s.gone));
  // Cave worlds default `roomId` to 0. A flag written against that default
  // must not empty P3 ($2f) — the raft-island take-any.
  const caveWorldDefault = caveWareSlots(
    cave,
    new Set(['0:17:any', '0:17:0', '0:17:2']),
    null,
    0x2f,
  );
  assert.ok(caveWorldDefault.every((s) => !s.gone));
});

test('roadStairUnderLink finds the three staircase columns', () => {
  assert.equal(roadStairUnderLink({ x: CAVE_ROAD_XS[0], y: CAVE_ROAD_Y }), 0);
  assert.equal(roadStairUnderLink({ x: CAVE_ROAD_XS[1], y: CAVE_ROAD_Y }), 1);
  assert.equal(roadStairUnderLink({ x: CAVE_ROAD_XS[2], y: CAVE_ROAD_Y }), 2);
  assert.equal(roadStairUnderLink({ x: 0x20, y: CAVE_ROAD_Y }), -1);
  assert.equal(roadStairUnderLink({ x: CAVE_ROAD_XS[1], y: 0x40 }), -1);
});

test('caveHintLine depends on cave kind', () => {
  assert.match(caveHintLine('road'), /STAIRS/);
  assert.match(caveHintLine('give'), /ITEM/);
  assert.match(caveHintLine('shop'), /ITEM/);
  assert.match(caveHintLine('moblin'), /RUPEE/);
  assert.equal(caveHintLine('door'), 'SOUTH TO LEAVE');
  assert.equal(caveHintLine('clue'), 'SOUTH TO LEAVE');
  assert.equal(caveHintLine('potion'), 'WALK TO ITEM  SOUTH TO LEAVE');
  assert.equal(caveHintLine('potion', { waresHidden: true }), 'SOUTH TO LEAVE');
  assert.match(
    caveHintLine('potion', { waresHidden: true, hasLetter: true }),
    /LETTER/,
  );
});

test('caveWareSlots hides moblin gift after looting', () => {
  const cave = {
    caveId: 0x21,
    kind: 'moblin',
    slots: [
      { item: 63, price: 0 },
      { item: 24, price: 30 },
      { item: 63, price: 0 },
    ],
  };
  const taken = new Set(['19:33:gift']);
  const slots = caveWareSlots(cave, taken, null, 0x13);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].gone, true);
});

test('nearCaveNpc matches the dweller, not a south approach dead-zone', () => {
  assert.equal(nearCaveNpc({ x: CAVE_DWELLER_X, y: CAVE_DWELLER_Y }), true);
  // South approach: just outside the box must not latch (or pay never runs).
  assert.equal(nearCaveNpc({ x: CAVE_DWELLER_X, y: CAVE_DWELLER_Y + 24 }), false);
  assert.equal(nearCaveNpc({ x: CAVE_DWELLER_X, y: CAVE_DWELLER_Y + 23 }), true);
  assert.equal(nearCaveNpc({ x: CAVE_DWELLER_X - 16, y: CAVE_DWELLER_Y }), false);
  assert.equal(nearCaveNpc({ x: 0x20, y: CAVE_DWELLER_Y }), false);
});

test('caveNpcInteractKey fires on the locked medicine shop and uncollected letter', () => {
  const atNpc = { x: CAVE_DWELLER_X, y: CAVE_DWELLER_Y };
  const away = { x: 0x20, y: CAVE_DWELLER_Y };
  assert.equal(
    caveNpcInteractKey({ kind: 'potion' }, { letter: 1 }, atNpc, true),
    'npc:potion',
  );
  assert.equal(
    caveNpcInteractKey({ kind: 'potion' }, { letter: 1 }, away, true),
    null,
  );
  assert.equal(
    caveNpcInteractKey({ kind: 'potion' }, { letter: 1 }, atNpc, false),
    null,
    'open shop uses ware touch, not the dweller',
  );
  assert.equal(
    caveNpcInteractKey({ kind: 'letter' }, { letter: 0 }, atNpc, false),
    'npc:letter',
  );
  assert.equal(
    caveNpcInteractKey({ kind: 'letter' }, { letter: 1 }, atNpc, false),
    null,
  );
});
