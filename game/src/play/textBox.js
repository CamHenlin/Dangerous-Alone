import { Container, Graphics } from 'pixi.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import {
  BOX_COLS,
  BOX_ROWS,
  advanceTextBox,
  closeTextBox,
  createTextBox as createTextBoxState,
  isLastPage,
  openTextBox,
  pageFullyRevealed,
  stepTextBox,
  visibleText,
} from '@shared/textBoxModel.js';
import { nesMultilineText } from './nesFont.js';

const INTERNAL_W = 256;

/** Panel geometry, in NES pixels. */
const PANEL = Object.freeze({
  x: 8,
  y: HUD_HEIGHT + 6,
  w: INTERNAL_W - 16,
  padX: 8,
  padY: 9,
  lineHeight: 10,
  radius: 4,
});
const PANEL_H = PANEL.padY * 2 + BOX_ROWS * PANEL.lineHeight;

const COLORS = Object.freeze({
  fill: 0x000820,
  border: 0xd8d8f0,
  text: 0xfcfcfc,
  cue: 0xfcd870,
});

/** Alpha of the panel body — low enough to read the world through it. */
const FILL_ALPHA = 0.62;
/** Frames per blink of the "press to continue" cue. */
const CUE_BLINK = 24;
/** Blip the letter SFX every N revealed glyphs. */
const BLIP_EVERY = 4;

/**
 * Phase 19 dialogue box.
 *
 * A translucent panel across the top of the play field — the shape modern 2D
 * Zelda games use — with a typewriter crawl, page turns on the action button,
 * and a blinking cue that says whether the next press turns a page or closes
 * the box. Wrapping and paging live in `@shared/textBoxModel.js`.
 *
 * @param {{
 *   commonBg?: import('pixi.js').Texture | null,
 *   playSfx?: (name: string) => void,
 * }} [deps]
 */
export function createTextBox(deps = {}) {
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const playSfx = deps.playSfx ?? (() => {});

  const root = new Container();
  root.visible = false;

  const panel = new Graphics();
  panel.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL_H, PANEL.radius);
  panel.fill({ color: COLORS.fill, alpha: FILL_ALPHA });
  panel.stroke({ width: 1, color: COLORS.border, alpha: 0.55 });
  root.addChild(panel);

  const textLayer = new Container();
  textLayer.x = PANEL.x + PANEL.padX;
  textLayer.y = PANEL.y + PANEL.padY;
  root.addChild(textLayer);

  const cue = new Graphics();
  root.addChild(cue);

  const state = createTextBoxState();
  /** Text currently painted, so a frame with no new glyph repaints nothing. */
  let painted = null;
  let blipCount = 0;
  let cuePhase = 0;

  function clearText() {
    textLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
  }

  function paint() {
    const shown = visibleText(state);
    if (shown === painted) return;
    painted = shown;
    clearText();
    const { root: block } = nesMultilineText(fontImg, shown, COLORS.text, PANEL.lineHeight);
    textLayer.addChild(block);
  }

  /**
   * Down-chevron while more pages wait; a small square on the final page.
   * Both blink so the box never looks stuck mid-crawl.
   */
  function paintCue() {
    cue.clear();
    if (!state.active || !pageFullyRevealed(state)) return;
    cuePhase = (cuePhase + 1) % (CUE_BLINK * 2);
    if (cuePhase >= CUE_BLINK) return;
    const x = PANEL.x + PANEL.w - 12;
    const y = PANEL.y + PANEL_H - 8;
    if (isLastPage(state)) {
      cue.rect(x - 2, y - 3, 5, 5);
    } else {
      cue.moveTo(x - 4, y - 4);
      cue.lineTo(x + 4, y - 4);
      cue.lineTo(x, y + 2);
      cue.closePath();
    }
    cue.fill(COLORS.cue);
  }

  /**
   * @param {string | string[]} content
   * @param {{ kind?: string, meta?: object | null }} [opts]
   * @returns {boolean} false when there was nothing to say
   */
  function open(content, opts = {}) {
    const ok = openTextBox(state, content, {
      cols: BOX_COLS,
      rows: BOX_ROWS,
      kind: opts.kind,
      meta: opts.meta ?? null,
    });
    painted = null;
    blipCount = 0;
    cuePhase = 0;
    clearText();
    cue.clear();
    root.visible = ok;
    return ok;
  }

  function close() {
    closeTextBox(state);
    root.visible = false;
    painted = null;
    clearText();
    cue.clear();
  }

  /** One animation frame of crawl + cue blink. */
  function tick() {
    if (!state.active) return;
    const { revealedChars } = stepTextBox(state);
    if (revealedChars) {
      blipCount += revealedChars;
      if (blipCount >= BLIP_EVERY) {
        blipCount %= BLIP_EVERY;
        playSfx('text');
      }
      paint();
    }
    paintCue();
  }

  /**
   * Player pressed the action button.
   * @returns {ReturnType<typeof advanceTextBox>}
   */
  function advance() {
    const before = state.active;
    const res = advanceTextBox(state);
    if (!res.handled) return res;
    painted = null;
    blipCount = 0;
    cuePhase = 0;
    if (res.closed) {
      root.visible = false;
      clearText();
      cue.clear();
    } else {
      paint();
      paintCue();
    }
    if (before && (res.turned || res.skipped)) playSfx('text');
    return res;
  }

  return {
    root,
    open,
    close,
    tick,
    advance,
    get active() {
      return state.active;
    },
    get kind() {
      return state.kind;
    },
    get meta() {
      return state.meta;
    },
    /** Exposed for tests / debug readouts. */
    state,
  };
}
