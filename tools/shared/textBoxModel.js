/**
 * Phase 19 dialogue box — pure wrapping / pagination / typewriter model.
 *
 * The NES draws person text straight into the nametable with no wrapping: each
 * ROM string is two pre-broken lines. Our boxes take free-form prose, so the
 * model owns the line breaking, splits it into pages that fit the box, and
 * reveals it a character at a time the way `UpdatePersonState_Textbox` does
 * (one glyph every other frame).
 *
 * Nothing here touches Pixi — `game/src/play/textBox.js` renders the state.
 */

/** Glyph cell width of the NES BG charset. */
export const GLYPH_W = 8;
/** Characters per line inside the box (224px of the 256px screen). */
export const BOX_COLS = 28;
/** Lines shown per page. */
export const BOX_ROWS = 3;
/** Frames between revealed characters. */
export const REVEAL_PERIOD = 2;

/**
 * Break one paragraph into lines of at most `cols` glyphs.
 *
 * Words longer than a line are hard-split so a stray long token cannot push
 * text past the box edge.
 *
 * @param {string} text
 * @param {number} [cols=BOX_COLS]
 * @returns {string[]}
 */
export function wrapText(text, cols = BOX_COLS) {
  const width = Math.max(1, cols | 0);
  const words = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of words) {
    let w = word;
    while (w.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) {
      line = w;
    } else if (line.length + 1 + w.length <= width) {
      line += ` ${w}`;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Split content into pages of at most `rows` lines.
 *
 * An array of paragraphs never shares a page between entries — that is how
 * `story/` authors control where the "press to continue" breaks land.
 *
 * Within one paragraph the lines are spread evenly over however many pages it
 * needs, so a four-line paragraph reads 2 + 2 instead of 3 lines followed by a
 * page holding the single orphan word.
 *
 * @param {string | string[]} content
 * @param {{ cols?: number, rows?: number }} [opts]
 * @returns {string[][]} pages of lines
 */
export function paginate(content, opts = {}) {
  const cols = opts.cols ?? BOX_COLS;
  const rows = Math.max(1, (opts.rows ?? BOX_ROWS) | 0);
  const paragraphs = Array.isArray(content) ? content : [content];
  /** @type {string[][]} */
  const pages = [];
  for (const para of paragraphs) {
    const lines = wrapText(para, cols);
    if (!lines.length) continue;
    const pageCount = Math.ceil(lines.length / rows);
    const base = Math.floor(lines.length / pageCount);
    // The first `extra` pages carry one line more than the rest.
    let extra = lines.length % pageCount;
    let at = 0;
    for (let p = 0; p < pageCount; p += 1) {
      const take = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      pages.push(lines.slice(at, at + take));
      at += take;
    }
  }
  return pages;
}

/**
 * @typedef {object} TextBoxState
 * @property {boolean} active box is on screen
 * @property {string[][]} pages
 * @property {number} pageIndex
 * @property {number} revealed characters shown on the current page
 * @property {number} timer frames since the last revealed glyph
 * @property {string} kind caller tag (`cave`, `person`, `story`…)
 * @property {object | null} meta caller payload returned on close
 */

/** @returns {TextBoxState} */
export function createTextBox() {
  return {
    active: false,
    pages: [],
    pageIndex: 0,
    revealed: 0,
    timer: 0,
    kind: '',
    meta: null,
  };
}

/**
 * @param {TextBoxState} state
 * @param {string | string[]} content
 * @param {{ cols?: number, rows?: number, kind?: string, meta?: object | null }} [opts]
 * @returns {boolean} false when the content was empty (box stays closed)
 */
export function openTextBox(state, content, opts = {}) {
  const pages = paginate(content, opts).filter((page) => page.join('').trim().length > 0);
  if (!pages.length) {
    closeTextBox(state);
    return false;
  }
  state.active = true;
  state.pages = pages;
  state.pageIndex = 0;
  state.revealed = 0;
  state.timer = 0;
  state.kind = opts.kind ?? '';
  state.meta = opts.meta ?? null;
  return true;
}

/**
 * @param {TextBoxState} state
 */
export function closeTextBox(state) {
  state.active = false;
  state.pages = [];
  state.pageIndex = 0;
  state.revealed = 0;
  state.timer = 0;
  state.kind = '';
  state.meta = null;
}

/**
 * Full text of the current page (lines joined with `\n`).
 * @param {TextBoxState} state
 */
export function pageText(state) {
  return (state.pages[state.pageIndex] ?? []).join('\n');
}

/**
 * Text revealed so far on the current page.
 * @param {TextBoxState} state
 */
export function visibleText(state) {
  return pageText(state).slice(0, state.revealed);
}

/** @param {TextBoxState} state */
export function pageFullyRevealed(state) {
  return state.active && state.revealed >= pageText(state).length;
}

/** @param {TextBoxState} state */
export function isLastPage(state) {
  return state.pageIndex >= state.pages.length - 1;
}

/**
 * Advance the typewriter one frame.
 * @param {TextBoxState} state
 * @param {{ period?: number }} [opts]
 * @returns {{ revealedChars: number, finishedPage: boolean }}
 */
export function stepTextBox(state, opts = {}) {
  if (!state.active) return { revealedChars: 0, finishedPage: false };
  const full = pageText(state);
  if (state.revealed >= full.length) {
    return { revealedChars: 0, finishedPage: false };
  }
  state.timer += 1;
  const period = Math.max(1, (opts.period ?? REVEAL_PERIOD) | 0);
  if (state.timer < period) return { revealedChars: 0, finishedPage: false };
  state.timer = 0;
  let revealedChars = 0;
  // Newlines cost no frames — a line break should not stall the crawl.
  do {
    state.revealed += 1;
    revealedChars += 1;
  } while (state.revealed < full.length && full[state.revealed - 1] === '\n');
  return { revealedChars, finishedPage: state.revealed >= full.length };
}

/**
 * Player pressed the advance button.
 *
 * Mid-crawl it snaps the page fully open; on a revealed page it turns to the
 * next one, and on the last page it closes the box.
 *
 * @param {TextBoxState} state
 * @returns {{ handled: boolean, skipped: boolean, turned: boolean, closed: boolean, meta: object | null, kind: string }}
 */
export function advanceTextBox(state) {
  const idle = { handled: false, skipped: false, turned: false, closed: false, meta: null, kind: '' };
  if (!state.active) return idle;
  const { kind, meta } = state;
  if (!pageFullyRevealed(state)) {
    state.revealed = pageText(state).length;
    state.timer = 0;
    return { handled: true, skipped: true, turned: false, closed: false, meta, kind };
  }
  if (!isLastPage(state)) {
    state.pageIndex += 1;
    state.revealed = 0;
    state.timer = 0;
    return { handled: true, skipped: false, turned: true, closed: false, meta, kind };
  }
  closeTextBox(state);
  return { handled: true, skipped: false, turned: false, closed: true, meta, kind };
}
