/**
 * Money-or-life underworld person (object `$51`) — NES UpdateUnderworldPersonLifeOrMoney.
 */

export const MONEY_OR_LIFE_PERSON = 0x51;

/** Person object types `$4B–$52` (NES: ≥$4B and <$53; `$53` is flying rock). */
export function isPersonType(objType) {
  return objType >= 0x4b && objType <= 0x52;
}

export const LIFE_OR_MONEY_WARES = Object.freeze([
  { x: 0x58, y: 0x98, kind: 'heart' }, // −1 heart container
  { x: 0x98, y: 0x98, kind: 'rupees' }, // −50 rupees
]);

/**
 * Slot-1 / living money-or-life person still present.
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 */
export function moneyOrLifePersonAlive(enemies) {
  return enemies.some((e) => e?.alive && e.objType === MONEY_OR_LIFE_PERSON);
}

/**
 * CheckSecretTriggerMoneyOrLife — person gone → ready.
 * @param {{ alive?: boolean, objType?: number }[]} enemies
 */
export function moneyOrLifeReady(enemies) {
  return !moneyOrLifePersonAlive(enemies);
}

/**
 * Pay by standing on a ware (NES state 2 vertical distance < 6).
 * @param {{ rupees?: number, maxHalfHearts?: number, halfHearts?: number }} inv
 * @param {number} linkX
 * @param {number} linkY
 * @returns {'heart' | 'rupees' | null}
 */
export function tryPayMoneyOrLife(inv, linkX, linkY) {
  for (const ware of LIFE_OR_MONEY_WARES) {
    if (linkX !== ware.x) continue;
    if (Math.abs(linkY - ware.y) >= 6) continue;
    if (ware.kind === 'rupees') {
      if ((inv.rupees ?? 0) < 50) return null;
      inv.rupees -= 50;
      return 'rupees';
    }
    // Heart container sacrifice (−1 container, clamp full hearts).
    const containers = Math.floor((inv.maxHalfHearts ?? 6) / 2);
    if (containers < 4) {
      // NES: leave containers, zero partial → deadly next hit. Approximate: leave ½♥.
      inv.halfHearts = Math.min(inv.halfHearts, 1);
      return 'heart';
    }
    inv.maxHalfHearts = Math.max(6, inv.maxHalfHearts - 2);
    inv.halfHearts = Math.min(inv.halfHearts, inv.maxHalfHearts);
    return 'heart';
  }
  return null;
}

/**
 * Remove the money-or-life person after a successful pay.
 * @param {{ alive?: boolean, objType?: number, hp?: number }[]} enemies
 */
export function dismissMoneyOrLifePerson(enemies) {
  for (const e of enemies) {
    if (e.objType === MONEY_OR_LIFE_PERSON && e.alive) {
      e.alive = false;
      e.hp = 0;
    }
  }
}
