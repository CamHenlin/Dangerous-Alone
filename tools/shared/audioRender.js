/**
 * Waveform rendering for the two APU channels that can't be faked with an
 * oscillator: noise ($400C/$400E) and DPCM ($4010-$4013).
 *
 * Kept out of game/src/play/audio.js so it can be unit tested — nothing here
 * touches WebAudio, it just fills Float32Arrays.
 */

import { NES_CPU_HZ, NOISE_PERIODS, decodeDpcm, dpcmToFloat } from './audioTables.js';

/**
 * One step of the APU's 15-bit noise shift register in mode 0 (bit 1 feedback).
 * @param {number} reg
 */
export function nextNoiseLfsr(reg) {
  const feedback = (reg ^ (reg >> 1)) & 1;
  return (reg >>> 1) | (feedback << 14);
}

/**
 * Render per-frame noise events (period index + volume) into PCM.
 * @param {{ t: number, dur: number, period: number, volume: number }[]} events
 * @param {object} opts
 * @param {number} opts.sampleRate output sample rate
 * @param {number} opts.frameHz NES frame rate the events are timed against
 * @param {number} [opts.amplitude] peak amplitude for volume 15
 * @returns {Float32Array}
 */
export function renderNoiseEvents(events, { sampleRate, frameHz, amplitude = 0.5 }) {
  let frames = 0;
  for (const e of events) frames = Math.max(frames, e.t + e.dur);
  const total = Math.ceil((frames / frameHz) * sampleRate);
  const out = new Float32Array(Math.max(1, total));
  if (!events.length) return out;

  /** Volume/period lookup per frame, so gaps between events fall silent. */
  const byFrame = new Int16Array(frames * 2);
  for (const e of events) {
    for (let f = e.t; f < e.t + e.dur && f < frames; f += 1) {
      byFrame[f * 2] = e.period & 0x0f;
      byFrame[f * 2 + 1] = e.volume & 0x0f;
    }
  }

  const samplesPerFrame = sampleRate / frameHz;
  const cyclesPerSample = NES_CPU_HZ / sampleRate;
  let reg = 1;
  let acc = 0;
  for (let i = 0; i < out.length; i += 1) {
    const frame = Math.min(frames - 1, Math.floor(i / samplesPerFrame));
    const period = NOISE_PERIODS[byFrame[frame * 2]];
    const volume = byFrame[frame * 2 + 1];
    acc += cyclesPerSample;
    while (acc >= period) {
      acc -= period;
      reg = nextNoiseLfsr(reg);
    }
    // The channel is silenced while shift-register bit 0 is set.
    out[i] = (reg & 1) === 0 ? (volume / 15) * amplitude : 0;
  }
  return out;
}

/**
 * @param {Uint8Array | number[]} bytes DPCM bitstream
 * @param {object} opts
 * @param {number} [opts.initialDac] $4011 value written before playback
 * @param {number} [opts.amplitude]
 * @returns {Float32Array}
 */
export function renderDpcm(bytes, { initialDac = 0, amplitude = 0.9 } = {}) {
  const pcm = dpcmToFloat(decodeDpcm(bytes, initialDac));
  if (amplitude !== 1) {
    for (let i = 0; i < pcm.length; i += 1) pcm[i] *= amplitude;
  }
  return pcm;
}

/**
 * Decode a base64 payload without assuming Buffer or atob.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
