/**
 * NES APU hardware tables + the decoders the Zelda 1 audio engine needs.
 *
 * ROM references (reference/zelda1-disassembly/src/Z_00.asm):
 *   DriveSample         @ 515   — programs $4010/$4011/$4012/$4013
 *   SampleAddrs         @ 574   ($9BEA)
 *   SampleLengths       @ 577   ($9BF1)
 *   SampleRates         @ 580   ($9BF8)
 *   CustomEnvelopeTune1 @ 509   ($9B63, 32 bytes)
 *   ShapeSongVolume     @ 1149
 *   CustomEnvelopeSong  @ 1166  ($9F92, 32 bytes)
 */

/** NTSC CPU clock. */
export const NES_CPU_HZ = 1789773;

/** $400E period index → LFSR clock divider (NTSC). */
export const NOISE_PERIODS = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
];

/**
 * APU length-counter lookup (nesdev). Index is bits 7–3 of a $4003/$4007/
 * $400B/$400F write. Values are clocks at 120 Hz (two per NTSC frame).
 */
export const APU_LENGTH_CLOCKS = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
];

/** $4010 rate index → CPU cycles per DPCM output bit (NTSC). */
export const DMC_RATE_CYCLES = [
  428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54,
];

/**
 * How many 60 Hz frames a length-counter load stays audible.
 * @param {number} lengthByte value written to $400F (LLLL L---)
 */
export function apuLengthCounterFrames(lengthByte) {
  const clocks = APU_LENGTH_CLOCKS[(lengthByte >> 3) & 0x1f] ?? 0;
  return Math.ceil(clocks / 2);
}

/**
 * Rate at which the noise shift register is clocked.
 * @param {number} periodIndex low nibble written to $400E
 */
export function noiseClockHz(periodIndex) {
  const p = NOISE_PERIODS[periodIndex & 0x0f];
  return NES_CPU_HZ / p;
}

/**
 * @param {number} rateIndex low nibble written to $4010
 */
export function dmcSampleHz(rateIndex) {
  return NES_CPU_HZ / DMC_RATE_CYCLES[rateIndex & 0x0f];
}

/**
 * ROM `STA DmcAddress_4012`: hardware maps the byte to $C000 + n*64.
 * @param {number} addrByte
 */
export function dmcSampleAddress(addrByte) {
  return 0xc000 + addrByte * 64;
}

/**
 * ROM `STA DmcLength_4013`: hardware plays n*16 + 1 bytes.
 * @param {number} lengthByte
 */
export function dmcSampleByteLength(lengthByte) {
  return lengthByte * 16 + 1;
}

/**
 * Decode a DPCM bitstream into 7-bit DAC levels.
 *
 * Each bit steps the delta counter by +/-2, clamped to 0..127; bits are
 * consumed LSB-first within a byte.
 * @param {Uint8Array | number[]} bytes
 * @param {number} [initialDac] value written to $4011 before playback ($00 or $7F)
 * @returns {Uint8Array} one DAC level per input bit
 */
export function decodeDpcm(bytes, initialDac = 0) {
  const out = new Uint8Array(bytes.length * 8);
  let dac = Math.min(127, Math.max(0, initialDac | 0));
  let i = 0;
  for (const byte of bytes) {
    for (let bit = 0; bit < 8; bit += 1) {
      if ((byte >> bit) & 1) {
        if (dac <= 125) dac += 2;
      } else if (dac >= 2) {
        dac -= 2;
      }
      out[i] = dac;
      i += 1;
    }
  }
  return out;
}

/**
 * Convert 7-bit DAC levels to normalized float PCM centred on zero.
 * @param {Uint8Array} dac
 * @returns {Float32Array}
 */
export function dpcmToFloat(dac) {
  const out = new Float32Array(dac.length);
  for (let i = 0; i < dac.length; i += 1) out[i] = (dac[i] - 64) / 64;
  return out;
}

/** ROM `PrepareCustomSongEnvelope` @ Z_00.asm:1136 loads offset $20. */
export const SONG_ENVELOPE_START = 0x20;

/** ROM `DriveTune1` @ Z_00.asm:487 loads CustomEnvelopeOffsetTune1 = $1F. */
export const TUNE1_ENVELOPE_START = 0x1f;

/**
 * ROM `ShapeSongVolume` @ Z_00.asm:1149.
 *
 * The offset is loaded with $20 when a note starts and decremented once per
 * frame down to 0 (the value *before* the decrement is the one used), so the
 * table is walked backwards: attack, sustain, then decay to the floor.
 * Envelope selector bit 7 picks the low nibble (a sustaining voice), otherwise
 * the high nibble (which decays to silence).
 *
 * `envTable` must be 33 bytes: the ROM's first read is at index $20, one past
 * the 32-byte CustomEnvelopeSong table.
 * @param {Uint8Array | number[]} envTable
 * @param {number} selector SongTable[6] (SongEnvelopeSelector)
 * @param {number} frame frames elapsed since the note started
 * @returns {number} volume 0..15
 */
export function songEnvelopeVolume(envTable, selector, frame) {
  const idx = Math.max(0, SONG_ENVELOPE_START - Math.max(0, frame | 0));
  const byte = envTable[idx] ?? 0;
  const low = byte & 0x0f;
  if ((selector & 0x80) !== 0 && low !== 0) return low;
  return byte >> 4;
}

/**
 * ROM `DriveTune1` @ Z_00.asm:490 (`@CheckVibrate`) — the duty/volume byte
 * written to $4004, walked backwards from index $1F.
 * @param {Uint8Array | number[]} envTable 32-byte CustomEnvelopeTune1
 * @param {number} frame frames elapsed since the note started
 */
export function tune1EnvelopeDuty(envTable, frame) {
  const idx = Math.max(0, TUNE1_ENVELOPE_START - Math.max(0, frame | 0));
  return envTable[idx] ?? 0;
}

/**
 * @param {Uint8Array | number[]} envTable
 * @param {number} frame
 * @returns {number} volume 0..15
 */
export function tune1EnvelopeVolume(envTable, frame) {
  return tune1EnvelopeDuty(envTable, frame) & 0x0f;
}

/**
 * ROM `@CheckVibrate` @ Z_00.asm:492 — only the flute ($10) and Link's death
 * tune ($80) run the custom envelope and pitch vibrato.
 * @param {number} tuneBit
 */
export function tune1UsesEnvelope(tuneBit) {
  return (tuneBit & 0x90) !== 0;
}

/**
 * Split a $4000/$4004/$400C duty-volume byte.
 * @param {number} byte
 */
export function dutyVolume(byte) {
  return {
    duty: (byte >> 6) & 0x03,
    constant: (byte & 0x10) !== 0,
    halt: (byte & 0x20) !== 0,
    volume: byte & 0x0f,
  };
}

/** The APU envelope divider runs off the 240 Hz quarter-frame clock. */
export const QUARTER_FRAMES_PER_FRAME = 240 / 60.0988;

/**
 * Volume of a channel `frame` frames after its length counter was reloaded.
 *
 * With bit 4 set the byte's low nibble is the volume outright. With it clear
 * the hardware envelope takes over: it starts at 15 and steps down once every
 * (period + 1) quarter-frames, looping instead of holding at 0 if bit 5 is set.
 * @param {number} dutyByte value written to $4000/$4004/$400C
 * @param {number} frame
 * @returns {number} volume 0..15
 */
export function hardwareEnvelopeVolume(dutyByte, frame) {
  if ((dutyByte & 0x10) !== 0) return dutyByte & 0x0f;
  const period = (dutyByte & 0x0f) + 1;
  const steps = Math.floor((Math.max(0, frame) * QUARTER_FRAMES_PER_FRAME) / period);
  if ((dutyByte & 0x20) !== 0) return 15 - (steps % 16);
  return Math.max(0, 15 - steps);
}
