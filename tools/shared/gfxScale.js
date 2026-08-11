/**
 * Active graphics mode: original NES art, or the enhanced 2x/256-colour set.
 *
 * The enhanced sheets are laid out exactly like the originals — same tile
 * order, same grid position — only every tile is 16x16 instead of 8x8. So the
 * entire runtime difference reduces to one number: how many sheet pixels a tile
 * occupies. Multiply every source rectangle by `scale()` and the same drawing
 * code serves both modes.
 *
 * Game-world coordinates never change. Link is still 16 NES pixels tall and
 * every hitbox, speed and screen bound stays in NES units; only the number of
 * device pixels used to draw them goes up. That separation is what keeps a
 * cosmetic overhaul from touching collision or timing. The bridge is Pixi's
 * texture `resolution`: a 32x32 texture at resolution 2 reports itself as 16x16
 * to the scene graph, so existing positioning code needs no edits at all.
 *
 * The mode is chosen once at boot from saved options. Changing it swaps every
 * loaded texture, so the play client reloads rather than trying to rebuild them
 * in place.
 */

/** @type {1 | 2} */
let activeScale = 1;

export const GRAPHICS_MODES = Object.freeze({
  CLASSIC: 'classic',
  ENHANCED: 'enhanced',
});

/** Native NES tile size. Enhanced art is a multiple of this. */
export const NES_TILE = 8;

/**
 * @param {string} mode one of GRAPHICS_MODES
 */
export function setGraphicsMode(mode) {
  activeScale = mode === GRAPHICS_MODES.ENHANCED ? 2 : 1;
}

/** @returns {string} the active mode id */
export function graphicsMode() {
  return activeScale === 2 ? GRAPHICS_MODES.ENHANCED : GRAPHICS_MODES.CLASSIC;
}

/** @returns {number} sheet pixels per NES pixel: 1 classic, 2 enhanced */
export function scale() {
  return activeScale;
}

/** @returns {number} sheet pixels per tile edge: 8 classic, 16 enhanced */
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

/** @returns {string} public asset directory holding the active sheets */
export function graphicsDir() {
  return activeScale === 2 ? '/graphics2x' : '/graphics';
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
