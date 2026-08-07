/**
 * Potion ("medicine") shop letter gate.
 *
 * ROM: `UpdateCavePerson` @ `Z_01.asm:307`. For cave/person type `$74` the
 * routine draws the shopkeeper and then *returns early* unless `InvLetter`
 * already equals 2 — so the wares, the prices and the whole cave state machine
 * (`UpdateCavePerson_JumpTable` @ `Z_01.asm:367`) stay dormant until Link shows
 * the letter with B.
 */

import { B_ITEM } from './inventory.js';

/** `ObjType+1` for the medicine shop (`Z_01.asm:323`). */
export const POTION_SHOP_PERSON_TYPE = 0x74;

/** `InvLetter` states (`Z_01.asm:326`, `Z_01.asm:354`). */
export const LETTER = Object.freeze({
  NONE: 0,
  HELD: 1,
  SHOWN: 2,
});

/**
 * `SelectedItemSlot` value the ROM requires before B counts as "show letter".
 * `CheckMissingItem` @ `Z_07.asm:1054` only assigns it when the potion slot is
 * empty and a letter is held.
 */
export const LETTER_ITEM_SLOT = 0x0f;

/**
 * @param {{ kind?: string } | null} cave
 */
export function isPotionShop(cave) {
  return cave?.kind === 'potion';
}

/**
 * @param {{ letter?: number }} inv
 */
export function letterWasShown(inv) {
  return (inv?.letter ?? 0) >= LETTER.SHOWN;
}

/**
 * Wares, prices and dialogue are all suppressed while the gate is closed.
 * @param {{ kind?: string } | null} cave
 * @param {{ letter?: number }} inv
 */
export function potionShopWaresHidden(cave, inv) {
  return isPotionShop(cave) && !letterWasShown(inv);
}

/**
 * True when B would be read as "show the letter" (`Z_01.asm:329`): the letter
 * must be held-but-unused *and* occupying the B slot, which on NES only happens
 * when there is no potion to displace it.
 * @param {{ kind?: string } | null} cave
 * @param {{ letter?: number, potion?: number, selectedB?: string }} inv
 */
export function canShowLetter(cave, inv) {
  if (!isPotionShop(cave)) return false;
  if ((inv?.letter ?? 0) !== LETTER.HELD) return false;
  if ((inv?.potion ?? 0) > 0) return false;
  return inv?.selectedB === B_ITEM.POTION;
}

/**
 * `@UseLetter` @ `Z_01.asm:346`: Tune1 `$04` ("secret found"), `INC InvLetter`,
 * and the B slot is retargeted from the letter (`$0F`) to the potion (`$07`).
 * @param {{ letter?: number, selectedB?: string }} inv
 * @returns {{ ok: boolean, tune?: string }}
 */
export function showLetter(inv) {
  if ((inv?.letter ?? 0) !== LETTER.HELD) return { ok: false };
  inv.letter = LETTER.SHOWN;
  inv.selectedB = B_ITEM.POTION;
  return { ok: true, tune: 'secret' };
}
