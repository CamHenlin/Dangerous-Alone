import { Texture } from 'pixi.js';
import { DIR } from '@shared/collision.js';
import {
  BAKED_SPRITE_PALETTE_RGB,
  remapPaletteRgba,
} from '@shared/enemyPalette.js';
import { linkPaletteRgb } from '@shared/linkPalette.js';
import { linkWalkSprite } from '@shared/linkMotion.js';
import { swordAttackBaseTile } from '@shared/sword.js';

const TILE = 8;
const SHEET_COLS = 16;
/**
 * `DrawLinkLiftingItem` / Anim_ItemFrameTiles @$28 — mirrored pair at PPU $78.
 * Lives in the high sprite bank (demo extract at local $08), not common_sprites.
 */
const LIFT_PPU_TILE = 0x78;
const HIGH_SPRITE_BASE = 0x70;

/**
 * Build 16×16 Link walk/attack textures from the common_sprites sheet.
 * Sheets bake SP0 green; runtime remaps to LevelInfo SP0 with the tunic
 * color patched from `InvRing` (NES `LinkColors`).
 *
 * @param {Texture} sheetTexture
 * @param {{
 *   paletteSet?: { rowsRgb?: number[][][] } | null,
 *   ring?: number,
 *   highSpriteTexture?: Texture | null,
 *   highSpriteBase?: number,
 * }} [opts]
 */
export function createLinkFrames(sheetTexture, opts = {}) {
  /** @type {CanvasImageSource} */
  const sheetImage = /** @type {CanvasImageSource} */ (sheetTexture.source.resource);
  /** @type {CanvasImageSource | null} */
  const highImage = opts.highSpriteTexture
    ? /** @type {CanvasImageSource} */ (opts.highSpriteTexture.source.resource)
    : null;
  const highBase = opts.highSpriteBase ?? HIGH_SPRITE_BASE;
  /** @type {Map<string, Texture>} */
  const cache = new Map();

  /** @type {{ rowsRgb?: number[][][] } | null | undefined} */
  let activePaletteSet = opts.paletteSet ?? null;
  let ring = opts.ring ?? 0;

  function clearCache() {
    for (const tex of cache.values()) {
      tex.destroy(true);
    }
    cache.clear();
  }

  /**
   * @param {{ rowsRgb?: number[][][] } | null} paletteSet
   */
  function setPaletteSet(paletteSet) {
    if (paletteSet === activePaletteSet) return;
    activePaletteSet = paletteSet;
    clearCache();
  }

  /**
   * @param {number} next InvRing 0/1/2
   * @returns {boolean} true if the ring tier changed (cache cleared)
   */
  function setRing(next) {
    const r = Math.max(0, Math.min(2, Number(next) || 0));
    if (r === ring) return false;
    ring = r;
    clearCache();
    return true;
  }

  function tileXY(tileIndex) {
    return {
      sx: (tileIndex % SHEET_COLS) * TILE,
      sy: Math.floor(tileIndex / SHEET_COLS) * TILE,
    };
  }

  /**
   * Remap baked SP0 colors to Link's live SP0 (tunic patched by ring).
   * @param {HTMLCanvasElement} canvas
   */
  function applyLinkPalette(canvas) {
    const src = BAKED_SPRITE_PALETTE_RGB;
    const dst = linkPaletteRgb(activePaletteSet, ring);
    let same = true;
    for (let i = 1; i < 4; i += 1) {
      if (dst[i][0] !== src[i][0] || dst[i][1] !== src[i][1] || dst[i][2] !== src[i][2]) {
        same = false;
        break;
      }
    }
    if (same) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    remapPaletteRgba(img.data, src, dst);
    ctx.putImageData(img, 0, 0);
  }

  function compose(baseTile, flipH) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    ctx.imageSmoothingEnabled = false;
    if (flipH) {
      ctx.translate(16, 0);
      ctx.scale(-1, 1);
    }
    const drawTile = (tileIndex, dx, dy) => {
      const { sx, sy } = tileXY(tileIndex);
      ctx.drawImage(sheetImage, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
    };
    drawTile(baseTile, 0, 0);
    drawTile(baseTile + 1, 0, 8);
    drawTile(baseTile + 2, 8, 0);
    drawTile(baseTile + 3, 8, 8);
    applyLinkPalette(canvas);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    return tex;
  }

  function getTexture(baseTile, flipH) {
    const key = `${baseTile}:${flipH ? 1 : 0}:r${ring}`;
    let tex = cache.get(key);
    if (!tex) {
      tex = compose(baseTile, flipH);
      cache.set(key, tex);
    }
    return tex;
  }

  /**
   * @param {number} dir
   * @param {number} animFrame
   * @param {boolean} [attacking]
   */
  function textureFor(dir, animFrame, attacking = false) {
    if (attacking) {
      const baseTile = swordAttackBaseTile(dir);
      const flipH = Boolean(dir & DIR.LEFT);
      return getTexture(baseTile, flipH);
    }
    const { baseTile, flipH } = linkWalkSprite(dir, animFrame);
    return getTexture(baseTile, flipH);
  }

  /**
   * Both-arms-up TakeItem / Triforce pose (`DrawLinkLiftingItem`).
   * Falls back to facing-down walk when the high bank sheet is missing.
   */
  function textureForLift() {
    if (!highImage) {
      return getTexture(0x08, false);
    }
    const key = `lift:${LIFT_PPU_TILE}:r${ring}`;
    let tex = cache.get(key);
    if (!tex) {
      tex = composeLift();
      cache.set(key, tex);
    }
    return tex;
  }

  /** Mirrored 8×16 pair: left $78/$79, right H-flipped copy. */
  function composeLift() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    ctx.imageSmoothingEnabled = false;
    const local = (LIFT_PPU_TILE - highBase) & 0xff;
    const blit = (tileIndex, dx, dy, flipH) => {
      const { sx, sy } = tileXY(tileIndex);
      if (flipH) {
        ctx.save();
        ctx.translate(dx + TILE, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(highImage, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
        ctx.restore();
      } else {
        ctx.drawImage(highImage, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
      }
    };
    blit(local, 0, 0, false);
    blit(local + 1, 0, TILE, false);
    blit(local, TILE, 0, true);
    blit(local + 1, TILE, TILE, true);
    applyLinkPalette(canvas);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    return tex;
  }

  return { textureFor, textureForLift, setPaletteSet, setRing };
}
