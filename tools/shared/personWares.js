/**
 * Underworld person offer wares — NES UpdateUnderworldPersonComplex /
 * DrawLifeOrMoneyItems. Bomb-upgrade shows item `$18` at ($78,$98) with
 * price "-100"; money-or-life shows `$1A`/`$18` at ($58,$98)/($98,$98).
 */

import {
  BOMB_UPGRADE_PRICE,
  BOMB_UPGRADE_WARE,
  bombUpgradePersonAlive,
} from './bombUpgrade.js';
import {
  LIFE_OR_MONEY_WARES,
  moneyOrLifePersonAlive,
} from './moneyOrLife.js';

/** AnimateItemObject item types used as person wares. */
export const PERSON_WARE_RUPEE = 0x18;
export const PERSON_WARE_HEART = 0x1a;

/**
 * @typedef {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   itemType: number,
 *   priceLabel: string,
 * }} PersonWare
 */

/**
 * Active pay-to-take wares for living UW persons in `enemies`.
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 * @param {{ bombTaken?: boolean, moneyOrLifeTaken?: boolean }} [opts]
 * @returns {PersonWare[]}
 */
export function personOfferWares(enemies, opts = {}) {
  /** @type {PersonWare[]} */
  const wares = [];
  if (!opts.bombTaken && bombUpgradePersonAlive(enemies)) {
    wares.push({
      id: 'bomb-upgrade',
      x: BOMB_UPGRADE_WARE.x,
      y: BOMB_UPGRADE_WARE.y,
      itemType: PERSON_WARE_RUPEE,
      priceLabel: `-${BOMB_UPGRADE_PRICE}`,
    });
  }
  if (!opts.moneyOrLifeTaken && moneyOrLifePersonAlive(enemies)) {
    for (const w of LIFE_OR_MONEY_WARES) {
      wares.push({
        id: `mol-${w.kind}`,
        x: w.x,
        y: w.y,
        itemType: w.kind === 'heart' ? PERSON_WARE_HEART : PERSON_WARE_RUPEE,
        priceLabel: w.kind === 'heart' ? '-1' : '-50',
      });
    }
  }
  return wares;
}
