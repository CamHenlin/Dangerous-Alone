import { Container, Graphics, Sprite } from 'pixi.js';
import {
  BOARD_SIZE,
  CHAR_W,
  END_SLOT,
  LINK_X,
  NAME_ROW_YS,
  NAME_X0,
  QUEST2_SWORD_DX,
  QUEST2_SWORD_DY,
  SLOT_COUNT,
  SLOT_CURSOR_YS,
  boardCell,
  createNameEntry,
  cursorVisible,
  pressA,
  pressB,
  pressSelect,
  pressStart,
  stepDirections,
} from '@shared/nameEntry.js';
import { heartTileTexture, nesText } from './nesFont.js';

/**
 * Screen furniture, from the mode `$E` nametable writes:
 *   `ModeFTitleTransferBuf` @ `Z_02.asm:1396` → VRAM $2064 = row 3, col 4,
 *   patched to "REGISTER YOUR NAME" by `@OverwriteTitle` @ `Z_02.asm:1488`.
 *   `ModeFSaveSlotTemplateTransferBuf` @ `Z_02.asm:1411` → the bottom option at
 *   VRAM $21EA = row 15, col 10, patched to "REGISTER    END".
 */
const TITLE = Object.freeze({ x: 0x20, y: 0x18, text: 'REGISTER YOUR NAME' });
const END_ROW = Object.freeze({ x: 0x50, y: 0x78, text: 'REGISTER    END' });
/** Tile `$6A` is a solid 2px rule; 4 tiles lead the title and 3 trail it. */
const RULE = Object.freeze({ dy: 3, h: 2, lead: 4, trail: 3 });
/** `ModeEandFCursorSprites` @ `Z_02.asm:1439` byte 3 — the slot cursor X. */
const SLOT_CURSOR_X = 0x43;
/** Not in the ROM: our keyboard/pad mapping needs saying out loud. */
const HINT = Object.freeze({ x: 0x18, y: 0xc8, text: 'SELECT ROW  A TYPE  B SKIP' });

const COL = Object.freeze({
  text: 0xfcfcfc,
  rule: 0xfcfcfc,
  hint: 0x6b7280,
  cursor: 0xd82800,
});

/**
 * NES "REGISTER YOUR NAME" screen (game mode `$E`) — `UpdateModeERegister` @
 * `Z_02.asm:1615`.
 *
 * @param {{
 *   commonBg?: import('pixi.js').Texture | null,
 *   misc?: import('pixi.js').Texture | null,
 *   items?: ReturnType<import('./itemSprites.js').createItemSprites> | null,
 *   linkTexture?: (() => import('pixi.js').Texture | null) | null,
 *   playSfx?: ((name: string) => void) | null,
 * }} [deps]
 */
export function createNameEntryUi(deps = {}) {
  const bgImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const miscImg = deps.misc
    ? /** @type {CanvasImageSource} */ (deps.misc.source.resource)
    : null;
  const items = deps.items ?? null;
  const linkTexture = deps.linkTexture ?? null;
  const playSfx = deps.playSfx ?? null;

  const root = new Container();
  root.visible = false;

  const bg = new Graphics();
  bg.rect(0, 0, 256, 240);
  bg.fill(0x000000);
  root.addChild(bg);

  const statics = new Container();
  root.addChild(statics);

  const rows = new Container();
  root.addChild(rows);

  const cursors = new Container();
  root.addChild(cursors);

  /** @type {ReturnType<typeof createNameEntry> | null} */
  let state = null;
  /** @type {{ quest: number }[]} */
  let slotMeta = [];
  let frame = 0;
  /** @type {((names: { slot: number, name: string }[]) => void) | null} */
  let onCommit = null;

  /**
   * @param {Container} layer
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} [rgb]
   */
  function label(layer, text, x, y, rgb = COL.text) {
    if (!bgImg) return;
    layer.addChild(nesText(bgImg, text, x, y, rgb));
  }

  function paintStatics() {
    statics.removeChildren().forEach((c) => c.destroy({ children: true }));
    const rules = new Graphics();
    rules.rect(TITLE.x, TITLE.y + RULE.dy, RULE.lead * CHAR_W, RULE.h);
    rules.rect(
      TITLE.x + (RULE.lead + TITLE.text.length) * CHAR_W,
      TITLE.y + RULE.dy,
      RULE.trail * CHAR_W,
      RULE.h,
    );
    rules.fill(COL.rule);
    statics.addChild(rules);
    label(statics, TITLE.text, TITLE.x + RULE.lead * CHAR_W, TITLE.y);
    label(statics, END_ROW.text, END_ROW.x, END_ROW.y);
    label(statics, HINT.text, HINT.x, HINT.y, COL.hint);
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const cell = boardCell(i);
      label(statics, cell.char, cell.x, cell.glyphY);
    }
  }

  /**
   * `Mode1_WriteLinkSprites` @ `Z_02.asm:2849` draws a Link per row and, when
   * that file is on the second quest, a sword beside him (`Z_02.asm:2887`).
   * This marker is the ROM's *only* quest indicator — the in-game status bar
   * has none.
   * @param {number} slotIndex
   */
  function paintRowSprites(slotIndex) {
    const y = NAME_ROW_YS[slotIndex];
    const tex = linkTexture?.() ?? null;
    if (tex) {
      const spr = new Sprite(tex);
      spr.x = LINK_X;
      spr.y = y;
      rows.addChild(spr);
    }
    if (items && slotMeta[slotIndex]?.quest === 2) {
      const { texture, narrow } = items.itemTexture(0x20, 3);
      const sword = new Sprite(texture);
      sword.x = LINK_X + QUEST2_SWORD_DX + (narrow ? 4 : 0);
      sword.y = y + QUEST2_SWORD_DY;
      rows.addChild(sword);
    }
  }

  function paintRows() {
    rows.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!state) return;
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      paintRowSprites(i);
      label(rows, state.names[i].join(''), NAME_X0, NAME_ROW_YS[i]);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  function cursorBox(x, y) {
    const g = new Graphics();
    g.rect(x, y, CHAR_W, 8);
    g.fill({ color: COL.cursor, alpha: 0.55 });
    cursors.addChild(g);
  }

  function paintCursors() {
    cursors.removeChildren().forEach((c) => c.destroy());
    if (!state) return;

    const heartTex = bgImg ? heartTileTexture(bgImg, miscImg, 0xf2, 'full') : null;
    if (heartTex) {
      const heart = new Sprite(heartTex);
      heart.x = SLOT_CURSOR_X;
      heart.y = SLOT_CURSOR_YS[state.slot] + 1;
      cursors.addChild(heart);
    }

    // Both blinking cursors hide over the END row (`Z_02.asm:2123`, `2141`).
    if (state.slot === END_SLOT || !cursorVisible(frame)) return;
    cursorBox(NAME_X0 + state.nameIndex * CHAR_W, NAME_ROW_YS[state.slot]);
    const cell = boardCell(state.boardIndex);
    cursorBox(cell.x, cell.glyphY);
  }

  /**
   * @param {{
   *   slots?: Array<{ name?: string, quest?: number } | null>,
   *   skipActive?: boolean,
   *   initialSlot?: number,
   * }} [opts]
   */
  function open(opts = {}) {
    const list = opts.slots ?? [];
    slotMeta = [0, 1, 2].map((i) => ({ quest: list[i]?.quest ?? 1 }));
    state = createNameEntry({
      slotNames: [0, 1, 2].map((i) => list[i]?.name ?? ''),
      slotActive: [0, 1, 2].map((i) => Boolean(list[i])),
      skipActive: opts.skipActive ?? true,
    });
    if (opts.initialSlot != null) {
      state.slot = Math.max(0, Math.min(END_SLOT, opts.initialSlot));
    }
    frame = 0;
    root.visible = true;
    paintStatics();
    paintRows();
    paintCursors();
  }

  function close() {
    root.visible = false;
    state = null;
  }

  /**
   * @param {{
   *   mask: () => number,
   *   pressedA: () => boolean,
   *   pressedB: () => boolean,
   *   pressedStart: () => boolean,
   *   pressedSelect: () => boolean,
   * }} input
   */
  function tick(input) {
    if (!root.visible || !state) return;
    frame += 1;

    let dirty = false;
    // Direction / Select → Tune1 `$01` ("selection changed", same as rupee).
    // A-button glyph press reuses bomb_set (Z_02.asm:2013).
    if (stepDirections(state, input.mask())) {
      playSfx?.('rupee');
    }
    if (input.pressedSelect()) {
      pressSelect(state);
      playSfx?.('rupee');
    }
    if (input.pressedA()) {
      // `@CheckAB` @ `Z_02.asm:2013` reuses the bomb-set cue for the keypress.
      if (pressA(state) != null) playSfx?.('bomb_set');
      dirty = true;
    }
    if (input.pressedB()) {
      pressB(state);
    }
    if (input.pressedStart()) {
      const committed = pressStart(state);
      if (committed) {
        close();
        onCommit?.(committed);
        return;
      }
    }
    if (dirty) paintRows();
    paintCursors();
  }

  return {
    root,
    get visible() {
      return root.visible;
    },
    open,
    close,
    tick,
    /**
     * Fires when Start is pressed over END; the list may be empty if nothing
     * was typed, which the caller should treat as "back out".
     * @param {(names: { slot: number, name: string }[]) => void} fn
     */
    onCommit(fn) {
      onCommit = fn;
    },
  };
}
