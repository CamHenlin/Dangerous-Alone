import test from 'node:test';
import assert from 'node:assert/strict';

import { HIGHLIGHT, PARAGRAPHS, TITLE } from '../../story/prologue.js';
import { nesCharTile, unrenderableChars } from './nesCharset.js';
import { attrPaletteAt } from './nesTransferBuf.js';
import {
  BODY_ROWS,
  BORDER_TILE,
  FRAME,
  PALETTE,
  PANEL_COLS,
  PANEL_ROWS,
  TEXT_COLS,
  TEXT_LEFT_COL,
  TEXT_RIGHT_COL,
  TITLE_ROW,
  composeStoryboard,
  paginatePanels,
  titlePlacement,
  wrapPanelText,
} from './storyboard.js';

/** Tile at (col, row) of a composed board. */
function tileAt(board, col, row) {
  return board.tiles[row * board.cols + col];
}

test('wrapping keeps every line inside the frame', () => {
  for (const para of PARAGRAPHS) {
    for (const line of wrapPanelText(para)) {
      assert.ok(line.length <= TEXT_COLS, `"${line}" is ${line.length} of ${TEXT_COLS}`);
    }
  }
});

test('pagination never overfills a panel', () => {
  const panels = paginatePanels(PARAGRAPHS);
  assert.ok(panels.length > 0);
  for (const [i, lines] of panels.entries()) {
    assert.ok(lines.length <= BODY_ROWS.length, `panel ${i} holds ${lines.length} lines`);
  }
});

test('pagination keeps every authored word, in order', () => {
  const flat = paginatePanels(PARAGRAPHS)
    .flat()
    .filter(Boolean)
    .join(' ');
  const expected = PARAGRAPHS.join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(flat.replace(/\s+/g, ' ').trim(), expected);
});

test('a paragraph never starts a panel with a blank row', () => {
  for (const lines of paginatePanels(PARAGRAPHS)) {
    assert.notEqual(lines[0], '', 'panel opens on a blank line');
  }
});

test('the board is a whole number of screens tall', () => {
  const board = composeStoryboard([{ title: TITLE, lines: ['HELLO'] }, { lines: ['WORLD'] }]);
  assert.equal(board.cols, PANEL_COLS);
  assert.equal(board.rows, PANEL_ROWS * 2);
  assert.equal(board.panelCount, 2);
  assert.equal(board.tiles.length, board.cols * board.rows);
});

test('every panel gets its own vine frame', () => {
  const board = composeStoryboard([{ lines: ['ONE'] }, { lines: ['TWO'] }]);
  for (let panel = 0; panel < 2; panel += 1) {
    const off = panel * PANEL_ROWS;
    assert.equal(tileAt(board, FRAME.leftCol, off + FRAME.topRow), BORDER_TILE.corner);
    assert.equal(tileAt(board, FRAME.rightCol, off + FRAME.topRow), BORDER_TILE.corner);
    assert.equal(tileAt(board, FRAME.leftCol, off + FRAME.bottomRow), BORDER_TILE.corner);
    assert.equal(tileAt(board, FRAME.rightCol, off + FRAME.bottomRow), BORDER_TILE.corner);
    // Sides alternate, so the vine reads as a plant and not a pipe.
    const a = tileAt(board, FRAME.leftCol, off + FRAME.topRow + 1);
    const b = tileAt(board, FRAME.leftCol, off + FRAME.topRow + 2);
    assert.notEqual(a, b);
  }
});

test('the title interrupts the top border instead of overwriting it', () => {
  const title = 'THE LEGEND OF ZELDA';
  const board = composeStoryboard([{ title, lines: [] }]);
  const { start } = titlePlacement(title);
  for (let i = 0; i < title.length; i += 1) {
    const expected = nesCharTile(title[i]);
    assert.equal(tileAt(board, start + i, TITLE_ROW), expected, `title char ${i}`);
  }
  // Border still runs up to the gap on both sides.
  assert.equal(tileAt(board, FRAME.leftCol + 1, TITLE_ROW) >= BORDER_TILE.hA, true);
  assert.equal(tileAt(board, FRAME.rightCol - 1, TITLE_ROW) >= BORDER_TILE.hA, true);
});

test('a title starts on an even column so its colour never touches the vine', () => {
  for (const title of ['THE LEGEND OF ZELDA', 'THE END OF THE STORY', 'ODD']) {
    assert.equal(titlePlacement(title).start % 2, 0, title);
  }
});

test('body text never reaches the column the vine shares an attribute with', () => {
  const long = 'X'.repeat(TEXT_COLS);
  const board = composeStoryboard([{ lines: [long] }]);
  const row = BODY_ROWS[0];
  assert.equal(tileAt(board, TEXT_RIGHT_COL, row), nesCharTile('X'));
  // Col 28 shares its attribute block with the right vine at col 29.
  assert.equal(tileAt(board, TEXT_RIGHT_COL + 1, row), nesCharTile(' '));
  assert.equal(attrPaletteAt(board.attrs, FRAME.rightCol, row), PALETTE.border);
});

test('highlighted words get the accent palette and plain words do not', () => {
  const board = composeStoryboard(
    [{ lines: ['MANY YEARS AGO GANON'] }],
    { highlight: { GANON: PALETTE.red } },
  );
  const row = BODY_ROWS[0];
  const at = 'MANY YEARS AGO GANON'.indexOf('GANON');
  assert.equal(attrPaletteAt(board.attrs, TEXT_LEFT_COL + at, row), PALETTE.red);
  assert.equal(attrPaletteAt(board.attrs, TEXT_LEFT_COL, row), PALETTE.white);
});

test('a highlight matches whole words only', () => {
  // "8" must not tint the 8 inside "18".
  const board = composeStoryboard(
    [{ lines: ['18 SHARDS'] }],
    { highlight: { 8: PALETTE.blue } },
  );
  const row = BODY_ROWS[0];
  assert.equal(attrPaletteAt(board.attrs, TEXT_LEFT_COL + 1, row), PALETTE.white);
});

test('body rows are double-spaced so a colour cannot bleed between lines', () => {
  for (let i = 1; i < BODY_ROWS.length; i += 1) {
    assert.equal(BODY_ROWS[i] - BODY_ROWS[i - 1], 2);
  }
  // And each body row owns its attribute row outright.
  const seen = new Set(BODY_ROWS.map((r) => r >> 1));
  assert.equal(seen.size, BODY_ROWS.length);
});

test('the authored prologue draws with the NES charset', () => {
  for (const text of [TITLE, ...PARAGRAPHS]) {
    assert.deepEqual(unrenderableChars(text), [], JSON.stringify(text));
  }
  for (const word of Object.keys(HIGHLIGHT)) {
    assert.deepEqual(unrenderableChars(word), [], word);
  }
});

test('every highlighted word actually appears in the prose', () => {
  const flat = PARAGRAPHS.join(' ');
  for (const word of Object.keys(HIGHLIGHT)) {
    assert.ok(
      new RegExp(`\\b${word}\\b`).test(flat),
      `HIGHLIGHT has "${word}", which the prologue never says`,
    );
  }
});
