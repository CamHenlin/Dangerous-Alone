/**
 * 256-color master palette for the enhanced graphics pipeline.
 *
 * The NES gives us 64 hardware colors and four of them per palette row. That
 * ceiling is what makes the original art read as flat: a tree trunk is one
 * brown, a wall is one grey. Rather than abandon the NES palette (which is what
 * makes the game look like *this* game), we keep all 64 colors and give each
 * one a four-step shading ramp:
 *
 *     master index = nesIndex * 4 + shade      (64 * 4 = exactly 256)
 *
 *     shade 0  deep shadow      shade 2  the exact original NES color
 *     shade 1  shadow           shade 3  highlight
 *
 * Two properties fall out of this that the whole overhaul depends on:
 *
 * 1. **Shade 2 is byte-identical to the original.** Collapsing every pixel to
 *    shade 2 reproduces the 1986 art exactly, which is what Classic mode does
 *    and what makes side-by-side verification meaningful.
 *
 * 2. **Palette swaps still work.** Every runtime recolor in this engine
 *    (dungeon LevelInfo rows, Link's tunic by ring, enemy SP rows, the death
 *    fade, the triforce white flash) operates on a row of 4 NES colors. An
 *    enhanced row is still those same 4 colors — just each expanded to its
 *    ramp. Swapping a row re-derives 16 entries from 4, so none of that logic
 *    has to change shape.
 *
 * A 4bpp enhanced pixel therefore decomposes as:
 *
 *     slot  = px >> 2      which of the row's 4 NES colors (the original pixel)
 *     shade = px & 3       where on that color's ramp the pixel sits
 */

import { NES_MASTER_PALETTE } from './nesPalette.js';

/** Shade steps per NES base color. */
export const SHADES = 8;

/** The shade whose RGB equals the untouched NES color. */
export const BASE_SHADE = 4;

/** Total entries: 64 NES colors x SHADES. */
export const MASTER_SIZE = NES_MASTER_PALETTE.length * SHADES;

/**
 * Ramp steps as multiplicative gains on the base color.
 *
 * Multiplying preserves the ratio between channels, so a saturated NES green
 * stays a saturated green as it brightens. Mixing toward white instead — the
 * obvious first thing to try — desaturates fast and turns every highlight into
 * the same milky pastel, which reads as washed-out rather than lit. The small
 * additive lift on the highlight step keeps very dark colors from having a
 * highlight that is indistinguishable from their base.
 */
const SHADE_GAIN = [0.40, 0.55, 0.70, 0.85, 1, 1.13, 1.26, 1.40];
const SHADE_LIFT = [0, 0, 0, 0, 0, 4, 8, 12];

/**
 * Highlights drift slightly warm and shadows slightly cool. This is the single
 * cheapest trick for making flat palette art read as lit rather than tinted,
 * and it costs nothing at runtime since it is baked into the master table.
 */
const SHADE_TEMPERATURE = [
  [-7, -5, 12],
  [-5, -4, 9],
  [-3, -2, 6],
  [-2, -1, 3],
  [0, 0, 0],
  [4, 2, -2],
  [7, 4, -4],
  [11, 7, -7],
];

function clamp8(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

/**
 * Derive one ramp step from a base RGB triple.
 *
 * Mixing happens in a rough perceptual space (values squared) so a mid-grey
 * darkens by the amount the eye expects instead of collapsing to near-black.
 *
 * The warm/cool tint is weighted toward midtones and vanishes at both ends of
 * the range. Without that, cooling an already-black pixel *raises* its blue
 * channel and the ramp stops being monotonic — near-black is exactly where the
 * NES palette spends most of its sprite backgrounds.
 *
 * @param {readonly number[]} rgb base color
 * @param {number} shade 0-3
 * @returns {[number, number, number]}
 */
export function shadeOf(rgb, shade) {
  const s = Math.max(0, Math.min(SHADES - 1, shade | 0));
  const gain = SHADE_GAIN[s];
  const lift = SHADE_LIFT[s];
  const temp = SHADE_TEMPERATURE[s];
  const scaled = [0, 1, 2].map((c) => rgb[c] * gain + lift);
  // Brightening an already-bright color overflows some channels but not others,
  // and clamping each one independently drags the hue toward white — sand's
  // highlight comes out bone white instead of pale sand. Rescale the whole
  // triple to fit instead, which preserves the ratio between channels, then
  // spend the leftover headroom on a small neutral lift so the step is still
  // visible.
  const peak = Math.max(scaled[0], scaled[1], scaled[2]);
  if (peak > 255) {
    const overflow = Math.min(1, (peak - 255) / 255);
    for (let c = 0; c < 3; c += 1) {
      scaled[c] = (scaled[c] * 255) / peak + overflow * 18;
    }
  }
  // Parabolic midtone weight: 0 at pure black and pure white, 1 at mid grey.
  // Without it, cooling an already-black pixel *raises* its blue channel and
  // the ramp stops being monotonic — and near-black is exactly where the NES
  // palette spends most of its sprite backgrounds.
  const lum = (0.299 * scaled[0] + 0.587 * scaled[1] + 0.114 * scaled[2]) / 255;
  const midWeight = Math.max(0, 4 * lum * (1 - lum));
  const out = /** @type {[number, number, number]} */ ([0, 0, 0]);
  for (let c = 0; c < 3; c += 1) {
    out[c] = clamp8(scaled[c] + temp[c] * midWeight);
  }
  return out;
}

/**
 * The full 256-entry master palette, index `nesIndex * 4 + shade`.
 * @type {readonly (readonly [number, number, number])[]}
 */
export const MASTER_PALETTE_256 = Object.freeze(
  NES_MASTER_PALETTE.flatMap((rgb, nesIndex) =>
    Array.from({ length: SHADES }, (_, shade) =>
      // Shade 2 must round-trip exactly, so short-circuit rather than trust
      // the mix math to land back on the original bytes.
      Object.freeze(
        shade === BASE_SHADE
          ? /** @type {[number, number, number]} */ ([rgb[0], rgb[1], rgb[2]])
          : shadeOf(rgb, shade),
      ),
    ),
  ),
);

/**
 * Master-palette index for a NES color at a shade.
 * @param {number} nesIndex 0-63
 * @param {number} shade 0-3
 */
export function masterIndex(nesIndex, shade) {
  return (nesIndex & 0x3f) * SHADES + Math.max(0, Math.min(SHADES - 1, shade | 0));
}

/**
 * Resolve a master-palette index to RGB.
 * @param {number} index 0-255
 * @returns {readonly [number, number, number]}
 */
export function masterColor(index) {
  return MASTER_PALETTE_256[index % MASTER_SIZE];
}

/**
 * Expand a 4-color NES palette row into the 16 RGB entries an enhanced tile
 * indexes into. Entry `slot * 4 + shade` is slot's color at that shade.
 *
 * This is the bridge every runtime palette swap crosses: callers keep handing
 * around rows of 4, and only the final pixel write sees 16.
 *
 * @param {readonly (readonly number[])[]} rowRgb 4 RGB triples
 * @returns {[number, number, number][]} 16 RGB triples
 */
export function expandRowRgb(rowRgb) {
  const out = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const base = rowRgb[slot] ?? [0, 0, 0];
    for (let shade = 0; shade < SHADES; shade += 1) {
      out.push(shade === BASE_SHADE ? [base[0], base[1], base[2]] : shadeOf(base, shade));
    }
  }
  return out;
}

/**
 * Expand a row of 4 NES color indices into 16 master-palette indices.
 * @param {readonly number[]} rowIndices 4 NES indices
 * @returns {number[]} 16 master indices
 */
export function expandRowIndices(rowIndices) {
  const out = [];
  for (let slot = 0; slot < 4; slot += 1) {
    for (let shade = 0; shade < SHADES; shade += 1) {
      out.push(masterIndex(rowIndices[slot] ?? 0, shade));
    }
  }
  return out;
}

/**
 * Split an enhanced 4bpp pixel back into its original NES slot and its shade.
 * @param {number} px 0-15
 */
export function splitPixel(px) {
  return { slot: (px / SHADES) & 3, shade: px % SHADES };
}

/**
 * Combine a slot and shade into an enhanced 4bpp pixel.
 * @param {number} slot 0-3
 * @param {number} shade 0-3
 */
export function packPixel(slot, shade) {
  return (slot & 3) * SHADES + Math.max(0, Math.min(SHADES - 1, shade | 0));
}

/**
 * Flatten enhanced pixels back to original NES color slots — the Classic-mode
 * projection, and the invariant every enhancer pass must preserve.
 * @param {Uint8Array} pixels 4bpp values
 * @returns {Uint8Array} 2bpp values
 */
export function toClassicSlots(pixels) {
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 1) {
    out[i] = (pixels[i] / SHADES) & 3;
  }
  return out;
}
