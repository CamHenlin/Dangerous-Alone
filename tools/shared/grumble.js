/**
 * Hungry Goriya / Grumble ($36) — blocks until bait is fed (Z_01).
 *
 * Northward motion while he lives is gated by `personBlocking.js`
 * (CheckPersonBlocking). Dialogue uses PersonText selector `$24`.
 */

export const GRUMBLE = 0x36;

/** InitGrumble_Full → PersonTextSelector. */
export const GRUMBLE_TEXT_SEL = 0x24;

export function isGrumble(objType) {
  return objType === GRUMBLE;
}

/**
 * @param {(spawn: object) => object | null} createEnemy
 * @param {{ x?: number, y?: number }} [origin]
 */
export function createGrumble(createEnemy, origin = {}) {
  const e = createEnemy({
    objType: GRUMBLE,
    x: (origin.x ?? 0) + 0x78,
    y: (origin.y ?? 0) + 0x80,
  });
  if (!e) return null;
  e.npc = true;
  e.hp = 0xffff;
  e.invulnMask = 0xff;
  e.grumble = true;
  e.fed = false;
  e.feedTimer = 0;
  return e;
}

/**
 * Feed when bait is near; clears InvFood via caller.
 * @param {object} e
 * @param {{ x: number, y: number, alive?: boolean } | null} bait
 * @returns {boolean} true if just fed
 */
export function tryFeedGrumble(e, bait) {
  if (!e?.alive || !e.grumble || e.fed || !bait?.alive) return false;
  if (Math.abs(bait.x - e.x) > 20 || Math.abs(bait.y - e.y) > 20) return false;
  e.fed = true;
  e.feedTimer = 0x40;
  bait.alive = false;
  return true;
}

/**
 * @param {object} e
 * @returns {boolean} true if despawned
 */
export function stepGrumble(e) {
  if (!e?.alive || !e.grumble) return false;
  if (!e.fed) return false;
  e.feedTimer = (e.feedTimer ?? 0) - 1;
  if (e.feedTimer > 0) return false;
  e.alive = false;
  e.hp = 0;
  return true;
}
