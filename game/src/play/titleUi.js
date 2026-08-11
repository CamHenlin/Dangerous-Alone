import { Container, Graphics, Sprite } from 'pixi.js';
import { SLOT_COUNT } from '@shared/save.js';
import { CHAR_W, QUEST2_SWORD_DX, QUEST2_SWORD_DY } from '@shared/nameEntry.js';
import { heartTileTexture, nesText } from './nesFont.js';

/**
 * Mode `$01` file-select layout (`Mode1TileTransferBuf` / `Mode1CursorSpriteYs`
 * @ `Z_02.asm`). REGISTER / ELIMINATION are keyboard shortcuts here rather than
 * extra cursor rows, so the three file rows keep the ROM spacing.
 */
const TITLE = Object.freeze({ x: 0x40, y: 0x28, text: '- S E L E C T -' });
const COL_NAME = Object.freeze({ x: 0x48, y: 0x40, text: 'NAME' });
const COL_LIFE = Object.freeze({ x: 0x98, y: 0x40, text: 'LIFE' });
/** Link sprite base Y / pitch (`UpdateMode1Menu_Sub0` @ `Z_02.asm:2785`). */
const LINK_X = 0x30;
const LINK_Y0 = 0x58;
const LINK_PITCH = 0x18;
/** Heart cursor X / Y (`Mode1CursorSpriteTriplet` / `Mode1CursorSpriteYs`). */
const CURSOR_X = 0x28;
const SLOT_YS = Object.freeze([0x5c, 0x74, 0x8c]);
/** Name / life column Y aligned with the cursor heart. */
const NAME_YS = Object.freeze([0x5c, 0x74, 0x8c]);
/** Mode1 name column starts at NT col 9 (`Mode1SlotLineTransferBuf`). */
const NAME_X = 0x48;
const LIFE_X = 0x98;
const DEATH_X = 0x48;
const DEATH_DY = 0x10;
const HINT_Y0 = 0xb8;

const COL = Object.freeze({
  text: 0xfcfcfc,
  title: 0xfcfcfc,
  muted: 0x7c7c7c,
  accent: 0xe8d040,
});

/**
 * Title + 3-slot file select (NES register / continue / eliminate).
 * @param {{
 *   nameEntry?: ReturnType<import('./nameEntryUi.js').createNameEntryUi> | null,
 *   commonBg?: import('pixi.js').Texture | null,
 *   misc?: import('pixi.js').Texture | null,
 *   items?: ReturnType<import('./itemSprites.js').createItemSprites> | null,
 *   linkTexture?: (() => import('pixi.js').Texture | null) | null,
 * }} [deps]
 */
export function createTitleUi(deps = {}) {
  const nameEntry = deps.nameEntry ?? null;
  const bgImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const miscImg = deps.misc
    ? /** @type {CanvasImageSource} */ (deps.misc.source.resource)
    : null;
  const items = deps.items ?? null;
  const linkTexture = deps.linkTexture ?? null;

  const root = new Container();
  root.visible = true;

  const bg = new Graphics();
  bg.rect(0, 0, 256, 240);
  bg.fill(0x000000);
  root.addChild(bg);

  const layer = new Container();
  root.addChild(layer);

  /** @type {'select' | 'name' | 'eraseConfirm' | 'overwriteConfirm'} */
  let phase = 'select';
  /** @type {'register' | 'rename'} */
  let nameMode = 'register';
  /** Overwrite confirmed — next name commit must wipe the slot. */
  let pendingOverwrite = false;
  let cursor = 0;
  /** @type {Array<object | null>} */
  let slots = [null, null, null];
  let nameBuf = 'LINK';
  /** @type {((ev: { action: string, slot: number, name?: string }) => void) | null} */
  let onAction = null;

  let prevUp = false;
  let prevDown = false;
  let prevEnter = false;
  let prevE = false;
  let prevN = false;
  let prevR = false;
  let prevO = false;
  let prevEsc = false;

  /**
   * @param {Container} parent
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} [rgb]
   */
  function label(parent, text, x, y, rgb = COL.text) {
    if (!bgImg) return;
    parent.addChild(nesText(bgImg, text, x, y, rgb));
  }

  /**
   * @param {Container} parent
   * @param {number} x
   * @param {number} y
   * @param {'full' | 'half' | 'empty'} kind
   */
  function placeHeart(parent, x, y, kind = 'full') {
    if (!bgImg) return;
    const tile = kind === 'full' ? 0xf2 : kind === 'half' ? 0x65 : 0x66;
    const tex = heartTileTexture(bgImg, miscImg, tile, kind);
    if (!tex) return;
    const spr = new Sprite(tex);
    spr.x = x;
    spr.y = y;
    parent.addChild(spr);
  }

  /**
   * Hand off to the NES mode-$E register screen when one is wired up; the
   * keyboard prompt stays as the fallback.
   * @param {'register' | 'rename'} mode
   * @param {{ overwrite?: boolean }} [opts]
   */
  function beginNameEntry(mode, opts = {}) {
    const overwrite = Boolean(opts.overwrite);
    nameMode = mode;
    pendingOverwrite = overwrite;
    if (nameEntry) {
      // Present the overwrite target as empty so mode E can write it, and keep
      // skipActive off so the cursor stays on that slot (not the first hole).
      const openSlots = overwrite
        ? slots.map((s, i) => (i === cursor ? null : s))
        : slots;
      nameEntry.open({
        slots: openSlots,
        initialSlot: cursor,
        skipActive: mode === 'register' && !overwrite,
      });
      // Name entry is a sibling on the stage; hide this opaque layer so it is
      // not covering the register grid (looks like a freeze otherwise).
      root.visible = false;
      return;
    }
    phase = 'name';
    nameBuf = mode === 'rename' ? (slots[cursor]?.name ?? 'LINK') : 'LINK';
    render();
  }

  function returnFromNameEntry() {
    pendingOverwrite = false;
    phase = 'select';
    root.visible = true;
    render();
  }

  nameEntry?.onCommit((entries) => {
    const overwriteSlot = pendingOverwrite ? cursor : -1;
    pendingOverwrite = false;
    root.visible = true;
    phase = 'select';

    if (!entries.length) {
      render();
      return;
    }

    let registered = false;
    for (const { slot, name } of entries) {
      if (slot === overwriteSlot) {
        onAction?.({ action: 'new', slot, name });
        registered = true;
        continue;
      }
      if (slots[slot]) {
        if (slots[slot].name !== name) onAction?.({ action: 'rename', slot, name });
      } else if (!registered) {
        registered = true;
        onAction?.({ action: 'new', slot, name });
      }
    }
    render();
  });

  function paintSelect() {
    label(layer, TITLE.text, TITLE.x, TITLE.y, COL.title);
    label(layer, COL_NAME.text, COL_NAME.x, COL_NAME.y, COL.muted);
    label(layer, COL_LIFE.text, COL_LIFE.x, COL_LIFE.y, COL.muted);

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const y = NAME_YS[i];
      const s = slots[i];
      if (i === cursor) {
        placeHeart(layer, CURSOR_X, SLOT_YS[i] + 1, 'full');
      }

      const tex = linkTexture?.() ?? null;
      if (tex && s) {
        const spr = new Sprite(tex);
        spr.x = LINK_X;
        spr.y = LINK_Y0 + i * LINK_PITCH;
        layer.addChild(spr);
        if (items && s.quest === 2) {
          const { texture, narrow } = items.itemTexture(0x20, 3);
          const sword = new Sprite(texture);
          sword.x = LINK_X + QUEST2_SWORD_DX + (narrow ? 4 : 0);
          sword.y = LINK_Y0 + i * LINK_PITCH + QUEST2_SWORD_DY;
          layer.addChild(sword);
        }
      }

      if (!s) {
        label(layer, '-EMPTY-', NAME_X, y, COL.muted);
        continue;
      }

      label(layer, String(s.name).padEnd(8).slice(0, 8), NAME_X, y);
      // Compact LIFE column: one heart icon + "N-M" (slash is not in the CHR).
      placeHeart(layer, LIFE_X, y, 'full');
      const life = `${s.hearts}-${s.maxHearts}`;
      label(layer, life, LIFE_X + CHAR_W + 2, y);
      const meta = `TF${s.triforce}  X${s.deaths ?? 0}`;
      label(layer, meta, DEATH_X, y + DEATH_DY, COL.muted);
    }

    label(layer, 'ENTER CONTINUE-NEW', 0x28, HINT_Y0, COL.muted);
    label(layer, 'N RENAME  R REGISTER', 0x28, HINT_Y0 + 12, COL.muted);
    label(layer, 'E ERASE  O OPTIONS', 0x28, HINT_Y0 + 24, COL.muted);
  }

  function paintNameFallback() {
    label(
      layer,
      nameMode === 'rename' ? 'CHANGE NAME' : 'REGISTER YOUR NAME',
      0x28,
      0x40,
      COL.accent,
    );
    label(layer, `SLOT ${cursor + 1}`, 0x28, 0x60);
    label(layer, `${nameBuf}_`, 0x28, 0x78, COL.text);
    label(
      layer,
      nameMode === 'rename' ? 'ENTER ACCEPT  ESC CANCEL' : 'TYPE A-Z  ENTER ACCEPT',
      0x18,
      HINT_Y0,
      COL.muted,
    );
  }

  function paintConfirm(kind) {
    const s = slots[cursor];
    if (kind === 'erase') {
      label(layer, 'ELIMINATION MODE', 0x30, 0x40, COL.accent);
      label(layer, `ERASE ${s?.name ?? 'FILE'}?`, 0x40, 0x70);
    } else {
      label(layer, 'REGISTER MODE', 0x48, 0x40, COL.accent);
      label(layer, `OVERWRITE ${s?.name ?? 'FILE'}?`, 0x28, 0x68);
      label(layer, 'PROGRESS WILL BE LOST', 0x28, 0x78, COL.muted);
    }
    label(layer, 'ENTER YES  ESC NO', 0x38, HINT_Y0, COL.muted);
  }

  function render() {
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (phase === 'name') {
      paintNameFallback();
      return;
    }
    if (phase === 'eraseConfirm') {
      paintConfirm('erase');
      return;
    }
    if (phase === 'overwriteConfirm') {
      paintConfirm('overwrite');
      return;
    }
    paintSelect();
  }

  /**
   * @param {KeyboardEvent} e
   */
  function onKeyDown(e) {
    if (!root.visible) return;
    if (phase === 'name') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        const action = nameMode === 'rename' ? 'rename' : 'new';
        onAction?.({ action, slot: cursor, name: nameBuf || 'LINK' });
        phase = 'select';
        pendingOverwrite = false;
        render();
        return;
      }
      if (e.code === 'Escape' || (e.code === 'Backspace' && nameBuf.length === 0)) {
        e.preventDefault();
        phase = 'select';
        pendingOverwrite = false;
        render();
        return;
      }
      if (e.code === 'Backspace') {
        e.preventDefault();
        nameBuf = nameBuf.slice(0, -1);
        render();
        return;
      }
      if (/^Key[A-Z]$/.test(e.code) && nameBuf.length < 8) {
        e.preventDefault();
        nameBuf += e.code.slice(3);
        render();
      }
      return;
    }
    if (phase === 'eraseConfirm') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        onAction?.({ action: 'erase', slot: cursor });
        phase = 'select';
        render();
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        phase = 'select';
        render();
      }
      return;
    }
    if (phase === 'overwriteConfirm') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        phase = 'select';
        beginNameEntry('register', { overwrite: true });
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        phase = 'select';
        render();
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  render();

  return {
    root,
    /**
     * @param {Array<object | null>} next
     */
    setSlots(next) {
      slots = next;
      render();
    },
    /**
     * @param {(ev: { action: string, slot: number, name?: string }) => void} fn
     */
    onChoose(fn) {
      onAction = fn;
    },
    show() {
      nameEntry?.close();
      pendingOverwrite = false;
      root.visible = true;
      phase = 'select';
      render();
    },
    hide() {
      nameEntry?.close();
      pendingOverwrite = false;
      root.visible = false;
    },
    get visible() {
      // Name entry hides this root but still counts as the title flow.
      return root.visible || Boolean(nameEntry?.visible);
    },
    /**
     * Poll edge-triggered nav (call once per frame while visible).
     * @param {{ mask: () => number, heldCodes: () => Set<string> }} input
     * @param {number} DIR
     */
    tick(input, DIR) {
      // Mode $E owns the pad while the register screen is open — even when
      // this root is hidden so the grid can show through.
      if (nameEntry?.visible) {
        const codes = input.heldCodes();
        const esc = codes.has('Escape');
        if (esc && !prevEsc) {
          nameEntry.close();
          returnFromNameEntry();
        }
        prevEsc = esc;
        nameEntry.tick(input);
        return;
      }
      if (!root.visible) return;
      if (phase !== 'select') return;

      const mask = input.mask();
      const up = Boolean(mask & DIR.UP);
      const down = Boolean(mask & DIR.DOWN);
      if (up && !prevUp) {
        cursor = (cursor + SLOT_COUNT - 1) % SLOT_COUNT;
        render();
      }
      if (down && !prevDown) {
        cursor = (cursor + 1) % SLOT_COUNT;
        render();
      }
      prevUp = up;
      prevDown = down;

      const codes = input.heldCodes();
      const enter = codes.has('Enter') || codes.has('NumpadEnter');
      if (enter && !prevEnter) {
        if (slots[cursor]) {
          onAction?.({ action: 'continue', slot: cursor });
        } else {
          beginNameEntry('register');
        }
      }
      prevEnter = enter;

      const e = codes.has('KeyE');
      const n = codes.has('KeyN');
      const r = codes.has('KeyR');
      const o = codes.has('KeyO');
      if (e && !prevE && slots[cursor]) {
        phase = 'eraseConfirm';
        render();
      }
      if (n && !prevN) {
        beginNameEntry(slots[cursor] ? 'rename' : 'register');
      }
      if (r && !prevR) {
        if (slots[cursor]) {
          phase = 'overwriteConfirm';
          render();
        } else {
          beginNameEntry('register');
        }
      }
      if (o && !prevO) {
        onAction?.({ action: 'options', slot: cursor });
      }
      prevE = e;
      prevN = n;
      prevR = r;
      prevO = o;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
