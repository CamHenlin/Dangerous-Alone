/**
 * NES submenu geometry (DrawSubmenuItems + Submenu*TransferBuf).
 *
 * Sprite X/Y are absolute screen coordinates when the submenu is fully open
 * (inventory at top of CRT, status bar docked at the bottom). Our client
 * matches that docking, so submenuY() is identity with NES sprite Y.
 */

/** Status bar height — used when the bar is docked at the top during play. */
export const PANEL_TOP = 0x40;

/** NES sprite Y — passive equipment row. */
export const NES_PASSIVE_Y = 0x1e;
/** NES sprite Y — selectable row 0 + breakout item. */
export const NES_B_ROW0_Y = 0x36;
/** NES sprite Y — selectable row 1. */
export const NES_B_ROW1_Y = 0x46;
/** Breakout item X (UpdateSubmenuSelection). */
export const NES_BREAKOUT_X = 0x40;

/**
 * UW submenu map / compass sprites (`DrawSubmenuItems`).
 * Both use X=`$2C`; map Y=`$76`, compass Y=`$9E`.
 */
export const NES_UW_MAP_ITEM_X = 0x2c;
export const NES_UW_MAP_ITEM_Y = 0x76;
export const NES_UW_COMPASS_ITEM_Y = 0x9e;

/**
 * Sheet map — SubmenuMapRemainderTransferBuf map row at NT `$2A8C`
 * (col 12 → X=`$60`). One 8×8 BG tile per room (16×8).
 *
 * NES draws the sheet into NT2 while scrolling; with the status bar docked
 * at Y=`$B0` (176), an 8-row sheet cannot start at the map-icon Y (`$76`)
 * without clipping. Anchor the sheet so its bottom sits just above the bar
 * and the map/compass sprites still overlay its left edge.
 */
export const NES_UW_SHEET_MAP_X = 0x60;
export const NES_UW_SHEET_MAP_CELL = 8;
/** Submenu mask height (status bar docks at this Y while open). */
export const SUBMENU_MASK_H = 176;

/** "LEVEL-n" sits one tile above the sheet map. */
export const NES_UW_LEVEL_TEXT_X = 0x60;

/**
 * Map NES submenu sprite Y → panel Y (identity when HUD docks bottom).
 * @param {number} nesY
 */
export function submenuY(nesY) {
  return nesY & 0xff;
}

/**
 * Pixel layout for the UW submenu sheet map + dungeon items.
 * Map/compass use ROM sprite Y; sheet is sized to fit under the mask.
 */
export function submenuDungeonMapLayout() {
  const cell = NES_UW_SHEET_MAP_CELL;
  const sheetH = 8 * cell;
  // 2px frame padding on each side (matches drawDungeonMinimap).
  const sheetY = SUBMENU_MASK_H - sheetH - 4;
  return {
    levelText: { x: NES_UW_LEVEL_TEXT_X, y: sheetY - 0x0e },
    mapIcon: { x: NES_UW_MAP_ITEM_X, y: submenuY(NES_UW_MAP_ITEM_Y) },
    compassIcon: { x: NES_UW_MAP_ITEM_X, y: submenuY(NES_UW_COMPASS_ITEM_Y) },
    sheet: {
      x: NES_UW_SHEET_MAP_X,
      y: sheetY,
      cellW: cell,
      cellH: cell,
    },
  };
}

/**
 * Selected-item box — SubmenuBoxesTops / SelectedItemBoxBottom.
 * NT cols 7–10 (4×4 tiles), CHR $69/$6A/$6B/$6C/$6E/$6D.
 */
export const BOX_SELECT = Object.freeze({
  x: 0x38,
  w: 0x20,
  h: 0x20,
  /** @returns {number} */
  y() {
    return submenuY(NES_B_ROW0_Y) - 8;
  },
});

/**
 * Inventory box — SubmenuBoxesTops / InventoryBoxBottomTransferBuf.
 * NT cols 15–27 (13×6 tiles). Passive gear sits above this box.
 */
export const BOX_INVENTORY = Object.freeze({
  x: 0x78,
  w: 0x68,
  h: 0x30,
  /** @returns {number} */
  y() {
    return submenuY(NES_B_ROW0_Y) - 8;
  },
});

/** Box border CHR (common_background). */
export const BOX_CHR = Object.freeze({
  TL: 0x69,
  TOP: 0x6a,
  TR: 0x6b,
  SIDE: 0x6c,
  BR: 0x6d,
  BL: 0x6e,
});

/**
 * Pixel layout derived from BOX_* + USE B / FOR THIS NT rows.
 */
export function submenuBoxLayout() {
  const select = {
    x: BOX_SELECT.x,
    y: BOX_SELECT.y(),
    w: BOX_SELECT.w,
    h: BOX_SELECT.h,
  };
  const inventory = {
    x: BOX_INVENTORY.x,
    y: BOX_INVENTORY.y(),
    w: BOX_INVENTORY.w,
    h: BOX_INVENTORY.h,
  };
  return {
    inventory,
    select,
    useBText: { x: 0x10, y: select.y + select.h },
    forThisText: { x: 0x20, y: inventory.y + inventory.h - 8 },
    // INVENTORY @ NT $2984 — near top when menu is open (screen ~$10).
    inventoryTitle: { x: 0x20, y: 0x10 },
    // Apex @ NT row 22; inv bottom @ row 19 → +24px on-screen ≈ inv.y+h+24.
    triforceTop: inventory.y + inventory.h + 24,
  };
}

/**
 * Empty triforce nametable rows (tiles only), from SubmenuTriforce* /
 * TriforceRow*TransferBuf. col is NT column of the first tile.
 *
 * Tiles are PPU BG indices; source art lives in overworld_bg at (tile−$70).
 */
export const TRIFORCE_ROWS = Object.freeze([
  { col: 15, tiles: [0xed, 0xee] },
  { col: 14, tiles: [0xed, 0xe9, 0xea, 0xee] },
  { col: 13, tiles: [0xed, 0xe9, 0x24, 0x24, 0xea, 0xee] },
  { col: 12, tiles: [0xed, 0xe9, 0x24, 0x24, 0x24, 0x24, 0xea, 0xee] },
  { col: 11, tiles: [0xed, 0xe9, 0x24, 0x24, 0x24, 0x24, 0x24, 0x24, 0xea, 0xee] },
  {
    col: 10,
    tiles: [0xeb, 0xef, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf0, 0xec],
  },
]);

/** @typedef {{ row: number, index: number, tile: number }} TriforcePatch */

/**
 * Piece → patches (UpdateMenuStartOW). Each owned bit writes 3 tiles.
 * `row` indexes TRIFORCE_ROWS (0=apex … 5=bottom).
 */
export const TRIFORCE_PIECE_PATCHES = Object.freeze([
  [
    { row: 1, index: 1, tile: 0xe7 },
    { row: 2, index: 1, tile: 0xe7 },
    { row: 2, index: 2, tile: 0xf5 },
  ],
  [
    { row: 1, index: 2, tile: 0xe8 },
    { row: 2, index: 3, tile: 0xf5 },
    { row: 2, index: 4, tile: 0xe8 },
  ],
  [
    { row: 3, index: 1, tile: 0xe7 },
    { row: 4, index: 1, tile: 0xe7 },
    { row: 4, index: 2, tile: 0xf5 },
  ],
  [
    { row: 3, index: 6, tile: 0xe8 },
    { row: 4, index: 7, tile: 0xf5 },
    { row: 4, index: 8, tile: 0xe8 },
  ],
  [
    { row: 3, index: 2, tile: 0xe5 },
    { row: 3, index: 3, tile: 0xf5 },
    { row: 4, index: 4, tile: 0xe5 },
  ],
  [
    { row: 3, index: 2, tile: 0xe8 },
    { row: 4, index: 3, tile: 0xf5 },
    { row: 4, index: 4, tile: 0xe8 },
  ],
  [
    { row: 3, index: 4, tile: 0xf5 },
    { row: 3, index: 5, tile: 0xe6 },
    { row: 4, index: 5, tile: 0xe6 },
  ],
  [
    { row: 3, index: 5, tile: 0xe7 },
    { row: 4, index: 5, tile: 0xe7 },
    { row: 4, index: 6, tile: 0xf5 },
  ],
]);

/**
 * Compact 2×4 shard grid for the UW submenu. Sits in the empty column left of
 * the sheet map / map-compass sprites so collected pieces stay visible even
 * when the big overworld triangle is swapped out for LEVEL-n.
 *
 * Bit0 (L1) is top-left, then right, then down — so L2 without L1 still lights
 * a slot instead of looking like an empty bag.
 */
export function submenuTriforceGridLayout() {
  const cell = 12;
  return {
    x: 8,
    y: 110,
    cell,
    cols: 2,
    rows: 4,
  };
}

/**
 * @param {number} mask InvTriforce
 * @returns {boolean[]} length 8, index 0 = Level 1
 */
export function ownedTriforceBits(mask) {
  const n = mask | 0;
  return Array.from({ length: 8 }, (_, i) => Boolean((n >> i) & 1));
}

/**
 * @param {number} mask InvTriforce
 * @returns {{ col: number, tiles: number[] }[]}
 */
export function buildOwnedTriforceRows(mask) {
  const rows = TRIFORCE_ROWS.map((r) => ({
    col: r.col,
    tiles: r.tiles.slice(),
  }));
  for (let bit = 0; bit < 8; bit += 1) {
    if (((mask >> bit) & 1) === 0) continue;
    for (const patch of TRIFORCE_PIECE_PATCHES[bit]) {
      const cell = rows[patch.row]?.tiles;
      if (!cell || patch.index >= cell.length) continue;
      const cur = cell[patch.index];
      if (cur === 0xe5 || cur === 0xe6) cell[patch.index] = 0xf5;
      else cell[patch.index] = patch.tile;
    }
  }
  return rows;
}

/** Outline vs fill triforce PPU tiles (for palette remapping). */
export function triforceTileRole(tile) {
  if (tile === 0x24) return 'blank';
  if (tile === 0xf5 || tile === 0xe5 || tile === 0xe6 || tile === 0xe7 || tile === 0xe8) {
    return 'fill';
  }
  return 'outline';
}
