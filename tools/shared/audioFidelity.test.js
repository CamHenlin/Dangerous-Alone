import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DMC_RATE_CYCLES,
  NOISE_PERIODS,
  decodeDpcm,
  dmcSampleAddress,
  dmcSampleByteLength,
  dmcSampleHz,
  dpcmToFloat,
  hardwareEnvelopeVolume,
  apuLengthCounterFrames,
  noiseClockHz,
  songEnvelopeVolume,
  tune1EnvelopeDuty,
  tune1EnvelopeVolume,
  tune1UsesEnvelope,
} from './audioTables.js';
import { base64ToBytes, nextNoiseLfsr, renderDpcm, renderNoiseEvents } from './audioRender.js';
import {
  arrowCancelsTune0Request,
  createChannelState,
  endCue,
  requestEffect,
  requestSample,
  requestTune0,
  requestTune1,
  songVoicesAudible,
} from './audioMixer.js';
import {
  expandCountdownEffect,
  expandFlameEffect,
  expandSeaEffect,
  expandStairsEffect,
  expandTune0,
  expandTune1,
  requestBitToIndex,
  sfxNoteToNoise,
} from './tuneFormat.js';
import { readSongDescriptor } from './musicFormat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bank0 = fs.readFileSync(path.join(ROOT, 'zelda.nes')).subarray(16, 16 + 0x4000);
const noteTable = [...bank0.subarray(0x1f00, 0x1f00 + 114)];

/** @returns {object} */
function pack() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets', 'extracted', 'audio', 'audio.json'), 'utf8'),
  );
}

// --- ROM tables are where the disassembly says they are -------------------

test('ROM label offsets match the disassembly', () => {
  /** label → [prg offset, first bytes] */
  const labels = {
    // TuneScripts0 @ Z_00.asm:144
    0x185b: [0x1c, 0x4c, 0x27, 0x5c, 0x46, 0x67, 0x07, 0x95],
    // BombSfxNotes @ Z_00.asm:400
    0x1a3d: [0x1f, 0x2f, 0x2e, 0x3f],
    // TuneScripts1 @ Z_00.asm:405
    0x1a55: [0x0c, 0x08, 0x11, 0x1c, 0x28, 0x33, 0x40, 0x62],
    // CustomEnvelopeTune1 @ Z_00.asm:509
    0x1b63: [0x95, 0x96, 0x97, 0x98],
    // SampleAddrs / SampleLengths / SampleRates @ Z_00.asm:574
    0x1bea: [0x00, 0x4c, 0x80, 0x1d, 0x20, 0x28, 0x4c],
    0x1bf1: [0x75, 0xc0, 0x40, 0x0a, 0xb0, 0x90, 0xd0],
    0x1bf8: [0x0f, 0x0f, 0x0d, 0x0f, 0x0e, 0x0f, 0x0e],
    // StairsSfxNotes @ Z_00.asm:1106
    0x1ef5: [0x0e, 0x0e, 0x4c, 0x6d, 0x8c, 0xcd],
    // CustomEnvelopeSong @ Z_00.asm:1166
    0x1f92: [0x04, 0x24, 0x24, 0x34],
    // SwordSfxNotes @ Z_00.asm:1172
    0x1fb2: [0x47, 0x67, 0x87, 0xa8, 0xb9, 0x9a, 0x8a, 0x5a, 0x9b, 0x8b],
    // ArrowSfxNotes @ Z_00.asm:1176
    0x1fbc: [0xfb, 0xf9, 0x9d, 0x6e, 0x3f],
    // FlameSfxNotes @ Z_00.asm:1179
    0x1fc1: [0x1a, 0x1a, 0x1c, 0x1d],
  };
  for (const [off, bytes] of Object.entries(labels)) {
    const at = Number(off);
    assert.deepEqual([...bank0.subarray(at, at + bytes.length)], bytes, `prg 0x${at.toString(16)}`);
  }
});

test('CustomEnvelopeSong is followed by SwordSfxNotes, so index $20 reads $47', () => {
  // ShapeSongVolume's first read is one byte past the 32-byte table.
  assert.equal(bank0[0x1f92 + 0x20], 0x47);
  assert.equal(bank0[0x1f92 + 0x20], bank0[0x1fb2]);
});

// --- request bit → script index ------------------------------------------

test('requestBitToIndex mirrors the INY/LSR/BCC bit scan', () => {
  assert.equal(requestBitToIndex(0x01), 0);
  assert.equal(requestBitToIndex(0x02), 1);
  assert.equal(requestBitToIndex(0x40), 6);
  assert.equal(requestBitToIndex(0x80), 7);
  // Lowest set bit wins when several are requested at once.
  assert.equal(requestBitToIndex(0x0c), 2);
  assert.equal(requestBitToIndex(0x00), -1);
});

// --- tune script parsing --------------------------------------------------

test('expandTune0 plays one note per frame and carries the duty byte', () => {
  // TuneScripts0[0] = $1C → "parry": 82 4A 48 4A 08 ... 00
  const events = expandTune0(bank0, 0x985b + bank0[0x185b], noteTable);
  assert.equal(events[0].note, 0x4a);
  assert.equal(events[0].duty, 0x82);
  assert.equal(events[1].note, 0x48);
  // Duty persists over notes that carry no control byte.
  assert.equal(events[1].duty, 0x82);
  for (const ev of events) assert.equal(ev.dur, 1);
  // 82 4A / 48 / 4A / 08 x6 / 00 — the control byte does not cost a frame.
  assert.equal(events.length, 9);
  // $08 indexes a zero period pair — a rest.
  assert.equal(events[3].note, 0x08);
  assert.equal(events[3].hz, 0);
});

test('expandTune1 holds each note for the length set by the control byte', () => {
  // TuneScripts1[0] = $0C → "rupee taken": 8A 5E 94 60 00
  const events = expandTune1(bank0, 0x9a55 + bank0[0x1a55], noteTable);
  assert.deepEqual(
    events.map((e) => [e.t, e.dur, e.note]),
    [
      [0, 0x0a, 0x5e],
      [0x0a, 0x14, 0x60],
    ],
  );
  assert.ok(events[1].hz > events[0].hz, 'second note is higher');
});

test('TuneScripts1 pointer $02 is "item appears" and $40 is "game over"', () => {
  const ptr = [...bank0.subarray(0x1a55, 0x1a55 + 8)];
  assert.equal(ptr[requestBitToIndex(0x02)], 0x08);
  assert.equal(ptr[requestBitToIndex(0x40)], 0x40);
  const itemAppears = expandTune1(bank0, 0x9a55 + ptr[1], noteTable);
  const gameOver = expandTune1(bank0, 0x9a55 + ptr[6], noteTable);
  // 8A 4E / 58 / 60 / 8A 5E / 94 60 / 00
  assert.equal(itemAppears.length, 5);
  // The game-over dirge is by far the longest Tune1 script.
  assert.ok(gameOver.length > 30);
  assert.ok(gameOver.at(-1).t + gameOver.at(-1).dur > 500);
});

// --- noise effect expansion ----------------------------------------------

test('sfxNoteToNoise splits the byte the way PlaySfxNote does', () => {
  assert.deepEqual(sfxNoteToNoise(0x8b), { period: 0x0b, volume: 0x8 });
  assert.deepEqual(sfxNoteToNoise(0x47), { period: 0x07, volume: 0x4 });
});

test('countdown effects walk their note table backwards', () => {
  const sword = [...bank0.subarray(0x1fb2, 0x1fb2 + 10)];
  const events = expandCountdownEffect(sword, 10);
  assert.equal(events.length, 10);
  // EffectCounter starts at $0A, so SwordSfxNotes[9] = $8B plays first.
  assert.deepEqual(
    { period: events[0].period, volume: events[0].volume },
    sfxNoteToNoise(0x8b),
  );
  assert.equal(events[1].period, sfxNoteToNoise(0x9b).period);
  // SilenceSfxIfEnded mutes the frame the counter reaches zero.
  assert.equal(events.at(-1).volume, 0);
});

test('flame effect pins the period and halves the counter', () => {
  const notes = [...bank0.subarray(0x1fc1, 0x1fc1 + 16)];
  const events = expandFlameEffect(notes, bank0[0x1fc0], 0x20);
  assert.equal(events.length, 32);
  for (const ev of events) assert.equal(ev.period, 0x0e);
  // Two frames per table entry: counter $20 and $1F both index entry 15.
  assert.equal(events[0].volume, notes[15] & 0x0f);
  assert.equal(events[1].volume, notes[14] & 0x0f);
  assert.equal(events.at(-1).volume, 0);
});

test('stairs effect repeats a 12-frame step with 6 silent frames', () => {
  const notes = [...bank0.subarray(0x1ef5, 0x1ef5 + 6)];
  const events = expandStairsEffect(notes, 0x38);
  assert.equal(events.length, 0x38);
  for (let t = 0; t < 6; t += 1) assert.equal(events[t].volume, 0, `frame ${t} silent`);
  assert.deepEqual(
    { period: events[6].period, volume: events[6].volume },
    sfxNoteToNoise(notes[5]),
  );
  // The cycle repeats every 12 frames.
  assert.equal(events[18].period, events[6].period);
  assert.equal(events[18].volume, events[6].volume);
});

test('sea effect ramps up then bleeds back to silence', () => {
  const events = expandSeaEffect(0xd0);
  assert.equal(events.length, 0xd0);
  for (const ev of events) assert.equal(ev.period, 0x03);
  // 18 frames at counter >= $BF push the $400C byte from $10 to $22, past the
  // constant-volume bit.
  assert.equal(events[17].envelope, true);
  assert.equal(events.at(-1).volume, 0);
});

// --- envelopes ------------------------------------------------------------

test('songEnvelopeVolume walks CustomEnvelopeSong backwards from $20', () => {
  const env = [...bank0.subarray(0x1f92, 0x1f92 + 33)];
  // Selector bit 7 clear → high nibble; the first frame reads the $47 spill byte.
  assert.equal(songEnvelopeVolume(env, 0x01, 0), 4);
  assert.equal(songEnvelopeVolume(env, 0x01, 1), 5);
  assert.equal(songEnvelopeVolume(env, 0x01, 4), 7);
  // Decays to silence and stays there once the offset floors at 0.
  assert.equal(songEnvelopeVolume(env, 0x01, 32), 0);
  assert.equal(songEnvelopeVolume(env, 0x01, 200), 0);
});

test('envelope selector bit 7 sustains on the low nibble instead', () => {
  const env = [...bank0.subarray(0x1f92, 0x1f92 + 33)];
  assert.equal(songEnvelopeVolume(env, 0x80, 0), 7);
  assert.equal(songEnvelopeVolume(env, 0x80, 32), 4);
  assert.equal(songEnvelopeVolume(env, 0x80, 999), 4);
  // Overworld headers select $01, the title/demo headers select $80.
  assert.equal(readSongDescriptor(bank0, 0x75).envelopeSelector, 0x01);
  assert.equal(readSongDescriptor(bank0, 0x24).envelopeSelector, 0x80);
});

test('tune1 envelope walks CustomEnvelopeTune1 backwards from $1F', () => {
  const env = [...bank0.subarray(0x1b63, 0x1b63 + 32)];
  assert.equal(tune1EnvelopeDuty(env, 0), 0x96);
  assert.equal(tune1EnvelopeVolume(env, 0), 6);
  assert.equal(tune1EnvelopeVolume(env, 9), 0x0f);
  assert.equal(tune1EnvelopeVolume(env, 31), 5);
  assert.equal(tune1EnvelopeVolume(env, 99), 5);
  // Only the flute ($10) and Link's death tune ($80) use it.
  assert.equal(tune1UsesEnvelope(0x10), true);
  assert.equal(tune1UsesEnvelope(0x80), true);
  assert.equal(tune1UsesEnvelope(0x01), false);
  assert.equal(tune1UsesEnvelope(0x40), false);
});

test('hardwareEnvelopeVolume honours the constant-volume bit', () => {
  assert.equal(hardwareEnvelopeVolume(0x9a, 0), 0x0a);
  assert.equal(hardwareEnvelopeVolume(0x9a, 100), 0x0a);
  // Bit 4 clear → the APU envelope decays from 15.
  assert.equal(hardwareEnvelopeVolume(0x82, 0), 15);
  assert.ok(hardwareEnvelopeVolume(0x86, 10) < 15);
  assert.equal(hardwareEnvelopeVolume(0x86, 1000), 0);
});

// --- DPCM -----------------------------------------------------------------

test('decodeDpcm steps the delta counter by +/-2 with clamping', () => {
  // 0xFF = eight 1 bits: climb from 0 by 2 each step.
  assert.deepEqual([...decodeDpcm([0xff], 0)], [2, 4, 6, 8, 10, 12, 14, 16]);
  // 0x00 = eight 0 bits: clamp at 0 rather than going negative.
  assert.deepEqual([...decodeDpcm([0x00], 4)], [2, 0, 0, 0, 0, 0, 0, 0]);
  // Clamp at the 7-bit ceiling.
  assert.deepEqual([...decodeDpcm([0xff], 124)], [126, 126, 126, 126, 126, 126, 126, 126]);
  // Bits are consumed LSB first.
  assert.deepEqual([...decodeDpcm([0x01], 10)], [12, 10, 8, 6, 4, 2, 0, 0]);
});

test('decodeDpcm yields one sample per bit and dpcmToFloat centres it', () => {
  const dac = decodeDpcm([0xaa, 0x55], 64);
  assert.equal(dac.length, 16);
  const pcm = dpcmToFloat(dac);
  assert.equal(pcm.length, 16);
  for (const v of pcm) assert.ok(v >= -1 && v <= 1);
  assert.equal(dpcmToFloat(Uint8Array.from([64]))[0], 0);
});

test('DMC address/length/rate registers decode like the hardware', () => {
  // ROM SampleAddrs/Lengths/Rates slot 1 (SampleRequest $01, the sword shot).
  assert.equal(dmcSampleAddress(0x00), 0xc000);
  assert.equal(dmcSampleByteLength(0x75), 1873);
  assert.equal(dmcSampleAddress(0x4c), 0xd300);
  assert.equal(dmcSampleByteLength(0xc0), 3073);
  assert.equal(DMC_RATE_CYCLES[0x0f], 54);
  assert.ok(Math.abs(dmcSampleHz(0x0f) - 33143.9) < 1);
  assert.ok(Math.abs(dmcSampleHz(0x0d) - 21306.8) < 1);
});

test('every ROM sample fits inside the extracted PcmSamples blob', () => {
  const p = pack();
  const bytes = base64ToBytes(p.samples.pcm);
  assert.equal(bytes.length, p.samples.length);
  for (const name of ['sword_shot', 'boss_hit', 'door', 'hurt']) {
    const s = p.sfx[name];
    assert.equal(s.kind, 'sample');
    assert.ok(s.pcmOffset >= 0, `${name} offset`);
    assert.ok(s.pcmOffset + s.byteLength <= bytes.length, `${name} fits`);
  }
  // $02 and $40 deliberately share a start address but differ in length/rate.
  assert.equal(p.sfx.boss_hit.pcmOffset, p.sfx.boss_roar_3.pcmOffset);
  assert.notEqual(p.sfx.boss_hit.byteLength, p.sfx.boss_roar_3.byteLength);
});

// --- noise rendering ------------------------------------------------------

test('nextNoiseLfsr never latches to zero and cycles', () => {
  let reg = 1;
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) {
    reg = nextNoiseLfsr(reg);
    assert.ok(reg !== 0);
    assert.ok(reg < 0x8000);
    seen.add(reg);
  }
  assert.ok(seen.size > 4000, 'output is not stuck in a short loop');
});

test('apuLengthCounterFrames converts $400F loads to 60 Hz frames', () => {
  // NoiseLengths $18 / $58 → indexes 3 / 11 → 2 / 10 clocks @ 120 Hz.
  assert.equal(apuLengthCounterFrames(0x18), 1);
  assert.equal(apuLengthCounterFrames(0x58), 5);
});

test('renderNoiseEvents produces silence for volume-0 frames', () => {
  const events = [
    { t: 0, dur: 1, period: 5, volume: 0 },
    { t: 1, dur: 1, period: 5, volume: 15 },
  ];
  const pcm = renderNoiseEvents(events, { sampleRate: 48000, frameHz: 60, amplitude: 1 });
  assert.equal(pcm.length, 1600);
  const firstFrame = pcm.subarray(0, 800);
  const secondFrame = pcm.subarray(800);
  assert.ok(firstFrame.every((v) => v === 0));
  assert.ok(secondFrame.some((v) => v > 0));
});

test('renderNoiseEvents scales amplitude with the volume nibble', () => {
  const loud = renderNoiseEvents([{ t: 0, dur: 4, period: 8, volume: 15 }], {
    sampleRate: 44100,
    frameHz: 60,
    amplitude: 1,
  });
  const quiet = renderNoiseEvents([{ t: 0, dur: 4, period: 8, volume: 5 }], {
    sampleRate: 44100,
    frameHz: 60,
    amplitude: 1,
  });
  assert.ok(Math.max(...loud) > Math.max(...quiet));
  assert.ok(Math.abs(Math.max(...quiet) - 5 / 15) < 1e-6);
  assert.ok(NOISE_PERIODS[8] === 202 && noiseClockHz(8) > 8000);
});

test('renderDpcm returns one float per bit', () => {
  const pcm = renderDpcm([0xff, 0x00], { initialDac: 0, amplitude: 1 });
  assert.equal(pcm.length, 16);
  assert.equal(pcm[0], (2 - 64) / 64);
});

// --- channel arbitration --------------------------------------------------

test('a Tune1 cue mutes the song melody, a Tune0 cue mutes the harmony', () => {
  let state = createChannelState();
  assert.deepEqual(songVoicesAudible(state), {
    sq1: true,
    sq2: true,
    triangle: true,
    noise: true,
  });
  state = requestTune1(state, 0x01).state;
  assert.equal(songVoicesAudible(state).sq2, false);
  assert.equal(songVoicesAudible(state).sq1, true);
  state = requestTune0(state, 0x02).state;
  assert.equal(songVoicesAudible(state).sq1, false);
  state = endCue(endCue(state, 'tune0'), 'tune1');
  assert.equal(songVoicesAudible(state).sq1, true);
  assert.equal(songVoicesAudible(state).sq2, true);
});

test('the low-health warning is dropped while square 1 is busy', () => {
  const idle = createChannelState();
  assert.equal(requestTune0(idle, 0x40).accepted, true);
  const busy = requestTune0(idle, 0x08).state;
  const blocked = requestTune0(busy, 0x40);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.state.tune0, 0x08, 'the playing cue is untouched');
  // Any other cue still preempts.
  assert.equal(requestTune0(busy, 0x01).accepted, true);
  assert.equal(requestTune0(busy, 0x01).state.tune0, 0x01);
});

test('Tune0 $80 only silences the song', () => {
  const playing = { ...createChannelState(), songActive: true, tune0: 0x08 };
  const d = requestTune0(playing, 0x80);
  assert.equal(d.accepted, false);
  assert.equal(d.silenceSong, true);
  assert.equal(d.state.songActive, false);
  assert.equal(d.state.tune0, 0x08);
});

test("Tune1 $80 (Link's death) silences the song before playing", () => {
  const playing = { ...createChannelState(), songActive: true };
  const d = requestTune1(playing, 0x80);
  assert.equal(d.accepted, true);
  assert.equal(d.silenceSong, true);
  assert.equal(d.state.songActive, false);
  assert.equal(d.state.tune1, 0x80);
  // A normal cue leaves the song running.
  assert.equal(requestTune1(playing, 0x04).silenceSong, false);
  assert.equal(requestTune1(playing, 0x04).state.songActive, true);
});

test('EffectRequest $80 clears the sample and Tune1', () => {
  let state = requestTune1(createChannelState(), 0x20).state;
  state = requestSample(state, 0x02).state;
  assert.equal(state.sample, 0x02);
  const d = requestEffect(state, 0x80);
  assert.equal(d.accepted, false);
  assert.equal(d.state.sample, 0);
  assert.equal(d.state.tune1, 0);
  // Normal effects just claim the noise channel.
  assert.equal(requestEffect(state, 0x08).state.effect, 0x08);
});

test('a background sample loops and starts the DAC at $7F', () => {
  const one = requestSample(createChannelState(), 0x10);
  assert.equal(one.loop, false);
  assert.equal(one.initialDac, 0x00);
  assert.equal(one.state.sample, 0x10);
  const bg = requestSample(createChannelState(), 0x90);
  assert.equal(bg.loop, true);
  assert.equal(bg.initialDac, 0x7f);
  assert.equal(bg.state.sample, 0x10);
});

test('firing an arrow cancels a lone "heart taken" request', () => {
  assert.equal(arrowCancelsTune0Request(0x10), 0);
  assert.equal(arrowCancelsTune0Request(0x00), 0);
  assert.equal(arrowCancelsTune0Request(0x18), 0x18);
  assert.equal(arrowCancelsTune0Request(0x40), 0x40);
});

// --- extracted pack shape -------------------------------------------------

test('audio.json exposes every cue the game asks for by name', () => {
  const p = pack();
  const required = [
    'sword',
    'hurt',
    'secret',
    'stairs',
    'boss_defeat',
    'rupee',
    'key',
    'item_taken',
    'item_appears',
    'game_over',
    'enemy_die',
    'shield',
    'low_health',
    'flute',
    'monster_die',
    'link_dying',
  ];
  for (const name of required) {
    assert.ok(p.sfx[name], `missing sfx ${name}`);
    assert.ok(p.sfx[name].kind, `${name} has no kind`);
  }
  assert.equal(p.sfx.item_appears.kind, 'tune1');
  assert.equal(p.sfx.item_appears.bit, 0x02);
  assert.equal(p.sfx.game_over.kind, 'tune1');
  assert.equal(p.sfx.game_over.bit, 0x40);
  assert.equal(p.sfx.game_over.repeat, true);
  assert.equal(p.sfx.hurt.kind, 'sample');
  assert.equal(p.sfx.sword.kind, 'effect');
  assert.equal(p.sfx.key.kind, 'tune0');
});

test('title and ending playlists resolve to real song headers', () => {
  const p = pack();
  for (const name of ['title', 'ending', 'overworld', 'underworld']) {
    const pl = p.playlists[name];
    assert.ok(pl, `missing playlist ${name}`);
    assert.equal(pl.loop, true);
    for (const key of pl.parts) assert.ok(p.songs[key], `${name} part ${key} not extracted`);
    assert.ok(pl.loopStart < pl.parts.length);
  }
  // SongHeaderDemo0 is eight consecutive headers starting at SongTable+$24.
  assert.equal(p.playlists.title.parts[0], '0x24');
  assert.equal(p.playlists.title.parts.length, 10);
  // SongHeaderEnding0 starts at $BD; the ROM restarts the loop at parts[3].
  assert.equal(p.playlists.ending.parts[0], '0xbd');
  assert.equal(p.playlists.ending.loopStart, 3);
  // The overworld intro phrase plays once, then the loop starts at $7D.
  assert.equal(p.playlists.overworld.loopStart, 1);
});

test('no cue is left as a hand-tuned guess', () => {
  const p = pack();
  for (const [name, sfx] of Object.entries(p.sfx)) {
    assert.ok(['tune0', 'tune1', 'effect', 'sample'].includes(sfx.kind), `${name} kind`);
    // `sea` is the one cue with no note table: @PlaySeaSfx generates it.
    if (name !== 'sea') assert.ok(sfx.cpu > 0, `${name} has no ROM address`);
    if (sfx.kind === 'sample') continue;
    assert.ok(sfx.events.length > 0, `${name} has no events`);
  }
});
