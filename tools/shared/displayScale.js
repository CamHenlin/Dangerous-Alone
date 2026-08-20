/**
 * How large the play canvas is drawn on the page.
 *
 * Solo 256×240 integer-scales cleanly (4× on 1080p). The co-op frame is
 * 512×544, so a floor-fit is 1× on the same screen. Auto therefore
 * uses a fractional fit once the buffer is larger than one NES frame —
 * nearest-neighbour at 1.98× is a better read than a postage stamp.
 */

/** Integer fit: the largest whole multiple that still fits. */
export function integerScale(availW, availH, internalW, internalH) {
  const sx = Math.floor(availW / internalW);
  const sy = Math.floor(availH / internalH);
  return Math.max(1, Math.min(sx, sy));
}

/**
 * Fractional fit that still fills the stage. Floor of 0.5 so a 512×544
 * frame can shrink on a small window instead of overflowing it.
 */
export function fitScale(availW, availH, internalW, internalH) {
  if (internalW <= 0 || internalH <= 0) return 1;
  const s = Math.min(availW / internalW, availH / internalH);
  return Math.max(0.5, s);
}

/**
 * CSS multiplier for the canvas.
 *
 * `option` is `'auto'` or a 1–6 fixed scale. Auto on the ROM frame stays
 * integer so a solo playthrough is pixel-identical; auto on a split frame
 * uses {@link fitScale}.
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
  return split
    ? fitScale(availW, availH, internalW, internalH)
    : integerScale(availW, availH, internalW, internalH);
}
