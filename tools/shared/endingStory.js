/**
 * Resolves the ending's words: authored prose from `story/ending.js` where it
 * exists, the ROM's own strings where it does not.
 *
 * Same rule as `storyText.js` — this module is the only door between the play
 * loop and `story/`, and deleting an entry there restores the 1986 text rather
 * than blanking the screen.
 *
 * Everything comes back in the shape mode `$13` already draws: `{ row, col,
 * text }` records on fixed nametable rows. The two ROM textboxes were
 * hand-placed, so authored replacements are wrapped and centered on the rows
 * they used. The epilogue is ours and is laid out on the storyboard's body
 * rows, so it lands inside the same vine frame the prologue is baked with.
 */

import { STORY } from '../../story/index.js';
import { BODY_ROWS, TEXT_COLS, wrapPanelText } from './storyboard.js';

/** The NES nametable is 32 tiles wide. */
export const SCREEN_COLS = 32;
/** `ThanksText` starts at row 13. */
export const THANKS_FIRST_ROW = 13;
/** `PeaceText` occupies rows 21–26. */
export const PEACE_FIRST_ROW = 21;
/** Wrap width for the ending's own textboxes — narrower than the storyboard. */
export const ENDING_COLS = 24;
/** Body rows inside the vine frame, so a page cannot overrun the box. */
export const EPILOGUE_MAX_ROWS = BODY_ROWS.length;

/**
 * Greedy wrap. A word wider than the budget takes a line of its own rather
 * than being split — the charset has no hyphenation and a broken word reads as
 * a typo.
 *
 * @param {string} text
 * @param {number} [cols]
 * @returns {string[]}
 */
export function wrapEndingText(text, cols = ENDING_COLS) {
  return wrapPanelText(text, cols);
}

/**
 * Left column that centers `text` on the screen, clamped so an over-long line
 * starts at the edge instead of off it.
 * @param {string} text
 * @returns {number}
 */
export function centerCol(text) {
  return Math.max(0, (SCREEN_COLS - String(text ?? '').length) >> 1);
}

/**
 * Wrap a paragraph and center each line individually, the way the ROM's two
 * hand-placed textboxes read.
 *
 * @param {string} text
 * @param {{ topRow?: number, cols?: number }} [opts]
 * @returns {{ row: number, col: number, text: string }[]}
 */
export function layoutEndingText(text, opts = {}) {
  const topRow = opts.topRow ?? THANKS_FIRST_ROW;
  const cols = opts.cols ?? ENDING_COLS;
  return wrapEndingText(text, cols).map((line, i) => ({
    row: topRow + i,
    col: centerCol(line),
    text: line,
  }));
}

/**
 * Lay one epilogue paragraph inside the vine frame.
 *
 * Set as a block: every line shares one left margin, chosen so the widest line
 * is centered. Centering each line separately turns a paragraph into a ragged
 * diamond, which is fine for one sentence and bad for five.
 *
 * The block is also centered vertically in the frame, so a one-line closer sits
 * in the middle of the box rather than hanging off its top edge. Body rows are
 * every *other* row — see `storyboard.js` for why.
 *
 * @param {string} text
 * @returns {{ row: number, col: number, text: string }[]}
 */
export function layoutEpiloguePage(text) {
  const lines = wrapEndingText(text, TEXT_COLS).slice(0, EPILOGUE_MAX_ROWS);
  if (!lines.length) return [];
  const widest = Math.max(...lines.map((l) => l.length));
  const col = centerCol('X'.repeat(widest));
  const top = (EPILOGUE_MAX_ROWS - lines.length) >> 1;
  return lines.map((line, i) => ({ row: BODY_ROWS[top + i], col, text: line }));
}

/**
 * The string the typewriter counts through.
 *
 * Laid-out lines have already had their wrap spaces removed, so joining with a
 * single space keeps one character index valid across every line — which is
 * what `paintTextbox` assumes when it slices them.
 *
 * @param {{ text: string }[]} lines
 * @returns {string}
 */
export function flattenEndingLines(lines) {
  return (lines ?? []).map((l) => l.text).join(' ');
}

/**
 * Everything mode `$13` needs to draw, story-first with a ROM fallback.
 *
 * @param {object | null} romData `assets/extracted/play/ending.json`
 * @param {{ story?: object }} [opts]
 * @returns {{
 *   thanksLines: { row: number, col: number, text: string }[],
 *   peaceLines: { row: number, col: number, text: string }[],
 *   epiloguePages: { row: number, col: number, text: string }[][],
 * }}
 */
export function endingStory(romData, opts = {}) {
  const ending = (opts.story ?? STORY)?.ending ?? {};
  const thanks = String(ending.thanks ?? '').trim();
  const peace = String(ending.peace ?? '').trim();
  const epilogue = (ending.epilogue ?? [])
    .map((page) => String(page ?? '').trim())
    .filter(Boolean);

  return {
    thanksLines: thanks
      ? layoutEndingText(thanks, { topRow: THANKS_FIRST_ROW })
      : (romData?.thanksLines ?? []),
    peaceLines: peace
      ? layoutEndingText(peace, { topRow: PEACE_FIRST_ROW })
      : (romData?.peaceLines ?? []),
    epiloguePages: epilogue.map(layoutEpiloguePage),
  };
}
