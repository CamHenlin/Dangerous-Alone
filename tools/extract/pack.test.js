import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../shared/paths.js';
import { extractAssetPack, materializePackFile } from './pack.js';

const romPath = join(ROOT, 'zelda.nes');

function loadSchema(name) {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'schema', name), 'utf8'));
}

test('extractAssetPack builds play JSON from a local ROM', {
  skip: !existsSync(romPath),
}, async () => {
  const rom = readFileSync(romPath);
  const pack = await extractAssetPack(rom, {
    patternBlocks: loadSchema('pattern_blocks.json'),
    overworld: loadSchema('overworld.json'),
    dungeons: loadSchema('dungeons.json'),
    caves: loadSchema('caves.json'),
    audio: loadSchema('audio.json'),
    ending: loadSchema('ending.json'),
    demo: loadSchema('demo.json'),
  });
  assert.match(pack.identity.crc32, /^[0-9A-F]{8}$/);
  const world = pack.files.get('play/world_index.json')?.data;
  assert.equal(world.startScreen, 0x77);
  assert.equal(world.screens.length, 128);
  assert.equal(pack.files.get('graphics/common_sprites.png')?.kind, 'rgba');
  assert.equal(pack.files.get('play/title.png')?.kind, 'rgba');
  assert.equal(pack.files.get('play/prologue.png')?.kind, 'rgba');
  assert.equal(pack.files.get('play/bomb_crack.png')?.kind, 'rgba');
  assert.ok(pack.files.get('audio/audio.json')?.data?.songs);
  assert.ok(pack.files.get('dungeons/q1/level_1/level.json')?.data?.rooms?.length);
  const q2L2 = pack.files.get('play/q2/screens/3c.json')?.data;
  assert.equal(q2L2?.attrs?.caveId, 2);
  assert.equal(q2L2?.layoutId, 0x7b);
  assert.ok(new Set(q2L2?.squares?.flat() ?? []).size > 1, 'Q2 $3C overlay must not be a solid rock field');
  assert.ok(pack.files.get('tables/caves.json')?.data?.caves?.length);
  assert.equal(pack.files.has('overworld/screens/screen_77.png'), false);
  const startPng = materializePackFile(pack.files, 'overworld/screens/screen_77.png');
  assert.equal(startPng?.kind, 'rgba');
  assert.equal(startPng.width, 256);
  assert.equal(startPng.height, 176);
});
