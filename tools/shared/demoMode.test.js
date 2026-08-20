import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRAWL_FIRST_LINE_Y,
  CRAWL_ITEM_ABOVE_LINE,
  LINE_ATTR,
  PHASE,
  STORY_PANEL_HEIGHT,
  STORY_SCROLL_IN_LINES,
  STORY_SUB,
  STORY_TOP_AT_START,
  TITLE_SUB,
  createDemoState,
  crawlFirstLineY,
  panelRestY,
  stepDemo,
} from './demoMode.js';

/** Minimal tables — the crawl content itself is not what these cover. */
function tables(storyPanels = 1) {
  return {
    lineAttrs: new Array(200).fill(0),
    leftItemIds: [],
    rightItemIds: [],
    fadeDelays: [1, 1, 1],
    storyPanels,
  };
}

/** Drop the state straight into the storyboard phase. */
function atStory(storyPanels) {
  const state = createDemoState();
  state.phase = PHASE.STORY;
  state.subphase = STORY_SUB.SCROLL_IN;
  return { state, t: tables(storyPanels) };
}

/** Run until `pred` or `limit` frames; returns frames spent. */
function runUntil(state, t, pred, limit = 60000) {
  for (let i = 0; i < limit; i += 1) {
    if (pred(state)) return i;
    stepDemo(state, t);
  }
  throw new Error('condition never reached');
}

test('one panel behaves exactly like the ROM: scroll, hold, crawl', () => {
  const { state, t } = atStory(1);
  runUntil(state, t, (s) => s.subphase === STORY_SUB.HOLD);
  assert.equal(state.contentY, STORY_SCROLL_IN_LINES);
  assert.equal(state.panel, 0);

  runUntil(state, t, (s) => s.subphase !== STORY_SUB.HOLD);
  // No second panel to visit, so the ROM's next step is the treasure crawl.
  assert.equal(state.subphase, STORY_SUB.CRAWL);
});

test('extra panels each scroll up and hold before the crawl', () => {
  const { state, t } = atStory(3);
  const seen = [];
  for (let panel = 0; panel < 3; panel += 1) {
    runUntil(state, t, (s) => s.subphase === STORY_SUB.HOLD && s.panel === panel);
    seen.push(state.contentY);
    // Leave this hold so the next iteration waits on the following one.
    stepDemo(state, t);
    runUntil(state, t, (s) => s.subphase !== STORY_SUB.HOLD);
  }
  assert.deepEqual(seen, [panelRestY(0), panelRestY(1), panelRestY(2)]);
  assert.equal(state.subphase, STORY_SUB.CRAWL);
});

test('each panel rests exactly one screen further down than the last', () => {
  assert.equal(panelRestY(0), STORY_SCROLL_IN_LINES);
  for (let i = 1; i < 5; i += 1) {
    assert.equal(panelRestY(i) - panelRestY(i - 1), STORY_PANEL_HEIGHT);
  }
});

test('the crawl starts below the last panel, not behind it', () => {
  // Single panel keeps the ROM's own constant.
  assert.equal(crawlFirstLineY(1), CRAWL_FIRST_LINE_Y);
  for (const panels of [1, 2, 4]) {
    const restY = panelRestY(panels - 1);
    assert.ok(
      crawlFirstLineY(panels) > restY,
      `crawl at ${crawlFirstLineY(panels)} would already be above the screen at scroll ${restY}`,
    );
    // And it clears the bottom edge of the last panel by the ROM's 64px gap.
    const boardBottom = STORY_TOP_AT_START + STORY_PANEL_HEIGHT * panels;
    assert.equal(crawlFirstLineY(panels) - boardBottom, 64);
  }
});

test('crawl rows are emitted at the panel-aware origin', () => {
  const { state, t } = atStory(2);
  runUntil(state, t, (s) => s.lines.length > 0, 200000);
  assert.equal(state.lines[0].y, crawlFirstLineY(2));
});

test('treasure sprites sit with the crawl, not behind an extra-tall storyboard', () => {
  const { state, t } = atStory(4);
  t.lineAttrs[0] = LINE_ATTR.ITEM;
  t.leftItemIds = [0x08];
  t.rightItemIds = [0x14];
  runUntil(state, t, (s) => s.items.length > 0, 200000);
  const expected = crawlFirstLineY(4) - CRAWL_ITEM_ABOVE_LINE;
  assert.equal(state.items[0].y, expected);
  assert.ok(
    state.items[0].y > panelRestY(3),
    'the sword would already have scrolled off by the time the labels appear',
  );
});

test('a fresh loop starts again from the first panel', () => {
  const state = createDemoState();
  state.phase = PHASE.TITLE;
  state.subphase = TITLE_SUB.FADE;
  state.panel = 2;
  const t = tables(3);
  runUntil(state, t, (s) => s.phase === PHASE.STORY);
  assert.equal(state.panel, 0);
  assert.equal(state.contentY, 0);
});
