import { Sprite, Texture } from 'pixi.js';
import { px, tilePx } from '@shared/gfxScale.js';
import { createTileCanvas, textureFromCanvas } from './scaledCanvas.js';

/**
 * Tiles from the demo BG sheet (`demo_background.png`).
 *
 * The attract storyboard mixes two pattern banks: characters come from
 * `common_background` at PPU `$1000`, and the vine frame from `demo_background`
 * at `$1700` — which is why its tile numbers start at `$70`. `nesFont.js` draws
 * the first bank; this draws the second, with the same tint-the-lit-pixels
 * treatment so the two compose on one screen.
 *
 * The prologue is a pre-rendered PNG and needs none of this. The epilogue draws
 * its frame live, because its text is typed rather than baked.
 */

const TILE = 8;
/** Demo background patterns load at PPU `$1700` → tile `$70`. */
const DEMO_BG_TILE_BASE = 0x70;
const SHEET_COLS = 16;

/** @type {Map<string, Texture>} */
const cache = new Map();

/**
 * @param {CanvasImageSource} img demo_background sheet
 * @param {number} tile NES tile index (`$70`+)
 * @param {number} rgb 24-bit fill for lit pixels
 */
function demoTileTexture(img, tile, rgb) {
  const key = `${tile}:${rgb.toString(16)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const index = (tile & 0xff) - DEMO_BG_TILE_BASE;
  if (index < 0) return Texture.EMPTY;

  const { canvas, ctx } = createTileCanvas(TILE, TILE);
  const sx = (index % SHEET_COLS) * tilePx();
  const sy = Math.floor(index / SHEET_COLS) * tilePx();
  ctx.drawImage(img, sx, sy, tilePx(), tilePx(), 0, 0, TILE, TILE);

  const image = ctx.getImageData(0, 0, px(TILE), px(TILE));
  const d = image.data;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) continue;
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 40) {
      // Colour 0 is the transparent backdrop, not ink.
      d[i + 3] = 0;
    } else {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = textureFromCanvas(canvas);
  cache.set(key, tex);
  return tex;
}

/**
 * @param {CanvasImageSource} img demo_background sheet
 * @param {number} tile
 * @param {number} x
 * @param {number} y
 * @param {number} [rgb]
 * @returns {Sprite}
 */
export function demoTile(img, tile, x, y, rgb = 0x00a800) {
  const spr = new Sprite(demoTileTexture(img, tile, rgb));
  spr.x = x;
  spr.y = y;
  return spr;
}
