/**
 * Game mode `$13` — the ending (`InitMode13_Full` @ `Z_02.asm:3203` and
 * `UpdateMode13WinGame` @ `Z_02.asm:3399`).
 *
 * Phases, in ROM order:
 *   THANKS   init sub 2  Zelda types `ThanksText`, one tile per 6 frames,
 *                        then a `$50`-frame beat (`UpdateZeldaTextbox`)
 *   FLASH    sub 0       `ItemLiftTimer` runs to `$C0` over Link, Zelda and
 *                        their triforces; after `$40` the backdrop cycles
 *                        `EndingFlashColors`
 *   PEACE    sub 1/2     the ending song plays, a `$40`-frame delay, then
 *                        `PeaceText` types one tile per 8 frames while
 *                        `EndingFlashLongTimer` burns down
 *   CREDITS  sub 3       the credit roll scrolls at 1/2 px per frame
 *   TABLEAU  sub 4       triforce over Ganon's ashes; Start moves to mode `$0D`
 */

export const ENDING_PHASE = Object.freeze({
  THANKS: 'thanks',
  THANKS_HOLD: 'thanksHold',
  FLASH: 'flash',
  PEACE_DELAY: 'peaceDelay',
  PEACE: 'peace',
  PEACE_HOLD: 'peaceHold',
  CREDITS: 'credits',
  TABLEAU: 'tableau',
});

/** `UpdateZeldaTextbox` arms `ObjTimer+1 = $06` between characters. */
export const THANKS_CHAR_FRAMES = 6;
/** `InitMode13_Sub2` waits `$50` frames once the line is complete. */
export const THANKS_HOLD_FRAMES = 0x50;
/** `ItemLiftTimer` counts to `$C0`; the backdrop starts cycling at `$40`. */
export const FLASH_FRAMES = 0xc0;
export const FLASH_START = 0x40;
/** `EndingFlashColors` @ `Z_02.asm:3396`. */
export const FLASH_COLORS = Object.freeze([0x0f, 0x12, 0x16, 0x2a]);
/** `ObjTimer = $40` before the peace text starts. */
export const PEACE_DELAY_FRAMES = 0x40;
/** `UpdatePeaceTextbox` emits when `(counter & 7) == 4`. */
export const PEACE_CHAR_FRAMES = 8;
/**
 * `EndingFlashLongTimer = $40`, decremented once per `$10` frames, so the
 * whole peace submode lasts `$280` frames. Link and Zelda vanish at 4 units.
 */
export const PEACE_LONG_UNITS = 0x40;
export const PEACE_LONG_UNIT_FRAMES = 0x10;
export const PEACE_HIDE_AT_UNITS = 4;
/** `UpdateMode13WinGame_Sub3` adds `$80` per frame to the scroll fraction. */
export const CREDITS_SCROLL_NUMERATOR = 0x80;
/** Sub4 arms `ObjTimer` so Start cannot skip the tableau immediately. */
export const TABLEAU_LOCKOUT_FRAMES = 0x40;

/**
 * @typedef {object} EndingState
 * @property {string} phase
 * @property {number} timer
 * @property {number} chars characters revealed in the current textbox
 * @property {number} flashTimer `ItemLiftTimer`
 * @property {number} longUnits `EndingFlashLongTimer`
 * @property {number} longSubFrames frames into the current long-timer unit
 * @property {number} scroll credit-roll offset in pixels
 * @property {number} scrollFrac 8-bit scroll fraction
 * @property {boolean} songStarted
 */

/** @returns {EndingState} */
export function createEndingSequence() {
  return {
    phase: ENDING_PHASE.THANKS,
    timer: 0,
    chars: 0,
    flashTimer: 0,
    longUnits: PEACE_LONG_UNITS,
    longSubFrames: 0,
    scroll: 0,
    scrollFrac: 0,
    songStarted: false,
  };
}

/** Backdrop colour while the tableau flashes, or null before it starts. */
export function endingFlashColor(state) {
  if (state.phase !== ENDING_PHASE.FLASH) return null;
  if (state.flashTimer < FLASH_START) return null;
  return FLASH_COLORS[state.flashTimer & 0x03];
}

/** Link, Zelda and their triforces are on screen for most of the sequence. */
export function endingHeroesVisible(state) {
  if (state.phase === ENDING_PHASE.FLASH) return true;
  if (state.phase === ENDING_PHASE.PEACE_DELAY || state.phase === ENDING_PHASE.PEACE) {
    return true;
  }
  // Sub1 keeps drawing them until the long timer reaches 4.
  return state.phase === ENDING_PHASE.PEACE_HOLD && state.longUnits >= PEACE_HIDE_AT_UNITS;
}

/**
 * @typedef {object} EndingStep
 * @property {boolean} typed a character appeared this frame
 * @property {boolean} playCharTune Tune0 `$10` (spaces are silent)
 * @property {boolean} startSong the ending song begins
 * @property {boolean} silence `InitMode13_Sub3` cuts all sound
 * @property {boolean} enteredCredits
 * @property {boolean} enteredTableau
 */

const NO_EVENTS = Object.freeze({
  typed: false,
  playCharTune: false,
  startSong: false,
  silence: false,
  enteredCredits: false,
  enteredTableau: false,
});

/**
 * Advance one frame.
 * @param {EndingState} state mutated
 * @param {{ thanks: string, peace: string, scrollEnd: number }} content
 * @returns {EndingStep}
 */
export function stepEndingSequence(state, content) {
  switch (state.phase) {
    case ENDING_PHASE.THANKS:
      return stepTyping(state, content.thanks, THANKS_CHAR_FRAMES, () => {
        state.phase = ENDING_PHASE.THANKS_HOLD;
        state.timer = THANKS_HOLD_FRAMES;
      });
    case ENDING_PHASE.THANKS_HOLD:
      if (state.timer > 0) {
        state.timer -= 1;
        return NO_EVENTS;
      }
      state.phase = ENDING_PHASE.FLASH;
      state.flashTimer = 0;
      return { ...NO_EVENTS, silence: true };
    case ENDING_PHASE.FLASH:
      return stepFlash(state);
    case ENDING_PHASE.PEACE_DELAY:
      if (state.timer > 0) {
        state.timer -= 1;
        return NO_EVENTS;
      }
      state.phase = ENDING_PHASE.PEACE;
      state.chars = 0;
      state.timer = 0;
      return NO_EVENTS;
    case ENDING_PHASE.PEACE:
      return stepPeace(state, content.peace);
    case ENDING_PHASE.PEACE_HOLD:
      return stepPeaceHold(state);
    case ENDING_PHASE.CREDITS:
      return stepCredits(state, content.scrollEnd);
    default:
      return NO_EVENTS;
  }
}

/**
 * Shared typewriter: reveal one character every `period` frames and chirp
 * Tune0 `$10` unless it was a space.
 */
function stepTyping(state, text, period, onDone) {
  if (state.chars >= text.length) {
    onDone();
    return NO_EVENTS;
  }
  state.timer += 1;
  if (state.timer < period) return NO_EVENTS;
  state.timer = 0;
  const ch = text[state.chars];
  state.chars += 1;
  return { ...NO_EVENTS, typed: true, playCharTune: ch !== ' ' };
}

function stepFlash(state) {
  state.flashTimer += 1;
  if (state.flashTimer < FLASH_FRAMES) return NO_EVENTS;
  state.phase = ENDING_PHASE.PEACE_DELAY;
  state.timer = PEACE_DELAY_FRAMES;
  state.longUnits = PEACE_LONG_UNITS;
  state.longSubFrames = 0;
  state.songStarted = true;
  return { ...NO_EVENTS, startSong: true };
}

/** Peace text types while the long timer runs underneath it. */
function stepPeace(state, text) {
  burnLongTimer(state);
  const events = stepTyping(state, text, PEACE_CHAR_FRAMES, () => {
    state.phase = ENDING_PHASE.PEACE_HOLD;
  });
  if (state.longUnits <= 0) {
    state.phase = ENDING_PHASE.CREDITS;
    return { ...events, enteredCredits: true };
  }
  return events;
}

function stepPeaceHold(state) {
  burnLongTimer(state);
  if (state.longUnits > 0) return NO_EVENTS;
  state.phase = ENDING_PHASE.CREDITS;
  return { ...NO_EVENTS, enteredCredits: true };
}

function burnLongTimer(state) {
  if (state.longUnits <= 0) return;
  state.longSubFrames += 1;
  if (state.longSubFrames < PEACE_LONG_UNIT_FRAMES) return;
  state.longSubFrames = 0;
  state.longUnits -= 1;
}

/** Sub3 advances `CurVScroll` by `$80/$100` px per frame — one pixel per two. */
function stepCredits(state, scrollEnd) {
  state.scrollFrac += CREDITS_SCROLL_NUMERATOR;
  if (state.scrollFrac > 0xff) {
    state.scrollFrac &= 0xff;
    state.scroll += 1;
  }
  if (state.scroll < scrollEnd) return NO_EVENTS;
  state.phase = ENDING_PHASE.TABLEAU;
  state.timer = TABLEAU_LOCKOUT_FRAMES;
  return { ...NO_EVENTS, enteredTableau: true };
}

/**
 * Sub4: Start is ignored until `ObjTimer` expires, then it leads to mode `$0D`
 * and `SwitchProfileToSecondQuest`.
 * @param {EndingState} state mutated
 * @param {boolean} startPressed
 * @returns {boolean} true when the player may leave
 */
export function endingAcceptsStart(state, startPressed) {
  if (state.phase !== ENDING_PHASE.TABLEAU) return false;
  if (state.timer > 0) {
    state.timer -= 1;
    return false;
  }
  return startPressed;
}
