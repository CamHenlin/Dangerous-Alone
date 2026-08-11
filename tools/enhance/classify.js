/**
 * Procedural material classification.
 *
 * Nothing in this file knows that tile $B4 is a tree or that $2C is water. It
 * only measures the shape of a tile — how broken up it is, whether its detail
 * runs vertically or horizontally, how much of it is background, whether it is
 * mirror-symmetric — and infers which physical material the artist was drawing.
 * A trunk and a plank both come out as grain that runs with the wood; a brick
 * wall and a dungeon block both come out as masonry with mortar in the seams.
 *
 * Getting this wrong is not fatal. Every material shades from the same
 * primitives (light direction, occlusion, grain), so a misclassified tile still
 * gains volume — it just gains slightly the wrong texture. The classifier is
 * tuned to fail toward the conservative materials (STONE, SOFT) rather than the
 * loud ones (FOLIAGE, METAL).
 */

export const MATERIAL = Object.freeze({
  /** Text and HUD symbols. Shaded almost not at all — legibility wins. */
  GLYPH: 'glyph',
  /** Leaves, bushes, forest canopy: dense clustered speckle. */
  FOLIAGE: 'foliage',
  /** Trunks, planks, bridges, doors: grain running the long axis. */
  WOOD: 'wood',
  /** Brick, block, dungeon wall: bevelled cells with darkened seams. */
  MASONRY: 'masonry',
  /** Boulders, cliffs, mountain: irregular mottle. */
  STONE: 'stone',
  /** Water and waterfalls: horizontal banding with a moving glint. */
  WATER: 'water',
  /** Sand, dirt, floor: fine even speckle, very low contrast. */
  GROUND: 'ground',
  /** Swords, shields, armour, keys: hard specular streak. */
  METAL: 'metal',
  /** Skin, cloth, creature bodies: smooth volume plus a rim light. */
  SOFT: 'soft',
  /** Fire, magic, glow: bright core falling off outward. */
  ENERGY: 'energy',
  /** A tile of one solid colour — nothing to texture. */
  FLAT: 'flat',
});

/**
 * Measure a tile's shape. All ratios are 0..1 unless noted.
 *
 * @param {Uint8Array} slots 8x8 slot values (0-3)
 * @param {number} w
 * @param {number} h
 */
export function tileStats(slots, w = 8, h = 8) {
  const total = w * h;
  const coverage = [0, 0, 0, 0];
  for (let i = 0; i < total; i += 1) coverage[slots[i] & 3] += 1;

  let horizEdges = 0;
  let horizPairs = 0;
  let vertEdges = 0;
  let vertPairs = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = slots[y * w + x];
      if (x + 1 < w) {
        horizPairs += 1;
        if (slots[y * w + x + 1] !== p) horizEdges += 1;
      }
      if (y + 1 < h) {
        vertPairs += 1;
        if (slots[(y + 1) * w + x] !== p) vertEdges += 1;
      }
    }
  }

  // Transitions counted *across* an axis mean detail varies *along* it. Wood
  // grain runs vertically, so a trunk has many horizontal transitions (stripes
  // side by side) and few vertical ones.
  const horizChangeRate = horizPairs ? horizEdges / horizPairs : 0;
  const vertChangeRate = vertPairs ? vertEdges / vertPairs : 0;
  const edgeDensity = (horizEdges + vertEdges) / (horizPairs + vertPairs || 1);
  const anisotropy = horizChangeRate + vertChangeRate > 0
    ? (horizChangeRate - vertChangeRate) / (horizChangeRate + vertChangeRate)
    : 0;

  let mirrorMatch = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (slots[y * w + x] === slots[y * w + (w - 1 - x)]) mirrorMatch += 1;
    }
  }

  // Border composition tells us whether the tile is a self-contained object
  // sitting on a field (a glyph, an item) or a continuous surface that runs
  // into its neighbours (a wall, water).
  const borderCount = [0, 0, 0, 0];
  let borderTotal = 0;
  for (let x = 0; x < w; x += 1) {
    borderCount[slots[x] & 3] += 1;
    borderCount[slots[(h - 1) * w + x] & 3] += 1;
    borderTotal += 2;
  }
  for (let y = 1; y < h - 1; y += 1) {
    borderCount[slots[y * w] & 3] += 1;
    borderCount[slots[y * w + w - 1] & 3] += 1;
    borderTotal += 2;
  }
  const dominantBorder = borderCount.indexOf(Math.max(...borderCount));
  const borderPurity = borderCount[dominantBorder] / borderTotal;

  // Perimeter-to-area on the non-border material: strokes (letters) are almost
  // all perimeter, blobs (a rock) are mostly interior.
  let figureArea = 0;
  let figurePerimeter = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (slots[y * w + x] === dominantBorder) continue;
      figureArea += 1;
      const n = [
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y],
      ];
      for (const [nx, ny] of n) {
        const outside = nx < 0 || ny < 0 || nx >= w || ny >= h;
        if (outside || slots[ny * w + nx] === dominantBorder) figurePerimeter += 1;
      }
    }
  }

  const distinctSlots = coverage.filter((c) => c > 0).length;

  // Character cells reserve their last row and last column as spacing so
  // glyphs do not touch when written side by side. That convention is the most
  // reliable structural tell that a tile is text rather than terrain — far more
  // so than stroke thinness, since plenty of letters (M, W, O) are chunky and
  // most of them run right up against the left edge of their cell.
  let bottomRowClear = true;
  let rightColClear = true;
  for (let x = 0; x < w; x += 1) {
    if (slots[(h - 1) * w + x] !== dominantBorder) bottomRowClear = false;
  }
  for (let y = 0; y < h; y += 1) {
    if (slots[y * w + (w - 1)] !== dominantBorder) rightColClear = false;
  }

  return {
    bottomRowClear,
    rightColClear,
    coverage: coverage.map((c) => c / total),
    distinctSlots,
    edgeDensity,
    /** > 0 means detail runs vertically (stripes), < 0 horizontally (bands). */
    anisotropy,
    mirrorSymmetry: mirrorMatch / total,
    dominantBorder,
    borderPurity,
    figureArea: figureArea / total,
    strokeRatio: figureArea ? figurePerimeter / figureArea : 0,
  };
}

/**
 * Infer a material from measured shape plus the little context we do have
 * (whether the sheet holds sprites or background).
 *
 * @param {Uint8Array} slots 8x8 slot values
 * @param {{ kind?: 'sprites'|'background', sheetId?: string }} [ctx]
 * @returns {{ material: string, stats: ReturnType<typeof tileStats> }}
 */
export function classifyTile(slots, ctx = {}) {
  const stats = tileStats(slots);
  const isSprite = ctx.kind === 'sprites';
  const {
    distinctSlots,
    edgeDensity,
    anisotropy,
    mirrorSymmetry,
    figureArea,
    strokeRatio,
    bottomRowClear,
    rightColClear,
  } = stats;

  const material = (() => {
    if (distinctSlots <= 1) {
      // A single-slot tile is either genuinely empty (slot 0: transparent on a
      // sprite, backdrop on a background) or a solid fill. The fills matter a
      // lot — open sand and dungeon floor are the most-drawn tiles in the game,
      // and leaving them untextured would mean most of the screen never
      // changed. Empty stays empty; solid gets the quietest texture we have.
      if ((slots[0] & 3) === 0) return MATERIAL.FLAT;
      return isSprite ? MATERIAL.SOFT : MATERIAL.GROUND;
    }

    // Two-tone stroke inside a padded character cell: text or a HUD icon.
    // Caught before anything textural, because mottling a letter is the one
    // failure here a player would actually be unable to look past.
    if (
      distinctSlots === 2
      && bottomRowClear
      && rightColClear
      && figureArea > 0.04
      && figureArea < 0.62
      && strokeRatio > 1.0
    ) {
      return MATERIAL.GLYPH;
    }

    if (isSprite) {
      // Bright, mostly-solid, highly symmetric sprites read as glow: fire,
      // magic, the boomerang's sparkle.
      if (mirrorSymmetry > 0.9 && figureArea > 0.25 && edgeDensity < 0.3) {
        return MATERIAL.ENERGY;
      }
      // Long straight runs with hard slot contrast are blades and shields.
      if (Math.abs(anisotropy) > 0.45 && edgeDensity < 0.35 && distinctSlots >= 3) {
        return MATERIAL.METAL;
      }
      if (edgeDensity > 0.42) return MATERIAL.FOLIAGE;
      return MATERIAL.SOFT;
    }

    // Background surfaces. The foliage cut sits lower than the sprite one:
    // overworld terrain tiles are broken-up bushes and treetops far more often
    // than they are smooth rock, and measured edge density across the real
    // sheets clusters around 0.3-0.4 for both.
    if (edgeDensity > 0.34) return MATERIAL.FOLIAGE;
    if (anisotropy > 0.4) return MATERIAL.WOOD;
    if (anisotropy < -0.4) return MATERIAL.WATER;
    // Rectangular cell structure: strong straight seams, low overall breakup,
    // and a border that is mostly one colour where the seam runs.
    if (edgeDensity > 0.12 && edgeDensity <= 0.3 && mirrorSymmetry > 0.7) {
      return MATERIAL.MASONRY;
    }
    if (edgeDensity <= 0.12) return MATERIAL.GROUND;
    return MATERIAL.STONE;
  })();

  return { material, stats };
}
