import { Texture } from 'pixi.js';
import { DIR } from '@shared/collision.js';
import {
  BAKED_SPRITE_PALETTE_RGB,
  remapPaletteRgba,
} from '@shared/enemyPalette.js';
import { linkPaletteRgb } from '@shared/linkPalette.js';
import { linkWalkSprite } from '@shared/linkMotion.js';
import { markScaled, tilePx } from '@shared/gfxScale.js';
import { swordAttackBaseTile } from '@shared/sword.js';

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
      sx: (tileIndex % SHEET_COLS) * tilePx(),
      sy: Math.floor(tileIndex / SHEET_COLS) * tilePx(),
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

  /**
   * Blit one 8×16 CHR pair (top tile + top+1) at (dx,0), optionally H-flipped
   * in place (NES sprite attribute bit, not a whole-metatile mirror).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} topTile
   * @param {number} dx
   * @param {boolean} flipH
   * @param {number} T
   */
  function drawHalf(ctx, topTile, dx, flipH, T) {
    const blit = (tileIndex, dy) => {
      const { sx, sy } = tileXY(tileIndex);
      if (flipH) {
        ctx.save();
        ctx.translate(dx + T, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(sheetImage, sx, sy, T, T, 0, 0, T, T);
        ctx.restore();
      } else {
        ctx.drawImage(sheetImage, sx, sy, T, T, dx, dy, T, T);
      }
    };
    blit(topTile, 0);
    blit(topTile + 1, T);
  }

  /**
   * @param {number} leftTile
   * @param {number} rightTile
   * @param {boolean} flipLeft
   * @param {boolean} flipRight
   */
  function compose(leftTile, rightTile, flipLeft, flipRight) {
    const T = tilePx();
    const canvas = document.createElement('canvas');
    canvas.width = T * 2;
    canvas.height = T * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    ctx.imageSmoothingEnabled = false;
    drawHalf(ctx, leftTile, 0, flipLeft, T);
    drawHalf(ctx, rightTile, T, flipRight, T);
    applyLinkPalette(canvas);
    return markScaled(Texture.from(canvas));
  }

  /**
   * @param {number} leftTile
   * @param {number} rightTile
   * @param {boolean} flipLeft
   * @param {boolean} flipRight
   */
  function getTexture(leftTile, rightTile, flipLeft, flipRight) {
    const key = `${leftTile}:${rightTile}:${flipLeft ? 1 : 0}${flipRight ? 1 : 0}:r${ring}`;
    let tex = cache.get(key);
    if (!tex) {
      tex = compose(leftTile, rightTile, flipLeft, flipRight);
      cache.set(key, tex);
    }
    return tex;
  }

  /**
   * @param {number} dir
   * @param {number} animFrame
   * @param {boolean | { attacking?: boolean, magicShield?: boolean }} [attackingOrOpts]
   */
  function textureFor(dir, animFrame, attackingOrOpts = false) {
    const opts =
      typeof attackingOrOpts === 'object' && attackingOrOpts
        ? attackingOrOpts
        : { attacking: Boolean(attackingOrOpts) };
    if (opts.attacking) {
      const baseTile = swordAttackBaseTile(dir);
      const flipH = Boolean(dir & DIR.LEFT);
      // Attack frames stay shieldless (NES skips patch when tile ≥ `$0B`).
      if (flipH) {
        return getTexture(baseTile + 2, baseTile, true, true);
      }
      return getTexture(baseTile, baseTile + 2, false, false);
    }
    const walk = linkWalkSprite(dir, animFrame, { magicShield: opts.magicShield });
    return getTexture(walk.leftTile, walk.rightTile, walk.flipLeft, walk.flipRight);
  }

  /**
   * Both-arms-up TakeItem / Triforce pose (`DrawLinkLiftingItem`).
   * Falls back to facing-down walk when the high bank sheet is missing.
   */
  function textureForLift() {
    if (!highImage) {
      // Wood-shield down frame (NES always patches facing-down walk).
      return getTexture(0x58, 0x0a, false, false);
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
    const T = tilePx();
    const canvas = document.createElement('canvas');
    canvas.width = T * 2;
    canvas.height = T * 2;
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
        ctx.translate(dx + T, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(highImage, sx, sy, T, T, 0, 0, T, T);
        ctx.restore();
      } else {
        ctx.drawImage(highImage, sx, sy, T, T, dx, dy, T, T);
      }
    };
    blit(local, 0, 0, false);
    blit(local + 1, 0, T, false);
    blit(local, T, 0, true);
    blit(local + 1, T, T, true);
    applyLinkPalette(canvas);
    return markScaled(Texture.from(canvas));
  }

  return { textureFor, textureForLift, setPaletteSet, setRing };
}
