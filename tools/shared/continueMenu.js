/**
 * Game mode `$08` — the continue question
 * (`UpdateMode8ContinueQuestion_Full` @ `Z_05.asm:2199`).
 *
 * Select cycles the cursor through three rows and chirps Tune0 `$01`; Start
 * latches the choice, flashes its attribute row for `$40` frames, and then
 * hands off to the mode in `Mode8SelectionToMode` (`Z_05.asm:2190`).
 */

export const CONTINUE_OPTION = Object.freeze({
  CONTINUE: 0,
  SAVE: 1,
  RETRY: 2,
});

/** Row labels, in `Mode8SpriteYs` order. */
export const CONTINUE_LABELS = Object.freeze(['CONTINUE', 'SAVE', 'RETRY']);

/** `Mode8SpriteYs` — cursor Y per row. */
export const CONTINUE_ROW_Y = Object.freeze([0x4f, 0x67, 0x7f]);

/** `Mode8SelectionToMode` = `$03` (play on), `$0D` (save + file select), `$00` (title). */
export const CONTINUE_ACTION = Object.freeze(['continue', 'save', 'retry']);

/** `ObjTimer+1 = $40` of confirmation flashing. */
export const CONTINUE_FLASH_FRAMES = 0x40;
/** The flash toggles on bit 2 of the timer. */
export const CONTINUE_FLASH_PERIOD = 4;

/**
 * `LDA HeartValues / AND #$F0 / ORA #$02` — you always resume on three full
 * hearts, whatever your container count.
 */
export const CONTINUE_HALF_HEARTS = 6;

/**
 * @typedef {object} ContinueMenuState
 * @property {number} selection 0–2
 * @property {number} flashTimer counts down once Start is pressed
 * @property {boolean} activated Start has been pressed
 */

/** @returns {ContinueMenuState} */
export function createContinueMenu() {
  return { selection: CONTINUE_OPTION.CONTINUE, flashTimer: 0, activated: false };
}

/** The chosen row is flashing; input is ignored until it settles. */
export function continueMenuBusy(state) {
  return state.activated;
}

/** Cursor row is drawn dark on the off-beat of the confirmation flash. */
export function continueMenuFlashOn(state) {
  if (!state.activated) return true;
  return (state.flashTimer & CONTINUE_FLASH_PERIOD) === 0;
}

/**
 * Select — move the cursor down one row, wrapping.
 * @param {ContinueMenuState} state
 * @returns {boolean} true when the cursor moved (and the cue should play)
 */
export function moveContinueCursor(state) {
  if (state.activated) return false;
  state.selection = (state.selection + 1) % CONTINUE_LABELS.length;
  return true;
}

/**
 * Start — latch the selection and begin the flash.
 * @param {ContinueMenuState} state
 * @returns {boolean} true when this press latched the choice
 */
export function activateContinueChoice(state) {
  if (state.activated) return false;
  state.activated = true;
  state.flashTimer = CONTINUE_FLASH_FRAMES;
  return true;
}

/**
 * Advance one frame.
 * @param {ContinueMenuState} state mutated
 * @returns {{ action: string | null }} the chosen action on the settling frame
 */
export function stepContinueMenu(state) {
  if (!state.activated) return { action: null };
  if (state.flashTimer > 0) state.flashTimer -= 1;
  if (state.flashTimer > 0) return { action: null };
  return { action: CONTINUE_ACTION[state.selection] ?? 'continue' };
}
