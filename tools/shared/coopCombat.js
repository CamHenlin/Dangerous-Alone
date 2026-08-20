/**
 * Who a blast is allowed to hurt.
 *
 * Players walk through each other and their swords, arrows and flames do
 * the same. A bomb is the exception the ROM already had: the one who set
 * it can still be caught in it. Allies are not.
 */

import { bombHits } from './bomb.js';

const HERO_BOX = { w: 16, h: 16 };

/**
 * @param {object} bomb
 * @param {{ x: number, y: number }} link
 */
export function bombHitsHero(bomb, link) {
  if (!bomb || !link) return false;
  return bombHits(bomb, { x: link.x, y: link.y, w: HERO_BOX.w, h: HERO_BOX.h });
}

/**
 * True when this blast should hurt this hero.
 *
 * No `owner` means the old single-hero bomb — it hurts whoever is standing
 * on it, which is you. An owned bomb hurts only its owner.
 *
 * @param {object} bomb
 * @param {{ index: number, link: { x: number, y: number } }} player
 */
export function bombHurtsHero(bomb, player) {
  if (!bombHurtsEligible(bomb, player)) return false;
  return bombHitsHero(bomb, player.link);
}

/**
 * @param {object} bomb
 * @param {{ index: number }} player
 */
export function bombHurtsEligible(bomb, player) {
  if (!bomb || !player) return false;
  if (bomb.owner == null) return true;
  return bomb.owner === player.index;
}

/** Half-hearts a Link-bomb deals (one heart, before the ring). */
export const BOMB_LINK_DAMAGE = 2;
