/**
 * "REGISTER YOUR NAME" screen (game mode `$E`) — pure model.
 *
 * ROM: `UpdateModeERegister` @ `Z_02.asm:1615`, `ModeE_HandleDirections` @
 * `Z_02.asm:1798`, `ModeE_HandleAOrB` @ `Z_02.asm:1968`,
 * `UpdateModeEandF_Idle` @ `Z_02.asm:2179`.
 */

import { DIR } from './collision.js';

/** One name is 8 bytes (`SlotToNameOffset` @ `Z_02.asm:1449` strides by 8). */
export const NAME_LEN = 8;
export const SLOT_COUNT = 3;
/** `CurSaveSlot` `$03` is the "REGISTER    END" row, not a file. */
export const END_SLOT = 3;

/** `ModeE_CharMap` @ `Z_02.asm:1423` — BG tile per board cell. */
export const CHAR_MAP = Object.freeze([
  0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11,
  0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
  0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21,
  0x22, 0x23, 0x62, 0x63, 0x28, 0x29, 0x2a, 0x2b,
  0x2c, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x24,
]);

/** Right steps one column and rolls into the next row (`Z_02.asm:1847`). */
export const BOARD_COLS = 11;
export const BOARD_ROWS = 4;
export const BOARD_SIZE = BOARD_COLS * BOARD_ROWS;

/** Char-board cursor origin / pitch (`ModeEandF_SetUpCursorSprites` @ `Z_02.asm:2115`). */
export const BOARD_X0 = 0x30;
export const BOARD_CURSOR_Y0 = 0x87;
export const BOARD_STEP = 0x10;
/** The glyph row sits 7px above the cursor anchor (`ModifyFlashingCursorY` @ `Z_02.asm:2168`). */
export const BOARD_GLYPH_Y0 = BOARD_CURSOR_Y0 - 7;

/** Name fields are at VRAM `$20CE`/`$212E`/`$218E` = rows 6/9/12, column 14. */
export const NAME_X0 = 0x70;
export const NAME_ROW_YS = Object.freeze([0x30, 0x48, 0x60]);
export const CHAR_W = 8;

/** `ModeEandFSlotCursorYs` @ `Z_02.asm:1420` (sprite Y; glyph row is +1). */
export const SLOT_CURSOR_YS = Object.freeze([0x2f, 0x47, 0x5f, 0x77]);

/** Link is drawn at a fixed X for every row (`@Sub4` @ `Z_02.asm:1605`). */
export const LINK_X = 0x50;
/** Second-quest sword marker offsets from Link (`Z_02.asm:2890`). */
export const QUEST2_SWORD_DX = 0x0c;
export const QUEST2_SWORD_DY = -3;

/** `@ChooseRepeatDelay` @ `Z_02.asm:1830`. */
export const FIRST_REPEAT_DELAY = 0x10;
export const REPEAT_DELAY = 0x08;

/**
 * Board glyphs by BG tile. Letters/digits are positional; the punctuation
 * codes were read off `common_background.bin` rather than guessed.
 */
const TILE_CHAR = Object.freeze({
  0x24: ' ',
  0x28: ',',
  0x29: '!',
  0x2a: "'",
  0x2b: '&',
  0x2c: '.',
  0x62: '-',
  0x63: '.',
});

/**
 * @param {number} tile
 * @returns {string}
 */
export function charForTile(tile) {
  const t = tile & 0xff;
  if (TILE_CHAR[t] != null) return TILE_CHAR[t];
  if (t <= 0x09) return String(t);
  if (t >= 0x0a && t <= 0x23) return String.fromCharCode(65 + (t - 0x0a));
  return ' ';
}

/** Display characters for the 44 board cells, in `CHAR_MAP` order. */
export function boardChars() {
  return CHAR_MAP.map(charForTile);
}

/**
 * @param {number} index 0–43
 */
export function boardCell(index) {
  const i = ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const row = Math.floor(i / BOARD_COLS);
  const col = i % BOARD_COLS;
  return {
    index: i,
    row,
    col,
    x: BOARD_X0 + col * BOARD_STEP,
    cursorY: BOARD_CURSOR_Y0 + row * BOARD_STEP,
    glyphY: BOARD_GLYPH_Y0 + row * BOARD_STEP,
    char: charForTile(CHAR_MAP[i]),
  };
}

/**
 * The ROM drives the cursor coordinates and `CharBoardIndex` separately, then
 * patches the index whenever the cursor wraps off an edge (`Z_02.asm:1844`–
 * `1931`). The net effect on a full 11×4 board is plain modular arithmetic:
 * Right/Left roll through rows, Up/Down step ±11 and wrap ±44.
 * @param {number} index
 * @param {number} dir DIR bit
 */
export function moveBoard(index, dir) {
  const i = ((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  switch (dir) {
    case DIR.RIGHT:
      return (i + 1) % BOARD_SIZE;
    case DIR.LEFT:
      return (i + BOARD_SIZE - 1) % BOARD_SIZE;
    case DIR.DOWN:
      return (i + BOARD_COLS) % BOARD_SIZE;
    case DIR.UP:
      return (i + BOARD_SIZE - BOARD_COLS) % BOARD_SIZE;
    default:
      return i;
  }
}

/**
 * `@FindInactiveSlot` @ `Z_02.asm:1589` — mode E opens on the first free file,
 * or on the END row when all three are taken.
 * @param {boolean[]} slotActive
 */
export function firstInactiveSlot(slotActive) {
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    if (!slotActive[i]) return i;
  }
  return END_SLOT;
}

/**
 * @param {string} name
 * @returns {string[]} exactly NAME_LEN cells
 */
export function nameToCells(name) {
  const cells = String(name ?? '').toUpperCase().slice(0, NAME_LEN).split('');
  while (cells.length < NAME_LEN) cells.push(' ');
  return cells;
}

/**
 * A name of nothing but spaces leaves the file inactive (`@CopyName` @
 * `Z_02.asm:1655` only initializes file B on a non-`$24` character).
 * @param {string[]} cells
 */
export function nameFromCells(cells) {
  return cells.join('').replace(/\s+$/, '');
}

/**
 * @param {{ slotNames?: string[], slotActive?: boolean[], skipActive?: boolean }} [opts]
 */
export function createNameEntry(opts = {}) {
  const slotActive = [0, 1, 2].map((i) => Boolean(opts.slotActive?.[i]));
  const slotNames = [0, 1, 2].map((i) => nameToCells(opts.slotNames?.[i] ?? ''));
  const skipActive = opts.skipActive ?? true;
  return {
    names: slotNames,
    slotActive,
    skipActive,
    slot: skipActive ? firstInactiveSlot(slotActive) : 0,
    boardIndex: 0,
    nameIndex: 0,
    heldButton: 0,
    stillHolding: 0,
    subsequentRepeat: 0,
    repeatTimer: 0,
  };
}

/**
 * One frame of `ModeE_HandleDirections`. Only a single d-pad bit acts: the ROM
 * compares the whole low nibble, so diagonals fall through to `@Exit`.
 * @param {ReturnType<typeof createNameEntry>} state
 * @param {number} mask DIR bits held this frame
 * @returns {number} the DIR that moved the cursor, or 0
 */
export function stepDirections(state, mask) {
  const dirs = mask & 0x0f;
  if (!dirs) {
    state.stillHolding = 0;
    state.subsequentRepeat = 0;
    state.repeatTimer = 0;
    return 0;
  }
  if (!state.stillHolding) {
    state.heldButton = dirs;
    state.stillHolding = 1;
  }
  if (dirs !== state.heldButton) {
    state.stillHolding = 0;
    state.subsequentRepeat = 0;
    state.repeatTimer = 0;
  }
  if (state.repeatTimer > 0) {
    state.repeatTimer -= 1;
    return 0;
  }
  state.repeatTimer = state.subsequentRepeat ? REPEAT_DELAY : FIRST_REPEAT_DELAY;
  if (dirs !== DIR.RIGHT && dirs !== DIR.LEFT && dirs !== DIR.DOWN && dirs !== DIR.UP) {
    return 0;
  }
  state.boardIndex = moveBoard(state.boardIndex, dirs);
  state.subsequentRepeat = 1;
  return dirs;
}

/**
 * A and B both advance the name cursor; it wraps at the end of the 8-cell
 * field (`@MoveCursor` @ `Z_02.asm:2030`).
 * @param {ReturnType<typeof createNameEntry>} state
 */
function advanceNameCursor(state) {
  state.nameIndex = (state.nameIndex + 1) % NAME_LEN;
}

/**
 * @param {ReturnType<typeof createNameEntry>} state
 * @returns {string | null} the typed character
 */
export function pressA(state) {
  if (state.slot === END_SLOT) return null;
  const ch = charForTile(CHAR_MAP[state.boardIndex]);
  state.names[state.slot][state.nameIndex] = ch;
  advanceNameCursor(state);
  return ch;
}

/**
 * @param {ReturnType<typeof createNameEntry>} state
 */
export function pressB(state) {
  if (state.slot === END_SLOT) return false;
  advanceNameCursor(state);
  return true;
}

/**
 * Select cycles the row. Files that already exist are skipped, so mode E can
 * only ever write a free slot (`@ChangeSelection` @ `Z_02.asm:2184`).
 * @param {ReturnType<typeof createNameEntry>} state
 */
export function pressSelect(state) {
  let slot = state.slot;
  for (let i = 0; i <= SLOT_COUNT; i += 1) {
    slot = (slot + 1) % (SLOT_COUNT + 1);
    if (slot === END_SLOT) break;
    if (!state.skipActive || !state.slotActive[slot]) break;
  }
  state.slot = slot;
  state.nameIndex = 0;
  return slot;
}

/**
 * @param {ReturnType<typeof createNameEntry>} state
 * @returns {{ slot: number, name: string }[]}
 */
export function registeredNames(state) {
  /** @type {{ slot: number, name: string }[]} */
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const name = nameFromCells(state.names[i]);
    if (name) out.push({ slot: i, name });
  }
  return out;
}

/**
 * Start only commits from the END row (`@ChoseEnd` @ `Z_02.asm:1626`).
 * @param {ReturnType<typeof createNameEntry>} state
 * @returns {{ slot: number, name: string }[] | null}
 */
export function pressStart(state) {
  if (state.slot !== END_SLOT) return null;
  return registeredNames(state);
}

/**
 * `ModifyFlashingCursorY` @ `Z_02.asm:2168` hides the cursor sprite while
 * bit 3 of the frame counter is clear.
 * @param {number} frame
 */
export function cursorVisible(frame) {
  return (frame & 0x08) !== 0;
}
