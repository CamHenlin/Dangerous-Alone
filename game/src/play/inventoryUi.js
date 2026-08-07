import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { B_ITEM } from '@shared/inventory.js';
import {
  NES_BREAKOUT_X,
  NES_B_ROW0_Y,
  NES_PASSIVE_Y,
  SUBMENU_B_SLOTS,
  bItemIcon,
  bSlotPos,
  passiveIcons,
  submenuY,
} from '@shared/inventoryIcons.js';
import {
  BOX_CHR,
  buildOwnedTriforceRows,
  submenuBoxLayout,
  submenuDungeonMapLayout,
  triforceTileRole,
} from '@shared/submenuLayout.js';
import { nesText } from './nesFont.js';
import { drawDungeonMinimap } from './minimap.js';

/** NES submenu colors (MenuPalettesTransferBuf). */
const COL = Object.freeze({
  panel: 0x000000,
  header: 0xc84c0c, // orange INVENTORY / TRIFORCE
  label: 0xfcfcfc,
  cursor: 0xfcfcfc,
  tfOutline: 0xd8d8f8, // pale lilac / white outline
  tfFill: 0xfc9838, // gold / orange fill
});

/** NES scrolls ~3px/frame from VScroll $EF → $41 (≈174px). */
const SLIDE_PX = 176;
const SLIDE_SPEED = 3;

const TILE_BLANK = 0x24;
const TILE_TF_FULL = 0xf5;

/**
 * Inventory submenu — NES DrawSubmenuItems / Submenu*TransferBuf layout.
 * Fills the top of the screen; status bar docks to the bottom while open.
 * @param {{
 *   items: ReturnType<import('./itemSprites.js').createItemSprites>,
 *   commonBg?: import('pixi.js').Texture | null,
 *   overworldBg?: import('pixi.js').Texture | null,
 * }} deps
 */
export function createInventoryUi({ items, commonBg = null, overworldBg = null }) {
  const root = new Container();
  root.visible = false;

  const maskGfx = new Graphics();
  maskGfx.rect(0, 0, 256, SLIDE_PX);
  maskGfx.fill(0xffffff);
  root.addChild(maskGfx);

  const slide = new Container();
  slide.mask = maskGfx;
  root.addChild(slide);

  const bg = new Graphics();
  slide.addChild(bg);

  const boxLayer = new Container();
  slide.addChild(boxLayer);

  const tfLayer = new Container();
  slide.addChild(tfLayer);

  const iconLayer = new Container();
  slide.addChild(iconLayer);

  const cursorGfx = new Graphics();
  slide.addChild(cursorGfx);

  const mapGfx = new Graphics();
  slide.addChild(mapGfx);

  const labels = new Container();
  slide.addChild(labels);

  /** @type {'closed' | 'opening' | 'open' | 'closing'} */
  let phase = 'closed';
  let slideOffset = SLIDE_PX;
  /** @type {object | null} */
  let lastInv = null;
  /** @type {object | null} */
  let lastView = null;
  let lastCursorFlash = -1;

  /** @type {Map<string, Texture>} */
  const tileCache = new Map();

  const commonImg = commonBg
    ? /** @type {CanvasImageSource} */ (commonBg.source.resource)
    : null;
  const owImg = overworldBg
    ? /** @type {CanvasImageSource} */ (overworldBg.source.resource)
    : null;

  /**
   * @param {CanvasImageSource | null} img
   * @param {number} sheetIndex
   * @param {'box' | 'tfOutline' | 'tfFill'} mode
   */
  function sheetTile(img, sheetIndex, mode) {
    const key = `${mode}:${sheetIndex}`;
    let tex = tileCache.get(key);
    if (tex) return tex;
    if (!img) return Texture.EMPTY;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Texture.EMPTY;
    ctx.imageSmoothingEnabled = false;
    const sx = (sheetIndex % 16) * 8;
    const sy = Math.floor(sheetIndex / 16) * 8;
    ctx.drawImage(img, sx, sy, 8, 8, 0, 0, 8, 8);
    const image = ctx.getImageData(0, 0, 8, 8);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (lum < 28) {
        d[i + 3] = 0;
        continue;
      }
      if (mode === 'box') {
        d[i] = 0x3c;
        d[i + 1] = 0x3c;
        d[i + 2] = 0xfc;
      } else if (mode === 'tfFill') {
        d[i] = 0xfc;
        d[i + 1] = 0x98;
        d[i + 2] = 0x38;
      } else {
        d[i] = 0xd8;
        d[i + 1] = 0xd8;
        d[i + 2] = 0xf8;
      }
    }
    ctx.putImageData(image, 0, 0);
    tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    tileCache.set(key, tex);
    return tex;
  }

  /** @param {number} tile */
  function boxTileTex(tile) {
    return sheetTile(commonImg, tile, 'box');
  }

  /** @param {number} ppuTile */
  function triforceTileTex(ppuTile) {
    const role = triforceTileRole(ppuTile);
    if (role === 'blank') return Texture.EMPTY;
    if (ppuTile === TILE_TF_FULL) {
      const key = 'tf:full';
      let tex = tileCache.get(key);
      if (tex) return tex;
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) return Texture.EMPTY;
      ctx.fillStyle = '#fc9838';
      ctx.fillRect(0, 0, 8, 8);
      tex = Texture.from(canvas);
      tex.source.scaleMode = 'nearest';
      tileCache.set(key, tex);
      return tex;
    }
    if (ppuTile < 0x70 || !owImg) return Texture.EMPTY;
    return sheetTile(owImg, ppuTile - 0x70, role === 'fill' ? 'tfFill' : 'tfOutline');
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  function paintBox(x, y, w, h) {
    const cols = Math.floor(w / 8);
    const rows = Math.floor(h / 8);
    if (cols < 2 || rows < 2) return;
    const place = (tile, px, py) => {
      const spr = new Sprite(boxTileTex(tile));
      spr.x = px;
      spr.y = py;
      boxLayer.addChild(spr);
    };
    place(BOX_CHR.TL, x, y);
    place(BOX_CHR.TR, x + (cols - 1) * 8, y);
    place(BOX_CHR.BL, x, y + (rows - 1) * 8);
    place(BOX_CHR.BR, x + (cols - 1) * 8, y + (rows - 1) * 8);
    for (let c = 1; c < cols - 1; c += 1) {
      place(BOX_CHR.TOP, x + c * 8, y);
      place(BOX_CHR.TOP, x + c * 8, y + (rows - 1) * 8);
    }
    for (let r = 1; r < rows - 1; r += 1) {
      place(BOX_CHR.SIDE, x, y + r * 8);
      place(BOX_CHR.SIDE, x + (cols - 1) * 8, y + r * 8);
    }
  }

  /**
   * @param {number} tile
   * @param {number} pal
   * @param {number} x
   * @param {number} y
   */
  function placeIcon(tile, pal, x, y) {
    const { texture, narrow } = items.itemTexture(tile, pal);
    const spr = new Sprite(texture);
    spr.x = narrow ? x + 4 : x;
    spr.y = y;
    iconLayer.addChild(spr);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  function drawCursor(x, y) {
    const arm = 3;
    cursorGfx.rect(x, y, arm, 1);
    cursorGfx.rect(x, y, 1, arm);
    cursorGfx.rect(x, y + 15, arm, 1);
    cursorGfx.rect(x, y + 16 - arm, 1, arm);
    cursorGfx.rect(x + 16 - arm, y, arm, 1);
    cursorGfx.rect(x + 15, y, 1, arm);
    cursorGfx.rect(x + 16 - arm, y + 15, arm, 1);
    cursorGfx.rect(x + 15, y + 16 - arm, 1, arm);
    cursorGfx.fill(COL.cursor);
  }

  /**
   * @param {number} mask
   * @param {number} topY
   */
  function paintTriforce(mask, topY) {
    tfLayer.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    const rows = buildOwnedTriforceRows(mask);
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const y = topY + r * 8;
      for (let i = 0; i < row.tiles.length; i += 1) {
        const tile = row.tiles[i];
        if (tile === TILE_BLANK) continue;
        const tex = triforceTileTex(tile);
        if (tex === Texture.EMPTY) continue;
        const spr = new Sprite(tex);
        spr.x = row.col * 8 + i * 8;
        spr.y = y;
        tfLayer.addChild(spr);
      }
    }
  }

  function applySlide() {
    slide.y = -slideOffset;
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} [rgb]
   */
  function label(text, x, y, rgb = COL.label) {
    if (!commonImg) return;
    labels.addChild(nesText(commonImg, text, x, y, rgb));
  }

  /**
   * @param {object} inv
   * @param {{ dungeon?: object | null, owRoomId?: number | null } | object | null} [view]
   */
  function render(inv, view = null) {
    lastInv = inv;
    lastView = view;
    const dungeon = view?.levelData ? view : view?.dungeon ?? null;
    const layout = submenuBoxLayout();

    bg.clear();
    bg.rect(0, 0, 256, SLIDE_PX);
    bg.fill(COL.panel);

    cursorGfx.clear();
    mapGfx.clear();
    boxLayer.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    labels.removeChildren().forEach((c) => c.destroy());
    iconLayer.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );

    label('INVENTORY', layout.inventoryTitle.x, layout.inventoryTitle.y, COL.header);

    paintBox(layout.select.x, layout.select.y, layout.select.w, layout.select.h);
    paintBox(
      layout.inventory.x,
      layout.inventory.y,
      layout.inventory.w,
      layout.inventory.h,
    );

    label('USE B BUTTON', layout.useBText.x, layout.useBText.y, COL.label);
    label('FOR THIS', layout.forThisText.x, layout.forThisText.y, COL.label);

    const selId = inv.selectedB;
    if (selId && selId !== B_ITEM.NONE) {
      const icon = bItemIcon(inv, selId);
      if (icon) placeIcon(icon.tile, icon.pal, NES_BREAKOUT_X, submenuY(NES_B_ROW0_Y));
    }

    for (const icon of passiveIcons(inv)) {
      placeIcon(icon.tile, icon.pal, icon.x, submenuY(NES_PASSIVE_Y));
    }

    for (const slot of SUBMENU_B_SLOTS) {
      const pos = bSlotPos(slot);
      const icon = bItemIcon(inv, slot.id);
      if (!icon) continue;
      placeIcon(icon.tile, icon.pal, pos.x, pos.y);
      if (slot.id === B_ITEM.BOW && inv.bow && pos.bowX != null) {
        placeIcon(0x2a, 0, pos.bowX, pos.y);
      }
    }

    // Keep submenu chrome above the docked status bar (y < SLIDE_PX).
    // TRIFORCE @ NT row 29 is 56px under the apex; clamp so the 8px glyph fits.
    const tfTextY = SLIDE_PX - 8;
    const lowerTop = Math.min(layout.triforceTop, tfTextY - 56);
    if (dungeon?.levelData) {
      tfLayer.removeChildren().forEach((c) =>
        c.destroy({ texture: false, textureSource: false }),
      );
      // LevelInfo carries its own level number (Q2 reuses maps across slots).
      // Map/compass/sheet use DrawSubmenuItems + SubmenuMapRemainder NT coords.
      const shown = dungeon.levelData.levelNumber ?? dungeon.level;
      const uwMap = submenuDungeonMapLayout();
      label(`LEVEL-${shown}`, uwMap.levelText.x, uwMap.levelText.y, COL.header);
      drawDungeonMinimap(mapGfx, dungeon.levelData, {
        visited: dungeon.visitedRooms,
        currentRoomId: dungeon.room?.roomId,
        hasMap: Boolean(inv.map),
        hasCompass: Boolean(inv.compass),
        x: uwMap.sheet.x,
        y: uwMap.sheet.y,
        cellW: uwMap.sheet.cellW,
        cellH: uwMap.sheet.cellH,
        marks: view?.dungeonMarks ?? [],
      });
      if (inv.map) placeIcon(0x4c, 1, uwMap.mapIcon.x, uwMap.mapIcon.y);
      if (inv.compass) placeIcon(0x6a, 1, uwMap.compassIcon.x, uwMap.compassIcon.y);
    } else {
      paintTriforce(inv.triforce ?? 0, lowerTop);
      label('TRIFORCE', 0x60, tfTextY, COL.header);
    }

    applySlide();
  }

  function tick() {
    if (phase === 'opening') {
      slideOffset = Math.max(0, slideOffset - SLIDE_SPEED);
      applySlide();
      if (slideOffset === 0) phase = 'open';
    } else if (phase === 'closing') {
      slideOffset = Math.min(SLIDE_PX, slideOffset + SLIDE_SPEED);
      applySlide();
      if (slideOffset >= SLIDE_PX) {
        phase = 'closed';
        root.visible = false;
      }
    }
    if ((phase === 'open' || phase === 'opening') && lastInv) {
      const flash = (Math.floor(performance.now() / 130) & 1) === 0 ? 1 : 0;
      if (flash !== lastCursorFlash) {
        lastCursorFlash = flash;
        cursorGfx.clear();
        if (flash) {
          const cursorSlot = SUBMENU_B_SLOTS.find((s) => s.id === lastInv.selectedB);
          if (cursorSlot) {
            const pos = bSlotPos(cursorSlot);
            drawCursor(pos.cursorX, pos.y);
          }
        }
      }
    }
  }

  return {
    root,
    get open() {
      return phase !== 'closed';
    },
    get phase() {
      return phase;
    },
    worldSlideY() {
      return SLIDE_PX - slideOffset;
    },
    /**
     * HUD dock progress 0 (top) → 1 (bottom) while the menu animates.
     */
    hudDockT() {
      if (phase === 'closed') return 0;
      if (phase === 'open') return 1;
      return 1 - slideOffset / SLIDE_PX;
    },
    /**
     * @param {object} inv
     * @param {{ dungeon?: object | null, owRoomId?: number | null } | object | null} [view]
     */
    toggle(inv, view = null) {
      if (phase === 'opening' || phase === 'closing') return phase !== 'closed';
      if (phase === 'open') {
        phase = 'closing';
        return true;
      }
      root.visible = true;
      phase = 'opening';
      slideOffset = SLIDE_PX;
      lastCursorFlash = -1;
      render(inv, view);
      return true;
    },
    close() {
      if (phase === 'closed') return;
      if (phase === 'opening' || phase === 'open') {
        phase = 'closed';
        slideOffset = SLIDE_PX;
        applySlide();
        root.visible = false;
        return;
      }
      phase = 'closing';
    },
    /**
     * @param {object} inv
     * @param {{ dungeon?: object | null, owRoomId?: number | null } | object | null} [view]
     */
    refresh(inv, view = null) {
      if (phase === 'closed') return;
      lastCursorFlash = -1;
      render(inv, view);
    },
    tick,
  };
}
