/**
 * Graphics scale. The game draws the original NES art, at 1x, only.
 *
 * This module used to select between the original art and an enhanced 2x set,
 * and every drawing path still asks it how many sheet pixels a tile occupies.
 * The enhanced mode has been withdrawn, so `scale()` is pinned at 1 and every
 * source rectangle comes out in native NES units.
 *
 * The indirection is kept rather than deleted because twelve modules call into
 * it, and because the enhanced pipeline still lives in `tools/enhance/` — this
 * is the single point that would re-enable it, not a change spread across the
 * renderer.
 *
 * Game-world coordinates never depended on this: Link is 16 NES pixels tall and
 * every hitbox, speed and screen bound is in NES units regardless of scale.
 */

/** @type {1} */
const activeScale = 1;

export const GRAPHICS_MODES = Object.freeze({
  CLASSIC: 'classic',
});

/** Native NES tile size. */
export const NES_TILE = 8;

/**
 * Accepted and ignored: the game has one graphics mode. Kept so callers that
 * still pass a saved option do not need to know that.
 * @param {string} _mode
 */
export function setGraphicsMode(_mode) {
  /* original art only */
}

/** @returns {string} the active mode id */
export function graphicsMode() {
  return GRAPHICS_MODES.CLASSIC;
}

/** @returns {number} sheet pixels per NES pixel */
export function scale() {
  return activeScale;
}

/** @returns {number} sheet pixels per tile edge */
export function tilePx() {
  return NES_TILE * activeScale;
}

/**
 * Scale a length expressed in NES pixels to sheet pixels.
 * @param {number} n
 */
export function px(n) {
  return n * activeScale;
}

/** @returns {string} public asset directory holding the sheets */
export function graphicsDir() {
  return '/graphics';
}

/**
 * Public URL of a sheet or data file in the active graphics set.
 * @param {string} file e.g. "common_sprites.png"
 */
export function graphicsUrl(file) {
  return `${graphicsDir()}/${file}`;
}

/**
 * Tag a texture built at the active scale so the scene graph keeps treating it
 * as NES-sized. Call this on every texture assembled from sheet pixels.
 *
 * Setting the source resolution is necessary but not sufficient: a Texture
 * copies its frame dimensions from the source when it is constructed, and
 * changing the resolution afterwards resizes the source without touching that
 * cached frame. The sprite would keep drawing at the full device size — twice
 * as large as it should be. So the frame is resynced and the UVs rebuilt.
 *
 * Only whole-source textures are safe to adjust this way; a texture carrying
 * its own sub-frame (an atlas region) is left alone.
 *
 * @template {import('pixi.js').Texture} T
 * @param {T} texture
 * @returns {T}
 */
export function markScaled(texture) {
  const { source } = texture;
  source.scaleMode = 'nearest';
  if (source.resolution !== activeScale) {
    source.resolution = activeScale;
    if (texture.noFrame) {
      texture.frame.width = source.width;
      texture.frame.height = source.height;
      texture.updateUvs();
    }
  }
  return texture;
}
