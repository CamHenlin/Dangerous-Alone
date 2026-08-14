import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { initPixiApp } from '@shared/pixiBoot.js';
import {
  DIR,
  HUD_HEIGHT,
  UW_FIRST_UNWALKABLE,
  isOwWarpTile,
} from '@shared/collision.js';
import {
  CONTINUOUS_OW,
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
  overworldExitSpawn,
  standingTile,
} from '@shared/world.js';
import {
  PLAY_H,
  PLAY_W,
  cameraLocalForLink,
  detectRoomCross,
  foggedRooms,
  localToWorld,
  rebaseDelta,
  rectFullyOffCamera,
  roomPlayOrigin,
  worldToLocal,
} from '@shared/continuousCamera.js';
import {
  getLinkCollidingTileMulti,
  getMonsterCollidingTileMulti,
  standingTileMulti,
} from '@shared/multiRoomTiles.js';
import {
  chaseBoundsForCamera,
  claimLivingSpawnPoints,
  clearSpawnClaimsForRoom,
  cullOffscreenEnemies,
  enemiesInRoom,
  filterUnoccupiedSpawnPoints,
  mazeLoopSpawn,
  orphanedEnemySpriteIds,
  releaseSpawnLatch,
  roomHasLivingEnemies,
  roomsForCamera,
  roomsNeedingSpawn,
  shiftPositions,
  tagEnemyHomeRoom,
  uwEnemyBoundsForRoom,
} from '@shared/roomStream.js';
import {
  clearClockFreeze,
  clockFreezeActive,
  enemyIsClockFrozen,
  tagVisibleEnemiesForClock,
} from '@shared/clockFreeze.js';
import {
  activateEnemiesInView,
  enemyAwaitingView,
  enemyCombatActive,
  markEnemiesAwaitingView,
  skipsSpawnCloud,
} from '@shared/enemyViewActivation.js';
import { tryTakeRupeeStash } from '@shared/rupeeStash.js';
import {
  beginScreenScroll,
  createScreenScroll,
  isScrolling,
  stepScreenScroll,
} from '@shared/screenScroll.js';
import { createStreamView } from './streamView.js';
import {
  loadBombCrackTexture,
  syncBombCrackSprites,
} from './bombCrackOverlay.js';
import {
  owBombCrackPlacements,
  uwBombCrackPlacements,
} from '@shared/bombCrack.js';
import { checkMaze, createMazeState } from '@shared/mazes.js';
import { nesColor } from '@shared/nesPalette.js';
import { graphicsUrl, markScaled, px, scale, setGraphicsMode, tilePx } from '@shared/gfxScale.js';
import {
  createRupeeRoll,
  resetRupeeRoll,
  stepRupeeRoll,
} from '@shared/rupeeRoll.js';
import {
  POND_STAIRS_COL,
  POND_STAIRS_ROW,
  createPondSecret,
  pondCollisionFloor,
  pondSecretKey,
  restorePondSecret,
  revealPondStairs,
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
  clearShopVisitTaken,
  describeCave,
  getCave,
  moneyGameResultLabels,
  moneyGameStakeLabels,
  rollMoneyGameAmounts,
  takeAnyRoadDest,
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
  nudgeLinkOntoGraveAxis,
  tryPushGraveSecret,
  tryRevealSecrets,
} from '@shared/owSecrets.js';
import {
  contrastingTreePaletteRow,
  paletteRowForSquare,
  recolorBurnTreeSquareRgba,
} from '@shared/overworld.js';
import { createOwHeartContainer } from '@shared/owHeartContainer.js';
import { owBgTileSourceRect } from '@shared/owBgTiles.js';
import { trySpawnPassiveTileObject } from '@shared/passiveTileObjects.js';
import {
  cancelSword,
  createSwordState,
  isSwordActive,
  stepSword,
  swordDrawPos,
  swordSpawnsShot,
  swordSpriteRotation,
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
  wallmasterIsCapturing,
} from '@shared/enemies.js';
import { trySpawnZora } from '@shared/zora.js';
import {
  findPondFairy,
  stepPondFairy,
} from '@shared/pondFairy.js';
import {
  clearGleeokHeads,
  dodongoIsVisible,
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
  planRaftNorthApproach,
  snapRaftNorthEntry,
  stepRaftRide,
  tryStartRaftRide,
} from '@shared/raft.js';
import {
  bossRoarSfx,
  enemyUsesUwRoomBounds,
  isBossType,
  isGanon,
  isGleeok,
  isZelda,
} from '@shared/bosses.js';
import { sfxNamesForWeaponHit } from '@shared/combatSfx.js';
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
import { personOfferWares } from '@shared/personWares.js';
import {
  caveStory,
  itemStory,
  levelCompletionStory,
  levelEntryStory,
  personStory,
} from '@shared/storyText.js';
import {
  activeDungeonHintMarks,
  activeMapMarks,
  addHintMarks,
  levelEntranceScreens,
  pruneHintMarks,
} from '@shared/mapMarks.js';
import { placeBait, stepBait } from '@shared/bait.js';
import { isGrumble, tryFeedGrumble } from '@shared/grumble.js';
import {
  applyPersonBlocking,
  roomHasPersonBlocker,
} from '@shared/personBlocking.js';
import {
  dismissLevel9EntranceGate,
  filterLevel9EntranceGate,
} from '@shared/personText.js';
import {
  TELEPORT_YS,
  canSummonWhirlwind,
  createWhirlwind,
  fluteActionForRoom,
  nextWhirlwindLevel,
  stepWhirlwind,
} from '@shared/whirlwind.js';
import { createStatueState, stepStatues } from '@shared/statues.js';
import { tryAddMonsterToRoom, tryEdgeSpawn } from '@shared/spawn.js';
import {
  UW_PRIMARY_SQUARES,
  buildDungeonPlayGrid,
  clampUwDoorwayPath,
  createDoorState,
  detectUwDoorCross,
  dirForSide,
  doorwayLatchCleared,
  dungeonFloorRect,
  closeShutterBehind,
  dungeonNeighbor,
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
  sealLastBossShutters,
  tryBombDoors,
  tryUnlockFacingKeyDoor,
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
  renderDoorFrameOverlayRgba,
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
  streamableUwRooms,
} from '@shared/dungeonCellar.js';
import {
  BLOCK_STAIRS_POS,
  BLOCK_STAIRS_TILE,
  PUSH_STATE,
  createPushBlock,
  linkPushingBlock,
  nudgeLinkOntoPushAxis,
  pushBlockSquareTiles,
  pushOpensShutters,
  pushSpawnsStairs,
  stepPushBlock,
} from '@shared/pushBlock.js';
import {
  FLAME_SLOTS,
  armDarkRoomAutoLight,
  createCandleRoomState,
  createOwFlame,
  roomIsDark,
  stepDarkRoomAutoLight,
  stepOwFlame,
  tryUseCandle,
} from '@shared/candle.js';
import {
  SECRET,
  applyRoomClear,
  countsTowardRoomClear,
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
  resetGanonEncounterInStorage,
  resetProfileToSecondQuest,
  resolveZeroHeartContinue,
} from '@shared/save.js';
import { createPracticeStore } from '@shared/practiceSave.js';
import { codeLabel, loadOptions, saveOptions } from '@shared/options.js';
import { createInput } from './input.js';
import { createLinkFrames } from './linkSprite.js';
import { createDeathUi } from './deathUi.js';
import { createEndingUi } from './endingUi.js';
import { skipEndingToEpilogue } from '@shared/endingSequence.js';
import { createDemoUi } from './demoUi.js';
import { createNameEntryUi } from './nameEntryUi.js';
import { CONTINUE_HALF_HEARTS } from '@shared/continueMenu.js';
import { createItemSprites } from './itemSprites.js';
import { createEnemySprites } from './enemySprites.js';
import { enemySpriteOffset } from '@shared/bossSpriteLayouts.js';
import { createHud } from './hud.js';
import { createInventoryUi } from './inventoryUi.js';
import { createCaveScene } from './caveScene.js';
import { createTextBox } from './textBox.js';
import { nesText } from './nesFont.js';
import { createAudio } from './audio.js';
import { createTitleUi } from './titleUi.js';
import { createOptionsUi } from './optionsUi.js';
import { createDebugUi } from './debugUi.js';
import {
  applyOneHitKill,
  createDebugCheats,
  killLink,
  refillBombs,
  refillHearts,
  refillRupees,
  shouldKillOnScreen,
} from '@shared/debugCheats.js';
import {
  CAVE_ENTER_SPAWN,
  CAVE_WARE_XS,
  CAVE_WARE_Y,
  caveWareSlots,
  checkCaveExit,
  clearCaveTransitState,
  createCaveTileGrid,
  roadStairUnderLink,
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
  const dir = 'screens';
  const id = mapIndex.toString(16).padStart(2, '0');
  // Q2 layout rooms may ship an overlay PNG; fall back to Q1 art if missing.
  if (quest === 2 && quest2NeedsLayoutOverlay(mapIndex)) {
    return `/play/q2/${dir}/screen_${id}.png`;
  }
  return `/overworld/${dir}/screen_${id}.png`;
}

async function main() {
  const worldIndex = await fetchJson('/play/world_index.json');

  let options = loadOptions();
  // Must happen before the renderer is created and before any sheet URL is
  // built: the whole graphics pipeline reads the active scale rather than
  // being passed it, and the renderer resolution is fixed at init.
  setGraphicsMode(options.graphics);

  setStatus('Starting renderer…');
  const app = new Application();
  // Mount canvas before GL init (off-DOM contexts are a common black-screen cause).
  const rendererKind = await initPixiApp(
    app,
    {
      width: INTERNAL_W,
      height: INTERNAL_H,
      background: '#000000',
      antialias: false,
      resolution: scale(),
      autoDensity: false,
      powerPreference: 'high-performance',
    },
    { host: stageEl },
  );
  app.canvas.style.imageRendering = 'pixelated';
  // Already mounted by initPixiApp; keep a no-op append for idempotency.
  if (app.canvas.parentNode !== stageEl) stageEl.appendChild(app.canvas);

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
  // Opening DevTools also fires resize — observe the stage so the first
  // layout pass is not the only chance to size the canvas.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      resizeCanvas();
      app.render();
    }).observe(stageEl);
  }
  // Layout may not be final until after fonts/toolbar; remeasure next frame.
  requestAnimationFrame(() => {
    resizeCanvas();
    app.render();
  });

  setStatus(`Loading graphics (${rendererKind})…`);
  const sheetUrls = {
    common: graphicsUrl('common_sprites.png'),
    misc: graphicsUrl('common_misc.png'),
    commonBg: graphicsUrl('common_background.png'),
    overworld: graphicsUrl('overworld_sprites.png'),
    overworldBg: graphicsUrl('overworld_bg.png'),
    uwCommon: graphicsUrl('underworld_sprites_common.png'),
    // LevelPatternBlockSrcAddrs / BossPatternBlockSrcAddrs sets.
    uw127: graphicsUrl('underworld_sprites_127.png'),
    uw358: graphicsUrl('underworld_sprites_358.png'),
    uw469: graphicsUrl('underworld_sprites_469.png'),
    boss1257: graphicsUrl('boss_sprites_1257.png'),
    boss3468: graphicsUrl('boss_sprites_3468.png'),
    boss9: graphicsUrl('boss_sprites_9.png'),
    demoBg: graphicsUrl('demo_background.png'),
    demoSprites: graphicsUrl('demo_sprites.png'),
  };
  /** @type {Record<string, import('pixi.js').Texture>} */
  const sheetTextures = {};
  for (const [id, url] of Object.entries(sheetUrls)) {
    const tex = await Assets.load(url);
    tex.source.scaleMode = 'nearest';
    sheetTextures[id] = tex;
  }
  /** Transparent 16×16 crack overlay for bombable OW/UW walls. */
  let bombCrackTex = /** @type {import('pixi.js').Texture | null} */ (null);
  try {
    bombCrackTex = await loadBombCrackTexture();
  } catch (err) {
    console.warn('bomb_crack.png missing — bombable walls have no crack hint', err);
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
  const uwPatternExt = 'bin';
  for (const id of ['common_background', 'underworld_bg', 'common_misc']) {
    try {
      const buf = await (await fetch(graphicsUrl(`${id}.${uwPatternExt}`))).arrayBuffer();
      uwPatternBins.set(id, new Uint8Array(buf));
    } catch {
      console.warn(`Missing ${id}.${uwPatternExt} — dungeon walls need: npm run extract -- graphics`);
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
    // Link frames share the same SP0 row; drop before destroy.
    linkSprite.texture = Texture.EMPTY;
    hud.releaseItemSprites();
    invUi.close();

    if (mode === 'dungeon' && dungeon?.level) {
      enemySprites.setDungeonLevel(dungeon.level);
      const set = paletteById.get(`level_${dungeon.level}`) ?? owPaletteSet;
      enemySprites.setPaletteSet(set);
      items.setPaletteSet(set);
      frames.setPaletteSet(set);
      return;
    }
    enemySprites.setDungeonLevel(1);
    enemySprites.setPaletteSet(owPaletteSet);
    items.setPaletteSet(owPaletteSet);
    frames.setPaletteSet(owPaletteSet);
  }

  function floorFrame() {
    return dungeonFloorRect(dungeonPlayOrigin());
  }

  /**
   * @param {Uint8Array} rgba
   * @param {number} width
   * @param {number} height
   */
  function textureFromRgba(rgba, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return markScaled(Texture.from(canvas));
  }

  /**
   * Door-frame overlay above Link. Never use stream fog here — a black rect on
   * this layer would cover the playfield. Fogged rooms keep the texture but
   * hide the sprite until the room is visited.
   * @param {number} roomId
   * @param {import('pixi.js').Texture | null | undefined} frameTex
   * @param {boolean} [fogged]
   */
  function setUwDoorFrame(roomId, frameTex, fogged = false) {
    const id = roomId & 0xff;
    if (!frameTex) {
      const entry = uwDoorFrames.get(id);
      if (entry?.sprite) entry.sprite.visible = false;
      if (entry?.fog) entry.fog.visible = false;
      return;
    }
    const entry = uwDoorFrames.upsert(id, frameTex, { fogged: false });
    if (entry.sprite) entry.sprite.visible = !fogged;
    if (entry.fog) entry.fog.visible = false;
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
      const paintOpts = {
        paletteSet,
        tileSources: UW_TILE_SOURCES,
        patternBins: uwPatternBins,
        primarySquares: UW_PRIMARY_SQUARES,
        doorState: dungeon?.doorState ?? null,
      };
      const { width, height, rgba, tileGrid } = renderDungeonRoomRgba(room, paintOpts);
      const tex = textureFromRgba(rgba, width, height);
      if (!tex) return null;
      const frame = renderDoorFrameOverlayRgba(room, paintOpts);
      const frameTex = textureFromRgba(frame.rgba, frame.width, frame.height);
      return { tex, frameTex, tileGrid, width, height };
    } catch (err) {
      console.error('paintDungeonRoom failed', room?.roomId, err);
      return null;
    }
  }

  function refreshDungeonRoomVisual() {
    if (mode !== 'dungeon' || !dungeon?.room) return;
    const painted = paintDungeonRoom(dungeon.room);
    if (!painted) return;
    const entry = uwStream.upsert(dungeon.room.roomId, painted.tex, {
      tileGrid: painted.tileGrid,
      pack: dungeon.room,
      fogged: false,
    });
    setUwDoorFrame(dungeon.room.roomId, painted.frameTex, false);
    syncUwBombCracks(entry, dungeon.room, false);
    roomSprite = entry.sprite;
    dungeonTileGrid = painted.tileGrid;
    applyPushBlockRoomArt();
  }

  /**
   * Overlay crack sprites on unopened bombable walls for a streamed room.
   * @param {import('./streamView.js').StreamRoom | null | undefined} entry
   * @param {object | null | undefined} room
   * @param {boolean} [fogged]
   */
  function syncUwBombCracks(entry, room, fogged = false) {
    if (!entry || !room) return;
    const placements = fogged
      ? []
      : uwBombCrackPlacements(room, dungeon?.doorState ?? null);
    syncBombCrackSprites(entry, bombCrackTex, placements, { visible: !fogged });
  }

  /**
   * Overlay crack sprites on unopened OW bomb secrets.
   * @param {import('./streamView.js').StreamRoom | null | undefined} entry
   * @param {number} mapIndex
   */
  function syncOwBombCracks(entry, mapIndex) {
    if (!entry) return;
    const secrets = entry.pack?.secrets ?? [];
    const placements = owBombCrackPlacements(secrets, owSecretsRevealed, mapIndex);
    syncBombCrackSprites(entry, bombCrackTex, placements);
  }

  /**
   * Repaint the shared door face on the neighboring streamed room.
   * @param {number} roomId
   * @param {string} side
   */
  function refreshNeighborDoorVisual(roomId, side) {
    const level = dungeon?.levelData;
    if (!level?.rooms) return;
    const nextId = dungeonNeighbor(roomId, dirForSide(side));
    if (nextId == null) return;
    const neighbor = level.rooms.find((r) => r.roomId === nextId);
    if (!neighbor || !uwStream.get(nextId)) return;
    const painted = paintDungeonRoom(neighbor);
    if (!painted) return;
    const entry = uwStream.upsert(nextId, painted.tex, {
      tileGrid: painted.tileGrid,
      pack: neighbor,
      fogged: false,
    });
    setUwDoorFrame(nextId, painted.frameTex, false);
    syncUwBombCracks(entry, neighbor, false);
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
    pushBlockTex = markScaled(Texture.from(canvas));
    return pushBlockTex;
  }

  /**
   * Patch a 16×16 UW square into the live room texture (play-area coords).
   * Dest coords are NES screen units; the backing canvas is in sheet pixels
   * (`px()`), matching `patchOwBgSquare` / enhanced 2× textures.
   * @param {number} nesX screen X
   * @param {number} nesY screen Y (includes HUD)
   * @param {number} primary CHR base
   */
  function patchRoomSquareAt(nesX, nesY, primary) {
    // The anchor room's own sprite — `roomSprite` is only an alias for it.
    const spr = uwStream.get(roomId)?.sprite ?? roomSprite;
    if (!spr || !dungeon) return;
    const level = dungeon.level ?? 1;
    const paletteSet = paletteById.get(`level_${level}`) ?? owPaletteSet;
    if (!paletteSet || uwPatternBins.size < 3) return;
    const src = /** @type {HTMLCanvasElement | null} */ (spr.texture.source.resource);
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
    // Stream sprites sit at (0,0) in the room root; play Y includes HUD.
    // Do not name the NES args `px` — that shadows gfxScale.px().
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), width, height),
      px(nesX),
      px(nesY - HUD_HEIGHT),
    );
    spr.texture.source.update?.();
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
   *
   * Collision must be updated too — `refreshDungeonRoomVisual` rebuilds the
   * play grid from the layout and would otherwise put the block back at home
   * (bombable doors / shutters call refresh after a push).
   */
  function applyPushBlockRoomArt() {
    if (!pushBlock || !(roomSprite ?? uwStream.get(roomId)?.sprite)) return;
    if (pushBlock.state === PUSH_STATE.DONE || pushBlock.complete) {
      setUwSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
      setUwSquareAt(pushBlock.x, pushBlock.y, 0xb0);
      patchRoomSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
      patchRoomSquareAt(pushBlock.x, pushBlock.y, 0xb0);
      if (dungeon?.room && pushSpawnsStairs(dungeon.room)) {
        setUwSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
        patchRoomSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
      }
    } else if (pushBlock.state === PUSH_STATE.MOVING) {
      setUwSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
      patchRoomSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
    }
    // IDLE: leave baked $B0 at home — no overlay until the push starts.
  }

  const world = new Container();
  app.stage.addChild(world);

  /** Play-area layer offset by the continuous camera (caves/cellars keep identity). */
  const playField = new Container();
  world.addChild(playField);
  const owStream = createStreamView(playField);
  const uwStream = createStreamView(playField);

  /**
   * Dark wash over UW room backgrounds until candle is used (this stay).
   * Door frames are painted above Link (and thus above this overlay); they are
   * tinted in syncDarkOverlay so wall lintels/jambs darken too.
   */
  const darkOverlay = new Graphics();
  darkOverlay.visible = false;
  playField.addChild(darkOverlay);
  /** Multiply tint ≈ remaining light under darkOverlay (alpha 0.92 → ~8%). */
  const DARK_ROOM_DOOR_FRAME_TINT = 0x141414;
  /** White palette-row flash for the triforce fanfare (GameMode $12). */
  const flashOverlay = new Graphics();
  flashOverlay.visible = false;
  playField.addChild(flashOverlay);

  const enemyLayer = new Container();
  playField.addChild(enemyLayer);

  const itemLayer = new Container();
  playField.addChild(itemLayer);

  const fxLayer = new Container();
  playField.addChild(fxLayer);

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

  // Link frames are needed by file select / register before world play begins.
  const frames = createLinkFrames(spriteTex, {
    paletteSet: owPaletteSet,
    // DrawLinkLiftingItem tile $78 — same high bank as the stepladder.
    highSpriteTexture: sheetTextures.demoSprites ?? null,
  });
  const titleLinkTexture = () => frames.textureFor(DIR.DOWN, 0);

  const nameEntryUi = createNameEntryUi({
    commonBg: sheetTextures.commonBg,
    misc: sheetTextures.misc,
    items,
    linkTexture: titleLinkTexture,
    playSfx: (name) => audio?.playSfx(name),
  });

  const titleUi = createTitleUi({
    nameEntry: nameEntryUi,
    commonBg: sheetTextures.commonBg,
    misc: sheetTextures.misc,
    items,
    linkTexture: titleLinkTexture,
  });
  // Name entry above file select so a missed hide() cannot cover mode $E.
  app.stage.addChild(titleUi.root);
  app.stage.addChild(nameEntryUi.root);

  /** @type {import('pixi.js').Texture | null} */
  let titleBgTex = null;
  /** @type {import('pixi.js').Texture | null} */
  let storyBgTex = null;
  try {
    titleBgTex = markScaled(await Assets.load('/play/title.png'));
  } catch {
    console.warn('play/title.png missing — run: npm run extract -- demo');
  }
  // The authored prologue (`npm run story:prologue`) wins over the ROM's own
  // one-screen storyboard; deleting it restores the 1986 screen, the same way
  // deleting a `story/` entry restores the 1986 line.
  try {
    storyBgTex = markScaled(await Assets.load('/play/prologue.png'));
  } catch {
    try {
      storyBgTex = markScaled(await Assets.load('/play/story.png'));
    } catch {
      console.warn('play/story.png missing — run: npm run extract -- demo');
    }
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
    // Mode $11/$08 owns audio (dying tune / game over); do not restart world BGM.
    if (inv.dead) return;
    // Attract hides titleUi; demoUi.visible is the reliable "not in-world" signal.
    // mode defaults to 'overworld' before a file is started — never use that alone.
    if (!playing || titleUi.visible || demoUi.visible) {
      audio.playMusic('title');
      return;
    }
    if (mode === 'dungeon') {
      playDungeonMusic(dungeon?.level);
    } else if (mode === 'overworld' || mode === 'cave') {
      playOverworldMusic();
    }
  }

  /** Overworld BGM only when we are actually exploring the overworld/cave. */
  function playOverworldMusic() {
    // Do not key off `playing` — beginPlay loads the world before flipping it.
    if (!audio || inv.dead || titleUi.visible || demoUi.visible) return;
    if (mode !== 'overworld' && mode !== 'cave') return;
    audio.playMusic('overworld');
  }

  function playDungeonMusic(levelId = dungeon?.level) {
    // Same as playOverworldMusic: restore/enterLevel runs before playing=true.
    if (!audio || inv.dead || titleUi.visible || demoUi.visible) return;
    audio.playMusic(levelId === 9 ? 'level9' : 'underworld');
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
  /** OW room-item taken flags (NES `$067F+` item bit); `$5F` dock heart. */
  /** @type {Set<number>} */
  const owItemsTaken = new Set();
  /**
   * Phase 19: places an NPC has actually pointed at, as `roomId:clearCondition`
   * keys. They persist with the save and retire themselves once collected.
   * @type {Set<string>}
   */
  const hintMarks = new Set();
  /** Level → entrance screen, per quest. Derived once from the world index. */
  /** @type {Map<number, Map<number, number>>} */
  const levelEntranceCache = new Map();
  /**
   * @param {number} quest
   * @returns {Map<number, number>}
   */
  function levelEntrances(quest) {
    let found = levelEntranceCache.get(quest);
    if (!found) {
      found = levelEntranceScreens(worldIndex.screens, quest);
      levelEntranceCache.set(quest, found);
    }
    return found;
  }
  /** Animation-frame counter — drives the radar pulse even while play is halted. */
  let uiFrame = 0;
  /** Level whose briefing plays once the Triforce fanfare finishes. */
  /** @type {number | null} */
  let pendingBriefingLevel = null;
  /** @type {Map<string, number>} */
  const gravePushHold = new Map();
  /** Passive grave/Armos wakes already used this hold — clear on release. */
  /** @type {Set<string>} */
  const passiveTouchHold = new Set();
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
  /**
   * Story beats already spoken on this file — `item:<type>` and `level:<n>`.
   * The bow is only explained the first time it is lifted; walking back into
   * the Eagle does not re-introduce the Eagle.
   * @type {Set<string>}
   */
  const toldStory = new Set();
  /**
   * A story box that had to wait because someone else was still talking.
   * @type {{ pages: string[], marks: object[], kind: string, meta: object | null } | null}
   */
  let pendingStory = null;
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
    // The epilogue's vine frame comes from the same bank as the prologue's.
    demoBg: sheetTextures.demoBg ?? null,
    items,
    data: endingData,
  });
  app.stage.addChild(endingUi.root);

  /** Quest just finished (drives the post-ending profile switch). */
  let questCompleted = 0;
  /** Pre-rolled money-game amounts for the open cave (null when not gambling). */
  /** @type {number[] | null} */
  let gambleAmounts = null;
  /** True after one money-game pick this visit (ROM advances to idle state 8). */
  let gambleResolved = false;

  /** @type {Sprite | null} */
  let bg = null;
  /** @type {Sprite | null} */
  let roomSprite = null;
  /** Adjacent screen/room sprite shown during ScrollWorld (legacy; unused in continuous). */
  /** @type {Sprite | null} */
  let nextBg = null;
  let nextBgBaseX = 0;
  let nextBgBaseY = 0;
  const screenScroll = createScreenScroll();
  /** True while prefetching the next screen texture before scroll starts. */
  let scrollLoading = false;
  /** @type {Text | null} */
  let stubLabel = null;

  /**
   * Living foes that gate RoomAllDead / push-blocks (bubbles & traps omitted).
   * @param {number} roomId
   */
  function livingClearFoeCount(roomId) {
    return enemiesInRoom(enemies, roomId).filter((e) => countsTowardRoomClear(e))
      .length;
  }

  /**
   * Debug stub: live clear-counting foe total for the current dungeon room.
   * @param {{ roomId: number }} room
   */
  function dungeonStubText(room) {
    const start = dungeon?.levelData?.startRoom;
    const owExit = start != null && room.roomId === start ? '  ·  ↓ OW exit' : '';
    const foes = livingClearFoeCount(room.roomId);
    const cleared =
      roomClearedLatch || roomAllDead(enemiesInRoom(enemies, room.roomId));
    return `L${dungeon?.level ?? '?'} $${room.roomId.toString(16)}  foes=${foes}  clear=${cleared ? 1 : 0}${owExit}`;
  }

  function refreshStubLabel() {
    if (!stubLabel || mode !== 'dungeon' || !dungeon?.room) return;
    const next = dungeonStubText(dungeon.room);
    if (stubLabel.text !== next) stubLabel.text = next;
  }

  /** Rooms that currently have (or had) a live spawn latch. */
  /** @type {Set<number>} */
  let spawnedRooms = new Set();
  /**
   * Spawn-point keys claimed this visit. Survives foe death so a seam flap
   * cannot refill the same ROM slot until the home room leaves the camera.
   * @type {Set<number>}
   */
  let spawnClaims = new Set();
  let camLocalX = 0;
  let camLocalY = 0;
  let worldCamX = 0;
  let worldCamY = 0;
  /** Monotonic token so overlapping stream fetches ignore stale results. */
  let streamFetchGen = 0;

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
    sheetTextures,
  });
  // Behind Link in the world layer so the player stands in the cave.
  world.addChildAt(caveScene.root, 0);
  // Phase 19: one dialogue box for every speaking part — cave dwellers,
  // underworld old men, and the between-labyrinth briefings.
  const textBox = createTextBox({
    commonBg: sheetTextures.commonBg,
    playSfx: (name) => audio?.playSfx(name),
  });
  world.addChild(textBox.root);
  const link = createLinkState(worldIndex.startX, worldIndex.startY, worldIndex.startDir);

  // Sword under Link (NES draws the blade behind the body for most of the swing).
  const swordSprite = new Sprite(items.swordTexture(DIR.UP, SWORD.WOOD));
  swordSprite.visible = false;
  playField.addChild(swordSprite);

  /** Debug: solid UW tiles + look-ahead sample (enabled with ?debug=1 / ?coll=1). */
  const collDebugGfx = new Graphics();
  collDebugGfx.visible = false;
  playField.addChild(collDebugGfx);

  const linkSprite = new Sprite(frames.textureFor(link.dir, link.animFrame));
  playField.addChild(linkSprite);

  // Wallmaster closed hand draws over Link while sliding to the wall.
  const overLinkLayer = new Container();
  playField.addChild(overLinkLayer);

  // Door lintels/jambs above Link so he passes under the frame (not over it).
  const doorFrameLayer = new Container();
  doorFrameLayer.visible = false;
  playField.addChild(doorFrameLayer);
  const uwDoorFrames = createStreamView(doorFrameLayer);

  const input = createInput(options.binds);
  const inv = createInventory();
  const urlParams = new URLSearchParams(window.location.search);
  const debugCollision = urlParams.get('debug') === '1' || urlParams.get('coll') === '1';
  const skipTitle =
    urlParams.get('skipTitle') === '1'
    || urlParams.get('slot') != null
    || urlParams.get('debug') === '1';

  /** @type {{ slots: number[], practice: boolean } | null} */
  let ganonResetResult = null;
  if (urlParams.get('resetGanon') === '1') {
    ganonResetResult = resetGanonEncounterInStorage();
    if (ganonResetResult.slots.length || ganonResetResult.practice) {
      console.info('[zelda] Ganon/Zelda encounter reset', ganonResetResult);
    }
  }

  const debugCheats = createDebugCheats();

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

  /**
   * `window.zeldaDebug`, only under `?debug=1`.
   *
   * `step(n)` is the important one: a backgrounded tab suspends
   * requestAnimationFrame, so the game cannot be driven from a headless
   * browser at all without a way to advance frames by hand. The rest is the
   * handful of internals worth poking at from the console.
   */
  function exposeDebugHandle() {
    if (urlParams.get('debug') !== '1') return;
    /** Monotonic fake clock for `step()` — never runs backwards. */
    let debugClock = 0;
    Object.defineProperty(window, 'zeldaDebug', {
      value: {
        app,
        inv,
        input,
        link,
        textBox,
        hintMarks,
        state: () => ({
          mode,
          roomId,
          playing,
          busy,
          hasScreen: Boolean(screen),
          invOpen: invUi.open,
          swordActive: isSwordActive(sword),
        }),
        /**
         * Advance exactly `frames` 60Hz frames. Pixi drops an update whose
         * timestamp has not moved, hence the rising clock; `last` fakes one
         * frame of elapsed time per step whatever the wall clock says.
         * @param {number} frames
         */
        step: (frames = 1) => {
          // One ticker pass per frame, exactly like rAF would drive it.
          //
          // Two things have to hold for a headless frame to simulate at all:
          // the ticker's clock must move forward (a hidden tab's rAF never
          // moves it, and reseeding from `performance.now()` let a batch run
          // ahead and then hand Pixi a stale timestamp, which it drops), and
          // the loop's accumulator must be told how many frames to run rather
          // than inferring it from elapsed wall time.
          //
          // NOTE: `await` between calls if the frames must let a pending
          // `enterLevel` / screen load settle — promises cannot resolve inside
          // this synchronous loop, so a long batch starves every async
          // transition and the game looks frozen when it is only waiting.
          const n = Math.max(1, frames | 0);
          for (let i = 0; i < n; i += 1) {
            debugClock = Math.max(debugClock, performance.now()) + stepMs;
            debugSteps = 1;
            app.ticker.update(debugClock);
          }
        },
        /**
         * Streaming invariants, in one shot. `screenRoomId` must track
         * `roomId` (a stale `screen` breaks OW collision + cave warps) and
         * `spriteIds` must be a subset of `enemyIds` (a leaked sprite is a
         * monster frozen in the world that no longer takes or deals damage).
         */
        probe: () => ({
          /** Game frames actually simulated — proves `step(n)` really ran n. */
          frame: frameCounter,
          mode,
          roomId,
          screenRoomId: screen?.mapIndex ?? null,
          camLocalX,
          camLocalY,
          worldCamX,
          worldCamY,
          link: { x: link.x, y: link.y, dir: link.dir },
          spawnedRooms: [...spawnedRooms],
          spawnClaims: [...spawnClaims],
          streamRooms: [
            ...(mode === 'dungeon' ? uwStream : owStream).rooms.keys(),
          ],
          // Anchor must contain Link, and the collision grid must be the very
          // array the stream hands the multi-room tile probes.
          linkRoom: (() => {
            const w = localToWorld(roomId, link.x, link.y);
            return worldToLocal(w.x, w.y).roomId;
          })(),
          gridAliased:
            mode === 'dungeon'
              ? dungeonTileGrid === (uwStream.get(roomId)?.tileGrid ?? null)
              : screen?.tileGrid === (owStream.get(roomId)?.tileGrid ?? null),
          enemyIds: enemies.map((e) => e.id),
          spriteIds: [...enemyGfx.keys()],
          enemies: enemies.map((e) => ({
            id: e.id,
            objType: e.objType,
            home: e.homeRoomId ?? null,
            alive: e.alive,
            view: Boolean(e.viewActivated),
            edge: Boolean(e.edgePending),
            x: e.x,
            y: e.y,
            off: rectFullyOffCamera(e, camLocalX, camLocalY, 0),
          })),
        }),
        marks: () => currentMapMarks(),
        say: (pages) => textBox.open(pages, { kind: 'debug' }),
        briefing: (level) => openLevelBriefing(level),
        /**
         * Jump to mode `$13`. Without an argument it plays from Zelda's line;
         * `ending('epilogue')` skips the ROM beats and opens on the first
         * storyboard page, which is otherwise an hour of play away.
         */
        ending: (from = 'start') => {
          endingUi.begin({ quest: inv.quest, name: saveName, deaths: deathCount });
          if (from === 'epilogue') skipEndingToEpilogue(endingUi.state);
          return endingUi.phase;
        },
        enterLevel: (levelId) => enterLevel(levelId),
        goRoom: (id, dir) => loadDungeonRoom(id, dir),
        goOw: (id, x = 0x78, y = 0x8d, dir = DIR.UP) =>
          loadOverworldScreen(id & 0xff, { x, y, dir }),
        /** Square-level view of a streamed OW room's collision grid. */
        squares: (id = roomId) => {
          const grid = owStream.get(id)?.tileGrid;
          if (!grid) return null;
          const out = [];
          for (let r = 0; r < 11; r += 1) {
            const row = [];
            for (let c = 0; c < 16; c += 1) {
              row.push((grid[r * 2]?.[c * 2] ?? 0).toString(16).padStart(2, '0'));
            }
            out.push(row.join(' '));
          }
          return out;
        },
        revealed: () => [...owSecretsRevealed],
        /** Why Link is (or is not) allowed to move this frame. */
        moveProbe: () => {
          const grids = owStream.gridMap();
          const dirs = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };
          /** @type {Record<string, unknown>} */
          const can = {};
          for (const [name, d] of Object.entries(dirs)) {
            can[name] = getLinkCollidingTileMulti(grids, roomId, link.x, link.y, d, {});
          }
          return {
            gates: {
              busy,
              screenBound: Boolean(screen) && (screen.mapIndex & 0xff) === (roomId & 0xff),
              fairyHalt: pondFairyHalt,
              whirlwindCarrying: Boolean(whirlwind?.carrying),
              whirlwindAlive: Boolean(whirlwind?.alive),
              swordActive: isSwordActive(sword),
              shovePixels: inv.shovePixels,
              itemLiftTimer: inv.itemLiftTimer ?? 0,
              raftActive: raftRide.active,
              dead: inv.dead,
              undergroundExitType,
            },
            link: { ...link },
            standing: standingTileMulti(grids, roomId, link.x, link.y),
            lookAhead: can,
          };
        },
        /** Warp tile / cave-entry answer under Link right now. */
        warpProbe: () => {
          if (mode !== 'overworld') return null;
          const probe = (px, py) =>
            standingTileMulti(owStream.gridMap(), roomId, px, py);
          return {
            roomId,
            screenRoomId: screen?.mapIndex ?? null,
            caveId: screen?.attrs?.caveId ?? null,
            link: { x: link.x, y: link.y, gridOffset: link.gridOffset },
            yAligned: (link.y & 0x0f) === 0x0d,
            undergroundExitType,
            caveLatch,
            standing: probe(link.x, link.y),
            standingRight: probe(link.x + 8, link.y),
            entry: checkCaveEntry(link, screen?.tileGrid, screen?.attrs, roomId, {
              standingTile: probe,
            }),
          };
        },
        /** UW stairs / cellar gate under Link (and a few nearby samples). */
        stairsProbe: () => {
          if (mode !== 'dungeon' || !dungeon?.room) return null;
          const level = dungeon.levelData;
          const samples = {};
          for (const [ox, oy] of [
            [0, 0],
            [8, 0],
            [0, -8],
            [0, -16],
            [8, -16],
          ]) {
            const key = `${ox},${oy}`;
            samples[key] = dungeonTileGrid
              ? standingTile(dungeonTileGrid, link.x + ox, link.y + oy)
              : null;
          }
          return {
            roomId,
            link: { x: link.x, y: link.y, gridOffset: link.gridOffset },
            yNibble: link.y & 0x0f,
            stairsLatch,
            busy,
            entry: checkUwStairsEntry(link, dungeonTileGrid),
            cellarId: cellarForStairsRoom(level, dungeon.room.roomId),
            samples,
            gridAliased: dungeonTileGrid === (uwStream.get(roomId)?.tileGrid ?? null),
          };
        },
        cheats: debugCheats,
        refillHearts: () => debugRefillHearts(),
        refillBombs: () => debugRefillBombs(),
        refillRupees: () => debugRefillRupees(),
        killScreen: () => debugKillScreen(),
        killLink: () => debugKillLink(),
        /** Rewind Ganon + Zelda endgame (live + battery slot). */
        resetGanonFight: () => resetGanonFightLive(),
      },
      configurable: true,
    });
  }

  function invView() {
    return {
      dungeon,
      dungeonMarks: currentDungeonMapMarks(),
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

  /**
   * Clear Triforce of Power / lastBoss / boss-room clear so Ganon and Zelda
   * can be replayed. Persists the active slot (and rewrites storage).
   */
  async function resetGanonFightLive() {
    const quest = inv.quest === 2 ? 2 : 1;
    const bossRoom =
      (dungeon?.level === 9 && dungeon.levelData?.bossRoom != null
        ? dungeon.levelData.bossRoom
        : quest === 2
          ? 0x17
          : 0x42) & 0xff;
    const zeldaRoom =
      (dungeon?.level === 9 && dungeon.levelData?.triforceRoom != null
        ? dungeon.levelData.triforceRoom
        : quest === 2
          ? 0x07
          : 0x32) & 0xff;

    inv.triforceOfPower = 0;
    questCompleted = 0;
    endingUi.hide();
    world.visible = true;
    linkSprite.visible = true;

    const key = dungeonProgressKey(quest, 9);
    let saved = dungeonProgress.get(key);
    if (!saved) {
      saved = {
        cleared: new Set(),
        taken: new Set(),
        visited: new Set(),
        pushed: new Set(),
        doors: new Set(),
        lastBoss: false,
        map: 0,
        compass: 0,
      };
      dungeonProgress.set(key, saved);
    }
    saved.lastBoss = false;
    saved.cleared.delete(bossRoom);
    saved.cleared.delete(zeldaRoom);
    saved.taken.delete(bossRoom);
    saved.taken.delete(zeldaRoom);
    for (const side of ['north', 'south', 'west', 'east']) {
      const next = dungeonNeighbor(bossRoom, dirForSide(side));
      if (next !== zeldaRoom) continue;
      saved.doors.delete(`${bossRoom}:${side}`);
      saved.doors.delete(
        `${next}:${side === 'north' ? 'south' : side === 'south' ? 'north' : side === 'west' ? 'east' : 'west'}`,
      );
    }

    if (dungeon?.level === 9) {
      dungeon.lastBossDefeated = false;
      dungeon.clearedRooms.delete(bossRoom);
      dungeon.clearedRooms.delete(zeldaRoom);
      dungeon.takenItems.delete(bossRoom);
      dungeon.takenItems.delete(zeldaRoom);
      // Drop a stale Zelda sprite if her room is currently streamed.
      for (const e of enemies) {
        if (isZelda(e.objType) && (e.homeRoomId ?? roomId) === zeldaRoom) {
          e.alive = false;
        }
      }
      spawnedRooms.delete(zeldaRoom);
      sealLastBossShutters(dungeon.doorState, dungeon.levelData, false);
      snapshotDungeonProgress();
      const south = dungeonNeighbor(bossRoom, DIR.DOWN);
      const west = dungeonNeighbor(bossRoom, DIR.LEFT);
      const park = south ?? west;
      if (park != null && !busy) {
        await loadDungeonRoom(park, south != null ? DIR.UP : DIR.RIGHT);
      }
    }

    if (playing) persistSave('reset ganon');
    else resetGanonEncounterInStorage();
    setStatus('Ganon encounter reset — fight him again, then save Zelda');
    return { bossRoom };
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
    owItemsTaken.clear();
    hintMarks.clear();
    dungeonProgress.clear();
    toldStory.clear();
    closeDialogue();
    pendingBriefingLevel = null;
    Object.assign(inv, createInventory());
    const meta = applyLoadedSave(payload, {
      inv,
      owSecretsRevealed,
      caveTaken,
      owItemsTaken,
      hintMarks,
      toldStory,
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
      // Bootstrap the entrance screen only — skip overworld BGM so it cannot
      // win a race against enterLevel's underworld/level9 playlist.
      await loadOverworldScreen(
        pos.dungeon.fromRoomId ?? owStart.roomId,
        {
          x: owStart.x,
          y: owStart.y,
          dir: owStart.dir,
        },
        { skipMusic: true },
      );
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
      owItemsTaken,
      hintMarks,
      toldStory,
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
    debugUi.close();
    optionsUi.open();
  });

  function debugRefillHearts() {
    refillHearts(inv);
    refreshHud();
    setStatus('Debug: hearts refilled');
  }

  function debugRefillBombs() {
    refillBombs(inv);
    refreshHud();
    setStatus('Debug: bombs refilled');
  }

  function debugRefillRupees() {
    refillRupees(inv);
    refreshHud();
    setStatus('Debug: rupees refilled');
  }

  function debugKillScreen() {
    const victims = enemies.filter((e) =>
      shouldKillOnScreen(e, (foe) => rectFullyOffCamera(foe, camLocalX, camLocalY, 0)),
    );
    for (const e of victims) {
      e.hp = 0;
      e.alive = false;
      onEnemyKilled(e);
    }
    setStatus(victims.length ? `Debug: killed ${victims.length}` : 'Debug: no enemies on screen');
  }

  function debugKillLink() {
    if (!playing || !killLink(inv)) return;
    debugUi.close();
    refreshHud();
    beginDeath();
    setStatus('Debug: Link killed');
  }

  const debugUi = createDebugUi({
    getCheats: () => debugCheats,
    setCheats: (patch) => {
      Object.assign(debugCheats, patch);
      debugUi.refresh();
    },
    refillHearts: debugRefillHearts,
    refillBombs: debugRefillBombs,
    refillRupees: debugRefillRupees,
    killScreen: debugKillScreen,
    killLink: debugKillLink,
    onClose: () => {},
  });
  document.getElementById('btn-debug')?.addEventListener('click', () => {
    optionsUi.close();
    debugUi.open();
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
  /**
   * UW person pay-wares (bomb upgrade / money-or-life) + price labels.
   * @type {Map<string, import('pixi.js').Container>}
   */
  const personWareGfx = new Map();
  /** Room id whose person dialogue already opened this visit (`null` = none). */
  let personDialogueForRoom = /** @type {number | null} */ (null);
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
  /** @type {Sprite[]} */
  let boomSprites = [];
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
  /** Triforce Mode $12 pose — held through fanfare, fill, and briefing until OW exit. */
  let holdingTriforceLift = false;

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
  /** Invalidates in-flight overworld loads so they cannot restart OW music mid-dungeon/death. */
  let worldLoadGen = 0;
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
    clearPersonWareSprites();
    clearPondHeartSprites();
    pondFairyHalt = false;
    clearClockFreeze(inv); // InvClock clears on room / screen change
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
    for (const s of boomSprites) s.visible = false;
    if (baitGfx) baitGfx.visible = false;
    if (pushGfx) pushGfx.visible = false;
  }

  function syncEnemySprites() {
    for (const e of enemies) {
      let g = enemyGfx.get(e.id);
      if (!e.alive) {
        if (g) {
          g.parent?.removeChild(g);
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
      // Safety: if the sprite is on-camera, never leave it inert/hidden.
      if (
        enemyAwaitingView(e)
        && !rectFullyOffCamera(e, camLocalX, camLocalY, 0)
      ) {
        e.viewActivated = true;
        if (!skipsSpawnCloud(e) && (e.spawnCloud ?? 0) <= 0) e.spawnCloud = 0x10;
      }
      if (enemyAwaitingView(e)) {
        g.visible = false;
        continue;
      }
      if ((e.spawnCloud ?? 0) > 0) {
        e.spawnCloud -= 1;
        g.texture = items.cloudTexture();
        g.visible = !e.edgePending;
        g.alpha = 1;
        continue;
      }
      g.visible = !e.edgePending && !enemyIsHidden(e) && dodongoIsVisible(e);
      if (e.stunTimer > 0) g.alpha = 0.55;
      else if (e.invuln > 0 && (e.invuln & 2)) g.alpha = 0.4;
      else g.alpha = 1;
      // Capture: closed hand over Link (NES DrawObjectNotMirroredOverLink).
      const parent = wallmasterIsCapturing(e) ? overLinkLayer : enemyLayer;
      if (g.parent !== parent) parent.addChild(g);
    }

    // Drop sprites whose foe left the list without dying in place — culling
    // off camera, a room filter on a seam cross, a maze loop, a screen load.
    // A leaked sprite reads as a monster frozen in the world that runs no AI
    // and neither takes nor deals damage, which is exactly the bug it caused.
    // Always reconcile — see orphanedEnemySpriteIds for why a size gate fails.
    for (const id of orphanedEnemySpriteIds(enemies, enemyGfx.keys())) {
      const g = enemyGfx.get(id);
      if (!g) continue;
      g.parent?.removeChild(g);
      g.destroy({ texture: false, textureSource: false });
      enemyGfx.delete(id);
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
      // Magic shot is a wide 16×16 pair ($7A / $7C+$7E) — never centered.
      // Sword/magic horizontal: NES nudges Y +3 (DrawSwordShotOrMagicShot).
      const horiz = items.weaponTextureHorizontal(p.dir);
      const magicShot = p.kind === PROJ.MAGIC_SHOT;
      const weaponShot =
        p.kind === PROJ.SWORD_SHOT
        || magicShot
        || p.kind === PROJ.ARROW
        || p.kind === PROJ.SILVER_ARROW;
      g.x = p.x + (weaponShot && !horiz && !magicShot ? 4 : 0);
      g.y = p.y + (weaponShot && horiz ? 3 : 0);
      // Sword/magic beams flash palette rows (FrameCounter & 3).
      if (p.kind === PROJ.SWORD_SHOT || magicShot) {
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

  /** Begin the TakeItem pose: item held $10 px above Link. */
  function startItemLift(itemType) {
    liftItemType = itemType;
    syncItemLiftSprite();
  }

  function itemLiftActive() {
    return (
      liftItemType != null
      && (
        (inv.itemLiftTimer ?? 0) > 0
        || holdingTriforceLift
        || triforceCeremonyActive(triforceCeremony)
      )
    );
  }

  function syncItemLiftSprite() {
    const active = itemLiftActive();
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
    if (mode === 'overworld' || mode === 'dungeon') {
      return chaseBoundsForCamera(camLocalX, camLocalY);
    }
    return OW_ENEMY_BOUNDS;
  }

  /**
   * Bosses stay in their home room's BoundByRoom; other foes may chase across
   * seams via the camera pad.
   * @param {{ objType: number, homeRoomId?: number | null }} e
   */
  function enemyBoundsFor(e) {
    if (mode === 'dungeon' && enemyUsesUwRoomBounds(e.objType)) {
      return uwEnemyBoundsForRoom(e.homeRoomId ?? roomId, roomId);
    }
    return enemyBounds();
  }

  function clearFxLayer() {
    for (const child of fxLayer.removeChildren()) {
      child.destroy({ texture: false, textureSource: false });
    }
  }

  function drawBombs() {
    clearFxLayer();
    // Keep FX above the background after screen loads.
    if (fxLayer.parent === playField) {
      playField.setChildIndex(fxLayer, Math.max(0, playField.children.length - 3));
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
        if (e.edgePending || enemyAwaitingView(e)) continue;
        const wasAlive = e.alive;
        const hit = tryBombHitEnemy(e, b, { enemies });
        applyWeaponHit(e, wasAlive, hit, DROP_DAMAGE_BOMB);
      }
    }
    bombs = bombs.map(stepBomb).filter((b) => b.phase !== 'done');
    for (const b of bombs) {
      if (b.phase === 'explode' && !b.damaged) {
        b.damaged = true;
        audio?.playSfx('bomb');
        for (const e of enemies) {
          if (e.edgePending || enemyAwaitingView(e)) continue;
          const wasAlive = e.alive;
          const hit = tryBombHitEnemy(e, b, { enemies });
          applyWeaponHit(e, wasAlive, hit, DROP_DAMAGE_BOMB);
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
            for (const side of opened) {
              refreshNeighborDoorVisual(dungeon.room.roomId, side);
            }
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
    swordSprite.texture = items.swordTexture(DIR.UP, inv.sword);
    swordSprite.anchor.set(0.5, 0.5);
    swordSprite.x = pos.x + 8;
    swordSprite.y = pos.y + 8 + (mode === 'overworld' ? 2 : 0);
    swordSprite.rotation = swordSpriteRotation(pos.angle);
    swordSprite.visible = true;
  }

  function continueAfterDeath() {
    inv.dead = false;
    inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
    inv.invuln = 0;
    inv.shovePixels = 0;
    deathUi.hide();
    // Cut Tune1 $40 (game over) before the world song starts again.
    audio?.stopSfx();

    // NES: die in a dungeon → continue at that dungeon's entrance; OW → start screen.
    if (mode === 'dungeon' && dungeon) {
      snapshotDungeonProgress();
      const levelId = dungeon.level;
      const fromRoomId = dungeon.fromRoomId;
      const fromAttrs = dungeon.fromAttrs ?? {};
      void (async () => {
        await enterLevel(levelId, { fromRoomId, fromAttrs });
        playDungeonMusic(levelId);
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
    playOverworldMusic();
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

  /** NES mode-9 cellars are single-screen; do not scroll into map neighbors. */
  function inUwCellar() {
    return Boolean(
      mode === 'dungeon' && dungeon?.room && isCellarRoom(dungeon.room, dungeon.levelData),
    );
  }

  function applyPlayCamera() {
    if (mode === 'cave') {
      playField.x = 0;
      playField.y = 0;
      return;
    }
    // Cellars sit on the dungeon map grid but play like caves: pin the view
    // so Link on a side ladder cannot peek into adjacent top-down rooms.
    if (inUwCellar()) {
      camLocalX = 0;
      camLocalY = 0;
      const origin = roomPlayOrigin(roomId);
      worldCamX = origin.ox;
      worldCamY = origin.oy;
      playField.x = 0;
      playField.y = 0;
      uwStream.layout(roomId);
      uwDoorFrames.layout(roomId);
      return;
    }
    const map = { cols: 16, rows: 8 };
    const cam = cameraLocalForLink(roomId, link.x, link.y, map);
    camLocalX = cam.camX;
    camLocalY = cam.camY;
    worldCamX = cam.worldCamX;
    worldCamY = cam.worldCamY;
    playField.x = -Math.round(camLocalX);
    playField.y = -Math.round(camLocalY);
    if (mode === 'overworld') owStream.layout(roomId);
    if (mode === 'dungeon') {
      uwStream.layout(roomId);
      uwDoorFrames.layout(roomId);
    }
  }

  /**
   * @param {object} [base]
   */
  function continuousTileOpts(base = {}) {
    const grids = mode === 'overworld' ? owStream.gridMap() : uwStream.gridMap();
    return {
      ...base,
      anchorRoomId: roomId,
      collidingTile: (x, y, dir) =>
        getLinkCollidingTileMulti(grids, roomId, x, y, dir, base),
      standingTile: (x, y) => standingTileMulti(grids, roomId, x, y),
    };
  }

  /**
   * OW Link collision opts — pond floor + stepladder must be shared by walk,
   * shove, and the solid-eject safety net. Omitting the pond floor after a
   * drain lets `ensureLinkNotInSolid` treat lakebed water as rock.
   * @param {number} [inputMask]
   */
  function overworldLinkTileOpts(inputMask = 0) {
    const baseOpts = overworldTileOptsWithLadder(inv, roomId);
    const pondFloor = pondCollisionFloor(pondSecret, owSecretsRevealed, roomId);
    if (pondFloor != null) baseOpts.firstUnwalkable = pondFloor;
    return continuousTileOpts(
      prepareLadderTileOpts(screen?.tileGrid ?? null, inputMask, 'overworld', baseOpts),
    );
  }

  /**
   * @param {number} dir
   */
  function rebaseEntities(dir) {
    const { dx, dy } = rebaseDelta(dir);
    /** @type {({ x?: number, y?: number } | null | undefined)[]} */
    const objs = [
      link,
      ...enemies,
      ...projectiles,
      ...drops,
      boomerang,
      bait,
      ...bombs,
      ...flames,
      ...enemyBooms,
    ];
    if (pushBlock) objs.push(pushBlock);
    if (ladderObj) objs.push(ladderObj);
    if (raftRide.active) objs.push(raftRide);
    if (whirlwind) objs.push(whirlwind);
    if (roomItem) objs.push(roomItem);
    shiftPositions(objs, dx, dy);
  }

  /**
   * Offset a local position from `fromRoom` into the current anchor room.
   * @param {number} fromRoom
   * @param {number} x
   * @param {number} y
   */
  function offsetFromRoom(fromRoom, x, y) {
    const a = roomPlayOrigin(roomId);
    const b = roomPlayOrigin(fromRoom);
    return { x: x + (b.ox - a.ox), y: y + (b.oy - a.oy) };
  }

  /**
   * Anchor-local position → `toRoom`'s own local space (inverse of the above).
   * @param {number} toRoom
   * @param {number} x
   * @param {number} y
   */
  function offsetToRoom(toRoom, x, y) {
    const a = roomPlayOrigin(roomId);
    const b = roomPlayOrigin(toRoom);
    return { x: x + (a.ox - b.ox), y: y + (a.oy - b.oy) };
  }

  function cullStreamEnemies() {
    if (mode !== 'overworld' && mode !== 'dungeon') return;
    const { kept } = cullOffscreenEnemies(enemies, camLocalX, camLocalY, 8, {
      worldCamX,
      worldCamY,
      // Capture slide walks into the wall / off the lip — never despawn mid-drag.
      keep: (e) => wallmasterIsCapturing(e),
    });
    enemies = kept;
    releaseSpawnLatch(spawnedRooms, spawnedRooms, worldCamX, worldCamY, roomId, {
      enemies,
      spawnClaims,
    });
  }

  /** Link is mid Wallmaster drag (halted; position owned by the hand). */
  function linkHeldByWallmaster() {
    return enemies.some((e) => wallmasterIsCapturing(e));
  }

  /** Keep Link glued to the closed hand after shove/solid systems run. */
  function pinWallmasterCapture() {
    for (const e of enemies) {
      if (!wallmasterIsCapturing(e)) continue;
      link.x = e.x;
      link.y = e.y;
      inv.paralyzed = 2;
      inv.shovePixels = 0;
      inv.shoveDir = 0;
    }
  }

  /**
   * Bind `screen` / `bg` from the OW stream for the current anchor room.
   *
   * `screen` carries the room's collision grid, warp `caveId` and secret list,
   * so a binding left pointing at the room Link just walked out of is what
   * makes cave mouths stop responding and secrets fire on the wrong screen.
   * It is never allowed to hold a room other than `roomId`: an incomplete
   * stream entry clears it, and `stepOverworld` waits for the retry.
   *
   * @param {number} id
   * @returns {boolean} true when pack + tileGrid are ready
   */
  function bindOwScreenFromStream(id) {
    const entry = owStream.get(id & 0xff);
    if (!entry?.pack || !entry.tileGrid) {
      screen = null;
      bg = null;
      return false;
    }
    screen = { ...entry.pack, tileGrid: entry.tileGrid };
    bg = entry.sprite ?? null;
    return true;
  }

  /** True once `screen` describes the anchor room (rebinding if it can). */
  function owScreenBound() {
    const id = roomId & 0xff;
    if (screen && (screen.mapIndex & 0xff) === id && screen.tileGrid) {
      if (!bg) bg = owStream.get(id)?.sprite ?? null;
      return true;
    }
    return bindOwScreenFromStream(id);
  }

  /**
   * NES CreateRoomObjects `@MakeHeartContainerOW` — dock heart on room `$5F`.
   */
  function syncOwRoomItem() {
    roomItem = createOwHeartContainer(roomId, owItemsTaken);
  }

  /**
   * Touch-pickup for the OW room item (GameMode `$05` skips the lift pose).
   */
  function tryPickupOwRoomItem() {
    const picked = tryPickupRoomItem(roomItem, link.x, link.y);
    if (picked == null) return;
    owItemsTaken.add(roomId & 0xff);
    const label = grantRoomItem(inv, picked);
    refreshHud();
    invUi.refresh(inv, invView());
    audio?.playSfx('item_taken');
    audio?.playFanfare('item');
    setStatus(`Got ${label}!`);
    tellItemStory(picked);
    persistSave();
  }

  /**
   * Soft-enter an OW room after a seam cross / raft / etc.
   * Spawn latch stays until the room fully leaves the camera — clearing a
   * screen must not refill while Link is still there.
   * @param {number} nextRoomId
   * @param {number} dir
   * @param {{ dropHomeRoom?: number | null }} [opts]
   */
  function softEnterOwRoom(nextRoomId, dir, opts = {}) {
    const from = opts.dropHomeRoom != null ? opts.dropHomeRoom & 0xff : null;
    if (from != null) {
      dropRoomEnemies(from);
    }
    // Clock only covers the foes that were visible at pickup.
    clearClockFreeze(inv, enemies);
    roomId = nextRoomId & 0xff;
    // Per-room fixtures are re-derived every time the binding lands, so a room
    // that was still streaming on the first pass still gets its pond state.
    const applyRoomState = () => {
      candleRoom = createCandleRoomState();
      pondSecret = restorePondSecret(owSecretsRevealed, roomId);
      owWaterRgb = OW_WATER_RGB;
      syncOwRoomItem();
    };
    const bound = bindOwScreenFromStream(roomId);
    applyRoomState();
    if (bound) spawnOwRoomEnemies(roomId, dir);
    void ensureOwNeighbors()
      .then(() => {
        if (mode !== 'overworld' || (roomId & 0xff) !== (nextRoomId & 0xff)) return;
        if (!bound && bindOwScreenFromStream(roomId)) applyRoomState();
        spawnOwRoomEnemies(roomId, dir);
        spawnVisibleOwRooms(dir);
        applyPlayCamera();
      })
      .catch((err) => {
        console.warn('OW neighbor stream failed', err);
      });
  }

  /** True when a streamed OW room has collision + art ready to bind. */
  function owRoomReady(mapIndex) {
    const entry = owStream.get(mapIndex & 0xff);
    return Boolean(entry?.pack && entry?.tileGrid && entry?.sprite);
  }

  /**
   * Prefetch one OW room (and its neighborhood) without changing the anchor.
   * Used when a raft dock approach would otherwise soft-enter an unbound room,
   * null `screen`, and freeze the step loop on a black playfield.
   * @param {number} mapIndex
   */
  function prefetchOwRoom(mapIndex) {
    const id = mapIndex & 0xff;
    void ensureOwRoom(id)
      .then(() => {
        if (mode !== 'overworld') return;
        return ensureOwNeighbors();
      })
      .catch((err) => {
        console.warn(`OW prefetch $${id.toString(16)} failed`, err);
      });
  }

  /**
   * Forget a room's spawn wave: its foes leave with it and the latch drops so
   * a later visit regenerates them.
   * @param {number} homeRoom
   */
  function dropRoomEnemies(homeRoom) {
    const id = homeRoom & 0xff;
    enemies = enemies.filter((e) => (e.homeRoomId ?? -1) !== id);
    spawnedRooms.delete(id);
    clearSpawnClaimsForRoom(spawnClaims, id);
  }

  /**
   * Fetch + upsert one OW screen into the stream (secrets already revealed).
   * @param {number} mapIndex
   */
  async function ensureOwRoom(mapIndex) {
    const id = mapIndex & 0xff;
    const existing = owStream.get(id);
    if (existing?.tileGrid && existing?.sprite) return existing;

    let pack = await fetchJson(screenUrl(id));
    if (inv.quest === 2) {
      if (quest2NeedsLayoutOverlay(id)) {
        try {
          const overlay = await fetchJson(screenUrlQ2(id));
          pack = { ...pack, ...overlay, mapIndex: id };
        } catch {
          applyQuest2AttrsToPack(pack);
        }
      } else {
        applyQuest2AttrsToPack(pack);
      }
      // Prefer quest-2 markers when present (extract writes both). Legacy packs
      // only stored Q1 secrets — clear rooms this quest ignores.
      if (Array.isArray(pack.secretsQ2)) {
        pack.secrets = pack.secretsQ2;
      } else if (Array.isArray(pack.secrets) && pack.attrs?.ignoreSecretQ2) {
        pack.secrets = [];
      }
    }
    const tileGrid = pack.tileGrid.map((row) => [...row]);
    /** @type {{ col: number, row: number, tiles: readonly number[] }[]} */
    const bgPatches = [];
    for (const secret of pack.secrets ?? []) {
      const key = `${id}:${secret.row}:${secret.col}`;
      if (owSecretsRevealed.has(key)) {
        revealSecretTiles(tileGrid, secret.row, secret.col, secret.marker);
        bgPatches.push({
          col: secret.col,
          row: secret.row,
          tiles: tilesForSecretMarker(secret.marker),
        });
      }
    }
    // Pond stairs are not layout markers ($E9/$EA) — restore from the fixed spot.
    if (owSecretsRevealed.has(pondSecretKey(id))) {
      revealPondStairs(tileGrid);
      bgPatches.push({
        col: POND_STAIRS_COL,
        row: POND_STAIRS_ROW,
        tiles: SECRET_STAIRS_TILES,
      });
    }
    restoreArmosReveals(tileGrid, id, owSecretsRevealed);
    let tex;
    try {
      tex = markScaled(await Assets.load(bgUrl(id, inv.quest)));
    } catch {
      tex = markScaled(await Assets.load(bgUrl(id, 1)));
    }
    tex.source.scaleMode = 'nearest';
    const entry = owStream.upsert(id, tex, { tileGrid, pack, fogged: false });
    applyBurnTreeColorHints(entry?.sprite ?? null, pack, id);
    bg = owStream.get(roomId)?.sprite ?? bg;
    for (const p of bgPatches) {
      patchOwBgSquare(p.col, p.row, p.tiles, id);
    }
    for (const key of owSecretsRevealed) {
      if (!key.startsWith(`armos:${id}:`)) continue;
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
        id,
      );
    }
    syncOwBombCracks(entry, id);
    return entry;
  }

  async function ensureOwNeighbors() {
    const gen = ++streamFetchGen;
    applyPlayCamera();
    const ids = roomsForCamera(worldCamX, worldCamY, { margin: 1 });
    for (const id of ids) {
      if (gen !== streamFetchGen) return;
      await ensureOwRoom(id);
    }
    if (gen !== streamFetchGen) return;
    owStream.pruneTo(ids);
    owStream.layout(roomId);
    bg = owStream.get(roomId)?.sprite ?? bg;
  }

  /**
   * @param {number} mapIndex
   * @param {number} [dir]
   */
  function spawnOwRoomEnemies(mapIndex, dir = link.dir) {
    const id = mapIndex & 0xff;
    if (spawnedRooms.has(id)) return;
    // Chased stragglers still count as this room's spawn wave.
    if (roomHasLivingEnemies(enemies, id)) {
      spawnedRooms.add(id);
      // Keep their points claimed so a later latch flap cannot duplicate them.
      const home = enemiesInRoom(enemies, id);
      tagEnemyHomeRoom(home, id);
      claimLivingSpawnPoints(home, spawnClaims);
      return;
    }
    const entry = owStream.get(id);
    if (!entry?.pack) return;
    const spawned = spawnOverworldEnemies(entry.pack.attrs, dir);
    tagEnemyHomeRoom(spawned, id);
    // One living foe per ROM spawn point — blocks seam-edge double waves.
    const fresh = filterUnoccupiedSpawnPoints(spawned, enemies, spawnClaims);
    // Eject in the room's local space before rebasing into the anchor frame.
    if (entry.tileGrid) ejectEnemiesFromSolid(fresh, entry.tileGrid);
    markEnemiesAwaitingView(fresh);
    /** @type {typeof fresh} */
    const added = [];
    for (const e of fresh) {
      if (id !== (roomId & 0xff)) {
        const off = offsetFromRoom(id, e.x, e.y);
        e.x = off.x;
        e.y = off.y;
      }
      // Already on camera this frame → activate immediately (spawn runs before combat).
      if (
        !e.edgePending
        && !rectFullyOffCamera(e, camLocalX, camLocalY, 0)
      ) {
        e.viewActivated = true;
        if (!skipsSpawnCloud(e)) e.spawnCloud = 0x10;
      }
      if (!tryAddMonsterToRoom(enemies, e, id)) break;
      added.push(e);
    }
    claimLivingSpawnPoints(added, spawnClaims);
    spawnedRooms.add(id);
  }

  /**
   * @param {number} [dir]
   */
  function spawnVisibleOwRooms(dir = link.dir) {
    applyPlayCamera();
    // Spawn only rooms that intersect the view (tile stream still uses margin 1).
    const candidates = roomsForCamera(worldCamX, worldCamY, { margin: 0 });
    const need = roomsNeedingSpawn({
      candidateRooms: candidates,
      currentRoomId: roomId,
      visited: new Set(candidates),
      spawnedRooms,
      clearedRooms: new Set(),
      worldCamX,
      worldCamY,
    });
    for (const id of need) spawnOwRoomEnemies(id, dir);
  }

  /**
   * @param {number} rid
   * @param {boolean} [fogged]
   */
  async function ensureUwRoom(rid, fogged = false) {
    if (!dungeon?.levelData) return null;
    const id = rid & 0xff;
    const existing = uwStream.get(id);
    if (existing?.tileGrid && (existing.sprite || fogged)) {
      uwStream.setFog(id, fogged);
      // Keep frame visibility in sync when only fog toggles on a cached room.
      const frame = uwDoorFrames.get(id);
      if (frame?.sprite) frame.sprite.visible = !fogged;
      if (frame?.fog) frame.fog.visible = false;
      // Cracks are omitted while fogged; rebuild when the room becomes visible.
      syncUwBombCracks(existing, existing.pack, fogged);
      return existing;
    }
    const room = dungeon.levelData.rooms.find((r) => r.roomId === id);
    if (!room) return null;

    let tex = null;
    let frameTex = null;
    let tileGrid = null;
    const painted = paintDungeonRoom(room);
    if (painted) {
      tex = painted.tex;
      frameTex = painted.frameTex;
      tileGrid = painted.tileGrid;
    } else {
      tileGrid = buildDungeonPlayGrid(room, dungeonPlayOrigin(), UW_PRIMARY_SQUARES, {
        doorState: dungeon.doorState,
      });
      try {
        const questPack = inv.quest === 2 ? 2 : 1;
        tex = await Assets.load(
          `/dungeons/q${questPack}/level_${dungeon.level}/${room.image}`,
        );
        tex.source.scaleMode = 'nearest';
      } catch {
        const canvas = document.createElement('canvas');
        canvas.width = PLAY_W;
        canvas.height = PLAY_H;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#101018';
          ctx.fillRect(0, 0, PLAY_W, PLAY_H);
          tex = Texture.from(canvas);
          tex.source.scaleMode = 'nearest';
        }
      }
    }
    if (!tileGrid) return null;
    const entry = uwStream.upsert(id, tex, { tileGrid, pack: room, fogged });
    setUwDoorFrame(id, frameTex, fogged);
    syncUwBombCracks(entry, room, fogged);
    return entry;
  }

  async function ensureUwNeighbors() {
    if (!dungeon) return;
    const gen = ++streamFetchGen;
    applyPlayCamera();
    // Cellars sit on the map grid but are stairs-only — never stream them as
    // neighbors, and never stream map-adjacent top-down rooms while inside one.
    const ids = streamableUwRooms(
      roomsForCamera(worldCamX, worldCamY, { margin: 1, cols: 16, rows: 8 }),
      roomId,
      dungeon.levelData,
    );
    const fog = foggedRooms(ids, dungeon.visitedRooms, roomId);
    for (const id of ids) {
      if (gen !== streamFetchGen) return;
      await ensureUwRoom(id, fog.has(id));
    }
    if (gen !== streamFetchGen) return;
    uwStream.pruneTo(ids);
    uwDoorFrames.pruneTo(ids);
    for (const id of ids) {
      const fogged = fog.has(id) && id !== roomId;
      uwStream.setFog(id, fogged);
      const frame = uwDoorFrames.get(id);
      if (frame?.sprite) frame.sprite.visible = !fogged;
      if (frame?.fog) frame.fog.visible = false;
      const entry = uwStream.get(id);
      syncUwBombCracks(entry, entry?.pack, fogged);
    }
    uwStream.layout(roomId);
    uwDoorFrames.layout(roomId);
    roomSprite = uwStream.get(roomId)?.sprite ?? roomSprite;
  }

  /**
   * @param {number} rid
   * @param {number} [dir]
   */
  function spawnUwRoomEnemies(rid, dir = link.dir) {
    if (!dungeon?.levelData) return;
    const id = rid & 0xff;
    if (spawnedRooms.has(id)) return;
    if (!dungeon.visitedRooms.has(id) && id !== roomId) return;
    if (roomHasLivingEnemies(enemies, id)) {
      spawnedRooms.add(id);
      const home = enemiesInRoom(enemies, id);
      tagEnemyHomeRoom(home, id);
      claimLivingSpawnPoints(home, spawnClaims);
      return;
    }
    const entry = uwStream.get(id);
    const room = entry?.pack ?? dungeon.levelData.rooms.find((r) => r.roomId === id);
    if (!room) return;
    let spawned = spawnDungeonEnemies(room, { x: 0, y: 0 }, dir);
    if (dungeon.clearedRooms.has(id)) {
      spawned = spawned.filter((e) => persistsAfterRoomClear(e.objType));
    }
    if (dungeon.takenItems.has(id)) {
      // Bomb-upgrade person and Grumble both use the UW-item room flag.
      spawned = spawned.filter(
        (e) => !isBombUpgradePerson(e.objType) && !isGrumble(e.objType),
      );
    }
    // InitUnderworldPersonC: full Triforce dismisses L9 gatekeeper + opens shutters.
    const l9Gate = filterLevel9EntranceGate(spawned, dungeon.level, inv);
    spawned = l9Gate.remaining;
    if (l9Gate.openShutters) {
      openRoomShutters(dungeon.doorState, room);
      dungeon.clearedRooms.add(id);
      if (id === roomId) {
        roomClearedLatch = true;
        refreshDungeonRoomVisual();
      }
    }
    tagEnemyHomeRoom(spawned, id);
    const fresh = filterUnoccupiedSpawnPoints(spawned, enemies, spawnClaims);
    markEnemiesAwaitingView(fresh);
    const grid = entry?.tileGrid ?? dungeonTileGrid;
    if (grid) ejectEnemiesFromSolid(fresh, grid, dungeonTileOpts(inv));
    /** @type {typeof fresh} */
    const added = [];
    for (const e of fresh) {
      if (id !== roomId) {
        const off = offsetFromRoom(id, e.x, e.y);
        e.x = off.x;
        e.y = off.y;
        if (typeof e.trapOriginX === 'number') {
          const origin = offsetFromRoom(id, e.trapOriginX, e.trapOriginY ?? 0);
          e.trapOriginX = origin.x;
          e.trapOriginY = origin.y;
        }
      }
      if (
        !e.edgePending
        && !rectFullyOffCamera(e, camLocalX, camLocalY, 0)
      ) {
        e.viewActivated = true;
        if (!skipsSpawnCloud(e)) e.spawnCloud = 0x10;
      }
      if (!tryAddMonsterToRoom(enemies, e, id)) break;
      added.push(e);
    }
    claimLivingSpawnPoints(added, spawnClaims);
    spawnedRooms.add(id);
    // Person dialogue waits until Link clears the doorway and the NPC is in
    // view — see tryOpenPersonDialogue (not at spawn; streaming can skip that).
  }

  /**
   * @param {number} [dir]
   */
  function spawnVisibleUwRooms(dir = link.dir) {
    if (!dungeon) return;
    applyPlayCamera();
    const candidates = streamableUwRooms(
      roomsForCamera(worldCamX, worldCamY, {
        margin: 0,
        cols: 16,
        rows: 8,
      }),
      roomId,
      dungeon.levelData,
    );
    const need = roomsNeedingSpawn({
      candidateRooms: candidates,
      currentRoomId: roomId,
      visited: dungeon.visitedRooms,
      spawnedRooms,
      clearedRooms: dungeon.clearedRooms,
      worldCamX,
      worldCamY,
    });
    for (const id of need) spawnUwRoomEnemies(id, dir);
  }

  /**
   * Soft room enter after a passable-door seam cross. Caller already rebased
   * entities and assigned Link's continuous seam coords (no lip snap).
   * @param {{ nextRoomId: number, dir: number, unlocked?: boolean }} exit
   */
  async function softEnterDungeonRoom(exit) {
    if (!dungeon?.levelData || busy || inv.dead) return;
    const level = dungeon.levelData;
    const room = level.rooms.find((r) => r.roomId === exit.nextRoomId);
    if (!room) {
      void loadDungeonRoom(exit.nextRoomId, exit.dir);
      return;
    }
    busy = true;
    try {
      if (exit.unlocked) {
        refreshDungeonRoomVisual();
        refreshHud();
        audio?.playSfx('door');
        setStatus(`Unlocked door (${inv.keys} keys left)`);
      }

      clearClockFreeze(inv, enemies);
      roomId = exit.nextRoomId;
      personDialogueForRoom = null;
      dungeon.room = room;
      dungeon.visitedRooms.add(room.roomId);

      const enteredSide = entrySideForFacing(exit.dir);
      if (enteredSide && !dungeon.clearedRooms.has(room.roomId)) {
        closeShutterBehind(dungeon.doorState, room, enteredSide);
      }
      restoreClearedShutters(dungeon.doorState, dungeon.clearedRooms, level);
      sealLastBossShutters(dungeon.doorState, level, dungeon.lastBossDefeated);

      await ensureUwRoom(room.roomId, false);
      const entry = uwStream.get(room.roomId);
      // Never fall back to the room Link just left: `dungeonTileGrid` is the
      // collision map and `roomSprite` is what `patchRoomSquareAt` paints, so
      // a stale alias tears collision away from the art it belongs to.
      dungeonTileGrid = entry?.tileGrid ?? null;
      roomSprite = entry?.sprite ?? null;

      // Seam coords were set by the caller — keep them so the door reads as a
      // walkable path (no dungeonRoomSpawn / lip-clamp teleport).
      link.dir = exit.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      dungeon.doorwayBlockSide = entrySideForFacing(exit.dir);

      // Per-room fixtures for the new anchor (enemies already rebased).
      dungeon.roomKillCount = 0;
      floorTiles = room.squares ? roomToTileGrid(room, [...UW_PRIMARY_SQUARES]) : null;
      ladderObj = null;
      // Same floor origin as loadDungeonRoom — createPushBlock positions are
      // screen-absolute off FLOOR_ORIGIN (not world/stream offsets).
      const floor = floorFrame();
      const origin = { x: floor.x, y: floor.y };
      pushBlock = createPushBlock(room, origin, floorTiles ?? []);
      if (pushBlock && dungeon.pushedRooms.has(room.roomId)) {
        setUwSquareAt(pushBlock.homeX, pushBlock.homeY, 0x74);
        pushBlock.state = PUSH_STATE.DONE;
        pushBlock.complete = true;
        pushBlock.y -= 0x10;
        setUwSquareAt(pushBlock.x, pushBlock.y, 0xb0);
        if (pushSpawnsStairs(room)) {
          setUwSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
          patchRoomSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE);
        }
      }
      applyPushBlockRoomArt();
      pushBlockTex = null;
      roomItem = createRoomItem(
        room,
        { x: 0, y: 0 },
        itemPositionsFromLevel(level.itemPositions),
      );
      if (roomItem && dungeon.takenItems.has(room.roomId)) {
        roomItem.taken = true;
        roomItem.visible = false;
      } else if (dungeon.clearedRooms.has(room.roomId)) {
        if (roomItem && (roomItem.effect === 7 || roomItem.effect === 3)) {
          roomItem.visible = true;
        }
        roomClearedLatch = true;
        openRoomShutters(dungeon.doorState, room);
      } else {
        roomClearedLatch = false;
      }

      candleRoom = createCandleRoomState();
      armDarkRoomAutoLight(candleRoom, room, inv);
      flames = [];
      statueState = createStatueState(room.layoutId ?? -1);
      closeDialogue();

      refreshDungeonRoomVisual();
      await ensureUwNeighbors();
      spawnUwRoomEnemies(room.roomId, exit.dir);
      spawnVisibleUwRooms(exit.dir);
      applyPlayCamera();
      syncDarkOverlay();
      refreshHud();
      if (stubLabel) stubLabel.text = dungeonStubText(room);
      setStatus(`Level ${dungeon.level} room $${room.roomId.toString(16)}`);
    } finally {
      busy = false;
    }
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
        tex = markScaled(await Assets.load(bgUrl(nextRoomId, inv.quest)));
      } catch {
        tex = markScaled(await Assets.load(bgUrl(nextRoomId, 1)));
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

  /**
   * @param {number} mapIndex
   * @param {{ x?: number, y?: number, dir?: number }} spawn
   * @param {{ skipMusic?: boolean }} [opts]
   */
  async function loadOverworldScreen(mapIndex, spawn, opts = {}) {
    const loadGen = ++worldLoadGen;
    busy = true;
    try {
      mode = 'overworld';
      dungeon = null;
      ladderObj = null;
      cancelScreenScroll();
      streamFetchGen += 1;
      owStream.clear();
      uwStream.clear();
      uwDoorFrames.clear();
      owStream.layer.visible = true;
      uwStream.layer.visible = false;
      doorFrameLayer.visible = false;
      spawnedRooms = new Set();
      spawnClaims = new Set();
      if (roomSprite) {
        // Stream owns dungeon sprites; drop the legacy alias only.
        roomSprite = null;
      }
      if (bg && bg.parent && bg.parent !== owStream.layer) {
        bg.parent.removeChild(bg);
        bg.destroy({ texture: false, textureSource: false });
      }
      bg = null;
      if (stubLabel) {
        world.removeChild(stubLabel);
        stubLabel.destroy();
        stubLabel = null;
      }
      // After room sprites are gone — palette swap destroys enemy/item caches.
      applyEnemyPaletteForMode();

      roomId = mapIndex;
      await ensureOwRoom(mapIndex);
      if (loadGen !== worldLoadGen) return;
      const entry = owStream.get(mapIndex);
      if (!entry?.pack || !entry.tileGrid) {
        setStatus(`Failed to load OW $${mapIndex.toString(16)}`);
        return;
      }
      screen = { ...entry.pack, tileGrid: entry.tileGrid };
      bg = entry.sprite;
      candleRoom = createCandleRoomState();
      whirlwind = null;
      // A drained pond stays drained: the stairs sit in the water, so the
      // walkability floor has to survive the revisit even though the palette
      // (SecretColorCycle) resets with the screen.
      pondSecret = restorePondSecret(owSecretsRevealed, mapIndex);
      owWaterRgb = OW_WATER_RGB;

      link.x = spawn.x;
      link.y = spawn.y;
      if (spawn.dir != null) link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;

      await ensureOwNeighbors();
      if (loadGen !== worldLoadGen) return;
      // Hard load: wipe foes + their sprites. A bare `enemies = []` orphans
      // every `enemyGfx` entry until a later sync (and used to miss them).
      clearEnemies();
      spawnedRooms = new Set();
      spawnClaims = new Set();
      syncOwRoomItem();
      spawnOwRoomEnemies(mapIndex, spawn.dir ?? link.dir);
      applyPlayCamera();

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
      if (!opts.skipMusic && !inv.dead && mode === 'overworld') {
        playOverworldMusic();
      }
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
    // Fresh room: allow stairs/cellar warps again (latch is only for the
    // frames Link remains on the trigger after a successful fire).
    stairsLatch = false;
    try {
      bombs = [];
      clearEnemies();
      cancelScreenScroll();
      streamFetchGen += 1;
      owStream.clear();
      uwStream.clear();
      uwDoorFrames.clear();
      owStream.layer.visible = false;
      uwStream.layer.visible = true;
      doorFrameLayer.visible = true;
      spawnedRooms = new Set();
      spawnClaims = new Set();
      closeDialogue();
      bg = null;
      roomSprite = null;

      // Keep shutter / bomb / key opens before painting door faces.
      restoreClearedShutters(dungeon.doorState, dungeon.clearedRooms, level);
      sealLastBossShutters(dungeon.doorState, level, dungeon.lastBossDefeated);

      // TriggeredDoorCmd $02: the shutter Link walked through shuts behind
      // him. Cleared rooms stay open — their trigger re-fires immediately.
      const enteredSide =
        fromDir != null && !spawnOverride ? entrySideForFacing(fromDir) : null;
      if (enteredSide && !dungeon.clearedRooms.has(room.roomId)) {
        closeShutterBehind(dungeon.doorState, room, enteredSide);
      }

      const floor = floorFrame();
      if (stubLabel) {
        world.removeChild(stubLabel);
        stubLabel.destroy();
        stubLabel = null;
      }

      dungeon.room = room;
      roomId = room.roomId;
      personDialogueForRoom = null;
      dungeon.visitedRooms.add(room.roomId);

      await ensureUwRoom(room.roomId, false);
      const streamEntry = uwStream.get(room.roomId);
      if (!streamEntry?.tileGrid) {
        setStatus(`Failed to load room $${room.roomId.toString(16)}`);
        return false;
      }
      dungeonTileGrid = streamEntry.tileGrid;
      roomSprite = streamEntry.sprite;

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

      // clearEnemies() already ran at room-load start; keep the wave latches
      // fresh immediately before spawning this room's foes.
      spawnedRooms = new Set();
      spawnClaims = new Set();
      spawnUwRoomEnemies(room.roomId, link.dir);
      dungeon.roomKillCount = 0;
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

      if (stubLabel) {
        world.removeChild(stubLabel);
        stubLabel.destroy();
        stubLabel = null;
      }
      stubLabel = new Text({
        text: dungeonStubText(room),
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
      armDarkRoomAutoLight(candleRoom, room, inv);
      flames = [];
      statueState = createStatueState(room.layoutId ?? -1);
      await ensureUwNeighbors();
      applyPlayCamera();
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
    // Cancel in-flight OW loads so their completion cannot play overworld BGM
    // after we have switched to underworld/level9.
    worldLoadGen += 1;
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
      // Older builds set lastBoss on any boss kill (e.g. Patra). That marked
      // Ganon's room cleared and skipped the fight. Heal those saves unless the
      // Triforce of Power was actually collected.
      if (dungeon.lastBossDefeated && !inv.triforceOfPower) {
        dungeon.lastBossDefeated = false;
        const bossRoomId = level.bossRoom;
        if (bossRoomId != null) dungeon.clearedRooms.delete(bossRoomId & 0xff);
      }
      applyEnemyPaletteForMode();
      if (saved?.doors) {
        for (const k of saved.doors) dungeon.doorState.open.add(k);
      }
      sealLastBossShutters(
        dungeon.doorState,
        level,
        dungeon.lastBossDefeated,
      );
      inv.map = saved?.map ?? 0;
      inv.compass = saved?.compass ?? 0;
        owStream.clear();
      if (bg) {
        if (bg.parent && bg.parent !== owStream.layer) {
          bg.parent.removeChild(bg);
          bg.destroy({ texture: false, textureSource: false });
        }
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
    playDungeonMusic(levelId);
    // Only on a real descent from the overworld — a save resumed inside the
    // labyrinth is not the moment to introduce it.
    if (!opts.spawnOverride && resumeRoom === dungeon.levelData.startRoom) {
      tellLevelEntryStory(levelId);
    }
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
    // Cancel in-flight OW stream fetches so they cannot prune/layout mid-cave.
    streamFetchGen += 1;
    // Hide OW under the cave scene.
    owStream.layer.visible = false;
    if (bg) bg.visible = false;
    clearEnemies();
    bombs = [];
    // Candle flames live on fxLayer and are only stepped in combat — leave
    // them armed and a frozen orange blob hangs over the dweller forever.
    flames = [];
    projectiles = [];
    mode = 'cave';
    playField.x = 0;
    playField.y = 0;
    caveTileGrid = createCaveTileGrid();
    link.x = CAVE_ENTER_SPAWN.x;
    link.y = CAVE_ENTER_SPAWN.y;
    link.dir = CAVE_ENTER_SPAWN.dir;
    // OW knockback / mid-swing sword never finish in Mode B (no stepCombat),
    // and either one alone freezes Link on the mouth tile.
    clearCaveTransitState({ link, inv, sword, cancelSword });
    caveInteractLatch = false;
    caveExitLatch = true; // ignore exit until Link walks further inside
    gambleAmounts = cave.kind === 'gamble' ? rollMoneyGameAmounts() : null;
    gambleResolved = false;
    // Bombs/keys/etc. restock every visit; do not keep prior shop purchases
    // in the saved `caveTaken` set or the slot vanishes forever.
    clearShopVisitTaken(cave, caveTaken);
    // `roomId` is still the OW entrance screen (Mode B does not change it).
    // Money game: stake "-10" under each rupee until a pick reveals results.
    caveScene.openWith(
      cave,
      caveTaken,
      potionShopWaresHidden(cave, inv),
      inv,
      roomId,
      cave.kind === 'gamble' ? moneyGameStakeLabels() : null,
    );
    audio?.playSfx('stairs');
    setStatus(
      potionShopWaresHidden(cave, inv) ? 'The shopkeeper waits…' : describeCave(cave),
    );
    titleEl.textContent = `Cave $${caveId.toString(16)}`;
    refreshHud();
    openCaveDialogue(cave);
    // NES deducts the door fee when the cave text runs — not on walk-up.
    if (cave.kind === 'door') {
      const result = tryDoorRepair(inv, cave, caveTakenState());
      if (result.ok) {
        setStatus(result.label);
        audio?.playSfx('rupee');
        refreshHud();
      }
    }
  }

  async function leaveCave(opts = {}) {
    const cave = caveScene.cave;
    const destRoom = opts.roomId ?? caveReturn.roomId;
    const spawn = {
      x: opts.x ?? caveReturn.x,
      y: opts.y ?? caveReturn.y,
      dir: opts.dir ?? caveReturn.dir,
    };
    closeDialogue();
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

    // Same entrance screen: keep the existing stream (secrets already painted),
    // but refresh neighbors + spawns like loadOverworldScreen / raft soft-cross.
    // Skipping ensureOwNeighbors left missing grids as solid and pinned foes.
    if (screen && destRoom === roomId && owStream.get(roomId)) {
      streamFetchGen += 1;
      owStream.layer.visible = true;
      if (bg) bg.visible = true;
      link.x = spawn.x;
      link.y = spawn.y;
      if (spawn.dir != null) link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;
      clearEnemies();
      spawnedRooms = new Set();
      spawnClaims = new Set();
      pondSecret = restorePondSecret(owSecretsRevealed, roomId);
      owWaterRgb = OW_WATER_RGB;
      spawnOwRoomEnemies(roomId, spawn.dir ?? link.dir);
      projectiles = [];
      bombs = [];
      await ensureOwNeighbors();
      spawnVisibleOwRooms(spawn.dir ?? link.dir);
      applyPlayCamera();
      titleEl.textContent = 'Play — overworld';
      refreshHud();
      playOverworldMusic();
      audio?.playSfx('stairs');
      persistSave('cave exit');
      setStatus(cave ? 'Left the cave' : 'Back outside');
      return;
    }

    owStream.layer.visible = true;
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
      // Three staircases at ware columns; destinations loop from the entrance.
      const stair = roadStairUnderLink(link);
      if (stair < 0) return;
      const dest = takeAnyRoadDest(
        cave.takeAnyRoad ?? [],
        caveReturn?.roomId ?? roomId,
        stair,
      );
      if (dest != null) void leaveCave({ roadDest: dest });
      return;
    }

    if (cave.kind === 'gamble') {
      // Three amounts sit at the ware columns ($58/$78/$98, Y=$98).
      // One pick per visit — ROM HandleMoneyGame then idles in state 8.
      // Use the same ware hitbox as stepCave's latch, or a looser check here
      // latches a no-op and never retries when Link steps fully onto the slot.
      if (gambleResolved) return;
      const ware = wareUnderLink(
        link,
        caveWareSlots(cave, caveTaken, inv, caveEntranceRoomId()),
      );
      if (!ware) return;
      const amounts = gambleAmounts ?? rollMoneyGameAmounts();
      gambleAmounts = amounts;
      const result = tryGamble(inv, cave, ware.index, amounts);
      setStatus(result.ok ? result.label : (result.reason ?? 'Gamble'));
      if (result.ok) {
        gambleResolved = true;
        // Reveal signed win/loss under all three rupees (PrependSignToPrice).
        caveScene.refreshWares(
          caveTaken,
          false,
          inv,
          moneyGameResultLabels(amounts),
        );
        audio?.playSfx('rupee');
      }
      refreshHud();
      return;
    }

    if (cave.kind === 'moblin' || cave.kind === 'money') {
      // NES: touch the floating rupee (middle ware), not the Moblin sprite.
      const ware = wareUnderLink(
        link,
        caveWareSlots(cave, caveTaken, inv, caveEntranceRoomId()),
      );
      if (!ware) return;
      const result = tryMoblinGift(inv, cave, caveTakenState());
      setStatus(result.ok ? result.label : (result.reason ?? 'Nothing'));
      if (result.ok) {
        audio?.playSfx('rupee');
        caveScene.refreshWares(caveTaken, false, inv);
      }
      refreshHud();
      return;
    }

    if (potionShopWaresHidden(cave, inv)) return;
    const entranceRoom = caveEntranceRoomId();
    const slot = wareUnderLink(
      link,
      caveWareSlots(cave, caveTaken, inv, entranceRoom),
    );
    if (!slot) return;
    const result = tryBuyCaveSlot(inv, cave, slot.index, caveTakenState());
    if (!result.ok) {
      setStatus(result.reason ?? 'Cannot');
      return;
    }
    setStatus(`Got ${result.label}${result.price ? ` (−${result.price}R)` : ''}`);
    caveScene.refreshWares(caveTaken, false, inv);
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
    // Shelf purchases get the same introduction a labyrinth floor would give.
    tellItemStory(result.item, { interrupt: true });
  }

  function stepCave(inputMask) {
    if (!caveTileGrid || inv.dead) return;
    // CheckLiftItem halts the player while the item is held overhead.
    // Status timers (including itemLiftTimer) live in stepCombat for OW/UW;
    // caves never enter that path, so tick them here or the TakeItem pose
    // never ends and Link stays frozen after a gift/letter.
    if ((inv.itemLiftTimer ?? 0) > 0) {
      syncItemLiftSprite();
      stepLinkStatus(inv);
      return;
    }
    syncItemLiftSprite();
    // Same gap as itemLiftTimer: shove is applied in stepCombat only.
    applyShove();
    if (!isSwordActive(sword) && inv.shovePixels <= 0) {
      stepLink(link, caveTileGrid, inputMask);
    }
    ensureLinkNotInSolid();
    const cave = caveScene.cave;
    if (cave) {
      const slots = potionShopWaresHidden(cave, inv)
        ? []
        : caveWareSlots(cave, caveTaken, inv, caveEntranceRoomId());
      const overWare = wareUnderLink(link, slots);
      const overRoad =
        cave.kind === 'road' ? roadStairUnderLink(link) : -1;
      // Moblin / gamble / shop / gift: ware touch. Door repair charges on enter.
      const targetKey = overWare
        ? overWare.key
        : overRoad >= 0
          ? `road:${overRoad}`
          : null;
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
    stepLinkStatus(inv);
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
      syncOwBombCracks(owStream.get(roomId), roomId);
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
      // ROM: hardcode ObjX/Y then RevealAndFlagSecretStairsObj — not a layout
      // secret square lookup (room $42 has none).
      if (!screen?.tileGrid) return;
      const key = pondSecretKey(roomId);
      if (owSecretsRevealed.has(key)) return;
      if (!revealPondStairs(screen.tileGrid)) return;
      owSecretsRevealed.add(key);
      patchOwBgSquare(POND_STAIRS_COL, POND_STAIRS_ROW, SECRET_STAIRS_TILES);
      audio?.playSfx('secret');
      setStatus('Secret revealed (recorder)!');
      persistSave('pond stairs');
    }
  }

  /**
   * `CueTransferPondPaletteRow` — patch BG palette row 3's last colour. The
   * screen is a baked canvas rather than a live PPU, so we swap every pixel
   * that still carries the water colour.
   * @param {number} nesIndex
   */
  function recolorOwWater(nesIndex) {
    const spr = owStream.get(roomId)?.sprite ?? null;
    if (!spr) return;
    const next = nesColor(nesIndex);
    if (!next) return;
    const canvas = document.createElement('canvas');
    // Texture width is in world units once the source carries a resolution;
    // the backing store has to match the real pixels or the repaint rescales.
    canvas.width = spr.texture.source.pixelWidth;
    canvas.height = spr.texture.source.pixelHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const src = /** @type {CanvasImageSource | null} */ (spr.texture.source.resource);
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
    spr.texture = markScaled(Texture.from(canvas));
    bg = spr;
  }

  async function exitDungeon() {
    if (!dungeon || busy) return;
    snapshotDungeonProgress();
    ladderObj = null;
    holdingTriforceLift = false;
    liftItemType = null;
    syncItemLiftSprite();
    closeDialogue();
    invUi.close();
    world.y = 0;
    // NES Items RAM swaps per level — map/compass leave inventory on OW.
    inv.map = 0;
    inv.compass = 0;
    darkOverlay.visible = false;
    doorFrameLayer.tint = 0xffffff;
    candleRoom = createCandleRoomState();
    const spawn = overworldExitSpawn(dungeon.fromAttrs ?? {});
    const from = dungeon.fromRoomId ?? worldIndex.startScreen;
    // Drop dungeon stream before the OW reload (same care as leaveCave).
    uwStream.clear();
    uwDoorFrames.clear();
    doorFrameLayer.visible = false;
    roomSprite = null;
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

  // ---------------------------------------------------------------------------
  // Phase 19 — story text and overworld map marks
  // ---------------------------------------------------------------------------

  /** Context every mark resolver needs (quest changes which screens are open). */
  function markContext() {
    const quest = inv.quest === 2 ? 2 : 1;
    /** @type {Map<number, object>} */
    const levelDataByLevel = new Map();
    if (dungeon?.levelData) {
      levelDataByLevel.set(dungeon.level, dungeon.levelData);
    }
    return {
      screens: worldIndex.screens,
      quest,
      entrances: levelEntrances(quest),
      inv,
      levelData: dungeon?.levelData ?? null,
      levelDataByLevel,
    };
  }

  /**
   * Place the marks a piece of dialogue carries and say so in the status line.
   * @param {object[] | undefined} marks
   */
  function applyStoryMarks(marks) {
    const added = addHintMarks(hintMarks, marks, markContext());
    if (!added.length) return;
    const labelled = added.filter((m) => m.label);
    if (labelled.length) {
      setStatus(`Marked on the map — ${labelled.map((m) => m.label).join(', ')}`);
    }
    refreshHud();
  }

  /** Marks the radar should be drawing right now. */
  function currentMapMarks() {
    const ctx = markContext();
    return activeMapMarks({
      inv,
      hintMarks,
      screens: ctx.screens,
      entrances: ctx.entrances,
      quest: ctx.quest,
    });
  }

  /** Underworld tip-offs for the current labyrinth's minimap. */
  function currentDungeonMapMarks() {
    if (!dungeon) return [];
    return activeDungeonHintMarks(
      hintMarks,
      dungeon.level,
      inv,
      dungeon.levelData,
    );
  }

  /**
   * Cave dweller speech. Potion shops use `lockedPages` until the letter is
   * shown; wares stay hidden, but the old woman still talks.
   * @param {object | null} cave
   */
  /** OW screen for room-scoped caveTaken keys (take-any / door / moblin). */
  function caveEntranceRoomId() {
    return caveScene.roomId ?? caveReturn.roomId ?? roomId;
  }

  function caveTakenState() {
    return { taken: caveTaken, roomId: caveEntranceRoomId() };
  }

  function openCaveDialogue(cave) {
    if (!cave) return;
    const locked = potionShopWaresHidden(cave, inv);
    // "Been here before" = this cave had something to give and it is gone.
    const slots = locked
      ? []
      : caveWareSlots(cave, caveTaken, inv, caveEntranceRoomId());
    const repeat = !locked && slots.length > 0 && slots.every((slot) => slot.gone);
    const { pages, marks } = caveStory(cave, { repeat, locked, wares: slots });
    if (!pages.length) return;
    applyStoryMarks(marks);
    textBox.open(pages, { kind: 'cave' });
    // Mode B keeps physics running under the box (NES nametable crawl).
    setStatus('A / B / Start closes text — you can still walk');
  }

  /**
   * @param {number} level
   * @param {number} objType
   */
  function openPersonDialogue(level, objType) {
    const { pages, marks } = personStory(level, objType, {
      romTextLines: caveTextLines,
      inv,
    });
    if (!pages.length) return;
    applyStoryMarks(marks);
    textBox.open(pages, { kind: 'person' });
  }

  /**
   * Open underworld person dialogue once Link has fully entered the room and
   * the NPC is on camera (NES textbox starts after the person begins updating,
   * not while Link is still in the doorway).
   */
  function tryOpenPersonDialogue() {
    if (mode !== 'dungeon' || !dungeon || busy || inv.dead) return;
    if (textBox.active || personDialogueForRoom === roomId) return;
    if (
      dungeon.doorwayBlockSide
      && !doorwayLatchCleared(link, dungeon.doorwayBlockSide)
    ) {
      return;
    }
    const person = enemiesInRoom(enemies, roomId).find(
      (e) =>
        e.alive
        && (isPersonType(e.objType) || isGrumble(e.objType))
        && enemyCombatActive(e),
    );
    if (!person) return;
    openPersonDialogue(dungeon.level, person.objType);
    personDialogueForRoom = roomId;
  }

  function clearPersonWareSprites() {
    for (const g of personWareGfx.values()) {
      itemLayer.removeChild(g);
      g.destroy({ children: true, texture: false, textureSource: false });
    }
    personWareGfx.clear();
  }

  /**
   * Draw bomb-upgrade / money-or-life pay wares + price labels in front of
   * living UW persons (NES AnimateItemObject + TileBufSelector "-100"/etc).
   */
  function syncPersonWareSprites() {
    if (mode !== 'dungeon' || !dungeon?.room) {
      clearPersonWareSprites();
      return;
    }
    const roomFoes = enemiesInRoom(enemies, dungeon.room.roomId);
    const wares = personOfferWares(roomFoes, {
      bombTaken: dungeon.takenItems.has(dungeon.room.roomId),
    });
    const live = new Set(wares.map((w) => w.id));
    for (const [id, g] of [...personWareGfx.entries()]) {
      if (!live.has(id)) {
        itemLayer.removeChild(g);
        g.destroy({ children: true, texture: false, textureSource: false });
        personWareGfx.delete(id);
      }
    }
    const fontImg = sheetTextures.commonBg
      ? /** @type {CanvasImageSource} */ (sheetTextures.commonBg.source.resource)
      : null;
    for (const ware of wares) {
      let root = /** @type {Container & { __item?: Sprite }} */ (
        personWareGfx.get(ware.id)
      );
      if (!root) {
        root = new Container();
        const itemSpr = new Sprite(Texture.EMPTY);
        root.addChild(itemSpr);
        root.__item = itemSpr;
        if (fontImg && ware.priceLabel) {
          // Cave shops put prices under the ware; match that layout.
          root.addChild(
            nesText(fontImg, ware.priceLabel, ware.x - 2, ware.y + 18, 0xfcfcfc),
          );
        }
        personWareGfx.set(ware.id, root);
        itemLayer.addChild(root);
      }
      const pal = itemDrawPalette(ware.itemType, dropFrame);
      const drawn = items.itemTexture(roomItemChrTile(ware.itemType), pal);
      const itemSpr = root.__item;
      if (itemSpr) {
        itemSpr.texture = drawn.texture;
        itemSpr.x = ware.x + (drawn.narrow ? 4 : 0);
        itemSpr.y = ware.y;
      }
    }
  }

  /**
   * Say what an item is, once, the first time it is taken.
   *
   * Called from every pickup path — labyrinth floor, cave gift, shop shelf,
   * under an Armos — so one entry in `story/items.js` covers all of them. The
   * box opens while Link is still holding the thing over his head: in a
   * labyrinth the world is frozen under it, so the pose simply waits.
   *
   * @param {number | null | undefined} itemType ROM `Item_codes` value
   * @param {{ interrupt?: boolean }} [opts] `interrupt` cuts off whoever is
   *   currently talking instead of queueing behind them
   * @returns {boolean} true when the box was opened
   */
  function tellItemStory(itemType, opts = {}) {
    if (itemType == null) return false;
    const key = `item:${itemType & 0xff}`;
    if (toldStory.has(key)) return false;
    const { pages, marks } = itemStory(itemType);
    // Remember it either way: an item with no prose is still "introduced", so
    // adding prose later cannot interrupt a run that is already past it.
    toldStory.add(key);
    if (!pages.length) return false;
    // A shopkeeper is usually still mid-speech when Link steps onto the ware.
    // He has had his say by then — the player is already buying.
    if (opts.interrupt && textBox.active) closeDialogue();
    return sayStory(pages, marks, 'item', { itemType: itemType & 0xff });
  }

  /**
   * The first time Link stands inside a labyrinth, describe the labyrinth.
   * @param {number} level
   */
  function tellLevelEntryStory(level) {
    if (!Number.isFinite(level)) return false;
    const key = `level:${level | 0}`;
    if (toldStory.has(key)) return false;
    toldStory.add(key);
    const { pages, marks } = levelEntryStory(level);
    if (!pages.length) return false;
    return sayStory(pages, marks, 'levelEntry', { level });
  }

  /**
   * Open a story box, or queue it behind one that is already talking.
   *
   * A shopkeeper is usually still mid-sentence when Link steps onto the ware
   * he is selling, and a labyrinth old man can be talking when a floor item is
   * taken. Dropping the second speech would lose it for good — these beats
   * only ever fire once — so it waits for the box instead.
   *
   * @param {string[]} pages
   * @param {object[]} marks
   * @param {string} kind
   * @param {object | null} [meta]
   * @returns {boolean} true if it opened now rather than queueing
   */
  function sayStory(pages, marks, kind, meta = null) {
    if (textBox.active || inv.dead) {
      pendingStory = { pages, marks, kind, meta };
      return false;
    }
    applyStoryMarks(marks);
    textBox.open(pages, { kind, meta });
    return true;
  }

  /**
   * Shut the box without letting a queued beat leak into whatever comes next.
   *
   * Every forced close in this file is a mode change — a room load, a cave
   * exit, death, a new file. A story waiting behind the box belonged to the
   * situation being torn down, so it goes with it.
   */
  function closeDialogue() {
    pendingStory = null;
    textBox.close();
  }

  /** Open whatever was waiting behind the box that just closed. */
  function drainPendingStory() {
    const next = pendingStory;
    pendingStory = null;
    if (!next || inv.dead) return;
    applyStoryMarks(next.marks);
    textBox.open(next.pages, { kind: next.kind, meta: next.meta });
  }

  /**
   * The between-labyrinth briefing: what the shard means, where to go next,
   * and what treasure was left on the floor behind you.
   * @param {number} level
   */
  function openLevelBriefing(level) {
    const { pages, marks, missed } = levelCompletionStory(level, {
      levelData: dungeon?.levelData ?? null,
      takenRooms: dungeon?.takenItems ?? new Set(),
    });
    if (!pages.length) return;
    applyStoryMarks(marks);
    textBox.open(pages, { kind: 'briefing', meta: { level, missed: missed.length } });
  }

  /**
   * @param {{ kind: string, meta: object | null }} res
   */
  function onDialogueClosed(res) {
    if (res.kind === 'briefing') {
      // The briefing walks Link out of the labyrinth; anything queued behind
      // it would open over the overworld transition.
      pendingStory = null;
      persistSave('level briefing');
      // NES EndGameMode12 → OW entrance after the Mode $12 ceremony.
      void exitDungeon();
      return;
    }
    drainPendingStory();
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
    // A mark whose item is now in the bag retires itself.
    pruneHintMarks(hintMarks, inv);
    hud.update({
      inv,
      location,
      mode,
      roomId: mapRoomId,
      dungeon,
      rupeesShown: rupeeRoll.shown,
      mapMarks: currentMapMarks(),
      dungeonMarks: currentDungeonMapMarks(),
      frame: uiFrame,
    });
  }

  function activeLinkTileGrid() {
    if (mode === 'dungeon') return dungeonTileGrid;
    if (mode === 'cave') return caveTileGrid;
    return screen?.tileGrid ?? null;
  }

  /**
   * NES CheckPersonBlocking for the current UW room (Grumble / old men).
   * @param {number} dirMask
   */
  function maskPersonBlockedDir(dirMask) {
    if (mode !== 'dungeon' || !dungeon?.room) return dirMask;
    const roomFoes = enemiesInRoom(enemies, dungeon.room.roomId);
    if (!roomHasPersonBlocker(roomFoes)) return dirMask;
    return applyPersonBlocking(link.y, dirMask);
  }

  function applyShove() {
    if (inv.shovePixels <= 0 || !inv.shoveDir) return;
    const grid = activeLinkTileGrid();
    if (!grid) {
      inv.shovePixels = 0;
      return;
    }
    // Shove into a person/Grumble gate cancels the knockback (ResetShoveInfo).
    const shoveDir = maskPersonBlockedDir(inv.shoveDir);
    if (!shoveDir) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      return;
    }
    const tileOpts =
      mode === 'overworld'
        ? overworldLinkTileOpts()
        : mode === 'dungeon'
          ? dungeonTileOpts(inv)
          : {};
    const result = stepShove(link, grid, shoveDir, inv.shovePixels, {
      roomId:
        mode === 'overworld'
          ? CONTINUOUS_OW
          : mode === 'dungeon'
            ? UW_ROOM_BOUNDS
            : null,
      tileOpts,
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
        doorState: dungeon.doorState,
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
    const tileOpts =
      mode === 'overworld'
        ? overworldLinkTileOpts()
        : mode === 'dungeon'
          ? dungeonTileOpts(inv)
          : {};
    const result = ejectLinkFromSolid(link, grid, {
      roomId:
        mode === 'overworld'
          ? CONTINUOUS_OW
          : mode === 'dungeon'
            ? UW_ROOM_BOUNDS
            : null,
      tileOpts,
      preferDir,
    });
    if (result.ejected) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
    }
  }

  function hurtLinkFrom(dir, halfHearts) {
    if (debugCheats.invincible) return;
    const result = harmLink(inv, halfHearts);
    if (!result.applied) return;
    resetDropStreak(dropCounters);
    clearClockFreeze(inv, enemies);
    audio?.playSfx('hurt');
    inv.shoveDir = oppositeDir(dir) || oppositeDir(link.dir) || DIR.DOWN;
    inv.shovePixels = 0x20;
    refreshHud();
    if (result.died) beginDeath();
  }

  /** GameMode $11: silence the world and hand the screen to the death sequence. */
  function beginDeath() {
    // InitMode11Death ends in SilenceSound before the first submode runs.
    worldLoadGen += 1;
    cancelScreenScroll();
    audio?.stopMusic();
    // Mode $11 owns the screen from here; an open textbox would halt it.
    closeDialogue();
    pendingBriefingLevel = null;
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
    // Effect `$80` / leaving mode `$08`: drop Tune1 game-over before anything else.
    audio?.stopSfx();
    if (action === 'continue') {
      continueAfterDeath();
      return;
    }
    persistSave(action === 'save' ? 'continue menu save' : 'retry');
    inv.dead = false;
    playing = false;
    dungeon = null;
    audio?.stopMusic();
    audio?.playMusic('title');
    titleUi.setSlots(saveStore.listSlots());
    titleUi.show();
    setStatus(action === 'save' ? 'Saved — file select' : 'Retry — file select');
  }

  /**
   * NES Mode 3 unfurl stand-in: reload dungeon entrance after capture slide.
   * @param {import('@shared/enemies.js').Enemy} e
   */
  function finishWallmasterCapture(e) {
    e.wallmasterGrab = false;
    e.wallmasterWarpPending = false;
    e.alive = false;
    inv.paralyzed = 0;
    const entrance = dungeon?.levelData?.startRoom;
    const entranceY = dungeon?.levelData?.startY;
    if (entrance == null) return;
    snapshotDungeonProgress();
    void loadDungeonRoom(entrance, DIR.UP, null, { entranceY });
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
      // Capture starts a slide into the wall; warp fires when the trip ends.
      if (!e.wallmasterGrab) {
        e.wallmasterGrab = true;
        e.captureTimer = 1;
        e.wallmasterRetreatDir = undefined;
        e.wallmasterTilesCrossed = 0;
        e.gridOffset = 0;
        inv.shovePixels = 0;
        inv.shoveDir = 0;
        setStatus('Wallmaster!');
      }
      inv.paralyzed = 2; // sticky halt (Like-Like pattern) for the whole slide
      link.x = e.x;
      link.y = e.y;
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
   * @param {number} [targetRoomId] defaults to current room
   */
  function patchOwBgSquare(col, row, tiles, targetRoomId = roomId) {
    // Strictly the target room's own sprite. Falling back to the `bg` alias
    // painted revealed secrets onto whichever screen `bg` last pointed at.
    const spr = owStream.get(targetRoomId)?.sprite ?? null;
    if (!spr) return;
    const canvas = document.createElement('canvas');
    canvas.width = spr.texture.source.pixelWidth;
    canvas.height = spr.texture.source.pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const bgSrc = /** @type {CanvasImageSource | null} */ (spr.texture.source.resource);
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
      const T = tilePx();
      const dxPx = px(col * 16 + dx);
      const dyPx = px(row * 16 + dy);
      // common_misc is extracted as sprites (color 0 = transparent). As OW BG,
      // slot 0 is opaque black — e.g. bomb cave mouth $F3/$24/$F3/$24. Without
      // this underlay the rock shows through the top half and the mouth looks short.
      ctx.fillStyle = '#000000';
      ctx.fillRect(dxPx, dyPx, T, T);
      ctx.drawImage(
        img,
        src.sx * scale(),
        src.sy * scale(),
        T,
        T,
        dxPx,
        dyPx,
        T,
        T,
      );
    }
    spr.texture = markScaled(Texture.from(canvas));
    if (targetRoomId === roomId) bg = spr;
  }

  /**
   * Tint unopened candle-burn trees opposite the local forest colour so they
   * stand out from neighboring canopy (green ↔ orange). Safe to call on screens
   * that already baked the hint — missing source foliage makes it a no-op.
   * @param {import('pixi.js').Sprite | null} spr
   * @param {{ secrets?: object[], attrs?: { outerPalette?: number, innerPalette?: number } }} pack
   * @param {number} mapIndex
   */
  function applyBurnTreeColorHints(spr, pack, mapIndex) {
    const rowsRgb = owPaletteSet?.rowsRgb;
    if (!spr || !rowsRgb || !pack?.attrs) return;
    const secrets = pack.secrets ?? [];
    if (!secrets.length) return;

    /** @type {{ col: number, row: number, from: number, to: number }[]} */
    const jobs = [];
    for (const secret of secrets) {
      if (secretAction(secret) !== 'burn') continue;
      const key = `${mapIndex}:${secret.row}:${secret.col}`;
      if (owSecretsRevealed.has(key)) continue;
      const from = paletteRowForSquare(
        secret.row,
        secret.col,
        pack.attrs.outerPalette ?? 0,
        pack.attrs.innerPalette ?? 0,
      );
      const to = contrastingTreePaletteRow(from);
      if (from === to) continue;
      if (!rowsRgb[from] || !rowsRgb[to]) continue;
      jobs.push({ col: secret.col, row: secret.row, from, to });
    }
    if (!jobs.length) return;

    const canvas = document.createElement('canvas');
    canvas.width = spr.texture.source.pixelWidth;
    canvas.height = spr.texture.source.pixelHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const src = /** @type {CanvasImageSource | null} */ (spr.texture.source.resource);
    if (!src) return;
    ctx.drawImage(src, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let changed = false;
    for (const job of jobs) {
      if (
        recolorBurnTreeSquareRgba(
          image.data,
          canvas.width,
          job.col,
          job.row,
          rowsRgb[job.from],
          rowsRgb[job.to],
          { enhanced: false, nesPxScale: scale() },
        )
      ) {
        changed = true;
      }
    }
    if (!changed) return;
    ctx.putImageData(image, 0, 0);
    spr.texture = markScaled(Texture.from(canvas));
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
      tellItemStory(ARMOS_BRACELET_ITEM);
    }
  }

  /**
   * DealDamage / PlayParryTune / PlayBossHitCryIfNeeded cues for a weapon result.
   * @param {import('@shared/enemies.js').Enemy} e
   * @param {import('@shared/combatSfx.js').WeaponHitResult} result
   */
  /**
   * Shared post-hit path: optional OHK, hit SFX, death/drop side effects.
   * @param {object} e
   * @param {boolean} wasAlive
   * @param {true | false | 'parry'} hit
   * @param {number} [damageType]
   */
  function applyWeaponHit(e, wasAlive, hit, damageType = 0) {
    if (debugCheats.oneHitKills) applyOneHitKill(e, hit);
    playWeaponHitSfx(e, hit);
    if (!(wasAlive && !e.alive)) return;
    if (isGleeok(e.objType)) clearGleeokHeads(e.id, enemies);
    onEnemyKilled(e, damageType);
  }

  function playWeaponHitSfx(e, result) {
    for (const name of sfxNamesForWeaponHit(result, e, { isBoss: isBossType(e.objType) })) {
      audio?.playSfx(name);
    }
  }

  /**
   * NES HandleMonsterDied → SetUpDroppedItem after a kill.
   * @param {object} e
   * @param {number} [damageType]
   */
  function onEnemyKilled(e, damageType = 0) {
    // Tune1 $20 is the death cue; `enemy_die` / `boss_hit` fire from playWeaponHitSfx.
    audio?.playSfx(isBossType(e.objType) ? 'boss_defeat' : 'monster_die');
    if (isGanon(e.objType)) audio?.playFanfare('ganon');
    // A foe streamed in from a neighbour must not count toward this room's
    // kill tally or trip its ringleader cascade.
    const homeRoom = (e.homeRoomId ?? roomId) & 0xff;
    const inCurrentRoom = homeRoom === (roomId & 0xff);
    if (mode === 'dungeon' && dungeon && inCurrentRoom) {
      dungeon.roomKillCount = (dungeon.roomKillCount ?? 0) + 1;
      // NES LastBossDefeated ($672) is set only after Ganon's death sequence —
      // never on Patra / other bosses. Using isBossType here opened Ganon's
      // LAST_BOSS shutters (and latched clearedRooms) as soon as Patra died.
      if (isGanon(e.objType)) {
        dungeon.lastBossDefeated = true;
      }
    }
    const born = spawnDeathSplits(e, enemies);
    for (const kid of born) {
      // Splits inherit the parent's room and its already-revealed state.
      tagEnemyHomeRoom([kid], homeRoom);
      kid.viewActivated = true;
      tryAddMonsterToRoom(enemies, kid, homeRoom);
    }
    const roomFoes = enemiesInRoom(enemies, homeRoom);
    const slotIndex = e.slotIndex ?? roomFoes.indexOf(e) + 1;
    const drop = tryCreateDropFromKill({
      objType: e.objType,
      counters: dropCounters,
      randomByte: dropRng,
      damageType,
      slotIndex,
      x: e.x,
      y: e.y,
      forceDrop: debugCheats.insaneDrops,
    });
    if (drop) {
      drop.id = dropSpriteSeq++;
      drops.push(drop);
    }
    // Ringleader: when slot 1 dies / empties, wipe the room.
    if (
      mode === 'dungeon'
      && dungeon
      && inCurrentRoom
      && roomSecretEffect(dungeon.room) === SECRET.RINGLEADER
      && slotIndex === 1
    ) {
      tryRingleaderClear(roomFoes);
    }
  }

  function tryTakeDropsWith(takerX, takerY, takerKind = 'link') {
    if (!isValidItemTaker(takerKind)) return;
    for (const d of drops) {
      if (!d.alive || !dropTouchesTaker(d, takerX, takerY)) continue;
      const got = grantDroppedItem(inv, d.itemId);
      d.alive = false;
      if (got.ok) {
        if (d.itemId === DROP_ITEM.CLOCK) {
          tagVisibleEnemiesForClock(
            enemies,
            (e) => !rectFullyOffCamera(e, camLocalX, camLocalY, 0),
          );
          if (!clockFreezeActive(enemies)) clearClockFreeze(inv, enemies);
        }
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
    // UpdateRupeeStash — walk onto a $35 pickup (L7 stash rooms, etc.).
    const stash = tryTakeRupeeStash(enemies, link, inv);
    if (stash.taken) {
      audio?.playSfx('rupee');
      setStatus('Rupee');
      refreshHud();
    }

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
    // Only the fairy in Link's current room — a streamed neighbor fountain
    // must not consume the heal when Link walks Y=$AD elsewhere.
    const fairy = findPondFairy(enemies, roomId);
    if (!fairy || !enemyCombatActive(fairy)) {
      pondFairyHalt = false;
      clearPondHeartSprites();
      return false;
    }
    const result = stepPondFairy(fairy, inv, link, { roomId });
    pondFairyHalt = result.haltLink;
    if (result.playHeartTune) audio?.playSfx('text');
    syncPondHeartSprites(result.hearts, result.showOrbitHearts);
    if (result.haltLink || result.playHeartTune) refreshHud();
    return result.haltLink;
  }

  function stepRoomSecrets() {
    if (mode === 'overworld') {
      tryPickupOwRoomItem();
      return;
    }
    if (mode !== 'dungeon' || !dungeon?.room) return;
    const effect = roomSecretEffect(dungeon.room);
    // Room clear is a question about *this* room. Asking it of the whole
    // streamed list let a visible neighbour's foes hold the shutters shut.
    const roomFoes = enemiesInRoom(enemies, dungeon.room.roomId);

    // InitUnderworldPersonC live path (already spawned before the gate check).
    if (dismissLevel9EntranceGate(roomFoes, dungeon.level, inv)) {
      const sides = openRoomShutters(dungeon.doorState, dungeon.room);
      dungeon.clearedRooms.add(dungeon.room.roomId);
      roomClearedLatch = true;
      if (sides.length) refreshDungeonRoomVisual();
      setStatus('Triforce complete — path opens');
    }

    // Money-or-life: pay by walking onto heart (−1♥) or rupee (−50) ware.
    if (effect === SECRET.MONEY_OR_LIFE && !roomClearedLatch) {
      const paid = tryPayMoneyOrLife(inv, link.x, link.y);
      if (paid) {
        dismissMoneyOrLifePerson(roomFoes);
        audio?.playSfx(paid === 'rupees' ? 'rupee' : 'key');
        setStatus(paid === 'rupees' ? 'Paid 50 rupees' : 'Paid a heart container');
        refreshHud();
      }
    }

    // More-bombs person ($4F): stand on the −100 rupee ware.
    if (
      bombUpgradePersonAlive(roomFoes)
      && !dungeon.takenItems.has(dungeon.room.roomId)
      && tryBuyBombUpgrade(inv, link.x, link.y)
    ) {
      dismissBombUpgradePerson(roomFoes);
      dungeon.takenItems.add(dungeon.room.roomId);
      audio?.playSfx('rupee');
      setStatus(`Bomb capacity ${inv.maxBombs}!`);
      refreshHud();
      invUi.refresh(inv, dungeon);
    }

    if (effect === SECRET.RINGLEADER && !roomClearedLatch) {
      tryRingleaderClear(roomFoes);
    }

    const allDead = roomAllDead(roomFoes);
    const ready =
      effect === SECRET.LAST_BOSS
        // Flag alone is not enough: a stale lastBoss (or wrong setter) must not
        // latch the room while Ganon is still alive / invisible.
        ? Boolean(dungeon.lastBossDefeated) && allDead
        : effect === SECRET.MONEY_OR_LIFE
          ? moneyOrLifeReady(roomFoes)
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
        || roomHasClearCountingType(roomFoes)
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
    syncRoomItemPosition(roomItem, roomFoes);
    const picked = tryPickupRoomItem(roomItem, link.x, link.y);
    if (picked != null) {
      dungeon.takenItems.add(dungeon.room.roomId);
      const label = grantRoomItem(inv, picked, { level: dungeon.level });
      refreshHud();
      invUi.refresh(inv, dungeon);
      // TakeItem always posts Tune1 `$08`; floor takes skip the lift song.
      audio?.playSfx('item_taken');
      if (picked === 0x1b && hasTriforce(inv, dungeon.level)) {
        audio?.playFanfare('triforce');
        // GameMode $12: halt, hold the shard overhead, flash, then fill hearts.
        holdingTriforceLift = true;
        startItemLift(0x1b);
        startTriforceCeremony(triforceCeremony);
        // The briefing waits for the fanfare — see the ceremony step below.
        pendingBriefingLevel = dungeon.level;
        setStatus(
          dungeon.level >= 8
            ? `Got ${label}! ${triforceCount(inv)}/8 — Level 9 awaits`
            : `Got ${label}! Level ${dungeon.level} clear`,
        );
      } else {
        audio?.playFanfare('item');
        setStatus(`Got ${label}!`);
        tellItemStory(picked);
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
    // Streamed foes stay inert until their sprite enters the camera.
    const revealed = activateEnemiesInView(
      enemies,
      (e) => !rectFullyOffCamera(e, camLocalX, camLocalY, 0),
    );
    for (const e of revealed) {
      const roar = bossRoarSfx(e.objType);
      if (roar) audio?.playSfx(roar);
      if (e.objType === OBJ.POND_FAIRY) audio?.playSfx('item_taken');
    }

    const swordWasActive = isSwordActive(sword);
    const swordPrevPhase = sword.phase;
    if (swordWasActive) {
      stepSword(sword);
      for (const e of enemies) {
        if (e.edgePending || enemyAwaitingView(e)) continue;
        const wasAlive = e.alive;
        const hit = trySwordHitEnemy(e, sword, link.x, link.y, inv.sword, {
          enemies,
          onGleeokHeadDetach: (body) => {
            const head = spawnGleeokHead(body, createEnemy);
            if (head) {
              head.viewActivated = true;
              tagEnemyHomeRoom([head], body.homeRoomId ?? roomId);
              tryAddMonsterToRoom(enemies, head, body.homeRoomId ?? roomId);
            }
          },
        });
        applyWeaponHit(e, wasAlive, hit);
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
    const baseTileOpts = mode === 'dungeon' ? dungeonTileOpts(inv) : {};
    const grids =
      mode === 'overworld'
        ? owStream.gridMap()
        : mode === 'dungeon'
          ? uwStream.gridMap()
          : null;
    const tileOpts = grids
      ? {
          ...baseTileOpts,
          collidingTile: (x, y, dir) =>
            getMonsterCollidingTileMulti(grids, roomId, x, y, dir, baseTileOpts),
          standingTile: (x, y) => standingTileMulti(grids, roomId, x, y),
        }
      : baseTileOpts;
    const chase =
      bait?.alive ? { x: bait.x, y: bait.y } : { x: link.x, y: link.y };
    if (inv.clock && !clockFreezeActive(enemies)) {
      clearClockFreeze(inv, enemies);
    }
    const clockActive = Boolean(inv.clock);

    // Edge slide-in: place pending foes on open border cells. Each foe is
    // placed against *its own* room's grid — a `monsterEntry` neighbour used
    // to sit edge-pending forever (invisible, inert, and still holding a
    // monster slot) because only the anchor room's foes were ever considered.
    // New spawns are not clock-frozen (only foes tagged at pickup).
    if (mode === 'overworld') {
      for (const e of enemies) {
        if (!e.edgePending || enemyIsClockFrozen(e)) continue;
        const home = (e.homeRoomId ?? roomId) & 0xff;
        const homeGrid = home === (roomId & 0xff)
          ? owGrid
          : owStream.get(home)?.tileGrid ?? null;
        if (!homeGrid) continue;
        // tryEdgeSpawn works in the home room's own local space; Link has to
        // be expressed there too so the "too close to Link" test holds.
        const linkLocal = offsetToRoom(home, link.x, link.y);
        const placed = tryEdgeSpawn(e, homeGrid, linkLocal);
        if (!placed) continue;
        e.x = placed.x;
        e.y = placed.y;
        e.dir = placed.dir;
        e.edgePending = false;
        e.viewActivated = true;
        // InitMonster metastate 1 — brief spawn cloud before the foe appears.
        e.spawnCloud = 0x10;
        ejectEnemiesFromSolid([e], homeGrid);
        const anchored = offsetFromRoom(home, e.x, e.y);
        e.x = anchored.x;
        e.y = anchored.y;
      }
      // Shore ambient — LevelBlockAttrsA bit $04 → EffectRequest $20 (sea).
      // Re-request each frame; audio.js continues an in-flight sea ramp.
      if (screen?.attrs?.wave) audio?.playSfx('sea');
      // CheckZora — attrs.zora rooms get one water Zora when the slot is free.
      if (owGrid) {
        // `trySpawnZora` scopes its one-per-room slot test by `roomId`.
        const zora = trySpawnZora(screen?.attrs, owGrid, enemies, {
          rngByte: dropRng,
          roomId,
        });
        if (zora) {
          tagEnemyHomeRoom([zora], roomId);
          markEnemiesAwaitingView([zora]);
          tryAddMonsterToRoom(enemies, zora, roomId);
        }
      }
    }

    const newShots = [];
    const newBooms = [];
    for (const e of enemies) {
      if (!enemyCombatActive(e)) continue;
      if (!enemyIsClockFrozen(e)) {
        stepEnemy(e, enemyBoundsFor(e), tileGrid, {
          chase,
          link,
          enemies,
          rngByte: dropRng,
          onArmosAwake,
          fluteJustUsed: flutePulse > 0,
          onDigdoggerSplit: (parent) => {
            const kids = spawnDigdoggerChildren(parent, createEnemy);
            if (kids.length) {
              for (const kid of kids) {
                tagEnemyHomeRoom([kid], e.homeRoomId ?? roomId);
                kid.viewActivated = true;
                tryAddMonsterToRoom(enemies, kid, e.homeRoomId ?? roomId);
              }
              setStatus('Digdogger splits!');
            }
          },
          ...tileOpts,
        });
        const shootSfx = tryEnemyShoot(e, newShots, newBooms, {
          target: chase,
          rngByte: dropRng,
        });
        if (shootSfx) audio?.playSfx(shootSfx);
      } else if (e.invuln > 0) {
        e.invuln -= 1;
      }
    }
    // Continuous streaming can leave walkers planted on trees/rocks after a
    // seam rebase or a late tile-grid load — slide them back onto open ground.
    if (grids) {
      ejectEnemiesFromSolid(
        enemies.filter(
          (e) =>
            enemyCombatActive(e)
            && !enemyIsClockFrozen(e)
            && !wallmasterIsCapturing(e),
        ),
        tileGrid,
        tileOpts,
      );
    }

    // Wallmaster trip end → dungeon entrance (after slide, not on first touch).
    const capturer = enemies.find((e) => e.wallmasterWarpPending);
    if (capturer && mode === 'dungeon' && dungeon) {
      finishWallmasterCapture(capturer);
      return;
    }

    const linkCaptured = enemies.some((e) => wallmasterIsCapturing(e));
    // Halt for the whole slide (ObjState $40), not just contact frames.
    if (linkCaptured) inv.paralyzed = 2;
    for (const e of enemies) {
      // Clock: keep Link topped up with invuln like NES InvClock while active.
      if (clockActive && inv.invuln < 8) inv.invuln = 8;
      if (!enemyCombatActive(e) || enemyIsHidden(e)) continue;
      // During Wallmaster slide, only the capturer may touch Link.
      if (linkCaptured && !wallmasterIsCapturing(e)) continue;
      if (!enemyTouchesLink(e, link.x, link.y)) {
        if (e.objType === OBJ.LIKE_LIKE) e.captureTimer = 0;
        continue;
      }
      handleEnemyContact(e);
    }
    projectiles.push(...newShots);
    enemyBooms.push(...newBooms);
    if (mode === 'dungeon' && statueState) {
      projectiles.push(...stepStatues(statueState, link));
    }

    for (const p of projectiles) {
      stepProjectile(p, bounds);
      if (p.friendly) {
        for (const e of enemies) {
          if (e.edgePending || enemyAwaitingView(e)) continue;
          const wasAlive = e.alive;
          const hit =
            p.kind === 0x5b || p.kind === 0x5c
              ? tryArrowHitEnemy(e, p, { enemies })
              : tryBeamOrRodHitEnemy(e, p, {
                  enemies,
                  onGleeokHeadDetach: (body) => {
                    const head = spawnGleeokHead(body, createEnemy);
                    if (head) {
                      head.viewActivated = true;
                      tagEnemyHomeRoom([head], body.homeRoomId ?? roomId);
                      tryAddMonsterToRoom(enemies, head, body.homeRoomId ?? roomId);
                    }
                  },
                });
          applyWeaponHit(e, wasAlive, hit);
        }
        continue;
      }
      if (!projectileTouchesLink(p, link.x, link.y) || p.damage <= 0) continue;
      const shield = shotBlockedByShield(p, link, inv, {
        idle: !isSwordActive(sword),
      });
      if (shield === SHIELD_RESULT.PARRY) {
        // CheckLinkCollision @Parry → Tune0 `$01`.
        audio?.playSfx('shield');
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
        if (e.edgePending || enemyAwaitingView(e)) continue;
        const wasAlive = e.alive;
        const hit = tryFireHitEnemy(e, f, { enemies });
        applyWeaponHit(e, wasAlive, hit);
      }
    }
    flames = flames.filter((f) => f.alive);

    if (mode === 'dungeon') checkZeldaRescue();

    if (boomerang) {
      stepBoomerang(boomerang, link.x, link.y);
      if (boomerang.phase !== BOOM_PHASE.DONE) {
        for (const e of enemies) {
          if (e.edgePending || enemyAwaitingView(e)) continue;
          const wasAlive = e.alive;
          const hit = tryBoomerangHitEnemy(e, boomerang);
          applyWeaponHit(e, wasAlive, hit);
        }
      } else {
        boomerang = null;
      }
    }

    // Goriya (and other) hostile boomerangs — return to owner, harm Link.
    // Frozen owners' booms still finish their flight.
    if (enemyBooms.length) {
      const next = [];
      for (const boom of enemyBooms) {
        const owner = enemies.find((e) => e.id === boom.ownerId && e.alive);
        if (owner && enemyIsClockFrozen(owner)) {
          next.push(boom);
          continue;
        }
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
          // InitGrumble / UpdateGrumble3: room UW-item flag + clear InvFood.
          const home = e.homeRoomId ?? roomId;
          if (dungeon?.takenItems) dungeon.takenItems.add(home & 0xff);
          inv.food = 0;
          setStatus('Hungry Goriya eats the bait!');
          audio?.playSfx('secret');
          refreshHud();
          invUi.refresh(inv, dungeon);
        }
      }
      if (!bait.alive) bait = null;
    }

    stepDrops();
    stepRoomSecrets();
    refreshStubLabel();
    syncToolSprites();
    syncDropSprites();
    syncPersonWareSprites();

    if (inv.invuln > 0) inv.invuln -= 1;
    stepLinkStatus(inv);
    if (flutePulse > 0) flutePulse -= 1;
    // Room clamp / shove / solid-eject fight the hand — leave position to the capturer.
    if (!linkHeldByWallmaster()) {
      applyShove();
      ensureLinkNotInSolid();
    }
    pinWallmasterCapture();

    // QoL: owning a candle lights dark rooms ~1s after entry.
    if (mode === 'dungeon' && stepDarkRoomAutoLight(candleRoom)) {
      syncDarkOverlay();
    }
  }

  function syncDarkOverlay() {
    if (mode !== 'dungeon' || !dungeon?.room) {
      darkOverlay.visible = false;
      doorFrameLayer.tint = 0xffffff;
      return;
    }
    if (!roomIsDark(dungeon.room, candleRoom)) {
      darkOverlay.visible = false;
      doorFrameLayer.tint = 0xffffff;
      return;
    }
    // Cover the streamed neighborhood so peeks into adjacent rooms stay dark.
    darkOverlay.clear();
    darkOverlay
      .rect(-PLAY_W, HUD_HEIGHT - PLAY_H, PLAY_W * 3, PLAY_H * 3)
      .fill({ color: 0x000008, alpha: 0.92 });
    darkOverlay.visible = true;
    // Door-frame sprites sit above this wash (Link passes under lintels); tint them
    // to match so E/W wall bands and N/S door lintels are not left bright.
    doorFrameLayer.tint = DARK_ROOM_DOOR_FRAME_TINT;
  }

  /** Alternate the play area to the white palette row during the fanfare. */
  function syncTriforceFlash() {
    if (!triforceCeremony.whiteFlash || mode !== 'dungeon') {
      flashOverlay.visible = false;
      return;
    }
    flashOverlay.clear();
    flashOverlay
      .rect(0, HUD_HEIGHT, PLAY_W, PLAY_H)
      .fill({ color: 0xffffff, alpha: 0.7 });
    flashOverlay.visible = true;
  }

  function tickPushBlock(inputMask) {
    if (!pushBlock || mode !== 'dungeon') return;
    const wasIdle = pushBlock.state === PUSH_STATE.IDLE;
    const beforeX = pushBlock.x;
    const beforeY = pushBlock.y;
    // Match stepRoomSecrets: only this room's foes gate the push (streamed
    // neighbours must not keep the block locked).
    const roomFoes = dungeon?.room
      ? enemiesInRoom(enemies, dungeon.room.roomId)
      : enemies;
    const cleared = roomClearedLatch || roomAllDead(roomFoes);
    const inputDir = pickSingleDir(inputMask);
    // One walk-row/column off looks aligned (block is 16×16) but NES needs an
    // exact axis match — ease Link onto that axis while he keeps shoving.
    if (wasIdle && cleared) {
      const nudged = nudgeLinkOntoPushAxis(pushBlock, link, inputDir);
      if (nudged && (pushBlock.pushTimer ?? 0) === 0) {
        setStatus('Lining up with the block…');
      }
    }
    // Hint when Link is lined up and shoving but RoomAllDead is still false.
    if (
      wasIdle
      && !cleared
      && linkPushingBlock(pushBlock, link, inputDir)
      && (pushBlock.pushTimer ?? 0) === 0
    ) {
      const left = roomFoes.filter((e) => countsTowardRoomClear(e)).length;
      setStatus(`Clear ${left} foe${left === 1 ? '' : 's'} to push`);
    }
    const { justCompleted } = stepPushBlock(
      pushBlock,
      link,
      inputDir,
      cleared,
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
    /** @type {import('@shared/boomerang.js').Boomerang[]} */
    const activeBooms = [];
    if (boomerang && boomerang.phase !== BOOM_PHASE.DONE) activeBooms.push(boomerang);
    for (const b of enemyBooms) {
      if (b.phase !== BOOM_PHASE.DONE) activeBooms.push(b);
    }
    while (boomSprites.length < activeBooms.length) {
      const s = new Sprite(Texture.EMPTY);
      enemyLayer.addChild(s);
      boomSprites.push(s);
    }
    for (let i = 0; i < boomSprites.length; i += 1) {
      const s = boomSprites[i];
      const boom = activeBooms[i];
      if (!boom) {
        s.visible = false;
        continue;
      }
      // Magic boom → SP2 (blue); wood / Goriya → SP0.
      const pal = boom.magic ? 2 : 0;
      s.texture = items.boomerangTexture(frameCounter, pal);
      s.visible = true;
      s.x = boom.x;
      s.y = boom.y;
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
        caveScene.refreshWares(caveTaken, false, inv);
        refreshHud();
        invUi.refresh(inv, dungeon);
        setStatus('You showed the letter — the wares appear');
        // Switch from the locked refusal to the medicine pitch.
        openCaveDialogue(caveScene.cave);
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
      // @MakeMagicShot → Tune0 `$04`.
      audio?.playSfx('magic_shot');
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

  /**
   * Rebase onto the neighbouring screen when Link has walked (or been shoved)
   * out of the anchor room's coordinate space.
   * @param {{ dir: number, nextRoomId: number, x: number, y: number } | null} raftApproach
   * @returns {boolean} true when a cross (or a maze loop) was handled
   */
  function resolveOwRoomCross(raftApproach) {
    const cross = raftApproach ?? detectRoomCross(roomId, link.x, link.y);
    if (!cross) return false;
    const maze = checkMaze(mazeState, roomId, cross.dir);
    if (maze.playSecretTune) audio?.playSfx('secret');
    if (!maze.allowExit) {
      mazeLoopSpawn(link, cross.dir);
      dropRoomEnemies(roomId);
      spawnOwRoomEnemies(roomId, cross.dir);
      return true;
    }
    // Do not soft-enter an unbound room: that nulls `screen` and the ticker
    // skips stepOverworld (black playfield). Raft south-from-island is the
    // common trigger — dock `$55` may have been pruned while exploring `$45`.
    if (!owRoomReady(cross.nextRoomId)) {
      prefetchOwRoom(cross.nextRoomId);
      return false;
    }
    const fromRoom = roomId & 0xff;
    rebaseEntities(cross.dir);
    link.x = cross.x;
    link.y = cross.y;
    // Continuous seam → dock room: land on NES `$3D` so UpdateDock fires.
    if (!raftApproach) {
      snapRaftNorthEntry(link, cross.nextRoomId, cross.dir);
    }
    softEnterOwRoom(cross.nextRoomId, cross.dir, {
      // Raft approach already filtered dock foes; keep land leftovers otherwise.
      dropHomeRoom: raftApproach ? fromRoom : null,
    });
    applyPlayCamera();
    return true;
  }

  function stepOverworld(inputMask) {
    if (busy) return;

    // Raft ride freezes normal movement (UpdateDock halt). Must run even if
    // Link is dying — otherwise combat can zero hearts mid-ride and the game
    // loop skips physics while the raft sprite is left stranded.
    // Also runs while `screen` is briefly unbound so a dock soft-enter cannot
    // soft-lock the ride on a black playfield.
    if (raftRide.active) {
      if (!owScreenBound()) {
        prefetchOwRoom(roomId);
      }
      const r = stepRaftRide(link, raftRide, roomId);
      if (r?.cross) {
        // Mid-ride seam: keep scrolling onto the northern shore.
        if (!owRoomReady(r.cross.nextRoomId)) {
          prefetchOwRoom(r.cross.nextRoomId);
          syncRaftSprite();
          return;
        }
        const fromRoom = roomId & 0xff;
        rebaseEntities(r.cross.dir);
        link.x = r.cross.x;
        link.y = r.cross.y;
        link.dir = r.cross.dir;
        raftRide.crossed = true;
        softEnterOwRoom(r.cross.nextRoomId, r.cross.dir, {
          dropHomeRoom: fromRoom,
        });
        applyPlayCamera();
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

    // Hold the world still for the frame or two a not-yet-streamed room needs
    // rather than stepping against the previous screen's tiles and warps.
    if (!owScreenBound()) return;

    // Pond fairy first so ObjState $40 halt applies to this frame's movement.
    const fairyHalt = stepPondFairyFountain();
    const moveMask = fairyHalt ? 0 : inputMask;

    if (inv.dead) return;

    stepPondDrain();

    if (
      !fairyHalt
      && !whirlwind?.carrying
      && !isSwordActive(sword)
      && inv.shovePixels <= 0
      && (inv.itemLiftTimer ?? 0) <= 0
    ) {
      stepLink(
        link,
        screen.tileGrid,
        moveMask,
        overworldLinkQSpeed(link, screen.tileGrid),
        CONTINUOUS_OW,
        overworldLinkTileOpts(moveMask),
      );
      ladderObj = stepLadderObject(ladderObj, link);
      syncLadderSprite();
      // CheckPassiveTileObjects — wake Armos / Flying Ghini from $BC–$C3.
      const face = moveMask & 0x0f;
      if (!face) {
        passiveTouchHold.clear();
      } else if (link.gridOffset === 0) {
        const spawned = trySpawnPassiveTileObject(
          link,
          screen.tileGrid,
          face,
          enemies,
          createEnemy,
          { touchHold: passiveTouchHold },
        );
        if (spawned) {
          tagEnemyHomeRoom([spawned], roomId);
          spawned.viewActivated = true;
          spawned.spawnCloud = 0x10;
          tryAddMonsterToRoom(enemies, spawned, roomId);
        }
      }
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

    syncRaftSprite();
    syncWhirlwindSprite();

    // Continuous OW: dock-room water blocks south look-ahead on the northern
    // shore, so the seam is never crossed. Force the NES post-scroll entry
    // (dock room at Y=$3D) when Link is on the south lip with the raft.
    const raftApproach = !fairyHalt
      ? planRaftNorthApproach(link, roomId, inv)
      : null;
    // Cull/release before spawn so a seam-edge latch drop cannot share a frame
    // with a fresh wave of the same ROM spawn points.
    cullStreamEnemies();
    if (!resolveOwRoomCross(raftApproach)) {
      spawnVisibleOwRooms(link.dir);
    }

    // After seam/room updates — NES UpdateDock reads RoomId + ObjX/ObjY with
    // no facing check. Run here so a same-frame southbound cross into `$55`/`$3F`
    // can still catch the `$3D` north-edge trigger.
    if (!fairyHalt && tryStartRaftRide(link, roomId, inv, raftRide)) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      audio?.playSfx('secret');
      setStatus('Raft!');
      syncRaftSprite();
      return;
    }

    // Spawn before combat so newly revealed foes activate the same frame.
    stepCombat();

    // Knockback moves Link inside stepCombat, so the seam can be crossed after
    // the check above. Everything below reads the anchor room's own attrs
    // (warps, secrets) — resolve the cross first or a cave mouth is looked up
    // on the screen Link already left.
    resolveOwRoomCross(null);

    // Push graves / rocks: exact X + vertical hold $10.
    // Nudge first — standing under either half of the 16×16 looks aligned but
    // NES compares X equal (same gap as dungeon push blocks).
    if (inputMask && screen?.secrets?.length) {
      const pushDir = pickSingleDir(inputMask) || (link.dir & (DIR.UP | DIR.DOWN));
      const graveOpts = { bracelet: inv.bracelet };
      nudgeLinkOntoGraveAxis(
        screen.secrets,
        owSecretsRevealed,
        roomId,
        link,
        pushDir,
        graveOpts,
      );
      const pushed = tryPushGraveSecret(
        screen.secrets,
        owSecretsRevealed,
        roomId,
        link,
        screen.tileGrid,
        pushDir,
        gravePushHold,
        graveOpts,
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

    // Z_07.asm:3248 — the subroom indicator suppresses the warp Link just came
    // out of, and clears once he has walked off it.
    //
    // It used to clear on one exact frame transition (`gridOffset` going
    // non-zero → zero) *inside* the movement block, and nothing else in the
    // game resets the flag. Knockback moves Link with `stepShove`, which skips
    // that block and leaves `gridOffset` at 0 the whole way, so being hit on
    // the way out of a cave carries Link clear of the mouth with the latch
    // still set — and while it is set, every cave and dungeon mouth silently
    // refuses to open. Walking normally does clear it, so this is a stuck
    // window rather than a permanent wedge. Keying on the tile Link stands on
    // cannot miss it at all.
    const owStanding = standingTileMulti(owStream.gridMap(), roomId, link.x, link.y);
    if (undergroundExitType && !isOwWarpTile(owStanding)) {
      undergroundExitType = 0;
    }
    const cave = undergroundExitType
      ? null
      : checkCaveEntry(link, screen?.tileGrid, screen?.attrs, roomId, {
        standingTile: (x, y) =>
          standingTileMulti(owStream.gridMap(), roomId, x, y),
      });
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
    if (endingUi.visible || busy) return;
    if (!dungeon?.room || inv.dead) return;
    // Soft continuous rooms still need a tile grid; cellar hard-loads too.
    if (!dungeonTileGrid) {
      dungeonTileGrid = uwStream.get(roomId)?.tileGrid ?? null;
      roomSprite = uwStream.get(roomId)?.sprite ?? roomSprite;
      if (!dungeonTileGrid) return;
    }

    const play = dungeonPlayOrigin();
    const left = play.x;
    const right = play.x + 256 - 16;
    const top = play.y;
    const bottom = play.y + 176 - 16;
    const level = dungeon.levelData;
    // Grumble / UW persons: CheckPersonBlocking clears UP above the midline.
    inputMask = maskPersonBlockedDir(inputMask);

    const heldByWallmaster = linkHeldByWallmaster();
    if (
      !heldByWallmaster
      && !isSwordActive(sword)
      && inv.shovePixels <= 0
      && (inv.itemLiftTimer ?? 0) <= 0
    ) {
      // Bump a locked key door with a key → remove the block (open both faces).
      const unlockedSide = tryUnlockFacingKeyDoor(
        link,
        dungeon.room,
        dungeon.doorState,
        inv,
      );
      if (unlockedSide) {
        refreshDungeonRoomVisual();
        refreshNeighborDoorVisual(dungeon.room.roomId, unlockedSide);
        refreshHud();
        audio?.playSfx('door');
        setStatus(`Unlocked door (${inv.keys} keys left)`);
      }

      // NES: DoorwayDir ≠ 0 skips BoundByRoom + tile collision; otherwise
      // ObjectRoomBoundsUW + GetCollidingTileMoving both apply.
      // Locked key/shutter/bombable faces are NOT corridors until passable.
      const inDoor = linkInDoorwayCorridor(link, dungeon.room, {
        doorwayBlockSide: dungeon.doorwayBlockSide,
        doorState: dungeon.doorState,
      });
      if (inDoor || !dungeonTileGrid) {
        const open = Array.from({ length: 22 }, () => Array(32).fill(0x26));
        ladderObj = null;
        stepLink(link, open, inputMask, undefined, NO_ROOM_BOUNDS);
        // Passable doors open through the geometric seam; locked/missing sides
        // still stop at the NES PlayerScreenEdgeBounds lip.
        const roomIds = new Set(level.rooms.map((r) => r.roomId));
        clampUwDoorwayPath(link, dungeon.room, {
          doorState: dungeon.doorState,
          roomIds,
        });
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
    syncLadderSprite();
    cullStreamEnemies();
    spawnVisibleUwRooms(link.dir);
    stepCombat();

    // Cellar: walk up past Y<$40 to return (NES CheckSubroom mode 9).
    // Stairs / cellar remain hard cuts (full reload).
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
          void loadDungeonRoom(cellarId, DIR.UP).then(
            (ok) => {
              if (!ok) stairsLatch = false;
            },
            () => {
              stairsLatch = false;
            },
          );
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
    tryOpenPersonDialogue();

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

    // Unlocked doors are a walkable path: cross at the geometric room seam
    // (same as OW), keep continuous coords, then soft-enter the neighbor.
    const cross = detectUwDoorCross(link, dungeon.room, {
      doorState: dungeon.doorState,
      rooms: level.rooms,
    });
    if (cross) {
      rebaseEntities(cross.dir);
      link.x = cross.x;
      link.y = cross.y;
      link.dir = cross.dir;
      applyPlayCamera();
      void softEnterDungeonRoom(cross);
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
    owItemsTaken.clear();
    hintMarks.clear();
    dungeonProgress.clear();
    toldStory.clear();
    closeDialogue();
    pendingBriefingLevel = null;
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
    owItemsTaken.clear();
    hintMarks.clear();
    dungeonProgress.clear();
    toldStory.clear();
    closeDialogue();
    pendingBriefingLevel = null;
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
        owItemsTaken,
        hintMarks,
        toldStory,
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
      debugUi.close();
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
  if (ganonResetResult?.slots.length || ganonResetResult?.practice) {
    setStatus(
      `Ganon reset — Continue slot ${(ganonResetResult.slots[0] ?? 0) + 1} to re-fight`,
    );
  }

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
  /** Frames `zeldaDebug.step()` has queued; consumed by the next ticker run. */
  let debugSteps = 0;

  exposeDebugHandle();

  app.ticker.add(() => {
    const now = performance.now();
    if (debugSteps > 0) {
      // `zeldaDebug.step(n)` asks for exactly n simulated frames. Deriving
      // them from the wall clock made the count depend on how long the tool
      // call took, so a batch could silently simulate nothing at all.
      acc = stepMs * debugSteps;
      debugSteps = 0;
      last = now;
    } else {
      acc += now - last;
      last = now;
      if (acc > stepMs * 3) acc = stepMs * 3;
    }

    if (optionsUi.visible || debugUi.visible) {
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

    // Phase 19: an open dialogue box owns the buttons. The same press must not
    // also swing the sword or flip the submenu open behind the text.
    const dialogueOpen = textBox.active;
    let dialogueConsumed = false;
    if (dialogueOpen && (aPressed || bPressed || startPressed)) {
      dialogueConsumed = true;
      const res = textBox.advance();
      if (res.closed) onDialogueClosed(res);
    }
    const dialogueBlocking = dialogueOpen || dialogueConsumed;

    // Mode $08 reads Start and Select itself; see stepDeathMode.
    let deathInput = { select: input.pressedSelect(), start: startPressed };
    if (startPressed && !inv.dead && !dialogueBlocking) {
      if (invUi.open) {
        invUi.close();
        persistSave();
      } else {
        // Same as NES: Start opens the submenu in caves; walk south to leave.
        invUi.toggle(inv, invView());
      }
    }

    // While inventory is open, B cycles the B slot (does not place items).
    if (invUi.open && invUi.phase === 'open' && bPressed && !dialogueBlocking) {
      const prevB = inv.selectedB;
      cycleBItem(inv);
      // Selection changed → Tune1 `$01` (same as rupee taken).
      if (inv.selectedB !== prevB) audio?.playSfx('rupee');
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
      && !dialogueBlocking
      && mode === 'cave'
      && bPressed
      && canShowLetter(caveScene.cave, inv)
    ) {
      tryUseB();
    }

    if (!inv.dead && !invUi.open && !dialogueBlocking && mode !== 'cave' && !pondFairyHalt) {
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

      // UpdateHeartsAndRupees → World_ChangeRupees: spin the status-bar total
      // one step every other frame, chirping the heart tune as it goes.
      // Keep rolling during cave speech so door-repair / shop fees are visible
      // while the text box is up (NES ticks the counter independently).
      if (stepRupeeRoll(rupeeRoll, inv.rupees ?? 0).playTune) {
        audio?.playSfx('text');
        refreshHud();
      }

      // The world holds still while someone is talking, the same way the
      // submenu freezes it — nothing steps, nothing spawns, nothing hits Link.
      // Cave Mode B is the exception: NES lets Link walk the shop while the
      // nametable text crawls, and freezing here reads as a hard hang on enter
      // (no foes to pause for). leaveCave always closes the box so walking out
      // mid-speech cannot leave the overlay stranded on the overworld.
      // Death outranks dialogue either way.
      if (
        invUi.open
        || (textBox.active && !inv.dead && mode !== 'cave')
      ) {
        continue;
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
        syncItemLiftSprite();
        refreshHud();
        if (step.finished) {
          invUi.refresh(inv, invView());
          persistSave();
          // Hearts are full and the palette has stopped flashing — now talk.
          if (pendingBriefingLevel != null) {
            const level = pendingBriefingLevel;
            pendingBriefingLevel = null;
            openLevelBriefing(level);
          }
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
      } else if (mode === 'overworld' && (screen || raftRide.active)) {
        // Raft can outlive a brief unbound `screen` after a dock soft-enter;
        // keep stepping so UpdateDock still lands.
        stepOverworld(mask);
      } else if (mode === 'dungeon') {
        stepDungeon(mask);
      }
    }

    if (mode === 'cave' && !invUi.open) caveScene.tick();
    textBox.tick();
    // Radar-only repaint: the mark pulse must breathe without rebuilding the
    // sprite-heavy half of the status bar every frame. Soft OW/UW room crosses
    // update `roomId` without `refreshHud`, so pass locator state here or the
    // player dot sticks until some other HUD event happens to catch up.
    uiFrame = (uiFrame + 1) & 0xffff;
    const mapRoomId =
      mode === 'cave' ? (caveReturn?.roomId ?? roomId) : roomId;
    hud.pulseMap(uiFrame, currentMapMarks(), currentDungeonMapMarks(), {
      roomId: mapRoomId,
      mode,
      dungeon,
    });

    const attacking = isSwordActive(sword);
    const drawY = mode === 'overworld' ? link.y + 2 : link.y;
    // InvRing patches SP0 tunic (`LinkColors`); detach before cache destroy.
    if (frames.setRing(inv.ring ?? 0)) {
      linkSprite.texture = Texture.EMPTY;
    }
    linkSprite.texture = itemLiftActive()
      ? frames.textureForLift()
      : frames.textureFor(link.dir, link.animFrame, {
          attacking,
          magicShield: Boolean(inv.magicShield),
        });
    linkSprite.x = link.x;
    linkSprite.y = drawY;
    linkSprite.alpha = inv.invuln > 0 && (inv.invuln & 2) ? 0.45 : 1;
    if (itemLiftActive()) syncItemLiftSprite();
    // During mode $11 the sequence decides when Link is on screen.
    linkSprite.visible = !deathUi.visible || deathLinkVisible;

    if (mode === 'overworld' || mode === 'dungeon') {
      applyPlayCamera();
    } else if (mode === 'cave') {
      playField.x = 0;
      playField.y = 0;
    }

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
