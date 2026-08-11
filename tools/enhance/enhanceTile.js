/**
 * Turn one original 8x8 2bpp tile into a 16x16 4bpp enhanced tile.
 *
 * The contract, which every downstream consumer relies on:
 *   - output is 16x16, one byte per pixel, value = slot * 4 + shade
 *   - `slot` is the original NES palette slot, so the tile still recolours
 *     correctly under any palette row the runtime swaps in
 *   - `shade` is new detail, and only ever moves a pixel along its own colour's
 *     ramp — it can never turn a green pixel brown
 */

import { classifyTile } from './classify.js';
import { scale2x } from './scale2x.js';
import { findRegions } from './regions.js';
import {
  MATERIALS,
  bayerThreshold,
  edgeDistance,
  facingField,
  formTerm,
  silhouetteField,
} from './shading.js';
import { BASE_SHADE, SHADES, packPixel } from '../shared/masterPalette.js';

export const ENHANCED_TILE_PX = 16;

/** Stable per-tile noise seed, so output is identical on every run. */
function seedFor(sheetId, tileIndex) {
  let h = 2166136261;
  const key = `${sheetId}#${tileIndex}`;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Quantize a continuous shade to one of the four ramp steps, spreading the
 * remainder with an ordered dither so gradients survive the tiny palette.
 *
 * @param {number} v continuous shade
 * @param {number} x
 * @param {number} y
 * @param {number} strength 0 = hard bands, 1 = fully dithered
 * @param {number} seed
 */
function quantizeShade(v, x, y, strength, seed) {
  const r = Math.floor(v + 0.5 + bayerThreshold(x, y, seed) * strength);
  if (r < 0) return 0;
  if (r > SHADES - 1) return SHADES - 1;
  return r;
}

/**
 * @param {Uint8Array} slots8 64 slot values (0-3)
 * @param {{
 *   sheetId?: string,
 *   tileIndex?: number,
 *   kind?: 'sprites'|'background',
 *   seed?: number,
 * }} [ctx] `seed` overrides the per-tile noise seed. Bakers that know where a
 *   tile sits in the world pass a position-derived seed so that a field of one
 *   repeated ground tile gets varied grain instead of the same speckle stamped
 *   every 16 pixels — a regular dot grid is far more visible than the texture
 *   it is supposed to be.
 * @returns {{ pixels: Uint8Array, material: string, size: number }}
 */
export function enhanceTile(slots8, ctx = {}) {
  const { sheetId = 'sheet', tileIndex = 0, kind = 'background' } = ctx;
  const { material } = classifyTile(slots8, { kind, sheetId });
  const { pixels: slots, width: w, height: h } = scale2x(slots8, 8, 8);

  const spec = MATERIALS[material] ?? MATERIALS.stone;
  const depth = edgeDistance(slots, w, h);
  const facing = facingField(slots, w, h);
  const silhouette = silhouetteField(slots, w, h);
  const { labels, regions } = findRegions(slots, w, h);
  const seed = ctx.seed ?? seedFor(sheetId, tileIndex);

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const slot = slots[i] & 3;
      // Slot 0 is never shaded. On a sprite it is the transparent hole; on a
      // background it is the shared backdrop colour that has to stay flat
      // across tile seams or the empty space between objects would shimmer.
      //
      // It still has to be written at the *base* shade rather than as a plain
      // zero: pixel 0 decodes as slot 0 shade 0, the darkest step of the ramp.
      // Most backdrops are black, where every shade is black and the mistake is
      // invisible — but the title screen's backdrop is tan, and it came out
      // muddy grey.
      if (slot === 0) {
        out[i] = packPixel(0, BASE_SHADE);
        continue;
      }
      const isSilhouette = silhouette[i] === 1;
      const shadeCtx = {
        x,
        y,
        seed,
        slot,
        facing: facing[i],
        depth: depth[i],
        silhouette: isSilhouette,
      };
      const form = formTerm({
        x,
        y,
        facing: facing[i],
        depth: depth[i],
        silhouette: isSilhouette,
        region: regions[labels[i]],
        bodyGain: spec.bodyGain,
      });
      // Shader gains were tuned against a 4-step ramp; scale them so the same
      // form and texture cover the same perceptual range on a longer one.
      const rampScale = spec.scaleWithRamp === false ? 1 : SHADES / 4;
      const shade = BASE_SHADE
        + (form * spec.formGain + spec.texture(shadeCtx)) * rampScale;
      out[i] = packPixel(slot, quantizeShade(shade, x, y, spec.dither * rampScale, seed));
    }
  }

  return { pixels: out, material, size: w };
}

/**
 * Enhance a whole pattern block.
 * @param {Uint8Array[]} tiles decoded 8x8 slot grids
 * @param {{ sheetId?: string, kind?: 'sprites'|'background' }} [ctx]
 */
export function enhanceTiles(tiles, ctx = {}) {
  return tiles.map((slots, tileIndex) => enhanceTile(slots, { ...ctx, tileIndex }));
}
