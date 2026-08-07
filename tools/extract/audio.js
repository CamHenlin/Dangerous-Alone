import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import { parseOffset } from '../shared/ranges.js';
import { cpuToPrg, expandSong, finalizeSongDuration, readSongDescriptor } from '../shared/musicFormat.js';
import {
  dmcSampleAddress,
  dmcSampleByteLength,
  dmcSampleHz,
  tune1UsesEnvelope,
} from '../shared/audioTables.js';
import {
  eventsDurationFrames,
  expandCountdownEffect,
  expandFlameEffect,
  expandSeaEffect,
  expandStairsEffect,
  expandTune0,
  expandTune1,
  requestBitToIndex,
} from '../shared/tuneFormat.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';

export const AUDIO_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'audio.json');
export const AUDIO_OUT_DIR = path.join(EXTRACTED_DIR, 'audio');
export const AUDIO_OUT_PATH = path.join(AUDIO_OUT_DIR, 'audio.json');

const BANK_SIZE = 0x4000;

/**
 * @param {Uint8Array | Buffer} bank
 * @param {{ cpu: string | number, length?: number }} spec
 */
function readTable(bank, spec) {
  const off = cpuToPrg(parseOffset(spec.cpu));
  return [...bank.subarray(off, off + (spec.length ?? 0))];
}

/**
 * Tune scripts start with their own pointer table: `TuneScripts0-1, Y` with Y
 * being the 1-based index of the request bit (Z_00.asm:191 and 443).
 * @param {number[]} script
 * @param {number} bit
 * @param {number} cpuBase
 */
function tuneScriptStart(script, bit, cpuBase) {
  const idx = requestBitToIndex(bit);
  return cpuBase + script[idx];
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {object} schema
 * @param {number[]} noteTable
 */
function extractTune0(bank0, schema, noteTable) {
  const spec = schema.offsets.tuneScripts0;
  const cpuBase = parseOffset(spec.cpu);
  const script = readTable(bank0, spec);
  /** @type {Record<string, object>} */
  const out = {};
  for (const [bitKey, name] of Object.entries(schema.tune0.names)) {
    const bit = parseOffset(bitKey);
    const cpu = tuneScriptStart(script, bit, cpuBase);
    const events = expandTune0(bank0, cpu, noteTable);
    out[name] = {
      kind: 'tune0',
      channel: 'sq1',
      bit,
      cpu,
      durationFrames: eventsDurationFrames(events),
      events,
    };
  }
  for (const [alias, target] of Object.entries(schema.tune0.aliases ?? {})) {
    if (out[target]) out[alias] = out[target];
  }
  return out;
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {object} schema
 * @param {number[]} noteTable
 */
function extractTune1(bank0, schema, noteTable) {
  const spec = schema.offsets.tuneScripts1;
  const cpuBase = parseOffset(spec.cpu);
  const script = readTable(bank0, spec);
  const repeats = new Set((schema.tune1.repeats ?? []).map((k) => parseOffset(k)));
  /** @type {Record<string, object>} */
  const out = {};
  for (const [bitKey, name] of Object.entries(schema.tune1.names)) {
    const bit = parseOffset(bitKey);
    const cpu = tuneScriptStart(script, bit, cpuBase);
    const events = expandTune1(bank0, cpu, noteTable);
    out[name] = {
      kind: 'tune1',
      channel: 'sq2',
      bit,
      cpu,
      durationFrames: eventsDurationFrames(events),
      // Only the flute and Link's death tune run CustomEnvelopeTune1 + vibrato.
      envelope: tune1UsesEnvelope(bit),
      repeat: repeats.has(bit),
      // $80 calls SilenceSong before playing (Z_00.asm:431).
      silencesSong: (bit & 0x80) !== 0,
      events,
    };
  }
  return out;
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {object} schema
 */
function extractEffects(bank0, schema) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [bitKey, slot] of Object.entries(schema.effects.slots)) {
    const bit = parseOffset(bitKey);
    const cpu = slot.cpu ? parseOffset(slot.cpu) : 0;
    const notes = slot.cpu ? readTable(bank0, slot) : [];
    let events;
    if (slot.mode === 'countdown') {
      events = expandCountdownEffect(notes, slot.frames);
    } else if (slot.mode === 'flame') {
      // `LDA FlameSfxNotes-1, Y` reads one byte below the table on the last frame.
      events = expandFlameEffect(notes, bank0[cpuToPrg(cpu) - 1], slot.frames);
    } else if (slot.mode === 'stairs') {
      events = expandStairsEffect(notes, slot.frames);
    } else {
      events = expandSeaEffect(slot.frames);
    }
    out[slot.name] = {
      kind: 'effect',
      channel: 'noise',
      bit,
      cpu,
      durationFrames: eventsDurationFrames(events),
      events,
    };
  }
  return out;
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {Uint8Array | Buffer} bank7
 * @param {object} schema
 */
function extractSamples(bank0, bank7, schema) {
  const addrs = readTable(bank0, schema.offsets.sampleAddrs);
  const lengths = readTable(bank0, schema.offsets.sampleLengths);
  const rates = readTable(bank0, schema.offsets.sampleRates);
  const pcmCpu = parseOffset(schema.pcmSamples.cpu);
  const pcmLength = schema.pcmSamples.length;
  const pcmBytes = bank7.subarray(0, pcmLength);

  /** @type {Record<string, object>} */
  const out = {};
  for (const [bitKey, name] of Object.entries(schema.samples.names)) {
    const bit = parseOffset(bitKey);
    const slot = requestBitToIndex(bit);
    const cpu = dmcSampleAddress(addrs[slot]);
    const byteLength = dmcSampleByteLength(lengths[slot]);
    const rateIndex = rates[slot] & 0x0f;
    const sampleHz = dmcSampleHz(rateIndex);
    out[name] = {
      kind: 'sample',
      channel: 'dmc',
      bit,
      cpu,
      // Offset into the shared `pcm` blob rather than a copy: samples $02 and
      // $40 share a start address and only differ in length and rate.
      pcmOffset: cpu - pcmCpu,
      byteLength,
      rateIndex,
      sampleHz,
      durationFrames: Math.round(((byteLength * 8) / sampleHz) * 60.0988),
    };
  }
  for (const [alias, target] of Object.entries(schema.samples.aliases ?? {})) {
    if (out[target]) out[alias] = out[target];
  }
  return { samples: out, pcm: Buffer.from(pcmBytes).toString('base64'), pcmCpu, pcmLength };
}

/**
 * @param {{ romPath?: string, schemaPath?: string }} [opts]
 */
export function cmdAudio(opts = {}) {
  const romPath = opts.romPath ?? DEFAULT_ROM_PATH;
  const schemaPath = opts.schemaPath ?? AUDIO_SCHEMA_PATH;
  const { prg } = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const bank0 = prg.subarray(0, BANK_SIZE);
  const bank7 = prg.subarray(schema.pcmSamples.bank * BANK_SIZE, (schema.pcmSamples.bank + 1) * BANK_SIZE);

  const noteTable = readTable(bank0, schema.offsets.noteTable);
  const delayBase = cpuToPrg(parseOffset(schema.offsets.noteDelaySets.cpu));
  /** @type {number[][]} */
  const delaySets = [];
  for (let i = 0; i < 5; i += 1) {
    delaySets.push([...bank0.subarray(delayBase + i * 8, delayBase + i * 8 + 8)]);
  }

  const ptrTable = readTable(bank0, schema.offsets.songPointerTable);
  const needed = new Set(ptrTable);
  for (const pl of Object.values(schema.playlists)) {
    for (const p of pl.parts) needed.add(parseOffset(p));
  }

  /** @type {Record<string, object>} */
  const songs = {};
  for (const off of [...needed].sort((a, b) => a - b)) {
    if (off < 0x24 || off > 0xf5) continue;
    try {
      const desc = readSongDescriptor(bank0, off);
      const song = finalizeSongDuration(expandSong(desc, bank0, delaySets, noteTable));
      songs[`0x${off.toString(16)}`] = song;
    } catch {
      // skip malformed
    }
  }

  const sfx = {
    ...extractTune0(bank0, schema, noteTable),
    ...extractTune1(bank0, schema, noteTable),
    ...extractEffects(bank0, schema),
  };
  const { samples, pcm, pcmCpu, pcmLength } = extractSamples(bank0, bank7, schema);
  Object.assign(sfx, samples);

  /** @type {Record<string, object>} */
  const playlists = {};
  for (const [name, pl] of Object.entries(schema.playlists)) {
    playlists[name] = {
      loop: pl.loop,
      loopStart: pl.loopStart ?? 0,
      parts: pl.parts.map((p) => `0x${parseOffset(p).toString(16)}`),
    };
  }

  fs.mkdirSync(AUDIO_OUT_DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    revision_target: schema.revision_target,
    frameHz: 60.0988,
    noteTable,
    delaySets,
    songPointerTable: ptrTable,
    envelopes: {
      song: readTable(bank0, schema.offsets.songEnvelope),
      tune1: readTable(bank0, schema.offsets.tune1Envelope),
    },
    noise: {
      volumes: readTable(bank0, schema.offsets.noiseVolumes),
      periods: readTable(bank0, schema.offsets.noisePeriods),
      lengths: readTable(bank0, schema.offsets.noiseLengths),
    },
    songs,
    playlists,
    sfx,
    samples: { cpu: pcmCpu, length: pcmLength, bank: schema.pcmSamples.bank, pcm },
  };
  fs.writeFileSync(AUDIO_OUT_PATH, `${JSON.stringify(out)}\n`);
  const sampleCount = Object.keys(schema.samples.names).length;
  console.log(
    `  audio → ${AUDIO_OUT_PATH} (${Object.keys(songs).length} songs, `
      + `${Object.keys(playlists).length} playlists, ${Object.keys(sfx).length} sfx keys, `
      + `${sampleCount} DPCM samples)`,
  );
  return out;
}
