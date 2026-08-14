/**
 * Shift an absolute colour from one palette row into another.
 *
 * Enhanced tiles carry colours the model chose, not entries of any particular
 * palette row — that freedom is what makes them look better than a reshaded
 * original. But the game still recolours: the same wall tile is grey in level 1
 * and blue in level 7, and the same terrain tile takes different rows on
 * different overworld screens.
 *
 * The companion slot plane says which of the original four NES colours a pixel
 * descends from. Scaling the pixel by the ratio between that slot's old and new
 * base colour moves it into the new row while preserving how it differed from
 * its base — so shading, texture and hue variation all survive the swap.
 *
 * Ratios are used rather than offsets because they preserve relative contrast:
 * a highlight stays proportionally brighter than the base rather than
 * collapsing toward it.
 */

/** Below this the base colour carries no usable ratio; fall back to the base. */
const DARK_FLOOR = 12;

/**
 * @param {readonly number[]} rgb the pixel's own colour
 * @param {readonly number[]} fromBase base colour of its slot as generated
 * @param {readonly number[]} toBase base colour of its slot in the target row
 * @returns {[number, number, number]}
 */
export function shiftColour(rgb, fromBase, toBase) {
  const scaled = [0, 1, 2].map((c) => {
    const from = fromBase[c];
    const to = toBase[c];
    // A near-black source channel has no ratio to preserve; take the target's
    // channel directly rather than multiplying by an exploding factor.
    return from <= DARK_FLOOR ? to + (rgb[c] - from) : (rgb[c] * to) / from;
  });

  // Clamping channels independently drags the hue toward white — shifting a
  // shaded orange into a brighter cream turned it into flat white. Rescale the
  // whole triple to fit instead, which keeps the ratio between channels.
  const peak = Math.max(scaled[0], scaled[1], scaled[2]);
  if (peak > 255) {
    for (let c = 0; c < 3; c += 1) scaled[c] = (scaled[c] * 255) / peak;
  }

  return /** @type {[number, number, number]} */ (
    scaled.map((v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v)))
  );
}
