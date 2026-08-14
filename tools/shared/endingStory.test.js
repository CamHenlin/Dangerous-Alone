import test from 'node:test';
import assert from 'node:assert/strict';

import { STORY } from '../../story/index.js';
import { unrenderableChars } from './nesCharset.js';
import {
  ENDING_COLS,
  EPILOGUE_MAX_ROWS,
  SCREEN_COLS,
  centreCol,
  endingStory,
  flattenEndingLines,
  layoutEndingText,
  layoutEpiloguePage,
  wrapEndingText,
} from './endingStory.js';
import {
  EPILOGUE_CHAR_FRAMES,
  PEACE_CHAR_FRAMES,
  PEACE_LONG_UNITS,
  PEACE_LONG_UNIT_FRAMES,
} from './endingSequence.js';

test('wrapping never exceeds the column budget', () => {
  const lines = wrapEndingText(
    'THE TRIFORCE OF WISDOM GOES BACK TOGETHER IN HER HANDS',
    ENDING_COLS,
  );
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length <= ENDING_COLS, line);
  assert.equal(lines.join(' ').replace(/\s+/g, ' '),
    'THE TRIFORCE OF WISDOM GOES BACK TOGETHER IN HER HANDS');
});

test('a word longer than the budget gets its own line rather than a split', () => {
  const lines = wrapEndingText('A SUPERCALIFRAGILISTIC WORD', 8);
  assert.deepEqual(lines, ['A', 'SUPERCALIFRAGILISTIC', 'WORD']);
});

test('lines are centred on the nametable', () => {
  assert.equal(centreCol('AB'), 15);
  assert.equal(centreCol('X'.repeat(SCREEN_COLS)), 0);
  // Over-long lines clamp to the left edge instead of going negative.
  assert.equal(centreCol('X'.repeat(SCREEN_COLS + 8)), 0);
});

test('layout stacks rows from the top row down', () => {
  const laid = layoutEndingText('ONE TWO THREE FOUR FIVE SIX SEVEN', {
    topRow: 5,
    cols: 12,
  });
  assert.ok(laid.length >= 2);
  assert.deepEqual(laid.map((l) => l.row), laid.map((_, i) => 5 + i));
});

test('the ending falls back to the ROM lines when nothing is authored', () => {
  const romData = {
    thanksLines: [{ row: 13, col: 4, text: "THANKS LINK,YOU'RE" }],
    peaceLines: [{ row: 21, col: 12, text: 'FINALLY,' }],
  };
  const bare = { ending: {} };
  const res = endingStory(romData, { story: bare });
  assert.deepEqual(res.thanksLines, romData.thanksLines);
  assert.deepEqual(res.peaceLines, romData.peaceLines);
  assert.deepEqual(res.epiloguePages, []);
});

test('authored prose replaces the ROM lines and lays out an epilogue', () => {
  const res = endingStory(null);
  assert.ok(res.thanksLines.length > 0);
  assert.ok(res.peaceLines.length > 0);
  assert.ok(res.epiloguePages.length > 0);
  assert.match(flattenEndingLines(res.thanksLines), /THANKS, LINK/);
});

test('every ending line draws with the NES charset', () => {
  const res = endingStory(null);
  const all = [
    ...res.thanksLines,
    ...res.peaceLines,
    ...res.epiloguePages.flat(),
  ];
  for (const line of all) {
    assert.deepEqual(
      unrenderableChars(line.text),
      [],
      `unrenderable glyph in ${JSON.stringify(line.text)}`,
    );
  }
});

test('no epilogue page is taller than the block reserved for it', () => {
  for (const [i, page] of endingStory(null).epiloguePages.entries()) {
    assert.ok(
      page.length <= EPILOGUE_MAX_ROWS,
      `epilogue page ${i} wraps to ${page.length} lines (max ${EPILOGUE_MAX_ROWS})`,
    );
  }
});

test('the peace line finishes typing before the ROM timer cuts to the credits', () => {
  // `EndingFlashLongTimer` runs the peace submode for a fixed span whatever is
  // left untyped, so a long peace line is prose written into a dead screen.
  const budget = PEACE_LONG_UNITS * PEACE_LONG_UNIT_FRAMES;
  const glyphs = flattenEndingLines(endingStory(null).peaceLines).length;
  assert.ok(
    glyphs * PEACE_CHAR_FRAMES < budget,
    `peace text needs ${glyphs * PEACE_CHAR_FRAMES} frames of a ${budget} frame submode`,
  );
});

test('an epilogue page is readable in well under half a minute', () => {
  for (const page of endingStory(null).epiloguePages) {
    const seconds = (flattenEndingLines(page).length * EPILOGUE_CHAR_FRAMES) / 60;
    assert.ok(seconds < 10, `a page takes ${seconds.toFixed(1)}s to type`);
  }
});

test('the story pack still carries the three ending beats', () => {
  assert.equal(typeof STORY.ending.thanks, 'string');
  assert.equal(typeof STORY.ending.peace, 'string');
  assert.ok(Array.isArray(STORY.ending.epilogue));
});

test('an epilogue page is set as a block, not centred line by line', () => {
  const page = layoutEpiloguePage(
    'SHE BROKE IT IN ONE NIGHT WITH SOLDIERS ON THE STAIR, AND SHE HAS CARRIED THAT CHOICE',
  );
  assert.ok(page.length > 2);
  const cols = new Set(page.map((l) => l.col));
  assert.equal(cols.size, 1, 'every line of a paragraph shares one left margin');
  // The block itself is still centred on the screen.
  const widest = Math.max(...page.map((l) => l.text.length));
  assert.equal(page[0].col, (SCREEN_COLS - widest) >> 1);
});
