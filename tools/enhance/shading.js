/**
 * Geometry fields and material shading.
 *
 * Everything here operates on the *slot plane* only — never on colours. That is
 * a hard rule, and it is what lets one enhanced tile serve every palette in the
 * game: the same dungeon wall tile is grey in level 1 and blue in level 7, and
 * the shading has to be correct in both. So we shade by shape (where the edges
 * are, which way they face, how deep into a region a pixel sits) and let the
 * palette supply the colour afterwards.
 *
 * Shading is built in two layers, in this order of importance:
 *
 *   1. **Form** — coherent lighting from a fixed upper-left key light. Bevelled
 *      edges, a body gradient across enclosed objects, contact shadow where a
 *      surface turns away. This is what makes a flat tile read as solid, and it
 *      does almost all of the work.
 *
 *   2. **Texture** — a small material-specific perturbation on top: bark grain,
 *      leaf clumps, stone mottle, water bands. Deliberately low amplitude. Loud
 *      texture on top of weak form just reads as dither noise, which looks
 *      worse than the original art rather than better.
 */

const LIGHT = Object.freeze({ x: -1, y: -1 });

/**
 * Deterministic per-pixel noise in 0..1. Stable across runs and machines, so
 * regenerating the sheets never produces a spurious diff.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 */
export function hashNoise(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Noise held constant over `size`-pixel cells, for coarse mottling. */
export function cellNoise(x, y, size, seed) {
  return hashNoise(Math.floor(x / size), Math.floor(y / size), seed);
}

/**
 * Distance from each pixel to the nearest pixel of a different slot, in
 * 4-connected steps. Pixels sitting right on a boundary get 0.
 *
 * @param {Uint8Array} slots
 * @param {number} w
 * @param {number} h
 * @returns {Int16Array}
 */
export function edgeDistance(slots, w, h) {
  const dist = new Int16Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const s = slots[i];
      const boundary = (x > 0 && slots[i - 1] !== s)
        || (x + 1 < w && slots[i + 1] !== s)
        || (y > 0 && slots[i - w] !== s)
        || (y + 1 < h && slots[i + w] !== s);
      if (boundary) {
        dist[i] = 0;
        queue[tail] = i;
        tail += 1;
      }
    }
  }

  while (head < tail) {
    const i = queue[head];
    head += 1;
    const x = i % w;
    const y = (i / w) | 0;
    const d = dist[i] + 1;
    const push = (ni) => {
      if (dist[ni] === -1) {
        dist[ni] = d;
        queue[tail] = ni;
        tail += 1;
      }
    };
    if (x > 0) push(i - 1);
    if (x + 1 < w) push(i + 1);
    if (y > 0) push(i - w);
    if (y + 1 < h) push(i + w);
  }

  // A tile of one uniform slot has no boundary at all; treat it as deep interior.
  for (let i = 0; i < dist.length; i += 1) if (dist[i] === -1) dist[i] = 8;
  return dist;
}

/**
 * How much a pixel's local boundary faces the light, in -1..1.
 *
 * We sample the eight neighbours and sum the direction vectors of those that
 * belong to a *different* slot. That sum points away from the pixel's own
 * region — it is the outward surface normal. Dotting it with the light gives a
 * lit top-left edge a positive value and a bottom-right edge a negative one.
 *
 * Off-tile neighbours are treated as "same slot" and contribute nothing, so a
 * surface running past the tile border does not self-shade there. Without that,
 * every tile would be outlined and large walls would show a grid.
 *
 * @param {Uint8Array} slots
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
export function facingField(slots, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const s = slots[i];
      let nx = 0;
      let ny = 0;
      let differing = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          if (slots[py * w + px] === s) continue;
          const len = dx && dy ? Math.SQRT1_2 : 1;
          nx += dx * len;
          ny += dy * len;
          differing += 1;
        }
      }
      if (!differing) continue;
      const mag = Math.hypot(nx, ny);
      if (mag < 1e-6) continue;
      out[i] = ((nx / mag) * LIGHT.x + (ny / mag) * LIGHT.y) / Math.SQRT2;
    }
  }
  return out;
}

/**
 * Whether a pixel touches slot 0 — the transparent hole in a sprite. Used for
 * rim lighting the silhouette instead of pressing a shadow into empty space.
 *
 * @param {Uint8Array} slots
 * @param {number} w
 * @param {number} h
 */
export function silhouetteField(slots, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (slots[i] === 0) continue;
      const touches = (x > 0 && slots[i - 1] === 0)
        || (x + 1 < w && slots[i + 1] === 0)
        || (y > 0 && slots[i - w] === 0)
        || (y + 1 < h && slots[i + w] === 0);
      if (touches) out[i] = 1;
    }
  }
  return out;
}

/**
 * 4x4 ordered (Bayer) dither thresholds, normalised to -0.5..0.5.
 *
 * With only four shades per colour, plain rounding throws away everything
 * subtle: a computed shade of 2.35 rounds flat to 2 and the gradient vanishes.
 * Dithering instead lets that 2.35 land on shade 3 for about a third of pixels
 * in a fixed pattern, so the eye reads a smooth ramp — the same trick artists
 * used to get gradients out of four-colour hardware in the first place.
 *
 * The 4x4 period divides 16 exactly, so the pattern runs continuously across
 * tile boundaries and never betrays where one tile ends and the next begins.
 */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/**
 * Dither threshold for a pixel, in -0.5..0.5.
 *
 * A pure Bayer matrix is regular enough that a large area sitting near a shade
 * boundary reads as a grid of polka dots rather than as texture. Perturbing the
 * threshold with a little hash noise breaks that regularity — closer to blue
 * noise — while keeping most of the ordered matrix's even spatial distribution,
 * which is what makes gradients look smooth rather than grainy.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} [seed]
 * @returns {number} -0.5..0.5
 */
export function bayerThreshold(x, y, seed = 0) {
  const ordered = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
  const jitter = hashNoise(x, y, seed + 0x5bd1) - 0.5;
  return ordered * 0.72 + jitter * 0.34;
}

/** How strongly edge orientation counts, by distance in from the boundary. */
const FACING_FALLOFF = [1, 0.5, 0.18, 0.06];

/**
 * The coherent lighting term for one pixel, in roughly -1.6..1.6.
 *
 * @param {object} p
 * @param {number} p.x
 * @param {number} p.y
 * @param {number} p.facing
 * @param {number} p.depth
 * @param {boolean} p.silhouette
 * @param {{ enclosed: boolean, cx: number, cy: number, radius: number, area: number }} p.region
 * @param {number} p.bodyGain how much body gradient this material takes
 */
export function formTerm({ x, y, facing, depth, silhouette, region, bodyGain }) {
  let form = facing * (FACING_FALLOFF[Math.min(depth, 3)] ?? 0.06);

  // A hard bevel on the boundary itself: a bright lip where the surface turns
  // into the light, a contact shadow where it turns away.
  if (depth === 0) {
    if (facing > 0.3) form += 0.45;
    else if (facing < -0.3) form -= 0.5;
  }

  // Body gradient, objects only. Surfaces that leave the tile are skipped so
  // they stay seamless against their neighbours.
  if (region.enclosed && region.area > 6) {
    const rel = ((region.cx - x) + (region.cy - y)) / (region.radius * 2);
    form += Math.max(-1, Math.min(1, rel)) * bodyGain;
  }

  // A sprite's outer edge catches a rim light rather than being outlined dark.
  if (silhouette && facing > 0.1) form += 0.3;

  return form;
}

/**
 * Per-material tuning and texture.
 *
 * `bodyGain` scales the body gradient (how volumetric the material reads).
 * `formGain` scales the whole coherent lighting term.
 * `dither` scales the ordered-dither threshold: 1 gives smooth ramps, 0 gives
 * hard-edged bands. Text sets it to 0 so glyph strokes never break up.
 * `texture(ctx)` returns a small signed perturbation, normally within ±0.6.
 *
 * @type {Record<string, {
 *   formGain: number, bodyGain: number, dither: number,
 *   texture: (ctx: ShadeContext) => number,
 * }>}
 */
export const MATERIALS = {
  /** Text and icons: form only, and barely — legibility beats prettiness. */
  glyph: {
    // Text keeps its shading in absolute ramp steps rather than scaling with a
    // longer ramp: the point of the bevel is a single crisp lip around a solid
    // stroke, and a finer ramp would let the interior pick up a second shade.
    scaleWithRamp: false,
    formGain: 0.55,
    bodyGain: 0,
    dither: 0,
    texture: () => 0,
  },

  /** Leaves: clumps that catch light, with a few pockets of shade between. */
  foliage: {
    formGain: 1,
    bodyGain: 0.5,
    dither: 0.9,
    texture: ({ x, y, seed }) => {
      const clump = cellNoise(x, y, 2, seed) * 0.7 + hashNoise(x, y, seed + 1) * 0.3;
      if (clump > 0.74) return 0.55;
      if (clump < 0.2) return -0.4;
      return 0;
    },
  },

  /** Wood: grain runs the long axis, so the streaks vary by column. */
  wood: {
    formGain: 0.95,
    bodyGain: 0.45,
    dither: 0.85,
    texture: ({ x, y, seed }) => {
      const column = hashNoise(x, 0, seed);
      const knot = cellNoise(x, y, 5, seed + 3) > 0.94 ? -0.45 : 0;
      if (column > 0.74) return 0.4 + knot;
      if (column < 0.26) return -0.35 + knot;
      return knot;
    },
  },

  /** Masonry: crisp bevel from form, plus a quiet mottle inside each block. */
  masonry: {
    formGain: 1.15,
    bodyGain: 0.2,
    dither: 0.8,
    texture: ({ x, y, seed }) => (cellNoise(x, y, 3, seed) - 0.5) * 0.5,
  },

  /** Rock: irregular mottle at two scales over strong form. */
  stone: {
    formGain: 1.05,
    bodyGain: 0.55,
    dither: 1.0,
    texture: ({ x, y, seed }) =>
      (cellNoise(x, y, 3, seed) - 0.5) * 0.7 + (hashNoise(x, y, seed + 11) - 0.5) * 0.25,
  },

  /** Water: horizontal bands, with an occasional glint riding on top. */
  water: {
    formGain: 0.7,
    bodyGain: 0.25,
    dither: 1.0,
    texture: ({ x, y, seed }) => {
      const band = Math.sin((y + hashNoise(0, y, seed) * 1.5) * 0.8) * 0.42;
      const glint = hashNoise(Math.floor(x / 3), y, seed + 5) > 0.9 ? 0.5 : 0;
      return band + glint;
    },
  },

  /** Sand and floor: faint on purpose. Loud ground tiles reveal the grid. */
  ground: {
    formGain: 0.8,
    bodyGain: 0.3,
    dither: 1.0,
    texture: ({ x, y, seed }) => (hashNoise(x, y, seed) - 0.5) * 0.55,
  },

  /** Blades and shields: a hard specular band across the light diagonal. */
  metal: {
    formGain: 1.2,
    bodyGain: 0.6,
    dither: 0.45,
    texture: ({ x, y, seed }) => {
      const streak = ((x + y * 2) % 9) < 2 ? 0.6 : 0;
      return streak + (hashNoise(x, y, seed) - 0.5) * 0.2;
    },
  },

  /** Skin and cloth: smooth volume, almost no grain. */
  soft: {
    formGain: 1,
    bodyGain: 0.75,
    dither: 0.6,
    texture: ({ x, y, seed }) => (hashNoise(x, y, seed) - 0.5) * 0.18,
  },

  /** Flame and magic: bright core falling off toward the silhouette. */
  energy: {
    formGain: 0.5,
    bodyGain: 0,
    dither: 0.8,
    texture: ({ x, y, seed, depth, silhouette }) =>
      Math.min(depth, 4) * 0.32 - (silhouette ? 0.5 : 0) + (hashNoise(x, y, seed) - 0.5) * 0.35,
  },

  /** One solid colour: leave it alone so large fills stay seamless. */
  flat: {
    formGain: 0,
    bodyGain: 0,
    dither: 0,
    texture: () => 0,
  },
};

/**
 * @typedef {object} ShadeContext
 * @property {number} x
 * @property {number} y
 * @property {number} seed
 * @property {number} facing -1..1, how much the local edge faces the light
 * @property {number} depth steps from the nearest differing slot
 * @property {number} slot the pixel's own palette slot
 * @property {boolean} silhouette pixel borders transparent space
 */
