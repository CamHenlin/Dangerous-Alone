import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DEMO_BG_TILE_BASE,
  STORY_TRANSFER_LENGTH,
  STORY_TRANSFER_PRG,
  TITLE_TRANSFER_LENGTH,
  TITLE_TRANSFER_PRG,
  decodeStoryNametable,
  decodeTitleNametable,
  renderStoryNametableRgba,
  storyTilePatternBytes,
} from './demoStory.js';
import { ROOT } from './paths.js';

const prg = fs.readFileSync(path.join(ROOT, 'zelda.nes')).subarray(16);

function tileRowText(tiles, row) {
  const CHAR = {
    0x24: ' ',
    ...Object.fromEntries([...Array(10)].map((_, i) => [i, String(i)])),
    ...Object.fromEntries(
      [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [0x0a + i, c]),
    ),
  };
  let out = '';
  for (let col = 0; col < 32; col += 1) {
    out += CHAR[tiles[row * 32 + col]] ?? '.';
  }
  return out;
}

test('decodeTitleNametable recovers title chrome text', () => {
  const { tiles, attrs, records } = decodeTitleNametable(prg);
  assert.ok(records.length >= 30);
  assert.equal(tiles.length, 960);
  assert.equal(attrs.length, 64);
  assert.match(tileRowText(tiles, 17), /1986 NINTENDO/);
  assert.match(tileRowText(tiles, 20), /PUSH START BUTTON/);
  assert.equal(prg[TITLE_TRANSFER_PRG + TITLE_TRANSFER_LENGTH - 1], 0xff);
});

test('decodeStoryNametable recovers the storyboard text', () => {
  const { tiles, attrs, records } = decodeStoryNametable(prg);
  assert.ok(records.length >= 30);
  assert.equal(tiles.length, 960);
  assert.equal(attrs.length, 64);
  assert.match(tileRowText(tiles, 4), /THE LEGEND OF ZELDA/);
  assert.match(tileRowText(tiles, 7), /MANY\s+YEARS\s+AGO/);
  assert.match(tileRowText(tiles, 27), /LINK\s+TO SAVE HER/);
  assert.equal(prg[STORY_TRANSFER_PRG + STORY_TRANSFER_LENGTH - 1], 0xff);
});

test('storyTilePatternBytes maps low tiles to common BG and high to demo BG', () => {
  const common = new Uint8Array(0x70 * 16);
  const demo = new Uint8Array(0x80 * 16);
  common[0x0a * 16] = 0xaa;
  demo[0 * 16] = 0xbb;
  demo[(0xe2 - DEMO_BG_TILE_BASE) * 16] = 0xcc;
  assert.equal(storyTilePatternBytes(0x0a, common, demo)[0], 0xaa);
  assert.equal(storyTilePatternBytes(DEMO_BG_TILE_BASE, common, demo)[0], 0xbb);
  assert.equal(storyTilePatternBytes(0xe2, common, demo)[0], 0xcc);
});

test('renderStoryNametableRgba paints a full opaque screen', () => {
  const tiles = new Uint8Array(960);
  const attrs = new Uint8Array(64);
  const common = new Uint8Array(16);
  const demo = new Uint8Array(16);
  const { width, height, rgba } = renderStoryNametableRgba(tiles, attrs, common, demo);
  assert.equal(width, 256);
  assert.equal(height, 240);
  assert.equal(rgba.length, 256 * 240 * 4);
  assert.equal(rgba[0], 0);
  assert.equal(rgba[1], 0);
  assert.equal(rgba[2], 0);
  assert.equal(rgba[3], 255);
});
