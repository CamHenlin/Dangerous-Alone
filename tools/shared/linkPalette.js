import { nesColor } from './nesPalette.js';
import { spritePaletteRowsFromSet } from './enemyPalette.js';

/**
 * `LinkColors` / `LinkColors_CommonCode` — NES color written into SP0 slot 1
 * (tunic) when `InvRing` is 0 / 1 / 2.
 * @see Z_02.asm:2235, Z_01.asm:4383, TakeItem ring patch @ Z_01.asm:4711
 */
export const LINK_TUNIC_NES = Object.freeze([0x29, 0x32, 0x16]);

/**
 * @param {number} ring InvRing 0 none / 1 blue / 2 red
 * @returns {number} NES master-palette index
 */
export function linkTunicNesColor(ring) {
  const i = Math.max(0, Math.min(2, Number(ring) || 0));
  return LINK_TUNIC_NES[i];
}

/**
 * Link always draws with SP0; buying a ring patches color 1 of that row
 * (`PatchAndCueLevelPalettesTransferAndAdvanceSubmode`).
 *
 * @param {{ rowsRgb?: number[][][], rows?: number[][] } | null | undefined} paletteSet
 * @param {number} ring
 * @returns {(readonly number[])[]} four RGB triples for SP0
 */
export function linkPaletteRgb(paletteSet, ring) {
  const base = spritePaletteRowsFromSet(paletteSet)[0];
  return [
    base[0],
    nesColor(linkTunicNesColor(ring)),
    base[2],
    base[3],
  ];
}
