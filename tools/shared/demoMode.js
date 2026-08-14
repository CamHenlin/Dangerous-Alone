/**
 * Game mode `$00` — the attract sequence.
 *
 * ROM: `UpdateMode0Demo` / `InitDemo_RunTasks` / `AnimateDemo` @ `Z_02.asm:180–538`.
 * Two phases loop forever until Start is pressed:
 *
 *   phase 0 sub 0  title screen, ~512 frames (`AnimateDemoPhase0Subphase0`)
 *   phase 0 sub 1  14-step palette fade to black (`AnimateDemoPhase0Subphase1`)
 *   phase 1 sub 0  the story screen scrolls up (`AnimateDemoPhase1Subphase0`)
 *   phase 1 sub 1  256-frame hold (`AnimateDemoPhase1Subphase1`)
 *   phase 1 sub 2  the "ALL OF TREASURES" crawl (`AnimateDemoPhase1Subphase2`)
 *   phase 1 sub 3  256-frame hold, sub 4  56-frame hold, then back to phase 0
 *
 * There is **no recorded-gameplay attract demo** in this ROM: `UpdateMode0Demo`
 * has only three submodes (wait for Start, blank, load save slots) and
 * `AnimateDemoPhase1Subphase4` jumps straight back to phase 0.
 */

export const PHASE = Object.freeze({ TITLE: 0, STORY: 1 });

export const TITLE_SUB = Object.freeze({ HOLD: 0, FADE: 1 });
export const STORY_SUB = Object.freeze({
  SCROLL_IN: 0,
  HOLD: 1,
  CRAWL: 2,
  HOLD_END: 3,
  RESTART: 4,
  /**
   * Ours, not the ROM's: scroll from one storyboard panel to the next. The ROM
   * had exactly one panel, so it went straight from HOLD to CRAWL and never
   * needed this. With `storyPanels === 1` the sequence is byte-for-byte the
   * original.
   */
  PANEL_IN: 5,
});

/** `TriforceGlowingColors` @ `Z_02.asm:1006`. */
export const TRIFORCE_GLOW_COLORS = Object.freeze([0x27, 0x37, 0x37, 0x27, 0x17, 0x07, 0x07, 0x17]);
/** `TriforceGlowTimer` reload; the wrap step waits `$10` instead. */
export const GLOW_STEP_FRAMES = 6;
export const GLOW_WRAP_FRAMES = 0x10;
/** `TriforcePaletteTransferRecord` writes BG row 1, colour 2. */
export const GLOW_PALETTE_ROW = 1;
export const GLOW_PALETTE_COLOR = 2;

/** `WaterfallWaveTiles` / `WaterfallCrestTiles` / `WaterfallSpriteXs` @ `Z_02.asm:1053`. */
export const WATERFALL = Object.freeze({
  waveTiles: Object.freeze([0xb2, 0xb4, 0xb6, 0xb8]),
  crestTiles: Object.freeze([0xa2, 0xa4, 0xa6, 0xa8]),
  spriteXs: Object.freeze([0x50, 0x58, 0x60, 0x68]),
  crestY: 0xa8,
  initialWaveYs: Object.freeze([0xb6, 0xc8, 0xd8]),
  wrapY: 0xe3,
  restartY: 0xb2,
});

/** `InitDemoSubphaseTransferStoryTiles` seeds `CurVScroll = $10`. */
export const STORY_START_VSCROLL = 0x10;
/** The story nametable's first pixel row sits this far down at `contentY = 0`. */
export const STORY_TOP_AT_START = 240 - STORY_START_VSCROLL;
/** `@CheckVScroll`: wrap past `$F0`, then 8 more lines. */
export const STORY_SCROLL_IN_LINES = 0xf0 - STORY_START_VSCROLL + 8;
/** `CMP #$05` screens plus `CMP #$80` lines, all at 8 pixels per line slot. */
export const CRAWL_LINES = 5 * 256 + 0x80;
/** The final line is the exit check, not an emission — hence `DemoLineAttrs` is 175 long. */
export const CRAWL_LINE_SLOTS = CRAWL_LINES / 8 - 1;
/** One storyboard panel is one screen tall. */
export const STORY_PANEL_HEIGHT = 240;
/**
 * The crawl writes its first row at `$2900` — nametable B row 8 — while the
 * story image occupies nametable A. Nametable A row 0 is at world Y
 * `STORY_TOP_AT_START`, so B row 8 lands here.
 */
export const CRAWL_FIRST_LINE_Y = STORY_TOP_AT_START + STORY_PANEL_HEIGHT + 8 * 8;

/**
 * World Y of the crawl's first row when the storyboard is more than one panel
 * tall. The treasure list has to start below the last panel, otherwise it has
 * already scrolled past by the time the crawl begins.
 * @param {number} [panels]
 */
export function crawlFirstLineY(panels = 1) {
  const n = Math.max(1, panels | 0);
  return STORY_TOP_AT_START + STORY_PANEL_HEIGHT * n + 8 * 8;
}

/**
 * Where the strip rests with `panel` (0-based) filling the screen.
 * @param {number} panel
 */
export function panelRestY(panel) {
  return STORY_SCROLL_IN_LINES + STORY_PANEL_HEIGHT * Math.max(0, panel | 0);
}
/**
 * `ProcessDemoLineItems` spawns at `ObjY = $EF` while the current nametable
 * line is composed at the bottom of the scroll. On our strip that is the same
 * origin as text rows, raised so the 16px sprite sits above the label that
 * DemoLineAttrs emits a few slots earlier (typically 3 × 8px).
 */
export const CRAWL_ITEM_ABOVE_LINE = 40;

/** `DemoLineAttrs` bits (`Z_02.asm:377`). */
export const LINE_ATTR = Object.freeze({ TEXT: 0x80, ATTRS: 0x40, ITEM: 0x20 });

/** `DemoItemColumnX1` / `DemoItemColumnX2`, plus the two centring special cases. */
export const ITEM_COLUMN_X = Object.freeze({ left: 0x44, right: 0xac, link: 0x68, triforce: 0x78 });
/** `DemoLeftItemIds` entries `>= $30` are the Link / paper tableau, not items. */
export const FINAL_ITEM_ID_BASE = 0x30;
/** The triforce shows up in both columns; `@IncRow` overlaps them at `$78`. */
export const TRIFORCE_ITEM_ID = 0x1b;

/** `AnimateDemoPhase1Subphase3` rolls `DemoTimer` over; `…Subphase4` stops at `$39`. */
export const HOLD_FRAMES = 256;
export const RESTART_FRAMES = 0x39;

/**
 * @typedef {object} CrawlLine
 * @property {number} slot line slot index (`DemoLineIndex`)
 * @property {number} y world Y of the row's top pixel
 * @property {number} textIndex index into `DemoLineTextAddrs`, or -1
 *
 * @typedef {object} CrawlItem
 * @property {number} slot
 * @property {number} y world Y at spawn
 * @property {number} x
 * @property {number} itemId
 *
 * @typedef {object} DemoState
 * @property {number} phase
 * @property {number} subphase
 * @property {number} frame frames since the sequence started
 * @property {number} timer `DemoTimer`
 * @property {number} fadeCycle `DemoPhase0Subphase1Cycle`
 * @property {number} fadeTimer `DemoPhase0Subphase1Timer`
 * @property {number} glowCycle
 * @property {number} glowTimer
 * @property {number[]} waveYs
 * @property {number} contentY pixels the story/crawl strip has scrolled
 * @property {number} scrolledLines lines scrolled inside the crawl
 * @property {number} lineSlot `DemoLineIndex`
 * @property {number} textIndex `DemoLineTextIndex`
 * @property {number} itemRow `DemoItemRow`
 * @property {CrawlLine[]} lines
 * @property {CrawlItem[]} items
 * @property {number} loops completed attract loops
 */

/**
 * @param {{ lineAttrs?: ArrayLike<number>, leftItemIds?: ArrayLike<number>, rightItemIds?: ArrayLike<number>, fadeDelays?: ArrayLike<number> }} [tables]
 * @returns {DemoState}
 */
export function createDemoState() {
  return {
    phase: PHASE.TITLE,
    subphase: TITLE_SUB.HOLD,
    frame: 0,
    timer: 0,
    fadeCycle: 0,
    fadeTimer: 0,
    glowCycle: 0,
    glowTimer: 0,
    waveYs: [...WATERFALL.initialWaveYs],
    contentY: 0,
    scrolledLines: 0,
    lineSlot: 0,
    textIndex: 0,
    itemRow: 0,
    /** Storyboard panel currently resting on screen (0-based). */
    panel: 0,
    lines: [],
    items: [],
    loops: 0,
  };
}

/** BG palette row 1 colour 2 for the current point in the glow cycle. */
export function triforceGlowColor(state) {
  return TRIFORCE_GLOW_COLORS[state.glowCycle % TRIFORCE_GLOW_COLORS.length];
}

/**
 * `AnimateDemoPhase0Subphase0Artifacts` @ `Z_02.asm:1009`.
 * @param {DemoState} state
 */
function stepTriforceGlow(state) {
  if (state.glowTimer === 0) {
    state.glowCycle += 1;
    if (state.glowCycle === TRIFORCE_GLOW_COLORS.length) {
      state.glowTimer = GLOW_WRAP_FRAMES;
      state.glowCycle = 0;
    } else {
      state.glowTimer = GLOW_STEP_FRAMES;
    }
  }
  state.glowTimer -= 1;
}

/**
 * `UpdateSpritesForWaterfallWave` @ `Z_02.asm:1098` — +2px/frame, wrapping the
 * three waves back to the crest.
 * @param {DemoState} state
 */
function stepWaterfall(state) {
  for (let i = 0; i < state.waveYs.length; i += 1) {
    const next = state.waveYs[i] + 2;
    state.waveYs[i] = next >= WATERFALL.wrapY ? WATERFALL.restartY : next;
  }
}

/**
 * Tile offset for a wave's animation state (`< $B9` → 0, `< $C2` → 8, else `$10`).
 * @param {number} waveY
 */
export function waterfallTileOffset(waveY) {
  if (waveY >= 0xc2) return 0x10;
  if (waveY >= 0xb9) return 0x08;
  return 0;
}

/**
 * Crest tiles alternate on `FrameCounter & $08`.
 * @param {number} frame
 */
export function waterfallCrestOffset(frame) {
  return frame & 0x08;
}

/**
 * @param {DemoState} state
 * @param {ArrayLike<number>} fadeDelays `DemoPhase0Subphase1Delays`
 */
function stepTitleFade(state, fadeDelays) {
  if (state.fadeTimer === 0) {
    state.fadeCycle += 1;
    state.fadeTimer = fadeDelays[state.fadeCycle - 1] ?? 1;
    if (state.fadeCycle >= fadeDelays.length) {
      state.phase = PHASE.STORY;
      state.subphase = STORY_SUB.SCROLL_IN;
      state.timer = 0;
      state.contentY = 0;
      state.scrolledLines = 0;
      state.lineSlot = 0;
      state.textIndex = 0;
      state.itemRow = 0;
      state.panel = 0;
      state.lines = [];
      state.items = [];
      return;
    }
  }
  state.fadeTimer -= 1;
}

/**
 * The palette step currently on screen during the fade (index into
 * `DemoPhase0Subphase1Palettes`), or -1 while the plain title palette applies.
 * @param {DemoState} state
 */
export function fadePaletteIndex(state) {
  if (state.phase !== PHASE.TITLE || state.subphase !== TITLE_SUB.FADE) return -1;
  return state.fadeCycle - 1;
}

/**
 * `ProcessDemoLineItems` @ `Z_02.asm:801` — allocate one or two falling items.
 * @param {DemoState} state
 * @param {number} slot
 * @param {{ leftItemIds: ArrayLike<number>, rightItemIds: ArrayLike<number> }} tables
 */
function spawnCrawlItems(state, slot, tables) {
  const row = state.itemRow;
  const leftId = tables.leftItemIds[row];
  if (leftId == null) return;
  // Same world-Y grid as crawl text (`CRAWL_FIRST_LINE_Y + slot*8`).
  const y = CRAWL_FIRST_LINE_Y + slot * 8 - CRAWL_ITEM_ABOVE_LINE;
  if (leftId >= FINAL_ITEM_ID_BASE) {
    state.items.push({ slot, y, x: ITEM_COLUMN_X.link, itemId: leftId });
    state.itemRow += 1;
    return;
  }
  const rightId = tables.rightItemIds[row];
  const centred = leftId === TRIFORCE_ITEM_ID;
  state.items.push({
    slot,
    y,
    x: centred ? ITEM_COLUMN_X.triforce : ITEM_COLUMN_X.left,
    itemId: leftId,
  });
  if (rightId != null) {
    state.items.push({
      slot,
      y,
      x: centred ? ITEM_COLUMN_X.triforce : ITEM_COLUMN_X.right,
      itemId: rightId,
    });
  }
  state.itemRow += 1;
}

/**
 * One 8-pixel line slot of the crawl: maybe an item pair, maybe a text row.
 * @param {DemoState} state
 * @param {{ lineAttrs: ArrayLike<number>, leftItemIds: ArrayLike<number>, rightItemIds: ArrayLike<number> }} tables
 */
function emitCrawlLine(state, tables) {
  const slot = state.lineSlot;
  const attr = tables.lineAttrs[slot] ?? 0;
  if (attr & LINE_ATTR.ITEM) spawnCrawlItems(state, slot, tables);
  let textIndex = -1;
  if (attr & LINE_ATTR.TEXT) {
    textIndex = state.textIndex;
    state.textIndex += 1;
  }
  const firstY = crawlFirstLineY(tables.storyPanels ?? 1);
  state.lines.push({ slot, y: firstY + slot * 8, textIndex });
  state.lineSlot += 1;
}

/**
 * Advance the attract sequence by one frame.
 *
 * @param {DemoState} state mutated in place
 * @param {{ lineAttrs: ArrayLike<number>, leftItemIds: ArrayLike<number>, rightItemIds: ArrayLike<number>, fadeDelays: ArrayLike<number>, storyPanels?: number }} tables
 * @returns {DemoState}
 */
export function stepDemo(state, tables) {
  const odd = (state.frame & 1) === 1;
  state.frame += 1;

  if (state.phase === PHASE.TITLE) {
    stepWaterfall(state);
    if (state.subphase === TITLE_SUB.HOLD) {
      stepTriforceGlow(state);
      // `DemoTimer` ticks on odd frames and rolls over after 256 ticks.
      if (odd) {
        state.timer = (state.timer + 1) & 0xff;
        if (state.timer === 0) {
          state.subphase = TITLE_SUB.FADE;
          state.fadeCycle = 0;
          state.fadeTimer = 0;
        }
      }
      return state;
    }
    stepTitleFade(state, tables.fadeDelays);
    return state;
  }

  const storyPanels = Math.max(1, (tables.storyPanels ?? 1) | 0);

  switch (state.subphase) {
    case STORY_SUB.SCROLL_IN:
    case STORY_SUB.PANEL_IN:
      if (odd) {
        state.contentY += 1;
        if (state.contentY >= panelRestY(state.panel)) {
          state.subphase = STORY_SUB.HOLD;
          state.timer = 0;
        }
      }
      break;
    case STORY_SUB.HOLD:
      state.timer = (state.timer + 1) & 0xff;
      if (state.timer !== 0) break;
      // More prologue to read? Scroll the next panel up. Otherwise the ROM's
      // own next step, the treasure crawl.
      if (state.panel + 1 < storyPanels) {
        state.panel += 1;
        state.subphase = STORY_SUB.PANEL_IN;
      } else {
        state.subphase = STORY_SUB.CRAWL;
      }
      break;
    case STORY_SUB.CRAWL:
      if (odd) {
        state.scrolledLines += 1;
        if (state.scrolledLines >= CRAWL_LINES) {
          state.subphase = STORY_SUB.HOLD_END;
          state.timer = 0;
          break;
        }
        state.contentY += 1;
        if (state.scrolledLines % 8 === 0) emitCrawlLine(state, tables);
      }
      break;
    case STORY_SUB.HOLD_END:
      state.timer = (state.timer + 1) & 0xff;
      if (state.timer === 0) {
        state.subphase = STORY_SUB.RESTART;
        state.timer = 0;
      }
      break;
    default: {
      state.timer += 1;
      if (state.timer >= RESTART_FRAMES) {
        const loops = state.loops + 1;
        Object.assign(state, createDemoState(), { loops, frame: state.frame });
      }
      break;
    }
  }
  return state;
}

/**
 * Screen Y of a world row, given how far the strip has scrolled.
 * @param {number} worldY
 * @param {number} contentY
 */
export function screenY(worldY, contentY) {
  return worldY - contentY;
}

/** Screen Y of the story image's top pixel row. */
export function storyTopY(state) {
  return STORY_TOP_AT_START - state.contentY;
}
