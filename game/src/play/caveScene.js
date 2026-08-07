import { Container, Graphics, Sprite } from 'pixi.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import {
  CAVE_DWELLER_X,
  CAVE_DWELLER_Y,
  CAVE_FIRE_PAL,
  CAVE_FIRE_TILE,
  CAVE_FIRE_XS,
  CAVE_FIRE_Y,
  CAVE_WARE_Y,
  caveDwellerDraw,
  caveWareSlots,
} from '@shared/caveRoom.js';
import { caveItemChrTile, caveItemSpritePalette } from '@shared/caveItems.js';
import { nesMultilineText, nesText } from './nesFont.js';

const INTERNAL_W = 256;
const PLAY_H = 176;
const WHITE = 0xfcfcfc;
const HINT_GREY = 0x888888;

/**
 * Full-screen NES-style cave interior (Mode B).
 * @param {{
 *   spriteTex: Texture,
 *   items: ReturnType<import('./itemSprites.js').createItemSprites>,
 *   enemySprites: ReturnType<import('./enemySprites.js').createEnemySprites>,
 *   commonBg?: Texture | null,
 * }} deps
 */
export function createCaveScene(deps) {
  const { items, enemySprites } = deps;
  const fontImg = deps.commonBg
    ? /** @type {CanvasImageSource} */ (deps.commonBg.source.resource)
    : null;
  const root = new Container();
  root.visible = false;

  const bg = new Graphics();
  root.addChild(bg);

  const mouth = new Graphics();
  root.addChild(mouth);

  /** @type {Sprite | null} */
  let npcSprite = null;
  /** @type {Sprite[]} */
  const fireSprites = [];

  /** @type {Container} */
  const wareLayer = new Container();
  root.addChild(wareLayer);

  const dialogueLayer = new Container();
  dialogueLayer.y = HUD_HEIGHT + 16;
  root.addChild(dialogueLayer);

  const hintLayer = new Container();
  hintLayer.y = HUD_HEIGHT + PLAY_H - 12;
  root.addChild(hintLayer);
  if (fontImg) {
    const hint = nesText(fontImg, 'WALK TO ITEM  SOUTH TO LEAVE', 24, 0, HINT_GREY);
    hintLayer.addChild(hint);
  }

  /** @type {object | null} */
  let cave = null;
  /** @type {string[]} */
  let lines = [];
  let revealChars = 0;
  let revealTimer = 0;
  let firePhase = 0;
  /**
   * Potion shop before the letter: `UpdateCavePerson` @ `Z_01.asm:322` returns
   * before `DrawCaveItems` *and* before the state jump table, so the prices and
   * the textbox are dormant too — not just the wares.
   */
  let waresHidden = false;

  function paintBg() {
    bg.clear();
    bg.rect(0, HUD_HEIGHT, INTERNAL_W, PLAY_H);
    bg.fill(0x000000);

    // Soft brown walls along the top edge (NES cave “ceiling” feel).
    bg.rect(0, HUD_HEIGHT, INTERNAL_W, 12);
    bg.fill(0x2a1810);

    mouth.clear();
    // South cave mouth (lighter sand opening).
    mouth.rect(0x68, 0xc8, 0x30, 0x18);
    mouth.fill(0x3d2a18);
    mouth.rect(0x70, 0xd0, 0x20, 0x10);
    mouth.fill(0x5a4020);
  }

  /**
   * DrawCavePerson — ObjAnimFrameHeap tiles $98/$9A/$9C/$F8.
   * @param {number} dweller
   */
  function paintNpc(dweller) {
    if (npcSprite) {
      root.removeChild(npcSprite);
      npcSprite.destroy({ texture: false, textureSource: false });
      npcSprite = null;
    }
    const draw = caveDwellerDraw(dweller);
    const tex = enemySprites.textureForCaveSprite(draw.tile, {
      mirror: draw.mirror,
      spritePal: draw.pal,
    });
    npcSprite = new Sprite(tex);
    npcSprite.x = CAVE_DWELLER_X;
    npcSprite.y = CAVE_DWELLER_Y;
    // Keep NPC behind wares / dialogue text.
    root.addChildAt(npcSprite, root.getChildIndex(wareLayer));
  }

  function ensureFireSprites() {
    if (fireSprites.length) return;
    for (let i = 0; i < 2; i += 1) {
      const tex = enemySprites.textureForCaveSprite(CAVE_FIRE_TILE, {
        mirror: true,
        spritePal: CAVE_FIRE_PAL,
      });
      const spr = new Sprite(tex);
      spr.x = CAVE_FIRE_XS[i];
      spr.y = CAVE_FIRE_Y;
      fireSprites.push(spr);
      root.addChildAt(spr, root.getChildIndex(wareLayer));
    }
  }

  function paintFires() {
    ensureFireSprites();
    firePhase = (firePhase + 1) % 16;
    // Subtle flicker via alpha (ROM animates fire frames; we only have one tile).
    const a = firePhase < 8 ? 1 : 0.85;
    for (const spr of fireSprites) spr.alpha = a;
  }

  /**
   * @param {object} nextCave
   * @param {Set<string>} taken
   * @param {boolean} [hidden]
   */
  function open(nextCave, taken, hidden = false) {
    cave = nextCave;
    lines = Array.isArray(nextCave.textLines) && nextCave.textLines.length
      ? [...nextCave.textLines]
      : [nextCave.text || ''];
    revealChars = 0;
    revealTimer = 0;
    paintBg();
    paintNpc(nextCave.dweller);
    paintFires();
    refreshWares(taken, hidden);
    clearDialogue();
    root.visible = true;
  }

  function clearDialogue() {
    dialogueLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
  }

  function paintDialogue() {
    clearDialogue();
    const full = lines.join('\n');
    const shown = full.slice(0, revealChars);
    const { root: block, width } = nesMultilineText(fontImg, shown, WHITE, 10);
    block.x = Math.max(8, (INTERNAL_W - width) / 2);
    dialogueLayer.addChild(block);
  }

  /**
   * @param {Set<string>} taken
   * @param {boolean} [hidden]
   */
  function refreshWares(taken, hidden = false) {
    waresHidden = hidden;
    wareLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    if (!cave || waresHidden) return;
    const showPrices = cave.kind === 'shop' || cave.kind === 'potion';
    for (const slot of caveWareSlots(cave, taken)) {
      if (slot.gone) continue;
      const tile = caveItemChrTile(slot.item);
      const pal = caveItemSpritePalette(slot.item);
      const spr = new Sprite(items.spriteTexture(tile, pal));
      spr.x = slot.x;
      spr.y = slot.y;
      wareLayer.addChild(spr);
      if (showPrices && slot.price > 0 && fontImg) {
        const price = nesText(fontImg, String(slot.price), slot.x - 2, CAVE_WARE_Y + 18, WHITE);
        wareLayer.addChild(price);
      }
    }
  }

  /** Typewriter one frame (~1 char every 2 frames like letter SFX). */
  function tickDialogue() {
    if (!root.visible || waresHidden) return;
    const full = lines.join('\n');
    if (revealChars >= full.length) return;
    revealTimer += 1;
    if (revealTimer < 2) return;
    revealTimer = 0;
    revealChars += 1;
    paintDialogue();
  }

  function tick() {
    if (!root.visible) return;
    tickDialogue();
    if (Math.random() < 0.15) paintFires();
  }

  function close() {
    root.visible = false;
    cave = null;
    waresHidden = false;
    clearDialogue();
    wareLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    if (npcSprite) {
      root.removeChild(npcSprite);
      npcSprite.destroy({ texture: false, textureSource: false });
      npcSprite = null;
    }
    for (const spr of fireSprites) {
      root.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
    }
    fireSprites.length = 0;
  }

  return {
    root,
    get open() {
      return root.visible;
    },
    get cave() {
      return cave;
    },
    openWith: open,
    refreshWares,
    tick,
    close,
  };
}
