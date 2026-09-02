/**
 * NES submenu / status-bar item icons (Anim_ItemFrameTiles + DrawSubmenuItems).
 */

import { B_ITEM, SWORD } from './inventory.js';
import {
  NES_B_ROW0_Y,
  NES_B_ROW1_Y,
  submenuY,
} from './submenuLayout.js';

export {
  BOX_CHR,
  BOX_INVENTORY,
  BOX_SELECT,
  NES_B_ROW0_Y,
  NES_B_ROW1_Y,
  NES_BREAKOUT_X,
  NES_PASSIVE_Y,
  PANEL_TOP,
  submenuY,
} from './submenuLayout.js';

/**
 * NES UpdateSwordOrRod / DrawItemInInventory slot 0:
 * sprite palette = swordTier - 1 (wood=0, white=1, magic=2).
 * @param {number} swordTier
 */
export function swordSpritePalette(swordTier) {
  const t = swordTier | 0;
  if (t <= SWORD.WOOD) return 0;
  if (t === SWORD.WHITE) return 1;
  return 2;
}

/** Status-bar A/B slots (absolute screen). */
export const STATUS_B_XY = Object.freeze({ x: 0x7c, y: 0x1f });
export const STATUS_A_XY = Object.freeze({ x: 0x94, y: 0x1f });

/**
 * Selectable B slots — X from NES SubmenuItemXs / SubmenuCursorXs.
 * Order matches `B_SLOT_ORDER` (left-to-right, top then bottom).
 * Arrow ($AC) + bow ($B4) share cursor X $B0.
 */
export const SUBMENU_B_SLOTS = Object.freeze([
  { id: B_ITEM.BOOMERANG, row: 0, x: 0x80, cursorX: 0x80 },
  { id: B_ITEM.BOMB, row: 0, x: 0x98, cursorX: 0x98 },
  { id: B_ITEM.BOW, row: 0, x: 0xac, bowX: 0xb4, cursorX: 0xb0 },
  { id: B_ITEM.CANDLE, row: 0, x: 0xc8, cursorX: 0xc8 },
  { id: B_ITEM.FLUTE, row: 1, x: 0x80, cursorX: 0x80 },
  { id: B_ITEM.BAIT, row: 1, x: 0x98, cursorX: 0x98 },
  { id: B_ITEM.POTION, row: 1, x: 0xb0, cursorX: 0xb0 },
  { id: B_ITEM.ROD, row: 1, x: 0xc8, cursorX: 0xc8 },
]);

/**
 * Passive equipment (NES SubmenuItemXs slots $09–$0E).
 * Tiles match Anim_ItemFrameTiles. Ladder $76 is drawn from the demo sprite bank.
 */
export const SUBMENU_PASSIVE = Object.freeze([
  { key: 'raft', tile: 0x6c, pal: 0, x: 0x80 },
  { key: 'book', tile: 0x42, pal: 1, x: 0x94 },
  { key: 'ring', tile: 0x46, pal: null, x: 0xa0 },
  { key: 'ladder', tile: 0x76, pal: 0, x: 0xb0 },
  { key: 'magicKey', tile: 0x2c, pal: 1, x: 0xc0 },
  { key: 'bracelet', tile: 0x4e, pal: 2, x: 0xcc },
]);

/**
 * @param {{ row: number, x: number, bowX?: number, cursorX?: number }} slot
 */
export function bSlotPos(slot) {
  const nesY = slot.row === 0 ? NES_B_ROW0_Y : NES_B_ROW1_Y;
  return {
    x: slot.x,
    y: submenuY(nesY),
    bowX: slot.bowX ?? null,
    cursorX: slot.cursorX ?? slot.x,
  };
}

/**
 * CHR + palette for a selectable B item given current inventory.
 * @param {object} inv
 * @param {string} id B_ITEM.*
 * @returns {{ tile: number, pal: number } | null}
 */
export function bItemIcon(inv, id) {
  switch (id) {
    case B_ITEM.BOOMERANG:
      if (inv.magicBoomerang) return { tile: 0x36, pal: 2 };
      if (inv.boomerang) return { tile: 0x36, pal: 0 };
      return null;
    case B_ITEM.BOMB:
      if (inv.bombs > 0 || inv.selectedB === B_ITEM.BOMB) return { tile: 0x34, pal: 1 };
      return null;
    case B_ITEM.BOW:
      // NES DrawItemBySlot: wood arrow SP0, silver SP1 (slot $02 + value).
      if (!(inv.bow && inv.arrow)) return null;
      return { tile: 0x28, pal: inv.arrow >= 2 ? 1 : 0 };
    case B_ITEM.CANDLE:
      if (!inv.candle) return null;
      return { tile: 0x26, pal: inv.candle >= 2 ? 2 : 1 };
    case B_ITEM.FLUTE:
      // Anim_ItemFrameTiles slot $05 → $24 (not $2C — that is the magic key).
      return inv.flute ? { tile: 0x24, pal: 1 } : null;
    case B_ITEM.BAIT:
      if (inv.food > 0 || inv.selectedB === B_ITEM.BAIT) return { tile: 0x22, pal: 2 };
      return null;
    case B_ITEM.POTION:
      if (inv.potion > 0) return { tile: 0x40, pal: inv.potion >= 2 ? 2 : 1 };
      // Slot $0F / SLOT_PALETTE $01 — white paper, not SP0 green.
      if (inv.letter) return { tile: 0x4c, pal: 1 };
      return null;
    case B_ITEM.ROD:
      return inv.rod ? { tile: 0x4a, pal: 1 } : null;
    default:
      return null;
  }
}

/**
 * @param {number} swordTier
 * @returns {{ tile: number, pal: number } | null}
 */
export function swordIcon(swordTier) {
  if (!swordTier || swordTier < SWORD.WOOD) return null;
  return {
    tile: swordTier >= SWORD.MAGIC ? 0x48 : 0x20,
    pal: swordSpritePalette(swordTier),
  };
}

/**
 * @param {object} inv
 * @returns {{ key: string, tile: number, pal: number, x: number }[]}
 */
export function passiveIcons(inv) {
  /** @type {{ key: string, tile: number, pal: number, x: number }[]} */
  const out = [];
  for (const slot of SUBMENU_PASSIVE) {
    if (slot.key === 'raft' && inv.raft) {
      out.push({ key: slot.key, tile: slot.tile, pal: slot.pal ?? 0, x: slot.x });
    } else if (slot.key === 'book' && inv.book) {
      out.push({ key: slot.key, tile: slot.tile, pal: slot.pal ?? 0, x: slot.x });
    } else if (slot.key === 'ring' && inv.ring) {
      out.push({
        key: slot.key,
        tile: slot.tile,
        pal: inv.ring >= 2 ? 2 : 1,
        x: slot.x,
      });
    } else if (slot.key === 'ladder' && inv.ladder) {
      out.push({ key: slot.key, tile: slot.tile, pal: slot.pal ?? 0, x: slot.x });
    } else if (slot.key === 'magicKey' && inv.magicKey) {
      out.push({ key: slot.key, tile: slot.tile, pal: slot.pal ?? 0, x: slot.x });
    } else if (slot.key === 'bracelet' && inv.bracelet) {
      out.push({ key: slot.key, tile: slot.tile, pal: slot.pal ?? 0, x: slot.x });
    }
  }
  return out;
}
