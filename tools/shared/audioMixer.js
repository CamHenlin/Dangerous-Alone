/**
 * Channel arbitration between the song engine and the cue engines.
 *
 * The NES has one square-1, one square-2, one triangle and one noise channel,
 * and Zelda's `DriveAudio` (Z_00.asm:106) funnels five request bytes per frame
 * into that fixed set. Cues do not mix with the song — they take the channel
 * over for as long as they run:
 *
 *   Tune0 owns square 1 ($4000). `@PlaySq0` / `@ApplySq0Effects`
 *   (Z_00.asm:904 and 920) skip the song's square-1 note whenever Tune0 is
 *   playing. Our extracted songs call that voice `sq1`.
 *
 *   Tune1 owns square 2 ($4004). `PlayNote` / `ApplySq1Effects`
 *   (Z_00.asm:848 and 866) skip the song's melody the same way. Our extracted
 *   songs call that voice `sq2`.
 *
 * State is a plain object so callers can hold it wherever they like; every
 * function here is pure and returns the next state plus what the caller has to
 * do about it.
 */

/**
 * @typedef {object} ChannelState
 * @property {number} tune0 active Tune0 bit, 0 when idle
 * @property {number} tune1 active Tune1 bit, 0 when idle
 * @property {number} effect active EffectRequest bit, 0 when idle
 * @property {number} sample active SampleRequest bit, 0 when idle
 * @property {boolean} songActive
 */

/**
 * @typedef {object} ChannelDecision
 * @property {ChannelState} state
 * @property {boolean} accepted the cue starts (or restarts) this frame
 * @property {boolean} silenceSong the song engine must stop
 */

/** @returns {ChannelState} */
export function createChannelState() {
  return { tune0: 0, tune1: 0, effect: 0, sample: 0, songActive: false };
}

/**
 * @param {ChannelState} state
 * @param {Partial<ChannelState>} patch
 * @param {boolean} accepted
 * @param {boolean} silenceSong
 * @returns {ChannelDecision}
 */
function decide(state, patch, accepted, silenceSong) {
  return { state: { ...state, ...patch }, accepted, silenceSong };
}

/**
 * ROM `DriveTune0` @ Z_00.asm:163.
 *
 * $80 is not a tune: it only silences the song. $40 (the low-health warning)
 * is dropped unless square 1 is free, which is what stops the warning from
 * chopping up every other cue.
 * @param {ChannelState} state
 * @param {number} bit Tune0Request
 * @returns {ChannelDecision}
 */
export function requestTune0(state, bit) {
  if (bit & 0x80) return decide(state, { songActive: false }, false, true);
  if (!bit) return decide(state, {}, false, false);
  if (bit === 0x40 && state.tune0 !== 0) return decide(state, {}, false, false);
  return decide(state, { tune0: bit }, true, false);
}

/**
 * ROM `DriveTune1` @ Z_00.asm:423.
 *
 * $80 (Link's death tune) calls `SilenceSong` first, then plays as tune $80.
 * @param {ChannelState} state
 * @param {number} bit Tune1Request
 * @returns {ChannelDecision}
 */
export function requestTune1(state, bit) {
  if (!bit) return decide(state, {}, false, false);
  if (bit & 0x80) return decide(state, { tune1: 0x80, songActive: false }, true, true);
  return decide(state, { tune1: bit }, true, false);
}

/**
 * ROM `DriveEffect` @ Z_00.asm:304. $80 jumps to `SilenceSample`
 * (Z_00.asm:223), which clears the sample *and* Tune1.
 * @param {ChannelState} state
 * @param {number} bit EffectRequest
 * @returns {ChannelDecision}
 */
export function requestEffect(state, bit) {
  if (!bit) return decide(state, {}, false, false);
  if (bit & 0x80) return decide(state, { sample: 0, tune1: 0 }, false, false);
  return decide(state, { effect: bit }, true, false);
}

/**
 * ROM `DriveSample` @ Z_00.asm:515. Bit 7 marks a looping "background" sample
 * (`BackgroundSample`) and starts the DAC at $7F instead of $00.
 * @param {ChannelState} state
 * @param {number} bit SampleRequest
 * @returns {ChannelDecision & { loop: boolean, initialDac: number }}
 */
export function requestSample(state, bit) {
  if (!bit) return { ...decide(state, {}, false, false), loop: false, initialDac: 0 };
  const loop = (bit & 0x80) !== 0;
  const slot = bit & 0x7f;
  return {
    ...decide(state, { sample: slot }, true, false),
    loop,
    initialDac: loop ? 0x7f : 0x00,
  };
}

/**
 * ROM `PlayArrowSfx` @ Z_00.asm:233 — firing an arrow cancels a pending
 * "heart taken" ($10) Tune0 request, but only if no other bit is set.
 * @param {number} pendingTune0Request
 */
export function arrowCancelsTune0Request(pendingTune0Request) {
  const rest = pendingTune0Request & 0xef;
  return rest !== 0 ? pendingTune0Request : 0;
}

/**
 * Which of a song's four voices may sound this frame.
 *
 * The two square voices are gated by the explicit `LDX Tune0 / LDX Tune1`
 * checks in `DriveSong`. Noise has no such check: `DriveEffect` runs first and
 * rewrites $400C every frame, while the song only touches noise at a note
 * boundary, so an active effect drowns the song's percussion out anyway.
 * @param {ChannelState} state
 * @returns {{ sq1: boolean, sq2: boolean, triangle: boolean, noise: boolean }}
 */
export function songVoicesAudible(state) {
  return {
    sq1: state.tune0 === 0,
    sq2: state.tune1 === 0,
    triangle: true,
    noise: state.effect === 0,
  };
}

/**
 * Mark a cue as finished so the song's voice comes back.
 * @param {ChannelState} state
 * @param {'tune0'|'tune1'|'effect'|'sample'} channel
 * @returns {ChannelState}
 */
export function endCue(state, channel) {
  return { ...state, [channel]: 0 };
}
