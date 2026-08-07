/**
 * NES DrawItemBySlot / AnimateItemObject sprite palette selection.
 * Palettes: 0=green(SP0), 1=blue(SP1), 2=red(SP2), 3=…
 */

/** ItemIdToSlot (Z_01.asm) — item ID → inventory slot. */
const ITEM_ID_TO_SLOT = Object.freeze([
  0x01, 0x00, 0x00, 0x00, 0x06, 0x05, 0x04, 0x04, // $00–$07
  0x02, 0x02, 0x03, 0x0d, 0x09, 0x0c, 0x1b, 0x1c, // $08–$0F
  0x08, 0x0a, 0x0b, 0x0b, 0x0e, 0x0f, 0x10, 0x11, // $10–$17
  0x16, 0x17, 0x18, 0x1a, 0x1f, 0x1d, 0x1e, 0x07, // $18–$1F
  0x07, 0x15, 0x19, 0x14, // $20–$23
]);

/** ItemIdToDescriptor — low nibble is item value / base palette attr. */
const ITEM_ID_TO_DESCRIPTOR = Object.freeze([
  0x14, 0x21, 0x22, 0x23, 0x01, 0x01, 0x21, 0x22,
  0x21, 0x22, 0x01, 0x01, 0x01, 0x01, 0x01, 0x15,
  0x01, 0x01, 0x21, 0x22, 0x01, 0x01, 0x01, 0x01,
  0x11, 0x11, 0x10, 0x01, 0x01, 0x01, 0x01, 0x11,
  0x22, 0x01, 0x10, 0x12,
]);

/**
 * ItemSlotToPaletteOffsetsOrValues — absolute palette, or offset for class-2 items.
 */
const SLOT_PALETTE = Object.freeze([
  0xff, 0x01, 0xff, 0x00, 0x00, 0x02, 0x02, 0x00, // $00–$07
  0x01, 0x00, 0x02, 0x00, 0x00, 0x02, 0x02, 0x01, // $08–$0F
  0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, // $10–$17
  0x02, 0x02, 0x02, 0x02, 0x01, 0x00, 0x01, 0x00, // $18–$1F
]);

/** Slots that flash SP1↔SP2 from FrameCounter bit 3. */
const FLASH_SLOTS = Object.freeze(new Set([0x16, 0x19, 0x1a, 0x1b]));

/** Slots that add item value to a palette offset (class 2 / grades). */
const VARIES_SLOTS = Object.freeze(new Set([0x00, 0x02, 0x04, 0x07, 0x0b]));

/**
 * NES flash attribute: ((FrameCounter & $08) >> 3) + 1 → palette 1 or 2.
 * @param {number} frameCounter
 */
export function itemFlashPalette(frameCounter) {
  return ((frameCounter & 0x08) >> 3) + 1;
}

/**
 * Sprite palette row (0–3) for drawing an item by ID (AnimateItemObject path).
 * @param {number} itemId
 * @param {number} [frameCounter] used for flashing slots (rupee/heart/…)
 * @returns {number}
 */
export function itemDrawPalette(itemId, frameCounter = 0) {
  const id = itemId & 0xff;
  if (id >= ITEM_ID_TO_SLOT.length) return 0;

  const slot = ITEM_ID_TO_SLOT[id];
  if (FLASH_SLOTS.has(slot)) {
    return itemFlashPalette(frameCounter);
  }

  const table = SLOT_PALETTE[slot] ?? 0;
  const desc = ITEM_ID_TO_DESCRIPTOR[id] ?? 0;
  const value = desc === 0x30 ? 0xff : desc & 0x0f;

  if (VARIES_SLOTS.has(slot)) {
    // Palette offset ($FF = −1 for swords) + item value.
    let pal = (table + value) & 0xff;
    if (slot === 0x00 && pal === 0x02) {
      // Master sword uses special slot $20 image; palette stays 2.
      pal = 2;
    }
    return pal & 3;
  }

  return table & 3;
}
