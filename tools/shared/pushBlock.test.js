import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { loadDungeonTables, buildLevel, roomToTileGrid } from './dungeons.js';
import { dungeonFloorRect, dungeonPlayOrigin } from './dungeonPlay.js';
import {
  PUSH_HOLD_FRAMES,
  PUSH_STATE,
  PUSH_TRAVEL,
  beginPushBlockFrame,
  createPushBlock,
  findPushBlockTile,
  linkPushingBlock,
  nudgeLinkOntoPushAxis,
  pushBlockSquareTiles,
  pushOpensShutters,
  pushSpawnsStairs,
  BLOCK_STAIRS_POS,
  stepPushBlock,
} from './pushBlock.js';
import { PLAY_W, localInRoom } from './continuousCamera.js';
import { SECRET } from './roomSecrets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const romPath = path.join(ROOT, 'zelda.nes');
const schemaPath = path.join(ROOT, 'assets/schema/dungeons.json');

test('findPushBlockTile prefers NES play row $A (floor row 6)', () => {
  const grid = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  grid[6][8] = 0xb0;
  grid[10][12] = 0xb0;
  assert.deepEqual(findPushBlockTile(grid), { col: 8, row: 6 });
});

test('pushBlockSquareTiles expands WriteSquareUW 2×2', () => {
  assert.deepEqual(pushBlockSquareTiles(0xb0), [0xb0, 0xb1, 0xb2, 0xb3]);
  assert.deepEqual(pushBlockSquareTiles(0x74), [0x74, 0x75, 0x76, 0x77]);
});

test('push block completes after hold + travel', () => {
  const floor = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  floor[10][12] = 0xb0;
  const block = createPushBlock(
    { pushable: true, specialItem: { effectType: 0 } },
    { x: 32, y: 64 },
    floor,
  );
  assert.ok(block);
  assert.equal(block.homeX, block.x);
  assert.equal(block.homeY, block.y);
  const link = { x: block.x, y: block.y + 8, dir: DIR.UP };
  for (let i = 0; i < PUSH_HOLD_FRAMES; i += 1) {
    stepPushBlock(block, link, DIR.UP, true);
  }
  assert.equal(block.state, PUSH_STATE.MOVING);
  let done = false;
  for (let i = 0; i < 32; i += 1) {
    const r = stepPushBlock(block, link, DIR.UP, true);
    if (r.justCompleted) done = true;
  }
  assert.equal(done, true);
  assert.equal(block.state, PUSH_STATE.DONE);
  assert.equal(block.y, 64 + 10 * 8 - 0x10);
});

test('BLOCK_DOOR secret opens shutters on push', () => {
  assert.equal(pushOpensShutters({ specialItem: { effectType: 4 } }), true);
  assert.equal(pushOpensShutters({ specialItem: { effectType: 0 } }), false);
});

test('BLOCK_STAIRS secret spawns stairs at $D0,$60', () => {
  assert.equal(pushSpawnsStairs({ specialItem: { effectType: 5 } }), true);
  assert.equal(pushSpawnsStairs({ specialItem: { effectType: 4 } }), false);
  assert.deepEqual(BLOCK_STAIRS_POS, { x: 0xd0, y: 0x60 });
});
test('cannot push until room cleared', () => {
  const floor = Array.from({ length: 14 }, () => Array(24).fill(0x24));
  floor[10][4] = 0xb0;
  const block = createPushBlock({ pushable: true }, { x: 0, y: 0 }, floor);
  const link = { x: block.x, y: block.y + 8, dir: DIR.UP };
  for (let i = 0; i < 40; i += 1) stepPushBlock(block, link, DIR.UP, false);
  assert.equal(block.state, PUSH_STATE.IDLE);
});

test('L7 $0d Wallmaster room: push middle-right block east for stairs', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = loadDungeonTables(prg, schema);
  const level = buildLevel(tables, 7, 1);
  const room = level.rooms.find((r) => r.roomId === 0x0d);
  assert.ok(room?.pushable);
  assert.equal(room.specialItem?.effectType, SECRET.BLOCK_STAIRS);

  const floor = dungeonFloorRect(dungeonPlayOrigin());
  const tiles = roomToTileGrid(room, tables.primarySquares);
  const block = createPushBlock(room, { x: floor.x, y: floor.y }, tiles);
  assert.ok(block);
  // Middle of the right-hand vertical stack (screen $C0,$90).
  assert.equal(block.x, 0xc0);
  assert.equal(block.y, 0x90);

  // Adjacent blocks block UP/DOWN; the open push is from the left → RIGHT.
  const link = { x: 0xb0, y: 0x8d, dir: DIR.RIGHT };
  assert.equal(linkPushingBlock(block, link, DIR.RIGHT), true);
  assert.equal(linkPushingBlock(block, link, DIR.UP), false);

  for (let i = 0; i < PUSH_HOLD_FRAMES + PUSH_TRAVEL; i += 1) {
    stepPushBlock(block, link, DIR.RIGHT, true);
  }
  assert.equal(block.state, PUSH_STATE.DONE);
  assert.equal(block.x, 0xd0);
  assert.equal(pushSpawnsStairs(room), true);
});

test('nudgeLinkOntoPushAxis slides from the neighboring walk row', () => {
  const block = {
    x: 0xc0,
    y: 0x90,
    state: PUSH_STATE.IDLE,
  };
  const link = { x: 0xb0, y: 0x9d, gridOffset: 0 }; // one row below align ($8d)
  assert.equal(linkPushingBlock(block, link, DIR.RIGHT), false);
  assert.equal(nudgeLinkOntoPushAxis(block, link, DIR.RIGHT), 'up');
  assert.equal(link.y, 0x9c);
  for (let i = 0; i < 16; i += 1) nudgeLinkOntoPushAxis(block, link, DIR.RIGHT);
  assert.equal(link.y, 0x8d);
  assert.equal(linkPushingBlock(block, link, DIR.RIGHT), true);
});

test('an idle ally does not reset a push hold', () => {
  const block = {
    x: 0x70,
    y: 0x90,
    state: PUSH_STATE.IDLE,
    pushTimer: 8,
    heldThisFrame: true,
  };
  const idle = { x: 0x30, y: 0x8d, dir: DIR.RIGHT };
  beginPushBlockFrame([block]);
  assert.equal(block.pushTimer, 8);
  assert.equal(block.heldThisFrame, false);
  stepPushBlock(block, idle, DIR.RIGHT, true, { persistTimer: true });
  assert.equal(block.pushTimer, 8, 'the idle hero must not zero the hold');
  beginPushBlockFrame([block]);
  assert.equal(block.pushTimer, 0, 'a frame with nobody shoving still drops the hold');
});

test('a leftover shove lines up in room-local space', () => {
  const block = { x: 0x70, y: 0x90 };
  const local = { x: 0x60, y: 0x8d };
  assert.equal(linkPushingBlock(block, local, DIR.RIGHT), true);
  const world = localInRoom(0x42, 0x43, local.x, local.y);
  assert.equal(world.x, 0x60 - PLAY_W);
  assert.equal(
    linkPushingBlock(block, world, DIR.RIGHT),
    false,
    'anchor-local leftover coords must not match a room-local block',
  );
});

test('L1 $42 push block is the centre-left $B0 at $70,$90', {
  skip: !fs.existsSync(romPath),
}, () => {
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = loadDungeonTables(prg, schema);
  const level = buildLevel(tables, 1, 1);
  const room = level.rooms.find((r) => r.roomId === 0x42);
  assert.ok(room?.pushable);
  const floor = dungeonFloorRect(dungeonPlayOrigin());
  const tiles = roomToTileGrid(room, tables.primarySquares);
  const block = createPushBlock(room, { x: floor.x, y: floor.y }, tiles);
  assert.ok(block);
  assert.equal(block.x, 0x70);
  assert.equal(block.y, 0x90);
  const link = { x: 0x60, y: 0x8d, dir: DIR.RIGHT };
  assert.equal(linkPushingBlock(block, link, DIR.RIGHT), true);
});
