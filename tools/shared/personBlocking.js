/**
 * NES CheckPersonBlocking (Z_01) — Grumble / UW persons gate the north half
 * of the room until they leave.
 */

import { DIR } from './collision.js';
import { isGrumble } from './grumble.js';
import { isPersonType } from './moneyOrLife.js';

/** Link Y below this may walk north; at/above it, UP is cleared while a blocker lives. */
export const PERSON_BLOCK_Y = 0x8e;

/**
 * @param {number} objType
 */
export function isPersonBlockerType(objType) {
  return isGrumble(objType) || isPersonType(objType);
}

/**
 * @param {{ alive?: boolean, objType?: number, grumble?: boolean } | null | undefined} e
 */
export function isPersonBlocker(e) {
  if (!e?.alive) return false;
  if (e.grumble || isGrumble(e.objType)) return true;
  return isPersonType(e.objType);
}

/**
 * @param {Iterable<{ alive?: boolean, objType?: number, grumble?: boolean }> | null | undefined} enemies
 */
export function roomHasPersonBlocker(enemies) {
  for (const e of enemies ?? []) {
    if (isPersonBlocker(e)) return true;
  }
  return false;
}

/**
 * Strip UP from a direction mask when Link is in the blocked band.
 * @param {number} linkY room-local Y (HUD included)
 * @param {number} dirMask
 */
export function applyPersonBlocking(linkY, dirMask) {
  if ((linkY & 0xffff) < PERSON_BLOCK_Y && (dirMask & DIR.UP)) {
    return dirMask & ~DIR.UP;
  }
  return dirMask;
}
