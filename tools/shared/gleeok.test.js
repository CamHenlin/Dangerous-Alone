import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSS } from './bosses.js';
import { createEnemy } from './enemies.js';
import {
  GLEEOK_BODY_FRAMES,
  GLEEOK_BODY_X,
  GLEEOK_BODY_Y,
  createGleeokNeck,
  stepGleeok,
  stretchGleeokNeck,
} from './gleeok.js';

test('Gleeok body frame 0 matches NES GleeokBodyTiles0 order', () => {
  assert.deepEqual([...GLEEOK_BODY_FRAMES[1]], [0xc0, 0xc4, 0xc8, 0xc2, 0xc6, 0xca]);
});

test('stretchGleeokNeck lerps base to head', () => {
  const neck = createGleeokNeck(0);
  neck.headX = 0x7c + 20;
  neck.headY = 0x88 + 10;
  stretchGleeokNeck(neck);
  assert.equal(neck.segs.length, 6);
  assert.equal(neck.segs[0].x, 0x7c);
  assert.equal(neck.segs[0].y, 0x6f);
  assert.equal(neck.segs[5].x, neck.headX);
  assert.equal(neck.segs[5].y, neck.headY);
});

test('init pins body and step keeps it pinned', () => {
  const e = createEnemy({ objType: BOSS.GLEEOK_2, x: 0xa0, y: 0x80 });
  assert.equal(e.x, GLEEOK_BODY_X);
  assert.equal(e.y, GLEEOK_BODY_Y);
  const bounds = { minX: 0x20, maxX: 0xd0, minY: 0x40, maxY: 0xd0 };
  for (let i = 0; i < 64; i += 1) stepGleeok(e, bounds, i);
  assert.equal(e.x, GLEEOK_BODY_X);
  assert.equal(e.y, GLEEOK_BODY_Y);
  assert.ok(e.necks.every((n) => n.segs.length === 6));
});
