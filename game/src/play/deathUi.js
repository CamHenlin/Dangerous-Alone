import { Container, Graphics } from 'pixi.js';

import {
  DEATH_PHASE,
  createDeathSequence,
  deathRenderState,
  stepDeathSequence,
} from '@shared/deathSequence.js';
import {
  CONTINUE_LABELS,
  CONTINUE_ROW_Y,
  activateContinueChoice,
  continueMenuFlashOn,
  createContinueMenu,
  moveContinueCursor,
  stepContinueMenu,
} from '@shared/continueMenu.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import { nesText } from './nesFont.js';

const SCREEN_W = 256;
const SCREEN_H = 240;
/** The status bar stays lit throughout modes $11 and $08. */
const PLAY_TOP = HUD_HEIGHT;
const PLAY_H = SCREEN_H - PLAY_TOP;

/** "GAME OVER" is centred on the play area (`Mode11GameOverTransferBuf`). */
const GAME_OVER_TEXT = 'GAME OVER';
const GAME_OVER_X = 0x58;
const GAME_OVER_Y = 0x68;

/** Continue rows sit at `Mode8SpriteYs`; the cursor is one tile to the left. */
const MENU_X = 0x60;
const CURSOR_X = 0x50;

const WHITE = 0xfcfcfc;
const SPARK_COLOR = 0xfcfcfc;

/**
 * `AnimateWorldFading` swaps the bottom half of the BG palette, which we can
 * only approximate over a baked screen. Alpha ramps with the step so the world
 * reddens and then goes dark on the ROM's schedule.
 */
const FADE_ALPHA = Object.freeze([0, 0.45, 0.65, 0.85, 1]);

/**
 * Game modes `$11` (death) and `$08` (continue question).
 *
 * Owns the screen furniture only — the spinning Link himself stays in the
 * world layer, so `tick` reports how he should be drawn and the caller applies
 * it to the existing sprite.
 *
 * @param {object} [deps]
 * @param {import('pixi.js').Texture | null} [deps.commonBg] common_background sheet
 * @param {number[][][] | null} [deps.deathFadeRgb] `LevelInfo_DeathPaletteSeries`
 */
export function createDeathUi(deps = {}) {
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;

  const root = new Container();
  root.visible = false;

  /** Tint over the world during the fade; becomes the black backdrop after. */
  const fade = new Graphics();
  root.addChild(fade);

  const spark = new Graphics();
  root.addChild(spark);

  const textLayer = new Container();
  root.addChild(textLayer);

  let sequence = createDeathSequence();
  let menu = createContinueMenu();
  /** Mode `$08` has taken over from mode `$11`. */
  let inMenu = false;
  let lastTextKey = '';

  /** Colour the fade steps drive toward — row entry 1 is the dominant tone. */
  function fadeColor(step) {
    const rgb = deps.deathFadeRgb?.[Math.min(step, 3) - 1]?.[1];
    if (!rgb) return 0x000000;
    return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  }

  function paintFade(step) {
    fade.clear();
    if (step <= 0) return;
    fade.rect(0, PLAY_TOP, SCREEN_W, PLAY_H);
    fade.fill({ color: fadeColor(step), alpha: FADE_ALPHA[step] ?? 1 });
  }

  function paintBlack() {
    fade.clear();
    fade.rect(0, PLAY_TOP, SCREEN_W, PLAY_H);
    fade.fill(0x000000);
  }

  /**
   * Sprites `$12`/`$13`: two mirrored spark tiles at Link's position, `$62`
   * while the counter is high and the wider `$64` for the last few frames.
   */
  function paintSpark(visible, tile, x, y) {
    spark.clear();
    if (!visible) return;
    const w = tile === 0x64 ? 8 : 5;
    const h = tile === 0x64 ? 8 : 5;
    for (const dx of [0, 8]) {
      spark.rect(x + dx + (8 - w) / 2, y + (8 - h) / 2, w, h);
    }
    spark.fill(SPARK_COLOR);
  }

  /** Rebuild the text layer only when its content changes. */
  function paintText(key, build) {
    if (key === lastTextKey) return;
    lastTextKey = key;
    textLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (fontImg) build(fontImg);
  }

  function paintGameOver() {
    paintText('over', (img) => {
      textLayer.addChild(nesText(img, GAME_OVER_TEXT, GAME_OVER_X, GAME_OVER_Y, WHITE));
    });
  }

  function paintMenu() {
    const flash = continueMenuFlashOn(menu);
    paintText(`menu:${menu.selection}:${menu.activated ? (flash ? 1 : 0) : 'x'}`, (img) => {
      CONTINUE_LABELS.forEach((label, row) => {
        const lit = !menu.activated || row !== menu.selection || flash;
        textLayer.addChild(
          nesText(img, label, MENU_X, CONTINUE_ROW_Y[row], lit ? WHITE : 0x606060),
        );
      });
      // Stand-in for sprite 0, which on NES is a small Link head.
      textLayer.addChild(
        nesText(img, '-', CURSOR_X, CONTINUE_ROW_Y[menu.selection], 0xe8d040),
      );
    });
  }

  /** Start the death sequence from the top. */
  function begin() {
    sequence = createDeathSequence();
    menu = createContinueMenu();
    inMenu = false;
    lastTextKey = '';
    textLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    fade.clear();
    spark.clear();
    root.visible = true;
  }

  function hide() {
    root.visible = false;
  }

  /**
   * @typedef {object} DeathTick
   * @property {boolean} linkVisible caller should draw Link this frame
   * @property {number} linkDir facing for the spin
   * @property {boolean} linkGrey Link uses the dead (grey) palette row
   * @property {boolean} playDyingTune
   * @property {boolean} playHeartTune
   * @property {boolean} playGameOverMusic mode `$08` requests Tune1 `$40`
   * @property {boolean} cursorMoved Select chirped
   * @property {string | null} action 'continue' | 'save' | 'retry'
   */

  /**
   * Advance one frame.
   * @param {{ x: number, y: number }} linkPos where the spark appears
   * @param {{ select?: boolean, start?: boolean }} [pressed]
   * @returns {DeathTick}
   */
  function tick(linkPos, pressed = {}) {
    if (!root.visible) return idleTick();
    if (inMenu) return tickMenu(pressed);

    const events = stepDeathSequence(sequence);
    const r = deathRenderState(sequence);
    paintFade(r.fadeStep);
    paintSpark(r.sparkVisible, r.sparkTile, linkPos.x, linkPos.y);
    if (r.gameOverVisible) {
      paintBlack();
      paintGameOver();
    } else if (sequence.phase === DEATH_PHASE.HOLD) {
      paintBlack();
      paintText('blank', () => {});
    }

    if (events.finished) {
      inMenu = true;
      paintBlack();
      paintMenu();
    }
    return {
      ...idleTick(),
      linkVisible: r.linkVisible,
      linkDir: r.linkDir,
      linkGrey: r.linkGrey,
      playDyingTune: events.playDyingTune,
      playHeartTune: events.playHeartTune,
      playGameOverMusic: events.finished,
    };
  }

  /** @param {{ select?: boolean, start?: boolean }} pressed */
  function tickMenu(pressed) {
    let cursorMoved = false;
    if (pressed.start) {
      activateContinueChoice(menu);
    } else if (pressed.select) {
      cursorMoved = moveContinueCursor(menu);
    }
    const { action } = stepContinueMenu(menu);
    paintMenu();
    return { ...idleTick(), cursorMoved, action };
  }

  function idleTick() {
    return {
      linkVisible: false,
      linkDir: 0,
      linkGrey: false,
      playDyingTune: false,
      playHeartTune: false,
      playGameOverMusic: false,
      cursorMoved: false,
      action: /** @type {string | null} */ (null),
    };
  }

  return {
    root,
    begin,
    hide,
    tick,
    get visible() {
      return root.visible;
    },
    get inMenu() {
      return inMenu;
    },
  };
}
