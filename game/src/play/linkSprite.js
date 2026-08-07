import { Texture } from 'pixi.js';
import { DIR } from '@shared/collision.js';
import { linkWalkSprite } from '@shared/linkMotion.js';
import { swordAttackBaseTile } from '@shared/sword.js';

const TILE = 8;
const SHEET_COLS = 16;

/**
 * Build 16×16 Link walk/attack textures from the common_sprites sheet.
 * @param {Texture} sheetTexture
 */
export function createLinkFrames(sheetTexture) {
  /** @type {CanvasImageSource} */
  const sheetImage = /** @type {CanvasImageSource} */ (sheetTexture.source.resource);
  /** @type {Map<string, Texture>} */
  const cache = new Map();

  function tileXY(tileIndex) {
    return {
      sx: (tileIndex % SHEET_COLS) * TILE,
      sy: Math.floor(tileIndex / SHEET_COLS) * TILE,
    };
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
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    return tex;
  }

  function getTexture(baseTile, flipH) {
    const key = `${baseTile}:${flipH ? 1 : 0}`;
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

  return { textureFor };
}
