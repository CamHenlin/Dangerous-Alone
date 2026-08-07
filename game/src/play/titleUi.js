import { Container, Graphics, Text } from 'pixi.js';
import { SLOT_COUNT } from '@shared/save.js';

const FONT = 'IBM Plex Mono, ui-monospace, monospace';

/**
 * Title + 3-slot file select (NES register / continue / eliminate).
 * @param {{ nameEntry?: ReturnType<import('./nameEntryUi.js').createNameEntryUi> | null }} [deps]
 */
export function createTitleUi(deps = {}) {
  const nameEntry = deps.nameEntry ?? null;
  const root = new Container();
  root.visible = true;

  const bg = new Graphics();
  bg.rect(0, 0, 256, 240);
  bg.fill(0x000000);
  root.addChild(bg);

  const brand = new Text({
    text: 'THE LEGEND OF\nZELDA',
    style: {
      fontFamily: FONT,
      fontSize: 16,
      fill: 0xe8d040,
      align: 'center',
      lineHeight: 20,
    },
  });
  brand.x = 64;
  brand.y = 28;
  root.addChild(brand);

  const modeLabel = new Text({
    text: 'FILE SELECT',
    style: { fontFamily: FONT, fontSize: 10, fill: 0x6bcf7f },
  });
  modeLabel.x = 88;
  modeLabel.y = 78;
  root.addChild(modeLabel);

  const slotsText = new Text({
    text: '',
    style: {
      fontFamily: FONT,
      fontSize: 9,
      fill: 0xe8ecf4,
      lineHeight: 14,
    },
  });
  slotsText.x = 32;
  slotsText.y = 100;
  root.addChild(slotsText);

  const hint = new Text({
    text: '',
    style: {
      fontFamily: FONT,
      fontSize: 7,
      fill: 0x9aa3b5,
      align: 'center',
      lineHeight: 10,
    },
  });
  hint.x = 24;
  hint.y = 196;
  root.addChild(hint);

  const namePrompt = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 9, fill: 0xf0d060 },
  });
  namePrompt.x = 40;
  namePrompt.y = 178;
  root.addChild(namePrompt);

  /** @type {'select' | 'name' | 'eraseConfirm' | 'overwriteConfirm'} */
  let phase = 'select';
  /** @type {'register' | 'rename'} */
  let nameMode = 'register';
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

  /**
   * Hand off to the NES mode-$E register screen when one is wired up; the
   * HTML keyboard prompt stays as the fallback.
   * @param {'register' | 'rename'} mode
   */
  function beginNameEntry(mode) {
    if (nameEntry) {
      nameEntry.open({ slots, initialSlot: cursor, skipActive: mode === 'register' });
      return;
    }
    phase = 'name';
    nameMode = mode;
    nameBuf = mode === 'rename' ? (slots[cursor]?.name ?? 'LINK') : 'LINK';
    render();
  }

  nameEntry?.onCommit((entries) => {
    let registered = false;
    for (const { slot, name } of entries) {
      if (slots[slot]) {
        if (slots[slot].name !== name) onAction?.({ action: 'rename', slot, name });
      } else if (!registered) {
        registered = true;
        onAction?.({ action: 'new', slot, name });
      }
    }
    render();
  });

  function render() {
    if (phase === 'name') {
      modeLabel.text = nameMode === 'rename' ? 'CHANGE NAME' : 'REGISTER YOUR NAME';
      slotsText.text = `Slot ${cursor + 1}\n\n  ${nameBuf}_`;
      namePrompt.text =
        nameMode === 'rename'
          ? 'Rename only — progress kept · Enter accept · Esc cancel'
          : 'Type A–Z · Enter accept · Esc cancel';
      hint.text = '';
      return;
    }
    if (phase === 'eraseConfirm') {
      modeLabel.text = 'ELIMINATION MODE';
      const s = slots[cursor];
      slotsText.text = `Erase ${s?.name ?? 'FILE'} in slot ${cursor + 1}?\n\n  Enter = YES   Esc = NO`;
      namePrompt.text = '';
      hint.text = '';
      return;
    }
    if (phase === 'overwriteConfirm') {
      modeLabel.text = 'REGISTER MODE';
      const s = slots[cursor];
      slotsText.text =
        `Overwrite ${s?.name ?? 'FILE'} in slot ${cursor + 1}?\nThis deletes all progress.\n\n  Enter = YES   Esc = NO`;
      namePrompt.text = '';
      hint.text = '';
      return;
    }
    modeLabel.text = 'FILE SELECT';
    const lines = [];
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const mark = i === cursor ? '>' : ' ';
      const s = slots[i];
      if (!s) {
        lines.push(`${mark} ${i + 1}. — empty —`);
      } else {
        const q = s.quest === 2 ? 'Q2' : 'Q1';
        lines.push(
          `${mark} ${i + 1}. ${String(s.name).padEnd(8)}  ♥${s.hearts}/${s.maxHearts}  TF${s.triforce}  ${q}  ✝${s.deaths ?? 0}`,
        );
      }
    }
    slotsText.text = lines.join('\n');
    namePrompt.text = '';
    hint.text =
      '↑↓ select  Enter continue/new\nN rename  R register(overwrite)  E erase  O options';
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
        render();
        return;
      }
      if (e.code === 'Escape' || (e.code === 'Backspace' && nameBuf.length === 0)) {
        e.preventDefault();
        phase = 'select';
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
        beginNameEntry('register');
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
      root.visible = true;
      phase = 'select';
      render();
    },
    hide() {
      root.visible = false;
    },
    get visible() {
      return root.visible;
    },
    /**
     * Poll edge-triggered nav (call once per frame while visible).
     * @param {{ mask: () => number, heldCodes: () => Set<string> }} input
     * @param {number} DIR
     */
    tick(input, DIR) {
      if (!root.visible) return;
      // Mode $E owns the pad while the register screen is open.
      if (nameEntry?.visible) {
        nameEntry.tick(input);
        return;
      }
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
