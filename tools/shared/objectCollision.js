/**
 * NES object contact: center proximity (CheckLinkCollision / DoObjectsCollide).
 *
 * Centers = ObjX/Y + 8 (or +4 X when half-width attr $40).
 * Link contact uses horizontal & vertical threshold $09.
 */

/** CheckLinkCollision → DoObjectsCollide with A = $09. */
export const LINK_CONTACT_THRESHOLD = 0x09;

/**
 * Collision center for a placed object (top-left ObjX/ObjY).
 * @param {number} x
 * @param {number} y
 * @param {{ halfWidth?: boolean }} [opts]
 */
export function objectMiddle(x, y, opts = {}) {
  return {
    x: x + (opts.halfWidth ? 4 : 8),
    y: y + 8,
  };
}

/**
 * Absolute distance compare used by DoObjectsCollideWithThresholds.
 * Collides when |dx| < thresholdX AND |dy| < thresholdY.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} [thresholdX]
 * @param {number} [thresholdY]
 */
export function objectsCollide(a, b, thresholdX = LINK_CONTACT_THRESHOLD, thresholdY = thresholdX) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx < thresholdX && dy < thresholdY;
}

/**
 * Link ↔ monster/projectile body contact (NES CheckLinkCollision).
 * @param {number} objX
 * @param {number} objY
 * @param {number} linkX
 * @param {number} linkY
 * @param {{ halfWidth?: boolean, threshold?: number }} [opts]
 */
export function objectTouchesLink(objX, objY, linkX, linkY, opts = {}) {
  const midObj = objectMiddle(objX, objY, { halfWidth: Boolean(opts.halfWidth) });
  const midLink = objectMiddle(linkX, linkY);
  const t = opts.threshold ?? LINK_CONTACT_THRESHOLD;
  return objectsCollide(midObj, midLink, t, t);
}
