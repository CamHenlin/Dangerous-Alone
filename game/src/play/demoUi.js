import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tilePx } from '@shared/gfxScale.js';
import { createTileCanvas, textureFromCanvas } from './scaledCanvas.js';

import {
  FINAL_ITEM_ID_BASE,
  PHASE,
  STORY_PANEL_HEIGHT,
  STORY_SUB,
  STORY_TOP_AT_START,
  TITLE_SUB,
  WATERFALL,
  createDemoState,
  fadePaletteIndex,
  stepDemo,
  waterfallCrestOffset,
  waterfallTileOffset,
} from '@shared/demoMode.js';
import { chrTileForItemId } from '@shared/itemFrame.js';
import { itemDrawPalette } from '@shared/itemDrawPalette.js';
import { nesText, nesTile } from './nesFont.js';

const SCREEN_W = 256;
const SCREEN_H = 240;
const TILE = 8;
const SHEET_COLS = 16;
/** Demo sprites are transferred to PPU `$0700` → tile `$70`. */
const DEFAULT_SPRITE_BASE = 0x70;
const WHITE = 0xfcfcfc;

/**
 * Game mode `$00` — attract / demo sequence.
 *
 * @param {object} deps
 * @param {import('pixi.js').Texture | null} [deps.demoSprites] demo_sprites sheet
 * @param {import('pixi.js').Texture | null} [deps.titleBg] composed title nametable
 * @param {import('pixi.js').Texture | null} [deps.storyBg] composed storyboard nametable
 * @param {{ itemTexture: (tile: number, pal?: number) => { texture: import('pixi.js').Texture } } | null} [deps.items]
 * @param {object | null} [deps.data] `assets/extracted/play/demo.json`
 * @param {import('pixi.js').Texture | null} [deps.commonBg] common_background (nesFont)
 */
export function createDemoUi(deps = {}) {
  const data = deps.data ?? null;
  const spriteBase = data?.demoSpriteTileBase ?? DEFAULT_SPRITE_BASE;
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const spriteImg = deps.demoSprites
    ? /** @type {CanvasImageSource} */ (deps.demoSprites.source.resource)
    : null;

  const root = new Container();
  root.visible = false;

  /** Fixed full-screen black so HUD / world never show through the crawl. */
  const screenBg = new Graphics();
  screenBg.rect(0, 0, SCREEN_W, SCREEN_H);
  screenBg.fill(0x000000);
  root.addChild(screenBg);

  const titleLayer = new Container();
  root.addChild(titleLayer);

  const titleBg = new Graphics();
  titleLayer.addChild(titleBg);

  /** @type {Sprite | null} */
  let titleSheet = null;
  if (deps.titleBg) {
    titleSheet = new Sprite(deps.titleBg);
    titleSheet.x = 0;
    titleSheet.y = 0;
    titleLayer.addChild(titleSheet);
  }

  const waterfallLayer = new Container();
  titleLayer.addChild(waterfallLayer);

  const fadeWash = new Graphics();
  titleLayer.addChild(fadeWash);

  /**
   * Scrolling strip in world space. `y = -contentY` so a child at world Y `w`
   * lands at screen Y `w - contentY` (`screenY` in demoMode.js).
   */
  const storyLayer = new Container();
  storyLayer.visible = false;
  root.addChild(storyLayer);

  /**
   * The storyboard strip. `story/prologue.js` renders to a PNG that is a whole
   * number of screens tall; the ROM's own `StoryTileAttrTransferBuf` render is
   * exactly one. Either way the panel count falls out of the height, and the
   * attract sequence scrolls through that many panels before the crawl.
   */
  let storyPanels = 1;
  if (deps.storyBg) {
    const storyBoard = new Sprite(deps.storyBg);
    storyBoard.x = 0;
    storyBoard.y = STORY_TOP_AT_START;
    storyLayer.addChild(storyBoard);
    storyPanels = Math.max(1, Math.round(deps.storyBg.height / STORY_PANEL_HEIGHT));
  }

  const crawlTextLayer = new Container();
  storyLayer.addChild(crawlTextLayer);

  const crawlItemLayer = new Container();
  storyLayer.addChild(crawlItemLayer);

  /**
   * Crawl item sprites keep their itemId so flashing palettes can refresh.
   * @type {{ spr: Sprite, itemId: number, baseX: number }[]}
   */
  let crawlItemSprites = [];

  /** @type {ReturnType<typeof createDemoState>} */
  let state = createDemoState();
  let wantTitleMusic = false;
  let paintedLines = 0;
  let paintedItems = 0;

  /** @type {Map<string, Texture>} */
  const spriteTileCache = new Map();

  function tables() {
    return {
      lineAttrs: data?.lineAttrs ?? [],
      leftItemIds: data?.leftItemIds ?? [],
      rightItemIds: data?.rightItemIds ?? [],
      fadeDelays: data?.fadeDelays ?? [8, 8, 6, 5, 4, 3, 2, 2, 2, 0xc0, 6, 4, 0xc0, 3],
      storyPanels,
    };
  }

  /**
   * 8×16 sprite texture from the demo_sprites sheet (NES tile index).
   * @param {number} nesTile even top tile
   */
  function demoSpriteTexture(nesTile) {
    if (!spriteImg) return Texture.EMPTY;
    const top = nesTile & 0xfe;
    const key = `d16:${top}`;
    let tex = spriteTileCache.get(key);
    if (tex) return tex;
    const sheetIndex = top - spriteBase;
    if (sheetIndex < 0) return Texture.EMPTY;
    const { canvas, ctx } = createTileCanvas(TILE, TILE * 2);
    for (let part = 0; part < 2; part += 1) {
      const idx = sheetIndex + part;
      const sx = (idx % SHEET_COLS) * tilePx();
      const sy = Math.floor(idx / SHEET_COLS) * tilePx();
      ctx.drawImage(spriteImg, sx, sy, tilePx(), tilePx(), 0, part * TILE, TILE, TILE);
    }
    tex = textureFromCanvas(canvas);
    spriteTileCache.set(key, tex);
    return tex;
  }

  function paintTitleBackdrop() {
    titleBg.clear();
    // Title palette colour 0 is NES `$36`; keep a dark fill only if the PNG is missing.
    if (!titleSheet) {
      titleBg.rect(0, 0, SCREEN_W, SCREEN_H);
      titleBg.fill(0x000018);
    }
  }

  function clearWaterfall() {
    waterfallLayer.removeChildren().forEach((c) => c.destroy());
  }

  function syncWaterfall() {
    clearWaterfall();
    if (!spriteImg) return;
    const crestOff = waterfallCrestOffset(state.frame);
    for (let i = 0; i < WATERFALL.crestTiles.length; i += 1) {
      const spr = new Sprite(demoSpriteTexture(WATERFALL.crestTiles[i] + crestOff));
      spr.x = WATERFALL.spriteXs[i];
      spr.y = WATERFALL.crestY;
      waterfallLayer.addChild(spr);
    }
    for (let w = 0; w < state.waveYs.length; w += 1) {
      const y = state.waveYs[w];
      const off = waterfallTileOffset(y);
      for (let i = 0; i < WATERFALL.waveTiles.length; i += 1) {
        const spr = new Sprite(demoSpriteTexture(WATERFALL.waveTiles[i] + off));
        spr.x = WATERFALL.spriteXs[i];
        spr.y = y;
        waterfallLayer.addChild(spr);
      }
    }
  }

  function syncFade() {
    const idx = fadePaletteIndex(state);
    fadeWash.clear();
    if (idx < 0) {
      fadeWash.alpha = 0;
      return;
    }
    const steps = data?.fadeDelays?.length ?? 14;
    const t = Math.min(1, (idx + 1) / steps);
    fadeWash.rect(0, 0, SCREEN_W, SCREEN_H);
    fadeWash.fill(0x000000);
    fadeWash.alpha = t * t;
  }

  /**
   * Paint one crawl label. Prefer raw BG `tiles` so space padding ($24) keeps
   * the right-hand word under the right item column — string whitespace is a
   * lossy view of the nametable line.
   */
  function paintCrawlField(field, y) {
    if (!fontImg || !field) return;
    const col = field.column ?? 0;
    if (Array.isArray(field.tiles) && field.tiles.length) {
      for (let i = 0; i < field.tiles.length; i += 1) {
        const tile = field.tiles[i] & 0xff;
        // Skip blank padding tiles; decorative borders still get a glyph if
        // they exist in the BG sheet (nesTile colourises whatever is there).
        if (tile === 0x24 || tile === 0x25) continue;
        crawlTextLayer.addChild(nesTile(fontImg, tile, (col + i) * TILE, y, WHITE));
      }
      return;
    }
    if (!field.text) return;
    crawlTextLayer.addChild(nesText(fontImg, field.text, col * TILE, y, WHITE));
  }

  function crawlActive() {
    return (
      state.phase === PHASE.STORY &&
      (state.subphase === STORY_SUB.CRAWL ||
        state.subphase === STORY_SUB.HOLD_END ||
        state.subphase === STORY_SUB.RESTART)
    );
  }

  function appendCrawlLines() {
    if (!crawlActive() || !fontImg || !data?.textLines) return;
    while (paintedLines < state.lines.length) {
      const line = state.lines[paintedLines];
      paintedLines += 1;
      if (line.textIndex < 0) continue;
      paintCrawlField(data.textLines[line.textIndex], line.y);
    }
  }

  function appendCrawlItems() {
    if (!crawlActive() || !deps.items) return;
    while (paintedItems < state.items.length) {
      const item = state.items[paintedItems];
      paintedItems += 1;
      if (item.itemId >= FINAL_ITEM_ID_BASE) continue;
      const tile = chrTileForItemId(item.itemId);
      const pal = itemDrawPalette(item.itemId, state.frame);
      const drawn = deps.items.itemTexture(tile, pal);
      const spr = new Sprite(drawn.texture);
      const baseX = item.x + (drawn.narrow ? 4 : 0);
      spr.x = baseX;
      spr.y = item.y;
      crawlItemLayer.addChild(spr);
      crawlItemSprites.push({ spr, itemId: item.itemId, baseX });
    }
  }

  /** Refresh flashing item palettes (heart / rupee / heart container). */
  function syncCrawlItemPalettes() {
    if (!deps.items) return;
    for (const entry of crawlItemSprites) {
      const tile = chrTileForItemId(entry.itemId);
      const pal = itemDrawPalette(entry.itemId, state.frame);
      const drawn = deps.items.itemTexture(tile, pal);
      entry.spr.texture = drawn.texture;
      // Fairy flickers like AnimateStationaryFairy.
      if (entry.itemId === 0x23) {
        entry.spr.alpha = state.frame & 4 ? 1 : 0.85;
        const frameTile = state.frame & 8 ? 0x52 : 0x50;
        entry.spr.texture = deps.items.itemTexture(frameTile, pal).texture;
      } else {
        entry.spr.alpha = 1;
      }
    }
  }

  /** Hide item sprites that have scrolled off the top of the screen. */
  function cullCrawlItems() {
    for (const entry of crawlItemSprites) {
      const screen = entry.spr.y + storyLayer.y;
      entry.spr.visible = screen > -16 && screen < SCREEN_H;
    }
  }

  function resetCrawlPaint() {
    crawlTextLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    crawlItemLayer.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    crawlItemSprites = [];
    paintedLines = 0;
    paintedItems = 0;
  }

  function begin() {
    state = createDemoState();
    wantTitleMusic = true;
    paintTitleBackdrop();
    resetCrawlPaint();
    titleLayer.visible = true;
    storyLayer.visible = false;
    storyLayer.y = 0;
    fadeWash.alpha = 0;
    root.visible = true;
    syncWaterfall();
  }

  function hide() {
    root.visible = false;
  }

  /**
   * @param {{ start?: boolean }} [input]
   * @returns {{ finished: boolean, playTitleMusic?: boolean }}
   */
  function tick(input = {}) {
    if (!root.visible) return { finished: false };

    if (input.start) {
      return { finished: true };
    }

    const prevLoops = state.loops;
    stepDemo(state, tables());
    if (state.loops !== prevLoops) {
      resetCrawlPaint();
      wantTitleMusic = true;
    }

    const onTitle = state.phase === PHASE.TITLE;
    titleLayer.visible = onTitle;
    storyLayer.visible = !onTitle;

    if (onTitle) {
      syncWaterfall();
      syncFade();
      if (titleSheet) {
        titleSheet.tint = state.subphase === TITLE_SUB.FADE ? 0x888888 : 0xffffff;
      }
    } else {
      storyLayer.y = -state.contentY;
      const showCrawl = crawlActive();
      crawlTextLayer.visible = showCrawl;
      crawlItemLayer.visible = showCrawl;
      if (showCrawl) {
        appendCrawlLines();
        appendCrawlItems();
        syncCrawlItemPalettes();
        cullCrawlItems();
      }
    }

    const playTitleMusic = wantTitleMusic && onTitle;
    if (playTitleMusic) wantTitleMusic = false;

    return { finished: false, playTitleMusic };
  }

  return {
    root,
    begin,
    hide,
    tick,
    get visible() {
      return root.visible;
    },
    get state() {
      return state;
    },
  };
}
