import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { scale, tilePx } from '@shared/gfxScale.js';
import { createTileCanvas, textureFromCanvas } from './scaledCanvas.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import {
  CAVE_DWELLER_X,
  CAVE_DWELLER_Y,
  CAVE_FIRE_PAL,
  CAVE_FIRE_TILE,
  CAVE_FIRE_XS,
  CAVE_FIRE_Y,
  CAVE_ROAD_XS,
  CAVE_ROAD_Y,
  CAVE_WARE_Y,
  caveDwellerDraw,
  caveHintLine,
  caveWareSlots,
} from '@shared/caveRoom.js';
import { caveItemChrTile } from '@shared/caveItems.js';
import { itemDrawPalette } from '@shared/itemDrawPalette.js';
import { SECRET_STAIRS_TILES } from '@shared/owSecrets.js';
import { owBgTileSourceRect } from '@shared/owBgTiles.js';
import { nesText } from './nesFont.js';

const INTERNAL_W = 256;
const PLAY_H = 176;
const WHITE = 0xfcfcfc;
const HINT_GREY = 0x888888;

/**
 * Compose the OW stairs metatile ($70–$73) into a 16×16 texture.
 * @param {Record<string, Texture>} sheetTextures
 */
function buildStairsTexture(sheetTextures) {
  const { canvas, ctx } = createTileCanvas(16, 16);
  const positions = [
    [0, 0],
    [0, 8],
    [8, 0],
    [8, 8],
  ];
  for (let i = 0; i < 4; i += 1) {
    const src = owBgTileSourceRect(SECRET_STAIRS_TILES[i]);
    if (!src) continue;
    const sheet = sheetTextures[src.sheetKey];
    const img = /** @type {CanvasImageSource | null} */ (sheet?.source?.resource);
    if (!img) continue;
    const [dx, dy] = positions[i];
    ctx.drawImage(img, src.sx * scale(), src.sy * scale(), tilePx(), tilePx(), dx, dy, 8, 8);
  }
  const tex = textureFromCanvas(canvas);
  return tex;
}

/**
 * Full-screen NES-style cave interior (Mode B).
 *
 * The dweller's speech is not drawn here — Phase 19 routes every speaking part
 * through the shared dialogue box (`./textBox.js`), which `openCave` opens.
 * @param {{
 *   spriteTex: Texture,
 *   items: ReturnType<import('./itemSprites.js').createItemSprites>,
 *   enemySprites: ReturnType<import('./enemySprites.js').createEnemySprites>,
 *   commonBg?: Texture | null,
 *   sheetTextures?: Record<string, Texture>,
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

  /** @type {Container} */
  const roadLayer = new Container();
  root.addChild(roadLayer);

  const hintLayer = new Container();
  hintLayer.y = HUD_HEIGHT + PLAY_H - 12;
  root.addChild(hintLayer);

  /** Cached OW stairs metatile for take-any-road caves. */
  let stairsTex = /** @type {Texture | null} */ (null);

  /** @type {object | null} */
  let cave = null;
  /** OW screen Link entered from — scopes take-any / door / moblin taken flags. */
  let entranceRoomId = /** @type {number | null} */ (null);
  let firePhase = 0;
  /**
   * Potion shop before the letter: wares and prices stay hidden until shown.
   * Dialogue still opens (via `lockedPages` on the medicine-shop story).
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
   * @param {string} kind
   */
  function paintHint(kind) {
    hintLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    if (!fontImg) return;
    const line = caveHintLine(kind, {
      waresHidden,
      hasLetter: (lastInv?.letter ?? 0) === 1,
    });
    // Center-ish: item hint is long; south-only is short.
    const x = line.length > 20 ? 16 : 72;
    hintLayer.addChild(nesText(fontImg, line, x, 0, HINT_GREY));
  }

  function paintRoadStairs() {
    roadLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    if (!cave || cave.kind !== 'road') return;
    if (!stairsTex) {
      stairsTex = buildStairsTexture(deps.sheetTextures ?? {});
    }
    if (!stairsTex || stairsTex === Texture.EMPTY) return;
    for (const x of CAVE_ROAD_XS) {
      const spr = new Sprite(stairsTex);
      spr.x = x;
      spr.y = CAVE_ROAD_Y;
      roadLayer.addChild(spr);
    }
  }

  /**
   * Optional per-slot price labels (money-game stake / reveal). When set,
   * drawn instead of shop/potion numeric prices for those indexes.
   * @type {(string | null)[] | null}
   */
  let warePriceLabels = null;
  /** Last ware refresh — palette rebuild has to paint the same shelf. */
  let lastTaken = /** @type {Set<string> | null} */ (null);
  let lastInv = /** @type {object | null} */ (null);

  /**
   * @param {object} nextCave
   * @param {Set<string>} taken
   * @param {boolean} [hidden]
   * @param {object | null} [inv]
   * @param {number | null} [roomId]
   * @param {(string | null)[] | null} [priceLabels]
   */
  function open(
    nextCave,
    taken,
    hidden = false,
    inv = null,
    roomId = null,
    priceLabels = null,
  ) {
    cave = nextCave;
    entranceRoomId = roomId;
    warePriceLabels = priceLabels;
    paintBg();
    paintNpc(nextCave.dweller);
    paintFires();
    paintRoadStairs();
    refreshWares(taken, hidden, inv);
    root.visible = true;
  }

  /**
   * @param {Set<string>} taken
   * @param {boolean} [hidden]
   * @param {object | null} [inv]
   * @param {(string | null)[] | null | undefined} [priceLabels]
   *   Pass to replace labels; omit to keep the previous set.
   */
  function refreshWares(taken, hidden = false, inv = null, priceLabels) {
    lastTaken = taken;
    lastInv = inv;
    waresHidden = hidden;
    if (priceLabels !== undefined) warePriceLabels = priceLabels;
    wareLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    if (!cave) return;
    paintHint(cave.kind);
    if (waresHidden) return;
    const showPrices = cave.kind === 'shop' || cave.kind === 'potion';
    for (const slot of caveWareSlots(cave, taken, inv, entranceRoomId)) {
      if (slot.gone) continue;
      // Wide items (heart container, triforce, …) need the mirrored pair —
      // spriteTexture alone draws only the left 8×16 half.
      const tile = caveItemChrTile(slot.item);
      const pal = itemDrawPalette(slot.item);
      const drawn = items.itemTexture(tile, pal);
      const spr = new Sprite(drawn.texture);
      spr.x = slot.x + (drawn.narrow ? 4 : 0);
      spr.y = slot.y;
      wareLayer.addChild(spr);
      const override = warePriceLabels?.[slot.index] ?? null;
      const shopPrice =
        showPrices && slot.price > 0 ? String(slot.price) : null;
      const label = override ?? shopPrice;
      if (label && fontImg) {
        const price = nesText(fontImg, label, slot.x - 2, CAVE_WARE_Y + 18, WHITE);
        wareLayer.addChild(price);
      }
    }
  }

  function tick() {
    // Hidden interiors still live — two caves share the stage, and only the
    // view being captured is visible. Skip the visible check or a friend's
    // fires freeze until you look at them.
    if (!cave) return;
    if (Math.random() < 0.15) paintFires();
  }

  /**
   * Drop cached NPC / fire / ware textures before a palette-set destroy.
   * Entering a labyrinth rebuilds the item cache, and a live cave still
   * sampling those textures blacks the GL context.
   */
  function releaseCachedTextures() {
    if (npcSprite) npcSprite.texture = Texture.EMPTY;
    for (const spr of fireSprites) spr.texture = Texture.EMPTY;
    for (const child of wareLayer.children) {
      if (child.texture) child.texture = Texture.EMPTY;
    }
  }

  function rebuildCachedTextures() {
    if (!cave) return;
    paintNpc(cave.dweller);
    const tex = enemySprites.textureForCaveSprite(CAVE_FIRE_TILE, {
      mirror: true,
      spritePal: CAVE_FIRE_PAL,
    });
    for (const spr of fireSprites) spr.texture = tex;
    if (lastTaken) refreshWares(lastTaken, waresHidden, lastInv);
  }

  function close() {
    root.visible = false;
    cave = null;
    entranceRoomId = null;
    waresHidden = false;
    warePriceLabels = null;
    wareLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    roadLayer.removeChildren().forEach((c) =>
      c.destroy({ children: true, texture: false, textureSource: false }),
    );
    hintLayer.removeChildren().forEach((c) =>
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

  function destroy() {
    close();
    if (stairsTex && stairsTex !== Texture.EMPTY) {
      stairsTex.destroy(true);
      stairsTex = null;
    }
    root.destroy({ children: true, texture: false, textureSource: false });
  }

  return {
    root,
    get open() {
      return root.visible;
    },
    get cave() {
      return cave;
    },
    get roomId() {
      return entranceRoomId;
    },
    openWith: open,
    refreshWares,
    tick,
    close,
    destroy,
    releaseCachedTextures,
    rebuildCachedTextures,
  };
}
