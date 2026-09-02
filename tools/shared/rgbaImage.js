/**
 * Pack images stay as raw RGBA until something (a Pixi texture, a PNG
 * response) needs pixels the browser can draw.
 */

/**
 * Copy pack/raster bytes into a tightly sized clamped buffer.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array | Uint8ClampedArray | ArrayLike<number>} rgba
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function copyRgbaPixels(width, height, rgba) {
  const expected = width * height * 4;
  const data = new Uint8ClampedArray(expected);
  const src =
    rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray
      ? rgba
      : Uint8Array.from(rgba);
  data.set(src.subarray(0, Math.min(src.length, expected)));
  return { width, height, data };
}
