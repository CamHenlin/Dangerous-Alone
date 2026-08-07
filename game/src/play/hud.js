import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import { B_ITEM, heartDisplay } from '@shared/inventory.js';
import { STATUS_A_XY, STATUS_B_XY, bItemIcon, swordIcon } from '@shared/inventoryIcons.js';
import { QUEST2_SWORD_DX, QUEST2_SWORD_DY } from '@shared/nameEntry.js';
import { formatMagicKeyCount, formatStatusCount } from '@shared/statusBarText.js';
import { heartTileTexture, nesText, statusCounterIconTexture } from './nesFont.js';
import { drawDungeonMinimap, drawOverworldMinimap } from './minimap.js';

/** NES status-bar colors (MenuPalettes / LevelInfo cues). */
const COL = Object.freeze({
  life: 0xc84c0c, // same orange family as INVENTORY / original -LIFE-
  text: 0xfcfcfc,
});

/**
 * Status-bar pixel layout from StatusBarStatics / StatusBarTransferBufTemplate.
 * Coordinates are relative to the HUD container (top of bar = NT row 0).
 *
 * Counter icons are 8×8 at NT col 11; 3-char count at cols 12–14 (ends before B box @ col 15).
 * Rows: rupee NT row 3, key row 5, bomb row 6.
 */
const LAYOUT = Object.freeze({
  mapX: 16,
  mapY: 16,
  iconX: 0x58, // col 11
  countX: 0x60, // col 12
  rupeeY: 0x18, // row 3
  keyY: 0x28, // row 5
  bombY: 0x30, // row 6
  lifeX: 0xb8,
  lifeY: 0x18,
  heartX: 0xb0,
  heartRow0Y: 0x28,
  heartRow1Y: 0x30,
});

/**
 * HUD: minimap, hearts, rupee/key/bomb sprites, NES A/B items.
 * Docks to top during play and bottom while the submenu is open.
 * @param {{
 *   items?: ReturnType<import('./itemSprites.js').createItemSprites> | null,
 *   commonBg?: import('pixi.js').Texture | null,
 *   misc?: import('pixi.js').Texture | null,
 * }} [deps]
 */
export function createHud(deps = {}) {
  const items = deps.items ?? null;
  const bgImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const miscImg = deps.misc
    ? /** @type {CanvasImageSource} */ (deps.misc.source.resource)
    : null;

  const root = new Container();
  const bg = new Graphics();
  bg.rect(0, 0, 256, HUD_HEIGHT);
  bg.fill(0x000000);
  root.addChild(bg);

  const mapGfx = new Graphics();
  root.addChild(mapGfx);

  const boxLayer = new Container();
  root.addChild(boxLayer);

  const dynamic = new Container();
  root.addChild(dynamic);

  /** @type {Map<number, Texture>} */
  const boxTileCache = new Map();

  /** @type {'top' | 'bottom'} */
  let dock = 'top';
  /** @type {object | null} */
  let lastState = null;

  /**
   * @param {number} tile
   * @param {number} pal
   * @param {number} x
   * @param {number} y
   */
  function placeItem(tile, pal, x, y) {
    if (!items) return;
    const { texture, narrow } = items.itemTexture(tile, pal);
    const spr = new Sprite(texture);
    spr.x = narrow ? x + 4 : x;
    spr.y = y;
    dynamic.addChild(spr);
  }

  /**
   * Status-bar counter icon — dedicated HUD CHR ($F7/$F9/$61), not world items.
   * @param {'rupee' | 'key' | 'bomb'} kind
   * @param {number} x
   * @param {number} y
   */
  function placeCounterIcon(kind, x, y) {
    const tex = statusCounterIconTexture(kind, bgImg, miscImg);
    if (tex === Texture.EMPTY) return;
    const spr = new Sprite(tex);
    spr.x = x;
    spr.y = y;
    dynamic.addChild(spr);
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} [rgb]
   */
  function placeText(text, x, y, rgb = COL.text) {
    if (!bgImg) return;
    dynamic.addChild(nesText(bgImg, text, x, y, rgb));
  }

  /**
   * @param {'full' | 'half' | 'empty'} kind
   * @param {number} x
   * @param {number} y
   */
  function placeHeart(kind, x, y) {
    if (!bgImg) return;
    const tile = kind === 'full' ? 0xf2 : kind === 'half' ? 0x65 : 0x66;
    const tex = heartTileTexture(bgImg, miscImg, tile, kind);
    if (tex === Texture.EMPTY) return;
    const spr = new Sprite(tex);
    spr.x = x;
    spr.y = y;
    dynamic.addChild(spr);
  }

  /**
   * Status A/B boxes — StatusBarStaticsTransferBuf.
   * B: NT cols 15–17, A: cols 18–20; tops row 3, bottoms row 6 (3×3 tiles).
   */
  function paintAbBoxes() {
    boxLayer.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    if (!bgImg) return;
    const CHR = { TL: 0x69, TR: 0x6b, SIDE: 0x6c, BR: 0x6d, BL: 0x6e };
    const tileTex = (tile) => {
      let tex = boxTileCache.get(tile);
      if (tex) return tex;
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) return Texture.EMPTY;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bgImg, (tile % 16) * 8, Math.floor(tile / 16) * 8, 8, 8, 0, 0, 8, 8);
      const image = ctx.getImageData(0, 0, 8, 8);
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 16) continue;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (lum < 28) d[i + 3] = 0;
        else {
          d[i] = 0x3c;
          d[i + 1] = 0x3c;
          d[i + 2] = 0xfc;
        }
      }
      ctx.putImageData(image, 0, 0);
      tex = Texture.from(canvas);
      tex.source.scaleMode = 'nearest';
      boxTileCache.set(tile, tex);
      return tex;
    };
    const place = (tile, x, y) => {
      const spr = new Sprite(tileTex(tile));
      spr.x = x;
      spr.y = y;
      boxLayer.addChild(spr);
    };
    const topY = 0x18;
    for (const x of [0x78, 0x90]) {
      place(CHR.TL, x, topY);
      place(CHR.TR, x + 16, topY);
      place(CHR.SIDE, x, topY + 8);
      place(CHR.SIDE, x + 16, topY + 8);
      place(CHR.BL, x, topY + 16);
      place(CHR.BR, x + 16, topY + 16);
    }
  }

  /**
   * @param {object} s
   * @param {object} [s.inv]
   * @param {string} [s.location]
   * @param {'overworld'|'dungeon'|'cave'|string} [s.mode]
   * @param {number} [s.roomId]
   * @param {object | null} [s.dungeon]
   * @param {number} [s.rupeesShown] rolling counter value; defaults to the total
   */
  function update(s) {
    lastState = s;
    const inv = s.inv;
    dynamic.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
    paintAbBoxes();

    if (!inv) {
      placeText('-LIFE-', LAYOUT.lifeX, LAYOUT.lifeY, COL.life);
      mapGfx.clear();
      return;
    }

    // Rupee / key / bomb — StatusBarStatics $F7 / $F9 / $61 @ col 11;
    // FormatDecimalCountByte @ cols 12–14.
    placeCounterIcon('rupee', LAYOUT.iconX, LAYOUT.rupeeY);
    placeText(
      formatStatusCount(s.rupeesShown ?? inv.rupees),
      LAYOUT.countX,
      LAYOUT.rupeeY,
    );

    placeCounterIcon('key', LAYOUT.iconX, LAYOUT.keyY);
    placeText(
      inv.magicKey ? formatMagicKeyCount() : formatStatusCount(inv.keys),
      LAYOUT.countX,
      LAYOUT.keyY,
    );

    placeCounterIcon('bomb', LAYOUT.iconX, LAYOUT.bombY);
    placeText(formatStatusCount(inv.bombs), LAYOUT.countX, LAYOUT.bombY);

    // B / A letters are the top-center tile of each 3-wide box (col 16 / 19).
    placeText('B', 0x80, 0x18);
    placeText('A', 0x98, 0x18);

    const sw = swordIcon(inv.sword);
    if (sw) placeItem(sw.tile, sw.pal, STATUS_A_XY.x, STATUS_A_XY.y);

    if (inv.selectedB && inv.selectedB !== B_ITEM.NONE) {
      const b = bItemIcon(inv, inv.selectedB);
      if (b) placeItem(b.tile, b.pal, STATUS_B_XY.x, STATUS_B_XY.y);
    }

    placeText('-LIFE-', LAYOUT.lifeX, LAYOUT.lifeY, COL.life);

    // Hearts: up to 16 in two rows of 8 (FormatHeartsInTextBuf).
    const { full, half, empty } = heartDisplay(inv);
    const slots = [];
    for (let i = 0; i < full; i += 1) slots.push('full');
    if (half) slots.push('half');
    for (let i = 0; i < empty; i += 1) slots.push('empty');
    for (let i = 0; i < slots.length && i < 16; i += 1) {
      const row = i < 8 ? 0 : 1;
      const col = i < 8 ? i : i - 8;
      const y = row === 0 ? LAYOUT.heartRow0Y : LAYOUT.heartRow1Y;
      placeHeart(/** @type {'full'|'half'|'empty'} */ (slots[i]), LAYOUT.heartX + col * 8, y);
    }

    mapGfx.clear();
    const mode = s.mode ?? 'overworld';
    if (mode === 'dungeon' && s.dungeon?.levelData) {
      drawDungeonMinimap(mapGfx, s.dungeon.levelData, {
        visited: s.dungeon.visitedRooms,
        currentRoomId: s.dungeon.room?.roomId ?? s.roomId,
        hasMap: Boolean(inv.map),
        hasCompass: Boolean(inv.compass),
        x: LAYOUT.mapX,
        y: LAYOUT.mapY,
        cellW: 4,
        cellH: 3,
        compact: true,
      });
    } else if (mode === 'overworld' || mode === 'cave') {
      drawOverworldMinimap(mapGfx, s.roomId ?? null, {
        x: LAYOUT.mapX,
        y: LAYOUT.mapY,
        cellW: 4,
        cellH: 3,
      });
    }

    // In-game second-quest cue (file select uses the sword marker; here a
    // compact "2" sits under the minimap so it never fights the A/B boxes).
    if ((inv.quest ?? 1) === 2) {
      placeText('2', LAYOUT.mapX + QUEST2_SWORD_DX, LAYOUT.mapY + 28 + QUEST2_SWORD_DY, COL.text);
    }
  }

  /**
   * @param {'top' | 'bottom'} where
   * @param {number} [screenH=240]
   */
  function setDock(where, screenH = 240) {
    dock = where;
    root.y = where === 'bottom' ? screenH - HUD_HEIGHT : 0;
  }

  /**
   * Drop A/B item sprites before `items.setPaletteSet` destroys their textures.
   * Leaving live sprites bound to destroyed GL textures blacks the whole canvas.
   */
  function releaseItemSprites() {
    dynamic.removeChildren().forEach((c) =>
      c.destroy({ texture: false, textureSource: false }),
    );
  }

  update({});
  return {
    root,
    update,
    setDock,
    releaseItemSprites,
    get dock() {
      return dock;
    },
    /** Re-apply last state after dock changes. */
    refresh() {
      if (lastState) update(lastState);
    },
  };
}
