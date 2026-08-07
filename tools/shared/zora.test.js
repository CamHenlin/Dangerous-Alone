import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { OBJ } from './enemies.js';
import { ROOT } from './paths.js';
import {
  isOwWaterTile,
  trySpawnZora,
  zoraCandidateFromRandomByte,
} from './zora.js';

test('isOwWaterTile matches CheckZora $8D–$98', () => {
  assert.equal(isOwWaterTile(0x8c), false);
  assert.equal(isOwWaterTile(0x8d), true);
  assert.equal(isOwWaterTile(0x95), true);
  assert.equal(isOwWaterTile(0x98), true);
  assert.equal(isOwWaterTile(0x99), false);
});

test('zoraCandidateFromRandomByte maps one byte to X/Y like NES', () => {
  // r=$56 → X=$50, Y_base=$60 → $6D
  assert.deepEqual(zoraCandidateFromRandomByte(0x56), { x: 0x50, y: 0x6d });
  assert.equal(zoraCandidateFromRandomByte(0x00), null); // X=0 rejected
  assert.equal(zoraCandidateFromRandomByte(0xf0), null); // X=$F0 rejected
  assert.equal(zoraCandidateFromRandomByte(0x04), null); // Y_base=$40 < $50
});

test('trySpawnZora skips when attrs.zora is false', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x95));
  assert.equal(trySpawnZora({ zora: false }, grid, []), null);
});

test('trySpawnZora places Zora on water and not twice', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x26));
  // Fill a lake region with water tiles.
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 14; c += 1) grid[r][c] = 0x95;
  }
  // Deterministic stream that hits a valid water candidate quickly.
  const bytes = [0x00, 0xf0, 0x56, 0x56];
  let i = 0;
  const zora = trySpawnZora({ zora: true }, grid, [], {
    rngByte: () => bytes[i++] ?? 0x56,
  });
  assert.ok(zora);
  assert.equal(zora.objType, OBJ.ZORA);
  assert.equal(zora.x, 0x50);
  assert.equal(zora.y, 0x6d);
  assert.equal(isOwWaterTile(0x95), true);

  const again = trySpawnZora({ zora: true }, grid, [zora], {
    rngByte: () => 0x56,
  });
  assert.equal(again, null);
});

test('neighbor Zora does not block CheckZora in the current room', () => {
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x95));
  const neighbor = {
    alive: true,
    objType: OBJ.ZORA,
    homeRoomId: 0x55,
    x: 0x50,
    y: 0x6d,
  };
  const zora = trySpawnZora({ zora: true }, grid, [neighbor], {
    rngByte: () => 0x56,
    roomId: 0x56,
  });
  assert.ok(zora, 'streamed neighbor Zora must not suppress this room');
  assert.equal(zora.objType, OBJ.ZORA);

  zora.homeRoomId = 0x56;
  const blocked = trySpawnZora({ zora: true }, grid, [neighbor, zora], {
    rngByte: () => 0x56,
    roomId: 0x56,
  });
  assert.equal(blocked, null);
});

test('OW $56 attrs.zora is true and has water for CheckZora', {
  skip: !fs.existsSync(path.join(ROOT, 'assets/extracted/play/screens/56.json')),
}, () => {
  const pack = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets/extracted/play/screens/56.json'), 'utf8'),
  );
  assert.equal(pack.attrs.zora, true);
  assert.equal(pack.attrs.monsterId, 7); // octoroks from the list; Zora is separate
  let water = 0;
  for (const row of pack.tileGrid) {
    for (const t of row) if (isOwWaterTile(t)) water += 1;
  }
  assert.ok(water > 0, 'screen $56 should include water tiles');
  // Random byte $36 → X=$30, Y=$6D — water on this screen's lake.
  const zora = trySpawnZora(pack.attrs, pack.tileGrid, [], {
    rngByte: () => 0x36,
  });
  assert.ok(zora, 'CheckZora should find water on $56');
  assert.equal(zora.objType, OBJ.ZORA);
  assert.equal(zora.x, 0x30);
  assert.equal(zora.y, 0x6d);
});
