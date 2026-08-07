import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { finalizeLevelMeta } from './dungeons.js';
import { dungeonProgressKey, hydrateDungeonProgress, serializeDungeonProgress } from './save.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const q2l9 = path.join(root, 'assets/extracted/dungeons/q2/level_9/level.json');
const q1l9 = path.join(root, 'assets/extracted/dungeons/q1/level_9/level.json');

test('finalizeLevelMeta keeps Q2 L9 Ganon/Zelda anchors', {
  skip: !fs.existsSync(q2l9),
}, () => {
  const level = JSON.parse(fs.readFileSync(q2l9, 'utf8'));
  // Extract already ran finalizeLevelMeta via buildLevel.
  finalizeLevelMeta(level);
  assert.equal(level.bossRoom, 0x17, 'Ganon room');
  assert.ok(
    level.rooms.some((r) => r.roomId === level.triforceRoom && r.monster?.id === 0x37),
    'triforceRoom hosts Zelda',
  );
});

test('finalizeLevelMeta keeps Q1 L9 Ganon/Zelda anchors', {
  skip: !fs.existsSync(q1l9),
}, () => {
  const level = JSON.parse(fs.readFileSync(q1l9, 'utf8'));
  finalizeLevelMeta(level);
  assert.equal(level.bossRoom, 0x42);
  assert.equal(level.triforceRoom, 0x32);
});

test('dungeon progress keys are quest-scoped', () => {
  const progress = new Map([
    [
      dungeonProgressKey(1, 1),
      { cleared: new Set([1]), taken: new Set(), visited: new Set([1]), pushed: new Set(), doors: new Set(), map: 1, compass: 0 },
    ],
    [
      dungeonProgressKey(2, 1),
      { cleared: new Set([2]), taken: new Set(), visited: new Set([2]), pushed: new Set(), doors: new Set(), map: 0, compass: 1 },
    ],
  ]);
  const json = serializeDungeonProgress(progress);
  assert.ok(json['1:1']);
  assert.ok(json['2:1']);
  const back = hydrateDungeonProgress(json);
  assert.ok(back.get('1:1').cleared.has(1));
  assert.ok(back.get('2:1').compass === 1);
  // Legacy bare level key migrates to quest 1.
  const legacy = hydrateDungeonProgress({
    3: { cleared: ['5'], taken: [], visited: [], pushed: [], doors: [], map: 0, compass: 0 },
  });
  assert.ok(legacy.get('1:3').cleared.has(5));
});
