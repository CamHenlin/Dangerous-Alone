import { Container } from 'pixi.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import { nesMultilineText } from './nesFont.js';

const INTERNAL_W = 256;
const WHITE = 0xfcfcfc;

/**
 * Typewriter tip text for underworld persons (UpdatePersonState_Textbox).
 * Renders with the NES BG charset from common_background.
 *
 * @param {{ commonBg?: import('pixi.js').Texture | null }} [deps]
 */
export function createPersonDialogue(deps = {}) {
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;

  const root = new Container();
  root.visible = false;

  const textLayer = new Container();
  textLayer.y = HUD_HEIGHT + 16;
  root.addChild(textLayer);

  /** @type {string[]} */
  let lines = [];
  let revealChars = 0;
  let revealTimer = 0;

  function clearText() {
    textLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
  }

  function paint() {
    clearText();
    const full = lines.join('\n');
    const shown = full.slice(0, revealChars);
    const { root: block, width } = nesMultilineText(fontImg, shown, WHITE, 10);
    block.x = Math.max(8, (INTERNAL_W - width) / 2);
    textLayer.addChild(block);
  }

  /**
   * @param {string[]} nextLines
   */
  function open(nextLines) {
    lines = (nextLines ?? []).filter(Boolean);
    revealChars = 0;
    revealTimer = 0;
    clearText();
    root.visible = lines.length > 0;
  }

  function close() {
    root.visible = false;
    lines = [];
    clearText();
  }

  function tick() {
    if (!root.visible) return;
    const full = lines.join('\n');
    if (revealChars >= full.length) return;
    revealTimer += 1;
    if (revealTimer < 2) return;
    revealTimer = 0;
    revealChars += 1;
    paint();
  }

  return { root, open, close, tick };
}
