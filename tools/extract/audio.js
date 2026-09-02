import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import { buildAudioDoc } from './audioData.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';

export const AUDIO_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'audio.json');
export const AUDIO_OUT_DIR = path.join(EXTRACTED_DIR, 'audio');
export const AUDIO_OUT_PATH = path.join(AUDIO_OUT_DIR, 'audio.json');

/**
 * @param {{ romPath?: string, schemaPath?: string }} [opts]
 */
export function cmdAudio(opts = {}) {
  const romPath = opts.romPath ?? DEFAULT_ROM_PATH;
  const schemaPath = opts.schemaPath ?? AUDIO_SCHEMA_PATH;
  const { prg } = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const out = buildAudioDoc(prg, schema);

  fs.mkdirSync(AUDIO_OUT_DIR, { recursive: true });
  fs.writeFileSync(AUDIO_OUT_PATH, `${JSON.stringify(out)}\n`);
  const sampleCount = Object.keys(schema.samples.names).length;
  console.log(
    `  audio → ${AUDIO_OUT_PATH} (${Object.keys(out.songs).length} songs, `
      + `${Object.keys(out.playlists).length} playlists, ${Object.keys(out.sfx).length} sfx keys, `
      + `${sampleCount} DPCM samples)`,
  );
  return out;
}
