import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildLevel,
  decodeUwColumn,
  loadDungeonTables,
  discoverConnectedRooms,
  roomsFromDrawnMap,
  uwSquareToTiles,
} from './dungeons.js';
import { ROOT } from './paths.js';

const romPath = path.join(ROOT, 'zelda.nes');
const schemaPath = path.join(ROOT, 'assets', 'schema', 'dungeons.json');

function load() {
  if (!fs.existsSync(romPath)) {
    return null;
  }
  const prg = fs.readFileSync(romPath).subarray(16);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return loadDungeonTables(prg, schema);
}

test('UW tables load on PRG1 ROM', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  assert.equal(tables.layoutCount, 42);
  assert.equal(tables.columnTables.length, 10);
  assert.equal(tables.levelInfos.length, 9);
  assert.equal(tables.primarySquares.length, 8);
});

test('Level 1 header matches known map anchors', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const level = buildLevel(tables, 1, 1);
  assert.equal(level.startRoom, 0x73);
  assert.equal(level.bossRoom, 0x35);
  assert.equal(level.triforceRoom, 0x36);
  assert.equal(level.startY, 0xdd);
  assert.deepEqual(
    level.itemPositions.map((p) => p.packed),
    [0xc9, 0xac, 0x89, 0x87],
  );
  assert.ok(level.cellarRooms.includes(0x7f));
  const cellar = level.rooms.find((r) => r.roomId === 0x7f);
  assert.deepEqual(cellar.cellarExits, { left: 0x22, right: 0x22 });
  assert.equal(cellar.attrsC, 0x6a);
  assert.equal(level.rooms.length, 18);

  const start = level.rooms.find((r) => r.roomId === 0x73);
  assert.equal(start.layoutId, 0x21);
  assert.equal(start.doors.north.type, 'key');
  assert.equal(start.doors.east.type, 'open');
  assert.equal(start.doors.west.type, 'open');
  assert.equal(start.squares.length, 7);
  assert.equal(start.squares[0].length, 12);

  // The Wallmaster / key room south of Aquamentus is the ROM's "hear the
  // boss" cell: floor-item bits 5–6 = 1 → Sample $10 (boss_roar_1).
  const approach = level.rooms.find((r) => r.roomId === 0x45);
  assert.equal(approach.floorItem.bossNoise, 1);
  assert.equal(approach.floorItem.itemType, 0x19);
  const bossCell = level.rooms.find((r) => r.roomId === 0x35);
  assert.equal(bossCell.floorItem.bossNoise, 0);

  // Side rooms open toward the entrance (E/W attrs high=west, mid=east).
  const left = level.rooms.find((r) => r.roomId === 0x72);
  const right = level.rooms.find((r) => r.roomId === 0x74);
  assert.equal(left.doors.east.type, 'open');
  assert.equal(left.doors.west.type, 'wall');
  assert.equal(right.doors.west.type, 'open');
  assert.equal(right.doors.east.type, 'wall');
});

test('Level 3 discovers raft cellar $0F', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const level = buildLevel(tables, 3, 1);
  assert.ok(level.cellarRooms.includes(0x0f));
  const raft = level.rooms.find((r) => r.roomId === 0x0f);
  assert.equal(raft.floorItem.itemType, 0x0c);
  assert.deepEqual(raft.cellarExits, { left: 0x69, right: 0x69 });
});

test('Level 7 discovers bomb-secret rooms omitted from DrawnMap', {
  skip: !fs.existsSync(romPath),
}, () => {
  const tables = load();
  const level = buildLevel(tables, 7, 1);
  // DrawnMap skips $08 / $1a; both are linked by bombable doors from mapped rooms.
  const secretWest = level.rooms.find((r) => r.roomId === 0x08);
  const secretMid = level.rooms.find((r) => r.roomId === 0x1a);
  assert.ok(secretWest, 'L7 $08 (nose tip) should be playable');
  assert.ok(secretMid, 'L7 $1a (between $19 and $1b) should be playable');
  assert.equal(secretWest.doors.south.type, 'bombable');
  assert.equal(secretWest.doors.east.type, 'bombable');
  assert.equal(secretMid.doors.west.type, 'bombable');
  assert.equal(secretMid.doors.east.type, 'bombable');

  const fromDrawn = roomsFromDrawnMap(level.drawnMap, level.submenuMapRotation);
  assert.equal(fromDrawn.has(0x1a), false);
  const grown = discoverConnectedRooms(new Set(fromDrawn), tables, tables.levelBlocks.find(
    (b) => b.quest === 1 && b.levels.includes(7),
  ));
  assert.ok(grown.has(0x08));
  assert.ok(grown.has(0x1a));
});

test('Level 9 and Q2 are represented', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const q1l9 = buildLevel(tables, 9, 1);
  const q1l1 = buildLevel(tables, 1, 1);
  const q2l1 = buildLevel(tables, 1, 2);
  const q2l9 = buildLevel(tables, 9, 2);
  assert.equal(q1l9.startRoom, 0x76);
  assert.equal(q1l9.bossRoom, 0x42);
  assert.ok(q1l9.rooms.length >= 10);
  // Q2 LevelInfoUWQ2Replacements* applied in buildLevel.
  assert.equal(q2l1.startRoom, 0x77);
  assert.equal(q2l1.bossRoom, 0x07);
  assert.ok(q2l1.rooms.length >= 10);
  assert.equal(q2l9.bossRoom, 0x17);
  assert.ok(q2l9.rooms.some((r) => r.roomId === q2l9.triforceRoom && r.monster?.id === 0x37));
  // L9 `$21` is blue Patra (listId `$47`) behind a south shutter with secret 0.
  // Room-clear must still open that shutter after the fight.
  const patra21 = q1l9.rooms.find((r) => r.roomId === 0x21);
  assert.ok(patra21, 'L9 $21 missing');
  assert.equal(patra21.monster.id, 0x07);
  assert.equal(patra21.useMonsterGroups, true);
  assert.equal(patra21.doors.south.type, 'shutter');
  assert.equal(patra21.specialItem.effectType, 0);
  // Q2 uses a separate level block — at least one room attr should differ.
  const fingerprint = (rooms) =>
    rooms
      .map((r) => `${r.roomId}:${r.layoutId}:${r.doors.north.code}:${r.monster.id}`)
      .join('|');
  assert.notEqual(fingerprint(q1l1.rooms), fingerprint(q2l1.rooms));
});

test('submenu map mask + rotation recovers Level 1 rooms', () => {
  const drawnMap = [0, 0, 0, 0, 0, 8, 0x2d, 0x3f, 0x0d, 0x18, 0x10, 0, 0, 0, 0, 0];
  const rooms = roomsFromDrawnMap(drawnMap, 4);
  assert.ok(rooms.has(0x73));
  assert.ok(rooms.has(0x35));
  assert.ok(rooms.has(0x36));
  assert.equal(rooms.size, 17);
});

test('UW square expand matches WriteSquareUW rules', () => {
  const primary = [0xb0, 0x74, 0x94, 0xb4, 0x70, 0x68, 0xf4, 0x24];
  assert.deepEqual(uwSquareToTiles(0, primary), [0xb0, 0xb1, 0xb2, 0xb3]);
  assert.deepEqual(uwSquareToTiles(7, primary), [0x24, 0x24, 0x24, 0x24]); // solid < $70
  assert.deepEqual(uwSquareToTiles(6, primary), [0xf4, 0xf4, 0xf4, 0xf4]); // >= $F3 solid
});

test('column decode yields 7 squares', { skip: !fs.existsSync(romPath) }, () => {
  const tables = load();
  const squares = decodeUwColumn(tables.columnTables[0].bytes, 0);
  assert.equal(squares.length, 7);
});
