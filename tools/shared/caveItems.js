/**
 * CHR top tiles for cave wares (common_sprites 8×16), keyed by Item_codes.
 */

import { chrTileForItemId } from './itemFrame.js';

/**
 * Sprite palette row for a cave ware (grade items use value−1 / tier colors).
 * @param {number} itemId
 */
export function caveItemSpritePalette(itemId) {
  switch (itemId & 0x3f) {
    case 0x01: // wood sword
      return 0;
    case 0x02: // white sword
      return 1;
    case 0x03: // magic sword
      return 2;
    case 0x07: // red candle
    case 0x13: // red ring
    case 0x1e: // magic boom
    case 0x20: // red potion
      return 2;
    case 0x06: // blue candle
    case 0x09: // silver arrow (NES DrawItemBySlot → SP1)
    case 0x12: // blue ring
    case 0x1f: // blue potion
      return 1;
    default:
      return 0;
  }
}

/** CHR top tile for a cave ware — shared with room / demo item drawing. */
export function caveItemChrTile(itemId) {
  return chrTileForItemId(itemId & 0x3f);
}
