/**
 * Connected-component analysis of a tile's slot plane.
 *
 * The enhancer needs to tell two very different things apart:
 *
 *   - An **enclosed** region sits entirely inside the tile and never touches
 *     its border. That is an *object* — a rock, a bush, Link's head, a key. We
 *     know its full extent, so we can light it as a solid body: bright on the
 *     upper-left, falling off to a shadowed lower-right.
 *
 *   - An **open** region runs off the edge of the tile. That is a *surface*
 *     that continues into whatever tile is drawn next to it — a wall, a lake, a
 *     floor. We must not give it a body gradient, because the gradient would
 *     restart at every tile boundary and paint a visible 16-pixel grid across
 *     the whole map. Those get edge-local shading only, which stays seamless
 *     no matter what is placed alongside.
 *
 * Making that distinction geometrically is what lets a single pass handle both
 * objects and terrain without the enhancer knowing what any tile depicts.
 */

/**
 * @param {Uint8Array} slots
 * @param {number} w
 * @param {number} h
 * @returns {{
 *   labels: Int16Array,
 *   regions: { slot: number, enclosed: boolean, cx: number, cy: number, radius: number, area: number }[]
 * }}
 */
export function findRegions(slots, w, h) {
  const labels = new Int16Array(w * h).fill(-1);
  const regions = [];
  const stack = [];

  for (let start = 0; start < slots.length; start += 1) {
    if (labels[start] !== -1) continue;
    const slot = slots[start];
    const id = regions.length;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    let touchesBorder = false;

    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i / w) | 0;
      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;

      if (x > 0 && labels[i - 1] === -1 && slots[i - 1] === slot) {
        labels[i - 1] = id;
        stack.push(i - 1);
      }
      if (x + 1 < w && labels[i + 1] === -1 && slots[i + 1] === slot) {
        labels[i + 1] = id;
        stack.push(i + 1);
      }
      if (y > 0 && labels[i - w] === -1 && slots[i - w] === slot) {
        labels[i - w] = id;
        stack.push(i - w);
      }
      if (y + 1 < h && labels[i + w] === -1 && slots[i + w] === slot) {
        labels[i + w] = id;
        stack.push(i + w);
      }
    }

    regions.push({
      slot,
      enclosed: !touchesBorder,
      cx: sumX / area,
      cy: sumY / area,
      // Half-diagonal of the bounding box: the distance over which the body
      // gradient runs from full highlight to full shadow.
      radius: Math.max(1, Math.hypot(maxX - minX + 1, maxY - minY + 1) / 2),
      area,
    });
  }

  return { labels, regions };
}
