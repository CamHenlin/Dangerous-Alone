import test from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from './collision.js';
import {
  BOARD_COLS,
  BOARD_SIZE,
  CHAR_MAP,
  END_SLOT,
  FIRST_REPEAT_DELAY,
  NAME_LEN,
  REPEAT_DELAY,
  boardCell,
  boardChars,
  charForTile,
  createNameEntry,
  cursorVisible,
  firstInactiveSlot,
  moveBoard,
  nameFromCells,
  pressA,
  pressB,
  pressSelect,
  pressStart,
  stepDirections,
} from './nameEntry.js';
import { nameUnlocksSecondQuest } from './save.js';

test('the board is the ROM 11x4 character map', () => {
  assert.equal(CHAR_MAP.length, BOARD_SIZE);
  assert.equal(BOARD_SIZE, 44);
  const rows = [];
  for (let r = 0; r < 4; r += 1) {
    rows.push(boardChars().slice(r * BOARD_COLS, (r + 1) * BOARD_COLS).join(''));
  }
  assert.deepEqual(rows, [
    'ABCDEFGHIJK',
    'LMNOPQRSTUV',
    "WXYZ-.,!'&.",
    '0123456789 ',
  ]);
});

test('board glyph codes decode to their CHR shapes', () => {
  assert.equal(charForTile(0x00), '0');
  assert.equal(charForTile(0x0a), 'A');
  assert.equal(charForTile(0x23), 'Z');
  assert.equal(charForTile(0x24), ' ');
  assert.equal(charForTile(0x62), '-');
  assert.equal(charForTile(0x2b), '&');
});

test('cells sit on the ROM cursor grid', () => {
  assert.deepEqual(
    { x: boardCell(0).x, y: boardCell(0).cursorY },
    { x: 0x30, y: 0x87 },
  );
  assert.deepEqual(
    { x: boardCell(43).x, y: boardCell(43).cursorY },
    { x: 0xd0, y: 0xb7 },
  );
});

test('right and left roll between rows and wrap the whole board', () => {
  assert.equal(moveBoard(0, DIR.RIGHT), 1);
  // Column 10 of row 0 rolls into column 0 of row 1.
  assert.equal(moveBoard(10, DIR.RIGHT), 11);
  assert.equal(moveBoard(43, DIR.RIGHT), 0);
  assert.equal(moveBoard(11, DIR.LEFT), 10);
  assert.equal(moveBoard(0, DIR.LEFT), 43);
});

test('up and down step a whole row and wrap', () => {
  assert.equal(moveBoard(0, DIR.DOWN), 11);
  assert.equal(moveBoard(33, DIR.DOWN), 0);
  assert.equal(moveBoard(11, DIR.UP), 0);
  assert.equal(moveBoard(5, DIR.UP), 38);
});

test('direction repeat waits $10 frames, then 8', () => {
  const state = createNameEntry();
  assert.equal(stepDirections(state, DIR.RIGHT), DIR.RIGHT, 'first frame acts');
  assert.equal(state.boardIndex, 1);
  for (let i = 0; i < FIRST_REPEAT_DELAY; i += 1) {
    assert.equal(stepDirections(state, DIR.RIGHT), 0, `frame ${i}`);
  }
  assert.equal(stepDirections(state, DIR.RIGHT), DIR.RIGHT);
  assert.equal(state.boardIndex, 2);
  for (let i = 0; i < REPEAT_DELAY; i += 1) {
    assert.equal(stepDirections(state, DIR.RIGHT), 0);
  }
  assert.equal(stepDirections(state, DIR.RIGHT), DIR.RIGHT);
  assert.equal(state.boardIndex, 3);
});

test('diagonals move nothing', () => {
  const state = createNameEntry();
  assert.equal(stepDirections(state, DIR.RIGHT | DIR.DOWN), 0);
  assert.equal(state.boardIndex, 0);
});

test('releasing the pad resets the repeat delay', () => {
  const state = createNameEntry();
  stepDirections(state, DIR.DOWN);
  assert.equal(state.subsequentRepeat, 1);
  stepDirections(state, 0);
  assert.equal(state.subsequentRepeat, 0);
  assert.equal(state.repeatTimer, 0);
});

test('A types the highlighted character and advances', () => {
  const state = createNameEntry();
  state.boardIndex = 11; // 'L'
  assert.equal(pressA(state), 'L');
  state.boardIndex = 8; // 'I'
  pressA(state);
  state.boardIndex = 13; // 'N'
  pressA(state);
  state.boardIndex = 10; // 'K'
  pressA(state);
  assert.equal(nameFromCells(state.names[0]), 'LINK');
  assert.equal(state.nameIndex, 4);
});

test('B skips a cell without typing, and the cursor wraps at 8', () => {
  const state = createNameEntry();
  pressB(state);
  state.boardIndex = 0;
  pressA(state);
  assert.equal(state.names[0][0], ' ');
  assert.equal(state.names[0][1], 'A');
  for (let i = 0; i < NAME_LEN - 2; i += 1) pressB(state);
  assert.equal(state.nameIndex, 0, 'wrapped back to the first cell');
});

test('Select skips files that already exist and lands on END', () => {
  const state = createNameEntry({
    slotNames: ['ZELDA', '', 'LINK'],
    slotActive: [true, false, true],
  });
  assert.equal(state.slot, 1, 'opens on the first free file');
  assert.equal(pressSelect(state), END_SLOT);
  assert.equal(pressSelect(state), 1);
});

test('all three files taken opens on END', () => {
  assert.equal(firstInactiveSlot([true, true, true]), END_SLOT);
  const state = createNameEntry({ slotActive: [true, true, true] });
  assert.equal(state.slot, END_SLOT);
  // A and B do nothing on the END row.
  assert.equal(pressA(state), null);
  assert.equal(pressB(state), false);
});

test('Start only commits from the END row, and blank names are dropped', () => {
  const state = createNameEntry();
  state.boardIndex = 15; // 'P'
  pressA(state);
  assert.equal(pressStart(state), null, 'Start over a file row does nothing');
  state.slot = END_SLOT;
  assert.deepEqual(pressStart(state), [{ slot: 0, name: 'P' }]);
});

test('registering ZELDA is recognised from the board output', () => {
  const state = createNameEntry();
  for (const index of [25, 4, 11, 3, 0]) {
    state.boardIndex = index;
    pressA(state);
  }
  state.slot = END_SLOT;
  const [entry] = pressStart(state) ?? [];
  assert.equal(entry.name, 'ZELDA');
  assert.equal(nameUnlocksSecondQuest(entry.name), true);
});

test('the cursor blinks on an 8-frame duty', () => {
  assert.equal(cursorVisible(0), false);
  assert.equal(cursorVisible(8), true);
  assert.equal(cursorVisible(16), false);
});
