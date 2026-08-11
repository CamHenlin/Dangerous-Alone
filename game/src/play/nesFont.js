import { Container, Sprite, Texture } from 'pixi.js';
import { nesCharTile } from '@shared/nesCharset.js';
import { px, tilePx } from '@shared/gfxScale.js';
import { createTileCanvas, textureFromCanvas } from './scaledCanvas.js';

/**
 * NES Zelda BG charset (common_background).
 * The character → tile table lives in `@shared/nesCharset.js` so `story/`
 * text can be validated without a DOM; this module only draws it.
 */

const TILE = 8;

/** @type {Map<string, Texture>} */
const cache = new Map();

export { nesCharTile };

/**
 * @param {CanvasImageSource} img common_background sheet
 * @param {number} tile
 * @param {number} rgb 24-bit fill for lit pixels
 */
function tileTexture(img, tile, rgb) {
  const key = `${tile}:${rgb.toString(16)}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const { canvas, ctx } = createTileCanvas(TILE, TILE);
  const sx = (tile % 16) * tilePx();
  const sy = Math.floor(tile / 16) * tilePx();
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
      d[i + 3] = 0;
    } else {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  tex = textureFromCanvas(canvas);
  cache.set(key, tex);
  return tex;
}

/**
 * Status-bar counter icons (StatusBarStaticsTransferBuf col 11):
 * rupee $F7 + key $F9 from common_misc; bomb $61 from common_background.
 * These are dedicated 8×8 HUD tiles — not the world item sprites.
 *
 * @param {'rupee' | 'key' | 'bomb'} kind
 * @param {CanvasImageSource | null} bgImg
 * @param {CanvasImageSource | null} miscImg
 */
export function statusCounterIconTexture(kind, bgImg, miscImg) {
  const key = `statusIcon:${kind}`;
  let tex = cache.get(key);
  if (tex) return tex;

  /** @type {CanvasImageSource | null} */
  let img = null;
  let sx = 0;
  let sy = 0;
  /** hi / mid fill for lit pixels (NES “red” palette for rupee/key; blue for bomb). */
  let hi = [0xfc, 0xd8, 0x80];
  let mid = [0xfc, 0x98, 0x38];
  if (kind === 'rupee') {
    img = miscImg;
    sx = (0xf7 - 0xf2) * tilePx(); // misc row index 5
    sy = 0;
  } else if (kind === 'key') {
    img = miscImg;
    sx = (0xf9 - 0xf2) * tilePx(); // misc row index 7
    sy = 0;
    hi = [0xfc, 0xfc, 0xfc];
    mid = [0xd8, 0xd0, 0x80];
  } else {
    img = bgImg;
    sx = (0x61 % 16) * tilePx();
    sy = Math.floor(0x61 / 16) * tilePx();
    // Tile $61 stores the specular glint as the *dimmer* plane in the grey
    // extract — invert so body is blue and top-left highlight is light blue.
    hi = [0x3c, 0x3c, 0xfc];
    mid = [0xbc, 0xbc, 0xfc];
  }
  if (!img) return Texture.EMPTY;

  const { canvas, ctx } = createTileCanvas(TILE, TILE);
  ctx.drawImage(img, sx, sy, tilePx(), tilePx(), 0, 0, TILE, TILE);
  const image = ctx.getImageData(0, 0, px(TILE), px(TILE));
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16 || (d[i] < 8 && d[i + 1] < 8 && d[i + 2] < 8)) {
      d[i + 3] = 0;
      continue;
    }
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 28) {
      d[i + 3] = 0;
      continue;
    }
    // Brighter extract pixels → hi; dimmer → mid (bomb mid is the light glint).
    const c = lum > 160 ? hi : mid;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  ctx.putImageData(image, 0, 0);
  tex = textureFromCanvas(canvas);
  cache.set(key, tex);
  return tex;
}

/**
 * Heart / status BG tiles from common_background (and misc for full $F2).
 * Full/half → red ($16 family); empty → white outline ($30).
 * @param {CanvasImageSource} bgImg
 * @param {CanvasImageSource | null} miscImg
 * @param {number} tile $65 half, $66 empty, $F2 full
 * @param {'full' | 'half' | 'empty'} kind
 */
export function heartTileTexture(bgImg, miscImg, tile, kind) {
  const key = `heart:${tile}:${kind}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const { canvas, ctx } = createTileCanvas(TILE, TILE);
  if (tile >= 0xf2 && miscImg) {
    const idx = tile - 0xf2;
    ctx.drawImage(miscImg, idx * tilePx(), 0, tilePx(), tilePx(), 0, 0, TILE, TILE);
  } else {
    const sx = (tile % 16) * tilePx();
    const sy = Math.floor(tile / 16) * tilePx();
    ctx.drawImage(bgImg, sx, sy, tilePx(), tilePx(), 0, 0, TILE, TILE);
  }
  const image = ctx.getImageData(0, 0, px(TILE), px(TILE));
  const d = image.data;
  const RED = [0xb8, 0x28, 0x00];
  const WHITE = [0xfc, 0xfc, 0xfc];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16 || (d[i] < 8 && d[i + 1] < 8 && d[i + 2] < 8)) {
      d[i + 3] = 0;
      continue;
    }
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 28) {
      d[i + 3] = 0;
      continue;
    }
    // $65 half-heart: dimmer plane ≈ filled left, brighter ≈ empty right.
    if (kind === 'half' && lum >= 140) {
      d[i] = WHITE[0];
      d[i + 1] = WHITE[1];
      d[i + 2] = WHITE[2];
    } else if (kind === 'empty') {
      d[i] = WHITE[0];
      d[i + 1] = WHITE[1];
      d[i + 2] = WHITE[2];
    } else {
      d[i] = RED[0];
      d[i + 1] = RED[1];
      d[i + 2] = RED[2];
    }
  }
  ctx.putImageData(image, 0, 0);
  tex = textureFromCanvas(canvas);
  cache.set(key, tex);
  return tex;
}

/**
 * A single BG tile by CHR index — for furniture the charset has no letter for,
 * such as the credits' brick border (`$FA`).
 * @param {CanvasImageSource} img common_background sheet
 * @param {number} tile
 * @param {number} x
 * @param {number} y
 * @param {number} [rgb]
 * @returns {Sprite}
 */
export function nesTile(img, tile, x, y, rgb = 0xfcfcfc) {
  const spr = new Sprite(tileTexture(img, tile, rgb));
  spr.x = x;
  spr.y = y;
  return spr;
}

/**
 * @param {CanvasImageSource} img
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} [rgb]
 * @returns {Container}
 */
export function nesText(img, text, x, y, rgb = 0xfcfcfc) {
  const root = new Container();
  root.x = x;
  root.y = y;
  let cx = 0;
  for (const ch of text) {
    const tile = nesCharTile(ch);
    if (tile == null) {
      cx += TILE;
      continue;
    }
    const spr = new Sprite(tileTexture(img, tile, rgb));
    spr.x = cx;
    spr.y = 0;
    root.addChild(spr);
    cx += TILE;
  }
  return root;
}

/**
 * Multi-line NES dialogue (cave / underworld person textboxes).
 * Unknown glyphs advance by one tile so spacing stays even.
 * @param {CanvasImageSource | null} img common_background sheet
 * @param {string} text may include `\n`
 * @param {number} [rgb]
 * @param {number} [lineHeight=10]
 * @returns {{ root: Container, width: number, height: number }}
 */
export function nesMultilineText(img, text, rgb = 0xfcfcfc, lineHeight = 10) {
  const root = new Container();
  if (!img) {
    return { root, width: 0, height: 0 };
  }
  const lines = String(text ?? '').split('\n');
  let maxW = 0;
  for (let li = 0; li < lines.length; li += 1) {
    let cx = 0;
    for (const ch of lines[li]) {
      const tile = nesCharTile(ch);
      if (tile == null) {
        cx += TILE;
        continue;
      }
      const spr = new Sprite(tileTexture(img, tile, rgb));
      spr.x = cx;
      spr.y = li * lineHeight;
      root.addChild(spr);
      cx += TILE;
    }
    if (cx > maxW) maxW = cx;
  }
  return {
    root,
    width: maxW,
    height: lines.length * lineHeight,
  };
}
