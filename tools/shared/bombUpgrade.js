/**
 * UW “more bombs” person (object `$4F`) — UpdateUnderworldPersonComplexState_SenseLink.
 * Pay 100 rupees at ($78,$98); MaxBombs += 4 and fill InvBombs.
 */

export const BOMB_UPGRADE_PERSON = 0x4f;
export const BOMB_UPGRADE_PRICE = 100;
export const BOMB_UPGRADE_STEP = 4;
export const BOMB_UPGRADE_WARE = Object.freeze({ x: 0x78, y: 0x98 });

/**
 * @param {number} objType
 */
export function isBombUpgradePerson(objType) {
  return objType === BOMB_UPGRADE_PERSON;
}

/**
 * Living bomb-upgrade person in the room.
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 */
export function bombUpgradePersonAlive(enemies) {
  return enemies.some((e) => e?.alive && isBombUpgradePerson(e.objType));
}

/**
 * Stand on the rupee ware to buy +4 bomb capacity (NES Abs(Y−$98) < 6, X=$78).
 * @param {{ rupees?: number, bombs?: number, maxBombs?: number }} inv
 * @param {number} linkX
 * @param {number} linkY
 * @returns {boolean}
 */
export function tryBuyBombUpgrade(inv, linkX, linkY) {
  if (linkX !== BOMB_UPGRADE_WARE.x) return false;
  if (Math.abs(linkY - BOMB_UPGRADE_WARE.y) >= 6) return false;
  if ((inv.rupees ?? 0) < BOMB_UPGRADE_PRICE) return false;
  inv.rupees -= BOMB_UPGRADE_PRICE;
  const bag = inv.bombBag ?? 8;
  const party = Math.max(1, Math.round((inv.maxBombs ?? bag) / bag));
  inv.bombBag = bag + BOMB_UPGRADE_STEP;
  inv.maxBombs = inv.bombBag * party;
  inv.bombs = inv.maxBombs;
  return true;
}

/**
 * Remove the bomb-upgrade person after a successful purchase.
 * @param {{ alive?: boolean, objType?: number, hp?: number }[]} enemies
 */
export function dismissBombUpgradePerson(enemies) {
  for (const e of enemies) {
    if (isBombUpgradePerson(e.objType) && e.alive) {
      e.alive = false;
      e.hp = 0;
    }
  }
}
