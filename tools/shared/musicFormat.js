/**
 * Zelda 1 Bank-0 music / SFX sequence format (Computer Archeology).
 *
 * Song descriptor (8 bytes @ 8D60+offset):
 *   [0] delay-set base offset into NoteDelaySet ($00/$08/$10/$18/$20)
 *   [1..2] voiceA CPU pointer (LE)
 *   [3] offset C from A
 *   [4] offset B from A
 *   [5] offset D from A (0 = none)
 *   [6..7] reverb flags
 *
 * Voice script: $00 end; bit7 set → choose duration index (low 3 bits);
 * otherwise note byte (even offset into NoteTable). $08 = rest in table.
 */

export const NES_CLOCK = 1789773;
/** Music engine advances once per NTSC frame. */
export const FRAME_HZ = 60.0988;

/**
 * @param {number} period12 APU timer period
 */
export function periodToHz(period12) {
  if (!period12 || period12 <= 0) return 0;
  return NES_CLOCK / (16 * (period12 + 1));
}

/**
 * @param {Uint8Array | number[]} noteTable
 * @param {number} noteByte
 */
export function noteToHz(noteTable, noteByte) {
  const idx = noteByte & 0xfe;
  if (idx + 1 >= noteTable.length) return 0;
  const period = (noteTable[idx] << 8) | noteTable[idx + 1];
  return periodToHz(period);
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {number} cpuAddr
 */
export function cpuToPrg(cpuAddr) {
  return cpuAddr - 0x8000;
}

/**
 * @param {Uint8Array | Buffer} bank0
 * @param {number} descOffset offset byte from song pointer table (e.g. $7D)
 */
export function readSongDescriptor(bank0, descOffset) {
  const base = 0x0d60 + descOffset;
  const b0 = bank0[base];
  const ptrLo = bank0[base + 1];
  const ptrHi = bank0[base + 2];
  const voiceA = ptrLo | (ptrHi << 8);
  const offC = bank0[base + 3];
  const offB = bank0[base + 4];
  const offD = bank0[base + 5];
  return {
    descOffset,
    /** Byte added to duration index (0–7) when indexing NoteDelaySet @ $9FD1. */
    delaySetBase: b0,
    delaySet: b0 >> 3,
    voiceA,
    voiceB: offB ? voiceA + offB : 0,
    voiceC: offC ? voiceA + offC : 0,
    voiceD: offD ? voiceA + offD : 0,
    /** SongTable[6], stored to SongEnvelopeSelector; bit 7 picks the sustaining envelope. */
    envelopeSelector: bank0[base + 6],
    flags6: bank0[base + 6],
    flags7: bank0[base + 7],
  };
}

/**
 * Expand one voice script into timed events.
 * @param {Uint8Array | Buffer} bank0
 * @param {number} cpuStart
 * @param {number[]} delaySet 8 durations in frames
 * @param {'pulse'|'triangle'|'noise'} channel
 * @param {Uint8Array | number[]} noteTable
 * @returns {{ t: number, dur: number, hz: number, note: number }[]}
 */
export function expandVoice(bank0, cpuStart, delaySet, channel, noteTable) {
  if (!cpuStart) return [];
  let off = cpuToPrg(cpuStart);
  let t = 0;
  let dur = delaySet[1] ?? 10;
  /** @type {{ t: number, dur: number, hz: number, note: number }[]} */
  const events = [];
  let guard = 0;
  while (guard++ < 2000) {
    const byte = bank0[off++];
    if (byte === 0x00 || byte === undefined) break;
    if (byte & 0x80) {
      if (channel === 'noise') {
        // Drum-style: each high-bit byte is often a hit using delay index.
        const d = delaySet[byte & 0x07] ?? 6;
        events.push({ t, dur: d, hz: 0, note: byte });
        t += d;
      } else {
        dur = delaySet[byte & 0x07] ?? dur;
      }
      continue;
    }
    const hz = channel === 'noise' ? 0 : noteToHz(noteTable, byte);
    events.push({ t, dur, hz, note: byte });
    t += dur;
  }
  return events;
}

/**
 * @param {object} desc from readSongDescriptor
 * @param {Uint8Array | Buffer} bank0
 * @param {number[][]} delaySets
 * @param {Uint8Array | number[]} noteTable
 */
export function expandSong(desc, bank0, delaySets, noteTable) {
  const delaySet = delaySets[desc.delaySet] ?? delaySets[0];
  return {
    descOffset: desc.descOffset,
    delaySet: desc.delaySet,
    envelopeSelector: desc.envelopeSelector,
    durationFrames: 0, // filled below
    channels: {
      // Engine plays voice A on Square2 (melody) and B on Square1 (harmony).
      sq2: expandVoice(bank0, desc.voiceA, delaySet, 'pulse', noteTable),
      sq1: expandVoice(bank0, desc.voiceB, delaySet, 'pulse', noteTable),
      triangle: expandVoice(bank0, desc.voiceC, delaySet, 'triangle', noteTable),
      noise: expandVoice(bank0, desc.voiceD, delaySet, 'noise', noteTable),
    },
  };
}

/**
 * Patch durationFrames from voice A (sq2) end — NES DriveSong ends the tune
 * when script offset 0 hits $00. Harmony/bass scripts often continue into the
 * next song's data (item $67 bleeds into overworld); those notes must not play.
 * @param {ReturnType<typeof expandSong>} song
 */
export function finalizeSongDuration(song) {
  let max = 0;
  for (const e of song.channels.sq2 ?? []) {
    max = Math.max(max, e.t + e.dur);
  }
  // Fallback for descriptors with no voice A (shouldn't happen for playlists).
  if (!max) {
    for (const evs of Object.values(song.channels)) {
      for (const e of evs) max = Math.max(max, e.t + e.dur);
    }
  }
  song.durationFrames = max;
  return song;
}

/**
 * @param {number[]} partOffsets descriptor offsets
 * @param {Map<number, object>} songsByOffset
 */
export function playlistDuration(partOffsets, songsByOffset) {
  let total = 0;
  for (const off of partOffsets) {
    total += songsByOffset.get(off)?.durationFrames ?? 0;
  }
  return total;
}
