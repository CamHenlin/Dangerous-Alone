import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDING_PHASE,
  FLASH_COLORS,
  FLASH_FRAMES,
  FLASH_START,
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
