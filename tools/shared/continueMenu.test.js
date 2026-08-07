import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTINUE_ACTION,
  CONTINUE_FLASH_FRAMES,
  CONTINUE_LABELS,
  CONTINUE_OPTION,
  activateContinueChoice,
  continueMenuBusy,
  continueMenuFlashOn,
  createContinueMenu,
  moveContinueCursor,
  stepContinueMenu,
} from './continueMenu.js';

/** Step until the menu yields an action, returning it with the frame count. */
function settle(state, limit = 500) {
  for (let f = 1; f <= limit; f += 1) {
    const { action } = stepContinueMenu(state);
    if (action) return { action, frames: f };
  }
  return { action: null, frames: -1 };
}

test('the cursor starts on Continue', () => {
  const state = createContinueMenu();
  assert.equal(state.selection, CONTINUE_OPTION.CONTINUE);
  assert.equal(CONTINUE_LABELS[state.selection], 'CONTINUE');
  assert.equal(continueMenuBusy(state), false);
});

test('Select walks the three rows and wraps', () => {
  const state = createContinueMenu();
  const seen = [state.selection];
  for (let i = 0; i < 3; i += 1) {
    assert.equal(moveContinueCursor(state), true);
    seen.push(state.selection);
  }
  assert.deepEqual(seen, [0, 1, 2, 0]);
});

test('an idle menu never yields an action', () => {
  const state = createContinueMenu();
  assert.equal(settle(state, 200).action, null);
});

test('Start latches the choice and flashes for $40 frames', () => {
  const state = createContinueMenu();
  assert.equal(activateContinueChoice(state), true);
  assert.equal(continueMenuBusy(state), true);
  const { action, frames } = settle(state);
  assert.equal(action, 'continue');
  assert.equal(frames, CONTINUE_FLASH_FRAMES);
});

test('input is ignored once the choice is latched', () => {
  const state = createContinueMenu();
  activateContinueChoice(state);
  assert.equal(moveContinueCursor(state), false);
  assert.equal(activateContinueChoice(state), false);
  assert.equal(state.selection, CONTINUE_OPTION.CONTINUE);
});

test('the confirmation flash toggles every four frames', () => {
  const state = createContinueMenu();
  activateContinueChoice(state);
  const pattern = [];
  for (let f = 0; f < 8; f += 1) {
    pattern.push(continueMenuFlashOn(state));
    stepContinueMenu(state);
  }
  // $40 counts down: 40,3F..3C are on-beat, 3B..38 off, and so on.
  assert.equal(new Set(pattern).size, 2);
});

test('each row maps to its Mode8SelectionToMode action', () => {
  for (let row = 0; row < CONTINUE_LABELS.length; row += 1) {
    const state = createContinueMenu();
    for (let i = 0; i < row; i += 1) moveContinueCursor(state);
    activateContinueChoice(state);
    assert.equal(settle(state).action, CONTINUE_ACTION[row]);
  }
});

test('the action keeps repeating after it settles', () => {
  const state = createContinueMenu();
  moveContinueCursor(state);
  activateContinueChoice(state);
  settle(state);
  assert.equal(stepContinueMenu(state).action, 'save');
});
