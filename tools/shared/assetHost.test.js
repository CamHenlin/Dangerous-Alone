import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packPath } from '../../game/src/assetHost.js';

test('packPath strips origin and a GitHub project folder', () => {
  assert.equal(packPath('/play/world_index.json'), 'play/world_index.json');
  assert.equal(
    packPath('https://example.github.io/play/world_index.json'),
    'play/world_index.json',
  );
  assert.equal(
    packPath('https://example.github.io/nes_zelda/play/world_index.json'),
    'play/world_index.json',
  );
  assert.equal(packPath('./graphics/palettes.json'), 'graphics/palettes.json');
});
