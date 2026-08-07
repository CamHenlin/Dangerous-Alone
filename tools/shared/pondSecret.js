/**
 * Recorder pond secret — object `$5E` (`UpdateFluteSecret` @ `Z_07.asm:5877`).
 *
 * Playing the recorder on a flute-reveal screen spawns this object instead of
 * uncovering the stairs outright. `InitFluteSecret` seeds `SecretColorCycle`
 * with 1, and every eighth frame the object repaints BG palette row 3's last
 * colour from `PondCycleColors`, draining the water from blue to green. At
 * step `$A` the walkability floor moves to `$99`
 * (`ObjectFirstUnwalkableTile`) so Link can wade in, and at step `$B` the
 * staircase appears at a fixed spot in the pond.
 *
 * Unlike burn/bomb secrets, the pond has no `$E9`/`$EA` marker square in the
 * layout — `RevealPondStairs` hardcodes ObjX/Y then calls
 * `RevealAndFlagSecretStairsObj`. Persistence therefore uses a synthetic
 * `${mapIndex}:{row}:{col}` key derived from that fixed spot.
 *
 * Not modelled: `AnimatePond` (`Z_05.asm:807`) runs the colour cycle backwards
 * while the screen scrolls away, which we skip since the screen is torn down.
 */

import { HUD_HEIGHT } from './collision.js';
import { revealSecretTiles } from './owSecrets.js';

/** `PondCycleColors` @ `Z_07.asm:5873` — NES colour index per cycle step. */
export const POND_CYCLE_COLORS = Object.freeze([
  0x12, 0x11, 0x22, 0x21, 0x31, 0x32, 0x33, 0x35, 0x34, 0x36, 0x37, 0x37,
]);

/** Cycle stops once the counter reaches `$C`. */
export const POND_CYCLE_END = 0x0c;
/** `FrameCounter & 7 == 4` — one step per eight frames. */
export const POND_CYCLE_PERIOD = 8;
export const POND_CYCLE_PHASE = 4;
/** Step that lowers `ObjectFirstUnwalkableTile`. */
export const POND_WALKABLE_STEP = 0x0a;
/** Step that reveals the staircase. */
export const POND_REVEAL_STEP = 0x0b;
/** `ObjectFirstUnwalkableTile` while the pond is wadeable. */
export const POND_FIRST_UNWALKABLE = 0x99;
/** `RevealPondStairs` hardcodes the staircase position. */
export const POND_STAIRS_X = 0x60;
export const POND_STAIRS_Y = 0x90;
/** Square coords for `RevealPondStairs` ($60 / $90). */
export const POND_STAIRS_COL = POND_STAIRS_X / 16;
export const POND_STAIRS_ROW = (POND_STAIRS_Y - HUD_HEIGHT) / 16;

/**
 * @typedef {object} PondSecretState
 * @property {number} cycle `SecretColorCycle`; 0 means no secret on this screen
 * @property {boolean} walkable water has been opened up
 */

/** @returns {PondSecretState} */
export function createPondSecret() {
  return { cycle: 0, walkable: false };
}

/**
 * Save / reveal key for the hardcoded pond staircase (same shape as other OW secrets).
 * @param {number} mapIndex
 */
export function pondSecretKey(mapIndex) {
  return `${mapIndex & 0xff}:${POND_STAIRS_ROW}:${POND_STAIRS_COL}`;
}

/**
 * @param {Set<string> | Iterable<string> | null | undefined} revealed
 * @param {number} mapIndex
 */
export function isPondSecretRevealed(revealed, mapIndex) {
  if (!revealed) return false;
  const key = pondSecretKey(mapIndex);
  if (typeof revealed.has === 'function') return revealed.has(key);
  for (const k of revealed) {
    if (k === key) return true;
  }
  return false;
}

/**
 * Restore pond state after a room load when the secret was already found.
 * @param {Set<string> | Iterable<string> | null | undefined} revealed
 * @param {number} mapIndex
 * @returns {PondSecretState}
 */
export function restorePondSecret(revealed, mapIndex) {
  const state = createPondSecret();
  if (isPondSecretRevealed(revealed, mapIndex)) {
    state.cycle = POND_CYCLE_END;
    state.walkable = true;
  }
  return state;
}

/**
 * `RevealPondStairs` — paint OW stairs `$70–$73` at the fixed pond square.
 * @param {number[][]} tileGrid
 * @returns {boolean}
 */
export function revealPondStairs(tileGrid) {
  return revealSecretTiles(tileGrid, POND_STAIRS_ROW, POND_STAIRS_COL, 0xe9);
}

/** Draining or drained; `@RevealSecret` ignores a second recorder blast. */
export function pondSecretStarted(state) {
  return state.cycle !== 0;
}

export function pondSecretDone(state) {
  return state.cycle >= POND_CYCLE_END;
}

/**
 * `InitFluteSecret` — seed the cycle at 1.
 * @param {PondSecretState} state
 * @returns {boolean} true when a new cycle began
 */
export function startPondSecret(state) {
  if (pondSecretStarted(state)) return false;
  state.cycle = 1;
  state.walkable = false;
  return true;
}

/**
 * Water walkability floor for the current state.
 * @param {PondSecretState} state
 * @returns {number | null} `firstUnwalkable` override, or null for the default
 */
export function pondFirstUnwalkable(state) {
  return state.walkable ? POND_FIRST_UNWALKABLE : null;
}

/**
 * Collision floor for Link — live drain state or an already-flagged pond secret.
 * Callers that shove/eject must use this too, or water becomes solid again and
 * Link is slid off the lakebed every frame.
 * @param {PondSecretState} state
 * @param {Set<string> | Iterable<string> | null | undefined} revealed
 * @param {number} mapIndex
 * @returns {number | null}
 */
export function pondCollisionFloor(state, revealed, mapIndex) {
  if (isPondSecretRevealed(revealed, mapIndex)) return POND_FIRST_UNWALKABLE;
  return pondFirstUnwalkable(state);
}

/**
 * @typedef {object} PondSecretStep
 * @property {boolean} stepped the cycle advanced this frame
 * @property {number | null} color new NES colour for BG row 3 slot 3
 * @property {boolean} openedWater walkability floor dropped this frame
 * @property {boolean} revealStairs staircase appears this frame
 */

/**
 * Advance one frame.
 * @param {PondSecretState} state mutated
 * @param {number} frameCounter free-running frame counter
 * @returns {PondSecretStep}
 */
export function stepPondSecret(state, frameCounter) {
  const idle = {
    stepped: false,
    color: null,
    openedWater: false,
    revealStairs: false,
  };
  if (!pondSecretStarted(state) || pondSecretDone(state)) return idle;
  if ((frameCounter & (POND_CYCLE_PERIOD - 1)) !== POND_CYCLE_PHASE) return idle;

  const step = state.cycle;
  state.cycle = step + 1;

  if (step === POND_REVEAL_STEP) {
    return { stepped: true, color: null, openedWater: false, revealStairs: true };
  }
  const openedWater = step === POND_WALKABLE_STEP;
  if (openedWater) state.walkable = true;
  return {
    stepped: true,
    color: POND_CYCLE_COLORS[step] ?? null,
    openedWater,
    revealStairs: false,
  };
}
