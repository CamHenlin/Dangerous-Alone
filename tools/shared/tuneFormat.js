/**
 * Zelda 1 Bank-0 "tune" and "effect" sequence formats.
 *
 * These are the three cue engines that run alongside `DriveSong`
 * (see tools/shared/musicFormat.js for the song format):
 *
 *   DriveTune0   @ Z_00.asm:163  — square 1 ($4000), scripts in TuneScripts0 ($985B)
 *   DriveTune1   @ Z_00.asm:423  — square 2 ($4004), scripts in TuneScripts1 ($9A55)
 *   DriveEffect  @ Z_00.asm:304  — noise ($400C/$400E), five note tables
 *
 * Each engine's request byte is a bit mask; the index of the lowest set bit
 * (1-based) selects the script pointer / sample slot.
 */

import { cpuToPrg, noteToHz } from './musicFormat.js';

/**
 * ROM `@ChangeTune` (both DriveTune0 and DriveTune1): `INY / LSR / BCC` walks
 * up from bit 0, so the pointer index is the lowest set bit.
 * @param {number} requestBit
 * @returns {number} 0-based pointer-table index, or -1 when no bit is set
 */
export function requestBitToIndex(requestBit) {
  for (let i = 0; i < 8; i += 1) {
    if ((requestBit >> i) & 1) return i;
  }
  return -1;
}

/**
 * Expand a Tune0 script (ROM `DriveTune0` @ Z_00.asm:194 `@KeepPlaying`).
 *
 * One script byte is consumed per frame; a byte with bit 7 set is a
 * duty/volume value for $4000 and is followed by the note byte it applies to.
 * Every note therefore lasts exactly one frame. $00 ends the tune.
 * @param {Uint8Array | Buffer} bank0
 * @param {number} cpuStart
 * @param {Uint8Array | number[]} noteTable
 * @returns {{ t: number, dur: number, hz: number, note: number, duty: number }[]}
 */
export function expandTune0(bank0, cpuStart, noteTable) {
  let off = cpuToPrg(cpuStart);
  let t = 0;
  // $4000 keeps its last value until a control byte rewrites it.
  let duty = 0x90;
  /** @type {{ t: number, dur: number, hz: number, note: number, duty: number }[]} */
  const events = [];
  let guard = 0;
  while (guard++ < 256) {
    let byte = bank0[off++];
    if (byte === 0x00 || byte === undefined) break;
    if (byte & 0x80) {
      duty = byte;
      byte = bank0[off++];
      if (byte === undefined) break;
    }
    events.push({ t, dur: 1, hz: noteToHz(noteTable, byte), note: byte, duty });
    t += 1;
  }
  return events;
}

/**
 * Expand a Tune1 script (ROM `DriveTune1` @ Z_00.asm:448 `@KeepPlaying`).
 *
 * A byte with bit 7 set sets the note length in frames (`AND #$7F`) and is
 * followed by the note it applies to; the length persists across later notes.
 * $00 ends the tune (the game-over tune $40 restarts instead — see
 * Z_00.asm:459).
 * @param {Uint8Array | Buffer} bank0
 * @param {number} cpuStart
 * @param {Uint8Array | number[]} noteTable
 * @returns {{ t: number, dur: number, hz: number, note: number }[]}
 */
export function expandTune1(bank0, cpuStart, noteTable) {
  let off = cpuToPrg(cpuStart);
  let t = 0;
  let dur = 1;
  /** @type {{ t: number, dur: number, hz: number, note: number }[]} */
  const events = [];
  let guard = 0;
  while (guard++ < 256) {
    let byte = bank0[off++];
    if (byte === 0x00 || byte === undefined) break;
    if (byte & 0x80) {
      dur = byte & 0x7f;
      byte = bank0[off++];
      if (byte === undefined) break;
    }
    events.push({ t, dur, hz: noteToHz(noteTable, byte), note: byte });
    t += dur;
  }
  return events;
}

/**
 * ROM `PlaySfxNote` @ Z_00.asm:268 — the low nibble is the $400E period index
 * and the high nibble becomes the $400C constant volume.
 * @param {number} byte
 */
export function sfxNoteToNoise(byte) {
  return { period: byte & 0x0f, volume: (byte >> 4) & 0x0f };
}

/**
 * The engine writes $F0 to $400C on the frame `EffectCounter` reaches zero
 * (ROM `SilenceSfxIfEnded` @ Z_00.asm:285), overwriting whatever the last note
 * just wrote. Model that by muting the final frame.
 * @param {{ volume: number }[]} events
 */
function silenceFinalFrame(events) {
  const last = events[events.length - 1];
  if (last) last.volume = 0;
  return events;
}

/**
 * Sword ($01), arrow ($02) and bomb ($10) all share the same shape: the note
 * table is indexed by `EffectCounter` counting down (`LDA <Table>-1, Y`), so
 * the table plays back-to-front, one entry per frame.
 * @param {Uint8Array | number[]} notes
 * @param {number} frames initial EffectCounter
 * @returns {{ t: number, dur: number, period: number, volume: number }[]}
 */
export function expandCountdownEffect(notes, frames) {
  /** @type {{ t: number, dur: number, period: number, volume: number }[]} */
  const events = [];
  for (let t = 0; t < frames; t += 1) {
    const byte = notes[frames - t - 1];
    // `BNE PlaySfxNote` — a zero entry would fall through to another routine.
    if (!byte) break;
    events.push({ t, dur: 1, ...sfxNoteToNoise(byte) });
  }
  return silenceFinalFrame(events);
}

/**
 * Flame ($04) — ROM `@ContinueFlameSfx` @ Z_00.asm:351. The period is pinned
 * to $0E, the counter is halved before indexing (so each entry lasts two
 * frames), and the table byte goes straight to $400C, meaning its *low* nibble
 * is the volume.
 * @param {Uint8Array | number[]} notes 16-byte FlameSfxNotes
 * @param {number} precedingByte byte at FlameSfxNotes-1, read on the last frame
 * @param {number} [frames] initial EffectCounter ($20)
 */
export function expandFlameEffect(notes, precedingByte, frames = 0x20) {
  /** @type {{ t: number, dur: number, period: number, volume: number }[]} */
  const events = [];
  for (let t = 0; t < frames; t += 1) {
    const y = (frames - t) >> 1;
    const byte = y === 0 ? precedingByte : notes[y - 1];
    events.push({ t, dur: 1, period: 0x0e, volume: (byte ?? 0) & 0x0f });
  }
  return silenceFinalFrame(events);
}

/**
 * Stairs ($08) — ROM `PlayStairsSfx` @ Z_00.asm:249. A 12-frame step cycle
 * repeats for the whole $38-frame effect: the first six frames are silent
 * (volume byte $10) and the last six walk StairsSfxNotes back-to-front.
 * @param {Uint8Array | number[]} notes 6-byte StairsSfxNotes
 * @param {number} [frames] initial EffectCounter ($38)
 */
export function expandStairsEffect(notes, frames = 0x38) {
  /** @type {{ t: number, dur: number, period: number, volume: number }[]} */
  const events = [];
  let period = 0;
  for (let t = 0; t < frames; t += 1) {
    const y = 12 - (t % 12);
    if (y >= 7) {
      // `LDA #$10` straight to $400C: constant volume 0, $400E untouched.
      events.push({ t, dur: 1, period, volume: 0 });
      continue;
    }
    const noise = sfxNoteToNoise(notes[y - 1] ?? 0);
    period = noise.period;
    events.push({ t, dur: 1, ...noise });
  }
  return silenceFinalFrame(events);
}

/**
 * Sea ($20) — ROM `@PlaySeaSfx` @ Z_00.asm:360. There is no note table: the
 * raw $400C byte ramps up from $10 while the counter is >= $BF, then bleeds
 * back down one step every 8th frame. Period is pinned to $03.
 *
 * The ramp overshoots $1F, so for most of the effect bit 4 is clear and the
 * hardware runs its own looping envelope instead of a constant volume; those
 * frames are flagged with `envelope`.
 * @param {number} [frames] initial SeaSfxCounter ($D0)
 */
export function expandSeaEffect(frames = 0xd0) {
  /** @type {{ t: number, dur: number, period: number, volume: number, envelope?: boolean }[]} */
  const events = [];
  let volByte = 0x10;
  for (let t = 0; t < frames; t += 1) {
    const counter = frames - t;
    if (counter >= 0xbf) {
      volByte = (volByte + 1) & 0xff;
    } else if ((counter & 0x07) === 0x07 && volByte !== 0x10) {
      volByte -= 1;
    }
    const constant = (volByte & 0x10) !== 0;
    const ev = { t, dur: 1, period: 0x03, volume: volByte & 0x0f };
    if (!constant) ev.envelope = true;
    events.push(ev);
  }
  return silenceFinalFrame(events);
}

/**
 * @param {{ t: number, dur: number }[]} events
 */
export function eventsDurationFrames(events) {
  let max = 0;
  for (const e of events) max = Math.max(max, e.t + e.dur);
  return max;
}
