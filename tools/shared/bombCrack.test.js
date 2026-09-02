import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HUD_HEIGHT } from './collision.js';
import { PLAY_H, PLAY_W } from './continuousCamera.js';
import { ROOT } from './paths.js';
import {
  BOMB_CRACK_SIZE,
  bombCrackRgba,
  centerCrackInRect,
  crackInPlayBounds,
  owBombCrackPlacements,
  uwBombCrackPlacements,
} from './bombCrack.js';
import { createDoorState, openDoorPair } from './dungeonDoors.js';
import { finalizeLevelMeta } from './dungeons.js';

test('bombCrackRgba paints a transparent 16×16 with opaque crack pixels', () => {
  const { width, height, rgba } = bombCrackRgba();
  assert.equal(width, BOMB_CRACK_SIZE);
  assert.equal(height, BOMB_CRACK_SIZE);
  assert.equal(rgba.length, 16 * 16 * 4);
  let opaque = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 255) opaque += 1;
  }
  assert.ok(opaque > 20, 'crack should have visible pixels');
  assert.equal(rgba[0 + 3], 0, 'corner (0,0) stays empty');
});

test('centerCrackInRect centers 16×16 inside a blast rect', () => {
  const pos = centerCrackInRect({ x: 120, y: 30, w: 16, h: 20 });
  assert.deepEqual(pos, { x: 120, y: 32 });
});

test('owBombCrackPlacements: only unopened bomb secrets', () => {
  const secrets = [
    { row: 1, col: 9, marker: 0xe6, action: 'bomb' },
    { row: 2, col: 3, marker: 0xe7, action: 'burn' },
    { row: 4, col: 5, marker: 0xe6, action: 'bomb' },
  ];
  const revealed = new Set(['1:1:9']);
  const placements = owBombCrackPlacements(secrets, revealed, 0x01);
  assert.equal(placements.length, 1);
  assert.deepEqual(placements[0], {
    key: 'ow:1:4:5',
    x: 5 * 16,
    y: 4 * 16,
  });
  assert.equal(crackInPlayBounds(placements[0]), true);
});

test('uwBombCrackPlacements: closed bombable doors only, in play bounds', () => {
  const path = join(ROOT, 'assets/extracted/dungeons/q1/level_1/level.json');
  const level = finalizeLevelMeta(JSON.parse(readFileSync(path, 'utf8')));
  const room = level.rooms.find((r) =>
    Object.values(r.doors ?? {}).some((d) => d?.type === 'bombable'),
  );
  assert.ok(room, 'level 1 should have a bombable door');
  const state = createDoorState();
  const closed = uwBombCrackPlacements(room, state);
  assert.ok(closed.length >= 1);
  for (const p of closed) {
    assert.equal(crackInPlayBounds(p), true, JSON.stringify(p));
    assert.ok(p.y + BOMB_CRACK_SIZE <= PLAY_H);
    assert.ok(p.x + BOMB_CRACK_SIZE <= PLAY_W);
    // Room-local Y must not include the HUD band.
    assert.ok(p.y < HUD_HEIGHT + PLAY_H);
  }

  const side = closed[0].key.split(':')[2];
  openDoorPair(state, room.roomId, side);
  const after = uwBombCrackPlacements(room, state);
  assert.equal(
    after.some((p) => p.key === closed[0].key),
    false,
    'opened door should drop its crack',
  );
});

test('uwBombCrackPlacements: north crack sits on the wall face, not the floor lip', () => {
  const room = {
    roomId: 0x53,
    doors: { north: { type: 'bombable', code: 4 } },
  };
  const [p] = uwBombCrackPlacements(room, createDoorState());
  assert.ok(p);
  // Door face is tiles rows 1–3 (y=8..32); floor starts at y=32.
  assert.deepEqual({ x: p.x, y: p.y }, { x: 120, y: 12 });
  assert.ok(p.y + BOMB_CRACK_SIZE <= 32, 'crack must not spill onto the floor');
});
