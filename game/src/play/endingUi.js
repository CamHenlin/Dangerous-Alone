import { Container, Graphics, Sprite } from 'pixi.js';

import {
  ENDING_PHASE,
  createEndingSequence,
  endingAcceptsStart,
  endingFlashColor,
  endingHeroesVisible,
  stepEndingSequence,
} from '@shared/endingSequence.js';
import {
  creditsLinesForQuest,
  creditsRowY,
  fillCreditsNameLine,
} from '@shared/endingText.js';
import { nesColor } from '@shared/nesPalette.js';
import { chrTileForItemId } from '@shared/itemFrame.js';
import { nesText, nesTile } from './nesFont.js';

const SCREEN_W = 256;
const SCREEN_H = 240;
const TILE = 8;

const WHITE = 0xfcfcfc;
/** `CreditsAttrs` gives the border its own palette row; brick red is close. */
const BRICK_TILE = 0xfa;
const BRICK_COLOR = 0xd82800;
const BRICK_LEFT_COL = 3;
const BRICK_RIGHT_COL = 28;
/** `DrawCredits` frames scroll rows 1…44 and leaves the rest bare. */
const BORDER_TOP_ROW = 1;
const BORDER_BOTTOM_ROW = 44;

/** `UpdateMode13WinGame_Sub4` puts the triforce at `($78, $88)`. */
const TABLEAU_TRIFORCE_X = 0x78;
const TABLEAU_TRIFORCE_Y = 0x88;
/** `DrawLinkZeldaTriforces` floats each triforce `$10` px above its owner. */
const TRIFORCE_LIFT = 0x10;

/**
 * The flash swaps the universal backdrop colour, which recolours every
 * black pixel of the room. Over a baked screen we can only tint, so the
 * flash is an alpha wash rather than a palette write.
 */
const FLASH_ALPHA = 0.45;

/**
 * Game mode `$13` — the ending.
 *
 * Owns everything the mode draws except Link and Zelda themselves, who stay
 * in the world layer; `tick` reports whether they should still be on screen.
 *
 * @param {object} deps
 * @param {import('pixi.js').Texture | null} [deps.commonBg] common_background sheet
 * @param {{ itemTexture: (tile: number) => { texture: import('pixi.js').Texture } }} [deps.items]
 * @param {object | null} [deps.data] `assets/extracted/play/ending.json`
 */
export function createEndingUi(deps = {}) {
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const data = deps.data ?? null;

  const root = new Container();
  root.visible = false;

  /** Flash wash during the tableau, then the opaque credits backdrop. */
  const backdrop = new Graphics();
  root.addChild(backdrop);

  const triforces = new Container();
  root.addChild(triforces);

  const textLayer = new Container();
  root.addChild(textLayer);

  /** Scrolled as one piece; `y` is the negated scroll offset. */
  const creditsLayer = new Container();
  creditsLayer.visible = false;
  root.addChild(creditsLayer);

  const tableau = new Container();
  tableau.visible = false;
  root.addChild(tableau);

  let sequence = createEndingSequence();
  let quest = 1;
  let lastTextKey = '';
  /** Flat text of the two textboxes, used by the typewriter. */
  let thanksFlat = '';
  let peaceFlat = '';

  function clear(container) {
    container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /** Concatenate the laid-out runs so the typewriter sees one string. */
  function flatten(lines) {
    return (lines ?? []).map((l) => l.text).join('');
  }

  /**
   * Draw the first `count` characters of a laid-out textbox.
   * @param {{ row: number, col: number, text: string }[]} lines
   * @param {number} count
   */
  function paintTextbox(lines, count) {
    if (!fontImg) return;
    let left = count;
    for (const line of lines ?? []) {
      if (left <= 0) break;
      const shown = line.text.slice(0, left);
      left -= shown.length;
      textLayer.addChild(nesText(fontImg, shown, line.col * TILE, line.row * TILE, WHITE));
    }
  }

  /** Repaint the textbox layer only when the visible character count changes. */
  function syncTextbox(key, lines, count) {
    if (key === lastTextKey) return;
    lastTextKey = key;
    clear(textLayer);
    paintTextbox(lines, count);
  }

  /** Triforce sprites above Link and Zelda (`DrawLinkZeldaTriforces`). */
  function syncTriforces(visible, positions) {
    triforces.visible = visible;
    if (!visible || !deps.items) return;
    const owners = [positions?.link, positions?.zelda].filter(Boolean);
    while (triforces.children.length < owners.length) {
      triforces.addChild(new Sprite(deps.items.itemTexture(chrTileForItemId(0x1b)).texture));
    }
    triforces.children.forEach((spr, i) => {
      const owner = owners[i];
      spr.visible = Boolean(owner);
      if (!owner) return;
      spr.x = owner.x;
      spr.y = owner.y - TRIFORCE_LIFT;
    });
  }

  function paintFlash(color) {
    backdrop.clear();
    if (color == null) return;
    const [r, g, b] = nesColor(color);
    backdrop.rect(0, 0, SCREEN_W, SCREEN_H);
    backdrop.fill({ color: (r << 16) | (g << 8) | b, alpha: FLASH_ALPHA });
  }

  function paintBlack() {
    backdrop.clear();
    backdrop.rect(0, 0, SCREEN_W, SCREEN_H);
    backdrop.fill(0x000000);
  }

  /** The bordered box that frames the staff list. */
  function buildCreditsBorder() {
    if (!fontImg) return;
    for (let col = BRICK_LEFT_COL; col <= BRICK_RIGHT_COL; col += 1) {
      for (const row of [BORDER_TOP_ROW, BORDER_BOTTOM_ROW]) {
        creditsLayer.addChild(
          nesTile(fontImg, BRICK_TILE, col * TILE, creditsRowY(row), BRICK_COLOR),
        );
      }
    }
    for (let row = BORDER_TOP_ROW + 1; row < BORDER_BOTTOM_ROW; row += 1) {
      for (const col of [BRICK_LEFT_COL, BRICK_RIGHT_COL]) {
        creditsLayer.addChild(
          nesTile(fontImg, BRICK_TILE, col * TILE, creditsRowY(row), BRICK_COLOR),
        );
      }
    }
  }

  /**
   * Lay the whole roll out once; scrolling is then a single `y` assignment.
   * @param {{ name: string, deaths: number }} profile
   */
  function buildCredits(profile) {
    clear(creditsLayer);
    if (!fontImg || !data) return;
    buildCreditsBorder();
    const nameIndex = data.playerNameLineIndex ?? 17;
    for (const line of creditsLinesForQuest(data.creditsLines, quest, data.creditsQuestGating)) {
      if (line.row == null) continue;
      const text =
        line.index === nameIndex
          ? fillCreditsNameLine(line, profile.name, profile.deaths)
          : line.text;
      creditsLayer.addChild(
        nesText(fontImg, text, line.column * TILE, creditsRowY(line.row), WHITE),
      );
    }
  }

  /** Submode 4: the triforce over Ganon's ashes on a black screen. */
  function buildTableau() {
    clear(tableau);
    const ashes = new Graphics();
    // DrawAshPile uses Ganon frame image $0B, which is not in our extract.
    ashes.ellipse(TABLEAU_TRIFORCE_X + 8, TABLEAU_TRIFORCE_Y + 40, 20, 6);
    ashes.fill(0x585858);
    tableau.addChild(ashes);
    if (deps.items) {
      const spr = new Sprite(deps.items.itemTexture(chrTileForItemId(0x0e)).texture);
      spr.x = TABLEAU_TRIFORCE_X;
      spr.y = TABLEAU_TRIFORCE_Y;
      spr.scale.set(2);
      tableau.addChild(spr);
    }
  }

  /**
   * Start the sequence.
   * @param {{ quest?: number, name?: string, deaths?: number }} [profile]
   */
  function begin(profile = {}) {
    sequence = createEndingSequence();
    quest = profile.quest === 2 ? 2 : 1;
    thanksFlat = flatten(data?.thanksLines);
    peaceFlat = flatten(data?.peaceLines);
    lastTextKey = '';
    clear(textLayer);
    backdrop.clear();
    creditsLayer.visible = false;
    creditsLayer.y = 0;
    tableau.visible = false;
    triforces.visible = false;
    buildCredits({ name: profile.name ?? 'LINK', deaths: profile.deaths ?? 0 });
    buildTableau();
    root.visible = true;
  }

  function hide() {
    root.visible = false;
  }

  /** The roll is taller than the screen, so the layer slides up past it. */
  function syncCredits() {
    creditsLayer.visible = true;
    creditsLayer.y = -sequence.scroll;
  }

  /**
   * @typedef {object} EndingTick
   * @property {boolean} heroesVisible caller should keep drawing Link and Zelda
   * @property {boolean} worldVisible the room is still behind the overlay
   * @property {boolean} playCharTune
   * @property {boolean} startSong
   * @property {boolean} silence
   * @property {boolean} finished Start was accepted on the tableau
   */

  /**
   * Advance one frame.
   * @param {{ start?: boolean }} pressed
   * @param {{ link?: { x: number, y: number }, zelda?: { x: number, y: number } }} [positions]
   * @returns {EndingTick}
   */
  function tick(pressed = {}, positions = {}) {
    if (!root.visible) return idleTick();

    const events = stepEndingSequence(sequence, {
      thanks: thanksFlat,
      peace: peaceFlat,
      scrollEnd: creditsEnd(),
    });
    const phase = sequence.phase;
    const rolling = phase === ENDING_PHASE.CREDITS || phase === ENDING_PHASE.TABLEAU;

    if (phase === ENDING_PHASE.THANKS || phase === ENDING_PHASE.THANKS_HOLD) {
      syncTextbox(`thanks:${sequence.chars}`, data?.thanksLines, sequence.chars);
    } else if (isPeacePhase(phase)) {
      syncTextbox(`peace:${sequence.chars}`, data?.peaceLines, sequence.chars);
    } else if (rolling) {
      syncTextbox('none', [], 0);
    }

    if (rolling) {
      paintBlack();
      syncCredits();
    } else {
      paintFlash(endingFlashColor(sequence));
    }
    creditsLayer.visible = phase === ENDING_PHASE.CREDITS;
    tableau.visible = phase === ENDING_PHASE.TABLEAU;

    const heroes = endingHeroesVisible(sequence);
    syncTriforces(heroes && phase !== ENDING_PHASE.THANKS, positions);

    return {
      heroesVisible: heroes,
      worldVisible: !rolling,
      playCharTune: events.playCharTune,
      startSong: events.startSong,
      silence: events.silence,
      finished: endingAcceptsStart(sequence, Boolean(pressed.start)),
    };
  }

  /** Where the roll stops, per `CreditsLastScreenList`. */
  function creditsEnd() {
    const ends = data?.creditsScrollEnd;
    if (!ends) return 600;
    return quest === 2 ? ends.quest2 : ends.quest1;
  }

  function isPeacePhase(phase) {
    return (
      phase === ENDING_PHASE.PEACE_DELAY
      || phase === ENDING_PHASE.PEACE
      || phase === ENDING_PHASE.PEACE_HOLD
    );
  }

  function idleTick() {
    return {
      heroesVisible: true,
      worldVisible: true,
      playCharTune: false,
      startSong: false,
      silence: false,
      finished: false,
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
    get phase() {
      return sequence.phase;
    },
  };
}