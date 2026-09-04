import { Texture } from 'pixi.js';
import { px, tilePx } from '@shared/gfxScale.js';
import { blitCanvas, createTileCanvas, textureFromCanvas } from './scaledCanvas.js';
import { DIR } from '@shared/collision.js';
import {
  BAKED_SPRITE_PALETTE_RGB,
  remapPaletteRgba,
  spritePaletteRowsFromSet,
} from '@shared/enemyPalette.js';
import { itemSpriteLayout } from '@shared/itemFrame.js';
import { SWORD } from '@shared/inventory.js';
import { swordSpritePalette } from '@shared/inventoryIcons.js';

export { swordSpritePalette };

const TILE = 8;
const SHEET_COLS = 16;
/** common_misc is a single row of 14 tiles mapped to PPU $F2–$FF. */
const MISC_BASE = 0xf2;
/**
 * DemoSpritePatterns load at PPU $0700 during attract (`DemoPatternVramAddrs`).
 * Ladder Anim_ItemFrameTiles $76 is in that bank (local index $06).
 */
const HIGH_SPRITE_BASE = 0x70;

/** Anim_ItemFrameTiles (common_sprites $00–$6F). Horiz frames $82/$86 are
 *  outside the extract — rotate the vertical tile instead (same tip orientation). */
const CHR = Object.freeze({
  /** Swing / shot CHR for all sword tiers (HUD master icon is $48 separately). */
  SWORD_VERT: 0x20,
  ARROW_VERT: 0x28,
  /** Magical rod item / swing (Anim_ItemFrameTiles @$0F). */
  MAGIC_ROD: 0x4a,
  /**
   * Magic shot slot $23 — demo bank at PPU $70+.
   * Vert: mirrored $7A; horiz: flippable pair $7C/$7E (Anim_WriteItemSprites).
   */
  MAGIC_SHOT_VERT: 0x7a,
  MAGIC_SHOT_HORIZ: 0x7c,
  BOMB: 0x34,
  CLOUD: 0x44,
  /** Anim_ItemFrameTiles boom spin: $36 / $38 / $3A / $3C. */
  BOOMERANG: 0x36,
});

/** Boomerang flight frames (Anim_ItemFrameTiles @$22…). */
const BOOMERANG_FRAMES = Object.freeze([0x36, 0x38, 0x3a, 0x3c]);

/**
 * Item / weapon textures sliced from common_sprites (8×16 NES sprites).
 * Optional misc sheet covers Anim_ItemFrameTiles ≥ $F2 (heart drop).
 * Optional highSprite sheet covers PPU $70–$F1 (demo bank — stepladder $76,
 * magic shot $7A/$7C).
 * @param {Texture} sheetTexture
 * @param {{
 *   miscTexture?: Texture,
 *   highSpriteTexture?: Texture | null,
 *   highSpriteBase?: number,
 *   paletteSet?: { rowsRgb?: number[][][] } | null,
 * }} [opts]
 */
export function createItemSprites(sheetTexture, opts = {}) {
  /** @type {CanvasImageSource} */
  const sheetImage = /** @type {CanvasImageSource} */ (sheetTexture.source.resource);
  /** @type {CanvasImageSource | null} */
  const miscImage = opts.miscTexture
    ? /** @type {CanvasImageSource} */ (opts.miscTexture.source.resource)
    : null;
  /** @type {CanvasImageSource | null} */
  const highImage = opts.highSpriteTexture
    ? /** @type {CanvasImageSource} */ (opts.highSpriteTexture.source.resource)
    : null;
  const highBase = opts.highSpriteBase ?? HIGH_SPRITE_BASE;
  /** @type {Map<string, Texture>} */
  const cache = new Map();

  /** @type {(readonly number[])[][]} */
  let spriteRows = spritePaletteRowsFromSet(opts.paletteSet ?? null);
  /** @type {{ rowsRgb?: number[][][] } | null | undefined} */
  let activePaletteSet = opts.paletteSet ?? null;

  function palTag() {
    return activePaletteSet?.id ?? '_';
  }

  function texAt(key) {
    return cache.get(`${palTag()}:${key}`);
  }

  function rememberTex(key, tex) {
    cache.set(`${palTag()}:${key}`, tex);
    return tex;
  }

  /**
   * Swap LevelInfo palette set (OW vs dungeon). Cache keys include the set
   * id, so HUD / cave / overworld items keep their textures while a friend
   * is in a labyrinth.
   * @param {{ rowsRgb?: number[][][] } | null} paletteSet
   */
  function setPaletteSet(paletteSet) {
    if (paletteSet === activePaletteSet) return;
    activePaletteSet = paletteSet;
    spriteRows = spritePaletteRowsFromSet(paletteSet);
  }

  function tileXY(tileIndex) {
    return {
      sx: (tileIndex % SHEET_COLS) * tilePx(),
      sy: Math.floor(tileIndex / SHEET_COLS) * tilePx(),
    };
  }

  function drawSheetTile(ctx, tileIndex, dx, dy) {
    const { sx, sy } = tileXY(tileIndex);
    ctx.drawImage(sheetImage, sx, sy, tilePx(), tilePx(), dx, dy, TILE, TILE);
  }

  function drawMiscTile(ctx, ppuTile, dx, dy) {
    if (!miscImage) return;
    const idx = (ppuTile & 0xff) - MISC_BASE;
    if (idx < 0 || idx >= 14) return;
    // Older extracts marked common_misc as background (opaque black color 0).
    // Punch near-black to transparent so hearts etc. composite over terrain.
    const { canvas: tmp, ctx: tctx } = createTileCanvas(TILE, TILE);
    tctx.drawImage(miscImage, idx * tilePx(), 0, tilePx(), tilePx(), 0, 0, TILE, TILE);
    const img = tctx.getImageData(0, 0, px(TILE), px(TILE));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 8 && d[i + 1] < 8 && d[i + 2] < 8) d[i + 3] = 0;
    }
    tctx.putImageData(img, 0, 0);
    blitCanvas(ctx, tmp, dx, dy, TILE, TILE);
  }

  /** Demo / high PPU bank tile (stepladder $76, etc.). */
  function drawHighTile(ctx, ppuTile, dx, dy) {
    if (!highImage) return;
    const idx = (ppuTile & 0xff) - highBase;
    if (idx < 0) return;
    const { sx, sy } = tileXY(idx);
    ctx.drawImage(highImage, sx, sy, tilePx(), tilePx(), dx, dy, TILE, TILE);
  }

  function isHighTile(top) {
    return Boolean(highImage) && top >= highBase && top < MISC_BASE;
  }

  /**
   * Remap baked SP0 colors to the LevelInfo sprite palette row.
   * @param {HTMLCanvasElement} canvas
   * @param {number} spritePal 0–3
   */
  function applySpritePalette(canvas, spritePal) {
    if (spritePal === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = BAKED_SPRITE_PALETTE_RGB;
    const dst = spriteRows[spritePal & 3] ?? src;
    remapPaletteRgba(img.data, src, dst);
    ctx.putImageData(img, 0, 0);
  }

  /**
   * 8×16 sprite from CHR tile N (top) + N+1 (bottom), as NES 8×16 mode.
   * Vertical sword has the tip on top; rotate so tip points along `dir`.
   * Tiles ≥ $F2 come from common_misc (heart uses OAM $F3 → top $F2).
   * @param {number} tileIndex
   * @param {{ flipH?: boolean, flipV?: boolean, rotate90Cw?: boolean, rotate90Ccw?: boolean, spritePal?: number }} [drawOpts]
   */
  function sprite8x16(tileIndex, drawOpts = {}) {
    const top = tileIndex & 0xfe;
    const fromMisc = top >= MISC_BASE;
    const fromHigh = !fromMisc && isHighTile(top);
    const spritePal = drawOpts.spritePal ?? 0;
    const key = [
      fromMisc ? 'misc' : fromHigh ? 'high' : '8x16',
      top,
      drawOpts.flipH ? 1 : 0,
      drawOpts.flipV ? 1 : 0,
      drawOpts.rotate90Cw ? 1 : 0,
      drawOpts.rotate90Ccw ? 1 : 0,
      `p${spritePal}`,
    ].join(':');
    let tex = texAt(key);
    if (tex) return tex;

    const { canvas: src, ctx: sctx } = createTileCanvas(8, 16);
    if (fromMisc) {
      drawMiscTile(sctx, top, 0, 0);
      drawMiscTile(sctx, top + 1, 0, 8);
    } else if (fromHigh) {
      drawHighTile(sctx, top, 0, 0);
      drawHighTile(sctx, top + 1, 0, 8);
    } else {
      drawSheetTile(sctx, top, 0, 0);
      drawSheetTile(sctx, top + 1, 0, 8);
    }
    applySpritePalette(src, spritePal);

    const horizontal = Boolean(drawOpts.rotate90Cw || drawOpts.rotate90Ccw);
    // Widths stay in NES units: the context is pre-scaled, so reading them off
    // canvas.width (device pixels) would rotate about the wrong center.
    const outW = horizontal ? 16 : 8;
    const outH = horizontal ? 8 : 16;
    const { canvas, ctx } = createTileCanvas(outW, outH);
    ctx.translate(outW / 2, outH / 2);
    if (drawOpts.rotate90Cw) ctx.rotate(Math.PI / 2);
    if (drawOpts.rotate90Ccw) ctx.rotate(-Math.PI / 2);
    if (drawOpts.flipH) ctx.scale(-1, 1);
    if (drawOpts.flipV) ctx.scale(1, -1);
    blitCanvas(ctx, src, -4, -8, 8, 16);

    tex = textureFromCanvas(canvas);
    rememberTex(key, tex);
    return tex;
  }

  /**
   * Point a vertical tip-up 8×16 weapon along `dir` (NES RDirectionToWeaponFrame).
   * @param {number} vertTile
   * @param {number} dir
   * @param {number} [spritePal]
   */
  function orientedWeaponTexture(vertTile, dir, spritePal = 0) {
    const pal = { spritePal };
    if (dir & DIR.DOWN) {
      return sprite8x16(vertTile, { flipV: true, ...pal });
    }
    if (dir & DIR.RIGHT) {
      // Tip was on top; CW 90° points tip to the right.
      return sprite8x16(vertTile, { rotate90Cw: true, ...pal });
    }
    if (dir & DIR.LEFT) {
      return sprite8x16(vertTile, { rotate90Ccw: true, ...pal });
    }
    return sprite8x16(vertTile, pal);
  }

  /**
   * @param {number} dir
   * @param {number} [swordTier] SWORD.WOOD / WHITE / MAGIC
   */
  function swordTexture(dir, swordTier = SWORD.WOOD) {
    // NES UpdateSwordOrRod: all tiers swing tile $20; grade is palette only.
    // Inventory / status-bar master sword icon ($48) stays in swordIcon().
    return orientedWeaponTexture(
      CHR.SWORD_VERT,
      dir,
      swordSpritePalette(swordTier),
    );
  }

  /**
   * Magical rod swing — tile $4A, palette row 5 (sprite pal 1).
   * @param {number} dir
   */
  function rodTexture(dir) {
    return orientedWeaponTexture(CHR.MAGIC_ROD, dir, 1);
  }

  /** Arrow slot frames $28 / $86 — tip along `dir`. */
  function arrowTexture(dir) {
    return orientedWeaponTexture(CHR.ARROW_VERT, dir);
  }

  /**
   * Wide mirrored pair from the high/demo bank (magic shot vertical $7A).
   * @param {number} topTile
   * @param {{ flipV?: boolean, spritePal?: number }} [drawOpts]
   */
  function wideMirroredHighTexture(topTile, drawOpts = {}) {
    const top = topTile & 0xfe;
    const spritePal = drawOpts.spritePal ?? 0;
    const flipV = Boolean(drawOpts.flipV);
    const gap = 8;
    const key = `wideM:${top}:${gap}:fv${flipV ? 1 : 0}:p${spritePal}`;
    let tex = texAt(key);
    if (tex) return tex;

    const { canvas, ctx } = createTileCanvas(gap + 8, 16);
    if (flipV) {
      ctx.translate(0, 16);
      ctx.scale(1, -1);
    }
    const blit = (dx, flipH) => {
      ctx.save();
      if (flipH) {
        ctx.translate(dx + 8, 0);
        ctx.scale(-1, 1);
        dx = 0;
      }
      drawHighTile(ctx, top, dx, 0);
      drawHighTile(ctx, top + 1, dx, 8);
      ctx.restore();
    };
    blit(0, false);
    blit(gap, true);
    applySpritePalette(canvas, spritePal);
    tex = textureFromCanvas(canvas);
    rememberTex(key, tex);
    return tex;
  }

  /**
   * Wide flippable pair from the high/demo bank (magic shot horizontal $7C/$7E).
   * Anim_WriteHorizontallyFlippableSpritePair: left facing swaps sides + flip H.
   * @param {number} leftTop
   * @param {{ flipH?: boolean, spritePal?: number }} [drawOpts]
   */
  function wideFlippableHighTexture(leftTop, drawOpts = {}) {
    const left = leftTop & 0xfe;
    const right = (left + 2) & 0xfe;
    const spritePal = drawOpts.spritePal ?? 0;
    const flipH = Boolean(drawOpts.flipH);
    const gap = 8;
    const key = `wideF:${left}:${right}:${gap}:fh${flipH ? 1 : 0}:p${spritePal}`;
    let tex = texAt(key);
    if (tex) return tex;

    const { canvas, ctx } = createTileCanvas(gap + 8, 16);
    const blit = (tile, dx, flip) => {
      ctx.save();
      if (flip) {
        ctx.translate(dx + 8, 0);
        ctx.scale(-1, 1);
        dx = 0;
      }
      drawHighTile(ctx, tile, dx, 0);
      drawHighTile(ctx, tile + 1, dx, 8);
      ctx.restore();
    };
    if (flipH) {
      blit(right, 0, true);
      blit(left, gap, true);
    } else {
      blit(left, 0, false);
      blit(right, gap, false);
    }
    applySpritePalette(canvas, spritePal);
    tex = textureFromCanvas(canvas);
    rememberTex(key, tex);
    return tex;
  }

  /**
   * Magic shot `$59` — tip along `dir`.
   * Uses demo-bank beam CHR when loaded; falls back to rod stand-in otherwise.
   * @param {number} dir
   */
  function magicShotTexture(dir) {
    if (!highImage) {
      return orientedWeaponTexture(CHR.MAGIC_ROD, dir);
    }
    if (dir & (DIR.LEFT | DIR.RIGHT)) {
      return wideFlippableHighTexture(CHR.MAGIC_SHOT_HORIZ, {
        flipH: Boolean(dir & DIR.LEFT),
      });
    }
    return wideMirroredHighTexture(CHR.MAGIC_SHOT_VERT, {
      flipV: Boolean(dir & DIR.DOWN),
    });
  }

  /**
   * True when the oriented weapon texture is 16×8 (left/right).
   * @param {number} dir
   */
  function weaponTextureHorizontal(dir) {
    return Boolean(dir & (DIR.LEFT | DIR.RIGHT));
  }

  /** Placed bomb / fuse — NES DrawCloud uses blue sprite palette (slot 1). */
  function bombTexture(spritePal = 1) {
    return sprite8x16(CHR.BOMB, { spritePal });
  }

  /**
   * In-flight boomerang — spins through Anim_ItemFrameTiles $36/$38/$3A/$3C.
   * Magic boom uses sprite palette 1 (SP1 blue), same as item $1E / the submenu icon.
   * @param {number} [frameCounter]
   * @param {number} [spritePal]
   */
  function boomerangTexture(frameCounter = 0, spritePal = 0) {
    const tile = BOOMERANG_FRAMES[(frameCounter >> 1) & 3] ?? CHR.BOOMERANG;
    return sprite8x16(tile, { spritePal });
  }

  function cloudTexture() {
    return sprite8x16(CHR.CLOUD);
  }

  /** Arbitrary 8×16 item/person tile from the sheet (or misc for ≥ $F2). */
  function spriteTexture(tileIndex, spritePal = 0) {
    return sprite8x16(tileIndex & 0xff, { spritePal });
  }

  /**
   * Ground / room item: narrow 8×16 or wide mirrored pair (Anim_WriteItemSprites).
   * @param {number} tileIndex
   * @param {number} [spritePal]
   * @returns {{ texture: Texture, narrow: boolean, gap: number }}
   */
  function itemTexture(tileIndex, spritePal = 0) {
    const top = tileIndex & 0xfe;
    const layout = itemSpriteLayout(top);
    if (layout.narrow) {
      return { texture: sprite8x16(top, { spritePal }), ...layout };
    }
    const key = `wide:${top}:${layout.gap}:p${spritePal}`;
    let tex = texAt(key);
    if (!tex) {
      const { canvas, ctx } = createTileCanvas(layout.gap + 8, 16);
      const fromMisc = top >= MISC_BASE;
      const fromHigh = !fromMisc && isHighTile(top);
      const blit = (dx, flip) => {
        ctx.save();
        if (flip) {
          ctx.translate(dx + 8, 0);
          ctx.scale(-1, 1);
          dx = 0;
        }
        if (fromMisc) {
          drawMiscTile(ctx, top, dx, 0);
          drawMiscTile(ctx, top + 1, dx, 8);
        } else if (fromHigh) {
          drawHighTile(ctx, top, dx, 0);
          drawHighTile(ctx, top + 1, dx, 8);
        } else {
          drawSheetTile(ctx, top, dx, 0);
          drawSheetTile(ctx, top + 1, dx, 8);
        }
        ctx.restore();
      };
      blit(0, false);
      blit(layout.gap, true);
      applySpritePalette(canvas, spritePal);
      tex = textureFromCanvas(canvas);
      rememberTex(key, tex);
    }
    return { texture: tex, ...layout };
  }

  /**
   * Single 8×8 CHR tile (status-bar rupee/key/bomb icons are BG 8×8, not 8×16).
   * @param {number} tileIndex
   * @param {number} [spritePal]
   */
  function tile8x8(tileIndex, spritePal = 0) {
    const top = tileIndex & 0xff;
    const fromMisc = top >= MISC_BASE;
    const key = `8x8:${top}:p${spritePal}`;
    let tex = texAt(key);
    if (tex) return tex;
    const { canvas, ctx } = createTileCanvas(TILE, TILE);
    if (fromMisc) drawMiscTile(ctx, top, 0, 0);
    else drawSheetTile(ctx, top, 0, 0);
    applySpritePalette(canvas, spritePal);
    tex = textureFromCanvas(canvas);
    rememberTex(key, tex);
    return tex;
  }

  return {
    setPaletteSet,
    swordTexture,
    rodTexture,
    arrowTexture,
    magicShotTexture,
    weaponTextureHorizontal,
    bombTexture,
    boomerangTexture,
    cloudTexture,
    spriteTexture,
    itemTexture,
    tile8x8,
  };
}
