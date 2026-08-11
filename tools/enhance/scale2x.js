/**
 * Shape-aware 2x upscale of a slot plane (the Scale2x / EPX rule).
 *
 * A naive 2x nearest-neighbour blow-up gives us four times the pixels and zero
 * extra information — every staircase edge just becomes a bigger staircase.
 * Scale2x instead reads each pixel's four orthogonal neighbours and rounds a
 * corner only where two agreeing neighbours meet against a differing pair, so
 * diagonals soften while straight runs and single-pixel details stay crisp.
 * That is what we want here: the tile keeps its silhouette and its spirit, but
 * gains room for shading to live in.
 *
 * Out-of-bounds neighbours clamp to the edge pixel. That is deliberate and
 * load-bearing: a clamped border can never satisfy the "two differing
 * neighbours" test, so no rounding happens at a tile boundary. Background tiles
 * that abut each other on the map therefore still line up seamlessly, even
 * though the enhancer only ever sees one 8x8 tile at a time and has no idea
 * what will be drawn next to it.
 */

/**
 * @param {Uint8Array} src `w * h` slot values
 * @param {number} w
 * @param {number} h
 * @returns {{ pixels: Uint8Array, width: number, height: number }}
 */
export function scale2x(src, w, h) {
  const dw = w * 2;
  const dh = h * 2;
  const out = new Uint8Array(dw * dh);
  const at = (x, y) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[cy * w + cx];
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = at(x, y);
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const c = at(x - 1, y);
      const d = at(x, y + 1);

      let e0 = p;
      let e1 = p;
      let e2 = p;
      let e3 = p;
      if (c === a && c !== d && a !== b) e0 = a;
      if (a === b && a !== c && b !== d) e1 = b;
      if (d === c && d !== b && c !== a) e2 = c;
      if (b === d && b !== a && d !== c) e3 = d;

      const dx = x * 2;
      const dy = y * 2;
      out[dy * dw + dx] = e0;
      out[dy * dw + dx + 1] = e1;
      out[(dy + 1) * dw + dx] = e2;
      out[(dy + 1) * dw + dx + 1] = e3;
    }
  }

  return { pixels: out, width: dw, height: dh };
}
