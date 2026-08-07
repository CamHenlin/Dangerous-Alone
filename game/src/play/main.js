import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { DIR, HUD_HEIGHT, UW_FIRST_UNWALKABLE } from '@shared/collision.js';
import {
  NO_ROOM_BOUNDS,
  UW_ROOM_BOUNDS,
  createLinkState,
  ejectLinkFromSolid,
  oppositeDir,
  overworldLinkQSpeed,
  pickSingleDir,
  stepLink,
  stepShove,
} from '@shared/linkMotion.js';
import {
  formatCollisionReadout,
  isUwSolidTile,
  probeUwCollision,
} from '@shared/uwCollisionHarness.js';
import {
  checkCaveEntry,
  checkScreenTransition,
  overworldExitSpawn,
} from '@shared/world.js';
import {
  PLAY_H,
  PLAY_W,
  beginScreenScroll,
  createScreenScroll,
  isScrolling,
  stepScreenScroll,
} from '@shared/screenScroll.js';
import { checkMaze, createMazeState } from '@shared/mazes.js';
import { nesColor } from '@shared/nesPalette.js';
import {
  createRupeeRoll,
  resetRupeeRoll,
  stepRupeeRoll,
} from '@shared/rupeeRoll.js';
import {
  POND_STAIRS_X,
  POND_STAIRS_Y,
  createPondSecret,
  pondFirstUnwalkable,
  startPondSecret,
  stepPondSecret,
} from '@shared/pondSecret.js';
import {
  B_ITEM,
  SWORD,
  applyBubbleSwordBlock,
  canSwingSword,
  createInventory,
  cycleBItem,
  drinkPotion,
  grantRoomItem,
  harmLink,
  hasTriforce,
  swordBeamHealthOk,
  stealMagicShield,
  stepLinkStatus,
  triforceCount,
  trySpendArrowShot,
} from '@shared/inventory.js';
import {
  describeCave,
  getCave,
  rollMoneyGameAmounts,
  tryBuyCaveSlot,
  tryDoorRepair,
  tryGamble,
  tryMoblinGift,
} from '@shared/caves.js';
import {
  canShowLetter,
  potionShopWaresHidden,
  showLetter,
} from '@shared/potionShop.js';
import { chrTileForItemId } from '@shared/itemFrame.js';
import {
  SECRET_STAIRS_TILES,
  revealSecretTiles,
  secretAction,
  tilesForSecretMarker,
  tryPushGraveSecret,
  tryRevealSecrets,
} from '@shared/owSecrets.js';
import { owBgTileSourceRect } from '@shared/owBgTiles.js';
import { trySpawnPassiveTileObject } from '@shared/passiveTileObjects.js';
import {
  createSwordState,
  isSwordActive,
  stepSword,
  swordDrawPos,
  swordSpawnsShot,
  tryStartSword,
} from '@shared/sword.js';
import { placeBomb, stepBomb } from '@shared/bomb.js';
import {
  OBJ,
  OW_ENEMY_BOUNDS,
  contactHalfHearts,
  createEnemy,
  ejectEnemiesFromSolid,
  enemyIsHidden,
  enemyTouchesLink,
  isBubbleType,
  spawnDeathSplits,
  spawnDungeonEnemies,
  spawnOverworldEnemies,
  stepEnemy,
  tryArrowHitEnemy,
  tryBeamOrRodHitEnemy,
  tryBombHitEnemy,
  tryBoomerangHitEnemy,
  tryFireHitEnemy,
  trySwordHitEnemy,
  wakeArmos,
} from '@shared/enemies.js';
import { trySpawnZora } from '@shared/zora.js';
import {
  findPondFairy,
  stepPondFairy,
} from '@shared/pondFairy.js';
import {
  clearGleeokHeads,
  spawnDigdoggerChildren,
  spawnGleeokHead,
} from '@shared/bossAi.js';
import {
  applyQuest2AttrsToPack,
  quest2NeedsLayoutOverlay,
} from '@shared/quest2OwPatch.js';
import {
  DROP_DAMAGE_BOMB,
  DROP_ITEM,
  createDropCounters,
  dropChrTile,
  dropPickupSfx,
  dropTouchesTaker,
  grantDroppedItem,
  isValidItemTaker,
  resetDropStreak,
  stepDroppedItemLifetime,
  stepFairy,
  tryCreateDropFromKill,
} from '@shared/enemyDrops.js';
import { itemDrawPalette } from '@shared/itemDrawPalette.js';
import { createByteRng } from '@shared/rng.js';
import {
  PROJ,
  SHIELD_RESULT,
  bounceProjectile,
  projectileTouchesLink,
  shootArrow,
  shootMagicRod,
  shootSwordBeam,
  shotBlockedByShield,
  stepProjectile,
  tryEnemyShoot,
} from '@shared/projectiles.js';
import {
  createRaftRide,
  stepRaftRide,
  tryStartRaftRide,
} from '@shared/raft.js';
import { bossRoarSfx, isBossType, isGanon, isGleeok, isZelda } from '@shared/bosses.js';
import {
  BOOM_PHASE,
  enemyBoomerangHitsLink,
  stepBoomerang,
  throwBoomerang,
} from '@shared/boomerang.js';
import {
  ARMOS_BRACELET_ITEM,
  ARMOS_FLOOR_TILE,
  applyArmosFloorReveal,
  restoreArmosReveals,
} from '@shared/armosSecrets.js';
import {
  ladderAllowsStanding,
  overworldTileOptsWithLadder,
  stepLadderObject,
  tryPlaceLadder,
} from '@shared/ladder.js';
import {
  dismissMoneyOrLifePerson,
  isPersonType,
  moneyOrLifeReady,
  tryPayMoneyOrLife,
} from '@shared/moneyOrLife.js';
import {
  bombUpgradePersonAlive,
  dismissBombUpgradePerson,
  isBombUpgradePerson,
  tryBuyBombUpgrade,
} from '@shared/bombUpgrade.js';
import { linesForUnderworldPerson } from '@shared/personText.js';
import { placeBait, stepBait } from '@shared/bait.js';
import { tryFeedGrumble } from '@shared/grumble.js';
import {
  TELEPORT_YS,
  canSummonWhirlwind,
  createWhirlwind,
  fluteActionForRoom,
  nextWhirlwindLevel,
  stepWhirlwind,
} from '@shared/whirlwind.js';
import { createStatueState, stepStatues } from '@shared/statues.js';
import { tryAddMonster, tryEdgeSpawn } from '@shared/spawn.js';
import {
  UW_PRIMARY_SQUARES,
  buildDungeonPlayGrid,
  checkDungeonRoomExit,
  clampUwDoorwayPos,
  createDoorState,
  doorwayLatchCleared,
  dungeonFloorRect,
  closeShutterBehind,
  dungeonPlayOrigin,
  dungeonRoomSpawn,
  dungeonTileOpts,
  enteringRoomGridOffset,
  entrySideForFacing,
  inDoorway,
  linkInDoorwayCorridor,
  nearDoorway,
  openRoomShutters,
  restoreClearedShutters,
  tryBombDoors,
} from '@shared/dungeonPlay.js';
import { finalizeLevelMeta, roomToTileGrid } from '@shared/dungeons.js';
import {
  createTriforceCeremony,
  startTriforceCeremony,
  stepTriforceCeremony,
  triforceCeremonyActive,
} from '@shared/triforceCeremony.js';
import {
  UW_TILE_SOURCES,
  renderDungeonRoomRgba,
  renderUwSquareRgba,
} from '@shared/dungeonRoomRender.js';
import {
  CELLAR_EXIT_MIN_Y,
  cellarEnterSpawn,
  cellarForStairsRoom,
  cellarReturnSpawn,
  checkCellarExit,
  checkUwStairsEntry,
  isCellarRoom,
} from '@shared/dungeonCellar.js';
import {
  BLOCK_STAIRS_POS,
  BLOCK_STAIRS_TILE,
  PUSH_STATE,
  createPushBlock,
  pushBlockSquareTiles,
  pushOpensShutters,
  pushSpawnsStairs,
  stepPushBlock,
} from '@shared/pushBlock.js';
import {
  FLAME_SLOTS,
  createCandleRoomState,
  createOwFlame,
  roomIsDark,
  stepOwFlame,
  tryUseCandle,
} from '@shared/candle.js';
import {
  SECRET,
  applyRoomClear,
  createRoomItem,
  itemPositionsFromLevel,
  persistsAfterRoomClear,
  roomAllDead,
  roomHasClearCountingType,
  roomItemChrTile,
  roomSecretEffect,
  syncRoomItemPosition,
  tryPickupRoomItem,
  tryRingleaderClear,
} from '@shared/roomSecrets.js';
import {
  applyLoadedSave,
  createSaveStore,
  dungeonProgressKey,
  incrementDeathCount,
  nameUnlocksSecondQuest,
  resetProfileToSecondQuest,
  resolveZeroHeartContinue,
} from '@shared/save.js';
import { createPracticeStore } from '@shared/practiceSave.js';
import { codeLabel, loadOptions, saveOptions } from '@shared/options.js';
import { createInput } from './input.js';
import { createLinkFrames } from './linkSprite.js';
import { createDeathUi } from './deathUi.js';
import { createEndingUi } from './endingUi.js';
import { createDemoUi } from './demoUi.js';
import { createNameEntryUi } from './nameEntryUi.js';
import { CONTINUE_HALF_HEARTS } from '@shared/continueMenu.js';
import { createItemSprites } from './itemSprites.js';
import { createEnemySprites } from './enemySprites.js';
import { enemySpriteOffset } from '@shared/bossSpriteLayouts.js';
import { createHud } from './hud.js';
import { createInventoryUi } from './inventoryUi.js';
import { createCaveScene } from './caveScene.js';
import { createPersonDialogue } from './personDialogue.js';
import { createAudio } from './audio.js';
import { createTitleUi } from './titleUi.js';
import { createOptionsUi } from './optionsUi.js';
import {
  CAVE_ENTER_SPAWN,
  CAVE_WARE_XS,
  CAVE_WARE_Y,
  caveWareSlots,
  checkCaveExit,
  createCaveTileGrid,
  wareUnderLink,
} from '@shared/caveRoom.js';

const INTERNAL_W = 256;
const INTERNAL_H = 240;
const TARGET_FPS = 60;
/** TakeItem hold in a cave/cellar (`ItemLiftTimer` = $80). */
const ITEM_LIFT_FRAMES = 0x80;

const stageEl = document.getElementById('stage');
const statusEl = document.getElementById('status');
const posEl = document.getElementById('posReadout');
const titleEl = document.querySelector('.toolbar h1');

function setStatus(text) {
  statusEl.textContent = text;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: ${res.status} — run: npm run extract -- overworld`);
  }
  return res.json();
}

function integerScale(viewW, viewH) {
  const sx = Math.floor(viewW / INTERNAL_W);
  const sy = Math.floor(viewH / INTERNAL_H);
  return Math.max(1, Math.min(sx, sy));
}

function screenUrl(mapIndex) {
  return `/play/screens/${mapIndex.toString(16).padStart(2, '0')}.json`;
}

function screenUrlQ2(mapIndex) {
  return `/play/q2/screens/${mapIndex.toString(16).padStart(2, '0')}.json`;
}

function bgUrl(mapIndex, quest = 1) {
  // Q2 layout rooms may ship an overlay PNG; fall back to Q1 art if missing.
  if (quest === 2 && quest2NeedsLayoutOverlay(mapIndex)) {
    return `/play/q2/screens/screen_${mapIndex.toString(16).padStart(2, '0')}.png`;
  }
  return `/overworld/screens/screen_${mapIndex.toString(16).padStart(2, '0')}.png`;
}

async function main() {
  const worldIndex = await fetchJson('/play/world_index.json');

  const app = new Application();
  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    background: '#000000',
    antialias: false,
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
  });
  app.canvas.style.imageRendering = 'pixelated';
  stageEl.appendChild(app.canvas);

  let options = loadOptions();
  function applyDisplayOptions() {
    const filter = options.filter === 'smooth' ? 'auto' : 'pixelated';
    app.canvas.style.imageRendering = filter;
    app.canvas.classList.toggle('smooth', options.filter === 'smooth');
    resizeCanvas();
  }

  function resizeCanvas() {
    const pad = 32;
    const availW = stageEl.clientWidth - pad;
    const availH = stageEl.clientHeight - pad;
    let scale;
    if (options.scale === 'auto') {
      scale = integerScale(availW, availH);
      app.canvas.style.maxWidth = '';
    } else {
      // Fixed scale must ignore CSS max-width or aspect ratio distorts.
      scale = Math.max(1, Math.min(6, Number(options.scale) || 1));
      app.canvas.style.maxWidth = 'none';
    }
    app.canvas.style.width = `${INTERNAL_W * scale}px`;
    app.canvas.style.height = `${INTERNAL_H * scale}px`;
  }
  applyDisplayOptions();
  window.addEventListener('resize', resizeCanvas);

  const sheetUrls = {
    common: '/graphics/common_sprites.png',
    misc: '/graphics/common_misc.png',
    commonBg: '/graphics/common_background.png',
    overworld: '/graphics/overworld_sprites.png',
    overworldBg: '/graphics/overworld_bg.png',
    uwCommon: '/graphics/underworld_sprites_common.png',
    // LevelPatternBlockSrcAddrs / BossPatternBlockSrcAddrs sets.
    uw127: '/graphics/underworld_sprites_127.png',
    uw358: '/graphics/underworld_sprites_358.png',
    uw469: '/graphics/underworld_sprites_469.png',
    boss1257: '/graphics/boss_sprites_1257.png',
    boss3468: '/graphics/boss_sprites_3468.png',
    boss9: '/graphics/boss_sprites_9.png',
    demoBg: '/graphics/demo_background.png',
    demoSprites: '/graphics/demo_sprites.png',
  };
  /** @type {Record<string, import('pixi.js').Texture>} */
  const sheetTextures = {};
  for (const [id, url] of Object.entries(sheetUrls)) {
    const tex = await Assets.load(url);
    tex.source.scaleMode = 'nearest';
    sheetTextures[id] = tex;
  }
  /** @type {{ paletteSets?: { id: string, rowsRgb: number[][][] }[] }} */
  let paletteDoc = { paletteSets: [] };
  try {
    paletteDoc = await (await fetch('/graphics/palettes.json')).json();
  } catch {
    console.warn('palettes.json missing — enemy colors stay on baked SP0');
  }
  const paletteById = new Map((paletteDoc.paletteSets ?? []).map((p) => [p.id, p]));
  const owPaletteSet = paletteById.get('overworld') ?? null;
  /** BG palette row 3 slot 3 — the overworld water colour ($12). */
  const OW_WATER_RGB = owPaletteSet?.rowsRgb?.[3]?.[3] ?? nesColor(0x12);
  const spriteTex = sheetTextures.common;
  const enemySprites = createEnemySprites(sheetTextures, owPaletteSet);
  const items = createItemSprites(spriteTex, {
    miscTexture: sheetTextures.misc,
    // Attract demo bank at PPU $70 — stepladder Anim_ItemFrameTiles $76.
    highSpriteTexture: sheetTextures.demoSprites ?? null,
    paletteSet: owPaletteSet,
  });

  /** UW CHR bins for runtime room composition (walls/doors). */
  /** @type {Map<string, Uint8Array>} */
  const uwPatternBins = new Map();
  for (const id of ['common_background', 'underworld_bg', 'common_misc']) {
    try {
      const buf = await (await fetch(`/graphics/${id}.bin`)).arrayBuffer();
      uwPatternBins.set(id, new Uint8Array(buf));
    } catch {
      console.warn(`Missing ${id}.bin — dungeon walls need: npm run extract -- graphics`);
    }
  }

  /**
   * Swap OW ↔ dungeon sprite palettes. Must detach every live sprite that
   * holds a cached enemy/item texture first — `setPaletteSet` destroys those
   * textures, and Pixi blacks the GL context if anything still samples them
   * (dungeon exit → overworld was the common trigger).
   */
  function applyEnemyPaletteForMode() {
    clearEnemies();
    clearFxLayer();
    bombs = [];
    flames = [];
    swordSprite.visible = false;
    swordSprite.texture = Texture.EMPTY;
    hud.releaseItemSprites();
    invUi.close();

    if (mode === 'dungeon' && dungeon?.level) {
      enemySprites.setDungeonLevel(dungeon.level);
      const set = paletteById.get(`level_${dungeon.level}`) ?? owPaletteSet;
      enemySprites.setPaletteSet(set);
      items.setPaletteSet(set);
      return;
    }
    enemySprites.setDungeonLevel(1);
    enemySprites.setPaletteSet(owPaletteSet);
    items.setPaletteSet(owPaletteSet);
  }

  function floorFrame() {
    return dungeonFloorRect(dungeonPlayOrigin());
  }

  /**
   * Paint walls + door faces + floor into roomSprite from ROM layout rules.
   * @param {object} room
   */
  function paintDungeonRoom(room) {
    const level = dungeon?.level ?? 1;
    const paletteSet = paletteById.get(`level_${level}`) ?? owPaletteSet;
    if (!paletteSet || uwPatternBins.size < 3) return null;
    try {
      const { width, height, rgba, tileGrid } = renderDungeonRoomRgba(room, {
        paletteSet,
        tileSources: UW_TILE_SOURCES,
        patternBins: uwPatternBins,
        primarySquares: UW_PRIMARY_SQUARES,
        doorState: dungeon?.doorState ?? null,
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      const tex = Texture.from(canvas);
      tex.source.scaleMode = 'nearest';
      return { tex, tileGrid, width, height };
    } catch (err) {
      console.error('paintDungeonRoom failed', room?.roomId, err);
      return null;
    }
  }

  function refreshDungeonRoomVisual() {
    if (mode !== 'dungeon' || !dungeon?.room || !roomSprite) return;
    const painted = paintDungeonRoom(dungeon.room);
    if (!painted) return;
    roomSprite.texture = painted.tex;
    dungeonTileGrid = painted.tileGrid;
    applyPushBlockRoomArt();
  }

  /** Build a 16×16 push-block texture from UW BG CHR ($B0). */
  function ensurePushBlockTexture() {
    if (pushBlockTex) return pushBlockTex;
    const level = dungeon?.level ?? 1;
    const paletteSet = paletteById.get(`level_${level}`) ?? owPaletteSet;
    if (!paletteSet || uwPatternBins.size < 3) return null;
    const inner = dungeon?.room?.doors?.innerPalette ?? 1;
    const { width, height, rgba } = renderUwSquareRgba(0xb0, {
      paletteSet,
      tileSources: UW_TILE_SOURCES,
      patternBins: uwPatternBins,
      paletteRow: inner,
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    pushBlockTex = Texture.from(canvas);
    pushBlockTex.source.scaleMode = 'nearest';
    return pushBlockTex;
  }

  /**
   * Patch a 16×16 UW square into the live room texture (play-area coords).
   * @param {number} px screen X
   * @param {number} py screen Y (includes HUD)
   * @param {number} primary CHR base
   */
  function patchRoomSquareAt(px, py, primary) {
    if (!roomSprite || !dungeon) return;
    const level = dungeon.level ?? 1;
    const paletteSet = paletteById.get(`level_${level}`) ?? owPaletteSet;
    if (!paletteSet || uwPatternBins.size < 3) return;
    const src = /** @type {HTMLCanvasElement | null} */ (roomSprite.texture.source.resource);
    if (!src || typeof src.getContext !== 'function') return;
    const ctx = src.getContext('2d');
    if (!ctx) return;
    const inner = dungeon.room?.doors?.innerPalette ?? 1;
    const { width, height, rgba } = renderUwSquareRgba(primary, {
      paletteSet,
      tileSources: UW_TILE_SOURCES,
      patternBins: uwPatternBins,
      paletteRow: inner,
    });
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), width, height),
      px - roomSprite.x,
      py - roomSprite.y,
    );
    roomSprite.texture.source.update?.();
  }

  /**
   * Write a full 2×2 UW square into collision grids (ChangeTileObjTiles).
   * @param {number} px
   * @param {number} py
   * @param {number} primary $B0 block or $74 floor
   */
  function setUwSquareAt(px, py, primary) {
    const [ul, ll, ur, lr] = pushBlockSquareTiles(primary);
    const tiles = [
      [ul, ur],
      [ll, lr],
    ];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const x = px + col * 8;
        const y = py + row * 8;
        const t = tiles[row][col];
        if (floorTiles) {
          const floor = floorFrame();
          const c = Math.floor((x - floor.x) / 8);
          const r = Math.floor((y - floor.y) / 8);
          if (floorTiles[r]) floorTiles[r][c] = t;
        }
        if (dungeonTileGrid) {
          const c = Math.floor(x / 8);
          const r = Math.floor((y - HUD_HEIGHT) / 8);
          if (dungeonTileGrid[r]) dungeonTileGrid[r][c] = t;
        }
      }
    }
  }

  /**
   * NES: idle uses baked room tiles; after a push, home is floor and dest is block.
   * While MOVING, home is already floor (collision) and the sprite draws the block.
   */
  function applyPushBlockRoomArt() {
    if (!pushBlock || !roomSprite) return;
    if (pushBlock.state === PUSH_STATE.DONE || pushBlock.complete) {
      patchRoomSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
      patchRoomSquareAt(pushBlock.x, pushBlock.y, 0xb0);
    } else if (pushBlock.state === PUSH_STATE.MOVING) {
      patchRoomSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
    }
    // IDLE: leave baked $B0 at home — no overlay until the push starts.
  }

  const world = new Container();
  app.stage.addChild(world);

  /** Covers room floor in dark UW rooms until candle is used (this stay). */
  const darkOverlay = new Graphics();
  darkOverlay.visible = false;
  world.addChild(darkOverlay);
  /** White palette-row flash for the triforce fanfare (GameMode $12). */
  const flashOverlay = new Graphics();
  flashOverlay.visible = false;
  world.addChild(flashOverlay);

  const enemyLayer = new Container();
  world.addChild(enemyLayer);

  const itemLayer = new Container();
  world.addChild(itemLayer);

  const fxLayer = new Container();
  world.addChild(fxLayer);

  const hud = createHud({
    items,
    commonBg: sheetTextures.commonBg,
    misc: sheetTextures.misc,
  });

  const invUi = createInventoryUi({
    items,
    commonBg: sheetTextures.commonBg,
    overworldBg: sheetTextures.overworldBg,
  });
  // Inventory under the HUD in z-order so the docked status bar stays on top.
  app.stage.addChild(invUi.root);
  app.stage.addChild(hud.root);

  /** @type {object | null} */
  let endingData = null;
  try {
    endingData = await fetchJson('/play/ending.json');
  } catch {
    console.warn('ending.json missing — run: npm run extract -- ending');
  }
  /** @type {object | null} */
  let demoData = null;
  try {
    demoData = await fetchJson('/play/demo.json');
  } catch {
    console.warn('demo.json missing — run: npm run extract -- demo');
  }

  const nameEntryUi = createNameEntryUi({
    commonBg: sheetTextures.commonBg,
    misc: sheetTextures.misc,
    items,
    playSfx: (name) => audio?.playSfx(name),
  });
  app.stage.addChild(nameEntryUi.root);

  const titleUi = createTitleUi({ nameEntry: nameEntryUi });
  app.stage.addChild(titleUi.root);

  /** @type {import('pixi.js').Texture | null} */
  let titleBgTex = null;
  /** @type {import('pixi.js').Texture | null} */
  let storyBgTex = null;
  try {
    titleBgTex = await Assets.load('/play/title.png');
    titleBgTex.source.scaleMode = 'nearest';
  } catch {
    console.warn('play/title.png missing — run: npm run extract -- demo');
  }
  try {
    storyBgTex = await Assets.load('/play/story.png');
    storyBgTex.source.scaleMode = 'nearest';
  } catch {
    console.warn('play/story.png missing — run: npm run extract -- demo');
  }

  const demoUi = createDemoUi({
    demoSprites: sheetTextures.demoSprites ?? null,
    titleBg: titleBgTex,
    storyBg: storyBgTex,
    items,
    data: demoData,
    commonBg: sheetTextures.commonBg,
  });
  app.stage.addChild(demoUi.root);

  /** @type {object[]} */
  let caveTable = [];
  /** @type {Record<string, string[]>} */
  let caveTextLines = {};
  try {
    const cavesPack = await fetchJson('/tables/caves.json');
    caveTable = cavesPack.caves ?? [];
    caveTextLines = cavesPack.textLines ?? {};
  } catch {
    setStatus('Missing caves.json — run: npm run extract -- caves');
  }

  /** @type {ReturnType<typeof createAudio> | null} */
  let audio = null;
  try {
    const audioPack = await fetchJson('/audio/audio.json');
    audio = createAudio(audioPack);
  } catch {
    console.warn('Missing audio.json — run: npm run extract -- audio');
  }

  function musicForMode() {
    if (!audio) return;
    if (!playing || titleUi.visible) {
      audio.playMusic('title');
      return;
    }
    if (mode === 'dungeon') {
      audio.playMusic(dungeon?.level === 9 ? 'level9' : 'underworld');
    } else {
      audio.playMusic('overworld');
    }
  }

  // Unlock AudioContext on first input (browser autoplay policy).
  const unlockAudio = () => {
    void audio?.unlock().then(() => musicForMode());
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  window.addEventListener('keydown', (e) => {
    if (!audio) return;
    if (e.code === 'KeyM') {
      audio.setMuted(!audio.isMuted());
      setStatus(audio.isMuted() ? 'Audio muted (M)' : 'Audio on (M)');
    } else if (e.code === 'Comma') {
      audio.setVolume(audio.getVolume() - 0.1);
      setStatus(`Volume ${Math.round(audio.getVolume() * 100)}%`);
    } else if (e.code === 'Period') {
      audio.setVolume(audio.getVolume() + 0.1);
      setStatus(`Volume ${Math.round(audio.getVolume() * 100)}%`);
    }
  });
  /** @type {Set<string>} */
  const caveTaken = new Set();
  /** @type {Set<string>} */
  const owSecretsRevealed = new Set();
  /** @type {Map<string, number>} */
  const gravePushHold = new Map();
  const raftRide = createRaftRide();
  /** @type {import('pixi.js').Container | null} */
  let raftGfx = null;
  /** @type {import('pixi.js').Graphics | null} */
  let ladderGfx = null;
  /** @type {import('@shared/ladder.js').LadderObject | null} */
  let ladderObj = null;
  /** Per-level dungeon progress (survives exit / reload). */
  /** @type {Map<number, object>} */
  const dungeonProgress = new Map();
  const saveStore = createSaveStore();
  const practiceStore = createPracticeStore();
  /** @type {number | null} */
  let activeSlot = null;
  let saveName = 'LINK';
  /** Per-profile `DeathCounts` for the active slot. */
  let deathCount = 0;
  /** `MazeStep` — global across screens, reset by any non-maze transition. */
  const mazeState = createMazeState();
  /** `RupeesToAdd` / `RupeesToSubtract` status-bar spin. */
  const rupeeRoll = createRupeeRoll();
  /** Recorder pond drain (`SecretColorCycle`) — per screen. */
  let pondSecret = createPondSecret();
  /** Live RGB of BG palette row 3 slot 3 (the water colour) on this screen. */
  let owWaterRgb = OW_WATER_RGB;
  /** NES `FrameCounter` — free-running, drives phase-gated animations. */
  let frameCounter = 0;
  /** Mode `$11` owns Link's visibility while the death sequence plays. */
  let deathLinkVisible = false;
  let playing = false;
  let lastAutosave = 0;
  /** Candle / book fires — NES uses object slots $10 and $11.
   * @type {ReturnType<typeof createOwFlame>[]} */
  let flames = [];
  /** @type {ReturnType<typeof createWhirlwind> | null} */
  let whirlwind = null;
  /** Last whirlwind dungeon level (0 = none). */
  let lastWhirlwindLevel = 0;
  /** @type {ReturnType<typeof createStatueState> | null} */
  let statueState = null;
  /** @type {import('pixi.js').Graphics | null} */
  let whirlGfx = null;

  const NO_DEATH_INPUT = Object.freeze({ select: false, start: false });
  const deathUi = createDeathUi({
    commonBg: sheetTextures.commonBg,
    deathFadeRgb: owPaletteSet?.deathFadeRgb ?? null,
  });
  app.stage.addChild(deathUi.root);

  const endingUi = createEndingUi({
    commonBg: sheetTextures.commonBg,
    items,
    data: endingData,
  });
  app.stage.addChild(endingUi.root);

  /** Quest just finished (drives the post-ending profile switch). */
  let questCompleted = 0;
  /** Pre-rolled money-game amounts for the open cave (null when not gambling). */
  /** @type {number[] | null} */
  let gambleAmounts = null;

  /** @type {Sprite | null} */
  let bg = null;
  /** @type {Sprite | null} */
  let roomSprite = null;
  /** Adjacent screen/room sprite shown during ScrollWorld. */
  /** @type {Sprite | null} */
  let nextBg = null;
  let nextBgBaseX = 0;
  let nextBgBaseY = 0;
  const screenScroll = createScreenScroll();
  /** True while prefetching the next screen texture before scroll starts. */
  let scrollLoading = false;
  /** @type {Text | null} */
  let stubLabel = null;

  const frames = createLinkFrames(spriteTex);

  /**
   * Weapon shots use Anim_ItemFrameTiles + facing; rocks/fireballs stay on enemy CHR.
   * @param {import('@shared/projectiles.js').Projectile} p
   */
  function textureForProjectile(p) {
    if (p.kind === PROJ.SWORD_SHOT) return items.swordTexture(p.dir, inv.sword);
    if (p.kind === PROJ.MAGIC_SHOT) return items.magicShotTexture(p.dir);
    if (p.kind === PROJ.ARROW || p.kind === PROJ.SILVER_ARROW) {
      return items.arrowTexture(p.dir);
    }
    return enemySprites.textureForProjectile(p, mode);
  }

  const caveScene = createCaveScene({
    spriteTex,
    items,
    enemySprites,
    commonBg: sheetTextures.commonBg,
  });
  // Behind Link in the world layer so the player stands in the cave.
  world.addChildAt(caveScene.root, 0);
  const personDialogue = createPersonDialogue({
    commonBg: sheetTextures.commonBg,
  });
  world.addChild(personDialogue.root);
  const link = createLinkState(worldIndex.startX, worldIndex.startY, worldIndex.startDir);

  // Sword under Link (NES draws the blade behind the body for most of the swing).
  const swordSprite = new Sprite(items.swordTexture(DIR.UP, SWORD.WOOD));
  swordSprite.visible = false;
  world.addChild(swordSprite);

  /** Debug: solid UW tiles + look-ahead sample (enabled with ?debug=1 / ?coll=1). */
  const collDebugGfx = new Graphics();
  collDebugGfx.visible = false;
  world.addChild(collDebugGfx);

  const linkSprite = new Sprite(frames.textureFor(link.dir, link.animFrame));
  world.addChild(linkSprite);

  const input = createInput(options.binds);
  const inv = createInventory();
  const urlParams = new URLSearchParams(window.location.search);
  const debugCollision = urlParams.get('debug') === '1' || urlParams.get('coll') === '1';
  const skipTitle =
    urlParams.get('skipTitle') === '1'
    || urlParams.get('slot') != null
    || urlParams.get('debug') === '1';

  function applyDebugKit() {
    if (urlParams.get('quest') === '2') inv.quest = 2;
    if (urlParams.get('debug') !== '1') return;
    inv.sword = 1;
    inv.bombs = 8;
    inv.keys = 8;
    inv.bow = 1;
    inv.arrow = 2;
    inv.raft = 1;
    inv.ladder = 1;
    inv.candle = 1;
    inv.boomerang = 1;
    inv.food = 1;
    inv.triforce = 0xff;
    inv.selectedB = B_ITEM.BOW;
    inv.maxHalfHearts = 16;
    inv.halfHearts = 16;
  }

  function invView() {
    return {
      dungeon,
      owRoomId:
        mode === 'cave'
          ? caveReturn.roomId
          : mode === 'overworld'
            ? roomId
            : dungeon?.fromRoomId ?? roomId,
    };
  }

  function refreshHelpKeys() {
    const help = document.getElementById('helpKeys');
    if (!help) return;
    const b = options.binds;
    const move = [...b.up, ...b.down, ...b.left, ...b.right]
      .slice(0, 4)
      .map(codeLabel)
      .join('/');
    help.textContent = `${move} move · ${b.a.map(codeLabel).join('/')} sword · ${b.b
      .map(codeLabel)
      .join('/')} B-item · ${b.start.map(codeLabel).slice(0, 2).join('/')} inv · M mute · ,/. volume`;
  }

  function snapshotDungeonProgress() {
    if (!dungeon) return;
    const key = dungeonProgressKey(inv.quest, dungeon.level);
    dungeonProgress.set(key, {
      cleared: new Set(dungeon.clearedRooms),
      taken: new Set(dungeon.takenItems),
      visited: new Set(dungeon.visitedRooms),
      pushed: new Set(dungeon.pushedRooms),
      doors: new Set(dungeon.doorState.open),
      lastBoss: Boolean(dungeon.lastBossDefeated),
      map: inv.map,
      compass: inv.compass,
    });
  }

  function savePracticeState() {
    if (!playing) {
      setStatus('Start a game before practice save');
      return;
    }
    practiceStore.save(collectSaveState());
    setStatus('Practice state saved (F5) — not a file slot');
  }

  async function loadPracticeState() {
    const payload = practiceStore.load();
    if (!payload) {
      setStatus('No practice state (F5 to save)');
      return;
    }
    caveTaken.clear();
    owSecretsRevealed.clear();
    dungeonProgress.clear();
    Object.assign(inv, createInventory());
    const meta = applyLoadedSave(payload, {
      inv,
      owSecretsRevealed,
      caveTaken,
      dungeonProgress,
    });
    saveName = meta.name ?? saveName;
    titleUi.hide();
    playing = false;
    endingUi.hide();
    deathUi.hide();
    dungeon = null;
    const healed = await restoreWorldFromSave(meta.position);
    playing = true;
    setStatus(healed ? 'Practice load — 0 HP, reset to start' : 'Practice state loaded (F9)');
  }

  /**
   * Place Link from a save position. Zero hearts → full heal + entrance/start.
   * @param {object} rawPosition
   * @returns {Promise<boolean>} true if zero-heart recovery ran
   */
  async function restoreWorldFromSave(rawPosition) {
    const owStart = {
      roomId: worldIndex.startScreen,
      x: worldIndex.startX,
      y: worldIndex.startY,
      dir: worldIndex.startDir,
    };
    const { healed, position: pos, atDungeonEntrance } = resolveZeroHeartContinue(
      inv,
      rawPosition,
      owStart,
    );
    deathUi.hide();
    if (pos.mode === 'dungeon' && pos.dungeon) {
      await loadOverworldScreen(pos.dungeon.fromRoomId ?? owStart.roomId, {
        x: owStart.x,
        y: owStart.y,
        dir: owStart.dir,
      });
      await enterLevel(pos.dungeon.level, {
        fromRoomId: pos.dungeon.fromRoomId,
        fromAttrs: screen?.attrs ?? {},
        roomId: atDungeonEntrance ? undefined : pos.dungeon.roomId,
        fromDir: DIR.UP,
        spawnOverride: atDungeonEntrance
          ? null
          : { x: pos.x, y: pos.y, dir: pos.dir ?? DIR.UP },
      });
    } else if (!healed && pos.mode === 'cave' && pos.caveReturn) {
      caveReturn = { ...pos.caveReturn };
      await loadOverworldScreen(pos.caveReturn.roomId, {
        x: pos.caveReturn.x,
        y: pos.caveReturn.y,
        dir: pos.caveReturn.dir,
      });
      inv.map = 0;
      inv.compass = 0;
    } else {
      await loadOverworldScreen(pos.roomId ?? owStart.roomId, {
        x: pos.x ?? owStart.x,
        y: pos.y ?? owStart.y,
        dir: pos.dir ?? owStart.dir,
      });
      inv.map = 0;
      inv.compass = 0;
    }
    return healed;
  }

  function collectSaveState() {
    snapshotDungeonProgress();
    return {
      name: saveName,
      deaths: deathCount,
      inv,
      mode,
      roomId,
      x: link.x,
      y: link.y,
      dir: link.dir,
      caveReturn,
      dungeon:
        mode === 'dungeon' && dungeon
          ? {
              level: dungeon.level,
              fromRoomId: dungeon.fromRoomId,
              roomId: dungeon.room?.roomId ?? roomId,
            }
          : null,
      owSecretsRevealed,
      caveTaken,
      dungeonProgress,
    };
  }

  function persistSave(reason = '') {
    if (activeSlot == null || !playing) return;
    saveStore.save(activeSlot, collectSaveState());
    lastAutosave = performance.now();
    if (reason) setStatus(`Saved (${reason})`);
  }

  function setOptions(next) {
    options = next;
    input.setBinds(options.binds);
    applyDisplayOptions();
    refreshHelpKeys();
  }

  const optionsUi = createOptionsUi({
    getOptions: () => options,
    setOptions,
    onClose: () => {},
  });
  document.getElementById('btn-options')?.addEventListener('click', () => {
    optionsUi.open();
  });
  refreshHelpKeys();
  const sword = createSwordState();
  /** @type {import('@shared/bomb.js').Bomb[]} */
  let bombs = [];
  /** @type {import('@shared/enemies.js').Enemy[]} */
  let enemies = [];
  /** @type {import('@shared/projectiles.js').Projectile[]} */
  let projectiles = [];
  /** @type {import('@shared/enemyDrops.js').DroppedItem[]} */
  let drops = [];
  const dropCounters = createDropCounters();
  const dropRng = createByteRng(0x21d7);
  let dropFrame = 0;
  /** Frames remaining where Digdogger hears the flute. */
  let flutePulse = 0;
  /** @type {Map<number, Sprite>} */
  const dropGfx = new Map();
  /** Pond-fairy orbit hearts (UpdatePondFairy). */
  /** @type {Sprite[]} */
  let pondHeartGfx = [];
  /** Link halted by pond fairy heal sequence (ObjState $40). */
  let pondFairyHalt = false;
  let dropSpriteSeq = 0;
  /** @type {import('@shared/boomerang.js').Boomerang | null} */
  let boomerang = null;
  /** @type {import('@shared/boomerang.js').Boomerang[]} */
  let enemyBooms = [];
  /** @type {import('@shared/bait.js').Bait | null} */
  let bait = null;
  /** @type {Graphics | null} */
  let boomGfx = null;
  /** @type {Graphics | null} */
  let baitGfx = null;
  /** @type {number[][] | null} */
  let dungeonTileGrid = null;
  /** @type {ReturnType<typeof createRoomItem>} */
  let roomItem = null;
  /** @type {Map<number, Sprite>} */
  const enemyGfx = new Map();
  /** @type {Map<number, Sprite>} */
  const projGfx = new Map();
  /** @type {Sprite | null} */
  let roomItemSprite = null;
  /** @type {Sprite | null} */
  let liftSprite = null;
  const triforceCeremony = createTriforceCeremony();
  /** Item type currently held overhead during a cave/cellar TakeItem. */
  let liftItemType = /** @type {number | null} */ (null);

  /** @type {'overworld' | 'dungeon' | 'cave'} */
  let mode = 'overworld';
  let roomId = worldIndex.startScreen;
  /** Saved OW pose while inside a cave. */
  let caveReturn = { roomId: worldIndex.startScreen, x: 0x78, y: 0x8d, dir: DIR.DOWN };
  /** @type {number[][] | null} */
  let caveTileGrid = null;
  /** Last cave interact target key (`${caveId}:${slot}` | `'npc'` | false). */
  let caveInteractLatch = /** @type {string | false} */ (false);
  let caveExitLatch = false;
  /** @type {{ mapIndex: number, attrs: object, tileGrid: number[][], layoutId?: number } | null} */
  let screen = null;
  /** @type {{
   *   level: number,
   *   fromRoomId: number,
   *   fromAttrs: object,
   *   levelData: object,
   *   room: object,
   *   doorState: ReturnType<typeof createDoorState>,
   *   clearedRooms: Set<number>,
   *   takenItems: Set<number>,
   *   visitedRooms: Set<number>,
   *   pushedRooms: Set<number>,
   * } | null} */
  let dungeon = null;
  /** @type {import('@shared/pushBlock.js').PushBlock | null} */
  let pushBlock = null;
  /** @type {number[][] | null} */
  let floorTiles = null;
  /** @type {Sprite | null} */
  let pushGfx = null;
  /** @type {Texture | null} */
  let pushBlockTex = null;
  let candleRoom = createCandleRoomState();
  let busy = false;
  /** Prevents re-firing cave entry every frame while standing on a warp. */
  let caveLatch = false;
  /**
   * `UndergroundExitType` — nonzero from the moment Link steps out of a cave,
   * cellar, or dungeon until he completes a whole tile step. `CheckWarps`
   * (`Z_05.asm:7247`) refuses to fire while it is set, so you cannot fall
   * straight back down the stairs you just came up.
   */
  let undergroundExitType = 0;
  /** Prevents re-triggering UW stairs while still standing on them. */
  let stairsLatch = false;
  let roomClearedLatch = false;

  function clearEnemies() {
    for (const g of enemyGfx.values()) {
      enemyLayer.removeChild(g);
      g.destroy({ texture: false, textureSource: false });
    }
    enemyGfx.clear();
    enemies = [];
    for (const g of projGfx.values()) {
      enemyLayer.removeChild(g);
      g.destroy({ texture: false, textureSource: false });
    }
    projGfx.clear();
    projectiles = [];
    drops = [];
    for (const g of dropGfx.values()) {
      itemLayer.removeChild(g);
      g.destroy({ texture: false, textureSource: false });
    }
    dropGfx.clear();
    clearPondHeartSprites();
    pondFairyHalt = false;
    inv.clock = 0; // InvClock clears on room / screen change
    if (roomItemSprite) {
      itemLayer.removeChild(roomItemSprite);
      roomItemSprite.destroy({ texture: false, textureSource: false });
      roomItemSprite = null;
    }
    roomItem = null;
    roomClearedLatch = false;
    boomerang = null;
    enemyBooms = [];
    bait = null;
    dungeonTileGrid = null;
    floorTiles = null;
    pushBlock = null;
    statueState = null;
    if (boomGfx) boomGfx.visible = false;
    if (baitGfx) baitGfx.visible = false;
    if (pushGfx) pushGfx.visible = false;
  }

  function syncEnemySprites() {
    for (const e of enemies) {
      let g = enemyGfx.get(e.id);
      if (!e.alive) {
        if (g) {
          enemyLayer.removeChild(g);
          g.destroy({ texture: false, textureSource: false });
          enemyGfx.delete(e.id);
        }
        continue;
      }
      const tex = enemySprites.textureForEnemy(e, mode);
      if (!g) {
        g = new Sprite(tex ?? Texture.EMPTY);
        enemyLayer.addChild(g);
        enemyGfx.set(e.id, g);
      } else if (tex) {
        g.texture = tex;
      }
      const off = enemySpriteOffset(e.objType);
      g.x = e.x + off.x;
      g.y = e.y + off.y;
      if ((e.spawnCloud ?? 0) > 0) {
        e.spawnCloud -= 1;
        g.texture = items.cloudTexture();
        g.visible = !e.edgePending;
        g.alpha = 1;
        continue;
      }
      g.visible = !e.edgePending && !enemyIsHidden(e);
      if (e.stunTimer > 0) g.alpha = 0.55;
      else if (e.invuln > 0 && (e.invuln & 2)) g.alpha = 0.4;
      else g.alpha = 1;
    }

    for (const p of projectiles) {
      let g = projGfx.get(p.id);
      if (!p.alive) {
        if (g) {
          enemyLayer.removeChild(g);
          g.destroy({ texture: false, textureSource: false });
          projGfx.delete(p.id);
        }
        continue;
      }
      const tex = textureForProjectile(p);
      if (!g) {
        g = new Sprite(tex);
        enemyLayer.addChild(g);
        projGfx.set(p.id, g);
      } else {
        g.texture = tex;
      }
      // Narrow 8×16 is centered (+4); horizontal 16×8 sits at ObjX.
      // Sword/magic horizontal: NES nudges Y +3 (DrawSwordShotOrMagicShot).
      const horiz = items.weaponTextureHorizontal(p.dir);
      const weaponShot =
        p.kind === PROJ.SWORD_SHOT
        || p.kind === PROJ.MAGIC_SHOT
        || p.kind === PROJ.ARROW
        || p.kind === PROJ.SILVER_ARROW;
      g.x = p.x + (weaponShot && !horiz ? 4 : 0);
      g.y = p.y + (weaponShot && horiz ? 3 : 0);
      // Sword beam flashes palette rows (FrameCounter & 3).
      if (p.kind === PROJ.SWORD_SHOT) {
        g.alpha = 0.65 + 0.35 * (((p.life >> 1) & 3) / 3);
      } else {
        g.alpha = 1;
      }
    }

    // Drop stale projectile sprites.
    for (const [id, g] of [...projGfx.entries()]) {
      if (!projectiles.some((p) => p.id === id && p.alive)) {
        enemyLayer.removeChild(g);
        g.destroy({ texture: false, textureSource: false });
        projGfx.delete(id);
      }
    }

    syncRoomItemSprite();
  }

  function syncRoomItemSprite() {
    if (!roomItem || roomItem.taken || !roomItem.visible) {
      if (roomItemSprite) {
        itemLayer.removeChild(roomItemSprite);
        roomItemSprite.destroy({ texture: false, textureSource: false });
        roomItemSprite = null;
      }
      return;
    }
    const pal = itemDrawPalette(roomItem.itemType, dropFrame);
    const drawn = items.itemTexture(roomItemChrTile(roomItem.itemType), pal);
    if (!roomItemSprite) {
      roomItemSprite = new Sprite(drawn.texture);
      itemLayer.addChild(roomItemSprite);
    } else {
      roomItemSprite.texture = drawn.texture;
    }
    // Narrow items are centered in the 16px slot (+4); wide pairs start at ObjX.
    roomItemSprite.x = roomItem.x + (drawn.narrow ? 4 : 0);
    roomItemSprite.y = roomItem.y;
  }

  /** Begin the cave/cellar TakeItem pose: item held $10 px above Link. */
  function startItemLift(itemType) {
    liftItemType = itemType;
    syncItemLiftSprite();
  }

  function syncItemLiftSprite() {
    const active = liftItemType != null && (inv.itemLiftTimer ?? 0) > 0;
    if (!active) {
      if (liftSprite) {
        itemLayer.removeChild(liftSprite);
        liftSprite.destroy({ texture: false, textureSource: false });
        liftSprite = null;
      }
      liftItemType = null;
      return;
    }
    const drawn = items.itemTexture(
      roomItemChrTile(liftItemType),
      itemDrawPalette(liftItemType, dropFrame),
    );
    if (!liftSprite) {
      liftSprite = new Sprite(drawn.texture);
      itemLayer.addChild(liftSprite);
    } else {
      liftSprite.texture = drawn.texture;
    }
    liftSprite.x = link.x + (drawn.narrow ? 4 : 0);
    liftSprite.y = link.y - 0x10;
  }

  function enemyBounds() {
    if (mode === 'dungeon' && roomSprite) {
      const floor = floorFrame();
      return {
        minX: floor.x + 8,
        maxX: floor.x + floor.w - 24,
        minY: floor.y + 8,
        maxY: floor.y + floor.h - 24,
      };
    }
    return OW_ENEMY_BOUNDS;
  }

  function clearFxLayer() {
    for (const child of fxLayer.removeChildren()) {
      child.destroy({ texture: false, textureSource: false });
    }
  }

  function drawBombs() {
    clearFxLayer();
    // Keep FX above the background after screen loads.
    if (fxLayer.parent === world) {
      world.setChildIndex(fxLayer, Math.max(0, world.children.length - 3));
    }
    for (const b of bombs) {
      if (b.phase === 'done') continue;
      if (b.phase === 'fuse') {
        const s = new Sprite(items.bombTexture());
        s.x = b.x;
        s.y = b.y;
        fxLayer.addChild(s);
      } else {
        for (const [dx, dy] of [
          [0, 0],
          [-12, -8],
          [10, -6],
          [-8, 10],
          [12, 8],
        ]) {
          const s = new Sprite(items.cloudTexture());
          s.x = b.x + dx;
          s.y = b.y + dy;
          fxLayer.addChild(s);
        }
      }
    }
    for (const f of flames) {
      if (!f.alive) continue;
      const flame = new Graphics().circle(8, 8, 5).fill(0xff6622);
      flame.x = f.x;
      flame.y = f.y;
      fxLayer.addChild(flame);
    }
  }

  function tickBombs() {
    // Dodongo eats during fuse (state $12) before the blast.
    for (const b of bombs) {
      if (b.phase !== 'fuse') continue;
      for (const e of enemies) {
        const wasAlive = e.alive;
        tryBombHitEnemy(e, b, { enemies });
        if (wasAlive && !e.alive) onEnemyKilled(e, DROP_DAMAGE_BOMB);
      }
    }
    bombs = bombs.map(stepBomb).filter((b) => b.phase !== 'done');
    for (const b of bombs) {
      if (b.phase === 'explode' && !b.damaged) {
        b.damaged = true;
        audio?.playSfx('bomb');
        for (const e of enemies) {
          const wasAlive = e.alive;
          tryBombHitEnemy(e, b, { enemies });
          if (wasAlive && !e.alive) onEnemyKilled(e, DROP_DAMAGE_BOMB);
        }
        if (mode === 'dungeon' && dungeon?.room) {
          const floor = floorFrame();
          const opened = tryBombDoors(
            dungeon.doorState,
            dungeon.room,
            b,
            { x: floor.x, y: floor.y },
            { w: floor.w, h: floor.h },
          );
          if (opened.length) {
            refreshDungeonRoomVisual();
            audio?.playSfx('door');
            setStatus(`Bombed ${opened.join('/')} wall open`);
          }
        }
        if (mode === 'overworld') {
          applyOwSecretReveal('bomb', b.x, b.y);
        }
      }
    }
  }

  function drawSwordBlade() {
    const pos = swordDrawPos(sword, link.x, link.y);
    if (!pos) {
      swordSprite.visible = false;
      return;
    }
    swordSprite.texture = items.swordTexture(pos.dir, inv.sword);
    swordSprite.visible = true;
    // Narrow items are centered (+4) in NES; our textures are 8×16 or 16×8.
    if (pos.dir & (DIR.LEFT | DIR.RIGHT)) {
      swordSprite.x = pos.x;
      swordSprite.y = pos.y + (mode === 'overworld' ? 2 : 0);
    } else {
      swordSprite.x = pos.x + 4;
      swordSprite.y = pos.y + (mode === 'overworld' ? 2 : 0);
    }
  }

  function continueAfterDeath() {
    inv.dead = false;
    inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
    inv.invuln = 0;
    inv.shovePixels = 0;
    deathUi.hide();

    // NES: die in a dungeon → continue at that dungeon's entrance; OW → start screen.
    if (mode === 'dungeon' && dungeon) {
      snapshotDungeonProgress();
      const levelId = dungeon.level;
      const fromRoomId = dungeon.fromRoomId;
      const fromAttrs = dungeon.fromAttrs ?? {};
      void (async () => {
        await enterLevel(levelId, { fromRoomId, fromAttrs });
        persistSave('continue');
        setStatus(`Continue — Level ${levelId} entrance`);
      })();
      return;
    }

    inv.map = 0;
    inv.compass = 0;
    dungeon = null;
    void loadOverworldScreen(worldIndex.startScreen, {
      x: worldIndex.startX,
      y: worldIndex.startY,
      dir: worldIndex.startDir,
    });
    audio?.playMusic('overworld');
    persistSave('continue');
    setStatus('Continue — back at start');
  }

  function destroyNextBg() {
    if (!nextBg) return;
    world.removeChild(nextBg);
    nextBg.destroy({ texture: false, textureSource: false });
    nextBg = null;
  }

  function cancelScreenScroll() {
    screenScroll.active = false;
    scrollLoading = false;
    destroyNextBg();
  }

  /**
   * Place nextBg adjacent to the current play-area sprite for dir.
   * @param {Sprite} sprite
   * @param {number} dir
   * @param {number} baseX
   * @param {number} baseY
   */
  function placeNextBgAdjacent(sprite, dir, baseX, baseY) {
    nextBgBaseX = baseX;
    nextBgBaseY = baseY;
    if (dir & DIR.RIGHT) nextBgBaseX = baseX + PLAY_W;
    else if (dir & DIR.LEFT) nextBgBaseX = baseX - PLAY_W;
    else if (dir & DIR.DOWN) nextBgBaseY = baseY + PLAY_H;
    else if (dir & DIR.UP) nextBgBaseY = baseY - PLAY_H;
    sprite.x = nextBgBaseX;
    sprite.y = nextBgBaseY;
  }

  function applyScrollVisuals(offsetX, offsetY) {
    if (mode === 'overworld' && bg) {
      bg.x = offsetX;
      bg.y = HUD_HEIGHT + offsetY;
    } else if (mode === 'dungeon' && roomSprite) {
      const play = dungeonPlayOrigin();
      roomSprite.x = play.x + offsetX;
      roomSprite.y = play.y + offsetY;
    }
    if (nextBg) {
      nextBg.x = nextBgBaseX + offsetX;
      nextBg.y = nextBgBaseY + offsetY;
    }
  }

  function stepActiveScreenScroll() {
    const r = stepScreenScroll(screenScroll);
    applyScrollVisuals(r.offsetX, r.offsetY);
    link.x += r.linkDX;
    link.y += r.linkDY;
    if (!r.done) return;
    if (mode === 'dungeon') {
      void finishDungeonScroll();
    } else {
      void finishOverworldScroll();
    }
  }

  async function finishOverworldScroll() {
    const nextRoomId = screenScroll.nextRoomId;
    const spawn = screenScroll.spawn ?? {
      x: link.x,
      y: link.y,
      dir: link.dir,
    };
    destroyNextBg();
    if (bg) {
      bg.x = 0;
      bg.y = HUD_HEIGHT;
    }
    await loadOverworldScreen(nextRoomId, {
      x: spawn.x,
      y: spawn.y,
      dir: spawn.dir,
    });
  }

  async function finishDungeonScroll() {
    const nextRoomId = screenScroll.nextRoomId;
    const fromDir = screenScroll.dir;
    destroyNextBg();
    if (roomSprite) {
      const play = dungeonPlayOrigin();
      roomSprite.x = play.x;
      roomSprite.y = play.y;
    }
    await loadDungeonRoom(nextRoomId, fromDir);
  }

  /**
   * Prefetch next OW screen and begin ScrollWorld (maze may target same room).
   * @param {{ nextRoomId: number, dir: number, x: number, y: number }} transition
   * @param {{ allowExit: boolean, playSecretTune: boolean }} maze
   */
  async function beginOverworldScroll(transition, maze) {
    if (
      scrollLoading
      || isScrolling(screenScroll)
      || busy
      || raftRide.active
      || whirlwind?.alive
      || inv.dead
      || endingUi.visible
    ) {
      return;
    }
    const nextRoomId = maze.allowExit ? transition.nextRoomId : roomId;
    const spawn = {
      x: transition.x,
      y: transition.y,
      dir: transition.dir,
    };
    scrollLoading = true;
    clearEnemies();
    bombs = [];
    try {
      let tex;
      try {
        tex = await Assets.load(bgUrl(nextRoomId, inv.quest));
      } catch {
        tex = await Assets.load(bgUrl(nextRoomId, 1));
      }
      tex.source.scaleMode = 'nearest';
      // Re-check after await — raft / death / another load may have started.
      if (busy || raftRide.active || inv.dead || whirlwind?.alive || mode !== 'overworld') {
        destroyNextBg();
        return;
      }

      destroyNextBg();
      if (bg) {
        bg.x = 0;
        bg.y = HUD_HEIGHT;
      }
      nextBg = new Sprite(tex);
      placeNextBgAdjacent(nextBg, transition.dir, 0, HUD_HEIGHT);
      const bgIndex = bg ? world.getChildIndex(bg) : 0;
      world.addChildAt(nextBg, bgIndex + 1);

      beginScreenScroll(screenScroll, {
        dir: transition.dir,
        nextRoomId,
        spawn,
        mode: 'overworld',
      });
    } finally {
      scrollLoading = false;
    }
  }

  /**
   * Prefetch next UW room sprite and begin ScrollWorld.
   * @param {{ nextRoomId: number, dir: number }} exit
   */
  async function beginDungeonScroll(exit) {
    if (
      scrollLoading
      || isScrolling(screenScroll)
      || busy
      || !dungeon?.levelData
      || inv.dead
      || endingUi.visible
    ) {
      return;
    }
    const level = dungeon.levelData;
    const room = level.rooms.find((r) => r.roomId === exit.nextRoomId);
    if (!room) {
      void loadDungeonRoom(exit.nextRoomId, exit.dir);
      return;
    }
    scrollLoading = true;
    clearEnemies();
    bombs = [];
    if (stubLabel) stubLabel.visible = false;
    try {
      // Match loadDungeonRoom paint path so the incoming room looks correct.
      let nextSprite = null;
      const painted = paintDungeonRoom(room);
      if (painted) {
        nextSprite = new Sprite(painted.tex);
      } else {
        try {
          const questPack = inv.quest === 2 ? 2 : 1;
          const tex = await Assets.load(
            `/dungeons/q${questPack}/level_${dungeon.level}/${room.image}`,
          );
          tex.source.scaleMode = 'nearest';
          nextSprite = new Sprite(tex);
        } catch {
          const canvas = document.createElement('canvas');
          canvas.width = PLAY_W;
          canvas.height = PLAY_H;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#101018';
            ctx.fillRect(0, 0, PLAY_W, PLAY_H);
            const tex = Texture.from(canvas);
            tex.source.scaleMode = 'nearest';
            nextSprite = new Sprite(tex);
          }
        }
      }
      if (!nextSprite || busy || inv.dead || endingUi.visible || !dungeon) return;

      destroyNextBg();
      const play = dungeonPlayOrigin();
      if (roomSprite) {
        roomSprite.x = play.x;
        roomSprite.y = play.y;
      }
      nextBg = nextSprite;
      placeNextBgAdjacent(nextBg, exit.dir, play.x, play.y);
      const idx = roomSprite ? world.getChildIndex(roomSprite) : 0;
      world.addChildAt(nextBg, idx + 1);

      beginScreenScroll(screenScroll, {
        dir: exit.dir,
        nextRoomId: exit.nextRoomId,
        spawn: null,
        mode: 'dungeon',
      });
    } finally {
      scrollLoading = false;
    }
  }

  async function loadOverworldScreen(mapIndex, spawn) {
    busy = true;
    try {
      mode = 'overworld';
      dungeon = null;
      ladderObj = null;
      cancelScreenScroll();
      if (roomSprite) {
        world.removeChild(roomSprite);
        // Painted canvas textures are unreferenced; Assets BG/room PNGs stay cached.
        roomSprite.destroy({ texture: false, textureSource: false });
        roomSprite = null;
      }
      if (stubLabel) {
        world.removeChild(stubLabel);
        stubLabel.destroy();
        stubLabel = null;
      }
      // After room sprites are gone — palette swap destroys enemy/item caches.
      applyEnemyPaletteForMode();

      let pack = await fetchJson(screenUrl(mapIndex));
      // Quest 2: AttrsB cave remaps + layout overlays for $0B/$3C/$74 (Z_06).
      if (inv.quest === 2) {
        if (quest2NeedsLayoutOverlay(mapIndex)) {
          try {
            const overlay = await fetchJson(screenUrlQ2(mapIndex));
            pack = { ...pack, ...overlay, mapIndex };
          } catch {
            applyQuest2AttrsToPack(pack);
          }
        } else {
          applyQuest2AttrsToPack(pack);
        }
        // Recompute secret ignore for Q2 if pack still has Q1 secrets list.
        if (Array.isArray(pack.secrets) && pack.attrs?.ignoreSecretQ2) {
          pack.secrets = [];
        }
      }
      // Clone tile grid so secret reveals persist for this session without mutating the pack cache.
      const tileGrid = pack.tileGrid.map((row) => [...row]);
      /** @type {{ col: number, row: number, tiles: readonly number[] }[]} */
      const bgPatches = [];
      for (const secret of pack.secrets ?? []) {
        const key = `${mapIndex}:${secret.row}:${secret.col}`;
        if (owSecretsRevealed.has(key)) {
          revealSecretTiles(tileGrid, secret.row, secret.col, secret.marker);
          bgPatches.push({
            col: secret.col,
            row: secret.row,
            tiles: tilesForSecretMarker(secret.marker),
          });
        }
      }
      restoreArmosReveals(tileGrid, mapIndex, owSecretsRevealed);
      screen = { ...pack, tileGrid };
      roomId = mapIndex;
      candleRoom = createCandleRoomState();
      whirlwind = null;
      // A drained pond stays drained: the stairs sit in the water, so the
      // walkability floor has to survive the revisit even though the palette
      // (SecretColorCycle) resets with the screen.
      pondSecret = createPondSecret();
      pondSecret.walkable = pack.secrets?.some(
        (s) => secretAction(s) === 'recorder'
          && owSecretsRevealed.has(`${mapIndex}:${s.row}:${s.col}`),
      ) ?? false;
      owWaterRgb = OW_WATER_RGB;
      let tex;
      try {
        tex = await Assets.load(bgUrl(mapIndex, inv.quest));
      } catch {
        tex = await Assets.load(bgUrl(mapIndex, 1));
      }
      tex.source.scaleMode = 'nearest';
      if (bg) {
        world.removeChild(bg);
        // Keep texture — Assets cache reuses it when returning to the same screen
        // (cave exit). Default destroy() would blank the new sprite.
        bg.destroy({ texture: false, textureSource: false });
      }
      bg = new Sprite(tex);
      bg.y = HUD_HEIGHT;
      bg.visible = true;
      world.addChildAt(bg, 0);
      // Re-paint revealed OW secrets + under-Armos stairs/floor on the baked PNG.
      for (const p of bgPatches) {
        patchOwBgSquare(p.col, p.row, p.tiles);
      }
      for (const key of owSecretsRevealed) {
        if (!key.startsWith(`armos:${mapIndex & 0xff}:`)) continue;
        const parts = key.split(':');
        const row = Number(parts[2]);
        const col = Number(parts[3]);
        if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
        const stairs = tileGrid[row * 2]?.[col * 2] === 0x70;
        patchOwBgSquare(
          col,
          row,
          stairs
            ? SECRET_STAIRS_TILES
            : [ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE],
        );
      }

      link.x = spawn.x;
      link.y = spawn.y;
      if (spawn.dir != null) link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;

      // Enemies were cleared in applyEnemyPaletteForMode; respawn for this screen.
      enemies = spawnOverworldEnemies(screen.attrs, spawn.dir ?? link.dir);
      for (const e of enemies) {
        if (!e.edgePending) e.spawnCloud = 0x10;
      }
      // Spawn tables can land walkers on water/rock — slide them to open ground.
      ejectEnemiesFromSolid(enemies, screen.tileGrid);
      projectiles = [];
      // InitPondFairy: Tune1 $08 ("item taken") when the fountain fairy appears.
      if (findPondFairy(enemies)) audio?.playSfx('item_taken');
      // Edge-entry screens start with pending foes; activate over the next frames.
      if (screen.attrs.monsterEntry) {
        setStatus(
          `Screen $${mapIndex.toString(16).padStart(2, '0')}  edge-spawn ×${enemies.length}`,
        );
      }

      titleEl.textContent = 'Play — overworld';
      const mid = screen.attrs.monsterId ?? 0;
      if (!screen.attrs.monsterEntry) {
        setStatus(
          `Screen $${mapIndex.toString(16).padStart(2, '0')}  foes=${enemies.length} type=$${mid.toString(16)}`,
        );
      }
      refreshHud();
      if (audio?.currentMusic() !== 'overworld') audio?.playMusic('overworld');
      if (playing) persistSave();
    } finally {
      busy = false;
    }
  }

  /**
   * @param {number} roomIdWanted
   * @param {number | null} [fromDir]
   * @param {{ x: number, y: number, dir: number } | null} [spawnOverride]
   * @param {{ entranceY?: number | null }} [opts]
   */
  async function loadDungeonRoom(roomIdWanted, fromDir, spawnOverride = null, opts = {}) {
    if (!dungeon?.levelData || busy) return false;
    const level = dungeon.levelData;
    const room = level.rooms.find((r) => r.roomId === roomIdWanted);
    if (!room) {
      setStatus(`No room $${Number(roomIdWanted).toString(16)} in level data`);
      return false;
    }
    busy = true;
    try {
      bombs = [];
      clearEnemies();
      cancelScreenScroll();
      personDialogue.close();

      // Keep shutter / bomb / key opens before painting door faces.
      restoreClearedShutters(dungeon.doorState, dungeon.clearedRooms, level);

      // TriggeredDoorCmd $02: the shutter Link walked through shuts behind
      // him. Cleared rooms stay open — their trigger re-fires immediately.
      const enteredSide =
        fromDir != null && !spawnOverride ? entrySideForFacing(fromDir) : null;
      if (enteredSide && !dungeon.clearedRooms.has(room.roomId)) {
        closeShutterBehind(dungeon.doorState, room, enteredSide);
      }

      const playOrigin = dungeonPlayOrigin();
      const floor = floorFrame();
      // Build the next room visuals before tearing down the current sprite
      // so a paint failure cannot leave a black void mid-stairs transition.
      let nextSprite = null;
      let nextGrid = null;
      let painted = paintDungeonRoom(room);
      if (painted) {
        nextSprite = new Sprite(painted.tex);
        nextGrid = painted.tileGrid;
      } else {
        nextGrid = buildDungeonPlayGrid(room, playOrigin, UW_PRIMARY_SQUARES, {
          doorState: dungeon.doorState,
        });
        try {
          const questPack = inv.quest === 2 ? 2 : 1;
          const tex = await Assets.load(
            `/dungeons/q${questPack}/level_${dungeon.level}/${room.image}`,
          );
          tex.source.scaleMode = 'nearest';
          nextSprite = new Sprite(tex);
          painted = false;
        } catch {
          // Last resort: solid grid texture from composed tiles (works for cellars).
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 176;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#101018';
            ctx.fillRect(0, 0, 256, 176);
            const tex = Texture.from(canvas);
            tex.source.scaleMode = 'nearest';
            nextSprite = new Sprite(tex);
          }
        }
      }
      if (!nextSprite || !nextGrid) {
        setStatus(`Failed to load room $${room.roomId.toString(16)}`);
        return false;
      }

      if (roomSprite) {
        world.removeChild(roomSprite);
        roomSprite.destroy({ texture: false, textureSource: false });
        roomSprite = null;
      }
      if (stubLabel) {
        world.removeChild(stubLabel);
        stubLabel.destroy();
        stubLabel = null;
      }

      dungeon.room = room;
      roomId = room.roomId;
      dungeon.visitedRooms.add(room.roomId);
      dungeonTileGrid = nextGrid;
      roomSprite = nextSprite;
      roomSprite.x = playOrigin.x;
      roomSprite.y = playOrigin.y;
      // Center fallback floor PNGs that are still 192×112.
      if (!painted && roomSprite.width < 256) {
        roomSprite.x = floor.x;
        roomSprite.y = floor.y;
      }
      world.addChildAt(roomSprite, 0);

      const origin = { x: floor.x, y: floor.y };
      const roomSize = { w: floor.w, h: floor.h };
      const spawn =
        spawnOverride
        ?? (isCellarRoom(room, level)
          ? cellarEnterSpawn(origin, roomSize, {
              sourceRoomId: dungeon.cellarSourceRoomId,
              cellarRoom: room,
            })
          : dungeonRoomSpawn(origin, roomSize, fromDir ?? DIR.UP));
      link.x = spawn.x;
      link.y = opts.entranceY ?? spawn.y;
      link.dir = spawn.dir;
      link.posFrac = 0;
      // NES: set ObjGridOffset from EnteringRoomRelativePositions so Link
      // finishes a short walk-in before CheckScreenEdge allows leaving.
      const doorEnter = !spawnOverride && !isCellarRoom(room, level);
      link.gridOffset = doorEnter ? enteringRoomGridOffset(spawn.dir) : 0;
      link.moving = false;
      // DoorwayDir analog: skip tile collision in the entry corridor until
      // Link leaves that doorway (not a deep-room exit latch).
      let blockSide = doorEnter ? entrySideForFacing(spawn.dir) : null;
      // Save/reload mid-door: spawnOverride skips doorEnter, but feet may still
      // sit on solid door-face tiles — latch whichever corridor Link occupies.
      if (!blockSide && spawnOverride && !isCellarRoom(room, level)) {
        for (const side of ['north', 'south', 'west', 'east']) {
          if (!nearDoorway(link, side)) continue;
          const t = room.doors?.[side]?.type;
          if (t && t !== 'wall') {
            blockSide = side;
            break;
          }
        }
      }
      dungeon.doorwayBlockSide = blockSide;

      // Cellars (mode 9): spawnDungeonEnemies uses fixed 4 blue keese.
      // Spawn / item XY are NES screen-absolute (do not add floor origin).
      // DROP-07: cleared rooms suppress killable foe respawn (RoomKillCount),
      // but persons / traps still appear (tip rooms, trap halls).
      enemies = spawnDungeonEnemies(room, { x: 0, y: 0 }, link.dir);
      if (dungeon.clearedRooms.has(room.roomId)) {
        enemies = enemies.filter((e) => persistsAfterRoomClear(e.objType));
      }
      // Bomb-upgrade offer already taken — destroy person (NES GetRoomFlagUWItemState).
      if (dungeon.takenItems.has(room.roomId)) {
        enemies = enemies.filter((e) => !isBombUpgradePerson(e.objType));
      }
      for (const e of enemies) {
        if (!e.npc) e.spawnCloud = 0x10;
      }
      ejectEnemiesFromSolid(enemies, dungeonTileGrid, dungeonTileOpts(inv));
      // Boss Init routines post a roar sample as the room comes up.
      for (const e of enemies) {
        const roar = e.alive ? bossRoarSfx(e.objType) : null;
        if (roar) {
          audio?.playSfx(roar);
          break;
        }
      }
      const tipPerson = enemies.find((e) => e.alive && isPersonType(e.objType));
      if (tipPerson) {
        personDialogue.open(
          linesForUnderworldPerson(caveTextLines, dungeon.level, tipPerson.objType),
        );
      }
      dungeon.roomKillCount = 0;
      projectiles = [];
      enemyBooms = [];
      floorTiles = room.squares ? roomToTileGrid(room, [...UW_PRIMARY_SQUARES]) : null;
      ladderObj = null;
      pushBlock = createPushBlock(room, origin, floorTiles ?? []);
      if (pushBlock && dungeon.pushedRooms.has(room.roomId)) {
        // Already pushed — vacate home 2×2 and park block one cell up (NES).
        setUwSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
        pushBlock.state = PUSH_STATE.DONE;
        pushBlock.complete = true;
        pushBlock.y -= 0x10;
        setUwSquareAt(pushBlock.x, pushBlock.y, 0xb0);
        // BLOCK_STAIRS: stairs stay revealed after leave/re-enter.
        if (pushSpawnsStairs(room)) {
          setUwSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
          patchRoomSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
        }
      }
      applyPushBlockRoomArt();
      pushBlockTex = null; // rebuild if level palette changes
      roomItem = createRoomItem(
        room,
        { x: 0, y: 0 },
        itemPositionsFromLevel(level.itemPositions),
      );
      if (roomItem && dungeon.takenItems.has(room.roomId)) {
        roomItem.taken = true;
        roomItem.visible = false;
      } else if (dungeon.clearedRooms.has(room.roomId)) {
        // FOES_FOR_ITEM / LAST_BOSS already revealed after clear.
        if (roomItem && (roomItem.effect === 7 || roomItem.effect === 3)) {
          roomItem.visible = true;
        }
        roomClearedLatch = true;
        openRoomShutters(dungeon.doorState, room);
      } else {
        roomClearedLatch = false;
      }

      const owExit =
        room.roomId === level.startRoom ? '  ·  ↓ OW exit' : '';
      stubLabel = new Text({
        text: `L${dungeon.level} $${room.roomId.toString(16)}  foes=${enemies.length}${owExit}`,
        style: {
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 8,
          fill: 0xffd080,
        },
      });
      stubLabel.x = 8;
      stubLabel.y = HUD_HEIGHT + 4;
      world.addChild(stubLabel);

      titleEl.textContent = `Play — Level ${dungeon.level}`;
      candleRoom = createCandleRoomState();
      flames = [];
      statueState = createStatueState(room.layoutId ?? -1);
      syncDarkOverlay();
      const darkNote = room.floorItem?.dark ? '  DARK' : '';
      setStatus(
        `Level ${dungeon.level} room $${room.roomId.toString(16)}  monster=$${
          room.monster?.id?.toString(16) ?? 0
        }${darkNote}`,
      );
      refreshHud();
      return true;
    } catch (err) {
      console.error('loadDungeonRoom failed', roomIdWanted, err);
      setStatus(`Failed to load room $${Number(roomIdWanted).toString(16)}`);
      return false;
    } finally {
      busy = false;
    }
  }

  async function enterLevel(levelId, opts = {}) {
    if (levelId === 9 && triforceCount(inv) < 8) {
      setStatus(`Level 9 sealed — Triforce ${triforceCount(inv)}/8`);
      return;
    }
    busy = true;
    try {
      const quest = inv.quest === 2 ? 2 : 1;
      const level = finalizeLevelMeta(
        await fetchJson(`/dungeons/q${quest}/level_${levelId}/level.json`),
      );
      const startRoom = level.rooms.find((r) => r.roomId === level.startRoom);
      if (!startRoom) {
        throw new Error(`Level ${levelId} missing start room`);
      }

      const saved = dungeonProgress.get(dungeonProgressKey(quest, levelId));
      mode = 'dungeon';
      dungeon = {
        level: levelId,
        fromRoomId: opts.fromRoomId ?? roomId,
        fromAttrs: opts.fromAttrs ?? screen?.attrs ?? {},
        levelData: level,
        room: startRoom,
        doorState: createDoorState(),
        /** @type {string | null} entry door side latched until Link walks clear */
        doorwayBlockSide: null,
        clearedRooms: new Set(saved?.cleared ?? []),
        takenItems: new Set(saved?.taken ?? []),
        visitedRooms: new Set(saved?.visited ?? []),
        pushedRooms: new Set(saved?.pushed ?? []),
        roomKillCount: 0,
        lastBossDefeated: Boolean(saved?.lastBoss),
      };
      applyEnemyPaletteForMode();
      if (saved?.doors) {
        for (const k of saved.doors) dungeon.doorState.open.add(k);
      }
      inv.map = saved?.map ?? 0;
      inv.compass = saved?.compass ?? 0;
      if (bg) {
        world.removeChild(bg);
        bg.destroy({ texture: false, textureSource: false });
        bg = null;
      }
    } finally {
      busy = false;
    }
    const resumeRoom = opts.roomId ?? dungeon.levelData.startRoom;
    // Fresh entry from the overworld stands Link on LevelInfo's StartY ($DD),
    // slightly lower than a room-to-room south entry, but still walks in.
    const entranceY =
      !opts.spawnOverride && resumeRoom === dungeon.levelData.startRoom
        ? dungeon.levelData.startY
        : null;
    await loadDungeonRoom(
      resumeRoom,
      opts.fromDir ?? DIR.UP,
      opts.spawnOverride ?? null,
      { entranceY },
    );
    audio?.playSfx('stairs');
    audio?.playMusic(levelId === 9 ? 'level9' : 'underworld');
  }

  function openCave(caveId) {
    const cave = getCave(caveTable, caveId);
    if (!cave) {
      setStatus(`Cave $${caveId.toString(16)} (missing table)`);
      return;
    }
    caveReturn = {
      roomId,
      x: link.x,
      y: link.y,
      dir: DIR.DOWN,
    };
    // Hide OW under the cave scene.
    if (bg) bg.visible = false;
    clearEnemies();
    bombs = [];
    projectiles = [];
    mode = 'cave';
    caveTileGrid = createCaveTileGrid();
    link.x = CAVE_ENTER_SPAWN.x;
    link.y = CAVE_ENTER_SPAWN.y;
    link.dir = CAVE_ENTER_SPAWN.dir;
    link.posFrac = 0;
    link.gridOffset = 0;
    link.moving = false;
    caveInteractLatch = false;
    caveExitLatch = true; // ignore exit until Link walks further inside
    gambleAmounts = cave.kind === 'gamble' ? rollMoneyGameAmounts() : null;
    caveScene.openWith(cave, caveTaken, potionShopWaresHidden(cave, inv));
    audio?.playSfx('stairs');
    setStatus(
      potionShopWaresHidden(cave, inv) ? 'The shopkeeper waits…' : describeCave(cave),
    );
    titleEl.textContent = `Cave $${caveId.toString(16)}`;
    refreshHud();
  }

  async function leaveCave(opts = {}) {
    const cave = caveScene.cave;
    const destRoom = opts.roomId ?? caveReturn.roomId;
    const spawn = {
      x: opts.x ?? caveReturn.x,
      y: opts.y ?? caveReturn.y,
      dir: opts.dir ?? caveReturn.dir,
    };
    invUi.close();
    world.y = 0;
    // Hide cave first — loadOverworldScreen may rebuild sprite caches, and
    // destroyed textures still bound to visible cave/HUD sprites black the GL context.
    caveScene.close();
    caveTileGrid = null;
    mode = 'overworld';
    undergroundExitType = 1;

    // Take-any-road warps to another OW screen.
    if (opts.roadDest != null) {
      await loadOverworldScreen(opts.roadDest, {
        x: 0x78,
        y: worldIndex.startY,
        dir: DIR.DOWN,
      });
      setStatus(`Took the road to $${opts.roadDest.toString(16)}`);
      return;
    }

    // Same entrance screen: keep the existing bg (secrets already painted).
    // A full reload was destroying live item/enemy textures mid-frame → black.
    if (bg && screen && destRoom === roomId) {
      bg.visible = true;
      link.x = spawn.x;
      link.y = spawn.y;
      if (spawn.dir != null) link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;
      clearEnemies();
      enemies = spawnOverworldEnemies(screen.attrs, spawn.dir ?? link.dir);
      for (const e of enemies) {
        if (!e.edgePending) e.spawnCloud = 0x10;
      }
      ejectEnemiesFromSolid(enemies, screen.tileGrid);
      projectiles = [];
      bombs = [];
      titleEl.textContent = 'Play — overworld';
      refreshHud();
      if (audio?.currentMusic() !== 'overworld') audio?.playMusic('overworld');
      audio?.playSfx('stairs');
      persistSave('cave exit');
      setStatus(cave ? 'Left the cave' : 'Back outside');
      return;
    }

    if (bg) bg.visible = true;
    await loadOverworldScreen(destRoom, spawn);
    audio?.playSfx('stairs');
    persistSave('cave exit');
    setStatus(cave ? 'Left the cave' : 'Back outside');
  }

  /**
   * Interact with ware / dweller while in cave mode.
   */
  function tryCaveInteract() {
    const cave = caveScene.cave;
    if (!cave) return;

    if (cave.kind === 'road') {
      // Four road exits across the mid-room (NES shortcut cave).
      const roads = cave.takeAnyRoad ?? [];
      const idx = Math.min(3, Math.max(0, Math.floor((link.x - 0x40) / 0x30)));
      if (roads[idx] != null && link.y < 0xa0 && link.y > 0x70) {
        void leaveCave({ roadDest: roads[idx] });
      }
      return;
    }

    if (cave.kind === 'gamble') {
      // Three amounts sit at the ware columns ($58/$78/$98, Y=$98).
      if (Math.abs(link.y - CAVE_WARE_Y) > 12) return;
      let slot = -1;
      for (let i = 0; i < CAVE_WARE_XS.length; i += 1) {
        if (Math.abs(link.x - CAVE_WARE_XS[i]) < 12) {
          slot = i;
          break;
        }
      }
      if (slot < 0) return;
      const amounts = gambleAmounts ?? rollMoneyGameAmounts();
      gambleAmounts = amounts;
      const result = tryGamble(inv, cave, slot, amounts);
      setStatus(result.ok ? result.label : (result.reason ?? 'Gamble'));
      refreshHud();
      return;
    }

    if (cave.kind === 'door') {
      const near =
        Math.abs(link.x - 0x78) < 16 && Math.abs(link.y - 0x80) < 20;
      if (!near) return;
      const result = tryDoorRepair(inv, cave, { taken: caveTaken });
      setStatus(result.ok ? result.label : (result.reason ?? 'Door'));
      refreshHud();
      return;
    }

    if (cave.kind === 'moblin' || cave.kind === 'money') {
      const near =
        Math.abs(link.x - 0x78) < 16 && Math.abs(link.y - 0x98) < 20;
      if (!near) return;
      const result = tryMoblinGift(inv, cave, { taken: caveTaken });
      setStatus(result.ok ? result.label : (result.reason ?? 'Nothing'));
      if (result.ok) {
        audio?.playSfx('rupee');
        caveScene.refreshWares(caveTaken);
      }
      refreshHud();
      return;
    }

    if (potionShopWaresHidden(cave, inv)) return;
    const slot = wareUnderLink(link, caveWareSlots(cave, caveTaken));
    if (!slot) return;
    const result = tryBuyCaveSlot(inv, cave, slot.index, { taken: caveTaken });
    if (!result.ok) {
      setStatus(result.reason ?? 'Cannot');
      return;
    }
    setStatus(`Got ${result.label}${result.price ? ` (−${result.price}R)` : ''}`);
    caveScene.refreshWares(caveTaken);
    refreshHud();
    invUi.refresh(inv, dungeon);
    if (cave.kind === 'give' || cave.kind === 'letter' || cave.kind === 'take_any') {
      // TakeItem: Tune1 $08, and in a cave/cellar also SongRequest $08 with
      // Link halted holding the item for $80 frames.
      audio?.playSfx('item_taken');
      audio?.playFanfare('item');
      inv.itemLiftTimer = ITEM_LIFT_FRAMES;
      startItemLift(result.item ?? null);
    } else {
      audio?.playSfx('rupee');
    }
  }

  function stepCave(inputMask) {
    if (!caveTileGrid || inv.dead) return;
    // CheckLiftItem halts the player while the item is held overhead.
    if ((inv.itemLiftTimer ?? 0) > 0) {
      syncItemLiftSprite();
      return;
    }
    syncItemLiftSprite();
    if (!isSwordActive(sword) && inv.shovePixels <= 0) {
      stepLink(link, caveTileGrid, inputMask);
    }
    ensureLinkNotInSolid();
    const cave = caveScene.cave;
    if (cave) {
      const slots = potionShopWaresHidden(cave, inv)
        ? []
        : caveWareSlots(cave, caveTaken);
      const overWare = wareUnderLink(link, slots);
      // Only NPC-talk caves use proximity to the dweller; gift/shop use ware touch.
      const npcTalk =
        cave.kind === 'gamble'
        || cave.kind === 'door'
        || cave.kind === 'moblin'
        || cave.kind === 'money'
        || cave.kind === 'road';
      const nearNpc =
        npcTalk
        && Math.abs(link.x - 0x78) < 16
        && Math.abs(link.y - 0x90) < 24;
      const targetKey = overWare ? overWare.key : nearNpc ? 'npc' : null;
      if (!targetKey) {
        caveInteractLatch = false;
      } else if (caveInteractLatch !== targetKey) {
        caveInteractLatch = targetKey;
        tryCaveInteract();
      }
    }
    // Clear latch once Link has walked north of the mouth (enter spawn is $B8).
    if (link.y < 0xc0) caveExitLatch = false;
    if (!caveExitLatch && checkCaveExit(link)) {
      caveExitLatch = true;
      void leaveCave();
    }
  }

  function applyOwSecretReveal(action, x, y) {
    if (!screen?.tileGrid) return [];
    const opened = tryRevealSecrets(
      screen.secrets,
      owSecretsRevealed,
      roomId,
      action,
      x,
      y,
      screen.tileGrid,
    );
    for (const secret of opened) {
      patchOwBgSquare(secret.col, secret.row, tilesForSecretMarker(secret.marker));
    }
    if (opened.length) {
      audio?.playSfx('secret');
      setStatus(`Secret revealed (${action})!`);
    }
    return opened;
  }

  /**
   * Drive the recorder pond object: recolour the water, open it up, then drop
   * the staircase at `RevealPondStairs`' fixed spot.
   */
  function stepPondDrain() {
    const step = stepPondSecret(pondSecret, frameCounter);
    if (!step.stepped) return;
    if (step.color != null) recolorOwWater(step.color);
    if (step.openedWater) setStatus('The waters part!');
    if (step.revealStairs) {
      applyOwSecretReveal('recorder', POND_STAIRS_X, POND_STAIRS_Y);
    }
  }

  /**
   * `CueTransferPondPaletteRow` — patch BG palette row 3's last colour. The
   * screen is a baked canvas rather than a live PPU, so we swap every pixel
   * that still carries the water colour.
   * @param {number} nesIndex
   */
  function recolorOwWater(nesIndex) {
    if (!bg) return;
    const next = nesColor(nesIndex);
    if (!next) return;
    const canvas = document.createElement('canvas');
    canvas.width = bg.texture.width;
    canvas.height = bg.texture.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const src = /** @type {CanvasImageSource | null} */ (bg.texture.source.resource);
    if (!src) return;
    ctx.drawImage(src, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    const [fr, fg, fb] = owWaterRgb;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] === fr && px[i + 1] === fg && px[i + 2] === fb) {
        px[i] = next[0];
        px[i + 1] = next[1];
        px[i + 2] = next[2];
      }
    }
    ctx.putImageData(image, 0, 0);
    owWaterRgb = next;
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    bg.texture = tex;
  }

  async function exitDungeon() {
    if (!dungeon || busy) return;
    snapshotDungeonProgress();
    ladderObj = null;
    personDialogue.close();
    invUi.close();
    world.y = 0;
    // NES Items RAM swaps per level — map/compass leave inventory on OW.
    inv.map = 0;
    inv.compass = 0;
    darkOverlay.visible = false;
    candleRoom = createCandleRoomState();
    const spawn = overworldExitSpawn(dungeon.fromAttrs ?? {});
    const from = dungeon.fromRoomId ?? worldIndex.startScreen;
    // Drop the dungeon room sprite before the OW reload (same care as leaveCave).
    if (roomSprite) {
      world.removeChild(roomSprite);
      roomSprite.destroy({ texture: false, textureSource: false });
      roomSprite = null;
    }
    dungeonTileGrid = null;
    floorTiles = null;
    dungeon = null;
    try {
      await loadOverworldScreen(from, { ...spawn, dir: DIR.DOWN });
      undergroundExitType = 1;
      audio?.playSfx('stairs');
      persistSave('dungeon exit');
      setStatus(`Left the dungeon → OW $${Number(from).toString(16).padStart(2, '0')}`);
    } catch (err) {
      console.error('exitDungeon failed', from, err);
      setStatus(`Dungeon exit failed (OW $${Number(from).toString(16)})`);
    }
  }

  function refreshHud() {
    const location =
      mode === 'overworld'
        ? `OW $${roomId.toString(16).padStart(2, '0')}  mon=$${
            (screen?.attrs?.monsterId ?? 0).toString(16)
          }`
        : mode === 'cave'
          ? `Cave $${(caveScene.cave?.caveId ?? 0).toString(16)}`
          : `L${dungeon?.level} $${roomId.toString(16).padStart(2, '0')}  TF ${triforceCount(inv)}/8`;
    // Cave keeps the OW radar on the overworld entrance screen.
    const mapRoomId =
      mode === 'cave' ? (caveReturn?.roomId ?? roomId) : roomId;
    hud.update({
      inv,
      location,
      mode,
      roomId: mapRoomId,
      dungeon,
      rupeesShown: rupeeRoll.shown,
    });
  }

  function activeLinkTileGrid() {
    if (mode === 'dungeon') return dungeonTileGrid;
    if (mode === 'cave') return caveTileGrid;
    return screen?.tileGrid ?? null;
  }

  function applyShove() {
    if (inv.shovePixels <= 0 || !inv.shoveDir) return;
    const grid = activeLinkTileGrid();
    if (!grid) {
      inv.shovePixels = 0;
      return;
    }
    const result = stepShove(link, grid, inv.shoveDir, inv.shovePixels, {
      roomId: mode === 'overworld' ? roomId : mode === 'dungeon' ? UW_ROOM_BOUNDS : null,
      tileOpts: mode === 'dungeon' ? dungeonTileOpts(inv) : {},
      pixelsPerFrame: 4,
    });
    inv.shovePixels = result.shovePixels;
    if (result.blocked) inv.shoveDir = 0;
  }

  /** Safety net: if Link is somehow inside a solid, slide him out. */
  function ensureLinkNotInSolid() {
    // Doorway tiles are solid in the UW map; NES skips collision via DoorwayDir.
    if (
      mode === 'dungeon'
      && dungeon
      && linkInDoorwayCorridor(link, dungeon.room, {
        doorwayBlockSide: dungeon.doorwayBlockSide,
      })
    ) {
      return;
    }
    // On the stepladder, feet sit on water `$F4` — that is intentional.
    if (ladderAllowsStanding(ladderObj, link)) return;
    const grid = activeLinkTileGrid();
    if (!grid) return;
    const preferDir =
      (inv.shoveDir ? oppositeDir(inv.shoveDir) : 0) || oppositeDir(link.dir) || DIR.UP;
    const result = ejectLinkFromSolid(link, grid, {
      roomId: mode === 'overworld' ? roomId : mode === 'dungeon' ? UW_ROOM_BOUNDS : null,
      tileOpts: mode === 'dungeon' ? dungeonTileOpts(inv) : {},
      preferDir,
    });
    if (result.ejected) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
    }
  }

  function hurtLinkFrom(dir, halfHearts) {
    const result = harmLink(inv, halfHearts);
    if (!result.applied) return;
    resetDropStreak(dropCounters);
    inv.clock = 0;
    audio?.playSfx('hurt');
    inv.shoveDir = oppositeDir(dir) || oppositeDir(link.dir) || DIR.DOWN;
    inv.shovePixels = 0x20;
    refreshHud();
    if (result.died) beginDeath();
  }

  /** GameMode $11: silence the world and hand the screen to the death sequence. */
  function beginDeath() {
    // InitMode11Death ends in SilenceSound before the first submode runs.
    audio?.stopMusic();
    snapshotDungeonProgress();
    if (activeSlot != null && playing) {
      saveStore.save(activeSlot, collectSaveState());
    }
    deathUi.begin();
    setStatus('Game over');
  }

  /**
   * Drive game modes `$11` and `$08` while Link is dead.
   * @param {{ select: boolean, start: boolean }} pressed
   */
  function stepDeathMode(pressed) {
    const tick = deathUi.tick(link, pressed);
    if (tick.playDyingTune) audio?.playSfx('link_dying');
    if (tick.playHeartTune) audio?.playSfx('text');
    if (tick.playGameOverMusic) {
      // UpdateMode11Death_SubC: Tune1 $40 loops, and the death is tallied.
      audio?.playSfx('game_over');
      deathCount = incrementDeathCount(deathCount);
      if (activeSlot != null) saveStore.save(activeSlot, collectSaveState());
    }
    if (tick.cursorMoved) audio?.playSfx('shield');

    // Link keeps spinning in the world layer until the spark replaces him.
    deathLinkVisible = tick.linkVisible;
    if (tick.linkVisible) link.dir = tick.linkDir;

    if (tick.action) applyContinueChoice(tick.action);
  }

  /** `Mode8SelectionToMode` — continue playing, save and quit, or restart. */
  function applyContinueChoice(action) {
    deathUi.hide();
    if (action === 'continue') {
      continueAfterDeath();
      return;
    }
    persistSave(action === 'save' ? 'continue menu save' : 'retry');
    inv.dead = false;
    playing = false;
    dungeon = null;
    audio?.stopMusic();
    titleUi.setSlots(saveStore.listSlots());
    titleUi.show();
    setStatus(action === 'save' ? 'Saved — file select' : 'Retry — file select');
  }

  /**
   * Contact side-effects: bubbles, Armos wake, Like-Like, Wallmaster, damage.
   * @param {import('@shared/enemies.js').Enemy} e
   */
  function handleEnemyContact(e) {
    if (e.armosStatue) {
      wakeArmos(e);
      return;
    }
    if (isBubbleType(e.objType)) {
      applyBubbleSwordBlock(inv, e.objType);
      return;
    }
    if (e.objType === OBJ.LIKE_LIKE) {
      e.captureTimer = (e.captureTimer ?? 0) + 1;
      inv.paralyzed = 2;
      link.x = e.x;
      link.y = e.y;
      if (e.captureTimer >= 0x60) {
        stealMagicShield(inv);
        e.captureTimer = 0;
        setStatus('Like-Like stole your magic shield!');
        refreshHud();
      }
      return;
    }
    if (e.objType === OBJ.WALLMASTER && mode === 'dungeon' && dungeon) {
      // Capture → dungeon entrance (NES returns to start room from south).
      e.wallmasterGrab = true;
      inv.paralyzed = 0x20;
      const entrance = dungeon.levelData?.startRoom;
      if (entrance != null) {
        setStatus('Wallmaster!');
        // Persist room/door progress before the warp, as the death path does.
        snapshotDungeonProgress();
        void loadDungeonRoom(entrance, DIR.UP);
      }
      return;
    }
    hurtLinkFrom(e.dir, contactHalfHearts(e.objType));
  }

  /**
   * Paint OW BG CHR over a square (stairs / sand) so Armos reveals are visible
   * on the baked screen PNG.
   * @param {number} col square col
   * @param {number} row square row
   * @param {readonly number[]} tiles UL,LL,UR,LR (8×8 CHR ids)
   */
  function patchOwBgSquare(col, row, tiles) {
    if (!bg) return;
    const canvas = document.createElement('canvas');
    canvas.width = bg.texture.width;
    canvas.height = bg.texture.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const bgSrc = /** @type {CanvasImageSource | null} */ (bg.texture.source.resource);
    if (bgSrc) ctx.drawImage(bgSrc, 0, 0);
    const positions = [
      [0, 0],
      [0, 8],
      [8, 0],
      [8, 8],
    ];
    for (let i = 0; i < 4; i += 1) {
      const src = owBgTileSourceRect(tiles[i]);
      if (!src) continue;
      const sheet = sheetTextures[src.sheetKey];
      const img = /** @type {CanvasImageSource | null} */ (sheet?.source?.resource);
      if (!img) continue;
      const [dx, dy] = positions[i];
      ctx.drawImage(img, src.sx, src.sy, 8, 8, col * 16 + dx, row * 16 + dy, 8, 8);
    }
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    bg.texture = tex;
  }

  /**
   * Armos fade-in finished — reveal under-statue stairs / bracelet (OW).
   * @param {import('@shared/enemies.js').Enemy} e
   */
  function onArmosAwake(e) {
    if (mode !== 'overworld' || !screen?.tileGrid) return;
    const secret = applyArmosFloorReveal(screen.tileGrid, roomId, e);
    if (!secret) return;
    if (secret.key) owSecretsRevealed.add(secret.key);
    if (secret.row != null && secret.col != null) {
      const tiles =
        secret.kind === 'stairs'
          ? SECRET_STAIRS_TILES
          : [ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE, ARMOS_FLOOR_TILE];
      patchOwBgSquare(secret.col, secret.row, tiles);
    }
    if (secret.kind === 'stairs') {
      audio?.playSfx('secret');
      setStatus('Armos reveals stairs!');
      return;
    }
    if (secret.kind === 'bracelet' && !inv.bracelet) {
      audio?.playSfx('secret');
      // Drop bracelet at Armos feet as a room-style pickup via grant.
      const label = grantRoomItem(inv, ARMOS_BRACELET_ITEM);
      setStatus(`Armos drops the ${label}!`);
      refreshHud();
    }
  }

  /**
   * NES HandleMonsterDied → SetUpDroppedItem after a kill.
   * @param {object} e
   * @param {number} [damageType]
   */
  function onEnemyKilled(e, damageType = 0) {
    // Tune1 $20 is the death cue; `enemy_die` is the per-hit harmed sound.
    audio?.playSfx(isBossType(e.objType) ? 'boss_defeat' : 'monster_die');
    if (isGanon(e.objType)) audio?.playFanfare('ganon');
    if (mode === 'dungeon' && dungeon) {
      dungeon.roomKillCount = (dungeon.roomKillCount ?? 0) + 1;
      if (isBossType(e.objType) && !isZelda(e.objType)) {
        dungeon.lastBossDefeated = true;
      }
    }
    const born = spawnDeathSplits(e, enemies);
    if (born.length) enemies.push(...born);
    const slotIndex = e.slotIndex ?? enemies.indexOf(e) + 1;
    const drop = tryCreateDropFromKill({
      objType: e.objType,
      counters: dropCounters,
      randomByte: dropRng,
      damageType,
      slotIndex,
      x: e.x,
      y: e.y,
    });
    if (drop) {
      drop.id = dropSpriteSeq++;
      drops.push(drop);
    }
    // Ringleader: when slot 1 dies / empties, wipe the room.
    if (
      mode === 'dungeon'
      && dungeon
      && roomSecretEffect(dungeon.room) === SECRET.RINGLEADER
      && slotIndex === 1
    ) {
      tryRingleaderClear(enemies);
    }
  }

  function tryTakeDropsWith(takerX, takerY, takerKind = 'link') {
    if (!isValidItemTaker(takerKind)) return;
    for (const d of drops) {
      if (!d.alive || !dropTouchesTaker(d, takerX, takerY)) continue;
      const got = grantDroppedItem(inv, d.itemId);
      d.alive = false;
      if (got.ok) {
        // Fairy uses TakeHeartsNoSound — no item tune.
        // NES TakeItem only arms ItemLiftTimer in caves/cellars (GameMode≠$05);
        // OW/UW play skips the lift halt, so drops must not freeze Link.
        // Rupees → Tune1 $01; hearts/bombs/keys → Tune0 $08 (PlayKeyTakenTune).
        const sfx = dropPickupSfx(d.itemId);
        if (sfx) audio?.playSfx(sfx);
        setStatus(got.label);
        refreshHud();
      }
    }
  }

  function stepDrops() {
    dropFrame += 1;
    const bounds = enemyBounds();
    for (const d of drops) {
      stepDroppedItemLifetime(d, dropFrame);
      if (d.itemId === DROP_ITEM.FAIRY) stepFairy(d, bounds, { x: link.x, y: link.y });
    }
    // NES ItemTakerObjSlots: Link / sword / boom / arrow only.
    if (isSwordActive(sword)) {
      const sp = swordDrawPos(sword, link.x, link.y);
      if (sp) tryTakeDropsWith(sp.x, sp.y, 'sword');
    }
    for (const p of projectiles) {
      if (p.friendly && p.alive && (p.kind === 0x5b || p.kind === 0x5c)) {
        tryTakeDropsWith(p.x, p.y, 'arrow');
      }
    }
    if (boomerang && boomerang.phase !== BOOM_PHASE.DONE) {
      tryTakeDropsWith(boomerang.x, boomerang.y, 'boom');
    }
    tryTakeDropsWith(link.x, link.y, 'link');

    drops = drops.filter((d) => d.alive);
    for (const [id, spr] of [...dropGfx.entries()]) {
      if (!drops.some((d) => d.id === id)) {
        itemLayer.removeChild(spr);
        spr.destroy({ texture: false, textureSource: false });
        dropGfx.delete(id);
      }
    }
  }

  function syncDropSprites() {
    for (const d of drops) {
      if (!d.alive) continue;
      let spr = dropGfx.get(d.id);
      const tile = dropChrTile(d.itemId);
      // DrawItemBySlot: bomb=SP1 blue; heart/1-rupee flash SP1↔SP2; 5-rupee solid blue.
      const pal = itemDrawPalette(d.itemId, dropFrame);
      const drawn = items.itemTexture(tile, pal);
      if (!spr) {
        spr = new Sprite(drawn.texture);
        dropGfx.set(d.id, spr);
        itemLayer.addChild(spr);
      } else {
        spr.texture = drawn.texture;
      }
      // Narrow drops (heart/rupee/bomb) are centered in the 16px slot.
      spr.x = d.x + (drawn.narrow ? 4 : 0);
      spr.y = d.y;
      if (d.itemId === DROP_ITEM.FAIRY) spr.alpha = dropFrame & 4 ? 1 : 0.75;
      else spr.alpha = 1;
    }
  }

  function clearPondHeartSprites() {
    for (const spr of pondHeartGfx) {
      itemLayer.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
    }
    pondHeartGfx = [];
  }

  /**
   * PondFairy_MoveHearts draw — red full-heart tiles orbiting the fairy.
   * @param {import('@shared/pondFairy.js').PondOrbitHeart[]} hearts
   * @param {boolean} show
   */
  function syncPondHeartSprites(hearts, show) {
    if (!show || !hearts.length) {
      clearPondHeartSprites();
      return;
    }
    const drawn = items.itemTexture(0xf2, 2);
    while (pondHeartGfx.length < hearts.length) {
      const spr = new Sprite(drawn.texture);
      pondHeartGfx.push(spr);
      itemLayer.addChild(spr);
    }
    while (pondHeartGfx.length > hearts.length) {
      const spr = pondHeartGfx.pop();
      if (!spr) break;
      itemLayer.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
    }
    for (let i = 0; i < hearts.length; i += 1) {
      const spr = pondHeartGfx[i];
      const h = hearts[i];
      spr.texture = drawn.texture;
      spr.x = (h.x & 0xff) + (drawn.narrow ? 4 : 0);
      spr.y = h.y & 0xff;
      spr.visible = true;
    }
  }

  /**
   * UpdatePondFairy + World_FillHearts. Returns whether Link is halted.
   * @returns {boolean}
   */
  function stepPondFairyFountain() {
    const fairy = findPondFairy(enemies);
    if (!fairy) {
      pondFairyHalt = false;
      clearPondHeartSprites();
      return false;
    }
    const result = stepPondFairy(fairy, inv, link);
    pondFairyHalt = result.haltLink;
    if (result.playHeartTune) audio?.playSfx('text');
    syncPondHeartSprites(result.hearts, result.showOrbitHearts);
    if (result.haltLink || result.playHeartTune) refreshHud();
    return result.haltLink;
  }

  function stepRoomSecrets() {
    if (mode !== 'dungeon' || !dungeon?.room) return;
    const effect = roomSecretEffect(dungeon.room);

    // Money-or-life: pay by walking onto heart (−1♥) or rupee (−50) ware.
    if (effect === SECRET.MONEY_OR_LIFE && !roomClearedLatch) {
      const paid = tryPayMoneyOrLife(inv, link.x, link.y);
      if (paid) {
        dismissMoneyOrLifePerson(enemies);
        audio?.playSfx(paid === 'rupees' ? 'rupee' : 'key');
        setStatus(paid === 'rupees' ? 'Paid 50 rupees' : 'Paid a heart container');
        refreshHud();
      }
    }

    // More-bombs person ($4F): stand on the −100 rupee ware.
    if (
      bombUpgradePersonAlive(enemies)
      && !dungeon.takenItems.has(dungeon.room.roomId)
      && tryBuyBombUpgrade(inv, link.x, link.y)
    ) {
      dismissBombUpgradePerson(enemies);
      dungeon.takenItems.add(dungeon.room.roomId);
      audio?.playSfx('rupee');
      setStatus(`Bomb capacity ${inv.maxBombs}!`);
      refreshHud();
      invUi.refresh(inv, dungeon);
    }

    if (effect === SECRET.RINGLEADER && !roomClearedLatch) {
      tryRingleaderClear(enemies);
    }

    const allDead = roomAllDead(enemies);
    const ready =
      effect === SECRET.LAST_BOSS
        ? Boolean(dungeon.lastBossDefeated)
        : effect === SECRET.MONEY_OR_LIFE
          ? moneyOrLifeReady(enemies)
          : allDead;

    if (!roomClearedLatch && ready) {
      const { shutter, revealItem } = applyRoomClear(roomItem, allDead, effect, {
        lastBossDefeated: Boolean(dungeon.lastBossDefeated),
      });
      roomClearedLatch = true;
      // Tip / person-only rooms are vacuously "all dead" — do not persist
      // clearedRooms unless there were clear-counting foes or a secret needs it.
      const persistClear =
        (dungeon.roomKillCount ?? 0) > 0
        || roomHasClearCountingType(enemies)
        || (
          effect !== SECRET.NONE
          && effect !== SECRET.BLOCK_DOOR
          && effect !== SECRET.BLOCK_STAIRS
        )
        || shutter
        || revealItem;
      if (persistClear) {
        dungeon.clearedRooms.add(dungeon.room.roomId);
      }
      // CheckSecretTrigger activates the room item with Tune1 $02.
      if (revealItem) audio?.playSfx('item_appears');
      if (shutter) {
        const sides = openRoomShutters(dungeon.doorState, dungeon.room);
        if (sides.length) refreshDungeonRoomVisual();
        setStatus(
          sides.length
            ? `Room clear — shutter${sides.length > 1 ? 's' : ''} open${revealItem ? ' + item' : ''}`
            : `Room clear${revealItem ? ' — item appears' : ''}`,
        );
      } else if (revealItem) {
        setStatus(roomItem?.itemType === 0x19 ? 'A key appears!' : 'An item appears!');
      } else if (effect === SECRET.BLOCK_DOOR || effect === SECRET.BLOCK_STAIRS) {
        setStatus(
          effect === SECRET.BLOCK_STAIRS
            ? 'Room clear — push the block for stairs'
            : 'Room clear — push the block',
        );
      }
    }
    // Keys/maps on Stalfos / Like-Like / Gibdo follow the foe (NES slot 1).
    syncRoomItemPosition(roomItem, enemies);
    const picked = tryPickupRoomItem(roomItem, link.x, link.y);
    if (picked != null) {
      dungeon.takenItems.add(dungeon.room.roomId);
      const label = grantRoomItem(inv, picked, { level: dungeon.level });
      refreshHud();
      invUi.refresh(inv, dungeon);
      if (picked === 0x1b && hasTriforce(inv, dungeon.level)) {
        audio?.playFanfare('triforce');
        // GameMode $12: halt, flash the palette, then fill hearts.
        startTriforceCeremony(triforceCeremony);
        setStatus(
          dungeon.level >= 8
            ? `Got ${label}! ${triforceCount(inv)}/8 — Level 9 awaits`
            : `Got ${label}! Level ${dungeon.level} clear — exit south from entrance`,
        );
      } else {
        audio?.playFanfare('item');
        setStatus(`Got ${label}!`);
      }
    }
  }

  /**
   * Deploy / update the one-tile stepladder object (NES CheckLadder).
   * @param {number[][] | null} tileGrid
   * @param {number} inputMask
   * @param {'overworld' | 'dungeon'} ladderMode
   * @param {object} baseTileOpts
   * @param {boolean} [inDoorway]
   */
  function prepareLadderTileOpts(tileGrid, inputMask, ladderMode, baseTileOpts, inDoorway = false) {
    const inputDir = pickSingleDir(inputMask);
    ladderObj = tryPlaceLadder(link, {
      tileGrid,
      inv,
      mode: ladderMode,
      roomId,
      inDoorway,
      inputDir,
      existing: ladderObj,
      tileOpts: baseTileOpts,
    });
    return {
      ...baseTileOpts,
      ladder: ladderObj,
      ladderMode,
    };
  }

  function checkZeldaRescue() {
    if (!dungeon || endingUi.visible) return;
    for (const e of enemies) {
      // Only Zelda ($37) — not other npc persons / Grumble.
      if (!e.alive || !isZelda(e.objType)) continue;
      if (
        Math.abs(e.x - link.x) < 20
        && Math.abs(e.y - link.y) < 20
      ) {
        const quest = inv.quest === 2 ? 2 : 1;
        questCompleted = quest;
        endingUi.begin({ quest, name: saveName, deaths: deathCount });
        audio?.playFanfare('zelda');
        setStatus(`Quest ${quest} complete — thanks Link!`);
        return;
      }
    }
  }

  /**
   * Drive mode $13 for one animation frame.
   * @param {{ start: boolean }} pressed
   */
  function stepEndingMode(pressed) {
    if (!endingUi.visible) return;
    const zelda = enemies.find((e) => e.alive && isZelda(e.objType));
    const tick = endingUi.tick(pressed, {
      link: { x: link.x, y: link.y },
      zelda: zelda ? { x: zelda.x, y: zelda.y } : undefined,
    });
    if (tick.playCharTune) audio?.playSfx('text');
    if (tick.startSong) audio?.playMusic('ending');
    if (tick.silence) audio?.stopMusic();
    world.visible = tick.worldVisible;
    linkSprite.visible = tick.heroesVisible;
    for (const g of enemyGfx.values()) {
      // Keep Zelda (and Link) while the heroes are meant to be on screen.
      g.visible = tick.heroesVisible && g.visible;
    }
    if (tick.finished) {
      endingUi.hide();
      world.visible = true;
      void beginSecondQuestAfterVictory();
    }
  }

  function stepCombat() {
    const swordWasActive = isSwordActive(sword);
    const swordPrevPhase = sword.phase;
    if (swordWasActive) {
      stepSword(sword);
      for (const e of enemies) {
        const wasAlive = e.alive;
        trySwordHitEnemy(e, sword, link.x, link.y, inv.sword, {
          enemies,
          onGleeokHeadDetach: (body) => {
            const head = spawnGleeokHead(body, createEnemy);
            if (head) tryAddMonster(enemies, head);
          },
        });
        if (wasAlive && !e.alive) {
          if (isGleeok(e.objType)) clearGleeokHeads(e.id, enemies);
          onEnemyKilled(e);
        }
      }
      // MakeSwordShot fires as the swing reaches state 3, not at swing end.
      if (
        swordSpawnsShot(sword, swordPrevPhase)
        && swordBeamHealthOk(inv)
        && inv.sword > 0
        && !projectiles.some((p) => p.friendly && p.alive && p.kind === 0x57)
      ) {
        projectiles.push(shootSwordBeam(link.x, link.y, sword.dir ?? link.dir, inv.sword));
        // MakeSwordShot plays DMC sample $01.
        audio?.playSfx('sword_shot');
      }
    }

    tickBombs();

    const bounds = enemyBounds();
    const owGrid = mode === 'overworld' ? screen?.tileGrid ?? null : null;
    const tileGrid = mode === 'dungeon' ? dungeonTileGrid : owGrid;
    const tileOpts = mode === 'dungeon' ? dungeonTileOpts(inv) : {};
    const chase =
      bait?.alive ? { x: bait.x, y: bait.y } : { x: link.x, y: link.y };
    const clockFreeze = Boolean(inv.clock);

    // Edge slide-in: place pending foes on open border cells.
    if (owGrid && !clockFreeze) {
      for (const e of enemies) {
        if (!e.edgePending) continue;
        const placed = tryEdgeSpawn(e, owGrid, link);
        if (placed) {
          e.x = placed.x;
          e.y = placed.y;
          e.dir = placed.dir;
          e.edgePending = false;
          // InitMonster metastate 1 — brief spawn cloud before the foe appears.
          e.spawnCloud = 0x10;
          ejectEnemiesFromSolid([e], owGrid);
        }
      }
      // CheckZora — attrs.zora rooms get one water Zora when the slot is free.
      const zora = trySpawnZora(screen?.attrs, owGrid, enemies, {
        rngByte: dropRng,
      });
      if (zora) tryAddMonster(enemies, zora);
    }

    const newShots = [];
    const newBooms = [];
    for (const e of enemies) {
      if (!clockFreeze) {
        stepEnemy(e, bounds, tileGrid, {
          chase,
          link,
          enemies,
          rngByte: dropRng,
          onArmosAwake,
          fluteJustUsed: flutePulse > 0,
          onDigdoggerSplit: (parent) => {
            const kids = spawnDigdoggerChildren(parent, createEnemy);
            if (kids.length) {
              for (const kid of kids) tryAddMonster(enemies, kid);
              setStatus('Digdogger splits!');
            }
          },
          ...tileOpts,
        });
        tryEnemyShoot(e, newShots, newBooms, { target: chase, rngByte: dropRng });
      } else if (e.invuln > 0) {
        e.invuln -= 1;
      }
      // Clock: keep Link topped up with invuln like NES InvClock.
      if (clockFreeze && inv.invuln < 8) inv.invuln = 8;
      if (e.edgePending || enemyIsHidden(e)) continue;
      if (!enemyTouchesLink(e, link.x, link.y)) {
        if (e.objType === OBJ.LIKE_LIKE) e.captureTimer = 0;
        continue;
      }
      handleEnemyContact(e);
    }
    if (!clockFreeze) {
      projectiles.push(...newShots);
      enemyBooms.push(...newBooms);
      if (mode === 'dungeon' && statueState) {
        projectiles.push(...stepStatues(statueState, link));
      }
    }

    for (const p of projectiles) {
      if (!clockFreeze || p.friendly) stepProjectile(p, bounds);
      if (p.friendly) {
        for (const e of enemies) {
          const wasAlive = e.alive;
          if (p.kind === 0x5b || p.kind === 0x5c) {
            tryArrowHitEnemy(e, p, { enemies });
          } else {
            tryBeamOrRodHitEnemy(e, p, {
              enemies,
              onGleeokHeadDetach: (body) => {
                const head = spawnGleeokHead(body, createEnemy);
                if (head) tryAddMonster(enemies, head);
              },
            });
          }
          if (wasAlive && !e.alive) onEnemyKilled(e);
        }
        continue;
      }
      if (clockFreeze) continue;
      if (!projectileTouchesLink(p, link.x, link.y) || p.damage <= 0) continue;
      const shield = shotBlockedByShield(p, link, inv, {
        idle: !isSwordActive(sword),
      });
      if (shield === SHIELD_RESULT.PARRY) {
        bounceProjectile(p);
        continue;
      }
      if (shield === SHIELD_RESULT.HARM) {
        hurtLinkFrom(p.dir, p.damage);
        p.alive = false;
      }
    }
    // HandleShotBlocked: a spent magic-rod shot leaves a fire when the Book of
    // Magic is held. The fire bypasses the candle's once-per-room limit.
    for (const p of projectiles) {
      if (p.alive || !p.friendly || p.kind !== PROJ.MAGIC_SHOT) continue;
      if (!inv.book || flames.length >= FLAME_SLOTS) continue;
      const fire = createOwFlame(p.x, p.y, p.dir);
      flames.push(fire);
      audio?.playSfx('flame');
      if (mode === 'overworld') applyOwSecretReveal('burn', fire.x, fire.y);
    }
    projectiles = projectiles.filter((p) => p.alive);

    for (const f of flames) {
      if (!f.alive) continue;
      stepOwFlame(f);
      if (mode === 'overworld') {
        applyOwSecretReveal('burn', f.x, f.y);
      }
      for (const e of enemies) {
        const wasAlive = e.alive;
        tryFireHitEnemy(e, f, { enemies });
        if (wasAlive && !e.alive) onEnemyKilled(e);
      }
    }
    flames = flames.filter((f) => f.alive);

    if (mode === 'dungeon') checkZeldaRescue();

    if (boomerang) {
      stepBoomerang(boomerang, link.x, link.y);
      if (boomerang.phase !== BOOM_PHASE.DONE) {
        for (const e of enemies) tryBoomerangHitEnemy(e, boomerang);
      } else {
        boomerang = null;
      }
    }

    // Goriya (and other) hostile boomerangs — return to owner, harm Link.
    if (!clockFreeze && enemyBooms.length) {
      const next = [];
      for (const boom of enemyBooms) {
        const owner = enemies.find((e) => e.id === boom.ownerId && e.alive);
        const rx = owner?.x ?? boom.x;
        const ry = owner?.y ?? boom.y;
        stepBoomerang(boom, rx, ry);
        if (boom.phase === BOOM_PHASE.DONE) continue;
        if (enemyBoomerangHitsLink(boom, link.x, link.y)) {
          hurtLinkFrom(boom.dir, 1);
          boom.phase = BOOM_PHASE.DONE;
          continue;
        }
        next.push(boom);
      }
      enemyBooms = next;
    }

    if (bait) {
      stepBait(bait);
      for (const e of enemies) {
        if (tryFeedGrumble(e, bait)) {
          setStatus('Hungry Goriya eats the bait!');
          audio?.playSfx('secret');
        }
      }
      if (!bait.alive) bait = null;
    }

    stepDrops();
    stepRoomSecrets();
    syncToolSprites();
    syncDropSprites();

    if (inv.invuln > 0) inv.invuln -= 1;
    stepLinkStatus(inv);
    if (flutePulse > 0) flutePulse -= 1;
    applyShove();
    ensureLinkNotInSolid();
  }

  function syncDarkOverlay() {
    if (mode !== 'dungeon' || !roomSprite || !dungeon?.room) {
      darkOverlay.visible = false;
      return;
    }
    if (!roomIsDark(dungeon.room, candleRoom)) {
      darkOverlay.visible = false;
      return;
    }
    darkOverlay.clear();
    darkOverlay
      .rect(roomSprite.x, roomSprite.y, roomSprite.width, roomSprite.height)
      .fill({ color: 0x000008, alpha: 0.92 });
    darkOverlay.visible = true;
  }

  /** Alternate the play area to the white palette row during the fanfare. */
  function syncTriforceFlash() {
    if (!triforceCeremony.whiteFlash || !roomSprite) {
      flashOverlay.visible = false;
      return;
    }
    flashOverlay.clear();
    flashOverlay
      .rect(roomSprite.x, roomSprite.y, roomSprite.width, roomSprite.height)
      .fill({ color: 0xffffff, alpha: 0.7 });
    flashOverlay.visible = true;
  }

  function tickPushBlock(inputMask) {
    if (!pushBlock || mode !== 'dungeon') return;
    const wasIdle = pushBlock.state === PUSH_STATE.IDLE;
    const beforeX = pushBlock.x;
    const beforeY = pushBlock.y;
    const { justCompleted } = stepPushBlock(
      pushBlock,
      link,
      inputMask,
      roomClearedLatch || roomAllDead(enemies),
    );
    if (wasIdle && pushBlock.state === PUSH_STATE.MOVING) {
      // ChangeTileObjTiles($74) at source — full 2×2, then sprite takes over.
      setUwSquareAt(beforeX, beforeY, 0x74);
      patchRoomSquareAt(beforeX, beforeY, 0x74);
    }
    if (justCompleted && dungeon) {
      // ChangeTileObjTiles($B0) at destination — full 2×2.
      setUwSquareAt(pushBlock.x, pushBlock.y, 0xb0);
      dungeon.pushedRooms.add(dungeon.room.roomId);
      applyPushBlockRoomArt();
      if (pushSpawnsStairs(dungeon.room)) {
        const sx = BLOCK_STAIRS_POS.x;
        const sy = BLOCK_STAIRS_POS.y;
        setUwSquareAt(sx, sy, BLOCK_STAIRS_TILE);
        patchRoomSquareAt(sx, sy, BLOCK_STAIRS_TILE);
        setStatus('Stairs appear!');
        audio?.playSfx('secret');
      } else if (pushOpensShutters(dungeon.room)) {
        const sides = openRoomShutters(dungeon.doorState, dungeon.room);
        if (sides.length) refreshDungeonRoomVisual();
        setStatus(sides.length ? `Block pushed — shutter open` : 'Block pushed');
      } else {
        setStatus('Block pushed');
      }
    }
  }

  function syncRaftSprite() {
    if (raftRide.active) {
      if (!raftGfx) {
        // Anim_ItemFrameTiles slot $09 → tile $6C (wide raft).
        const laid = items.itemTexture(chrTileForItemId(0x0c));
        raftGfx = new Sprite(laid.texture);
        raftGfx.scale.set(laid.narrow ? 1 : 1);
        enemyLayer.addChild(raftGfx);
      }
      raftGfx.visible = true;
      raftGfx.x = raftRide.x;
      raftGfx.y = raftRide.y;
    } else if (raftGfx) {
      raftGfx.visible = false;
    }
  }

  function syncWhirlwindSprite() {
    if (whirlwind?.alive) {
      if (!whirlGfx) {
        whirlGfx = new Graphics().circle(8, 8, 7).fill({ color: 0xc0d0e8, alpha: 0.85 });
        enemyLayer.addChild(whirlGfx);
      }
      whirlGfx.visible = true;
      whirlGfx.x = whirlwind.x;
      whirlGfx.y = whirlwind.y;
    } else if (whirlGfx) {
      whirlGfx.visible = false;
    }
  }

  /** DUN-13: draw the active one-tile stepladder object. */
  function syncLadderSprite() {
    if (!ladderObj || (mode !== 'dungeon' && mode !== 'overworld')) {
      if (ladderGfx) ladderGfx.visible = false;
      return;
    }
    if (!ladderGfx) {
      ladderGfx = new Graphics();
      enemyLayer.addChild(ladderGfx);
    }
    const horiz = Boolean(ladderObj.dir & (DIR.LEFT | DIR.RIGHT));
    ladderGfx.clear();
    if (horiz) {
      ladderGfx
        .rect(0, 2, 16, 2)
        .rect(0, 12, 16, 2)
        .rect(4, 2, 2, 12)
        .rect(10, 2, 2, 12)
        .fill(0xc4a35a);
    } else {
      ladderGfx
        .rect(2, 0, 2, 16)
        .rect(12, 0, 2, 16)
        .rect(2, 4, 12, 2)
        .rect(2, 10, 12, 2)
        .fill(0xc4a35a);
    }
    ladderGfx.visible = true;
    ladderGfx.x = ladderObj.x;
    ladderGfx.y = ladderObj.y;
  }

  /** Lightweight overlays for boom / bait; push block uses UW CHR. */
  function syncToolSprites() {
    const drawnBoom =
      boomerang && boomerang.phase !== BOOM_PHASE.DONE
        ? boomerang
        : enemyBooms.find((b) => b.phase !== BOOM_PHASE.DONE);
    if (drawnBoom) {
      if (!boomGfx) {
        boomGfx = new Graphics().circle(4, 4, 4).fill(0xf0d060);
        enemyLayer.addChild(boomGfx);
      }
      boomGfx.visible = true;
      boomGfx.x = drawnBoom.x;
      boomGfx.y = drawnBoom.y;
    } else if (boomGfx) {
      boomGfx.visible = false;
    }

    if (bait?.alive) {
      if (!baitGfx) {
        baitGfx = new Graphics().rect(2, 2, 12, 12).fill(0xc06030);
        enemyLayer.addChild(baitGfx);
      }
      baitGfx.visible = true;
      baitGfx.x = bait.x;
      baitGfx.y = bait.y;
    } else if (baitGfx) {
      baitGfx.visible = false;
    }

    // NES draws the block sprite only while moving; idle/done use BG tiles.
    if (pushBlock && pushBlock.state === PUSH_STATE.MOVING) {
      const tex = ensurePushBlockTexture();
      if (tex) {
        if (!pushGfx) {
          pushGfx = new Sprite(tex);
          enemyLayer.addChild(pushGfx);
        } else if (pushGfx.texture !== tex) {
          pushGfx.texture = tex;
        }
        pushGfx.visible = true;
        pushGfx.x = pushBlock.x;
        pushGfx.y = pushBlock.y;
      }
    } else if (pushGfx) {
      pushGfx.visible = false;
    }
  }

  function tryUseB() {
    const slot = inv.selectedB;

    if (slot === B_ITEM.BOMB || (slot === B_ITEM.NONE && inv.bombs > 0)) {
      if (inv.bombs <= 0) {
        setStatus('No bombs');
        return;
      }
      if (bombs.some((b) => b.phase === 'fuse' || b.phase === 'explode')) {
        setStatus('Bomb already out');
        return;
      }
      inv.selectedB = B_ITEM.BOMB;
      inv.bombs -= 1;
      const bomb = placeBomb(link.x, link.y, link.dir);
      bombs.push(bomb);
      refreshHud();
      audio?.playSfx('bomb_set');
      setStatus(`Bomb set (${inv.bombs} left)`);
      return;
    }

    if (slot === B_ITEM.BOOMERANG) {
      if (!inv.boomerang && !inv.magicBoomerang) {
        setStatus('No boomerang');
        return;
      }
      if (boomerang && boomerang.phase !== BOOM_PHASE.DONE) {
        setStatus('Boomerang out');
        return;
      }
      boomerang = throwBoomerang(
        link.x,
        link.y,
        link.dir,
        Boolean(inv.magicBoomerang),
      );
      audio?.playSfx('arrow');
      setStatus('Boomerang!');
      return;
    }

    if (slot === B_ITEM.BAIT) {
      if (inv.food <= 0) {
        setStatus('No bait');
        return;
      }
      if (bait?.alive) {
        setStatus('Bait already out');
        return;
      }
      inv.food -= 1;
      bait = placeBait(link.x, link.y, link.dir);
      refreshHud();
      invUi.refresh(inv, dungeon);
      setStatus('Bait dropped');
      return;
    }

    if (slot === B_ITEM.CANDLE) {
      if (flames.length >= FLAME_SLOTS) {
        setStatus('Flame already out');
        return;
      }
      if (mode === 'overworld') {
        const result = tryUseCandle(inv, candleRoom, null);
        if (!result.ok) {
          setStatus(result.reason ?? 'Candle failed');
          return;
        }
        const lit = createOwFlame(link.x, link.y, link.dir);
        flames.push(lit);
        applyOwSecretReveal('burn', lit.x, lit.y);
        audio?.playSfx('flame');
        setStatus('Candle flame');
        return;
      }
      const result = tryUseCandle(inv, candleRoom, dungeon?.room);
      if (!result.ok) {
        setStatus(result.reason ?? 'Candle failed');
        return;
      }
      flames.push(createOwFlame(link.x, link.y, link.dir));
      audio?.playSfx('flame');
      syncDarkOverlay();
      setStatus(result.lit ? 'Candle lights the room' : 'Candle flame');
      return;
    }

    if (slot === B_ITEM.POTION) {
      if (canShowLetter(caveScene.cave, inv)) {
        showLetter(inv);
        audio?.playSfx('secret');
        caveScene.refreshWares(caveTaken, false);
        refreshHud();
        invUi.refresh(inv, dungeon);
        setStatus('You showed the letter — the wares appear');
        return;
      }
      const result = drinkPotion(inv);
      if (!result.ok) {
        setStatus(result.reason ?? 'No potion');
        return;
      }
      refreshHud();
      invUi.refresh(inv, dungeon);
      setStatus(result.potion ? 'Potion! (now blue)' : 'Potion restored hearts');
      return;
    }

    if (slot === B_ITEM.FLUTE) {
      if (!inv.flute) {
        setStatus('No recorder');
        return;
      }
      audio?.playSfx('flute');
      if (mode === 'overworld') {
        if (whirlwind?.alive) {
          setStatus('Whirlwind already out');
          return;
        }
        // Room $42 reveals in Q1 and summons in Q2; the other ten invert that.
        if (fluteActionForRoom(roomId, inv.quest === 2 ? 2 : 1) === 'reveal') {
          setStatus(
            startPondSecret(pondSecret)
              ? 'The waters recede…'
              : 'Recorder melody…',
          );
          return;
        }
        if (canSummonWhirlwind(inv, lastWhirlwindLevel)) {
          whirlwind = createWhirlwind(link.y);
          setStatus('Whirlwind!');
          return;
        }
        setStatus('Recorder melody…');
      } else if (mode === 'dungeon') {
        flutePulse = 0x40; // Digdogger flute transform window
        setStatus('Recorder melody…');
      } else {
        setStatus('Recorder…');
      }
      return;
    }

    if (slot === B_ITEM.ROD) {
      if (!inv.rod) {
        setStatus('No magical rod');
        return;
      }
      if (projectiles.some((p) => p.friendly && p.alive)) {
        setStatus('Shot already out');
        return;
      }
      projectiles.push(shootMagicRod(link.x, link.y, link.dir));
      setStatus(inv.book ? 'Magic rod (book)' : 'Magic rod!');
      return;
    }

    if (slot === B_ITEM.BOW) {
      if (projectiles.some((p) => p.friendly && p.alive)) {
        setStatus('Arrow already out');
        return;
      }
      // NES WieldArrow: no shot if broke; each fire posts RupeesToSubtract (+1).
      const spend = trySpendArrowShot(inv);
      if (!spend.ok) {
        setStatus(spend.reason === 'rupees' ? 'Need a rupee to fire' : 'Need bow and arrows');
        return;
      }
      projectiles.push(shootArrow(link.x, link.y, link.dir, inv.arrow));
      audio?.playSfx('arrow');
      refreshHud();
      setStatus(inv.arrow >= 2 ? 'Silver arrow!' : 'Arrow!');
      return;
    }

    setStatus('Select a B item (Enter inventory, X to cycle)');
  }

  function stepOverworld(inputMask) {
    if (busy || !screen) return;

    // Screen scroll freezes input/combat; Link is carried by ScrollWorld.
    if (scrollLoading) return;
    if (isScrolling(screenScroll)) {
      stepActiveScreenScroll();
      return;
    }

    // Pond fairy first so ObjState $40 halt applies to this frame's movement.
    const fairyHalt = stepPondFairyFountain();
    const moveMask = fairyHalt ? 0 : inputMask;

    // Raft ride freezes normal movement (UpdateDock halt). Must run even if
    // Link is dying — otherwise combat can zero hearts mid-ride and the game
    // loop skips physics while the raft sprite is left stranded.
    if (raftRide.active) {
      const r = stepRaftRide(link, raftRide, roomId);
      if (r?.leave) {
        audio?.playSfx('secret');
        setStatus('Raft across the water!');
        void loadOverworldScreen(r.leave.nextRoomId, {
          x: r.leave.x,
          y: r.leave.y,
          dir: r.leave.dir,
        });
        syncRaftSprite();
        return;
      }
      if (r?.landed) {
        audio?.playSfx('secret');
        setStatus('Docked');
      }
      // No stepCombat during dock scroll — Link is halted on the raft.
      syncRaftSprite();
      return;
    }

    if (inv.dead) return;

    stepPondDrain();

    if (
      !fairyHalt
      && !whirlwind?.carrying
      && !isSwordActive(sword)
      && inv.shovePixels <= 0
      && (inv.itemLiftTimer ?? 0) <= 0
    ) {
      const owOpts = prepareLadderTileOpts(
        screen.tileGrid,
        moveMask,
        'overworld',
        overworldTileOptsWithLadder(inv, roomId),
      );
      // ObjectFirstUnwalkableTile drops to $99 once the pond has drained.
      const pondFloor = pondFirstUnwalkable(pondSecret);
      if (pondFloor != null) owOpts.firstUnwalkable = pondFloor;
      const gridOffsetBefore = link.gridOffset;
      stepLink(
        link,
        screen.tileGrid,
        moveMask,
        overworldLinkQSpeed(link, screen.tileGrid),
        roomId,
        owOpts,
      );
      // Z_07.asm:3248 — a whole tile of travel clears the subroom indicator.
      if (undergroundExitType && gridOffsetBefore !== 0 && link.gridOffset === 0) {
        undergroundExitType = 0;
      }
      ladderObj = stepLadderObject(ladderObj, link);
      syncLadderSprite();
      // CheckPassiveTileObjects — wake Armos / Flying Ghini from $BC–$C3.
      const face = moveMask & 0x0f;
      if (face && link.gridOffset === 0) {
        const spawned = trySpawnPassiveTileObject(
          link,
          screen.tileGrid,
          face,
          enemies,
          createEnemy,
        );
        if (spawned) tryAddMonster(enemies, spawned);
      }
    }

    if (!fairyHalt && tryStartRaftRide(link, roomId, inv, raftRide)) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      audio?.playSfx('secret');
      setStatus('Raft!');
      syncRaftSprite();
      return;
    }

    if (whirlwind?.alive) {
      stepWhirlwind(whirlwind, link);
      if (whirlwind.done) {
        const level = nextWhirlwindLevel(inv.triforce, lastWhirlwindLevel);
        whirlwind = null;
        if (level > 0) {
          lastWhirlwindLevel = level;
          const ty = TELEPORT_YS[level - 1] ?? 0x8d;
          setStatus(`Whirlwind → Level ${level}`);
          void enterLevel(level, {
            fromRoomId: roomId,
            fromAttrs: screen?.attrs ?? {},
            spawnOverride: { x: 0x78, y: ty, dir: DIR.UP },
          });
          return;
        }
      }
    }

    stepCombat();
    syncRaftSprite();
    syncWhirlwindSprite();

    const transition = checkScreenTransition(link, roomId);
    if (transition) {
      // CheckMazes runs on every OW transition: the Lost Woods / Lost Hills
      // loop back on themselves until their direction sequence is walked.
      // Denied exits still scroll, but target the same room (woods loop).
      const maze = checkMaze(mazeState, roomId, transition.dir);
      if (maze.playSecretTune) audio?.playSfx('secret');
      void beginOverworldScroll(transition, maze);
      return;
    }

    // Push graves / rocks: exact X + vertical hold $10.
    if (inputMask && screen.secrets?.length) {
      const pushed = tryPushGraveSecret(
        screen.secrets,
        owSecretsRevealed,
        roomId,
        link,
        screen.tileGrid,
        link.dir,
        gravePushHold,
        { bracelet: inv.bracelet },
      );
      if (pushed.length) {
        for (const secret of pushed) {
          patchOwBgSquare(secret.col, secret.row, tilesForSecretMarker(secret.marker));
        }
        audio?.playSfx('secret');
        setStatus('Pushed a secret open!');
      }
    } else {
      gravePushHold.clear();
    }

    const cave = undergroundExitType
      ? null
      : checkCaveEntry(link, screen.tileGrid, screen.attrs, roomId);
    if (!cave) {
      caveLatch = false;
    } else if (!caveLatch) {
      caveLatch = true;
      if (cave.kind === 'level') {
        void enterLevel(cave.id);
      } else {
        openCave(cave.id);
      }
    }
  }

  function stepDungeon(inputMask) {
    if (endingUi.visible) return;
    if (!roomSprite || !dungeon?.room || inv.dead) return;

    if (scrollLoading) return;
    if (isScrolling(screenScroll)) {
      stepActiveScreenScroll();
      return;
    }

    const play = dungeonPlayOrigin();
    const floor = floorFrame();
    const left = play.x;
    const right = play.x + 256 - 16;
    const top = play.y;
    const bottom = play.y + 176 - 16;
    const level = dungeon.levelData;
    const origin = { x: floor.x, y: floor.y };
    const roomSize = { w: floor.w, h: floor.h };

    if (
      !isSwordActive(sword)
      && inv.shovePixels <= 0
      && (inv.itemLiftTimer ?? 0) <= 0
    ) {
      // NES: DoorwayDir ≠ 0 skips BoundByRoom + tile collision; otherwise
      // ObjectRoomBoundsUW + GetCollidingTileMoving both apply.
      const inDoor = linkInDoorwayCorridor(link, dungeon.room, {
        doorwayBlockSide: dungeon.doorwayBlockSide,
      });
      if (inDoor || !dungeonTileGrid) {
        const open = Array.from({ length: 22 }, () => Array(32).fill(0x26));
        ladderObj = null;
        stepLink(link, open, inputMask, undefined, NO_ROOM_BOUNDS);
        // DoorwayDir cavities use NES PlayerScreenEdgeBounds — not the soft
        // play clamp — so Link cannot walk to X<0 and drop DoorwayDir.
        clampUwDoorwayPos(link);
      } else {
        const uwOpts = prepareLadderTileOpts(
          dungeonTileGrid,
          inputMask,
          'dungeon',
          dungeonTileOpts(inv),
          Boolean(dungeon.doorwayBlockSide) || inDoor,
        );
        // NES skips BoundByRoom in mode 9 (cellar) so the ladder can climb
        // past ObjectRoomBoundsUW top `$5E` into the HUD band for CheckSubroom.
        const inCellar = isCellarRoom(dungeon.room, level);
        const roomBounds = inCellar ? NO_ROOM_BOUNDS : UW_ROOM_BOUNDS;
        stepLink(link, dungeonTileGrid, inputMask, undefined, roomBounds, uwOpts);
        ladderObj = stepLadderObject(ladderObj, link);
        link.x = Math.max(left, Math.min(right, link.x));
        // Cellars: allow Y into the HUD band so CheckSubroom (Y < $40) can fire.
        const minY = inCellar ? CELLAR_EXIT_MIN_Y : top;
        link.y = Math.max(minY, Math.min(bottom + 8, link.y));
      }
    }

    tickPushBlock(inputMask);
    stepCombat();
    syncLadderSprite();

    // Cellar: walk up past Y<$40 to return (NES CheckSubroom mode 9).
    // Stairs: CheckWarps UW — GetCollidableTileStill tile $70–$73.
    if (isCellarRoom(dungeon.room, level)) {
      const up = checkCellarExit(link, dungeon.room, level, play, inputMask);
      if (up && !busy) {
        stairsLatch = true;
        void loadDungeonRoom(up.nextRoomId, DIR.DOWN, cellarReturnSpawn(up.attrsC)).then(
          (ok) => {
            if (!ok) stairsLatch = false;
          },
        );
        return;
      }
    } else if (checkUwStairsEntry(link, dungeonTileGrid)) {
      if (!stairsLatch && !busy) {
        const cellarId = cellarForStairsRoom(level, dungeon.room.roomId);
        if (cellarId != null) {
          stairsLatch = true;
          dungeon.cellarSourceRoomId = dungeon.room.roomId;
          setStatus(`Stairs → cellar $${cellarId.toString(16)}`);
          audio?.playSfx('stairs');
          void loadDungeonRoom(cellarId, DIR.UP).then((ok) => {
            if (!ok) stairsLatch = false;
          });
          return;
        }
        setStatus('Stairs — no cellar mapped for this room');
      }
    } else {
      stairsLatch = false;
    }

    if (dungeon.doorwayBlockSide && doorwayLatchCleared(link, dungeon.doorwayBlockSide)) {
      dungeon.doorwayBlockSide = null;
    }

    // South doorway of the start room returns to overworld.
    if (
      dungeon.room.roomId === level.startRoom
      && link.gridOffset === 0
      && (link.dir & DIR.DOWN)
      && inDoorway(link, 'south')
    ) {
      void exitDungeon();
      return;
    }

    // No room-to-room exits from cellars (only the ladder).
    if (isCellarRoom(dungeon.room, level)) return;

    const exit = checkDungeonRoomExit(link, dungeon.room, origin, roomSize, {
      doorState: dungeon.doorState,
      inv,
      rooms: level.rooms,
    });
    if (exit) {
      if (exit.unlocked) {
        refreshDungeonRoomVisual();
        refreshHud();
        audio?.playSfx('door');
        setStatus(`Unlocked door (${inv.keys} keys left)`);
      }
      void beginDungeonScroll(exit);
    }
  }

  /**
   * Mode $0D after the credits: rebuild the profile on the second quest and
   * restart from the overworld entrance.
   */
  async function beginSecondQuestAfterVictory() {
    if (questCompleted !== 1) {
      // Already on Q2 — the run is over, so go back to the file select.
      endingUi.hide();
      playing = false;
      titleUi.setSlots(saveStore.listSlots());
      titleUi.show();
      audio?.playMusic('title');
      return;
    }
    questCompleted = 0;
    endingUi.hide();
    dungeon = null;
    caveTaken.clear();
    owSecretsRevealed.clear();
    dungeonProgress.clear();
    resetProfileToSecondQuest(inv);
    await loadOverworldScreen(worldIndex.startScreen, {
      x: worldIndex.startX,
      y: worldIndex.startY,
      dir: worldIndex.startDir,
    });
    refreshHud();
    invUi.refresh(inv, invView());
    persistSave('second quest');
    setStatus('SECOND QUEST — good luck!');
  }

  /**
   * @param {number} slot
   * @param {'new' | 'continue'} kind
   * @param {string} [name]
   */
  async function beginPlay(slot, kind, name = 'LINK') {
    activeSlot = slot;
    saveName = (name || 'LINK').slice(0, 8).toUpperCase();
    caveTaken.clear();
    owSecretsRevealed.clear();
    dungeonProgress.clear();
    Object.assign(inv, createInventory());
    resetRupeeRoll(rupeeRoll, inv.rupees ?? 0);
    undergroundExitType = 0;
    hud.root.visible = true;
    world.visible = true;

    if (kind === 'continue') {
      const payload = saveStore.load(slot);
      if (!payload) {
        setStatus('Empty slot');
        return;
      }
      const meta = applyLoadedSave(payload, {
        inv,
        owSecretsRevealed,
        caveTaken,
        dungeonProgress,
      });
      saveName = meta.name;
      deathCount = meta.deaths ?? 0;
      resetRupeeRoll(rupeeRoll, inv.rupees ?? 0);
      titleUi.hide();
      // Keep playing=false until world is restored so bootstrap OW load
      // cannot overwrite a mid-dungeon save as overworld-only.
      applyDebugKit();
      const healed = await restoreWorldFromSave(meta.position);
      playing = true;
      persistSave('continue');
      setStatus(
        healed
          ? `Continued ${saveName} — 0 HP, reset to start`
          : `Continued ${saveName} (slot ${slot + 1})`,
      );
      return;
    }

    // New game
    saveStore.erase(slot);
    deathCount = 0;
    // Registering the name ZELDA starts the file on the second quest.
    const secondQuest = nameUnlocksSecondQuest(saveName);
    if (secondQuest) resetProfileToSecondQuest(inv);
    resetRupeeRoll(rupeeRoll, inv.rupees ?? 0);
    applyDebugKit();
    titleUi.hide();
    await loadOverworldScreen(worldIndex.startScreen, {
      x: worldIndex.startX,
      y: worldIndex.startY,
      dir: worldIndex.startDir,
    });
    playing = true;
    persistSave('new game');
    setStatus(
      secondQuest
        ? `Registered ${saveName} — slot ${slot + 1} · SECOND QUEST`
        : `Registered ${saveName} — slot ${slot + 1}`,
    );
  }

  titleUi.onChoose((ev) => {
    if (ev.action === 'options') {
      optionsUi.open();
      return;
    }
    if (ev.action === 'erase') {
      saveStore.erase(ev.slot);
      titleUi.setSlots(saveStore.listSlots());
      setStatus(`Erased slot ${ev.slot + 1}`);
      return;
    }
    if (ev.action === 'rename') {
      const updated = saveStore.rename(ev.slot, ev.name ?? 'LINK');
      titleUi.setSlots(saveStore.listSlots());
      setStatus(updated ? `Renamed slot ${ev.slot + 1}` : 'Rename failed');
      return;
    }
    if (ev.action === 'new') {
      void beginPlay(ev.slot, 'new', ev.name);
      return;
    }
    if (ev.action === 'continue') {
      void beginPlay(ev.slot, 'continue');
    }
  });
  titleUi.setSlots(saveStore.listSlots());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F5') {
      e.preventDefault();
      savePracticeState();
      return;
    }
    if (e.code === 'F9') {
      e.preventDefault();
      void loadPracticeState();
    }
  });

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSave();
  });

  /** Attract mode runs until Start, then hands off to file select. */
  let inAttract = !skipTitle;
  if (skipTitle) {
    const slotParam = Number(urlParams.get('slot') ?? '0');
    const slot = Number.isFinite(slotParam) ? Math.max(0, Math.min(2, slotParam)) : 0;
    if (urlParams.get('debug') === '1' || !saveStore.load(slot)) {
      await beginPlay(slot, 'new', 'DEBUG');
    } else {
      await beginPlay(slot, 'continue');
    }
  } else {
    titleUi.hide();
    hud.root.visible = false;
    world.visible = false;
    demoUi.begin();
    setStatus('Title — press Start');
    audio?.playMusic('title');
  }

  let acc = 0;
  const stepMs = 1000 / TARGET_FPS;
  let last = performance.now();

  app.ticker.add(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    if (acc > stepMs * 3) acc = stepMs * 3;

    if (optionsUi.visible) {
      acc = 0;
      return;
    }

    if (inAttract && demoUi.visible) {
      const startDemo = input.pressedStart();
      while (acc >= stepMs) {
        acc -= stepMs;
        const demoTick = demoUi.tick({ start: startDemo });
        if (demoTick.playTitleMusic) audio?.playMusic('title');
        if (demoTick.finished) {
          demoUi.hide();
          inAttract = false;
          // File select still owns the screen; HUD returns when play begins.
          titleUi.setSlots(saveStore.listSlots());
          titleUi.show();
          setStatus('File select — Enter to start · O options');
          audio?.playMusic('title');
          break;
        }
      }
      return;
    }

    if (!playing || titleUi.visible) {
      titleUi.tick(input, DIR);
      acc = 0;
      return;
    }

    // Periodic autosave (~15s) while exploring.
    if (now - lastAutosave > 15000) persistSave();

    // Edge-detect buttons once per frame (not once per physics step).
    const startPressed = input.pressedStart();
    const aPressed = input.pressedA();
    const bPressed = input.pressedB();

    // Mode $13 owns Start once Zelda is rescued.
    if (endingUi.visible) {
      stepEndingMode({ start: startPressed });
      acc = 0;
      return;
    }

    // Mode $08 reads Start and Select itself; see stepDeathMode.
    let deathInput = { select: input.pressedSelect(), start: startPressed };
    if (startPressed && !inv.dead) {
      if (invUi.open) {
        invUi.close();
        persistSave();
      } else {
        // Same as NES: Start opens the submenu in caves; walk south to leave.
        invUi.toggle(inv, invView());
      }
    }

    // While inventory is open, B cycles the B slot (does not place items).
    if (invUi.open && invUi.phase === 'open' && bPressed) {
      cycleBItem(inv);
      refreshHud();
      invUi.refresh(inv, invView());
    }
    // NES CurVScroll ±3px/frame — slide panel + scroll the playfield.
    // Status bar docks to the bottom while the submenu is open (original layout).
    invUi.tick();
    world.y = invUi.worldSlideY();
    hud.root.y = Math.round(invUi.hudDockT() * (INTERNAL_H - HUD_HEIGHT));

    // Letter-show is the only B action allowed inside a cave (medicine shop).
    if (
      !inv.dead
      && !invUi.open
      && mode === 'cave'
      && bPressed
      && canShowLetter(caveScene.cave, inv)
    ) {
      tryUseB();
    }

    if (!inv.dead && !invUi.open && mode !== 'cave' && !pondFairyHalt) {
      if (aPressed) {
        const swung =
          canSwingSword(inv) && tryStartSword(sword, link.dir, inv.sword);
        if (swung) audio?.playSfx('sword');
        if (inv.sword < 1) setStatus('No sword — stand still on the cave mouth');
      }
      if (bPressed) {
        tryUseB();
      }
    }

    while (acc >= stepMs) {
      acc -= stepMs;
      frameCounter = (frameCounter + 1) & 0xff;

      if (invUi.open) {
        continue;
      }

      // UpdateHeartsAndRupees → World_ChangeRupees: spin the status-bar total
      // one step every other frame, chirping the heart tune as it goes.
      if (stepRupeeRoll(rupeeRoll, inv.rupees ?? 0).playTune) {
        audio?.playSfx('text');
        refreshHud();
      }

      // Keep an in-progress raft ride ticking even after death so Link is not
      // stranded mid-water with a frozen dock object.
      const raftInProgress = mode === 'overworld' && raftRide.active;
      if (inv.dead && !raftInProgress) {
        if (deathUi.visible) {
          // Physics may run several steps per animation frame; the edge-
          // detected presses must only be seen by the first of them.
          stepDeathMode(deathInput);
          deathInput = NO_DEATH_INPUT;
        }
        continue;
      }

      // GameMode $12 halts the world until hearts finish filling.
      if (triforceCeremonyActive(triforceCeremony)) {
        const step = stepTriforceCeremony(triforceCeremony, inv);
        if (step.playFillTune) audio?.playSfx('text');
        refreshHud();
        if (step.finished) {
          invUi.refresh(inv, invView());
          persistSave();
        }
        continue;
      }

      // Tune0 $40 is re-requested every frame; arbitration drops it when
      // square 1 is busy, so a single call would usually be swallowed.
      if (!inv.dead && (inv.halfHearts ?? 0) > 0 && (inv.halfHearts ?? 0) <= 2) {
        audio?.playSfx('low_health');
      }

      const mask = inv.paralyzed > 0 || inv.dead ? 0 : input.mask();
      if (mode === 'cave') {
        stepCave(mask);
      } else if (mode === 'overworld' && screen) {
        stepOverworld(mask);
      } else if (mode === 'dungeon') {
        stepDungeon(mask);
      }
    }

    if (mode === 'cave' && !invUi.open) caveScene.tick();
    if (mode === 'dungeon') personDialogue.tick();

    const attacking = isSwordActive(sword);
    const drawY = mode === 'overworld' ? link.y + 2 : link.y;
    linkSprite.texture = frames.textureFor(link.dir, link.animFrame, attacking);
    linkSprite.x = link.x;
    linkSprite.y = drawY;
    linkSprite.alpha = inv.invuln > 0 && (inv.invuln & 2) ? 0.45 : 1;
    // During mode $11 the sequence decides when Link is on screen.
    linkSprite.visible = !deathUi.visible || deathLinkVisible;

    syncEnemySprites();
    drawBombs();
    drawSwordBlade();

    syncTriforceFlash();

    // Collision probe readout + optional solid-tile overlay (?debug=1 / ?coll=1).
    collDebugGfx.clear();
    collDebugGfx.visible = false;
    if (mode === 'dungeon' && dungeonTileGrid && (debugCollision || urlParams.get('coll') === '1')) {
      const probe = probeUwCollision(dungeonTileGrid, link.x, link.y, dungeonTileOpts(inv));
      posEl.textContent = `${mode} $${roomId.toString(16).padStart(2, '0')}  ${formatCollisionReadout(
        probe,
        link.gridOffset,
      )}${attacking ? ' ATK' : link.moving ? ' walk' : ''}`;
      collDebugGfx.visible = true;
      const fu = UW_FIRST_UNWALKABLE;
      for (let r = 0; r < dungeonTileGrid.length; r += 1) {
        const row = dungeonTileGrid[r];
        for (let c = 0; c < row.length; c += 1) {
          if (!isUwSolidTile(row[c], fu)) continue;
          collDebugGfx.rect(c * 8, HUD_HEIGHT + r * 8, 8, 8);
        }
      }
      collDebugGfx.fill({ color: 0xff2244, alpha: 0.28 });
      // Look-ahead sample column/row for current facing (NES hotspot).
      let sx = link.x;
      let sy = link.y + 0x0b;
      if (link.dir & DIR.LEFT) sx = (link.x - 8) & 0xf8;
      else if (link.dir & DIR.RIGHT) sx = (link.x + 0x10) & 0xf8;
      else if (link.dir & DIR.UP) sy = link.y + 0x0b - 8;
      else if (link.dir & DIR.DOWN) sy = link.y + 0x0b + 8;
      else sx = link.x & 0xf8;
      collDebugGfx.rect(sx, sy - 1, 8, 2);
      collDebugGfx.fill({ color: 0xffff00, alpha: 0.9 });
    } else {
      posEl.textContent = `${mode} $${roomId.toString(16).padStart(2, '0')}  x=$${link.x
        .toString(16)
        .padStart(2, '0')} y=$${link.y.toString(16).padStart(2, '0')}${
        attacking ? ' ATK' : link.moving ? ' walk' : ''
      }`;
    }
  });
}

main().catch((err) => {
  setStatus(err.message || 'Failed to start');
  console.error(err);
});
