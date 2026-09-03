/**
 * How large the play canvas is drawn on the page.
 *
 * Solo 256×240 integer-scales cleanly (4× on 1080p). The co-op 2×2 is
 * more than twice as tall, so a floor-fit is a postage stamp. Auto
 * therefore uses a fractional fit once the buffer is larger than one
 * NES frame.
 */

/** Extra pixels around the canvas when the play chrome is visible. */
export const STAGE_FIT_PAD = 32;

/**
 * How much of the stage to leave empty when fitting the canvas.
 * Immersive (game-only) mode uses the full box.
 * @param {boolean} immersive
 */
export function canvasFitPad(immersive) {
  return immersive ? 0 : STAGE_FIT_PAD;
}

/** Integer fit: the largest whole multiple that still fits. */
export function integerScale(availW, availH, internalW, internalH) {
  const sx = Math.floor(availW / internalW);
  const sy = Math.floor(availH / internalH);
  return Math.max(1, Math.min(sx, sy));
}

/**
 * Fractional fit that still fills the stage. Floor of 0.5 so a co-op
 * frame can shrink on a small window instead of overflowing it.
 */
export function fitScale(availW, availH, internalW, internalH) {
  if (internalW <= 0 || internalH <= 0) return 1;
  const s = Math.min(availW / internalW, availH / internalH);
  return Math.max(0.5, s);
}

/**
 * How much of `rect` is actually on screen.
 *
 * A co-op canvas can stretch the stage taller than the window. Sizing the
 * next picture from that grown clientHeight would pick a 3× 256×240 frame
 * and clip it. Intersect with the viewport first.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {{ width: number, height: number }} viewport
 * @param {number} [pad]
 */
export function visibleAvail(rect, viewport, pad = 0) {
  const width = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  return {
    availW: Math.max(0, width - pad),
    availH: Math.max(0, height - pad),
  };
}

/**
 * CSS multiplier for the canvas.
 *
 * `option` is `'auto'` or a 1–6 fixed scale. Auto on the ROM frame stays
 * integer so a solo playthrough is pixel-identical; auto on a split frame
 * uses {@link fitScale}. If even 1× would overflow the stage, auto falls
 * back to a fractional fit instead of clipping.
 *
 * @param {object} opts
 * @param {number} opts.availW
 * @param {number} opts.availH
 * @param {number} opts.internalW
 * @param {number} opts.internalH
 * @param {number | 'auto'} [opts.option]
 */
export function canvasCssScale({
  availW,
  availH,
  internalW,
  internalH,
  option = 'auto',
}) {
  if (option !== 'auto') {
    return Math.max(1, Math.min(6, Number(option) || 1));
  }
  const split = internalW > 256 || internalH > 240;
  if (split) return fitScale(availW, availH, internalW, internalH);
  const integer = integerScale(availW, availH, internalW, internalH);
  if (integer * internalW <= availW && integer * internalH <= availH) {
    return integer;
  }
  return fitScale(availW, availH, internalW, internalH);
}
