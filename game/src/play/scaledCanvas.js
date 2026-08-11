/**
 * Scratch canvases that compose sprites in NES pixel units regardless of which
 * art set is loaded.
 *
 * Every sprite in this engine is assembled by blitting 8x8 CHR tiles into a
 * small canvas — Link's 16x16 walk frame, a 48x48 Gleeok, the item ring. All of
 * that layout arithmetic is written in NES pixels, and it should stay that way:
 * the enhanced art set changes how many device pixels a sprite is drawn with,
 * not how big it is in the game world.
 *
 * So the canvas is allocated at device size and its context is pre-scaled. Every
 * destination coordinate a caller passes stays in NES units and needs no edit.
 * Only *source* rectangles, which index into the sheet, have to be multiplied —
 * and those go through `tilePx()`.
 *
 * The one thing to watch: `drawImage` with a canvas source and no explicit size
 * uses the source's intrinsic device dimensions, which the scaled context would
 * then double. Use `blitCanvas` for canvas-to-canvas copies so the destination
 * size is always stated in NES units.
 */

import { Texture } from 'pixi.js';
import { markScaled, px, scale } from '@shared/gfxScale.js';

/**
 * @param {number} wNes width in NES pixels
 * @param {number} hNes height in NES pixels
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
export function createTileCanvas(wNes, hNes) {
  const canvas = document.createElement('canvas');
  canvas.width = px(wNes);
  canvas.height = px(hNes);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale(), scale());
  return { canvas, ctx };
}

/**
 * Copy one scratch canvas onto another, in NES units.
 *
 * @param {CanvasRenderingContext2D} ctx destination, already NES-scaled
 * @param {CanvasImageSource} source a canvas from `createTileCanvas`
 * @param {number} dx
 * @param {number} dy
 * @param {number} wNes
 * @param {number} hNes
 */
export function blitCanvas(ctx, source, dx, dy, wNes, hNes) {
  ctx.drawImage(source, dx, dy, wNes, hNes);
}

/**
 * Wrap a composed canvas as a texture the scene graph sees at NES size.
 * @param {HTMLCanvasElement} canvas
 */
export function textureFromCanvas(canvas) {
  return markScaled(Texture.from(canvas));
}
