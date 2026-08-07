import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOX_COLS,
  advanceTextBox,
  closeTextBox,
  createTextBox,
  isLastPage,
  openTextBox,
  pageFullyRevealed,
  pageText,
  paginate,
  stepTextBox,
  visibleText,
  wrapText,
} from './textBoxModel.js';

test('wrapText keeps every line inside the column budget', () => {
  const text =
    'IT IS DANGEROUS TO GO ALONE THROUGH HYRULE WITH NOTHING BUT YOUR OWN TWO HANDS';
  const lines = wrapText(text, BOX_COLS);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length <= BOX_COLS, line);
  assert.equal(lines.join(' '), text);
});

test('wrapText hard-splits a word longer than the line', () => {
  const lines = wrapText('AAAAAAAAAA', 4);
  assert.deepEqual(lines, ['AAAA', 'AAAA', 'AA']);
});

test('paginate never mixes two paragraphs on one page', () => {
  const pages = paginate(['ONE TWO', 'THREE FOUR'], { cols: 20, rows: 3 });
  assert.deepEqual(pages, [['ONE TWO'], ['THREE FOUR']]);
});

test('paginate splits a long paragraph into full pages', () => {
  const words = Array.from({ length: 20 }, () => 'WORD').join(' ');
  const pages = paginate(words, { cols: 9, rows: 2 });
  // 9 cols fits two WORDs per line, 2 lines per page → 4 words a page.
  assert.equal(pages.length, 5);
  for (const page of pages) assert.ok(page.length <= 2);
});

test('paginate balances a paragraph instead of orphaning its last line', () => {
  const four = Array.from({ length: 4 }, (_, i) => `LINE${i}`).join(' ');
  // 5 cols → one word per line, 4 lines, 3 rows a page.
  assert.deepEqual(paginate(four, { cols: 5, rows: 3 }), [
    ['LINE0', 'LINE1'],
    ['LINE2', 'LINE3'],
  ]);

  const seven = Array.from({ length: 7 }, (_, i) => `LINE${i}`).join(' ');
  const pages = paginate(seven, { cols: 5, rows: 3 });
  assert.deepEqual(pages.map((p) => p.length), [3, 2, 2]);
});

test('empty content leaves the box closed', () => {
  const state = createTextBox();
  assert.equal(openTextBox(state, ['', '   ']), false);
  assert.equal(state.active, false);
});

test('typewriter reveals one glyph every other frame', () => {
  const state = createTextBox();
  openTextBox(state, 'AB', { cols: 20, rows: 3 });
  assert.equal(visibleText(state), '');
  stepTextBox(state);
  assert.equal(visibleText(state), '');
  stepTextBox(state);
  assert.equal(visibleText(state), 'A');
  stepTextBox(state);
  stepTextBox(state);
  assert.equal(visibleText(state), 'AB');
  assert.equal(pageFullyRevealed(state), true);
  // Fully revealed pages stop consuming frames.
  assert.deepEqual(stepTextBox(state), { revealedChars: 0, finishedPage: false });
});

test('newlines reveal without costing an extra frame', () => {
  const state = createTextBox();
  openTextBox(state, 'AAA BBB', { cols: 3, rows: 3 });
  assert.equal(pageText(state), 'AAA\nBBB');
  for (let i = 0; i < 8; i += 1) stepTextBox(state);
  assert.equal(visibleText(state), 'AAA\nB');
});

test('advance snaps the crawl, then turns pages, then closes', () => {
  const state = createTextBox();
  openTextBox(state, ['PAGE ONE', 'PAGE TWO'], { cols: 20, rows: 3, kind: 'story', meta: { id: 7 } });

  let res = advanceTextBox(state);
  assert.equal(res.skipped, true);
  assert.equal(visibleText(state), 'PAGE ONE');

  res = advanceTextBox(state);
  assert.equal(res.turned, true);
  assert.equal(state.pageIndex, 1);
  assert.equal(visibleText(state), '');
  assert.equal(isLastPage(state), true);

  advanceTextBox(state); // snap page two
  res = advanceTextBox(state);
  assert.equal(res.closed, true);
  assert.equal(res.kind, 'story');
  assert.deepEqual(res.meta, { id: 7 });
  assert.equal(state.active, false);
});

test('advance on a closed box is inert', () => {
  const state = createTextBox();
  const res = advanceTextBox(state);
  assert.equal(res.handled, false);
  closeTextBox(state);
  assert.equal(state.active, false);
});
