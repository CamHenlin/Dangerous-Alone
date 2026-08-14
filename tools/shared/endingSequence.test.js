import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDING_PHASE,
  FLASH_COLORS,
  FLASH_FRAMES,
  FLASH_START,
  EPILOGUE_CHAR_FRAMES,
  EPILOGUE_HOLD_FRAMES,
  EPILOGUE_INPUT_LOCK_FRAMES,
  PEACE_CHAR_FRAMES,
  PEACE_DELAY_FRAMES,
  PEACE_LONG_UNITS,
  PEACE_LONG_UNIT_FRAMES,
  THANKS_CHAR_FRAMES,
  THANKS_HOLD_FRAMES,
  createEndingSequence,
  endingAcceptsStart,
  endingFlashColor,
  endingHeroesVisible,
  epilogueAcceptsStart,
  stepEndingSequence,
} from './endingSequence.js';

const CONTENT = { thanks: 'HI YOU', peace: 'BYE', scrollEnd: 40 };

/** Step until `phase` is reached, returning the frames taken and all events. */
function runTo(state, phase, content = CONTENT, limit = 5000) {
  const events = [];
  for (let f = 1; f <= limit; f += 1) {
    events.push(stepEndingSequence(state, content));
    if (state.phase === phase) return { frames: f, events };
  }
  return { frames: -1, events };
}

test('the thanks line types one character every six frames', () => {
  const state = createEndingSequence();
  for (let f = 0; f < THANKS_CHAR_FRAMES - 1; f += 1) {
    assert.equal(stepEndingSequence(state, CONTENT).typed, false);
  }
  assert.equal(stepEndingSequence(state, CONTENT).typed, true);
  assert.equal(state.chars, 1);
});

test('spaces are typed silently', () => {
  const state = createEndingSequence();
  const tunes = [];
  runTo(state, ENDING_PHASE.THANKS_HOLD);
  // "HI YOU" has one space, so five of six characters chirp.
  for (const e of runTo(createEndingSequence(), ENDING_PHASE.THANKS_HOLD).events) {
    if (e.typed) tunes.push(e.playCharTune);
  }
  assert.equal(tunes.length, CONTENT.thanks.length);
  assert.equal(tunes.filter(Boolean).length, CONTENT.thanks.replace(/ /g, '').length);
});

test('the thanks beat runs $50 frames and then silences sound', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.THANKS_HOLD);
  const { frames, events } = runTo(state, ENDING_PHASE.FLASH);
  assert.equal(frames, THANKS_HOLD_FRAMES + 1);
  assert.equal(events[events.length - 1].silence, true);
});

test('the tableau flash stays dark for its first $40 frames', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.FLASH);
  assert.equal(endingFlashColor(state), null);
  for (let f = 0; f < FLASH_START; f += 1) stepEndingSequence(state, CONTENT);
  assert.ok(FLASH_COLORS.includes(endingFlashColor(state)));
});

test('the flash cycles all four EndingFlashColors', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.FLASH);
  const seen = new Set();
  for (let f = 0; f < FLASH_FRAMES; f += 1) {
    stepEndingSequence(state, CONTENT);
    const c = endingFlashColor(state);
    if (c != null) seen.add(c);
  }
  assert.deepEqual([...seen].sort(), [...FLASH_COLORS].sort());
});

test('the ending song starts exactly once, when the flash completes', () => {
  const state = createEndingSequence();
  const { events } = runTo(state, ENDING_PHASE.PEACE_DELAY);
  assert.equal(events.filter((e) => e.startSong).length, 1);
  assert.equal(state.songStarted, true);
});

test('the peace text waits $40 frames before typing', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.PEACE_DELAY);
  const { frames } = runTo(state, ENDING_PHASE.PEACE);
  assert.equal(frames, PEACE_DELAY_FRAMES + 1);
});

test('the peace text types one character every eight frames', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.PEACE);
  for (let f = 0; f < PEACE_CHAR_FRAMES - 1; f += 1) {
    assert.equal(stepEndingSequence(state, CONTENT).typed, false);
  }
  assert.equal(stepEndingSequence(state, CONTENT).typed, true);
});

test('Link and Zelda leave the screen before the credits do', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.PEACE_HOLD);
  assert.equal(endingHeroesVisible(state), true);
  while (state.longUnits > 3) stepEndingSequence(state, CONTENT);
  assert.equal(endingHeroesVisible(state), false);
});

test('the peace submode lasts $280 frames end to end', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.PEACE);
  const { frames, events } = runTo(state, ENDING_PHASE.CREDITS);
  assert.equal(frames, PEACE_LONG_UNITS * PEACE_LONG_UNIT_FRAMES);
  assert.equal(events[events.length - 1].enteredCredits, true);
});

test('the credit roll scrolls one pixel every two frames', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.CREDITS);
  stepEndingSequence(state, CONTENT);
  assert.equal(state.scroll, 0);
  stepEndingSequence(state, CONTENT);
  assert.equal(state.scroll, 1);
});

test('Start is locked out for $40 frames after the credits', () => {
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.TABLEAU);
  assert.equal(endingAcceptsStart(state, true), false);
  for (let f = 0; f < 0x40; f += 1) endingAcceptsStart(state, false);
  assert.equal(endingAcceptsStart(state, false), false);
  assert.equal(endingAcceptsStart(state, true), true);
});

test('Start does nothing before the tableau', () => {
  const state = createEndingSequence();
  assert.equal(endingAcceptsStart(state, true), false);
  runTo(state, ENDING_PHASE.CREDITS);
  assert.equal(endingAcceptsStart(state, true), false);
});

test('with no epilogue the peace beat still hands straight to the credits', () => {
  const state = createEndingSequence();
  const { frames } = runTo(state, ENDING_PHASE.CREDITS);
  assert.ok(frames > 0);
  assert.equal(state.phase, ENDING_PHASE.CREDITS);
});

test('epilogue pages type, hold, turn, and end in the credit roll', () => {
  const content = { ...CONTENT, epilogue: ['ONE', 'TWO'] };
  const state = createEndingSequence();
  const entered = runTo(state, ENDING_PHASE.EPILOGUE, content);
  assert.ok(entered.frames > 0, 'never reached the epilogue');
  assert.equal(state.page, 0);
  assert.equal(state.chars, 0);

  // Page 0 types at its own rate, then the hold timer turns it.
  for (let f = 0; f < EPILOGUE_CHAR_FRAMES * 'ONE'.length; f += 1) {
    stepEndingSequence(state, content);
  }
  assert.equal(state.chars, 'ONE'.length);
  for (let f = 0; f < EPILOGUE_HOLD_FRAMES; f += 1) stepEndingSequence(state, content);
  assert.equal(state.page, 1);
  assert.equal(state.chars, 0);

  // The last page hands over rather than running off the end of the array.
  const toCredits = runTo(state, ENDING_PHASE.CREDITS, content);
  assert.ok(toCredits.frames > 0);
  assert.ok(toCredits.events.some((e) => e.enteredCredits));
});

test('Start fills an epilogue page, then turns it', () => {
  const content = { ...CONTENT, epilogue: ['A LONGER PAGE', 'SECOND'] };
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.EPILOGUE, content);

  // Ignored while the page is brand new, so one press cannot eat two pages.
  assert.equal(epilogueAcceptsStart(state, content.epilogue, true), null);
  for (let f = 0; f < EPILOGUE_INPUT_LOCK_FRAMES; f += 1) {
    stepEndingSequence(state, content);
  }

  const filled = epilogueAcceptsStart(state, content.epilogue, true);
  assert.ok(filled);
  assert.equal(state.chars, content.epilogue[0].length);
  assert.equal(state.page, 0);

  const turned = epilogueAcceptsStart(state, content.epilogue, true);
  assert.equal(turned.turnedPage, true);
  assert.equal(state.page, 1);

  // No press, no effect.
  assert.equal(epilogueAcceptsStart(state, content.epilogue, false), null);
});

test('Start on the last epilogue page enters the credits', () => {
  // Long enough that the input lock expires while the page is still typing,
  // so the first press fills and only the second one turns.
  const content = { ...CONTENT, epilogue: ['THE ONLY PAGE THERE IS'] };
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.EPILOGUE, content);
  for (let f = 0; f < EPILOGUE_INPUT_LOCK_FRAMES; f += 1) {
    stepEndingSequence(state, content);
  }
  assert.ok(state.chars < content.epilogue[0].length, 'page typed too fast to fill');
  epilogueAcceptsStart(state, content.epilogue, true); // fill
  const res = epilogueAcceptsStart(state, content.epilogue, true); // turn
  assert.equal(res.enteredCredits, true);
  assert.equal(state.phase, ENDING_PHASE.CREDITS);
});

test('Link and Zelda are gone by the time the epilogue plays', () => {
  const content = { ...CONTENT, epilogue: ['PAGE'] };
  const state = createEndingSequence();
  runTo(state, ENDING_PHASE.EPILOGUE, content);
  assert.equal(endingHeroesVisible(state), false);
});
