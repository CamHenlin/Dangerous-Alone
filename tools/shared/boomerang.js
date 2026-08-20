import { DIR } from './collision.js';
import { rectsOverlap } from './sword.js';

export const BOOM_PHASE = Object.freeze({
  OUT: 'out',
  RETURN: 'return',
  DONE: 'done',
});

/** Stun length in frames (~ObjStunTimer $10 × ~$A NMI ticks). */
export const BOOMERANG_STUN_FRAMES = 0xa0;

/**
 * @typedef {object} Boomerang
 * @property {number} x
 * @property {number} y
 * @property {number} dir
 * @property {number} speed
 * @property {number} dist
 * @property {number} maxDist
 * @property {string} phase
 * @property {boolean} hit
 * @property {boolean} [magic]
 * @property {boolean} [hostile]
 * @property {number} [ownerId] enemy id, hostile throws only
 * @property {number} [owner] player index, Link's throw
 */

/**
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir
 * @param {boolean} [magic]
 * @param {number} [owner] player index of the thrower
 * @returns {Boomerang}
 */
export function throwBoomerang(linkX, linkY, dir, magic = false, owner = 0) {
  return {
    x: linkX + 4,
    y: linkY + 4,
    dir,
    speed: 3,
    dist: 0,
    maxDist: magic ? 0xff : 0x31,
    phase: BOOM_PHASE.OUT,
    hit: false,
    hostile: false,
    magic: Boolean(magic),
    owner,
  };
}

/**
 * Where Link's boom flies back to this frame.
 *
 * `owner` is a player index. Passing the current hero's feet — whoever the
 * world happened to step first — is what sent player two's throw to player one.
 *
 * @param {Boomerang} boom
 * @param {readonly { index: number, x: number, y: number }[]} throwers
 * @param {{ x: number, y: number } | null} [fallback]
 * @returns {{ x: number, y: number } | null}
 */
export function boomerangReturnPos(boom, throwers, fallback = null) {
  if (boom?.owner == null) return fallback;
  const owner = throwers.find((p) => p.index === boom.owner);
  return owner ? { x: owner.x, y: owner.y } : fallback;
}

/**
 * Goriya boomerang (object `$5C`) — max travel ~$51, returns to thrower.
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @returns {Boomerang & { hostile: true, ownerId: number }}
 */
export function throwEnemyBoomerang(x, y, dir, ownerId = 0) {
  return {
    x: x + 4,
    y: y + 4,
    dir,
    speed: 3,
    dist: 0,
    maxDist: 0x51,
    phase: BOOM_PHASE.OUT,
    hit: false,
    hostile: true,
    ownerId,
  };
}

/**
 * @param {Boomerang} boom
 * @param {number} returnX return target (Link or thrower)
 * @param {number} returnY
 */
export function stepBoomerang(boom, returnX, returnY) {
  if (boom.phase === BOOM_PHASE.DONE) return boom;

  if (boom.phase === BOOM_PHASE.OUT) {
    if (boom.dir & DIR.RIGHT) boom.x += boom.speed;
    if (boom.dir & DIR.LEFT) boom.x -= boom.speed;
    if (boom.dir & DIR.DOWN) boom.y += boom.speed;
    if (boom.dir & DIR.UP) boom.y -= boom.speed;
    boom.dist += boom.speed;
    if (boom.dist >= boom.maxDist || boom.hit) {
      boom.phase = BOOM_PHASE.RETURN;
      boom.speed = 4;
    }
    return boom;
  }

  // Return toward thrower / Link.
  const dx = returnX + 4 - boom.x;
  const dy = returnY + 4 - boom.y;
  if (Math.abs(dx) <= boom.speed && Math.abs(dy) <= boom.speed) {
    boom.phase = BOOM_PHASE.DONE;
    return boom;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    boom.x += dx > 0 ? boom.speed : -boom.speed;
  } else {
    boom.y += dy > 0 ? boom.speed : -boom.speed;
  }
  return boom;
}

/**
 * Hostile boom hits Link (centers within 8px).
 * @param {Boomerang} boom
 * @param {number} linkX
 * @param {number} linkY
 */
export function enemyBoomerangHitsLink(boom, linkX, linkY) {
  if (!boom?.hostile || boom.phase === BOOM_PHASE.DONE) return false;
  return rectsOverlap(
    { x: boom.x, y: boom.y, w: 8, h: 8 },
    { x: linkX + 4, y: linkY + 4, w: 8, h: 8 },
  );
}

/**
 * @param {Boomerang} boom
 * @param {{ x: number, y: number, w: number, h: number }} rect
 */
export function boomerangHits(boom, rect) {
  if (boom.phase === BOOM_PHASE.DONE) return false;
  return rectsOverlap({ x: boom.x, y: boom.y, w: 8, h: 8 }, rect);
}

/** In-flight player throws (hostile Goriya booms live in a separate list). */
export function liveBoomerangs(list) {
  return (list ?? []).filter((b) => b && b.phase !== BOOM_PHASE.DONE);
}

/**
 * This hero's throw, if it is still in the air.
 * @param {readonly Boomerang[] | null | undefined} list
 * @param {number} index
 */
export function playerBoomerang(list, index) {
  return liveBoomerangs(list).find((b) => b.owner === index) ?? null;
}
