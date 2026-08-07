import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREDITS_DEATHS_COLUMN,
  CREDITS_NAME_COLUMN,
  charFromEndingTile,
  creditsLinesForQuest,
  creditsRowLayout,
  creditsRowY,
  creditsScrollEnd,
  decodeCreditsLines,
  decodePeaceText,
  decodeThanksText,
  fillCreditsNameLine,
  peaceLayout,
  thanksLayout,
  vramRowCol,
} from './endingText.js';

/** The real tables, so the layout maths is checked against ROM data. */
const PAGE_MASKS = [
  0x46, 0x10, 0x90, 0x84, 0x24, 0x30, 0x01, 0x48, 0x03, 0x25, 0x05, 0x40,
];

/** Lay bytes into a sparse buffer at `base`. */
function blob(base, bytes) {
  const buf = new Uint8Array(base + bytes.length);
  buf.set(bytes, base);
  return buf;
}

test('the dialogue charset maps letters, digits and punctuation', () => {
  assert.equal(charFromEndingTile(0x0a), 'A');
  assert.equal(charFromEndingTile(0x23), 'Z');
  assert.equal(charFromEndingTile(0x05), '5');
  assert.equal(charFromEndingTile(0x24), ' ');
  assert.equal(charFromEndingTile(0x28), ',');
  assert.equal(charFromEndingTile(0x2a), "'");
  assert.equal(charFromEndingTile(0x2c), '.');
});

test('line-control bits are stripped before the charset lookup', () => {
  assert.equal(charFromEndingTile(0x8e), 'E');
  assert.equal(charFromEndingTile(0xec), '.');
});

test('credits tiles reach glyphs the six-bit charset cannot', () => {
  assert.equal(charFromEndingTile(0x63, true), '.');
  assert.equal(charFromEndingTile(0x62, true), '-');
  assert.equal(charFromEndingTile(0xfc, true), '©');
});

test('ThanksText splits on the line-control bits', () => {
  // "THANKS LINK,YOU'RE" / "THE HERO OF HYRULE."
  const bytes = [
    0x1d, 0x11, 0x0a, 0x17, 0x14, 0x1c, 0x24, 0x15, 0x12, 0x17, 0x14, 0x28,
    0x22, 0x18, 0x1e, 0x2a, 0x1b, 0x8e, 0x64, 0x1d, 0x11, 0x0e, 0x24, 0x11,
    0x0e, 0x1b, 0x18, 0x24, 0x18, 0x0f, 0x24, 0x11, 0x22, 0x1b, 0x1e, 0x15,
    0x0e, 0xec,
  ];
  assert.deepEqual(decodeThanksText(blob(0x20, bytes), 0x20), [
    "THANKS LINK,YOU'RE",
    'THE HERO OF HYRULE.',
  ]);
});

test('PeaceText runs to $FF and breaks after each sentence', () => {
  // "FINALLY,PEACE." / "THE END."
  const bytes = [
    0x0f, 0x12, 0x17, 0x0a, 0x15, 0x15, 0x22, 0x28, 0x19, 0x0e, 0x0a, 0x0c,
    0x0e, 0x2c, 0x1d, 0x11, 0x0e, 0x24, 0x0e, 0x17, 0x0d, 0x2c, 0xff, 0x0a,
  ];
  assert.deepEqual(decodePeaceText(blob(4, bytes), 4), [
    'FINALLY,PEACE.',
    'THE END.',
  ]);
});

test('credits records carry their own length and column', () => {
  // Two records: "AB" at column 5, then "C" at column 13.
  const bytes = [0x02, 0x05, 0x0a, 0x0b, 0x01, 0x0d, 0x0c];
  const lines = decodeCreditsLines(blob(0, bytes), 0, [0, 4]);
  assert.deepEqual(lines, [
    { index: 0, column: 5, text: 'AB' },
    { index: 1, column: 13, text: 'C' },
  ]);
});

const GATING = { maxLineIndex: 23, quest1SkipFrom: 16, quest2SkipRange: [12, 16] };
const ALL_LINES = Array.from({ length: 24 }, (_, index) => ({
  index,
  column: 0,
  text: `L${index}`,
}));

test('quest 1 credits stop before the congratulation block', () => {
  const shown = creditsLinesForQuest(ALL_LINES, 1, GATING).map((l) => l.index);
  assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
});

test('quest 2 credits swap the "another quest" block for the congratulation', () => {
  const shown = creditsLinesForQuest(ALL_LINES, 2, GATING).map((l) => l.index);
  assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22]);
});

test('line index $17 and beyond is never drawn', () => {
  for (const quest of [1, 2]) {
    const shown = creditsLinesForQuest(ALL_LINES, quest, GATING);
    assert.equal(shown.some((l) => l.index >= 23), false);
  }
});

test('the name line splices in the profile name and death count', () => {
  const line = { index: 17, column: 9, text: '         -   ' };
  const filled = fillCreditsNameLine(line, 'link', 7);
  assert.equal(filled.slice(CREDITS_NAME_COLUMN - line.column, 4 + 0), 'LINK');
  assert.equal(filled.slice(CREDITS_DEATHS_COLUMN - line.column).trim(), '7');
});

test('the death count clamps to the $FF the ROM stores', () => {
  const line = { index: 17, column: 9, text: '         -   ' };
  assert.equal(fillCreditsNameLine(line, 'ZELDA', 999).trim().endsWith('255'), true);
  assert.equal(fillCreditsNameLine(line, 'ZELDA', -5).trim().endsWith('0'), true);
});

test('a nametable address splits into a row and column', () => {
  assert.deepEqual(vramRowCol(0x21, 0xa4), { row: 13, col: 4 });
  assert.deepEqual(vramRowCol(0x22, 0xac), { row: 21, col: 12 });
  assert.deepEqual(vramRowCol(0x23, 0x46), { row: 26, col: 6 });
});

test('the thanks lines land on consecutive rows at column 4', () => {
  const layout = thanksLayout(['ONE', 'TWO'], [0xc4, 0xe4, 0xa4]);
  assert.deepEqual(layout, [
    { row: 13, col: 4, text: 'ONE' },
    { row: 14, col: 4, text: 'TWO' },
  ]);
});

test('the peace text breaks wherever its address table jumps', () => {
  const addrs = [0xac, 0xad, 0xe4, 0xe5, 0x46, 0x47];
  assert.deepEqual(peaceLayout('ABCDEF', addrs), [
    { row: 21, col: 12, text: 'AB' },
    { row: 23, col: 4, text: 'CD' },
    { row: 26, col: 6, text: 'EF' },
  ]);
});

test('the roll is 90 rows and every mask bit gets a credits line', () => {
  const { rows, totalRows } = creditsRowLayout(PAGE_MASKS);
  assert.equal(totalRows, 90);
  assert.equal(rows.length, 23);
  assert.deepEqual(rows.slice(0, 4), [1, 5, 6, 11]);
  assert.equal(rows[22], 85);
});

test('rows come out strictly increasing', () => {
  const { rows } = creditsRowLayout(PAGE_MASKS);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i] > rows[i - 1]);
});

test('a row scrolls in exactly one screen below the top of the roll', () => {
  assert.equal(creditsRowY(0), 240);
  assert.equal(creditsRowY(10), 320);
});

test('quest 1 stops the roll 120 pixels short of quest 2', () => {
  assert.deepEqual(creditsScrollEnd([2, 3], [0x78, 0x00]), {
    quest1: 600,
    quest2: 720,
  });
});

test('every line quest 1 draws has scrolled into view by the end', () => {
  const { rows } = creditsRowLayout(PAGE_MASKS);
  const { quest1 } = creditsScrollEnd([2, 3], [0x78, 0x00]);
  const lines = Array.from({ length: 23 }, (_, index) => ({ index, column: 0, text: '' }));
  for (const line of creditsLinesForQuest(lines, 1, GATING)) {
    assert.ok(creditsRowY(rows[line.index]) < quest1 + 240);
  }
});
