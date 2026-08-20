/**
 * How the purse and the bomb bag grow with the party, and how a heart
 * container is shared.
 *
 * Solo keeps the ROM numbers: 255 rupees, an 8-bomb bag, a container that
 * fills only you. Co-op multiplies the caps by who is sitting down, and a
 * container raises everyone's max while still filling only the finder.
 * Leaving does not confiscate what you already hold: the rupee ceiling
 * ratchets down as you spend, and bombs keep the excess.
 */

import { ratchetRupeeCap } from './inventory.js';
import { activePlayers } from './player.js';

export const SOLO_RUPEE_CAP = 255;
export const SOLO_BOMB_BAG = 8;

/**
 * @param {number} playerCount
 */
export function rupeeCap(playerCount) {
  return SOLO_RUPEE_CAP * Math.max(1, playerCount | 0);
}

/**
 * @param {number} bag the ROM bag (8, then +4 per upgrade)
 * @param {number} playerCount
 */
export function bombCap(bag, playerCount) {
  return Math.max(1, bag | 0) * Math.max(1, playerCount | 0);
}

/**
 * Point the shared purse at this party size.
 *
 * `bombBag` is the unscaled ROM bag so an upgrade and a join cannot fight
 * each other. A leave does not drop the rupee ceiling under a pile you
 * already hold — `rupeeCap` ratchets down as rupees are spent until it
 * meets the new party floor. Bombs keep the excess and stop adding more.
 *
 * @param {object} inv the shared bag (or a view onto it)
 * @param {number} playerCount
 */
export function applyPartyCaps(inv, playerCount) {
  if (!inv) return inv;
  const n = Math.max(1, playerCount | 0);
  if (inv.bombBag == null) inv.bombBag = inv.maxBombs ?? SOLO_BOMB_BAG;
  inv.rupeeCapFloor = rupeeCap(n);
  ratchetRupeeCap(inv);
  inv.maxBombs = bombCap(inv.bombBag, n);
  return inv;
}

/**
 * A heart container raises every hero's max and fills only the finder.
 *
 * `grantRoomItem` / `grantCaveItem` already did the finder's half. This is
 * the other players' half, so a container found in company is not a private
 * upgrade.
 *
 * @param {readonly object[]} players
 * @param {object} [finder]
 */
export function shareHeartContainer(players, finder) {
  for (const p of activePlayers(players)) {
    if (p === finder || !p.inv) continue;
    p.inv.maxHalfHearts = (p.inv.maxHalfHearts ?? 0) + 2;
  }
  return players;
}
