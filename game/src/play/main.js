import { Application, Assets, Container, Graphics, RenderTexture, Sprite, Text, Texture } from 'pixi.js';
import { initPixiApp } from '@shared/pixiBoot.js';
import {
  DIR,
  HUD_HEIGHT,
  UW_FIRST_UNWALKABLE,
  dirsAreOpposite,
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
  writeLinkMotion,
} from '@shared/linkMotion.js';
import {
  formatCollisionReadout,
  isUwSolidTile,
  probeUwCollision,
} from '@shared/uwCollisionHarness.js';
import {
  checkCaveEntry,
  neighborRoomId,
  overworldExitSpawn,
  standingTile,
} from '@shared/world.js';
import {
  PLAY_H,
  PLAY_W,
  adoptCameraSolution,
  createCamera,
  detectRoomCross,
  foggedRooms,
  canClaimAnchorCross,
  inAnchorPlayArea,
  localToWorld,
  occupyingRoom,
  localInRoom,
  resolveUwOccupyingRoomId,
  rebaseDelta,
  rebaseDeltaToRoom,
  rectFullyOffCamera,
  rectFullyOffEveryCamera,
  roomPlayOrigin,
  roomsForCameras,
  solvePlayCamera,
  worldToLocal,
} from '@shared/continuousCamera.js';
import { canvasCssScale } from '@shared/displayScale.js';
import { QUAD_H, QUAD_W, emptyQuadrants, frameSize, quadrantOrigin } from '@shared/splitLayout.js';
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
  roomsNeedingSpawn,
  shiftPositions,
  tagEnemyHomeRoom,
} from '@shared/roomStream.js';
import { enemyMotionBounds, fairyFlightBounds, shotMotionBounds } from '@shared/enemyBounds.js';
import {
  clearClockFreeze,
  clockFreezeActive,
  enemyIsClockFrozen,
  shouldClearClock,
  tagVisibleEnemiesForClock,
} from '@shared/clockFreeze.js';
import {
  activateEnemiesInView,
  enemyAwaitingView,
  enemyCombatActive,
  markEnemiesAwaitingView,
  skipsSpawnCloud,
} from '@shared/enemyViewActivation.js';
import { createAudioBus } from '@shared/audioBus.js';
import { createRoomStore } from '@shared/roomStore.js';
import { tryTakeRupeeStash } from '@shared/rupeeStash.js';
import {
  beginScreenScroll,
  createScreenScroll,
  isScrolling,
  stepScreenScroll,
} from '@shared/screenScroll.js';
import { createStreamView } from './streamView.js';
import { doorFaceIndex, openSidesForRoom } from '@shared/dungeonRoomLayout.js';
import {
  createShutterAnim,
  neighborShutterRef,
  shutterAnimKey,
  shutterSidesNeedingOpen,
  shutterSpritePlacements,
  splitDoorFaceRgba,
  stepShutterAnim,
  visualOpenSides,
} from '@shared/shutterAnim.js';
import {
  loadBombCrackTexture,
  syncBombCrackSprites,
} from './bombCrackOverlay.js';
import { syncShutterSprites } from './shutterOverlay.js';
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
  OW_FLOOR_TILES,
  SECRET_STAIRS_TILES,
  restorePushedOriginFloor,
  restorePushedStairs,
  restorePushDests,
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
  isRodSwing,
  isSwordActive,
  stepSword,
  swordDrawPos,
  swordSpawnsShot,
  swordSpriteRotation,
  tryStartRod,
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
  enemyIgnoresTiles,
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
  wallmasterHoldsPlayer,
  wallmasterIsCapturing,
} from '@shared/enemies.js';
import { stepEnemyShove } from '@shared/enemyShove.js';
import { trySpawnZora } from '@shared/zora.js';
import {
  findPondFairy,
  pondFairyFreezesEnemy,
  pondFairyOrbiting,
  stepPondFairy,
  visiblePondHearts,
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
  createDroppedItem,
} from '@shared/enemyDrops.js';
import { itemDrawPalette } from '@shared/itemDrawPalette.js';
import { createByteRng } from '@shared/rng.js';
import {
  PROJ,
  SHIELD_RESULT,
  bounceProjectile,
  createProjectile,
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
  planRaftNorthApproachFromAnchor,
  snapRaftNorthEntry,
  stepRaftRide,
  tryStartRaftRide,
} from '@shared/raft.js';
import {
  bossNoiseSfx,
  bossRoarSfx,
  isBossType,
  isGanon,
  isGleeok,
  isZelda,
} from '@shared/bosses.js';
import { sfxNamesForWeaponHit } from '@shared/combatSfx.js';
import {
  BOOM_PHASE,
  boomerangReturnPos,
  enemyBoomerangHitsLink,
  liveBoomerangs,
  playerBoomerang,
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
  whirlwindSpawnX,
} from '@shared/whirlwind.js';
import { createStatueState, stepStatues } from '@shared/statues.js';
import { tryAddMonsterToRoom, tryEdgeSpawn } from '@shared/spawn.js';
import {
  UW_PRIMARY_SQUARES,
  buildDungeonPlayGrid,
  clampUwDoorwayPath,
  createDoorState,
  dirForSide,
  doorwayLatchCleared,
  dungeonFloorRect,
  closeShutterBehind,
  dungeonNeighbor,
  dungeonPlayOrigin,
  dungeonEntranceSpawn,
  dungeonRoomSpawn,
  dungeonTileOpts,
  enteringRoomGridOffset,
  entrySideForFacing,
  inDoorway,
  nearDoorway,
  openDoorPair,
  openRoomShutters,
  restoreClearedShutters,
  sealLastBossShutters,
  tryBombDoors,
  tryUnlockFacingKeyDoor,
} from '@shared/dungeonPlay.js';
import { OPEN_UW_GRID, detectOwnedUwDoorCross, uwDoorMotionMode } from '@shared/uwDoorWalk.js';
import { finalizeLevelMeta, roomToTileGrid } from '@shared/dungeons.js';
import {
  activePlayers,
  createInventoryView,
  createPlayer,
} from '@shared/player.js';
import { createPlayerFocus } from '@shared/playerFocus.js';
import {
  coopDeathPlaysDyingTune,
  deathOutcome,
  labyrinthForCellarAlly,
  labyrinthWorldIdFor,
  regroupAnchorRoomId,
  respawnAlly,
  respawnBeside,
  sameRespawnArea,
  shouldFollowAllyWorld,
  shouldRestartInOwnDungeon,
  standUpAfterDeath,
  targetableLinks,
  tryAutoRevive,
} from '@shared/coopDeath.js';
import {
  sessionMusicApplies,
  sessionMusicName,
  sessionMusicPlayer,
} from '@shared/sessionMusic.js';
import {
  canLeave,
  copyJoiningBSlot,
  createPadStartEdges,
  fillJoiningHearts,
  hostPadIndex,
  hostPlayer,
  joiningPads,
  nextJoinIndex,
  seatForJoiningPad,
  snapToHost,
} from '@shared/coopRoster.js';
import { createStoryPager, storyReaders } from '@shared/storyPager.js';
import { applyPartyCaps, shareHeartContainer } from '@shared/coopEconomy.js';
import { BOMB_LINK_DAMAGE, bombHurtsHero } from '@shared/coopCombat.js';
import { applyPartySnapshot, snapshotParty } from '@shared/partySave.js';
import { sharedBarOrigin } from '@shared/sharedBar.js';
import {
  caveWorldId,
  cellarWorldId,
  createWorld,
  createWorldRegistry,
  dungeonWorldId,
  isCellarWorldId,
  overworldWorldId,
  parseCellarWorldId,
} from '@shared/worldRegistry.js';
import { enemyTarget, nearestTarget } from '@shared/targeting.js';
import {
  coopDeathSpinDone,
  createDeathSequence,
  deathLinkDir,
  stepDeathSequence,
} from '@shared/deathSequence.js';
import { dialogueAcceptsInput, dialogueFreezesHero, dialogueVisibleFor } from '@shared/dialogueView.js';
import {
  createTriforceCeremony,
  startTriforceCeremony,
  stepTriforceCeremony,
  triforceCeremonyActive,
} from '@shared/triforceCeremony.js';
import {
  UW_TILE_SOURCES,
  renderDoorFaceRgba,
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
  isCellarRoomId,
  streamableUwRooms,
} from '@shared/dungeonCellar.js';
import {
  BLOCK_STAIRS_POS,
  BLOCK_STAIRS_TILE,
  PUSH_STATE,
  createPushBlock,
  beginPushBlockFrame,
  linkPushingBlock,
  nudgeLinkOntoPushAxis,
  pushBlockSquareTiles,
  pushBlockWalkOpts,
  pushOpensShutters,
  pushSpawnsStairs,
  stepPushBlock,
  writeSquareAtPlayGrid,
} from '@shared/pushBlock.js';
import {
  FLAME_SLOTS,
  asCandleStore,
  beginCandleStay,
  candleForRoom,
  createCandleStore,
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
  roomMayClear,
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
  saveStartsSecondQuest,
} from '@shared/save.js';
import { createPracticeStore } from '@shared/practiceSave.js';
import {
  DEFAULT_PLAYER_BINDS,
  bindsForPlayer,
  codeLabel,
  loadOptions,
  saveOptions,
} from '@shared/options.js';
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
import { createSharedBar } from './sharedBar.js';
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

/** Canvas size. One player is the ROM frame; more players grow it. */
let INTERNAL_W = QUAD_W;
let INTERNAL_H = QUAD_H;
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
  const urlParams = new URLSearchParams(window.location.search);
  /**
   * How many heroes to start with, until players can join from the title.
   * Known before the renderer so a two-player boot is 512×544 from the first
   * pixel, not a 256×240 canvas that later stretches.
   */
  const maxPlayers = DEFAULT_PLAYER_BINDS.length;
  let playerCount = Math.min(
    Math.max(1, Number(urlParams.get('players')) || 1),
    maxPlayers,
  );
  const framePx = frameSize(playerCount);
  INTERNAL_W = framePx.width;
  INTERNAL_H = framePx.height;

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
    const scale = canvasCssScale({
      availW,
      availH,
      internalW: INTERNAL_W,
      internalH: INTERNAL_H,
      option: options.scale,
    });
    // Always win over the stylesheet. A 256×240 max-width used to squash the
    // 512×544 co-op frame once the fitted width exceeded that NES-aspect cap.
    app.canvas.style.maxWidth = 'none';
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
  const sheetEntries = Object.entries(sheetUrls);
  let sheetsReady = 0;
  try {
    await Promise.all(
      sheetEntries.map(async ([id, url]) => {
        const tex = await Assets.load(url);
        tex.source.scaleMode = 'nearest';
        sheetTextures[id] = tex;
        sheetsReady += 1;
        setStatus(`Loading graphics (${sheetsReady}/${sheetEntries.length})…`);
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Graphics failed: ${msg}`);
    throw err;
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
   * (dungeon exit → overworld was the common trigger; a cave still open
   * while someone walks into a labyrinth is the co-op one).
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
    if (liftSprite) liftSprite.texture = Texture.EMPTY;
    for (const p of players) {
      if (p.gfx?.link) p.gfx.link.texture = Texture.EMPTY;
      if (p.gfx?.sword) p.gfx.sword.texture = Texture.EMPTY;
    }
    for (const spr of roomItemSprites.values()) spr.texture = Texture.EMPTY;
    for (const id of worlds.ids()) {
      const w = worlds.get(id);
      if (!w) continue;
      for (const map of [w.enemyGfx, w.projGfx, w.dropGfx]) {
        if (!map) continue;
        for (const g of map.values()) {
          if (g?.texture) g.texture = Texture.EMPTY;
        }
      }
      for (const g of w.pondHeartGfx ?? []) {
        if (g?.texture) g.texture = Texture.EMPTY;
      }
      for (const g of w.personWareGfx?.values() ?? []) {
        if (g?.texture) g.texture = Texture.EMPTY;
        if (g?.children) {
          for (const child of g.children) {
            if (child?.texture) child.texture = Texture.EMPTY;
          }
        }
      }
    }
    for (const scene of caveScenes.values()) scene.releaseCachedTextures();
    hud.releaseItemSprites();
    closeAllMenus();

    if (mode === 'dungeon' && dungeon?.level) {
      enemySprites.setDungeonLevel(dungeon.level);
      const set = paletteById.get(`level_${dungeon.level}`) ?? owPaletteSet;
      enemySprites.setPaletteSet(set);
      items.setPaletteSet(set);
      frames.setPaletteSet(set);
    } else {
      enemySprites.setDungeonLevel(1);
      enemySprites.setPaletteSet(owPaletteSet);
      items.setPaletteSet(owPaletteSet);
      frames.setPaletteSet(owPaletteSet);
    }
    for (const scene of caveScenes.values()) scene.rebuildCachedTextures();
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
        openSides: visualOpenSides(room, dungeon?.doorState ?? null, [...shutterAnims.values()]),
        collisionOpenSides: openSidesForRoom(room, dungeon?.doorState ?? null),
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

  function refreshDungeonRoomVisual(target = dungeon?.room) {
    if (mode !== 'dungeon' || !target) return;
    const painted = paintDungeonRoom(target);
    if (!painted) return;
    const id = target.roomId & 0xff;
    const entry = uwStream.upsert(id, painted.tex, {
      tileGrid: painted.tileGrid,
      pack: target,
      fogged: false,
    });
    setUwDoorFrame(id, painted.frameTex, false);
    syncUwBombCracks(entry, target, false);
    if ((dungeon.room?.roomId & 0xff) === id) {
      roomSprite = entry.sprite;
      dungeonTileGrid = painted.tileGrid;
    }
    applyPushBlockRoomArt(id);
  }

  /**
   * Repaint a room and the neighbour faces of shutters that just opened.
   * @param {object} room
   * @param {string[]} sides
   */
  function refreshOpenedShutters(room, sides) {
    if (!room || !sides.length) return;
    refreshDungeonRoomVisual(room);
    for (const side of sides) refreshNeighborDoorVisual(room.roomId, side);
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
    const secrets = owRooms.pack(mapIndex)?.secrets ?? [];
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

  /** Closed shutter-face halves, keyed by level + wall palette + side. */
  const shutterHalfCache = new Map();

  /**
   * @param {object} room
   * @param {string} side
   * @returns {import('pixi.js').Texture[] | null}
   */
  function shutterHalfTextures(room, side) {
    const level = dungeon?.level ?? 1;
    const outer = room?.doors?.outerPalette ?? 0;
    const key = `${level}:${outer}:${side}`;
    const hit = shutterHalfCache.get(key);
    if (hit) return hit;
    const paletteSet = paletteById.get(`level_${level}`) ?? owPaletteSet;
    if (!paletteSet || uwPatternBins.size < 3) return null;
    try {
      const face = renderDoorFaceRgba(side, doorFaceIndex(7, false), {
        paletteSet,
        tileSources: UW_TILE_SOURCES,
        patternBins: uwPatternBins,
        outerPalette: outer,
      });
      if (!face.width || !face.height) return null;
      const halves = splitDoorFaceRgba(face.rgba, face.width, face.height, side);
      const textures = halves.map((h) => textureFromRgba(h.rgba, h.width, h.height));
      if (textures.some((t) => !t)) return null;
      shutterHalfCache.set(key, textures);
      return textures;
    } catch (err) {
      console.error('shutterHalfTextures failed', side, err);
      return null;
    }
  }

  /**
   * @param {object} room
   * @param {string} side
   * @param {'open' | 'close'} kind
   */
  function queueShutterAnim(room, side, kind) {
    if (room?.doors?.[side]?.type !== 'shutter') return;
    shutterAnims.set(shutterAnimKey(room.roomId, side), createShutterAnim(room.roomId, side, kind));
    const pair = neighborShutterRef(room.roomId, side);
    if (!pair) return;
    const neighbor = dungeonPackForId(pair.roomId);
    if (neighbor?.doors?.[pair.side]?.type !== 'shutter') return;
    shutterAnims.set(
      shutterAnimKey(pair.roomId, pair.side),
      createShutterAnim(pair.roomId, pair.side, kind),
    );
  }

  /**
   * Slide shutters open (room-clear, push-block, L9 gate). Collision stays
   * shut until DoorTimer elapses.
   * @param {object} room
   * @param {string[]} sides
   */
  function beginAnimatedShutterOpen(room, sides) {
    if (!room || !sides.length) return;
    const canAnim = sides.every((side) => shutterHalfTextures(room, side));
    if (!canAnim) {
      openRoomShutters(dungeon.doorState, room);
      refreshOpenedShutters(room, sides);
      return;
    }
    for (const side of sides) queueShutterAnim(room, side, 'open');
    fx.playSfx('door');
    refreshOpenedShutters(room, sides);
    syncShutterOverlays();
  }

  /**
   * Slide the doorway shut behind Link. Collision is already closed.
   * @param {object} room
   * @param {string} side
   */
  function beginAnimatedShutterClose(room, side) {
    if (!room || !side || room.doors?.[side]?.type !== 'shutter') return;
    if (!shutterHalfTextures(room, side)) {
      refreshOpenedShutters(room, [side]);
      return;
    }
    queueShutterAnim(room, side, 'close');
    fx.playSfx('door');
    refreshOpenedShutters(room, [side]);
    syncShutterOverlays();
  }

  function syncShutterOverlays() {
    /** @type {Map<number, { key: string, x: number, y: number, texture: import('pixi.js').Texture }[]>} */
    const byRoom = new Map();
    if (mode === 'dungeon') {
      for (const anim of shutterAnims.values()) {
        const room = dungeonPackForId(anim.roomId);
        const halves = room ? shutterHalfTextures(room, anim.side) : null;
        if (!halves) continue;
        const places = shutterSpritePlacements(anim).map((p) => ({
          key: p.key,
          x: p.x,
          y: p.y,
          texture: halves[p.half],
        }));
        const id = anim.roomId & 0xff;
        const list = byRoom.get(id) ?? [];
        list.push(...places);
        byRoom.set(id, list);
      }
    }
    for (const [id, entry] of uwStream.views) {
      const fogged = Boolean(entry.fog?.visible);
      syncShutterSprites(entry, fogged ? [] : (byRoom.get(id) ?? []), {
        visible: !fogged,
      });
    }
  }

  function stepShutterAnims() {
    if (!firstInWorldThisFrame('shutterAnim')) return;
    if (mode !== 'dungeon' || !dungeon) {
      syncShutterOverlays();
      return;
    }
    /** @type {string[]} */
    const done = [];
    for (const [key, anim] of shutterAnims) {
      if (stepShutterAnim(anim)) done.push(key);
    }
    /** @type {Set<number>} */
    const refreshIds = new Set();
    /** @type {{ roomId: number, side: string }[]} */
    const pairs = [];
    for (const key of done) {
      const anim = shutterAnims.get(key);
      shutterAnims.delete(key);
      if (!anim) continue;
      if (anim.kind === 'open') {
        openDoorPair(dungeon.doorState, anim.roomId, anim.side);
      }
      refreshIds.add(anim.roomId & 0xff);
      pairs.push({ roomId: anim.roomId, side: anim.side });
    }
    for (const id of refreshIds) {
      const room = dungeonPackForId(id);
      if (room) refreshDungeonRoomVisual(room);
    }
    for (const p of pairs) refreshNeighborDoorVisual(p.roomId, p.side);
    syncShutterOverlays();
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
   * Patch a 16×16 UW square into a streamed room texture (play-area coords).
   * Dest coords are NES screen units; the backing canvas is in sheet pixels
   * (`px()`), matching `patchOwBgSquare` / enhanced 2× textures.
   * @param {number} nesX screen X
   * @param {number} nesY screen Y (includes HUD)
   * @param {number} primary CHR base
   * @param {number} [targetRoomId]
   */
  function patchRoomSquareAt(nesX, nesY, primary, targetRoomId = roomId) {
    const id = targetRoomId & 0xff;
    // The occupying cell's own sprite — `roomSprite` is only an alias for the anchor.
    const spr = uwStream.get(id)?.sprite ?? ((id === (roomId & 0xff)) ? roomSprite : null);
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
   * @param {number} [targetRoomId]
   */
  function setUwSquareAt(px, py, primary, targetRoomId = roomId) {
    const [ul, ll, ur, lr] = pushBlockSquareTiles(primary);
    const tiles = [
      [ul, ur],
      [ll, lr],
    ];
    const id = targetRoomId & 0xff;
    const grid =
      uwRooms.tileGrid(id)
      ?? ((id === (roomId & 0xff)) ? dungeonTileGrid : null);
    const writeFloor = id === (roomId & 0xff);
    if (grid) writeSquareAtPlayGrid(grid, px, py, primary);
    if (writeFloor && floorTiles) {
      const floor = floorFrame();
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const x = px + col * 8;
          const y = py + row * 8;
          const c = Math.floor((x - floor.x) / 8);
          const r = Math.floor((y - floor.y) / 8);
          if (floorTiles[r]) floorTiles[r][c] = tiles[row][col];
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
  function applyPushBlockRoomArt(targetRoomId = roomId) {
    const id = targetRoomId & 0xff;
    const block = pushBlocks.get(id) ?? ((id === (roomId & 0xff)) ? pushBlock : null);
    if (!block) return;
    const hasSprite = Boolean(
      uwStream.get(id)?.sprite ?? ((id === (roomId & 0xff)) ? roomSprite : null),
    );
    if (block.state === PUSH_STATE.DONE || block.complete) {
      setUwSquareAt(block.homeX, block.homeY, 0x74, id);
      setUwSquareAt(block.x, block.y, 0xb0, id);
      if (hasSprite) {
        patchRoomSquareAt(block.homeX, block.homeY, 0x74, id);
        patchRoomSquareAt(block.x, block.y, 0xb0, id);
      }
      const room = dungeon?.levelData?.rooms?.find((r) => (r.roomId & 0xff) === id);
      if (room && pushSpawnsStairs(room)) {
        setUwSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE, id);
        if (hasSprite) {
          patchRoomSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE, id);
        }
      }
    } else if (block.state === PUSH_STATE.MOVING) {
      setUwSquareAt(block.homeX, block.homeY, 0x74, id);
      if (hasSprite) patchRoomSquareAt(block.homeX, block.homeY, 0x74, id);
    }
    // IDLE: leave baked $B0 at home — no overlay until the push starts.
  }

  /**
   * One player's 256×240 picture: the world and the status bar that sits on it.
   *
   * Alone this is the stage. In company it is drawn once per player into a
   * render texture, with that player's camera and that player's hearts, and
   * the textures sit side by side. Title, inventory and death stay on the
   * stage — they still cover the left quadrant until those UIs are rehomed.
   */
  const frame = new Container();
  app.stage.addChild(frame);
  const world = new Container();
  frame.addChild(world);

  /** Play-area layer offset by the continuous camera (caves/cellars keep identity). */
  const playField = new Container();
  world.addChild(playField);
  // Room data lives in the stores; the views above them only hold sprites, so
  // collision lookups never go through the scene graph.
  let owRooms = createRoomStore();
  let uwRooms = createRoomStore();
  let owStream = createStreamView(playField, owRooms);
  let uwStream = createStreamView(playField, uwRooms);
  const bootOwRooms = owRooms;
  const bootOwStream = owStream;
  const bootUwRooms = uwRooms;
  const bootUwStream = uwStream;

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
  const sharedBar = createSharedBar({
    commonBg: sheetTextures.commonBg,
    misc: sheetTextures.misc,
  });

  const invUis = Array.from({ length: maxPlayers }, () =>
    createInventoryUi({
      items,
      commonBg: sheetTextures.commonBg,
      overworldBg: sheetTextures.overworldBg,
    }),
  );
  // One panel per seat, all in `frame`, so presentViews can show each
  // player's copy in their quadrant. Solo still ticks player one's.
  for (const ui of invUis) frame.addChild(ui.root);
  const invUi = invUis[0];
  frame.addChild(hud.root);

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
    playSfx: (name) => fx.playSfx(name),
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

  // Every sound the simulation asks for goes through the bus, so a headless
  // run can record it. Device control below (mute, volume) still talks to the
  // device directly — that is the player's setting, not the game's noise.
  const fx = createAudioBus(() => audio);

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
    const name = sessionMusicName(mode, dungeon?.level);
    if (name) audio.playMusic(name);
  }

  /**
   * The song follows player one. playMusic no-ops when that track is
   * already up, so this is safe to call every frame. Allies walking into
   * a cave or labyrinth must not cut it.
   */
  function syncSessionMusic() {
    if (!playing || deathUi.visible || titleUi.visible || demoUi.visible) return;
    const host = sessionMusicPlayer(players);
    if (!host) return;
    focus.on(host, () => musicForMode());
    focus.to(players[0]);
  }

  /**
   * World BGM only for player one. An ally's enterLevel / leaveCave used
   * to swap the playlist and then syncSessionMusic restarted player one's
   * song from the top.
   */
  function playWorldMusic(name) {
    if (!audio || inv.dead || titleUi.visible || demoUi.visible) return;
    if (!sessionMusicApplies(focus.current ?? players[0])) return;
    if (!name) return;
    audio.playMusic(name);
  }

  /** Overworld BGM only when we are actually exploring the overworld/cave. */
  function playOverworldMusic() {
    // Do not key off `playing` — beginPlay loads the world before flipping it.
    if (mode !== 'overworld' && mode !== 'cave') return;
    playWorldMusic('overworld');
  }

  function playDungeonMusic(levelId = dungeon?.level) {
    // Same as playOverworldMusic: restore/enterLevel runs before playing=true.
    playWorldMusic(sessionMusicName('dungeon', levelId));
  }

  // Unlock AudioContext on first input (browser autoplay policy).
  const unlockAudio = () => {
    void fx.unlock().then(() => musicForMode());
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
  /** Passive grave/Armos wakes already used this hold — clear on release. */
  /** @type {Set<string>} */
  const passiveTouchHold = new Set();
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
  /**
   * Simulated steps since boot, never wrapped.
   *
   * `frameCounter` is the NES's own 8-bit counter and rolls over every 256
   * frames, which is fine for animation phase but useless for "has this
   * already happened this frame" — 256 frames later the answer comes back
   * wrong once.
   */
  let simTick = 0;
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
    const rid = room.roomId & 0xff;
    const cleared =
      secretLatchRooms.has(rid)
      || Boolean(dungeon?.clearedRooms?.has(rid))
      || roomAllDead(enemiesInRoom(enemies, room.roomId));
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
  /**
   * Player one's camera. Held here rather than in `players` because room
   * streaming and on-screen tests read it long before the roster is built;
   * `createPlayer()` below takes this same object (Phase 23).
   */
  let cam = createCamera();
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

  const caveSceneDeps = {
    spriteTex,
    items,
    enemySprites,
    commonBg: sheetTextures.commonBg,
    sheetTextures,
  };
  /**
   * One interior per cave world. A single scene used to rebuild in place, so
   * opening a shop while a friend was in a take-any destroyed their sprites
   * and walking both dropped the GL context.
   * @type {Map<string, ReturnType<typeof createCaveScene>>}
   */
  const caveScenes = new Map();
  const caveLayer = new Container();
  // Behind Link in the world layer so the player stands in the cave.
  world.addChildAt(caveLayer, 0);

  function caveView() {
    const id = focus.current?.world?.id;
    return id ? (caveScenes.get(id) ?? null) : null;
  }

  function ensureCaveScene(worldId) {
    let scene = caveScenes.get(worldId);
    if (!scene) {
      scene = createCaveScene(caveSceneDeps);
      scene.root.visible = false;
      caveLayer.addChild(scene.root);
      caveScenes.set(worldId, scene);
    }
    return scene;
  }

  function dropCaveScene(worldId) {
    if (!worldId) return;
    const scene = caveScenes.get(worldId);
    if (!scene) return;
    scene.destroy();
    caveScenes.delete(worldId);
  }

  function showCaveSceneFor(p) {
    const want = mode === 'cave' ? p?.world?.id : null;
    for (const [id, scene] of caveScenes) {
      scene.root.visible = id === want;
    }
  }
  // Phase 19: one dialogue box for every speaking part — cave dwellers,
  // underworld old men, and the between-labyrinth briefings.
  //
  // Co-op needs a box per seat: a single shared panel meant player two's
  // old man never spoke while player one was still reading the sword cave.
  // Solo still uses seat 0 (`textBox`), so the goldens do not move.
  const textBoxes = Array.from({ length: maxPlayers }, () =>
    createTextBox({
      commonBg: sheetTextures.commonBg,
      playSfx: (name) => fx.playSfx(name),
    }),
  );
  for (const box of textBoxes) world.addChild(box.root);
  const textBox = textBoxes[0];
  // Co-op story beats (`levelEntry`, `briefing`) live on a second box so a
  // cave conversation can keep crawling while someone else reads the plot.
  const storyBox = createTextBox({
    commonBg: sheetTextures.commonBg,
    playSfx: (name) => fx.playSfx(name),
  });
  world.addChild(storyBox.root);
  storyBox.root.visible = false;
  /** Who last opened a private box. Story beats do not steal this. */
  let talkingPlayer = null;
  /** Per-player pages of a story beat; null when nobody is reading one. */
  let storyPager = null;
  /**
   * The hero being simulated. Player one until the focus moves (Phase 23):
   * `let` rather than `const` so a frame can be run as somebody else without
   * rewriting the ~440 references that read it.
   */
  let link = createLinkState(worldIndex.startX, worldIndex.startY, worldIndex.startDir);

  // Blades under the bodies (the NES draws the sword behind Link for most of
  // the swing), with a layer each so any number of heroes keeps that order.
  const bladeLayer = new Container();
  playField.addChild(bladeLayer);

  /** Debug: solid UW tiles + look-ahead sample (enabled with ?debug=1 / ?coll=1). */
  const collDebugGfx = new Graphics();
  collDebugGfx.visible = false;
  playField.addChild(collDebugGfx);

  const heroLayer = new Container();
  playField.addChild(heroLayer);

  /**
   * The two sprites one hero is drawn with.
   *
   * A pair per player, in the shared layers above. They ride the focus with
   * the hero that owns them, so every line that draws `linkSprite` keeps
   * meaning "the hero being drawn" without knowing there are others.
   */
  function createHeroGfx(forLink, number = 1) {
    const sword = new Sprite(items.swordTexture(DIR.UP, SWORD.WOOD));
    sword.visible = false;
    bladeLayer.addChild(sword);
    const body = new Sprite(frames.textureFor(forLink.dir, forLink.animFrame));
    heroLayer.addChild(body);
    // A number over everyone but you, so two green tunics are not a guessing
    // game. Hidden on the solo frame — there is nobody else to mark.
    let tag = null;
    const img = sheetTextures.commonBg?.source?.resource;
    if (img) {
      tag = nesText(img, String(number), 0, 0, 0xfcfcfc);
      tag.visible = false;
      heroLayer.addChild(tag);
    }
    return { sword, link: body, tag };
  }

  const p1Gfx = createHeroGfx(link, 1);
  let swordSprite = p1Gfx.sword;
  let linkSprite = p1Gfx.link;

  // Wallmaster closed hand draws over Link while sliding to the wall.
  const overLinkLayer = new Container();
  playField.addChild(overLinkLayer);

  // Door lintels/jambs above Link so he passes under the frame (not over it).
  const doorFrameLayer = new Container();
  doorFrameLayer.visible = false;
  playField.addChild(doorFrameLayer);
  const uwDoorFrames = createStreamView(doorFrameLayer);

  /**
   * The group's inventory: the bag, the purse, quest progress, the clock.
   *
   * Nothing reads this directly. Each hero gets a view onto it (`inv` below)
   * that routes their own hearts, knockback and B slot to fields of their own
   * and everything else here, so four players spend one purse (Phase 23).
   */
  const sharedInv = createInventory();
  let inv = createInventoryView(sharedInv);
  /**
   * Which place the shared `inv.clock` is actually freezing. Tags live on
   * that world's foes; a friend in a cellar must not expire them.
   * @type {string | null}
   */
  let clockWorldId = null;
  const debugCollision = urlParams.get('debug') === '1' || urlParams.get('coll') === '1';
  const skipTitle =
    urlParams.get('skipTitle') === '1'
    || urlParams.get('slot') != null
    || urlParams.get('debug') === '1';

  /**
   * A device per player.
   *
   * Alone, player one keeps reading every key and every pad, which is the
   * game as it has always been. In company each player gets their own keys
   * and their own pad slot, or two heroes answer to one hand.
   */
  const inputs = Array.from({ length: maxPlayers }, (_, i) =>
    createInput(bindsForPlayer(options, i), {
      padIndex: playerCount > 1 ? i : null,
    }),
  );
  /** Player one's device. The menus, the dialogue and the title read this. */
  const input = inputs[0];
  const padStartEdges = createPadStartEdges();

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
    // selectedB is per hero; the bag is already shared.
    for (const p of players) {
      if (p?.inv && p.inv !== inv) p.inv.selectedB = B_ITEM.BOW;
    }
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
          busy: partyBusy(),
          hasScreen: Boolean(screen),
          invOpen: activePlayers(players).some((p) => menuUi(p).open),
          menuPlayer: menuOwner()?.index ?? null,
          swordActive: isSwordActive(sword),
          ladder: ladderObj
            ? { x: ladderObj.x, y: ladderObj.y, dir: ladderObj.dir, state: ladderObj.state }
            : null,
          dialogue: anyPrivateDialogue() || storyBox.active,
          talking: talkingPlayer?.index ?? null,
          music: audio?.currentMusic?.() ?? null,
          musicGen: audio?.currentMusicGen?.() ?? 0,
          /** Every hero in the party, in player order. */
          heroes: players.map((p) => ({
            x: p.link.x,
            y: p.link.y,
            dir: p.link.dir,
            active: p.active,
            dead: Boolean(p.inv?.dead),
            halfHearts: p.inv?.halfHearts ?? 0,
            maxHalfHearts: p.inv?.maxHalfHearts ?? 0,
            paralyzed: p.inv?.paralyzed ?? 0,
            world: p.world?.id ?? null,
            swinging: isSwordActive(p.sword),
            swingKind: p.sword?.kind ?? 0,
            animFrame: p.link.animFrame,
            animCounter: p.link.animCounter,
            moving: p.link.moving,
            gridOffset: p.link.gridOffset,
            posFrac: p.link.posFrac,
            uwOccRoomId: p.uwOccRoomId,
            camLocalX: p.cam.camLocalX,
            camLocalY: p.cam.camLocalY,
            ...heroOccupancy(p),
            menu: menuUi(p).open,
            menuPhase: menuUi(p).phase,
            dialogue: playerTextBox(p).active,
            dialogueText: p.view?.dialogueText ?? '',
            dialogueKind: p.view?.dialogueKind ?? null,
            stubText: p.view?.stubText ?? '',
            selectedB: p.inv?.selectedB ?? null,
            swordVisible: Boolean(p.gfx?.sword?.visible),
            swordGfx: p.gfx?.sword
              ? {
                  x: p.gfx.sword.x,
                  y: p.gfx.sword.y,
                  w: p.gfx.sword.texture?.width ?? 0,
                }
              : null,
            bombsOut: (p.world?.bombs ?? []).filter((b) => b.phase !== 'done').length,
            dark: heroSeesDark(p),
            rafting: Boolean(p.raftRide?.active),
            spinning: Boolean(p.deathSeq),
            floorItems: listWorldFloorItems(
              p.world === focus.current?.world
                ? { roomItems, roomItem, roomId }
                : p.world,
            ),
            takenRooms: dungeonTakenRooms(
              p.world === focus.current?.world ? dungeon : p.world?.dungeon,
            ),
          })),
          projectiles: projectiles
            .filter((p) => p.alive)
            .map((p) => ({
              kind: p.kind,
              x: p.x,
              y: p.y,
              dir: p.dir,
              friendly: Boolean(p.friendly),
              bouncing: Boolean(p.bouncing),
            })),
          fxCount: fxLayer.children.length,
          bombCount: bombs.filter((b) => b.phase !== 'done').length,
          keys: sharedInv.keys ?? 0,
          rupees: sharedInv.rupees ?? 0,
          bombs: sharedInv.bombs ?? 0,
          clock: Boolean(sharedInv.clock),
          boomerang: (() => {
            const boom = liveBoomerangs(boomerangs)[0];
            return boom
              ? {
                  x: boom.x,
                  y: boom.y,
                  phase: boom.phase,
                  owner: boom.owner ?? 0,
                  dir: boom.dir,
                }
              : null;
          })(),
          boomerangs: liveBoomerangs(boomerangs).map((b) => ({
            x: b.x,
            y: b.y,
            phase: b.phase,
            owner: b.owner ?? 0,
            dir: b.dir,
          })),
          uwStreamRooms: [...uwStream.views.keys()],
          owStreamRooms: [...owStream.views.keys()],
          story: storyPager
            ? {
                holding: storyPager.holding(),
                pages: storyPager.pageCount,
                finished: players.map((p) => storyPager.finished(p.index)),
              }
            : null,
          ending: endingUi.visible,
          cinematic: playerCount > 1 && !splitLayer.visible,
          canvasW: INTERNAL_W,
          canvasH: INTERNAL_H,
          dark: heroSeesDark(hostPlayer(players) ?? players[0]),
          candleLit: Boolean(candleStateAt(hostPlayer(players) ?? players[0]).lit),
          raft: (() => {
            const p = activePlayers(players).find((q) => q.raftRide?.active);
            if (!p) return null;
            const r = p.raftRide;
            return { owner: p.index, x: r.x, y: r.y, state: r.state };
          })(),
          pushBlocks: [...pushBlocks.entries()]
            .filter(([, b]) => b)
            .map(([id, b]) => ({
              roomId: id,
              x: b.x,
              y: b.y,
              state: b.state,
              complete: Boolean(b.complete),
            })),
          deadMenu: deathUi.visible,
          sharedBar: sharedBar.root.visible,
          compactHud: playerCount > 1,
          hud: hud.probe(),
          joinPrompts: joinPrompts.length,
          joinHint: document.getElementById('joinHint')?.textContent ?? '',
          doors: [...(dungeon?.doorState?.open ?? [])],
          shutterAnims: [...shutterAnims.values()].map((a) => ({
            roomId: a.roomId,
            side: a.side,
            kind: a.kind,
            frame: a.frame,
          })),
          clearedRooms: [...(dungeon?.clearedRooms ?? [])],
          takenRooms: dungeonTakenRooms(dungeon),
          floorItems: listWorldFloorItems({ roomItems, roomItem, roomId }),
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
         * Freeze / unfreeze the wall-clock advance. `step(n)` still works
         * while frozen, which is what makes a run reproducible.
         * @param {boolean} [on]
         */
        pause: (on = true) => {
          framePaused = Boolean(on);
          return framePaused;
        },
        paused: () => framePaused,
        /** Room loads still in flight; a golden run drains this each frame. */
        pendingLoads: () => pendingRoomLoads,
        /** Which places are loaded, and where the focused player is standing. */
        worlds: () => ({
          live: worlds.ids(),
          current: focus.current?.world?.id ?? null,
          enemyLayer: enemyLayer.children.filter((c) => c.visible).length,
        }),
        collectSave: () => collectSaveState(),
        practiceSave: () => savePracticeState(),
        practiceLoad: () => loadPracticeState(),
        /**
         * Step out into an empty world and straight back again.
         *
         * The swap that gives each player their own place is dead code at one
         * player — the focus never moves, so nothing is ever saved or loaded
         * and a golden run cannot tell a complete swap from an empty one. This
         * makes the focus move on demand: if `loadWorldContext()` and
         * `saveWorldContext()` between them carry everything, the world comes
         * back indistinguishable, and if they miss a field it is left holding
         * the scratch world's empty version of it.
         */
        visitScratchWorld: () => {
          const me = focus.current;
          const scratch = createPlayer({
            index: -1,
            link: createLinkState(0x11, 0x22, DIR.UP),
            sword: createSwordState(),
            inv: createInventoryView(sharedInv),
            world: createWorld({ id: 'scratch' }),
          });
          // Borrowed, not built: the visit draws nothing, and lending the
          // sprites keeps a debug hook from leaking a pair per call.
          scratch.gfx = me.gfx;
          // Read from inside the visit: `link` has to *be* the other hero
          // while the focus is on them, not merely be restored afterwards.
          const inside = focus.on(scratch, () => ({ x: link.x, y: link.y }));
          focus.to(me);
          return { world: me?.world?.id ?? null, inside };
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
          camLocalX: cam.camLocalX,
          camLocalY: cam.camLocalY,
          worldCamX: cam.worldCamX,
          worldCamY: cam.worldCamY,
          link: { x: link.x, y: link.y, dir: link.dir },
          spawnedRooms: [...spawnedRooms],
          spawnClaims: [...spawnClaims],
          streamRooms: [
            ...(mode === 'dungeon' ? uwRooms : owRooms).rooms.keys(),
          ],
          // Anchor must contain Link, and the collision grid must be the very
          // array the stream hands the multi-room tile probes.
          linkRoom: (() => {
            const w = localToWorld(roomId, link.x, link.y);
            return worldToLocal(w.x, w.y).roomId;
          })(),
          gridAliased:
            mode === 'dungeon'
              ? dungeonTileGrid === (uwRooms.tileGrid(roomId) ?? null)
              : screen?.tileGrid === (owRooms.tileGrid(roomId) ?? null),
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
            off: rectFullyOffCamera(e, cam.camLocalX, cam.camLocalY, 0),
          })),
        }),
        marks: () => currentMapMarks(),
        say: (pages) => openTextBox(pages, { kind: 'debug' }),
        briefing: (level) => openLevelBriefing(level),
        /**
         * Jump to mode `$13`. Without an argument it plays from Zelda's line;
         * `ending('epilogue')` skips the ROM beats and opens on the first
         * storyboard page, which is otherwise an hour of play away.
         */
        ending: (from = 'start') => {
          endingUi.begin({ quest: inv.quest, name: saveName, deaths: deathCount });
          presentCinematic();
          if (from === 'epilogue') skipEndingToEpilogue(endingUi.state);
          return endingUi.phase;
        },
        enterLevel: (levelId, index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return null;
          return focus.on(p, () => enterLevel(levelId));
        },
        goRoom: (id, dir, index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return null;
          return focus.on(p, () => loadDungeonRoom(id, dir));
        },
        goOw: (id, x = 0x78, y = 0x8d, dir = DIR.UP, index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return null;
          return focus.on(p, () => loadOverworldScreen(id & 0xff, { x, y, dir }));
        },
        /** Square-level view of a streamed OW room's collision grid. */
        squares: (id = roomId) => {
          const grid = owRooms.tileGrid(id);
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
          const grids = owRooms.gridMap();
          const dirs = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };
          /** @type {Record<string, unknown>} */
          const can = {};
          for (const [name, d] of Object.entries(dirs)) {
            can[name] = getLinkCollidingTileMulti(grids, roomId, link.x, link.y, d, {});
          }
          return {
            gates: {
              busy: heroIsBusy(),
              screenBound: Boolean(screen) && (screen.mapIndex & 0xff) === (roomId & 0xff),
              fairyHalt: pondFairyHalt,
              whirlwindCarrying: Boolean(whirlwind?.carrying),
              whirlwindAlive: Boolean(whirlwind?.alive),
              swordActive: isSwordActive(sword),
              shovePixels: inv.shovePixels,
              itemLiftTimer: inv.itemLiftTimer ?? 0,
              raftActive: currentRaft().active,
              dead: inv.dead,
              undergroundExitType: currentUndergroundExitType(),
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
            standingTileMulti(owRooms.gridMap(), roomId, px, py);
          const occ = occupyingOwPack();
          return {
            roomId,
            occRoomId: occ.roomId,
            screenRoomId: screen?.mapIndex ?? null,
            caveId: occ.attrs?.caveId ?? screen?.attrs?.caveId ?? null,
            link: { x: link.x, y: link.y, gridOffset: link.gridOffset },
            yAligned: (link.y & 0x0f) === 0x0d,
            undergroundExitType: currentUndergroundExitType(),
            caveLatch: Boolean(focus.current?.owWarpLatch),
            standing: probe(link.x, link.y),
            standingRight: probe(link.x + 8, link.y),
            entry: checkCaveEntry(link, occ.tileGrid, occ.attrs, occ.roomId, {
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
            busy: heroIsBusy(),
            entry: checkUwStairsEntry(link, dungeonTileGrid),
            cellarId: cellarForStairsRoom(level, dungeon.room.roomId),
            samples,
            gridAliased: dungeonTileGrid === (uwRooms.tileGrid(roomId) ?? null),
          };
        },
        cheats: debugCheats,
        refillHearts: () => debugRefillHearts(),
        refillBombs: () => debugRefillBombs(),
        refillRupees: () => debugRefillRupees(),
        killScreen: () => debugKillScreen(),
        killRoomFoes: () => debugKillRoomFoes(),
        killLink: () => debugKillLink(),
        /** Drop one hero. Co-op respawns them; solo opens the continue menu. */
        kill: (index = 0) => debugKillLink(index),
        /** Drop everyone at once so the continue menu has someone to talk to. */
        wipeParty: () => {
          for (const p of activePlayers(players)) killLink(p.inv);
          const last = hostPlayer(players);
          if (last) focus.on(last, () => beginDeath());
          focus.to(players[0]);
        },
        caps: () => ({
          rupeeCap: sharedInv.rupeeCap ?? 255,
          rupeeCapFloor: sharedInv.rupeeCapFloor ?? 255,
          rupees: sharedInv.rupees ?? 0,
          maxBombs: sharedInv.maxBombs,
          bombBag: sharedInv.bombBag,
          bombs: sharedInv.bombs ?? 0,
        }),
        grantHeart: () => {
          grantRoomItem(inv, 0x1a);
          onGrantedItem(0x1a);
          return players.map((p) => ({
            index: p.index,
            max: p.inv.maxHalfHearts,
            hh: p.inv.halfHearts,
          }));
        },
        poseHero: (index, x, y, dir, inRoom) => {
          const p = players.find((q) => q.index === index);
          if (!p?.link) return false;
          const anchor =
            p.world === focus.current?.world ? roomId : (p.world?.roomId ?? roomId);
          if (inRoom != null && (inRoom & 0xff) !== (anchor & 0xff)) {
            const a = roomPlayOrigin(anchor);
            const b = roomPlayOrigin(inRoom & 0xff);
            x += b.ox - a.ox;
            y += b.oy - a.oy;
          }
          p.link.x = x;
          p.link.y = y;
          if (dir != null) p.link.dir = dir;
          p.link.posFrac = 0;
          p.link.gridOffset = 0;
          p.link.moving = false;
          p.link.animCounter = 6;
          p.link.animFrame = 0;
          if (p.inv) {
            p.inv.shovePixels = 0;
            p.inv.shoveDir = 0;
            p.inv.itemLiftTimer = 0;
          }
          p.uwOccRoomId =
            inRoom != null ? inRoom & 0xff : occupyingRoom(anchor, x, y).roomId;
          p.uwDoorwayBlockSide = null;
          if ((p.world?.mode ?? '') === 'dungeon') {
            const store = candleStoreFor(p);
            const occupied = activePlayers(players).some(
              (q) => q !== p && q.world === p.world
                && occupyingRoomIdOf(q) === (p.uwOccRoomId & 0xff),
            );
            beginCandleStay(store, p.uwOccRoomId, dungeonPackAt(p), p.inv, occupied);
          }
          return true;
        },
        /**
         * Re-arm the entry-door latch (and mark that side passable) so a play
         * test can stand on the floor lip the way a real walk-in does.
         * @param {number} index
         * @param {string} side
         */
        primeUwDoor: (index, side) => {
          const p = players.find((q) => q.index === index);
          if (!p || !dungeon || !side) return false;
          const occId = occupyingRoomIdOf(p);
          p.uwDoorwayBlockSide = side;
          dungeon.doorwayBlockSide = side;
          openDoorPair(dungeon.doorState, occId, side);
          return true;
        },
        /**
         * Start a NES `$20` knockback on this hero.
         * @param {number} index
         * @param {number} dir
         * @param {number} [pixels]
         */
        shoveHero: (index, dir, pixels = 0x20) => {
          const p = players.find((q) => q.index === index);
          if (!p?.inv) return false;
          p.inv.shoveDir = dir & 0x0f;
          p.inv.shovePixels = pixels;
          return true;
        },
        /**
         * Put a visible floor item under a hero so a play test can take it.
         * @param {number} [index]
         * @param {number} [itemType] default key `$19`
         */
        placeRoomItem: (index = 0, itemType = 0x19) => {
          const p = players.find((q) => q.index === index && q.active);
          if (!p?.link) return false;
          return focus.on(p, () => {
            const occId = occupyingRoomIdOf(p);
            const item = {
              itemType,
              effect: 0,
              homeX: p.link.x,
              homeY: p.link.y,
              x: p.link.x,
              y: p.link.y,
              visible: true,
              taken: false,
              carried: false,
            };
            if (mode === 'dungeon') {
              roomItems.set(occId, item);
              if ((dungeon?.room?.roomId & 0xff) === occId) roomItem = item;
            } else {
              roomItem = item;
            }
            return true;
          });
        },
        /**
         * Drop a living foe in the current room so a play test can watch
         * whether it follows through a door. Real rooms do this themselves;
         * the hook is for rooms that spawn empty (old-man entrance, cleared).
         * `player` plants in that hero's world (so an overworld test still
         * works after player one has gone underground).
         */
        plantFoe: (opts = {}) => {
          const go = () => {
            const e = createEnemy({
              objType: opts.objType ?? OBJ.RED_GORIYA,
              x: opts.x ?? 0xc0,
              y: opts.y ?? 0x8d,
            });
            if (!e) return null;
            const home = (opts.home ?? roomId) & 0xff;
            tagEnemyHomeRoom([e], home);
            e.viewActivated = true;
            e.alive = true;
            if (e.objType === OBJ.POND_FAIRY) {
              // InitPondFairy stamps ($78,$7D); map that into the home room so
              // a leftover fountain is not a ring around whoever holds the anchor.
              const anchored = offsetFromRoom(home, e.x, e.y);
              e.x = anchored.x;
              e.y = anchored.y;
            }
            if (opts.captureTimer != null) e.captureTimer = opts.captureTimer;
            enemies.push(e);
            spawnedRooms.add(home);
            return { id: e.id, home: e.homeRoomId, x: e.x, y: e.y, objType: e.objType };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        /**
         * Put a floor drop under a hero so a play test can see whether the
         * sprite follows that world's view, not only the pickup.
         */
        plantDrop: (opts = {}) => {
          const go = () => {
            const drop = createDroppedItem(
              opts.x ?? link.x,
              opts.y ?? link.y,
              opts.itemId ?? DROP_ITEM.RUPEE1,
            );
            if (opts.lifetime != null) drop.lifetime = opts.lifetime;
            else if (activePlayers(players).length > 1) drop.lifetime = 0xef;
            drop.id = dropSpriteSeq++;
            drops.push(drop);
            syncDropSprites();
            return { id: drop.id, x: drop.x, y: drop.y, itemId: drop.itemId };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        /**
         * Put a shot in a hero's world so a play test can see whether the
         * sprite follows that view. Sword beams and enemy rocks both live on
         * `projGfx`, which split-screen used to leave latched off.
         */
        plantShot: (opts = {}) => {
          const go = () => {
            const shot = createProjectile({
              kind: opts.kind ?? PROJ.ROCK,
              x: opts.x ?? link.x,
              y: opts.y ?? link.y,
              dir: opts.dir ?? DIR.LEFT,
              speed: opts.speed ?? 0,
              life: opts.life ?? 180,
              friendly: Boolean(opts.friendly),
            });
            projectiles.push(shot);
            syncEnemySprites();
            return { id: shot.id, kind: shot.kind, x: shot.x, y: shot.y };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        /**
         * Per-world item sprites. After a split-screen present, a drop the
         * overworld still holds must stay visible on that world and hidden
         * on a cellar.
         */
        itemGfx: () =>
          worlds.ids().map((id) => {
            const w = worlds.get(id);
            return {
              id,
              enemies: (w?.enemies ?? []).filter((e) => e.alive).length,
              enemyVisible: [...(w?.enemyGfx?.values() ?? [])].filter((s) => s.visible)
                .length,
              drops: (w?.drops ?? []).filter((d) => d.alive).length,
              dropVisible: [...(w?.dropGfx?.values() ?? [])].filter((s) => s.visible)
                .length,
              shots: (w?.projectiles ?? []).filter((p) => p.alive).length,
              shotVisible: [...(w?.projGfx?.values() ?? [])].filter((s) => s.visible)
                .length,
              pondHearts: (w?.pondHeartGfx ?? []).length,
              pondVisible: (w?.pondHeartGfx ?? []).filter((s) => s.visible).length,
              pondHeartPos: (w?.pondHeartGfx ?? []).map((s) => ({
                x: s.x,
                y: s.y,
                visible: s.visible,
              })),
            };
          }),
        /** What each quadrant actually painted — rafts used to stay latched on. */
        viewGfx: () =>
          players.map((p) => ({
            index: p.index,
            active: p.active,
            raftVisible: Boolean(p.view?.raftVisible),
            rafting: Boolean(p.raftRide?.active),
            ladderVisible: Boolean(p.view?.ladderVisible),
            whirlVisible: Boolean(p.view?.whirlVisible),
            baitVisible: Boolean(p.view?.baitVisible),
            liftVisible: Boolean(p.view?.liftVisible),
            pondVisible: Boolean(p.view?.pondVisible),
            boomVisible: p.view?.boomVisible ?? 0,
            bombCount: p.view?.bombCount ?? 0,
            hudMap: Boolean(p.view?.hudMap),
            hudCounters: Boolean(p.view?.hudCounters),
            hudMode: p.view?.hudMode ?? null,
            dialogueText: p.view?.dialogueText ?? '',
            dialogueKind: p.view?.dialogueKind ?? null,
            stubText: p.view?.stubText ?? '',
          })),
        /** Living foes in a hero's world (the live list if that world is in focus). */
        foes: (index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return [];
          const list =
            p.world === focus.current?.world ? enemies : (p.world?.enemies ?? []);
          return list
            .filter((e) => e.alive)
            .map((e) => ({
              id: e.id,
              x: e.x,
              y: e.y,
              home: e.homeRoomId ?? null,
              objType: e.objType,
              clockFrozen: Boolean(e.clockFrozen),
            }));
        },
        /**
         * Close a Wallmaster's hand on a hero so a play test can watch the
         * dump without waiting for a crawl. The slide still runs; warp is
         * the same finish as a real grab.
         * @param {number} [index]
         */
        grabWallmaster: (index = 0) => {
          const p = players.find((q) => q.index === index && q.active);
          if (!p?.link) return null;
          const e = createEnemy({
            objType: OBJ.WALLMASTER,
            x: p.link.x,
            y: p.link.y,
          });
          if (!e) return null;
          const home = occupyingRoom(
            p.world === focus.current?.world ? roomId : (p.world?.roomId ?? roomId),
            p.link.x,
            p.link.y,
          ).roomId;
          tagEnemyHomeRoom([e], home);
          e.viewActivated = true;
          e.alive = true;
          e.wallmasterGrab = true;
          e.wallmasterVictim = index;
          e.captureTimer = 1;
          e.wallmasterRetreatDir = undefined;
          e.wallmasterTilesCrossed = 0;
          e.gridOffset = 0;
          p.inv.paralyzed = 2;
          p.inv.shovePixels = 0;
          p.inv.shoveDir = 0;
          enemies.push(e);
          spawnedRooms.add(home);
          return { id: e.id, victim: index, x: e.x, y: e.y };
        },
        plantBomb: (owner = 0, explode = false) => {
          const p = players.find((q) => q.index === owner && q.active);
          if (!p) return false;
          focus.on(p, () => {
            const bomb = placeBomb(p.link.x, p.link.y, p.link.dir);
            bomb.owner = p.index;
            if (explode) {
              bomb.phase = 'explode';
              bomb.timer = 8;
              bomb.damaged = false;
            }
            bombs.push(bomb);
          });
          focus.to(players[0]);
          return true;
        },
        /**
         * Drop a stepladder sprite in a hero's world so a split-screen test
         * can see whether it stays off an ally's other-world view.
         */
        plantLadder: (opts = {}) => {
          const go = () => {
            ladderObj = {
              x: opts.x ?? link.x,
              y: opts.y ?? link.y,
              dir: opts.dir ?? DIR.RIGHT,
              state: 1,
            };
            syncLadderSprite();
            return { x: ladderObj.x, y: ladderObj.y };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        plantWhirlwind: (opts = {}) => {
          const go = () => {
            const startX = opts.x ?? 0;
            whirlwind = createWhirlwind(opts.y ?? link.y, startX);
            syncWhirlwindSprite();
            return { x: whirlwind.x, y: whirlwind.y };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        plantBait: (opts = {}) => {
          const go = () => {
            bait = placeBait(opts.x ?? link.x, opts.y ?? link.y, opts.dir ?? link.dir);
            syncToolSprites();
            return { x: bait.x, y: bait.y, alive: bait.alive };
          };
          if (opts.player == null) return go();
          const p = players.find((q) => q.index === opts.player && q.active);
          if (!p) return null;
          const held = focus.current;
          const planted = focus.on(p, go);
          if (held) focus.to(held);
          return planted;
        },
        setHearts: (index, half, max) => {
          const p = players.find((q) => q.index === index);
          if (!p?.inv) return null;
          if (max != null) p.inv.maxHalfHearts = max;
          if (half != null) p.inv.halfHearts = half;
          return { halfHearts: p.inv.halfHearts, maxHalfHearts: p.inv.maxHalfHearts };
        },
        startLift: (index = 0, itemType = 0x16) => {
          const p = players.find((q) => q.index === index && q.active);
          if (!p) return false;
          const held = focus.current;
          focus.on(p, () => {
            p.inv.itemLiftTimer = ITEM_LIFT_FRAMES;
            startItemLift(itemType);
          });
          if (held) focus.to(held);
          return true;
        },
        /** Paint split-screen views without advancing the sim. */
        present: () => presentViews(),
        /**
         * Arm a hero's B slot so a play test can throw without opening the
         * submenu. `item` is a `B_ITEM` id (`'boomerang'`, `'bomb'`, …).
         * @param {number} index
         * @param {string} item
         */
        selectB: (index, item) => {
          const p = players.find((q) => q.index === index);
          if (!p?.inv) return null;
          p.inv.selectedB = item;
          return p.inv.selectedB;
        },
        openCave: (caveId, index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return null;
          return focus.on(p, () => openCave(caveId));
        },
        leaveCave: (index) => {
          const p =
            index == null
              ? focus.current
              : players.find((q) => q.index === index);
          if (!p) return null;
          return focus.on(p, () => leaveCave());
        },
        persistSlot: () => {
          persistSave('debug');
          return activeSlot;
        },
        continuePlay: async (slot) => {
          const n = slot ?? activeSlot ?? 0;
          playing = false;
          await beginPlay(n, 'continue');
        },
        join: (index = 1) => joinPlayer(index),
        leave: (index = 1) => {
          const p = players.find((q) => q.index === index);
          return p ? leavePlayer(p) : false;
        },
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
    const p2 = bindsForPlayer(options, 1).start?.[0];
    const join = p2 ? `${codeLabel(p2)} / spare Start joins` : 'spare Start joins';
    help.textContent = `${move} move · ${b.a.map(codeLabel).join('/')} sword · ${b.b
      .map(codeLabel)
      .join('/')} B-item · ${b.start.map(codeLabel).slice(0, 2).join('/')} inv · ${join} · M mute · ,/. volume`;
  }

  function refreshJoinHint() {
    const el = document.getElementById('joinHint');
    if (!el) return;
    const next = nextJoinIndex(players, maxPlayers);
    if (!playing || next < 0) {
      el.hidden = true;
      return;
    }
    const start = bindsForPlayer(options, next).start?.[0];
    const key = start ? codeLabel(start) : 'Start';
    el.hidden = false;
    el.textContent = `Player ${next + 1}: press ${key} or a spare controller's Start to join`;
  }

  function snapshotDungeonState(d) {
    if (!d) return;
    const key = dungeonProgressKey(inv.quest, d.level);
    dungeonProgress.set(key, {
      cleared: new Set(d.clearedRooms),
      taken: new Set(d.takenItems),
      visited: new Set(d.visitedRooms),
      pushed: new Set(d.pushedRooms),
      doors: new Set(d.doorState.open),
      lastBoss: Boolean(d.lastBossDefeated),
      map: inv.map,
      compass: inv.compass,
    });
  }

  function snapshotDungeonProgress() {
    snapshotDungeonState(dungeon);
  }

  /**
   * Every live labyrinth, not only the focused one. Player two taking a
   * key while player one is in a cave must still land in `dungeonProgress`.
   */
  function snapshotAllDungeonProgress() {
    const seen = new Set();
    snapshotDungeonState(dungeon);
    if (dungeon) seen.add(dungeon);
    for (const id of worlds.ids()) {
      const d = worlds.get(id)?.dungeon;
      if (!d || seen.has(d)) continue;
      snapshotDungeonState(d);
      seen.add(d);
    }
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
      if (park != null && !heroIsBusy()) {
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
    focus.to(hostPlayer(players) ?? players[0]);
    Object.assign(inv, createInventory());
    applyPartyCaps(sharedInv, activePlayers(players).length);
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
    applyPartySnapshot(players, meta.party, { skipPose: [0] });
    await restorePartyWorlds(meta.party, { includeHost: !healed });
    playing = true;
    refreshJoinHint();
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

  /**
   * Put everyone back in the place the file remembered.
   * `position` is always the host's restore (dungeon / OW doorstep); cave
   * and cellar for the host live on `party[0].worldId`, because a solo
   * continue from a cave historically dumped you on the mouth.
   * @param {readonly object[] | undefined} party
   * @param {{ includeHost?: boolean }} [opts]
   */
  async function restorePartyWorlds(party, opts = {}) {
    if (!Array.isArray(party)) return;
    for (const snap of party) {
      if ((snap.index ?? 0) === 0 && !opts.includeHost) continue;
      const p = players.find((q) => q.index === snap.index && q.active);
      if (!p) continue;
      const skipPose = (snap.index ?? 0) === 0;
      await focus.on(p, () => settlePlayerInSavedWorld(p, snap, { skipPose }));
    }
    focus.to(players[0]);
  }

  /**
   * @param {object} p
   * @param {object} snap
   */
  function applySavedPose(p, snap) {
    if (!p?.link) return;
    if (snap.x != null) p.link.x = snap.x;
    if (snap.y != null) p.link.y = snap.y;
    if (snap.dir != null) p.link.dir = snap.dir;
    p.link.posFrac = 0;
    p.link.gridOffset = 0;
    p.link.moving = false;
  }

  /**
   * @param {object} p
   * @param {object} snap
   * @param {{ skipPose?: boolean }} [opts]
   */
  async function settlePlayerInSavedWorld(p, snap, opts = {}) {
    const id = snap.worldId;
    if (!id || id === p.world?.id) {
      if (!opts.skipPose) applySavedPose(p, snap);
      return;
    }
    if (id === overworldWorldId()) {
      if (worlds.get(id)) movePlayerToWorld(p, id, { mode: 'overworld' });
      applySavedPose(p, snap);
      return;
    }
    const cellar = parseCellarWorldId(id);
    if (cellar) {
      if (!dungeon?.levelData || dungeon.level !== cellar.level) {
        await enterLevel(cellar.level);
        resumeAs(p);
      }
      if (!isCellarWorldId(p.world?.id)) {
        await enterCellar(cellar.cellarRoomId, dungeon?.cellarSourceRoomId ?? roomId, {
          x: snap.x,
          y: snap.y,
          dir: snap.dir,
        });
        resumeAs(p);
      }
      applySavedPose(p, snap);
      return;
    }
    if (id.startsWith('dungeon:')) {
      const level = Number(id.slice('dungeon:'.length));
      if (worlds.get(id)?.dungeon) {
        movePlayerToWorld(p, id, { mode: 'dungeon' });
      } else if (Number.isFinite(level)) {
        await enterLevel(level);
        resumeAs(p);
      }
      applySavedPose(p, snap);
      return;
    }
    if (id.startsWith('cave:')) {
      const caveId = Number(id.slice('cave:'.length));
      if (Number.isFinite(caveId)) openCave(caveId);
      applySavedPose(p, snap);
    }
  }

  function collectSaveState() {
    snapshotAllDungeonProgress();
    const host = hostPlayer(players) ?? players[0];
    return focus.on(host, () => {
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
        party: snapshotParty(players),
        questCompleted,
      };
    });
  }

  function persistSave(reason = '') {
    if (activeSlot == null || !playing) return;
    // Mode $13 has already written `questCompleted`. Keep that snapshot —
    // do not replace it with Zelda's cell while the credits are rolling.
    if (endingUi.visible) return;
    // collectSaveState focuses the host. Must return to whoever was mid-step
    // (player two paying the L8 old man, a leftover cave, …).
    const resume = focus.current;
    saveStore.save(activeSlot, collectSaveState());
    if (resume && focus.current !== resume) focus.to(resume);
    lastAutosave = performance.now();
    if (reason) setStatus(`Saved (${reason})`);
  }

  function setOptions(next) {
    options = next;
    for (let i = 0; i < inputs.length; i += 1) {
      inputs[i].setBinds(bindsForPlayer(options, i));
    }
    syncPadAssignment();
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
    for (const p of players) {
      if (p?.inv) refillHearts(p.inv);
    }
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
    const cams = sessionCameras();
    const victims = enemies.filter((e) =>
      shouldKillOnScreen(e, (foe) => rectFullyOffEveryCamera(foe, cams, 0)),
    );
    for (const e of victims) {
      e.hp = 0;
      e.alive = false;
      onEnemyKilled(e);
    }
    setStatus(victims.length ? `Debug: killed ${victims.length}` : 'Debug: no enemies on screen');
  }

  /**
   * Occupying-cell clear-count foes, including Wallmasters waiting on an
   * edge. `killScreen` skips off-camera, so L7 `$0d` never unlatched.
   */
  function debugKillRoomFoes() {
    const occId = occupyingRoomIdOf(focus.current);
    const victims = enemiesInRoom(enemies, occId).filter((e) => countsTowardRoomClear(e));
    for (const e of victims) {
      e.hp = 0;
      e.alive = false;
      onEnemyKilled(e);
    }
    setStatus(
      victims.length
        ? `Debug: killed ${victims.length} in $${occId.toString(16)}`
        : `Debug: no foes in $${occId.toString(16)}`,
    );
  }

  function debugKillLink(index = focus.current?.index ?? 0) {
    const p = players[index] ?? focus.current;
    if (!playing || !p || !killLink(p.inv)) return false;
    debugUi.close();
    focus.on(p, () => {
      refreshHud();
      beginDeath();
    });
    focus.to(players[0]);
    setStatus('Debug: Link killed');
    return true;
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
  let sword = createSwordState();

  /**
   * The heroes (Phase 23). One today.
   *
   * `link` and `sword` are `const` and only ever mutated, so the record holds
   * the very objects the closure locals point at and every existing reference
   * keeps working. Ask this list rather than `link` wherever the answer should
   * scale to four; the remaining direct references move over a subsystem at a
   * time, with the goldens green throughout.
   */
  /**
   * The places currently loaded. One today — the party is always together, so
   * the overworld, a cave and a labyrinth take turns being the single live
   * world. When players can split up, each occupied place is its own entry and
   * the unoccupied ones are pruned.
   */
  const worlds = createWorldRegistry();
  const players = [
    createPlayer({
      index: 0,
      link,
      sword,
      inv,
      cam,
      world: worlds.enter(overworldWorldId(), {
        mode: 'overworld',
        roomId: worldIndex.startScreen,
      }),
    }),
  ];
  players[0].gfx = p1Gfx;

  /**
   * Everyone else, for as long as joining means asking for them up front.
   *
   * They start beside player one, in the same place, sharing the purse.
   * Each has a camera of their own; with `?players=2` those cameras are
   * drawn side by side. The one-player game never builds a second view.
   */
  for (let i = 1; i < playerCount; i += 1) {
    const mate = createPlayer({
      index: i,
      link: createLinkState(link.x + i * 16, link.y, link.dir),
      sword: createSwordState(),
      inv: createInventoryView(sharedInv),
      world: players[0].world,
    });
    mate.gfx = createHeroGfx(mate.link, i + 1);
    players.push(mate);
  }
  applyPartyCaps(sharedInv, playerCount);

  /**
   * Split-screen pictures. Empty at one player — the `frame` stays on the
   * stage and is the game as it has always been. At two or more the frame
   * comes off the stage and is drawn into one texture per player.
   */
  const splitLayer = new Container();
  app.stage.addChildAt(splitLayer, 0);
  app.stage.addChild(sharedBar.root);

  function attachPlayerView(p) {
    if (p.view) return p.view;
    const origin = quadrantOrigin(p.index, playerCount);
    const rt = RenderTexture.create({
      width: QUAD_W,
      height: QUAD_H,
      resolution: scale(),
    });
    rt.source.scaleMode = 'nearest';
    const spr = new Sprite(rt);
    spr.x = origin.x;
    spr.y = origin.y;
    splitLayer.addChild(spr);
    p.view = { rt, spr };
    return p.view;
  }

  function detachPlayerView(p) {
    if (!p.view) return;
    splitLayer.removeChild(p.view.spr);
    p.view.spr.destroy();
    p.view.rt.destroy(true);
    p.view = null;
  }

  /** @type {Container[]} */
  let joinPrompts = [];

  function clearJoinPrompts() {
    for (const c of joinPrompts) {
      splitLayer.removeChild(c);
      c.destroy({ children: true });
    }
    joinPrompts = [];
  }

  function createJoinPrompt(index, n) {
    const root = new Container();
    const bg = new Graphics().rect(0, 0, QUAD_W, QUAD_H).fill(0x000000);
    root.addChild(bg);
    const img = sheetTextures.commonBg?.source?.resource;
    if (img) {
      const title = nesText(img, String(index + 1), 0, 0, 0xfcfcfc);
      title.x = 120;
      title.y = 88;
      const a = nesText(img, 'PRESS START', 0, 0, 0xfcfcfc);
      a.x = 40;
      a.y = 120;
      const b = nesText(img, 'TO JOIN', 0, 0, 0xfcfcfc);
      b.x = 72;
      b.y = 136;
      root.addChild(title, a, b);
    }
    const origin = quadrantOrigin(index, n);
    root.x = origin.x;
    root.y = origin.y;
    splitLayer.addChild(root);
    return root;
  }

  /**
   * Drop split-screen for something that was authored against 256×240 —
   * the ending, the continue menu. The party is still seated; the picture
   * is just one screen that everyone watches. Leftover per-player boxes
   * would otherwise paint onto that shared frame (an ally still talking
   * to the cave old man while Zelda is rescued).
   */
  function presentCinematic() {
    closeDialogue();
    splitLayer.visible = false;
    sharedBar.show(false);
    if (INTERNAL_W !== QUAD_W || INTERNAL_H !== QUAD_H) {
      INTERNAL_W = QUAD_W;
      INTERNAL_H = QUAD_H;
      app.renderer.resize(INTERNAL_W, INTERNAL_H);
      resizeCanvas();
    }
    if (frame.parent !== app.stage) app.stage.addChildAt(frame, 0);
  }

  /**
   * Grow or shrink the canvas to match who is sitting down.
   *
   * One player is the ROM frame on the stage. Two or more take that frame
   * off and draw it into a texture per hero. Coming back the other way puts
   * the frame back so solo goldens stay on the same pixels.
   */
  function adoptSessionLayout() {
    const n = activePlayers(players).length;
    playerCount = n;
    const px = frameSize(n);
    INTERNAL_W = px.width;
    INTERNAL_H = px.height;
    app.renderer.resize(INTERNAL_W, INTERNAL_H);
    resizeCanvas();
    for (const p of players) detachPlayerView(p);
    clearJoinPrompts();
    splitLayer.visible = n > 1;
    applyPartyCaps(sharedInv, n);
    const barAt = sharedBarOrigin(n);
    if (barAt) {
      sharedBar.root.x = barAt.x;
      sharedBar.root.y = barAt.y;
      sharedBar.show(true);
    } else {
      sharedBar.show(false);
    }
    if (n <= 1) {
      if (frame.parent !== app.stage) app.stage.addChildAt(frame, 0);
      for (const p of players) {
        if (p.gfx?.tag) p.gfx.tag.visible = false;
      }
      return;
    }
    if (frame.parent === app.stage) app.stage.removeChild(frame);
    for (const p of activePlayers(players)) attachPlayerView(p);
    for (const i of emptyQuadrants(
      activePlayers(players).map((p) => p.index),
      n,
    )) {
      joinPrompts.push(createJoinPrompt(i, n));
    }
    refreshJoinHint();
  }
  if (playerCount > 1) adoptSessionLayout();
  refreshJoinHint();

  function syncPadAssignment() {
    const n = activePlayers(players).length;
    const pads = navigator.getGamepads?.() ?? [];
    const host = hostPadIndex(pads);
    for (let i = 0; i < inputs.length; i += 1) {
      const claimed = options.padSlots?.[i];
      if (n <= 1 && i === 0) {
        // Solo: every pad, same as the game has always been.
        inputs[i].setPadIndex(claimed === undefined || claimed == null ? null : claimed);
      } else if ((claimed == null || claimed === undefined) && i === 0) {
        // In company, "every pad" would also walk player two's controller.
        inputs[i].setPadIndex(host >= 0 ? host : 0);
      } else {
        inputs[i].setPadIndex(claimed === undefined ? i : claimed);
      }
    }
  }

  function hideHeroGfx(p) {
    if (!p?.gfx) return;
    p.gfx.link.visible = false;
    p.gfx.sword.visible = false;
    if (p.gfx.tag) p.gfx.tag.visible = false;
  }

  function joinPlayer(index) {
    if (index < 0 || index >= maxPlayers || deathUi.visible) return null;
    const host = hostPlayer(players);
    if (!host) return null;
    let p = players.find((q) => q.index === index);
    if (p?.active) return null;
    if (!p) {
      focus.on(host, () => {
        p = createPlayer({
          index,
          link: createLinkState(host.link.x, host.link.y, host.link.dir),
          sword: createSwordState(),
          inv: createInventoryView(sharedInv),
          world: host.world,
        });
        p.gfx = createHeroGfx(p.link, index + 1);
        players.push(p);
      });
      focus.to(players[0]);
    } else {
      p.active = true;
      if (p.gfx) {
        p.gfx.link.visible = true;
        p.gfx.sword.visible = false;
      }
    }
    snapToHost(p, host);
    fillJoiningHearts(p.inv, host.inv);
    copyJoiningBSlot(p.inv, host.inv);
    p.active = true;
    syncPadAssignment();
    adoptSessionLayout();
    setStatus(`Player ${index + 1} joined`);
    refreshJoinHint();
    return p;
  }

  function leavePlayer(p) {
    if (!canLeave(players, p) || deathUi.visible) return false;
    if (playerTextBox(p).active) closePrivateDialogue(p);
    if (menuUi(p).open) closePlayerMenu(p);
    p.active = false;
    hideHeroGfx(p);
    if (focus.current === p) focus.to(hostPlayer(players) ?? players[0]);
    tearDownDroppedWorlds(worlds.prune(players));
    syncPadAssignment();
    adoptSessionLayout();
    setStatus(`Player ${p.index + 1} left`);
    refreshJoinHint();
    return true;
  }
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
  /**
   * `dropRng` as an index picker (0..max-1).
   *
   * Edge spawns used to take `tryEdgeSpawn`'s `Math.random` default, which
   * made the cell a streamed room's foes walk in from differ from one run of
   * the same walk to the next. Everything else in the sim already draws from
   * this one seeded stream; this was the only hole in it.
   */
  const pickRng = (max) => (max > 0 ? dropRng() % max : 0);
  let dropFrame = 0;
  /** Frames remaining where Digdogger hears the flute. */
  let flutePulse = 0;
  /** @type {Map<number, Sprite>} */
  let dropGfx = new Map();
  /**
   * UW person pay-wares (bomb upgrade / money-or-life) + price labels.
   * @type {Map<string, import('pixi.js').Container>}
   */
  let personWareGfx = new Map();
  /** Room id whose person dialogue already opened this visit (`null` = none). */
  let personDialogueForRoom = /** @type {number | null} */ (null);
  /** Pond-fairy orbit hearts (UpdatePondFairy). */
  /** @type {Sprite[]} */
  let pondHeartGfx = [];
  /** Link halted by pond fairy heal sequence (ObjState $40). */
  let pondFairyHalt = false;
  let dropSpriteSeq = 0;
  /** @type {import('@shared/boomerang.js').Boomerang[]} */
  let boomerangs = [];
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
  /** @type {Map<number, ReturnType<typeof createRoomItem>>} */
  let roomItems = new Map();
  /** @type {Set<number>} */
  let secretLatchRooms = new Set();
  /** @type {Map<string, ReturnType<typeof createShutterAnim>>} */
  let shutterAnims = new Map();
  /** @type {Map<number, Sprite>} */
  let enemyGfx = new Map();
  /** @type {Map<number, Sprite>} */
  let projGfx = new Map();
  /** @type {Map<number, Sprite>} */
  let roomItemSprites = new Map();
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
  /** @type {Map<number, import('@shared/pushBlock.js').PushBlock | null>} */
  let pushBlocks = new Map();
  /** @type {number[][] | null} */
  let floorTiles = null;
  /**
   * Whose world the live variables above describe.
   *
   * Two kinds of state get swapped. A player's own place — `roomId`, its
   * `screen`, the `caveReturn` pose — comes off the player. Everything that
   * belongs to the place itself — the entity arrays, what has been spawned,
   * the room's blocks and tiles, and the `mode` and `dungeon` that say which
   * place it is — comes off `player.world`, so two players standing in the
   * same labyrinth share one set of enemies rather than a copy each.
   *
   * A frame runs inside `focus.on(player, ...)`, so the 1000-odd references to
   * these variables keep working and mean "the player being simulated".
   * Nothing is copied unless the focus moves, which is what lets the rest of
   * the game go on setting `mode` and `screen` from outside a frame — picking
   * a save file, entering a cave, a room load resolving late.
   *
   * `WORLD_STATE_KEYS` is the same list in `worldRegistry.js`; a field that
   * appears in one and not the other is a field that leaks between places.
   *
   * Anything that resumes while a *different* player holds the focus must
   * capture `focus.current` and re-enter with it.
   */
  function loadWorldContext(p) {
    const w = p.world;
    mode = w.mode;
    dungeon = w.dungeon;
    enemies = w.enemies;
    projectiles = w.projectiles;
    drops = w.drops;
    bombs = w.bombs;
    flames = w.flames;
    enemyBooms = w.enemyBooms;
    boomerangs = w.boomerangs ?? [];
    bait = w.bait;
    whirlwind = w.whirlwind;
    statueState = w.statueState;
    ladderObj = w.ladderObj;
    roomItem = w.roomItem;
    roomItems = w.roomItems ?? new Map();
    spawnedRooms = w.spawnedRooms;
    spawnClaims = w.spawnClaims;
    secretLatchRooms = w.secretLatchRooms ?? new Set();
    shutterAnims = w.shutterAnims ?? new Map();
    pushBlock = w.pushBlock;
    pushBlocks = w.pushBlocks ?? new Map();
    floorTiles = w.floorTiles;
    dungeonTileGrid = w.dungeonTileGrid;
    caveTileGrid = w.caveTileGrid;
    bindWorldGfx(w);
    // rooms / stream / enemyGfx / projGfx / dropGfx / pondHeartGfx / personWareGfx — per-world Pixi, via bindWorldGfx
    candleRoom = asCandleStore(w.candleRoom);
    gambleAmounts = w.gambleAmounts ?? null;
    gambleResolved = Boolean(w.gambleResolved);
    flutePulse = w.flutePulse ?? 0;
    personDialogueForRoom = w.personDialogueForRoom ?? null;
    roomId = w.roomId;
    screen = w.screen;
    caveReturn = w.caveReturn;
    link = p.link;
    sword = p.sword;
    inv = p.inv;
    cam = p.cam;
    linkSprite = p.gfx.link;
    swordSprite = p.gfx.sword;
  }
  function saveWorldContext(p) {
    const w = p.world;
    w.mode = mode;
    w.dungeon = dungeon;
    w.enemies = enemies;
    w.projectiles = projectiles;
    w.drops = drops;
    w.bombs = bombs;
    w.flames = flames;
    w.enemyBooms = enemyBooms;
    w.boomerangs = boomerangs;
    w.bait = bait;
    w.whirlwind = whirlwind;
    w.statueState = statueState;
    w.ladderObj = ladderObj;
    w.roomItem = roomItem;
    w.roomItems = roomItems;
    w.spawnedRooms = spawnedRooms;
    w.spawnClaims = spawnClaims;
    w.secretLatchRooms = secretLatchRooms;
    w.shutterAnims = shutterAnims;
    w.pushBlock = pushBlock;
    w.pushBlocks = pushBlocks;
    w.floorTiles = floorTiles;
    w.dungeonTileGrid = dungeonTileGrid;
    w.caveTileGrid = caveTileGrid;
    captureWorldGfx(w);
    w.rooms = w.mode === 'overworld' ? owRooms : w.mode === 'dungeon' ? uwRooms : w.rooms;
    w.stream = w.mode === 'overworld' ? owStream : w.mode === 'dungeon' ? uwStream : w.stream;
    w.enemyGfx = enemyGfx;
    w.projGfx = projGfx;
    w.dropGfx = dropGfx;
    w.pondHeartGfx = pondHeartGfx;
    w.personWareGfx = personWareGfx;
    w.candleRoom = candleRoom;
    w.gambleAmounts = gambleAmounts;
    w.gambleResolved = gambleResolved;
    w.flutePulse = flutePulse;
    w.personDialogueForRoom = personDialogueForRoom;
    w.roomId = roomId;
    w.screen = screen;
    w.caveReturn = caveReturn;
    // The hero objects are only ever mutated, never reassigned, so writing
    // them back is a no-op today. Kept symmetrical so the record stays the
    // truth about a player rather than a copy that can drift from one.
    p.link = link;
    p.sword = sword;
    p.inv = inv;
    p.cam = cam;
  }

  function streamInUse(stream) {
    if (!stream) return false;
    for (const id of worlds.ids()) {
      if (worlds.get(id)?.stream === stream) return true;
    }
    return false;
  }

  /**
   * Each occupied place paints its own rooms. L1 `$73` and L4 `$73` must not
   * share a store, or leftover neighbours from one labyrinth overwrite the
   * other. The first overworld and the first dungeon reuse the boot streams
   * so a solo playthrough still has exactly the scene graph it always had.
   */
  function ensureWorldGfx(w) {
    if (!w) return;
    const reuseOw = w.mode === 'overworld' && !w.stream && !streamInUse(bootOwStream);
    const reuseUw = w.mode === 'dungeon' && !w.stream && !streamInUse(bootUwStream);
    if (!w.enemyGfx) {
      if (reuseOw) {
        w.enemyGfx = enemyGfx;
        w.projGfx = projGfx;
        w.dropGfx = dropGfx;
        w.pondHeartGfx = pondHeartGfx;
        w.personWareGfx = personWareGfx;
      } else {
        w.enemyGfx = new Map();
        w.projGfx = new Map();
        w.dropGfx = new Map();
        w.pondHeartGfx = [];
        w.personWareGfx = new Map();
      }
    }
    if (!w.pondHeartGfx) w.pondHeartGfx = [];
    if (!w.personWareGfx) w.personWareGfx = new Map();
    if (w.mode === 'cave') return;
    if (w.rooms && w.stream) return;
    if (reuseOw) {
      w.rooms = bootOwRooms;
      w.stream = bootOwStream;
      return;
    }
    if (reuseUw) {
      w.rooms = bootUwRooms;
      w.stream = bootUwStream;
      return;
    }
    w.rooms = createRoomStore();
    w.stream = createStreamView(playField, w.rooms);
    w.stream.layer.visible = false;
  }

  function bindWorldGfx(w) {
    if (w.mode === 'overworld' && w.rooms) {
      owRooms = w.rooms;
      owStream = w.stream;
    } else if (w.mode === 'dungeon' && w.rooms) {
      uwRooms = w.rooms;
      uwStream = w.stream;
    }
    if (w.enemyGfx) enemyGfx = w.enemyGfx;
    if (w.projGfx) projGfx = w.projGfx;
    if (w.dropGfx) dropGfx = w.dropGfx;
    pondHeartGfx = w.pondHeartGfx ?? [];
    if (!w.pondHeartGfx) w.pondHeartGfx = pondHeartGfx;
    personWareGfx = w.personWareGfx ?? personWareGfx;
    if (!w.personWareGfx) w.personWareGfx = personWareGfx;
  }

  function captureWorldGfx(w) {
    if (w.mode === 'overworld') {
      w.rooms = owRooms;
      w.stream = owStream;
    } else if (w.mode === 'dungeon') {
      w.rooms = uwRooms;
      w.stream = uwStream;
    }
    w.enemyGfx = enemyGfx;
    w.projGfx = projGfx;
    w.dropGfx = dropGfx;
    w.pondHeartGfx = pondHeartGfx;
    w.personWareGfx = personWareGfx;
  }

  function hideWorldSprites(w) {
    if (!w) return;
    for (const map of [w.enemyGfx, w.projGfx, w.dropGfx]) {
      if (!map) continue;
      for (const g of map.values()) {
        if (g) g.visible = false;
      }
    }
    for (const g of w.pondHeartGfx ?? []) {
      if (g) g.visible = false;
    }
    for (const g of w.personWareGfx?.values() ?? []) {
      if (g) g.visible = false;
    }
  }

  function hideAllPondHeartSprites() {
    for (const id of worlds.ids()) {
      for (const g of worlds.get(id)?.pondHeartGfx ?? []) {
        if (g) g.visible = false;
      }
    }
  }

  function pondHeartVisibleOnCamera() {
    for (const id of worlds.ids()) {
      for (const s of worlds.get(id)?.pondHeartGfx ?? []) {
        if (!s?.visible) continue;
        const vx = s.x + playField.x;
        const vy = s.y + playField.y;
        if (vx > -16 && vx < QUAD_W && vy > -16 && vy < QUAD_H) return true;
      }
    }
    return false;
  }

  function showWorldItemSprites(w) {
    if (!w) return;
    // Drops are shown by syncDropSprites so a sprite whose drop is gone
    // cannot come back as an un-collectable ghost.
    for (const map of [w.projGfx, w.personWareGfx]) {
      for (const g of map?.values() ?? []) {
        if (g) g.visible = true;
      }
    }
    // Fountain hearts live on the shared item layer. A cave/dungeon pass
    // that forgot to hide the overworld array parked the ring at ($78,$7D)
    // on that camera — around whoever was not at the fairy.
    if (w.mode === 'overworld') {
      for (const g of w.pondHeartGfx ?? []) {
        if (g) g.visible = true;
      }
    }
  }

  function presentWorldLayers() {
    hideAllPondHeartSprites();
    for (const id of worlds.ids()) {
      const w = worlds.get(id);
      if (w?.stream?.layer) w.stream.layer.visible = false;
      if (w && w !== focus.current?.world) hideWorldSprites(w);
    }
    if (owStream?.layer) owStream.layer.visible = mode === 'overworld';
    if (uwStream?.layer) uwStream.layer.visible = mode === 'dungeon';
    showWorldItemSprites(focus.current?.world);
  }

  function tearDownWorldGfx(w) {
    if (!w) return;
    for (const map of [w.enemyGfx, w.projGfx, w.dropGfx]) {
      if (!map) continue;
      for (const g of map.values()) {
        g.parent?.removeChild(g);
        g.destroy({ texture: false, textureSource: false });
      }
      map.clear();
    }
    for (const g of w.pondHeartGfx ?? []) {
      g.parent?.removeChild(g);
      g.destroy({ texture: false, textureSource: false });
    }
    w.pondHeartGfx = [];
    for (const g of w.personWareGfx?.values() ?? []) {
      g.parent?.removeChild(g);
      g.destroy({ children: true, texture: false, textureSource: false });
    }
    w.personWareGfx?.clear();
    if (!w.stream) return;
    if (w.stream === bootOwStream || w.stream === bootUwStream) {
      w.stream.clear();
      w.stream.layer.visible = false;
      return;
    }
    w.stream.destroy();
    w.stream = null;
    w.rooms = null;
  }

  function tearDownDroppedWorlds(dropped) {
    for (const w of dropped ?? []) tearDownWorldGfx(w);
    if (owStream?.layer?.destroyed) {
      owRooms = bootOwRooms;
      owStream = bootOwStream;
    }
    if (uwStream?.layer?.destroyed) {
      uwRooms = bootUwRooms;
      uwStream = bootUwStream;
    }
  }

  let candleRoom = createCandleStore();
  const focus = createPlayerFocus({ load: loadWorldContext, save: saveWorldContext });
  ensureWorldGfx(players[0].world);
  focus.adopt(players[0]);

  /**
   * The dock object this hero is riding. Physical state on the Link, not
   * the world: an ally on the pier must keep walking while you scroll.
   */
  function currentRaft() {
    const p = focus.current;
    if (p && !p.raftRide) p.raftRide = createRaftRide();
    return p?.raftRide ?? createRaftRide();
  }

  /** The in-flight raft in this place, whoever is on it — for the sprite and rebase. */
  function raftInWorld(world = focus.current?.world) {
    for (const p of activePlayers(players)) {
      if (p.world === world && p.raftRide?.active) return p.raftRide;
    }
    return null;
  }

  function clockWorldHere() {
    return focus.current?.world?.id ?? null;
  }

  function clockIsHere() {
    return Boolean(clockWorldId) && clockWorldId === clockWorldHere();
  }

  function endClockFreeze() {
    clearClockFreeze(inv, enemies);
    clockWorldId = null;
  }

  function endClockIfHere() {
    if (!clockIsHere()) return;
    endClockFreeze();
  }

  /**
   * Dungeon pack this hero is standing in — leftover cells included.
   * @param {object} p
   */
  function dungeonPackAt(p) {
    const live = p.world === focus.current?.world;
    const d = live ? dungeon : p.world?.dungeon;
    if (!d) return null;
    const occId = occupyingRoomIdOf(p);
    return d.levelData?.rooms?.find((r) => (r.roomId & 0xff) === occId) ?? d.room;
  }

  /** Occupying cell of this hero, leftover included. */
  function occupyingRoomIdOf(p) {
    const live = p?.world === focus.current?.world;
    const anchor = live ? roomId : (p?.world?.roomId ?? roomId);
    if ((p?.world?.mode ?? '') === 'dungeon') {
      return (p.uwOccRoomId ?? occupyingRoom(anchor, p.link.x, p.link.y).roomId) & 0xff;
    }
    return occupyingRoom(anchor, p.link.x, p.link.y).roomId & 0xff;
  }

  /**
   * Streaming-anchor room plus this hero's local pose in the cell they occupy.
   * Leftover coords stay on `link`; collision tests compare the unfolded pair.
   * @param {object} p
   */
  function heroOccupancy(p) {
    const live = p?.world === focus.current?.world;
    const worldRoomId = live ? roomId : (p?.world?.roomId ?? roomId);
    if ((p?.world?.mode ?? '') === 'dungeon') {
      const linkRoom = occupyingRoomIdOf(p);
      const local = localInRoom(worldRoomId, linkRoom, p.link.x, p.link.y);
      return { worldRoomId, linkRoom, localX: local.x, localY: local.y };
    }
    const occ = occupyingRoom(worldRoomId, p.link.x, p.link.y);
    return {
      worldRoomId,
      linkRoom: occ.roomId,
      localX: occ.x,
      localY: occ.y,
    };
  }

  /**
   * Dungeon pack for a cell id of this labyrinth (anchor or leftover).
   * @param {number} id
   */
  function dungeonPackForId(id) {
    const rid = id & 0xff;
    if ((dungeon?.room?.roomId & 0xff) === rid) return dungeon.room;
    return dungeon?.levelData?.rooms?.find((r) => (r.roomId & 0xff) === rid) ?? null;
  }

  function dungeonTakenRooms(d) {
    return [...(d?.takenItems ?? [])];
  }

  /**
   * Visible floor items in a world record (or the live closure fields).
   * @param {{ roomItems?: Map<number, object | null>, roomItem?: object | null, roomId?: number } | null | undefined} w
   */
  function listWorldFloorItems(w) {
    if (!w) return [];
    const seen = new Set();
    const out = [];
    const add = (id, item) => {
      if (!item || item.taken || !item.visible || seen.has(item)) return;
      seen.add(item);
      out.push({ roomId: id & 0xff, type: item.itemType, x: item.x, y: item.y });
    };
    for (const [id, item] of w.roomItems ?? []) add(id, item);
    add((w.roomId ?? 0) & 0xff, w.roomItem);
    return out;
  }

  function applyTakenOrReveal(item, id) {
    if (!item) return item;
    if (dungeon.takenItems.has(id)) {
      item.taken = true;
      item.visible = false;
      return item;
    }
    if (
      (dungeon.clearedRooms.has(id) || secretLatchRooms.has(id))
      && (item.effect === 7 || item.effect === 3)
      && !item.taken
    ) {
      item.visible = true;
    }
    return item;
  }

  /**
   * Floor item for this cell. Leftover `$35` keeps its heart when the
   * streaming anchor is `$45`.
   * @param {object | null | undefined} room
   */
  function ensureRoomItem(room) {
    if (!room || !dungeon) return null;
    const id = room.roomId & 0xff;
    if (roomItems.has(id)) {
      const existing = applyTakenOrReveal(roomItems.get(id) ?? null, id);
      if ((dungeon.room?.roomId & 0xff) === id) roomItem = existing;
      return existing;
    }
    const item = createRoomItem(
      room,
      { x: 0, y: 0 },
      itemPositionsFromLevel(dungeon.levelData?.itemPositions),
    );
    if (item && id !== (roomId & 0xff)) {
      const off = offsetFromRoom(id, item.homeX ?? item.x, item.homeY ?? item.y);
      item.x = off.x;
      item.y = off.y;
      item.homeX = off.x;
      item.homeY = off.y;
    }
    applyTakenOrReveal(item, id);
    roomItems.set(id, item);
    if ((dungeon.room?.roomId & 0xff) === id) roomItem = item;
    return item;
  }

  /** Occupied cells in this world, plus the streaming anchor. */
  function occupiedDungeonRoomIds() {
    const ids = new Set();
    if (dungeon?.room) ids.add(dungeon.room.roomId & 0xff);
    const here = focus.current?.world;
    for (const p of activePlayers(players)) {
      if (!p.world || p.world !== here) continue;
      if ((p.world.mode ?? mode) !== 'dungeon') continue;
      ids.add(occupyingRoomIdOf(p));
    }
    return ids;
  }

  function candleStoreFor(p) {
    const live = !p || p.world === focus.current?.world;
    return asCandleStore(live ? candleRoom : p.world?.candleRoom);
  }

  function candleStateAt(p) {
    return candleForRoom(candleStoreFor(p), occupyingRoomIdOf(p));
  }

  function roomOccupiedByOthers(roomIdWanted) {
    const id = roomIdWanted & 0xff;
    const here = focus.current?.world;
    return activePlayers(players).some((q) => {
      if (q === focus.current || q.world !== here) return false;
      return occupyingRoomIdOf(q) === id;
    });
  }

  /** NES reset of this cell unless an ally is already standing in it. */
  function enterCandleRoom(id, pack) {
    candleRoom = asCandleStore(candleRoom);
    beginCandleStay(candleRoom, id, pack, inv, roomOccupiedByOthers(id));
  }

  /** Whether this hero's occupying cell is currently dark. */
  function heroSeesDark(p) {
    if ((p?.world?.mode ?? '') !== 'dungeon') return false;
    return roomIsDark(dungeonPackAt(p), candleStateAt(p));
  }

  /**
   * An `await` yields the thread, and another player's frame — or a late
   * room load — may have moved the focus in the meantime. Anything that
   * resumes has to put the world back to the player who started the work.
   */
  function resumeAs(me) {
    if (me && focus.current !== me) focus.to(me);
  }

  /**
   * Labyrinth-entry holds only people standing in a labyrinth. Briefings
   * still hold every non-cave reader — they are the plot. Cave speech is
   * neither: NES lets you walk the shop while the text crawls, and a friend
   * walking into a labyrinth must not replace the old man you are reading.
   */
  function storyAudience(kind) {
    return storyReaders(activePlayers(players), kind);
  }

  function playerIsStoryReader(p) {
    return Boolean(
      storyPager?.holding()
      && p
      && p.world?.mode !== 'cave'
      && !storyPager.finished(p.index),
    );
  }

  function playerTextBox(p) {
    return textBoxes[p?.index ?? 0] ?? textBoxes[0];
  }

  function anyPrivateDialogue() {
    return textBoxes.some((box) => box.active);
  }

  function dialogueWho(p) {
    return {
      story: playerIsStoryReader(p),
      reader: playerTextBox(p).active,
      cave: p?.world?.mode === 'cave',
    };
  }

  /** Who may page the box. A cave visitor must still be able to turn the page. */
  function playerCanPageDialogue(p) {
    if (playerIsStoryReader(p)) return true;
    return dialogueAcceptsInput(playerTextBox(p).active, dialogueWho(p));
  }

  /** Who is frozen by the box. Cave speech crawls over walking. */
  function playerIsFrozenByDialogue(p) {
    if (playerIsStoryReader(p)) return true;
    return dialogueFreezesHero(playerTextBox(p).active, dialogueWho(p));
  }

  function menuUi(p) {
    return invUis[p?.index ?? 0] ?? invUis[0];
  }

  function menuOwner() {
    return activePlayers(players).find((q) => menuUi(q).open) ?? null;
  }

  function closePlayerMenu(p) {
    menuUi(p).close();
  }

  function closeAllMenus() {
    for (const ui of invUis) ui.close();
  }

  function refreshOpenMenus() {
    const here = focus.current;
    for (const p of activePlayers(players)) {
      const ui = menuUi(p);
      if (!ui.open) continue;
      focus.on(p, () => ui.refresh(p.inv, invView()));
    }
    if (here) focus.to(here);
  }

  function playerIsInMenu(p) {
    return menuUi(p).open;
  }

  function openTextBox(pages, opts) {
    talkingPlayer = focus.current;
    return playerTextBox(talkingPlayer).open(pages, opts);
  }

  function isPartyStoryKind(kind) {
    return kind === 'briefing' || kind === 'levelEntry';
  }

  /**
   * Solo keeps the one shared box (goldens). In company the plot uses
   * `storyBox` so a private cave/NPC line is not replaced.
   */
  function openStoryBeat(pages, kind, meta) {
    const party = activePlayers(players);
    if (party.length <= 1) {
      return openTextBox(pages, { kind, meta });
    }
    let readers = storyAudience(kind);
    if (!readers.length && focus.current) readers = [focus.current];
    if (!readers.length) return false;
    const opened = storyBox.open(pages, { kind, meta });
    if (opened) {
      storyPager = createStoryPager(
        readers.map((p) => p.index),
        storyBox.state.pages.length,
      );
    }
    return opened;
  }

  /**
   * Move a player to another place: a labyrinth, a cave, back to the overworld.
   *
   * The old world keeps what was in it — saved before the live copy is wiped —
   * and is then discarded if that player was the last one standing in it. At
   * one player that is always, which is why this reproduces `clearEnemies()`
   * exactly: leave the overworld and it dies behind you, come back and it is
   * built fresh with its foes respawned, the way the ROM does it. With two
   * players it is the difference between "you went into a cave" and "the
   * overworld stopped existing".
   *
   * The sprite teardown inside `clearEnemies()` still has to run: those belong
   * to the view, which is about to start showing somewhere else entirely.
   *
   * @param {object} p
   * @param {string} id from `worldRegistry.js`
   * @param {object} [opts] mode, for a world being entered for the first time
   */
  function worldOccupiedByOthers(worldOrId, except) {
    const id = typeof worldOrId === 'string' ? worldOrId : worldOrId?.id;
    if (!id) return false;
    return activePlayers(players).some((q) => q !== except && q.world?.id === id);
  }

  /** Someone is still looking at the shared UW stream — a labyrinth or a cellar. */
  function dungeonOccupiedByOthers(except) {
    return activePlayers(players).some((q) => {
      if (q === except) return false;
      const id = String(q.world?.id ?? '');
      return id.startsWith('dungeon:') || id.startsWith('cellar:');
    });
  }

  /**
   * Rooms other cameras in *this* labyrinth are still standing in. Each
   * dungeon world has its own stream, so leftover cells in L1 must not keep
   * L4's `$73` loaded.
   */
  function occupiedUnderworldRoomIds() {
    /** @type {number[]} */
    const ids = [];
    const here = focus.current?.world;
    for (const p of activePlayers(players)) {
      if (p.world !== here) continue;
      const id = String(p.world?.id ?? '');
      if (!id.startsWith('dungeon:') && !id.startsWith('cellar:')) continue;
      if (p.world?.roomId != null) ids.push(p.world.roomId & 0xff);
      if (p.uwOccRoomId != null) ids.push(p.uwOccRoomId & 0xff);
      // Feet, not only the latch: a leftover pose two rooms away must stream
      // its grid before the first walk, or they clip through OPEN_UW_GRID.
      const anchor = p.world === focus.current?.world ? roomId : (p.world?.roomId ?? roomId);
      ids.push(occupyingRoom(anchor, p.link.x, p.link.y).roomId & 0xff);
    }
    return ids;
  }

  /**
   * Tile grid for the cell this hero occupies. Leftover rooms two screens from
   * the streaming anchor used to fall through to OPEN_UW_GRID and walk through
   * walls until the stream caught up.
   * @param {number} occId
   */
  function uwOccupyingTileGrid(occId) {
    return uwRooms.tileGrid(occId)
      ?? ((occId & 0xff) === (roomId & 0xff) ? dungeonTileGrid : null);
  }

  /**
   * Occupying-cell walk opts, including the sliding push-block sprite.
   * @param {object | null | undefined} occRoom
   * @param {number[][] | null} occGrid
   * @param {number} inputMask
   * @param {boolean} sameAnchor
   */
  function dungeonHeroWalkOpts(occRoom, occGrid, inputMask, sameAnchor) {
    const base = dungeonTileOpts(inv);
    const blockOpts = pushBlockWalkOpts(ensurePushBlock(occRoom));
    if (sameAnchor && occGrid) {
      return {
        ...prepareLadderTileOpts(occGrid, inputMask, 'dungeon', base, false),
        ...blockOpts,
      };
    }
    return { ...base, ...blockOpts };
  }

  function movePlayerToWorld(p, id, opts = {}) {
    if (p.world?.id === id) return p.world;
    // Live `enemies` / sprite maps are whoever holds the focus. Death
    // regroup used to run this while player one was in a cave, so it
    // wrote the cave onto the labyrinth record and left the Stalfos
    // sprite on the shared playfield.
    if (focus.current !== p) {
      return focus.on(p, () => movePlayerToWorld(p, id, opts));
    }
    const from = p.world;
    saveWorldContext(p);
    // Sprites and the live arrays belong to the place being left. Tear them
    // down only when nobody else is still standing there — otherwise the
    // overworld a friend is walking would vanish the moment you ducked into
    // a cave.
    if (!worldOccupiedByOthers(from, p)) clearEnemies();
    p.world = worlds.enter(id, opts);
    ensureWorldGfx(p.world);
    loadWorldContext(p);
    tearDownDroppedWorlds(worlds.prune(players));
    return p.world;
  }

  /**
   * Everyone who was standing with this player goes where they went.
   *
   * One camera means one place, so a hero left behind in the world the others
   * walked out of is invisible and unplayable — and the world they are still
   * standing in cannot be pruned, so its foes never respawn on the way back.
   * The party travels together until each player has a view of their own.
   *
   * Their record is enough: nobody else's context is live, and the world they
   * are joining holds the foes and the room. Where they land is not known
   * yet — the transition sets the leader's spawn after this — so they rally
   * beside whoever they followed on the next frame.
   *
   * @param {object} lead the player who opened the door
   * @param {object | null} from the world they all just left
   */
  function bringPartyAlong(lead, from) {
    for (const p of activePlayers(players)) {
      if (p === lead || p.world !== from) continue;
      p.world = lead.world;
      p.rally = true;
    }
  }

  /** Put anyone who followed someone through a door back at their side. */
  function rallyFollowers() {
    const lead = players[0];
    for (const p of activePlayers(players)) {
      if (!p.rally || p === lead) continue;
      p.rally = false;
      // Exactly on them, not beside them: a tile to the left of a labyrinth
      // doorway is a wall, and the two heroes walk apart on the first step
      // anyway.
      p.link.x = lead.link.x;
      p.link.y = lead.link.y;
      p.link.dir = lead.link.dir;
      p.link.posFrac = 0;
      p.link.gridOffset = 0;
      p.link.moving = false;
    }
  }

  /** @type {Sprite | null} */
  let pushGfx = null;
  /** @type {Texture | null} */
  let pushBlockTex = null;
  let busy = false;
  /**
   * A load freezes only the hero who started it. The global flag is the solo
   * (and debug) view of the same thing — four players must not stop walking
   * because someone else opened a cave.
   * @param {ReturnType<typeof createPlayer> | null | undefined} [p]
   */
  function beginBusy(p = focus.current) {
    if (p) p.busy = true;
    if (activePlayers(players).length <= 1) busy = true;
  }
  /**
   * @param {ReturnType<typeof createPlayer> | null | undefined} [p]
   */
  function endBusy(p = focus.current) {
    if (p) p.busy = false;
    if (activePlayers(players).length <= 1 || !activePlayers(players).some((q) => q.busy)) {
      busy = false;
    }
  }
  /**
   * @param {ReturnType<typeof createPlayer> | null | undefined} [p]
   */
  function heroIsBusy(p = focus.current) {
    return Boolean(p?.busy) || (activePlayers(players).length <= 1 && busy);
  }
  function partyBusy() {
    return busy || activePlayers(players).some((p) => p.busy);
  }
  /** Invalidates in-flight overworld loads so they cannot restart OW music mid-dungeon/death. */
  let worldLoadGen = 0;
  /**
   * `UndergroundExitType` / cave-mouth latch belong to the hero, not the
   * overworld. Player one walking into the sword cave used to set a shared
   * latch that swallowed player two's Level 1 stairs until they left a warp
   * they were already standing on.
   */
  function setUndergroundExitType(value) {
    const p = focus.current;
    if (p) p.undergroundExitType = value;
  }
  function currentUndergroundExitType() {
    return focus.current?.undergroundExitType ?? 0;
  }
  /** Prevents re-triggering UW stairs while still standing on them. */
  let stairsLatch = false;

  /**
   * Cave/dungeon mouth under this hero's feet — leftover $37 must not inherit
   * the start screen's sword-cave id from the streaming anchor.
   */
  function occupyingOwPack() {
    const occ = occupyingRoom(roomId, link.x, link.y);
    const id = occ.roomId & 0xff;
    const tileGrid = owRooms.tileGrid(id);
    const pack = owRooms.pack(id);
    if (tileGrid && pack) {
      return {
        roomId: id,
        tileGrid,
        attrs: pack.attrs ?? null,
        secrets: pack.secrets ?? [],
      };
    }
    if (id === (roomId & 0xff) && screen) {
      return {
        roomId: id,
        tileGrid: screen.tileGrid,
        attrs: screen.attrs ?? null,
        secrets: screen.secrets ?? [],
      };
    }
    return { roomId: id, tileGrid: null, attrs: null, secrets: [] };
  }

  function clearRoomItemSprites() {
    for (const spr of roomItemSprites.values()) {
      itemLayer.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
    }
    roomItemSprites.clear();
  }

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
    endClockIfHere(); // InvClock clears on room / screen change
    clearRoomItemSprites();
    roomItem = null;
    roomItems = new Map();
    secretLatchRooms = new Set();
    boomerangs = [];
    enemyBooms = [];
    bait = null;
    dungeonTileGrid = null;
    floorTiles = null;
    pushBlock = null;
    pushBlocks = new Map();
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
        && !rectFullyOffEveryCamera(e, sessionCameras(), 0)
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
      g.visible = true;
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
    /** @type {Map<number, NonNullable<typeof roomItem>>} */
    const wanted = new Map();
    const add = (id, item) => {
      if (!item || item.taken || !item.visible) return;
      wanted.set(id & 0xff, item);
    };
    for (const [id, item] of roomItems) add(id, item);
    add(roomId, roomItem);

    for (const [id, spr] of [...roomItemSprites.entries()]) {
      if (wanted.has(id)) continue;
      itemLayer.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
      roomItemSprites.delete(id);
    }
    for (const [id, item] of wanted) {
      const pal = itemDrawPalette(item.itemType, dropFrame);
      const drawn = items.itemTexture(roomItemChrTile(item.itemType), pal);
      let spr = roomItemSprites.get(id);
      if (!spr) {
        spr = new Sprite(drawn.texture);
        itemLayer.addChild(spr);
        roomItemSprites.set(id, spr);
      } else {
        spr.texture = drawn.texture;
      }
      spr.x = item.x + (drawn.narrow ? 4 : 0);
      spr.y = item.y;
      spr.visible = true;
    }
  }

  /** Begin the TakeItem pose: item held $10 px above Link. */
  function startItemLift(itemType) {
    liftItemType = itemType;
    const me = focus.current;
    if (me) me.liftItemType = itemType;
    syncItemLiftSprite();
  }

  function currentLiftItemType() {
    const me = focus.current;
    if (me && 'liftItemType' in me) return me.liftItemType;
    return liftItemType;
  }

  function itemLiftActive() {
    return (
      currentLiftItemType() != null
      && (
        (inv.itemLiftTimer ?? 0) > 0
        || holdingTriforceLift
        || triforceCeremonyActive(triforceCeremony)
      )
    );
  }

  function syncItemLiftSprite() {
    const type = currentLiftItemType();
    const active = itemLiftActive();
    if (!active) {
      if (liftSprite) liftSprite.visible = false;
      const me = focus.current;
      if (
        me
        && (inv.itemLiftTimer ?? 0) <= 0
        && !holdingTriforceLift
        && !triforceCeremonyActive(triforceCeremony)
      ) {
        me.liftItemType = null;
      }
      return;
    }
    const drawn = items.itemTexture(
      roomItemChrTile(type),
      itemDrawPalette(type, dropFrame),
    );
    if (!liftSprite) {
      liftSprite = new Sprite(drawn.texture);
      itemLayer.addChild(liftSprite);
    } else {
      liftSprite.texture = drawn.texture;
    }
    liftSprite.visible = true;
    liftSprite.x = link.x + (drawn.narrow ? 4 : 0);
    liftSprite.y = link.y - 0x10;
  }

  function enemyBounds() {
    if (mode === 'overworld' || mode === 'dungeon') {
      return chaseBoundsForCamera(cam.camLocalX, cam.camLocalY);
    }
    return OW_ENEMY_BOUNDS;
  }

  /**
   * Dungeon foes stay in their home cell. Overworld wanderers may chase
   * across a seam via the camera pad — that pad is what walked Goriyas
   * through dungeon doors.
   * @param {{ objType: number, homeRoomId?: number | null }} e
   */
  function enemyBoundsFor(e) {
    return enemyMotionBounds(mode, e, roomId, cam);
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
        fx.playSfx('bomb');
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
            fx.playSfx('door');
            setStatus(`Bombed ${opened.join('/')} wall open`);
          }
        }
        if (mode === 'overworld') {
          applyOwSecretReveal('bomb', b.x, b.y);
        }
        const held = focus.current;
        for (const p of activePlayers(players)) {
          if (!bombHurtsHero(b, p)) continue;
          focus.on(p, () => hurtLinkFrom(0, BOMB_LINK_DAMAGE));
        }
        if (held) focus.to(held);
      }
    }
  }

  /**
   * Pose this hero's blade from their own swing, not the swapped `swordSprite`.
   * Split-screen renders each view in turn and used to latch `visible` off of
   * everyone except the viewer, so player two's sword never came back on.
   * @param {object} p
   */
  function drawPlayerSword(p) {
    const spr = p?.gfx?.sword;
    if (!spr) return;
    const pos = p.active ? swordDrawPos(p.sword, p.link.x, p.link.y) : null;
    if (!pos) {
      spr.visible = false;
      return;
    }
    const ow = (p.world?.mode ?? mode) === 'overworld';
    spr.texture = isRodSwing(p.sword)
      ? items.rodTexture(DIR.UP)
      : items.swordTexture(DIR.UP, p.inv?.sword ?? 1);
    spr.anchor.set(0.5, 0.5);
    spr.x = pos.x + 8;
    spr.y = pos.y + 8 + (ow ? 2 : 0);
    spr.rotation = swordSpriteRotation(pos.angle);
    spr.visible = true;
  }

  function drawSwordBlade() {
    drawPlayerSword(focus.current ?? players[0]);
  }

  function continueAfterDeath() {
    for (const p of activePlayers(players)) {
      p.inv.dead = false;
      p.inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, p.inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
      p.inv.invuln = 0;
      p.inv.shovePixels = 0;
    }
    deathUi.hide();
    adoptSessionLayout();
    // Cut Tune1 $40 (game over) before the world song starts again.
    fx.stopSfx();

    // NES: die in a dungeon → continue at that dungeon's entrance; OW → start screen.
    if (mode === 'dungeon' && dungeon) {
      snapshotDungeonProgress();
      const levelId = dungeon.level;
      const fromRoomId = dungeon.fromRoomId;
      const fromAttrs = dungeon.fromAttrs ?? {};
      void (async () => {
        const me = focus.current;
        await enterLevel(levelId, { fromRoomId, fromAttrs });
        resumeAs(me);
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
      mode === 'dungeon' && dungeon?.levelData && isCellarRoomId(roomId, dungeon.levelData),
    );
  }

  /**
   * Cameras looking at this place. A friend in a labyrinth has a dungeon
   * camera whose numbers are not overworld rooms — mixing them in streams
   * Moblin screens onto the start map and lets those foes chase a ghost.
   */
  function sessionCameras() {
    const here = focus.current?.world;
    return activePlayers(players)
      .filter((p) => !here || p.world === here)
      .map((p) => p.cam);
  }

  function applyPlayCamera() {
    const solution = solvePlayCamera({
      mode,
      roomId,
      linkX: link.x,
      linkY: link.y,
      pinned: inUwCellar(),
    });
    if (solution.tracks) adoptCameraSolution(cam, solution);
    playField.x = solution.fieldX;
    playField.y = solution.fieldY;
    if (solution.layout === 'overworld') owStream.layout(roomId);
    if (solution.layout === 'dungeon') {
      uwStream.layout(roomId);
      uwDoorFrames.layout(roomId);
    }
  }

  /**
   * The inventory panel and the world-slide that reveals it belong to this
   * hero. Everyone else keeps a normal play picture — and may have a panel
   * of their own in their quadrant.
   */
  function applyMenuChrome(p) {
    const ui = menuUi(p);
    for (const other of invUis) other.root.visible = false;
    const show = ui.open;
    ui.root.visible = show;
    if (show) {
      world.y = ui.worldSlideY();
      hud.root.y = Math.round(ui.hudDockT() * (QUAD_H - HUD_HEIGHT));
    } else {
      world.y = 0;
      hud.root.y = 0;
    }
  }

  function lookingRoomId() {
    if (mode === 'cave') return caveReturn?.roomId ?? roomId;
    return occupyingRoom(roomId, link.x, link.y).roomId;
  }

  /**
   * Point the playfield at this hero and, in company, draw that picture into
   * their quadrant. Alone this is just `applyPlayCamera()` — no extra pass,
   * no texture, the goldens stay on the same pixels.
   */
  function presentViews() {
    if (playerCount <= 1) {
      if (mode === 'overworld' || mode === 'dungeon') applyPlayCamera();
      else {
        playField.x = 0;
        playField.y = 0;
      }
      showCaveSceneFor(focus.current ?? players[0]);
      return;
    }
    for (const p of activePlayers(players)) {
      focus.on(p, () => {
        // One playfield, many places: show the layers that belong to this
        // hero's world and hide the rest, so a cave and the overworld can
        // share a scene graph without painting over each other.
        presentWorldLayers();
        doorFrameLayer.visible = mode === 'dungeon';
        showCaveSceneFor(p);
        if (bg) bg.visible = mode === 'overworld';
        if (mode === 'overworld' || mode === 'dungeon') applyPlayCamera();
        else {
          playField.x = 0;
          playField.y = 0;
        }
        syncDarkOverlay();
        applyMenuChrome(p);
        if (stubLabel) {
          const showStub = mode === 'dungeon' && dungeon?.room;
          stubLabel.visible = showStub;
          if (showStub) {
            const occ = occupyingRoom(roomId, link.x, link.y);
            const pack =
              dungeon.levelData?.rooms?.find((r) => (r.roomId & 0xff) === (occ.roomId & 0xff))
              ?? dungeon.room;
            stubLabel.text = dungeonStubText(pack);
          }
        }
        // Bombs, flames and booms live on the shared playfield. Draw the
        // set that belongs to this view's world, or player two's bomb sits
        // in an array this pass never looks at.
        syncEnemySprites();
        drawBombs();
        syncToolSprites();
        syncRaftSprite();
        syncLadderSprite();
        syncWhirlwindSprite();
        syncItemLiftSprite();
        syncDropSprites();
        refreshHud();
        hud.pulseMap(uiFrame, currentMapMarks(), currentDungeonMapMarks(), {
          roomId: lookingRoomId(),
          mode,
          dungeon,
        });
        if (p.view) {
          p.view.raftVisible = Boolean(raftGfx?.visible);
          p.view.ladderVisible = Boolean(ladderGfx?.visible);
          p.view.whirlVisible = Boolean(whirlGfx?.visible);
          p.view.baitVisible = Boolean(baitGfx?.visible);
          p.view.liftVisible = Boolean(liftSprite?.visible);
          p.view.pondVisible = pondHeartVisibleOnCamera();
          p.view.boomVisible = boomSprites.filter((s) => s.visible).length;
          p.view.bombCount = fxLayer.children.length;
          const bar = hud.probe();
          p.view.hudMap = bar.map;
          p.view.hudCounters = bar.counters;
          p.view.hudMode = bar.mode;
        }
        for (const other of players) {
          const here = other.active && other.world === p.world;
          if (other.gfx?.link && (!deathUi.visible || other !== p)) {
            other.gfx.link.visible = here;
          }
          if (other.gfx?.sword) {
            if (here) drawPlayerSword(other);
            else other.gfx.sword.visible = false;
          }
          if (other.gfx?.tag) other.gfx.tag.visible = here && other !== p;
        }
        // A private conversation is only in the reader's quadrant. A
        // labyrinth-entry beat is only in labyrinth views; a briefing is
        // in every non-cave view. Each reader sees their own page.
        const showStory = playerIsStoryReader(p) && storyBox.active;
        if (showStory) {
          storyBox.seekPage(storyPager.pageOf(p.index));
          storyBox.root.visible = true;
        } else {
          storyBox.root.visible = false;
        }
        for (const box of textBoxes) box.root.visible = false;
        const mine = playerTextBox(p);
        mine.root.visible =
          !showStory
          && dialogueVisibleFor(mine.active, {
            story: false,
            reader: true,
          });
        if (p.view) {
          if (showStory) {
            p.view.dialogueText = storyBox.visibleText;
            p.view.dialogueKind = storyBox.kind;
          } else if (mine.root.visible) {
            p.view.dialogueText = mine.visibleText;
            p.view.dialogueKind = mine.kind;
          } else {
            p.view.dialogueText = '';
            p.view.dialogueKind = null;
          }
          p.view.stubText = stubLabel?.visible ? stubLabel.text : '';
        }
        if (p.view?.rt) {
          app.renderer.render({
            container: frame,
            target: p.view.rt,
            clear: true,
          });
        }
      });
    }
    focus.to(players[0]);
    for (const box of textBoxes) box.root.visible = false;
    textBox.root.visible = textBox.active;
    storyBox.root.visible = storyBox.active && playerCount <= 1;
    applyMenuChrome(menuOwner() ?? players[0]);
    if (stubLabel && mode === 'dungeon' && dungeon?.room) {
      stubLabel.text = dungeonStubText(dungeon.room);
    }
  }

  /**
   * @param {object} [base]
   */
  function continuousTileOpts(base = {}) {
    const grids = mode === 'overworld' ? owRooms.gridMap() : uwRooms.gridMap();
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

  function worldEntitiesHere() {
    const here = focus.current?.world;
    /** @type {({ x?: number, y?: number } | null | undefined)[]} */
    const objs = [
      // Only heroes in this place. A friend still on the overworld must not
      // slide when someone walks through a dungeon door.
      ...activePlayers(players).filter((p) => p.world === here).map((p) => p.link),
      ...enemies,
      ...projectiles,
      ...drops,
      ...boomerangs,
      bait,
      ...bombs,
      ...flames,
      ...enemyBooms,
    ];
    if (ladderObj) objs.push(ladderObj);
    const ride = raftInWorld(here);
    if (ride) objs.push(ride);
    if (whirlwind) objs.push(whirlwind);
    const floorItems = [...roomItems.values()].filter(Boolean);
    if (roomItem && !floorItems.includes(roomItem)) floorItems.push(roomItem);
    objs.push(...floorItems);
    return objs;
  }

  /**
   * @param {number} dir
   */
  function rebaseEntities(dir) {
    const { dx, dy } = rebaseDelta(dir);
    shiftPositions(worldEntitiesHere(), dx, dy);
  }

  /**
   * Make `nextRoomId` the streaming anchor. One step from the current
   * room is {@link rebaseEntities}; a hero leaving a cell they occupy
   * while a friend holds the anchor needs the full origin shift.
   * @param {number} nextRoomId
   */
  function rebaseToRoom(nextRoomId) {
    const from = roomId & 0xff;
    const to = nextRoomId & 0xff;
    if (from === to) return;
    const { dx, dy } = rebaseDeltaToRoom(from, to);
    shiftPositions(worldEntitiesHere(), dx, dy);
  }

  /**
   * After a co-op regroup, the party is standing in the ally's cell. If that
   * cell is leftover, nobody can claim the stream (`canClaimAnchorCross` is
   * false past the seam lip) and the next room never loads — look-ahead into
   * a missing grid is solid, which is "can't walk off the right of this screen".
   * @param {object} p
   */
  function adoptOccupyingOwAnchor(p) {
    if (mode !== 'overworld' || !p?.link) return;
    const dest = regroupAnchorRoomId(roomId, p);
    if (dest == null) return;
    rebaseToRoom(dest);
    softEnterOwRoom(dest, p.link.dir || DIR.DOWN);
    applyPlayCamera();
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

  /**
   * True for the first player to reach this piece of shared work in the world
   * they are standing in, this frame.
   *
   * A place's enemies belong to the place, not to whoever is looking at it, so
   * four players in one room must not step them four times. Rather than hoist
   * the shared work out of the per-player step — which would reorder it
   * against the movement and seam handling it is carefully sequenced with —
   * it stays where it is and runs for whoever gets there first.
   *
   * @param {string} key
   */
  function firstInWorldThisFrame(key) {
    const w = focus.current?.world;
    if (!w) return true;
    const seen = w.steppedAt ?? (w.steppedAt = {});
    if (seen[key] === simTick) return false;
    seen[key] = simTick;
    return true;
  }

  function cullStreamEnemies() {
    if (mode !== 'overworld' && mode !== 'dungeon') return;
    if (!firstInWorldThisFrame('cull')) return;
    const { kept } = cullOffscreenEnemies(enemies, cam.camLocalX, cam.camLocalY, 8, {
      worldCamX: cam.worldCamX,
      worldCamY: cam.worldCamY,
      cameras: sessionCameras(),
      // Capture slide walks into the wall / off the lip — never despawn mid-drag.
      keep: (e) => wallmasterIsCapturing(e),
    });
    enemies = kept;
    releaseSpawnLatch(spawnedRooms, spawnedRooms, cam.worldCamX, cam.worldCamY, roomId, {
      enemies,
      spawnClaims,
      cameras: sessionCameras(),
    });
  }

  /** This hero is mid Wallmaster drag (halted; position owned by the hand). */
  function linkHeldByWallmaster() {
    const me = focus.current?.index ?? 0;
    return enemies.some((e) => wallmasterHoldsPlayer(e, me));
  }

  /** Keep the caught hero glued to the closed hand after shove/solid systems run. */
  function pinWallmasterCapture() {
    const me = focus.current?.index ?? 0;
    for (const e of enemies) {
      if (!wallmasterHoldsPlayer(e, me)) continue;
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
    const room = owRooms.get(id & 0xff);
    if (!room?.pack || !room.tileGrid) {
      screen = null;
      bg = null;
      return false;
    }
    screen = { ...room.pack, tileGrid: room.tileGrid };
    bg = owStream.get(id & 0xff)?.sprite ?? null;
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
  /** Heart containers raise every hero's max; the finder was already filled. */
  function onGrantedItem(itemType) {
    if (itemType === 0x1a) shareHeartContainer(players, focus.current);
  }

  function tryPickupOwRoomItem() {
    const picked = tryPickupRoomItem(roomItem, link.x, link.y);
    if (picked == null) return;
    owItemsTaken.add(roomId & 0xff);
    const label = grantRoomItem(inv, picked);
    onGrantedItem(picked);
    refreshHud();
    refreshOpenMenus();
    fx.playSfx('item_taken');
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
    endClockIfHere();
    roomId = nextRoomId & 0xff;
    // Per-room fixtures are re-derived every time the binding lands, so a room
    // that was still streaming on the first pass still gets its pond state.
    const applyRoomState = () => {
      candleRoom = asCandleStore(candleRoom);
      beginCandleStay(candleRoom, roomId, null, inv, false);
      pondSecret = restorePondSecret(owSecretsRevealed, roomId);
      owWaterRgb = OW_WATER_RGB;
      syncOwRoomItem();
    };
    const bound = bindOwScreenFromStream(roomId);
    applyRoomState();
    if (bound) spawnOwRoomEnemies(roomId, dir);
    const me = focus.current;
    void ensureOwNeighbors()
      .then(() => {
        resumeAs(me);
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
    const room = owRooms.get(mapIndex & 0xff);
    return Boolean(room?.pack && room?.tileGrid && owStream.get(mapIndex)?.sprite);
  }

  /**
   * Prefetch one OW room (and its neighborhood) without changing the anchor.
   * Used when a raft dock approach would otherwise soft-enter an unbound room,
   * null `screen`, and freeze the step loop on a black playfield.
   * @param {number} mapIndex
   */
  function prefetchOwRoom(mapIndex) {
    const id = mapIndex & 0xff;
    const me = focus.current;
    void ensureOwRoom(id)
      .then(() => {
        resumeAs(me);
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
  /**
   * Room loads still in flight.
   *
   * A room's tiles arrive over `fetch`, so which frame it lands on depends on
   * I/O timing — two runs of the same walk can stream a room one frame apart.
   * That is invisible in play and fatal to a golden hash, so the harness
   * drains this to zero at each frame boundary (`zeldaDebug.pendingLoads()`).
   */
  let pendingRoomLoads = 0;

  /**
   * @param {number} mapIndex
   */
  async function ensureOwRoom(mapIndex) {
    pendingRoomLoads += 1;
    try {
      return await loadOwRoom(mapIndex);
    } finally {
      pendingRoomLoads -= 1;
    }
  }

  /**
   * @param {number} rid
   * @param {boolean} [fogged]
   */
  async function ensureUwRoom(rid, fogged = false) {
    pendingRoomLoads += 1;
    try {
      return await loadUwRoom(rid, fogged);
    } finally {
      pendingRoomLoads -= 1;
    }
  }

  async function loadOwRoom(mapIndex) {
    const id = mapIndex & 0xff;
    const me = focus.current;
    // Capture the overworld stream: this yield's continuation often runs
    // while an ally's cave holds the focus, and the live `owStream` alias
    // is *not* rebound for caves.
    const stream = owStream;
    const rooms = owRooms;
    const existing = stream.get(id);
    if (rooms.tileGrid(id) && existing?.sprite) return existing;

    let pack = await fetchJson(screenUrl(id));
    resumeAs(me);
    if (inv.quest === 2) {
      if (quest2NeedsLayoutOverlay(id)) {
        try {
          const overlay = await fetchJson(screenUrlQ2(id));
          resumeAs(me);
          pack = { ...pack, ...overlay, mapIndex: id };
        } catch {
          resumeAs(me);
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
      if (!owSecretsRevealed.has(key)) continue;
      if (secretAction(secret) === 'push') {
        const origin = restorePushedOriginFloor(tileGrid, secret);
        if (origin) bgPatches.push(origin);
        continue;
      }
      revealSecretTiles(tileGrid, secret.row, secret.col, secret.marker);
      bgPatches.push({
        col: secret.col,
        row: secret.row,
        tiles: tilesForSecretMarker(secret.marker),
      });
    }
    for (const p of restorePushDests(tileGrid, id, owSecretsRevealed)) {
      bgPatches.push(p);
    }
    for (const secret of pack.secrets ?? []) {
      const key = `${id}:${secret.row}:${secret.col}`;
      if (!owSecretsRevealed.has(key) || secretAction(secret) !== 'push') continue;
      const stairs = restorePushedStairs(tileGrid, pack.attrs);
      if (stairs) bgPatches.push(stairs);
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
    resumeAs(me);
    tex.source.scaleMode = 'nearest';
    const entry = stream.upsert(id, tex, { tileGrid, pack, fogged: false });
    applyBurnTreeColorHints(entry?.sprite ?? null, pack, id);
    if (mode === 'overworld') bg = stream.get(roomId)?.sprite ?? bg;
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
    const me = focus.current;
    const stream = owStream;
    const gen = ++streamFetchGen;
    applyPlayCamera();
    const ids = roomsForCameras(sessionCameras(), { margin: 1 });
    const anchor = roomId;
    for (const id of ids) {
      if (gen !== streamFetchGen) return;
      await ensureOwRoom(id);
      resumeAs(me);
    }
    if (gen !== streamFetchGen) return;
    stream.pruneTo(ids);
    stream.layout(anchor);
    resumeAs(me);
    if (mode === 'overworld' && (roomId & 0xff) === (anchor & 0xff)) {
      bg = stream.get(roomId)?.sprite ?? bg;
    }
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
    const room = owRooms.get(id);
    if (!room?.pack) return;
    const spawned = spawnOverworldEnemies(room.pack.attrs, dir);
    tagEnemyHomeRoom(spawned, id);
    // One living foe per ROM spawn point — blocks seam-edge double waves.
    const fresh = filterUnoccupiedSpawnPoints(spawned, enemies, spawnClaims);
    // Eject in the room's local space before rebasing into the anchor frame.
    if (room.tileGrid) ejectEnemiesFromSolid(fresh, room.tileGrid);
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
        && !rectFullyOffEveryCamera(e, sessionCameras(), 0)
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
    const candidates = roomsForCameras(sessionCameras(), { margin: 0 });
    const need = roomsNeedingSpawn({
      candidateRooms: candidates,
      currentRoomId: roomId,
      visited: new Set(candidates),
      spawnedRooms,
      clearedRooms: new Set(),
      worldCamX: cam.worldCamX,
      worldCamY: cam.worldCamY,
      cameras: sessionCameras(),
    });
    for (const id of need) spawnOwRoomEnemies(id, dir);
  }

  /**
   * @param {number} rid
   * @param {boolean} [fogged]
   */
  async function loadUwRoom(rid, fogged = false) {
    if (!dungeon?.levelData) return null;
    const id = rid & 0xff;
    const existing = uwStream.get(id);
    if (uwRooms.tileGrid(id) && (existing?.sprite || fogged)) {
      uwStream.setFog(id, fogged);
      // Keep frame visibility in sync when only fog toggles on a cached room.
      const frame = uwDoorFrames.get(id);
      if (frame?.sprite) frame.sprite.visible = !fogged;
      if (frame?.fog) frame.fog.visible = false;
      // Cracks are omitted while fogged; rebuild when the room becomes visible.
      syncUwBombCracks(existing, uwRooms.pack(id), fogged);
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
    applyPushBlockRoomArt(id);
    return entry;
  }

  async function ensureUwNeighbors() {
    if (!dungeon) return;
    const gen = ++streamFetchGen;
    applyPlayCamera();
    // Cellars sit on the map grid but are stairs-only — never stream them as
    // neighbors, and never stream map-adjacent top-down rooms while inside one.
    const ids = streamableUwRooms(
      roomsForCameras(sessionCameras(), { margin: 1, cols: 16, rows: 8 }),
      roomId,
      dungeon.levelData,
    );
    const keep = [...new Set([...ids, ...occupiedUnderworldRoomIds()].map((id) => id & 0xff))];
    const fog = foggedRooms(ids, dungeon.visitedRooms, roomId);
    for (const id of keep) {
      if (gen !== streamFetchGen) return;
      await ensureUwRoom(id, fog.has(id));
    }
    if (gen !== streamFetchGen) return;
    uwStream.pruneTo(keep);
    uwDoorFrames.pruneTo(keep);
    for (const id of keep) {
      const fogged = fog.has(id) && id !== roomId;
      uwStream.setFog(id, fogged);
      const frame = uwDoorFrames.get(id);
      if (frame?.sprite) frame.sprite.visible = !fogged;
      if (frame?.fog) frame.fog.visible = false;
      syncUwBombCracks(uwStream.get(id), uwRooms.pack(id), fogged);
    }
    uwStream.layout(roomId);
    uwDoorFrames.layout(roomId);
    syncShutterOverlays();
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
    const room = uwRooms.pack(id) ?? dungeon.levelData.rooms.find((r) => r.roomId === id);
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
      const sides = shutterSidesNeedingOpen(dungeon.doorState, room);
      dungeon.clearedRooms.add(id);
      secretLatchRooms.add(id);
      beginAnimatedShutterOpen(room, sides);
    }
    tagEnemyHomeRoom(spawned, id);
    const fresh = filterUnoccupiedSpawnPoints(spawned, enemies, spawnClaims);
    markEnemiesAwaitingView(fresh);
    const grid = uwRooms.tileGrid(id) ?? dungeonTileGrid;
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
        && !rectFullyOffEveryCamera(e, sessionCameras(), 0)
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
      roomsForCameras(sessionCameras(), {
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
      worldCamX: cam.worldCamX,
      worldCamY: cam.worldCamY,
      cameras: sessionCameras(),
    });
    for (const id of need) spawnUwRoomEnemies(id, dir);
  }

  /**
   * Soft room enter after a passable-door seam cross. Caller already rebased
   * entities and assigned Link's continuous seam coords (no lip snap).
   * @param {{ nextRoomId: number, dir: number, unlocked?: boolean }} exit
   */
  async function softEnterDungeonRoom(exit) {
    const me = focus.current;
    if (!dungeon?.levelData || heroIsBusy() || inv.dead) return;
    const level = dungeon.levelData;
    const room = level.rooms.find((r) => r.roomId === exit.nextRoomId);
    if (!room) {
      void loadDungeonRoom(exit.nextRoomId, exit.dir);
      return;
    }
    beginBusy(me);
    try {
      if (exit.unlocked) {
        refreshDungeonRoomVisual();
        refreshHud();
        fx.playSfx('door');
        setStatus(`Unlocked door (${inv.keys} keys left)`);
      }

      endClockIfHere();
      roomId = exit.nextRoomId;
      personDialogueForRoom = null;
      if (me) me.personDialogueForRoom = null;
      dungeon.room = room;
      dungeon.visitedRooms.add(room.roomId);

      const enteredSide = entrySideForFacing(exit.dir);
      if (enteredSide && !dungeon.clearedRooms.has(room.roomId)) {
        if (closeShutterBehind(dungeon.doorState, room, enteredSide)) {
          beginAnimatedShutterClose(room, enteredSide);
        }
      }
      restoreClearedShutters(dungeon.doorState, dungeon.clearedRooms, level);
      sealLastBossShutters(dungeon.doorState, level, dungeon.lastBossDefeated);

      await ensureUwRoom(room.roomId, false);
      resumeAs(me);
      // Never fall back to the room Link just left: `dungeonTileGrid` is the
      // collision map and `roomSprite` is what `patchRoomSquareAt` paints, so
      // a stale alias tears collision away from the art it belongs to.
      dungeonTileGrid = uwRooms.tileGrid(room.roomId);
      roomSprite = uwStream.get(room.roomId)?.sprite ?? null;

      // Seam coords were set by the caller — keep them so the door reads as a
      // walkable path (no dungeonRoomSpawn / lip-clamp teleport).
      link.dir = exit.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      if (me) {
        me.uwOccRoomId = room.roomId;
        me.uwDoorwayBlockSide = entrySideForFacing(exit.dir);
      }
      dungeon.doorwayBlockSide = entrySideForFacing(exit.dir);
      enterCandleRoom(room.roomId, room);

      // Per-room fixtures for the new anchor (enemies already rebased).
      dungeon.roomKillCount = 0;
      floorTiles = room.squares ? roomToTileGrid(room, [...UW_PRIMARY_SQUARES]) : null;
      ladderObj = null;
      pushBlock = ensurePushBlock(room);
      applyPushBlockRoomArt(room.roomId);
      pushBlockTex = null;
      ensureRoomItem(room);
      if (dungeon.clearedRooms.has(room.roomId)) {
        secretLatchRooms.add(room.roomId & 0xff);
        openRoomShutters(dungeon.doorState, room);
      }

      flames = [];
      statueState = createStatueState(room.layoutId ?? -1);
      closePrivateDialogue(me);

      refreshDungeonRoomVisual();
      await ensureUwNeighbors();
      resumeAs(me);
      spawnUwRoomEnemies(room.roomId, exit.dir);
      spawnVisibleUwRooms(exit.dir);
      applyPlayCamera();
      syncDarkOverlay();
      refreshHud();
      if (stubLabel) stubLabel.text = dungeonStubText(room);
      setStatus(`Level ${dungeon.level} room $${room.roomId.toString(16)}`);
    } finally {
      endBusy(me);
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
    const me = focus.current;
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
    resumeAs(me);
  }

  async function finishDungeonScroll() {
    const me = focus.current;
    const nextRoomId = screenScroll.nextRoomId;
    const fromDir = screenScroll.dir;
    destroyNextBg();
    if (roomSprite) {
      const play = dungeonPlayOrigin();
      roomSprite.x = play.x;
      roomSprite.y = play.y;
    }
    await loadDungeonRoom(nextRoomId, fromDir);
    resumeAs(me);
  }

  /**
   * Prefetch next OW screen and begin ScrollWorld (maze may target same room).
   * @param {{ nextRoomId: number, dir: number, x: number, y: number }} transition
   * @param {{ allowExit: boolean, playSecretTune: boolean }} maze
   */
  async function beginOverworldScroll(transition, maze) {
    const me = focus.current;
    if (
      scrollLoading
      || isScrolling(screenScroll)
      || heroIsBusy()
      || currentRaft().active
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
      resumeAs(me);
      tex.source.scaleMode = 'nearest';
      // Re-check after await — raft / death / another load may have started.
      if (heroIsBusy() || currentRaft().active || inv.dead || whirlwind?.alive || mode !== 'overworld') {
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
    const me = focus.current;
    if (
      scrollLoading
      || isScrolling(screenScroll)
      || heroIsBusy()
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
          resumeAs(me);
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
      resumeAs(me);
      if (!nextSprite || heroIsBusy() || inv.dead || endingUi.visible || !dungeon) return;

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
    const me = focus.current;
    // Occupied is not the same as loaded: both heroes start in the
    // overworld record, and the first `loadOverworldScreen` of a two-player
    // boot would otherwise take the join-live shortcut and never fetch a
    // screen.
    //
    // Already standing on the live overworld is a different request: a
    // debug warp / `goOw` has to change the streaming anchor, not teleport
    // in place. Taking the shortcut here left the party on `$77` while the
    // spawn said `$55`, so a dock ride never started.
    const alreadyOnOw = me?.world?.id === overworldWorldId();
    const joiningLive =
      !alreadyOnOw
      && worldOccupiedByOthers(overworldWorldId(), me)
      && Boolean(worlds.get(overworldWorldId())?.screen);
    const loadGen = joiningLive ? worldLoadGen : ++worldLoadGen;
    beginBusy(me);
    try {
      // A no-op when this is one overworld screen to another; a world change
      // when it is the way out of a labyrinth.
      movePlayerToWorld(me, overworldWorldId(), { mode: 'overworld' });
      if (joiningLive) {
        // A friend is already out here. Land on the live overworld rather
        // than rebuilding it (which would wipe their foes and their stream).
        // Spawn is local to `mapIndex`; convert into the live anchor so an
        // exit onto `$37` does not drop you at those numbers on `$77`.
        resumeAs(me);
        mode = 'overworld';
        const here = offsetFromRoom(mapIndex, spawn.x, spawn.y);
        link.x = here.x;
        link.y = here.y;
        if (spawn.dir != null) link.dir = spawn.dir;
        link.posFrac = 0;
        link.gridOffset = 0;
        link.moving = false;
        void ensureOwRoom(mapIndex);
        applyPlayCamera();
        refreshHud();
        return;
      }
      mode = 'overworld';
      dungeon = null;
      ladderObj = null;
      cancelScreenScroll();
      const keepDungeonStream = dungeonOccupiedByOthers(me);
      if (!keepDungeonStream) streamFetchGen += 1;
      owStream.clear();
      if (!keepDungeonStream) {
        uwStream.clear();
        uwDoorFrames.clear();
      }
      owStream.layer.visible = true;
      if (!keepDungeonStream) {
        uwStream.layer.visible = false;
        doorFrameLayer.visible = false;
      }
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
      resumeAs(me);
      if (loadGen !== worldLoadGen) return;
      const room = owRooms.get(mapIndex);
      if (!room?.pack || !room.tileGrid) {
        setStatus(`Failed to load OW $${mapIndex.toString(16)}`);
        return;
      }
      screen = { ...room.pack, tileGrid: room.tileGrid };
      bg = owStream.get(mapIndex)?.sprite ?? null;
      candleRoom = asCandleStore(candleRoom);
      beginCandleStay(candleRoom, mapIndex, null, inv, false);
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
      resumeAs(me);
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
      endBusy(me);
    }
  }

  /**
   * Progress (doors, taken items) is shared with the labyrinth; the current
   * room and kill count belong to this place.
   * @param {NonNullable<typeof dungeon>} base
   * @param {object} room
   * @param {object} [extra]
   */
  function forkDungeonState(base, room, extra = {}) {
    return {
      ...base,
      room,
      roomKillCount: 0,
      doorwayBlockSide: null,
      ...extra,
    };
  }

  /**
   * Drop into a mode-9 cellar as its own world. A friend still walking the
   * top-down map keeps that labyrinth's anchor and camera.
   * @param {number} cellarId
   * @param {number} [sourceRoomId]
   * @param {{ x: number, y: number, dir: number } | null} [spawnOverride]
   */
  async function enterCellar(cellarId, sourceRoomId, spawnOverride = null) {
    const me = focus.current;
    if (!dungeon?.levelData) return false;
    const level = dungeon.levelData;
    const cellarRoom = level.rooms.find((r) => (r.roomId & 0xff) === (cellarId & 0xff));
    if (!cellarRoom) return false;
    const destId = cellarWorldId(dungeon.level, cellarId);
    const source = sourceRoomId ?? dungeon.cellarSourceRoomId ?? roomId;
    dungeon.cellarSourceRoomId = source;

    if (worlds.get(destId)?.dungeon) {
      movePlayerToWorld(me, destId, { mode: 'dungeon' });
      const spawn =
        spawnOverride ??
        cellarEnterSpawn(null, null, {
          sourceRoomId: source,
          cellarRoom,
        });
      link.x = spawn.x;
      link.y = spawn.y;
      link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;
      if (me) me.uwOccRoomId = cellarRoom.roomId;
      setUndergroundExitType(1);
      applyPlayCamera();
      refreshHud();
      fx.playSfx('stairs');
      return true;
    }

    const shared = dungeon;
    movePlayerToWorld(me, destId, { mode: 'dungeon', dungeon: shared });
    mode = 'dungeon';
    dungeon = forkDungeonState(shared, cellarRoom, { cellarSourceRoomId: source });
    if (me?.world) me.world.dungeon = dungeon;
    return loadDungeonRoom(cellarId, DIR.UP, spawnOverride);
  }

  /**
   * Climb out of a cellar. Join the live labyrinth if someone is still in
   * it; otherwise rebuild it the way a solo player always has.
   * @param {number} nextRoomId
   * @param {{ x: number, y: number, dir: number } | null} [spawnOverride]
   * @param {number | null} [fromDir]
   */
  async function leaveCellar(nextRoomId, spawnOverride = null, fromDir = DIR.DOWN) {
    const me = focus.current;
    if (!dungeon?.levelData) return false;
    const levelId = dungeon.level;
    const destId = dungeonWorldId(levelId);
    const spawn =
      spawnOverride
      ?? cellarReturnSpawn(dungeon.room?.attrsC ?? 0x6a);
    setUndergroundExitType(1);
    stairsLatch = true;

    if (worlds.get(destId)?.dungeon) {
      movePlayerToWorld(me, destId, { mode: 'dungeon' });
      const here = offsetFromRoom(nextRoomId, spawn.x, spawn.y);
      link.x = here.x;
      link.y = here.y;
      link.dir = spawn.dir ?? DIR.DOWN;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;
      if (me) {
        me.uwOccRoomId = nextRoomId & 0xff;
        me.uwDoorwayBlockSide = null;
      }
      await ensureUwRoom(nextRoomId, false);
      resumeAs(me);
      applyPlayCamera();
      refreshHud();
      fx.playSfx('stairs');
      return true;
    }

    const progress = dungeon;
    const nextRoom = progress.levelData.rooms.find(
      (r) => (r.roomId & 0xff) === (nextRoomId & 0xff),
    );
    movePlayerToWorld(me, destId, { mode: 'dungeon', dungeon: progress });
    mode = 'dungeon';
    dungeon = forkDungeonState(progress, nextRoom ?? progress.room);
    if (me?.world) me.world.dungeon = dungeon;
    return loadDungeonRoom(nextRoomId, fromDir, spawn);
  }

  /**
   * @param {number} roomIdWanted
   * @param {number | null} [fromDir]
   * @param {{ x: number, y: number, dir: number } | null} [spawnOverride]
   * @param {{ entranceY?: number | null }} [opts]
   */
  async function loadDungeonRoom(roomIdWanted, fromDir, spawnOverride = null, opts = {}) {
    const me = focus.current;
    if (!dungeon?.levelData || heroIsBusy()) return false;
    const level = dungeon.levelData;
    const destIsCellar = isCellarRoomId(roomIdWanted, level);
    if (destIsCellar && !isCellarWorldId(me?.world?.id)) {
      return enterCellar(roomIdWanted, dungeon.cellarSourceRoomId ?? roomId, spawnOverride);
    }
    if (!destIsCellar && isCellarWorldId(me?.world?.id)) {
      return leaveCellar(roomIdWanted, spawnOverride, fromDir);
    }
    const room = level.rooms.find((r) => r.roomId === roomIdWanted);
    if (!room) {
      setStatus(`No room $${Number(roomIdWanted).toString(16)} in level data`);
      return false;
    }
    const keepDungeonStream = dungeonOccupiedByOthers(me);
    beginBusy(me);
    // Fresh room: allow stairs/cellar warps again (latch is only for the
    // frames Link remains on the trigger after a successful fire).
    stairsLatch = false;
    try {
      bombs = [];
      if (!keepDungeonStream) {
        clearEnemies();
        cancelScreenScroll();
        streamFetchGen += 1;
        uwStream.clear();
        uwDoorFrames.clear();
        closePrivateDialogue(me);
      }
      if (!worldOccupiedByOthers(overworldWorldId(), me)) {
        owStream.clear();
        owStream.layer.visible = false;
      }
      uwStream.layer.visible = true;
      doorFrameLayer.visible = true;
      spawnedRooms = new Set();
      spawnClaims = new Set();
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
        if (closeShutterBehind(dungeon.doorState, room, enteredSide)) {
          beginAnimatedShutterClose(room, enteredSide);
        }
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
      if (me) me.personDialogueForRoom = null;
      dungeon.visitedRooms.add(room.roomId);

      await ensureUwRoom(room.roomId, false);
      resumeAs(me);
      const grid = uwRooms.tileGrid(room.roomId);
      if (!grid) {
        setStatus(`Failed to load room $${room.roomId.toString(16)}`);
        return false;
      }
      dungeonTileGrid = grid;
      roomSprite = uwStream.get(room.roomId)?.sprite ?? null;

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
      if (me) me.uwOccRoomId = room.roomId;
      enterCandleRoom(room.roomId, room);
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
      if (me) me.uwDoorwayBlockSide = blockSide;
      // Hard cut reinterprets every ally's numbers as this room. Heal their
      // occupying-room latch so they do not collide against the cell they
      // were in before the warp.
      for (const p of activePlayers(players)) {
        if (p === me || p.world !== me?.world) continue;
        if (!inAnchorPlayArea(p.link.x, p.link.y)) continue;
        p.uwOccRoomId = room.roomId;
        p.uwDoorwayBlockSide =
          blockSide && nearDoorway(p.link, blockSide) ? blockSide : null;
      }

      // clearEnemies() already ran at room-load start; keep the wave latches
      // fresh immediately before spawning this room's foes.
      spawnedRooms = new Set();
      spawnClaims = new Set();
      spawnUwRoomEnemies(room.roomId, link.dir);
      dungeon.roomKillCount = 0;
      enemyBooms = [];
      floorTiles = room.squares ? roomToTileGrid(room, [...UW_PRIMARY_SQUARES]) : null;
      ladderObj = null;
      pushBlock = ensurePushBlock(room);
      applyPushBlockRoomArt(room.roomId);
      pushBlockTex = null; // rebuild if level palette changes
      ensureRoomItem(room);
      if (dungeon.clearedRooms.has(room.roomId)) {
        // FOES_FOR_ITEM / LAST_BOSS already revealed after clear.
        secretLatchRooms.add(room.roomId & 0xff);
        openRoomShutters(dungeon.doorState, room);
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
      flames = [];
      statueState = createStatueState(room.layoutId ?? -1);
      await ensureUwNeighbors();
      resumeAs(me);
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
      endBusy(me);
    }
  }

  /**
   * Stand this hero at the labyrinth mouth in the current anchor's space.
   * Does not rebuild the cell — an ally already inside keeps their pose.
   * @param {object} p
   * @param {{ walkIn?: boolean }} [opts]
   */
  function poseAtDungeonEntrance(p, opts = {}) {
    const level = dungeon?.levelData;
    if (!p?.link || !level || level.startRoom == null) return Promise.resolve();
    const spawn = dungeonEntranceSpawn(level);
    const here = offsetFromRoom(spawn.roomId, spawn.x, spawn.y);
    p.link.x = here.x;
    p.link.y = here.y;
    p.link.dir = spawn.dir;
    p.link.posFrac = 0;
    p.link.gridOffset = opts.walkIn ? enteringRoomGridOffset(spawn.dir) : 0;
    p.link.moving = false;
    p.uwOccRoomId = spawn.roomId;
    p.uwDoorwayBlockSide = entrySideForFacing(spawn.dir);
    return ensureUwRoom(spawn.roomId, false).then(() => {
      spawnUwRoomEnemies(spawn.roomId, spawn.dir);
    });
  }

  async function enterLevel(levelId, opts = {}) {
    const me = focus.current;
    if (levelId === 9 && triforceCount(inv) < 8) {
      setStatus(`Level 9 sealed — Triforce ${triforceCount(inv)}/8`);
      return;
    }
    const destId = dungeonWorldId(levelId);
    // Someone else is already down there — share the place rather than
    // rebuilding it on top of them. Stand at the mouth, not on the occupant.
    // Do not bump worldLoadGen: that would cancel the overworld loads the
    // friend still standing outside is waiting on.
    //
    // Dying here still occupies this world, so `worlds.get(destId)` is not
    // enough: a solo continue would skip the entrance reload, leave the
    // death cell as the streaming anchor, cull its remaining foes, and
    // treat the empty list as a room clear.
    if (worlds.get(destId)?.dungeon && worldOccupiedByOthers(destId, me)) {
      movePlayerToWorld(me, destId, { mode: 'dungeon' });
      await poseAtDungeonEntrance(me, { walkIn: true });
      fx.playSfx('stairs');
      return;
    }
    // Cancel in-flight OW loads so their completion cannot play overworld BGM
    // after we have switched to underworld/level9.
    worldLoadGen += 1;
    beginBusy(me);
    try {
      const quest = inv.quest === 2 ? 2 : 1;
      const level = finalizeLevelMeta(
        await fetchJson(`/dungeons/q${quest}/level_${levelId}/level.json`),
      );
      resumeAs(me);
      const startRoom = level.rooms.find((r) => r.roomId === level.startRoom);
      if (!startRoom) {
        throw new Error(`Level ${levelId} missing start room`);
      }

      const saved = dungeonProgress.get(dungeonProgressKey(quest, levelId));
      // Where the stairs were, read before the move: `roomId` and `screen`
      // belong to the place, so a step into the labyrinth answers for the
      // labyrinth and no longer knows the overworld door it came in by.
      const occ = occupyingOwPack();
      const fromRoomId = opts.fromRoomId ?? occ.roomId ?? roomId;
      const fromAttrs = opts.fromAttrs ?? occ.attrs ?? screen?.attrs ?? {};
      const from = me?.world;
      movePlayerToWorld(me, destId, { mode: 'dungeon' });
      mode = 'dungeon';
      dungeon = {
        level: levelId,
        fromRoomId,
        fromAttrs,
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
      if (me?.world) me.world.dungeon = dungeon;
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
      if (!worldOccupiedByOthers(from, me)) {
        owStream.clear();
        if (bg) {
          if (bg.parent && bg.parent !== owStream.layer) {
            bg.parent.removeChild(bg);
            bg.destroy({ texture: false, textureSource: false });
          }
          bg = null;
        }
      }
    } finally {
      endBusy(me);
    }
    resumeAs(me);
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
    resumeAs(me);
    fx.playSfx('stairs');
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
    // Doorstep to come back out onto, taken before the move. `roomId` here is
    // the stream anchor (leftover coords stay valid on the way out). The
    // occupying cell is the NES room-flag screen: leftover $2F must not share
    // a take-any flag with its neighbour, and after the move the cave world's
    // live `roomId` is 0 (`createWorld` default) — passing that would empty
    // every take-any / door / moblin cave after looting one.
    const entranceRoom = occupyingOwPack().roomId & 0xff;
    const returnPose = {
      roomId,
      x: link.x,
      y: link.y,
      dir: DIR.DOWN,
    };
    const me = focus.current;
    const destId = caveWorldId(cave.caveId);
    if (worlds.get(destId)) {
      movePlayerToWorld(me, destId, { mode: 'cave' });
      ensureCaveScene(destId);
      link.x = CAVE_ENTER_SPAWN.x;
      link.y = CAVE_ENTER_SPAWN.y;
      link.dir = CAVE_ENTER_SPAWN.dir;
      if (me) {
        me.caveInteractLatch = false;
        me.caveExitLatch = true;
        me.caveEntranceRoomId = entranceRoom;
      }
      clearCaveTransitState({ link, inv, sword, cancelSword });
      fx.playSfx('stairs');
      return;
    }
    const from = me?.world;
    // Cancel in-flight OW stream fetches so they cannot prune/layout mid-cave.
    // Only when this player is the last one outside — a friend still walking
    // the overworld still needs those fetches.
    if (!worldOccupiedByOthers(from, me)) streamFetchGen += 1;
    // Hide OW under the cave scene when nobody else is looking at it.
    // presentViews flips the layers per quadrant when the party is split.
    if (!worldOccupiedByOthers(from, me)) {
      owStream.layer.visible = false;
      if (bg) bg.visible = false;
    }
    movePlayerToWorld(me, destId, { mode: 'cave' });
    caveReturn = returnPose;
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
    if (me) {
      me.caveInteractLatch = false;
      me.caveExitLatch = true; // ignore exit until Link walks further inside
      me.caveEntranceRoomId = entranceRoom;
    }
    gambleAmounts = cave.kind === 'gamble' ? rollMoneyGameAmounts() : null;
    gambleResolved = false;
    // Bombs/keys/etc. restock every visit; do not keep prior shop purchases
    // in the saved `caveTaken` set or the slot vanishes forever.
    clearShopVisitTaken(cave, caveTaken);
    // Money game: stake "-10" under each rupee until a pick reveals results.
    ensureCaveScene(destId).openWith(
      cave,
      caveTaken,
      potionShopWaresHidden(cave, inv),
      inv,
      entranceRoom,
      cave.kind === 'gamble' ? moneyGameStakeLabels() : null,
    );
    fx.playSfx('stairs');
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
        fx.playSfx('rupee');
        refreshHud();
      }
    }
  }

  async function leaveCave(opts = {}) {
    const me = focus.current;
    const scene = caveView();
    const cave = scene?.cave;
    const destRoom = opts.roomId ?? caveReturn.roomId;
    const spawn = {
      x: opts.x ?? caveReturn.x,
      y: opts.y ?? caveReturn.y,
      dir: opts.dir ?? caveReturn.dir,
    };
    closePrivateDialogue(me);
    closePlayerMenu(me);
    world.y = 0;
    // Hide cave first — loadOverworldScreen may rebuild sprite caches, and
    // destroyed textures still bound to visible cave/HUD sprites black the GL context.
    // Only tear the scene down when this player is the last one in it.
    if (!worldOccupiedByOthers(me?.world, me)) {
      dropCaveScene(me?.world?.id);
      caveTileGrid = null;
    }
    const joiningLive =
      worldOccupiedByOthers(overworldWorldId(), me)
      && Boolean(worlds.get(overworldWorldId())?.screen);
    movePlayerToWorld(me, overworldWorldId(), { mode: 'overworld' });
    mode = 'overworld';
    setUndergroundExitType(1);

    // Take-any-road warps to another OW screen.
    if (opts.roadDest != null) {
      await loadOverworldScreen(opts.roadDest, {
        x: 0x78,
        y: worldIndex.startY,
        dir: DIR.DOWN,
      });
      resumeAs(me);
      setStatus(`Took the road to $${opts.roadDest.toString(16)}`);
      return;
    }

    if (joiningLive) {
      resumeAs(me);
      link.x = spawn.x;
      link.y = spawn.y;
      if (spawn.dir != null) link.dir = spawn.dir;
      link.posFrac = 0;
      link.gridOffset = 0;
      link.moving = false;
      applyPlayCamera();
      refreshHud();
      fx.playSfx('stairs');
      setStatus(cave ? 'Left the cave' : 'Back outside');
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
      resumeAs(me);
      spawnVisibleOwRooms(spawn.dir ?? link.dir);
      applyPlayCamera();
      titleEl.textContent = 'Play — overworld';
      refreshHud();
      playOverworldMusic();
      fx.playSfx('stairs');
      persistSave('cave exit');
      setStatus(cave ? 'Left the cave' : 'Back outside');
      return;
    }

    owStream.layer.visible = true;
    if (bg) bg.visible = true;
    await loadOverworldScreen(destRoom, spawn);
    resumeAs(me);
    fx.playSfx('stairs');
    persistSave('cave exit');
    setStatus(cave ? 'Left the cave' : 'Back outside');
  }

  /**
   * Interact with ware / dweller while in cave mode.
   */
  function tryCaveInteract() {
    const cave = caveView()?.cave;
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
        caveView()?.refreshWares(
          caveTaken,
          false,
          inv,
          moneyGameResultLabels(amounts),
        );
        fx.playSfx('rupee');
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
        fx.playSfx('rupee');
        caveView()?.refreshWares(caveTaken, false, inv);
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
    if (result.item != null) onGrantedItem(result.item);
    setStatus(`Got ${result.label}${result.price ? ` (−${result.price}R)` : ''}`);
    caveView()?.refreshWares(caveTaken, false, inv);
    refreshHud();
    refreshOpenMenus();
    if (cave.kind === 'give' || cave.kind === 'letter' || cave.kind === 'take_any') {
      // TakeItem: Tune1 $08, and in a cave/cellar also SongRequest $08 with
      // Link halted holding the item for $80 frames.
      fx.playSfx('item_taken');
      fx.playFanfare('item');
      inv.itemLiftTimer = ITEM_LIFT_FRAMES;
      startItemLift(result.item ?? null);
    } else {
      fx.playSfx('rupee');
    }
    // Shelf purchases get the same introduction a labyrinth floor would give.
    tellItemStory(result.item, { interrupt: true });
    persistSave('cave item');
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
    // Same gap as itemLiftTimer: shove and the sword are applied in
    // stepCombat only. A leftover swing (death regroup into this cave,
    // walking in mid-slash if transit cleanup missed) never finishes
    // otherwise, and the walk gate below would freeze Link forever.
    if (isSwordActive(sword)) stepSword(sword);
    applyShove();
    if (!isSwordActive(sword) && inv.shovePixels <= 0) {
      stepLink(link, caveTileGrid, inputMask);
    }
    ensureLinkNotInSolid();
    const me = focus.current;
    const cave = caveView()?.cave;
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
        if (me) me.caveInteractLatch = false;
      } else if (me && me.caveInteractLatch !== targetKey) {
        me.caveInteractLatch = targetKey;
        tryCaveInteract();
      }
    }
    // Clear latch once Link has walked north of the mouth (enter spawn is $B8).
    if (me && link.y < 0xc0) me.caveExitLatch = false;
    if (me && !me.caveExitLatch && checkCaveExit(link)) {
      me.caveExitLatch = true;
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
      fx.playSfx('secret');
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
      fx.playSfx('secret');
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
    const occId = occupyingRoom(roomId, link.x, link.y).roomId;
    const spr = owStream.get(occId)?.sprite ?? owStream.get(roomId)?.sprite ?? null;
    if (!spr) return;
    const next = nesColor(nesIndex);
    if (!next) return;
    const srcW = spr.texture?.source?.pixelWidth | 0;
    const srcH = spr.texture?.source?.pixelHeight | 0;
    if (srcW <= 0 || srcH <= 0) return;
    const canvas = document.createElement('canvas');
    // Texture width is in world units once the source carries a resolution;
    // the backing store has to match the real pixels or the repaint rescales.
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const src = /** @type {CanvasImageSource | null} */ (spr.texture.source.resource);
    if (!src) return;
    try {
      ctx.drawImage(src, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = image.data;
      const rgb = owWaterRgb;
      if (!rgb || rgb.length < 3) return;
      const [fr, fg, fb] = rgb;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] === fr && px[i + 1] === fg && px[i + 2] === fb) {
          px[i] = next[0];
          px[i + 1] = next[1];
          px[i + 2] = next[2];
        }
      }
      ctx.putImageData(image, 0, 0);
    } catch {
      return;
    }
    owWaterRgb = next;
    spr.texture = markScaled(Texture.from(canvas));
    bg = spr;
  }

  async function exitDungeon() {
    const me = focus.current;
    if (!dungeon || heroIsBusy()) return;
    snapshotDungeonProgress();
    const spawn = overworldExitSpawn(dungeon.fromAttrs ?? {});
    const from = dungeon.fromRoomId ?? worldIndex.startScreen;
    const lastOut = !worldOccupiedByOthers(me?.world, me);
    closePrivateDialogue(me);
    closeStoryBeat();
    closePlayerMenu(me);
    world.y = 0;
    // Only the last one out takes the lights. An ally still in the labyrinth
    // needs the stream, the tile grid, and the map/compass on their HUD.
    if (lastOut) {
      ladderObj = null;
      holdingTriforceLift = false;
      liftItemType = null;
      syncItemLiftSprite();
      inv.map = 0;
      inv.compass = 0;
      darkOverlay.visible = false;
      doorFrameLayer.tint = 0xffffff;
      candleRoom = createCandleStore();
    }
    try {
      await loadOverworldScreen(from, { ...spawn, dir: DIR.DOWN });
      resumeAs(me);
      setUndergroundExitType(1);
      fx.playSfx('stairs');
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
    // Cave worlds default `roomId` to 0, and `0 ?? fallback` keeps 0 — a real
    // OW screen. Take-any / door / moblin flags must use the doorstep instead.
    const mine = focus.current?.caveEntranceRoomId;
    if (mine) return mine & 0xff;
    const marked = caveView()?.roomId;
    if (marked) return marked & 0xff;
    const doorstep = caveReturn?.roomId;
    if (doorstep) return doorstep & 0xff;
    return roomId & 0xff;
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
    openTextBox(pages, { kind: 'cave' });
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
    openTextBox(pages, { kind: 'person' });
  }

  /**
   * Open underworld person dialogue once this hero has fully entered the
   * NPC's cell and the NPC is on camera (NES textbox starts after the person
   * begins updating, not while Link is still in the doorway).
   *
   * The world's `roomId` is the streaming anchor — whoever last crossed a
   * door. Looking there made an ally standing in a leftover cell "hear" an
   * old man two rooms away, and tagged the wrong reader on the box.
   */
  function tryOpenPersonDialogue() {
    if (mode !== 'dungeon' || !dungeon || heroIsBusy() || inv.dead) return;
    const me = focus.current;
    if (playerTextBox(me).active) return;
    const door = uwHeroDoorContext();
    const occId = door.occId & 0xff;
    if (me?.personDialogueForRoom === occId) return;
    if (
      me?.uwDoorwayBlockSide
      && !doorwayLatchCleared(door.localLink, me.uwDoorwayBlockSide)
    ) {
      return;
    }
    const person = enemiesInRoom(enemies, occId).find(
      (e) =>
        e.alive
        && (isPersonType(e.objType) || isGrumble(e.objType))
        && enemyCombatActive(e),
    );
    if (!person) return;
    openPersonDialogue(dungeon.level, person.objType);
    personDialogueForRoom = occId;
    if (me) me.personDialogueForRoom = occId;
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
    if (opts.interrupt && playerTextBox(focus.current).active) {
      closePrivateDialogue(focus.current);
    }
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
    if (inv.dead) return false;
    if (isPartyStoryKind(kind) && activePlayers(players).length > 1) {
      applyStoryMarks(marks);
      return openStoryBeat(pages, kind, meta);
    }
    if (playerTextBox(focus.current).active) {
      pendingStory = { pages, marks, kind, meta };
      return false;
    }
    applyStoryMarks(marks);
    openTextBox(pages, { kind, meta });
    return true;
  }

  /**
   * Shut this hero's private box. An ally's cave speech stays up.
   */
  function closePrivateDialogue(p = talkingPlayer ?? focus.current) {
    if (!p) {
      for (const box of textBoxes) box.close();
      talkingPlayer = null;
      return;
    }
    playerTextBox(p).close();
    if (talkingPlayer === p) {
      talkingPlayer =
        activePlayers(players).find((q) => q !== p && playerTextBox(q).active) ?? null;
    }
  }

  function closeAllPrivateDialogue() {
    talkingPlayer = null;
    for (const box of textBoxes) box.close();
  }

  function closeStoryBeat() {
    storyPager = null;
    storyBox.close();
  }

  /**
   * Shut both boxes without letting a queued beat leak into whatever comes next.
   *
   * Every forced close in this file is a mode change — a room load, a cave
   * exit, death, the ending, a new file. A story waiting behind the box
   * belonged to the situation being torn down, so it goes with it.
   */
  function closeDialogue() {
    pendingStory = null;
    closeAllPrivateDialogue();
    closeStoryBeat();
  }

  /** Open whatever was waiting behind the box that just closed. */
  function drainPendingStory() {
    const next = pendingStory;
    pendingStory = null;
    if (!next || inv.dead) return;
    applyStoryMarks(next.marks);
    if (isPartyStoryKind(next.kind) && activePlayers(players).length > 1) {
      openStoryBeat(next.pages, next.kind, next.meta);
      return;
    }
    openTextBox(next.pages, { kind: next.kind, meta: next.meta });
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
    if (activePlayers(players).length > 1) {
      openStoryBeat(pages, 'briefing', { level, missed: missed.length });
      return;
    }
    openTextBox(pages, { kind: 'briefing', meta: { level, missed: missed.length } });
  }

  /**
   * The between-labyrinth briefing walks the whole party out. Closing it
   * as whoever finished reading last used to leave the others underground.
   */
  async function exitDungeonParty() {
    const leaving = activePlayers(players).filter((p) => {
      const id = String(p.world?.id ?? '');
      return id.startsWith('dungeon:') || id.startsWith('cellar:');
    });
    for (const p of leaving) {
      const id = String(p.world?.id ?? '');
      if (!id.startsWith('dungeon:') && !id.startsWith('cellar:')) continue;
      await focus.on(p, () => exitDungeon());
    }
    const host = hostPlayer(players) ?? players[0];
    if (host) focus.to(host);
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
      void exitDungeonParty();
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
          ? `Cave $${(caveView()?.cave?.caveId ?? 0).toString(16)}`
          : `L${dungeon?.level} $${roomId.toString(16).padStart(2, '0')}  TF ${triforceCount(inv)}/8`;
    // Cave keeps the OW radar on the overworld entrance screen.
    const mapRoomId = lookingRoomId();
    // A mark whose item is now in the bag retires itself.
    pruneHintMarks(hintMarks, inv);
    const compact = playerCount > 1;
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
      compact,
      playerIndex: focus.current?.index ?? 0,
    });
    if (compact) {
      sharedBar.update({
        inv,
        rupeesShown: rupeeRoll.shown,
        mode,
        roomId: mapRoomId,
        dungeon,
        mapMarks: currentMapMarks(),
        dungeonMarks: currentDungeonMapMarks(),
        frame: uiFrame,
      });
    }
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
    if (focus.current?.pondFairyHalt) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      return;
    }
    if (inv.shovePixels <= 0 || !inv.shoveDir) return;
    if (mode === 'dungeon' && dungeon) {
      applyUwShove();
      return;
    }
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
        : {};
    const result = stepShove(link, grid, shoveDir, inv.shovePixels, {
      roomId:
        mode === 'overworld'
          ? CONTINUOUS_OW
          : null,
      tileOpts,
      pixelsPerFrame: 4,
    });
    inv.shovePixels = result.shovePixels;
    if (result.blocked) inv.shoveDir = 0;
  }

  /**
   * Knockback in the cell this hero occupies. The world's `dungeonTileGrid`
   * is the streaming anchor; using it on leftover coords clamped those
   * samples to the anchor's walls and yanked the ally into the wrong room.
   */
  function applyUwShove() {
    const door = uwHeroDoorContext();
    const shoveDir = maskPersonBlockedDir(inv.shoveDir);
    if (!shoveDir) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      return;
    }
    const inCellar =
      door.occRoom && dungeon?.levelData
        ? isCellarRoom(door.occRoom, dungeon.levelData)
        : false;
    const grid =
      door.mode === 'corridor'
        ? OPEN_UW_GRID
        : uwOccupyingTileGrid(door.occId);
    if (!grid) {
      inv.shovePixels = 0;
      return;
    }
    const bounds =
      door.mode === 'room' && !inCellar ? UW_ROOM_BOUNDS : NO_ROOM_BOUNDS;
    const result = stepShove(door.localLink, grid, shoveDir, inv.shovePixels, {
      roomId: bounds,
      tileOpts:
        door.mode === 'room'
          ? dungeonHeroWalkOpts(
              door.occRoom,
              grid,
              0,
              (door.occId & 0xff) === (roomId & 0xff),
            )
          : {},
      pixelsPerFrame: 4,
    });
    writeUwLocal(door.occId, door.localLink);
    inv.shovePixels = result.shovePixels;
    if (result.blocked) inv.shoveDir = 0;
  }

  /**
   * Door walking in the cell this hero occupies, which may not be the world's
   * streaming anchor. Coords on `localLink` are that cell's local space.
   */
  function uwHeroDoorContext() {
    const me = focus.current;
    const occNow = occupyingRoom(roomId, link.x, link.y);
    // Prefer the latch only while this hero is still in that cell (or its
    // door lip). A hard cut reinterprets everyone else's numbers as the new
    // room; keeping the old id maps them onto the neighbour's wall tiles.
    const occId = resolveUwOccupyingRoomId(roomId, link.x, link.y, me?.uwOccRoomId);
    if (me && (me.uwOccRoomId == null || (me.uwOccRoomId & 0xff) !== (occId & 0xff))) {
      me.uwOccRoomId = occId;
      const occPack =
        dungeon?.levelData?.rooms?.find((r) => (r.roomId & 0xff) === (occId & 0xff))
        ?? dungeon?.room;
      enterCandleRoom(occId, occPack);
    }
    const occRoom =
      dungeon?.levelData?.rooms?.find((r) => (r.roomId & 0xff) === (occId & 0xff))
      ?? dungeon?.room;
    const local = offsetToRoom(occId, link.x, link.y);
    const localLink = { ...link, x: local.x, y: local.y };
    const latch = me?.uwDoorwayBlockSide ?? null;
    const mode = occRoom
      ? uwDoorMotionMode(localLink, occRoom, {
          doorwayBlockSide: latch,
          doorState: dungeon?.doorState,
        })
      : 'room';
    return { me, occId, occRoom, occNow, localLink, latch, mode };
  }

  function writeUwLocal(occId, localLink) {
    const p = offsetFromRoom(occId, localLink.x, localLink.y);
    writeLinkMotion(link, localLink, p.x, p.y);
  }

  /** Safety net: if Link is somehow inside a solid, slide him out. */
  function ensureLinkNotInSolid() {
    // Doorway tiles are solid in the UW map; NES skips collision via DoorwayDir.
    if (mode === 'dungeon' && dungeon) {
      const door = uwHeroDoorContext();
      // Occupying-room corridor, or a leftover still in a neighbour cell.
      if (door.mode === 'neighbor' || door.mode === 'corridor') return;
      if (ladderAllowsStanding(ladderObj, door.localLink)) return;
      const grid = uwOccupyingTileGrid(door.occId);
      if (!grid) return;
      const preferDir =
        (inv.shoveDir ? oppositeDir(inv.shoveDir) : 0) || oppositeDir(door.localLink.dir) || DIR.UP;
      const inCellar =
        door.occRoom && dungeon.levelData
          ? isCellarRoom(door.occRoom, dungeon.levelData)
          : false;
      const result = ejectLinkFromSolid(door.localLink, grid, {
        roomId: inCellar ? NO_ROOM_BOUNDS : UW_ROOM_BOUNDS,
        tileOpts: dungeonHeroWalkOpts(
          door.occRoom,
          grid,
          0,
          (door.occId & 0xff) === (roomId & 0xff),
        ),
        preferDir,
      });
      if (result.ejected) {
        writeUwLocal(door.occId, door.localLink);
        inv.shovePixels = 0;
        inv.shoveDir = 0;
      }
      return;
    }
    // On the stepladder, feet sit on water `$F4` — that is intentional.
    if (ladderAllowsStanding(ladderObj, link)) return;
    const grid = activeLinkTileGrid();
    if (!grid) return;
    const preferDir =
      (inv.shoveDir ? oppositeDir(inv.shoveDir) : 0) || oppositeDir(link.dir) || DIR.UP;
    const tileOpts = mode === 'overworld' ? overworldLinkTileOpts() : {};
    const result = ejectLinkFromSolid(link, grid, {
      roomId: mode === 'overworld' ? CONTINUOUS_OW : null,
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
    // Fountain halt is invulnerability without the hurt flicker — topping
    // `invuln` like the clock would flash Link through the heart ring.
    if (focus.current?.pondFairyHalt) return;
    const result = harmLink(inv, halfHearts);
    if (!result.applied) return;
    resetDropStreak(dropCounters);
    endClockIfHere();
    fx.playSfx('hurt');
    inv.shoveDir = oppositeDir(dir) || oppositeDir(link.dir) || DIR.DOWN;
    inv.shovePixels = 0x20;
    refreshHud();
    if (result.died) beginDeath();
  }

  /**
   * GameMode $11: this hero just dropped.
   *
   * A potion in the shared bag is drunk for them, as the ROM does. If someone
   * else is still standing they come back: beside that ally when they share
   * a place, or at their own dungeon door when they do not. The continue
   * menu is only for when the whole party is down — and at one player that
   * is the ROM's own flow.
   */
  function beginDeath() {
    const dead = focus.current;
    if (!dead) return;
    cancelSword(sword);
    if (tryAutoRevive(inv)) {
      refreshHud();
      fx.playSfx('text');
      setStatus('Potion!');
      return;
    }
    if (deathOutcome(players, dead) === 'respawn') {
      if (playerTextBox(dead).active) closePrivateDialogue(dead);
      if (menuUi(dead).open) closePlayerMenu(dead);
      dead.deathSeq = createDeathSequence();
      const ally = respawnAlly(players, dead);
      setStatus(coopRespawnStatus(dead, ally));
      return;
    }
    // InitMode11Death ends in SilenceSound before the first submode runs.
    worldLoadGen += 1;
    cancelScreenScroll();
    fx.stopMusic();
    // Mode $11 owns the screen from here; an open textbox would halt it.
    closeDialogue();
    pendingBriefingLevel = null;
    snapshotDungeonProgress();
    if (activeSlot != null && playing) {
      saveStore.save(activeSlot, collectSaveState());
    }
    for (const p of players) p.deathSeq = null;
    deathUi.begin();
    presentCinematic();
    setStatus('Game over');
  }

  /** Status after a co-op death: regroup, or the ROM dungeon continue. */
  function coopRespawnStatus(dead, ally) {
    if (shouldRestartInOwnDungeon(dead, ally)) return 'Continue — Level entrance';
    if (
      sameRespawnArea(dead, ally)
      && isCellarWorldId(ally?.world?.id)
      && !isCellarWorldId(dead?.world?.id)
    ) {
      return 'Continue — Level entrance';
    }
    if (sameRespawnArea(dead, ally)) return 'Continue — beside your friend';
    return 'Continue';
  }

  /**
   * After the co-op spin, stand next to whoever is still up — when you
   * already share a place. A dungeon death with the living elsewhere
   * continues at that labyrinth's door. The fade and GAME OVER are for a
   * wipe, not for one hero dropping.
   */
  function finishCoopRespawn(dead) {
    dead.deathSeq = null;
    if (deathOutcome(players, dead) !== 'respawn') {
      focus.on(dead, () => beginDeath());
      return;
    }
    const ally = respawnAlly(players, dead);
    if (!ally) {
      focus.on(dead, () => beginDeath());
      return;
    }
    if (playerTextBox(dead).active) closePrivateDialogue(dead);
    const held = focus.current;
    const status = coopRespawnStatus(dead, ally);
    const localDungeon = shouldRestartInOwnDungeon(dead, ally);
    const cellarDump =
      sameRespawnArea(dead, ally)
      && isCellarWorldId(ally?.world?.id)
      && !isCellarWorldId(dead?.world?.id);
    focus.on(dead, () => {
      if (localDungeon) {
        standUpAfterDeath(dead);
        const destId = labyrinthWorldIdFor(dead.world);
        if (destId && worlds.get(destId)?.dungeon && worldOccupiedByOthers(destId, dead)) {
          if (dead.world?.id !== destId) {
            movePlayerToWorld(dead, destId, { mode: 'dungeon' });
          }
          void poseAtDungeonEntrance(dead);
        } else if (dungeon?.level != null) {
          const levelId = dungeon.level;
          const fromRoomId = dungeon.fromRoomId;
          const fromAttrs = dungeon.fromAttrs ?? {};
          void enterLevel(levelId, { fromRoomId, fromAttrs });
        }
        refreshHud();
        return;
      }
      if (shouldFollowAllyWorld(dead, ally)) {
        movePlayerToWorld(dead, ally.world.id, { mode: ally.world.mode });
        respawnBeside(dead, ally);
        adoptOccupyingOwAnchor(dead);
      } else if (cellarDump) {
        const destId = labyrinthForCellarAlly(ally);
        respawnBeside(dead, ally);
        if (destId && worlds.get(destId)?.dungeon) {
          if (dead.world?.id !== destId) {
            movePlayerToWorld(dead, destId, { mode: 'dungeon' });
          }
          void poseAtDungeonEntrance(dead);
        }
        refreshHud();
        return;
      } else if (sameRespawnArea(dead, ally)) {
        respawnBeside(dead, ally);
        adoptOccupyingOwAnchor(dead);
      } else {
        standUpAfterDeath(dead);
      }
      refreshHud();
    });
    if (held?.active) focus.to(held);
    else focus.to(players[0]);
    setStatus(status);
  }

  function stepCoopDeaths() {
    for (const p of activePlayers(players)) {
      if (!p.deathSeq) continue;
      const ev = stepDeathSequence(p.deathSeq);
      if (ev.playDyingTune && coopDeathPlaysDyingTune(players, p)) {
        fx.playSfx('link_dying');
      }
      p.link.dir = deathLinkDir(p.deathSeq);
      if (coopDeathSpinDone(p.deathSeq)) finishCoopRespawn(p);
    }
  }

  /**
   * Drive game modes `$11` and `$08` while Link is dead.
   * @param {{ select: boolean, start: boolean }} pressed
   */
  function stepDeathMode(pressed) {
    const tick = deathUi.tick(link, pressed);
    if (tick.playDyingTune) fx.playSfx('link_dying');
    if (tick.playHeartTune) fx.playSfx('text');
    if (tick.playGameOverMusic) {
      // UpdateMode11Death_SubC: Tune1 $40 loops, and the death is tallied.
      fx.playSfx('game_over');
      deathCount = incrementDeathCount(deathCount);
      if (activeSlot != null) saveStore.save(activeSlot, collectSaveState());
    }
    if (tick.cursorMoved) fx.playSfx('shield');

    // Link keeps spinning in the world layer until the spark replaces him.
    deathLinkVisible = tick.linkVisible;
    if (tick.linkVisible) link.dir = tick.linkDir;

    if (tick.action) applyContinueChoice(tick.action);
  }

  /** `Mode8SelectionToMode` — continue playing, save and quit, or restart. */
  function applyContinueChoice(action) {
    deathUi.hide();
    // Effect `$80` / leaving mode `$08`: drop Tune1 game-over before anything else.
    fx.stopSfx();
    if (action === 'continue') {
      continueAfterDeath();
      return;
    }
    persistSave(action === 'save' ? 'continue menu save' : 'retry');
    inv.dead = false;
    playing = false;
    dungeon = null;
    fx.stopMusic();
    fx.playMusic('title');
    titleUi.setSlots(saveStore.listSlots());
    titleUi.show();
    setStatus(action === 'save' ? 'Saved — file select' : 'Retry — file select');
  }

  /**
   * Dump the caught hero at the dungeon mouth. Allies stay where they are —
   * a hard `loadDungeonRoom` would rebuild the cell on top of them.
   * @param {import('@shared/enemies.js').Enemy} e
   */
  function finishWallmasterCapture(e) {
    const victimIndex = e.wallmasterVictim ?? focus.current?.index ?? 0;
    e.wallmasterGrab = false;
    e.wallmasterWarpPending = false;
    e.alive = false;
    const victim = players.find((p) => p.index === victimIndex && p.active);
    const level = dungeon?.levelData;
    if (!victim || !level || level.startRoom == null) return;
    victim.inv.paralyzed = 0;
    victim.inv.shovePixels = 0;
    victim.inv.shoveDir = 0;
    void poseAtDungeonEntrance(victim);
    snapshotDungeonProgress();
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
        if (linkHeldByWallmaster()) return;
        e.wallmasterGrab = true;
        e.wallmasterVictim = focus.current?.index ?? 0;
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
      fx.playSfx('secret');
      setStatus('Armos reveals stairs!');
      return;
    }
    if (secret.kind === 'bracelet' && !inv.bracelet) {
      fx.playSfx('secret');
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
      fx.playSfx(name);
    }
  }

  /**
   * NES HandleMonsterDied → SetUpDroppedItem after a kill.
   * @param {object} e
   * @param {number} [damageType]
   */
  function onEnemyKilled(e, damageType = 0) {
    // Tune1 $20 is the death cue; `enemy_die` / `boss_hit` fire from playWeaponHitSfx.
    fx.playSfx(isBossType(e.objType) ? 'boss_defeat' : 'monster_die');
    if (isGanon(e.objType)) fx.playFanfare('ganon');
    // A foe streamed in from a neighbour must not count toward this room's
    // kill tally or trip its ringleader cascade.
    const homeRoom = (e.homeRoomId ?? roomId) & 0xff;
    if (mode === 'dungeon' && dungeon) {
      if (homeRoom === (roomId & 0xff)) {
        dungeon.roomKillCount = (dungeon.roomKillCount ?? 0) + 1;
      }
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
      // Co-op skips the NES $F0 wait: player two running onto a fresh drop
      // otherwise stands on it for ~32 frames while player one, already
      // overlapping the corpse, collects it the moment it becomes ready.
      if (activePlayers(players).length > 1) drop.lifetime = 0xef;
      drop.id = dropSpriteSeq++;
      drops.push(drop);
    }
    // Ringleader: when slot 1 dies / empties, wipe the room.
    if (
      mode === 'dungeon'
      && dungeon
      && roomSecretEffect(dungeonPackForId(homeRoom)) === SECRET.RINGLEADER
      && slotIndex === 1
    ) {
      tryRingleaderClear(roomFoes);
    }
  }

  function tryTakeDropsWith(takerX, takerY, takerKind = 'link') {
    if (!isValidItemTaker(takerKind)) return;
    for (const d of drops) {
      if (!d.alive || !dropTouchesTaker(d, takerX, takerY, takerKind)) continue;
      const got = grantDroppedItem(inv, d.itemId);
      d.alive = false;
      if (got.ok) {
        if (d.itemId === DROP_ITEM.CLOCK) {
          tagVisibleEnemiesForClock(
            enemies,
            (e) => !rectFullyOffEveryCamera(e, sessionCameras(), 0),
          );
          if (clockFreezeActive(enemies)) {
            clockWorldId = clockWorldHere();
          } else {
            endClockFreeze();
          }
        }
        // Fairy uses TakeHeartsNoSound — no item tune.
        // NES TakeItem only arms ItemLiftTimer in caves/cellars (GameMode≠$05);
        // OW/UW play skips the lift halt, so drops must not freeze Link.
        // Rupees → Tune1 $01; hearts/bombs/keys → Tune0 $08 (PlayKeyTakenTune).
        const sfx = dropPickupSfx(d.itemId);
        if (sfx) fx.playSfx(sfx);
        setStatus(got.label);
        refreshHud();
      }
    }
  }

  /**
   * Drops: the world's to age, anyone's to take.
   *
   * @param {boolean} [shared] false for the second and later hero in a place
   *   this frame, who may still pick things up but must not age them again
   */
  function stepDrops(shared = true) {
    if (shared) {
      dropFrame += 1;
      const cameras = sessionCameras();
      for (const d of drops) {
        stepDroppedItemLifetime(d, dropFrame);
        if (d.itemId === DROP_ITEM.FAIRY) {
          stepFairy(d, fairyFlightBounds(cameras, d.x, d.y, cam, mode));
        }
      }
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
    if (boomerangs.length) {
      for (const boom of liveBoomerangs(boomerangs)) {
        tryTakeDropsWith(boom.x, boom.y, 'boom');
      }
    }
    tryTakeDropsWith(link.x, link.y, 'link');
    // UpdateRupeeStash — walk onto a $35 pickup (L7 stash rooms, etc.).
    const stash = tryTakeRupeeStash(enemies, link, inv);
    if (stash.taken) {
      fx.playSfx('rupee');
      setStatus('Rupee');
      refreshHud();
    }

    if (!shared) return;
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
      if (!d.alive) {
        const spr = dropGfx.get(d.id);
        if (spr) spr.visible = false;
        continue;
      }
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
      spr.visible = true;
      if (d.itemId === DROP_ITEM.FAIRY) spr.alpha = dropFrame & 4 ? 1 : 0.75;
      else spr.alpha = 1;
    }
    // Sprites left in the map after the drop list moved on still paint, and
    // walking onto that ghost never collects anything.
    for (const [id, spr] of [...dropGfx.entries()]) {
      if (drops.some((d) => d.id === id && d.alive)) continue;
      spr.visible = false;
    }
  }

  function clearPondHeartSprites() {
    for (const spr of pondHeartGfx) {
      itemLayer.removeChild(spr);
      spr.destroy({ texture: false, textureSource: false });
    }
    pondHeartGfx.length = 0;
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
      spr.x = h.x + (drawn.narrow ? 4 : 0);
      spr.y = h.y;
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
    const me = focus.current;
    const occId = occupyingRoomIdOf(me);
    const fairy = findPondFairy(enemies, occId);
    const anyFairy = fairy ?? findPondFairy(enemies);
    if (!fairy || !enemyCombatActive(fairy)) {
      pondFairyHalt = false;
      if (me) me.pondFairyHalt = false;
      // An ally at the fountain still owns the ring. Clearing here parked it
      // on this hero's camera (8-bit coords) or erased it for everyone.
      if (pondFairyOrbiting(anyFairy) && enemyCombatActive(anyFairy)) {
        if (firstInWorldThisFrame('pondFairyDraw')) {
          syncPondHeartSprites(visiblePondHearts(anyFairy), true);
        }
      } else if (firstInWorldThisFrame('pondFairy')) {
        clearPondHeartSprites();
      }
      return false;
    }
    const result = stepPondFairy(fairy, inv, link, {
      roomId: occId,
      playerIndex: me?.index,
    });
    pondFairyHalt = result.haltLink;
    if (me) me.pondFairyHalt = result.haltLink;
    if (result.playHeartTune) fx.playSfx('text');
    if (result.showOrbitHearts) {
      syncPondHeartSprites(result.hearts, true);
    } else if (pondFairyOrbiting(fairy)) {
      if (firstInWorldThisFrame('pondFairyDraw')) {
        syncPondHeartSprites(visiblePondHearts(fairy), true);
      }
    } else if (firstInWorldThisFrame('pondFairy')) {
      syncPondHeartSprites(result.hearts, false);
    }
    if (result.haltLink || result.playHeartTune) refreshHud();
    return result.haltLink;
  }

  function stepRoomSecrets() {
    if (mode === 'overworld') {
      return;
    }
    if (mode !== 'dungeon' || !dungeon?.room) return;
    // A leftover ally's kill is still that cell's clear. The streaming
    // anchor used to be the only room that opened shutters, so player two
    // defeating Aquamentus in `$35` left the east door shut.
    for (const id of occupiedDungeonRoomIds()) {
      stepRoomSecretsFor(id);
    }
  }

  /**
   * @param {number} roomIdWanted
   */
  function stepRoomSecretsFor(roomIdWanted) {
    const room = dungeonPackForId(roomIdWanted);
    if (!room) return;
    const id = room.roomId & 0xff;
    const effect = roomSecretEffect(room);
    const roomFoes = enemiesInRoom(enemies, id);
    const item = ensureRoomItem(room);
    const heroHere = occupyingRoomIdOf(focus.current) === id;
    const latched = secretLatchRooms.has(id);

    // InitUnderworldPersonC live path (already spawned before the gate check).
    if (dismissLevel9EntranceGate(roomFoes, dungeon.level, inv)) {
      const sides = shutterSidesNeedingOpen(dungeon.doorState, room);
      dungeon.clearedRooms.add(id);
      secretLatchRooms.add(id);
      beginAnimatedShutterOpen(room, sides);
      setStatus('Triforce complete — path opens');
    }

    // Money-or-life / bomb-upgrade pay with this hero's feet, not an ally's.
    if (heroHere && effect === SECRET.MONEY_OR_LIFE && !latched) {
      const paid = tryPayMoneyOrLife(inv, link.x, link.y);
      if (paid) {
        dismissMoneyOrLifePerson(roomFoes);
        fx.playSfx(paid === 'rupees' ? 'rupee' : 'key');
        setStatus(paid === 'rupees' ? 'Paid 50 rupees' : 'Paid a heart container');
        refreshHud();
      }
    }

    if (
      heroHere
      && bombUpgradePersonAlive(roomFoes)
      && !dungeon.takenItems.has(id)
      && tryBuyBombUpgrade(inv, link.x, link.y)
    ) {
      dismissBombUpgradePerson(roomFoes);
      dungeon.takenItems.add(id);
      fx.playSfx('rupee');
      setStatus(`Bomb capacity ${inv.maxBombs}!`);
      refreshHud();
      refreshOpenMenus();
      persistSave('bomb upgrade');
    }

    if (effect === SECRET.RINGLEADER && !latched) {
      tryRingleaderClear(roomFoes);
    }

    const allDead = roomAllDead(roomFoes);
    const ready =
      effect === SECRET.LAST_BOSS
        ? Boolean(dungeon?.lastBossDefeated) && allDead
        : effect === SECRET.MONEY_OR_LIFE
          ? moneyOrLifeReady(roomFoes)
          : allDead;
    // Spawn-latched cells and leftover corpses may clear. The streaming
    // anchor used to be a free pass, so a death continue (or Wallmaster
    // dump) that culled the remaining foes looked like RoomAllDead and
    // persisted the cell as cleared — walking back found no monsters.
    const mayClear = roomMayClear(roomFoes, spawnedRooms.has(id));

    if (!latched && ready && mayClear) {
      const { shutter, revealItem } = applyRoomClear(item, allDead, effect, {
        lastBossDefeated: Boolean(dungeon?.lastBossDefeated),
        hadFight:
          roomHasClearCountingType(roomFoes)
          || ((dungeon?.room?.roomId & 0xff) === id && (dungeon?.roomKillCount ?? 0) > 0),
      });
      secretLatchRooms.add(id);
      const persistClear =
        ((dungeon?.room?.roomId & 0xff) === id && (dungeon?.roomKillCount ?? 0) > 0)
        || roomHasClearCountingType(roomFoes)
        || (
          effect !== SECRET.NONE
          && effect !== SECRET.BLOCK_DOOR
          && effect !== SECRET.BLOCK_STAIRS
        )
        || shutter
        || revealItem;
      if (persistClear && dungeon) {
        dungeon.clearedRooms.add(id);
      }
      if (revealItem) fx.playSfx('item_appears');
      if (shutter && dungeon) {
        const sides = shutterSidesNeedingOpen(dungeon.doorState, room);
        beginAnimatedShutterOpen(room, sides);
        setStatus(
          sides.length
            ? `Room clear — shutter${sides.length > 1 ? 's' : ''} open${revealItem ? ' + item' : ''}`
            : `Room clear${revealItem ? ' — item appears' : ''}`,
        );
      } else if (revealItem) {
        setStatus(item?.itemType === 0x19 ? 'A key appears!' : 'An item appears!');
      } else if (effect === SECRET.BLOCK_DOOR || effect === SECRET.BLOCK_STAIRS) {
        setStatus(
          effect === SECRET.BLOCK_STAIRS
            ? 'Room clear — push the block for stairs'
            : 'Room clear — push the block',
        );
      }
    }
    syncRoomItemPosition(item, roomFoes);
  }

  /**
   * Hide every copy of this cell's floor item. The streaming-anchor alias
   * and the leftover map slot can be different objects; taking one used to
   * leave the other sitting on the floor (and keys keep incrementing).
   * @param {number} id
   * @param {object | null} [taken]
   */
  function markFloorItemTaken(id, taken = null) {
    const rid = id & 0xff;
    dungeon.takenItems.add(rid);
    const hide = (item) => {
      if (!item) return;
      item.taken = true;
      item.visible = false;
      item.carried = false;
    };
    hide(taken);
    hide(roomItems.get(rid));
    if ((dungeon.room?.roomId & 0xff) === rid) hide(roomItem);
    snapshotDungeonProgress();
  }

  /**
   * Floor items belong to a room; taking one is this hero's. Shared
   * `stepRoomSecrets` only ran for the first player in the world, so player
   * two could stand on a key forever. Walk the leftover map rather than
   * only the occupying-cell slot — that slot can disagree with the sprite
   * under their feet.
   */
  function tryPickupCurrentRoomItem() {
    if (mode === 'overworld') {
      tryPickupOwRoomItem();
      return;
    }
    if (mode !== 'dungeon' || !dungeon?.room) return;
    const seen = new Set();
    /** @type {[number, NonNullable<typeof roomItem>][]} */
    const candidates = [];
    for (const [id, item] of roomItems) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      candidates.push([id & 0xff, item]);
    }
    if (roomItem && !seen.has(roomItem)) {
      candidates.push([occupyingRoomIdOf(focus.current), roomItem]);
    }
    let picked = null;
    for (const [id, item] of candidates) {
      picked = tryPickupRoomItem(item, link.x, link.y);
      if (picked == null) continue;
      markFloorItemTaken(id, item);
      break;
    }
    if (picked == null) return;
    const label = grantRoomItem(inv, picked, { level: dungeon.level });
    onGrantedItem(picked);
    refreshHud();
    refreshOpenMenus();
    fx.playSfx('item_taken');
    if (picked === 0x1b && hasTriforce(inv, dungeon.level)) {
      fx.playFanfare('triforce');
      holdingTriforceLift = true;
      startItemLift(0x1b);
      startTriforceCeremony(triforceCeremony, focus.current?.index ?? 0);
      pendingBriefingLevel = dungeon.level;
      setStatus(
        dungeon.level >= 8
          ? `Got ${label}! ${triforceCount(inv)}/8 — Level 9 awaits`
          : `Got ${label}! Level ${dungeon.level} clear`,
      );
    } else {
      setStatus(`Got ${label}!`);
      tellItemStory(picked);
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
        persistSave();
        endingUi.begin({ quest, name: saveName, deaths: deathCount });
        presentCinematic();
        fx.playFanfare('zelda');
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
    if (tick.playCharTune) fx.playSfx('text');
    if (tick.startSong) fx.playMusic('ending');
    if (tick.silence) fx.stopMusic();
    world.visible = tick.worldVisible;
    linkSprite.visible = tick.heroesVisible;
    for (const g of enemyGfx.values()) {
      // Keep Zelda (and Link) while the heroes are meant to be on screen.
      g.visible = tick.heroesVisible && g.visible;
    }
    if (tick.finished) {
      endingUi.hide();
      world.visible = true;
      adoptSessionLayout();
      void beginSecondQuestAfterVictory();
    }
  }

  /**
   * Combat, which is two things wearing one coat.
   *
   * Some of it belongs to the place — stepping the foes, flying the arrows,
   * spawning at the edges — and must happen once however many players are
   * standing in it. The rest belongs to *this* hero: their swing, what hits
   * them, their shove and their invulnerability. `shared` marks the first
   * half; everything unmarked runs for every player.
   *
   * The two are interleaved rather than separated because the order is
   * load-bearing (a swing resolves before the foes move, contact after) and
   * gathering them into two passes would reorder a single player's frame
   * against itself. This way one player's frame is exactly what it was.
   */
  function stepCombat() {
    const shared = firstInWorldThisFrame('combat');
    if (shared) {
      // Streamed foes stay inert until their sprite enters the camera.
      const revealed = activateEnemiesInView(
        enemies,
        (e) => !rectFullyOffEveryCamera(e, sessionCameras(), 0),
      );
      for (const e of revealed) {
        const roar = bossRoarSfx(e.objType);
        if (roar) fx.playSfx(roar);
        if (e.objType === OBJ.POND_FAIRY) fx.playSfx('item_taken');
      }
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
      // MakeSwordShot / MakeMagicShot fire as the swing reaches state 3.
      if (swordSpawnsShot(sword, swordPrevPhase)) {
        const shotDir = sword.dir ?? link.dir;
        const shotBusy = (kind) =>
          projectiles.some((p) => p.friendly && p.alive && p.kind === kind);
        if (isRodSwing(sword)) {
          if (!shotBusy(PROJ.MAGIC_SHOT) && !shotBusy(PROJ.SWORD_SHOT)) {
            projectiles.push(shootMagicRod(link.x, link.y, shotDir));
            fx.playSfx('magic_shot');
          }
        } else if (
          swordBeamHealthOk(inv)
          && inv.sword > 0
          && !shotBusy(PROJ.SWORD_SHOT)
        ) {
          projectiles.push(shootSwordBeam(link.x, link.y, shotDir, inv.sword));
          // MakeSwordShot plays DMC sample $01.
          fx.playSfx('sword_shot');
        }
      }
    }

    if (shared) tickBombs();

    const bounds = enemyBounds();
    const owGrid = mode === 'overworld' ? screen?.tileGrid ?? null : null;
    const tileGrid = mode === 'dungeon' ? dungeonTileGrid : owGrid;
    const baseTileOpts = mode === 'dungeon' ? dungeonTileOpts(inv) : {};
    const grids =
      mode === 'overworld'
        ? owRooms.gridMap()
        : mode === 'dungeon'
          ? uwRooms.gridMap()
          : null;
    const tileOpts = grids
      ? {
          ...baseTileOpts,
          collidingTile: (x, y, dir) =>
            getMonsterCollidingTileMulti(grids, roomId, x, y, dir, baseTileOpts),
          standingTile: (x, y) => standingTileMulti(grids, roomId, x, y),
        }
      : baseTileOpts;
    // Who each foe is coming for. One hero today, so every foe resolves to
    // the same answer the single `chase` used to hold. The positions are
    // snapshotted before the loop, as they always have been: a Wallmaster
    // capture assigns to a `link` mid-loop, and pursuit must not see that
    // until the next frame.
    const heroes = targetableLinks(players, focus.current?.world);
    // The live body is who this world's step is simulating. If the roster
    // copy ever drifted, foes must still chase the hero standing here.
    if (link && !heroes.includes(link)) heroes.push(link);
    const heroPositions = heroes.map((h) => ({ x: h.x, y: h.y }));
    if (shared && inv.clock && shouldClearClock(clockWorldId, clockWorldHere(), enemies)) {
      endClockFreeze();
    }
    const clockActive = Boolean(inv.clock) && clockIsHere();
    const pondCeremonies = enemies.filter(
      (e) => e?.alive && e.objType === OBJ.POND_FAIRY && pondFairyOrbiting(e),
    );
    const foeHalted = (e) =>
      enemyIsClockFrozen(e)
      || pondCeremonies.some((f) => pondFairyFreezesEnemy(f, e));

    // Edge slide-in: place pending foes on open border cells. Each foe is
    // placed against *its own* room's grid — a `monsterEntry` neighbour used
    // to sit edge-pending forever (invisible, inert, and still holding a
    // monster slot) because only the anchor room's foes were ever considered.
    // New spawns are not clock-frozen (only foes tagged at pickup).
    if (shared && mode === 'overworld') {
      for (const e of enemies) {
        if (!e.edgePending || foeHalted(e)) continue;
        const home = (e.homeRoomId ?? roomId) & 0xff;
        const homeGrid = home === (roomId & 0xff)
          ? owGrid
          : owRooms.tileGrid(home);
        if (!homeGrid) continue;
        // tryEdgeSpawn works in the home room's own local space; Link has to
        // be expressed there too so the "too close to Link" test holds.
        const linkLocal = offsetToRoom(home, link.x, link.y);
        const placed = tryEdgeSpawn(e, homeGrid, linkLocal, pickRng);
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
      if (screen?.attrs?.wave) fx.playSfx('sea');
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
    for (const e of shared ? enemies : []) {
      if (!enemyCombatActive(e)) continue;
      if (!foeHalted(e)) {
        const aim = enemyTarget(e, {
          targets: heroPositions,
          bait,
          anchorRoomId: roomId,
          confineToHome: mode === 'dungeon',
        });
        const drag =
          wallmasterIsCapturing(e)
            ? activePlayers(players).find((p) => wallmasterHoldsPlayer(e, p.index))?.link
            : null;
        stepEnemy(e, enemyBoundsFor(e), tileGrid, {
          chase: aim.chase,
          link: drag ?? (aim.index < 0 ? null : heroes[aim.index]),
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
          target: aim.chase,
          rngByte: dropRng,
        });
        if (shootSfx) fx.playSfx(shootSfx);
      } else {
        // Clock / pond freeze skips AI, but Obj_Shove still runs.
        if ((e.shovePixels ?? 0) > 0) {
          stepEnemyShove(e, enemyBoundsFor(e), tileGrid, tileOpts, {
            skipTiles: enemyIgnoresTiles(e.objType),
          });
        }
        if (e.invuln > 0) e.invuln -= 1;
      }
    }
    // Continuous streaming can leave walkers planted on trees/rocks after a
    // seam rebase or a late tile-grid load — slide them back onto open ground.
    if (shared && grids) {
      ejectEnemiesFromSolid(
        enemies.filter(
          (e) =>
            enemyCombatActive(e)
            && !foeHalted(e)
            && !wallmasterIsCapturing(e),
        ),
        tileGrid,
        tileOpts,
      );
    }

    // Wallmaster trip end → that hero to the dungeon entrance (after slide,
    // not on first touch). Allies keep their cell; a room reload would take
    // everyone.
    const capturer = enemies.find((e) => e.wallmasterWarpPending);
    if (capturer && mode === 'dungeon' && dungeon) {
      const victimIndex = capturer.wallmasterVictim ?? focus.current?.index ?? 0;
      finishWallmasterCapture(capturer);
      if ((focus.current?.index ?? 0) === victimIndex) return;
    }

    const meHeld = linkHeldByWallmaster();
    // Halt for the whole slide (ObjState $40), not just contact frames.
    if (meHeld) inv.paralyzed = 2;
    for (const e of enemies) {
      // Clock: keep Link topped up with invuln like NES InvClock while active.
      if (clockActive && inv.invuln < 8) inv.invuln = 8;
      if (!enemyCombatActive(e) || enemyIsHidden(e)) continue;
      // During this hero's slide, only the capturer may touch them.
      if (meHeld && !wallmasterHoldsPlayer(e, focus.current?.index ?? 0)) continue;
      // Fountain visitor: skip Like-Like / Wallmaster / contact, not only HP.
      if (focus.current?.pondFairyHalt) continue;
      if (!enemyTouchesLink(e, link.x, link.y)) {
        if (e.objType === OBJ.LIKE_LIKE) e.captureTimer = 0;
        continue;
      }
      handleEnemyContact(e);
    }
    projectiles.push(...newShots);
    enemyBooms.push(...newBooms);
    if (shared && mode === 'dungeon' && statueState) {
      const marks = targetableLinks(players, focus.current?.world);
      projectiles.push(...stepStatues(statueState, marks.length ? marks : link));
    }

    // Flying them is the world's job; being hit by one is this hero's.
    // `bounds` is this hero's camera. Shared stepping belongs to whoever
    // arrives first, so a leftover ally's beam would die on player one's
    // playfield. Union that camera with the shot's occupying cell.
    const me = focus.current;
    for (const p of projectiles) {
      if (shared) {
        const box =
          mode === 'overworld' || mode === 'dungeon'
            ? shotMotionBounds(mode, p.x, p.y, roomId, cam)
            : bounds;
        stepProjectile(p, box);
      }
      if (p.friendly) {
        for (const e of shared ? enemies : []) {
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
      // Shield and harm wait until this hero has moved and their sword has
      // been stepped. Testing every ally during the shared pass hit player
      // two with last frame's facing (and a swing that had not yet ended).
      if (!me?.link || !projectileTouchesLink(p, me.link.x, me.link.y) || p.damage <= 0) {
        continue;
      }
      const shield = shotBlockedByShield(p, me.link, me.inv, {
        idle: !isSwordActive(me.sword),
      });
      if (shield === SHIELD_RESULT.PARRY) {
        fx.playSfx('shield');
        bounceProjectile(p);
        continue;
      }
      if (shield !== SHIELD_RESULT.HARM) continue;
      hurtLinkFrom(p.dir, p.damage);
      p.alive = false;
    }
    // HandleShotBlocked: a spent magic-rod shot leaves a fire when the Book of
    // Magic is held. The fire bypasses the candle's once-per-room limit.
    for (const p of shared ? projectiles : []) {
      if (p.alive || !p.friendly || p.kind !== PROJ.MAGIC_SHOT) continue;
      if (!inv.book || flames.length >= FLAME_SLOTS) continue;
      const fire = createOwFlame(p.x, p.y, p.dir);
      flames.push(fire);
      fx.playSfx('flame');
      if (mode === 'overworld') applyOwSecretReveal('burn', fire.x, fire.y);
    }
    if (shared) projectiles = projectiles.filter((p) => p.alive);

    for (const f of shared ? flames : []) {
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
    if (shared) flames = flames.filter((f) => f.alive);

    if (shared && mode === 'dungeon') checkZeldaRescue();

    // Each hero may have a boom in the air; it comes back to whoever threw
    // it — not whoever the world happened to step first this frame.
    if (shared && boomerangs.length) {
      const here = focus.current?.world;
      const throwers = activePlayers(players)
        .filter((p) => p.world === here)
        .map((p) => ({ index: p.index, x: p.link.x, y: p.link.y }));
      const next = [];
      for (const boom of boomerangs) {
        const target = boomerangReturnPos(boom, throwers, null);
        if (!target) continue;
        stepBoomerang(boom, target.x, target.y);
        if (boom.phase === BOOM_PHASE.DONE) continue;
        for (const e of enemies) {
          if (e.edgePending || enemyAwaitingView(e)) continue;
          const wasAlive = e.alive;
          const hit = tryBoomerangHitEnemy(e, boom);
          applyWeaponHit(e, wasAlive, hit);
        }
        next.push(boom);
      }
      boomerangs = next;
    }

    // Goriya (and other) hostile boomerangs — return to owner. Flying is
    // the world's; parry and harm wait until this hero has moved, same as
    // rocks, or player two's shield is a frame late.
    if (enemyBooms.length) {
      if (shared) {
        const next = [];
        for (const boom of enemyBooms) {
          const owner = enemies.find((e) => e.id === boom.ownerId && e.alive);
          if (owner && foeHalted(owner)) {
            next.push(boom);
            continue;
          }
          const rx = owner?.x ?? boom.x;
          const ry = owner?.y ?? boom.y;
          stepBoomerang(boom, rx, ry);
          if (boom.phase === BOOM_PHASE.DONE) continue;
          next.push(boom);
        }
        enemyBooms = next;
      }
      const hero = focus.current;
      for (const boom of enemyBooms) {
        if (!hero?.link || boom.phase === BOOM_PHASE.DONE) continue;
        const owner = enemies.find((e) => e.id === boom.ownerId && e.alive);
        if (owner && foeHalted(owner)) continue;
        if (!enemyBoomerangHitsLink(boom, hero.link.x, hero.link.y)) continue;
        if (!isSwordActive(hero.sword) && dirsAreOpposite(hero.link.dir, boom.dir)) {
          fx.playSfx('shield');
          boom.phase = BOOM_PHASE.DONE;
          continue;
        }
        hurtLinkFrom(boom.dir, 1);
        boom.phase = BOOM_PHASE.DONE;
      }
      enemyBooms = enemyBooms.filter((b) => b.phase !== BOOM_PHASE.DONE);
    }

    if (shared && bait) {
      stepBait(bait);
      for (const e of enemies) {
        if (tryFeedGrumble(e, bait)) {
          // InitGrumble / UpdateGrumble3: room UW-item flag + clear InvFood.
          const home = e.homeRoomId ?? roomId;
          if (dungeon?.takenItems) dungeon.takenItems.add(home & 0xff);
          inv.food = 0;
          setStatus('Hungry Goriya eats the bait!');
          fx.playSfx('secret');
          refreshHud();
          refreshOpenMenus();
        }
      }
      if (!bait.alive) bait = null;
    }

    // Drops are the world's, but picking one up is the hero's — running this
    // for everyone is what lets either player take the rupee they walked over.
    stepDrops(shared);
    if (shared) {
      stepShutterAnims();
      stepRoomSecrets();
      refreshStubLabel();
      syncToolSprites();
      syncDropSprites();
      syncPersonWareSprites();
    }
    tryPickupCurrentRoomItem();

    if (inv.invuln > 0) inv.invuln -= 1;
    stepLinkStatus(inv);
    if (shared && flutePulse > 0) flutePulse -= 1;
    // Room clamp / shove / solid-eject fight the hand — leave position to the capturer.
    if (!linkHeldByWallmaster()) {
      applyShove();
      ensureLinkNotInSolid();
    }
    pinWallmasterCapture();

    // QoL: owning a candle lights this occupying cell ~1s after entry.
    // Per-room so leftover `$02` does not tick (or inherit) `$01`'s stay.
    if (mode === 'dungeon') {
      const occ = uwHeroDoorContext();
      const state = candleForRoom(asCandleStore(candleRoom), occ.occId);
      if (
        firstInWorldThisFrame(`candle:${occ.occId & 0xff}`)
        && stepDarkRoomAutoLight(state)
      ) {
        syncDarkOverlay();
      }
    }
  }

  function syncDarkOverlay() {
    if (mode !== 'dungeon' || !dungeon) {
      darkOverlay.visible = false;
      doorFrameLayer.tint = 0xffffff;
      return;
    }
    // Occupying cell, not the streaming anchor: a leftover dark room must
    // stay dark in its view when a friend is standing in a lit neighbour.
    const pack = uwHeroDoorContext().occRoom ?? dungeon.room;
    const occId = pack?.roomId ?? dungeon.room?.roomId;
    if (!roomIsDark(pack, candleForRoom(asCandleStore(candleRoom), occId))) {
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

  /**
   * Room-local push block for this cell. Leftover rooms keep their own object
   * so walking away does not steal the block or leave $B0 collision with
   * nothing to shove.
   * @param {object | null | undefined} room
   */
  function ensurePushBlock(room) {
    if (!room) return null;
    const id = room.roomId & 0xff;
    if (pushBlocks.has(id)) return pushBlocks.get(id) ?? null;
    const tiles = room.squares ? roomToTileGrid(room, [...UW_PRIMARY_SQUARES]) : [];
    const origin = { x: floorFrame().x, y: floorFrame().y };
    const block = createPushBlock(room, origin, tiles);
    if (block && dungeon?.pushedRooms.has(id)) {
      block.state = PUSH_STATE.DONE;
      block.complete = true;
      block.y -= 0x10;
      setUwSquareAt(block.homeX, block.homeY, 0x74, id);
      setUwSquareAt(block.x, block.y, 0xb0, id);
      if (pushSpawnsStairs(room)) {
        setUwSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE, id);
        patchRoomSquareAt(BLOCK_STAIRS_POS.x, BLOCK_STAIRS_POS.y, BLOCK_STAIRS_TILE, id);
      }
    }
    pushBlocks.set(id, block);
    return block;
  }

  function tickPushBlock(inputMask) {
    if (mode !== 'dungeon' || !dungeon) return;
    if (firstInWorldThisFrame('pushBlocks')) {
      beginPushBlockFrame(pushBlocks.values());
    }
    const door = uwHeroDoorContext();
    const block = ensurePushBlock(door.occRoom);
    pushBlock = block;
    if (!block) return;
    const occId = door.occId & 0xff;
    const local = door.localLink;
    const wasIdle = block.state === PUSH_STATE.IDLE;
    const beforeX = block.x;
    const beforeY = block.y;
    // Only this cell's foes gate the push (streamed neighbours must not).
    const roomFoes = enemiesInRoom(enemies, occId);
    const cleared =
      dungeon.clearedRooms.has(occId)
      || secretLatchRooms.has(occId)
      || (roomAllDead(roomFoes) && roomMayClear(roomFoes, spawnedRooms.has(occId)));
    const inputDir = pickSingleDir(inputMask);
    // One walk-row/column off looks aligned (block is 16×16) but NES needs an
    // exact axis match — ease Link onto that axis while he keeps shoving.
    if (wasIdle && cleared) {
      const nudged = nudgeLinkOntoPushAxis(block, local, inputDir);
      if (nudged) {
        writeUwLocal(occId, local);
        if ((block.pushTimer ?? 0) === 0) setStatus('Lining up with the block…');
      }
    }
    const shoving = linkPushingBlock(block, local, inputDir);
    if (shoving) block.heldThisFrame = true;
    // Hint when Link is lined up and shoving but RoomAllDead is still false.
    if (wasIdle && !cleared && shoving && (block.pushTimer ?? 0) === 0) {
      const left = roomFoes.filter((e) => countsTowardRoomClear(e)).length;
      setStatus(`Clear ${left} foe${left === 1 ? '' : 's'} to push`);
    }
    const { justCompleted } = stepPushBlock(block, local, inputDir, cleared, {
      persistTimer: true,
    });
    if (wasIdle && block.state === PUSH_STATE.MOVING) {
      // ChangeTileObjTiles($74) at source — full 2×2, then sprite takes over.
      setUwSquareAt(beforeX, beforeY, 0x74, occId);
      patchRoomSquareAt(beforeX, beforeY, 0x74, occId);
    }
    if (justCompleted && dungeon && door.occRoom) {
      // ChangeTileObjTiles($B0) at destination — full 2×2.
      setUwSquareAt(block.x, block.y, 0xb0, occId);
      dungeon.pushedRooms.add(occId);
      applyPushBlockRoomArt(occId);
      if (pushSpawnsStairs(door.occRoom)) {
        const sx = BLOCK_STAIRS_POS.x;
        const sy = BLOCK_STAIRS_POS.y;
        setUwSquareAt(sx, sy, BLOCK_STAIRS_TILE, occId);
        patchRoomSquareAt(sx, sy, BLOCK_STAIRS_TILE, occId);
        setStatus('Stairs appear!');
        fx.playSfx('secret');
      } else if (pushOpensShutters(door.occRoom)) {
        const sides = shutterSidesNeedingOpen(dungeon.doorState, door.occRoom);
        beginAnimatedShutterOpen(door.occRoom, sides);
        setStatus(sides.length ? `Block pushed — shutter open` : 'Block pushed');
      } else {
        setStatus('Block pushed');
      }
    }
  }

  function syncRaftSprite() {
    const ride = raftInWorld() ?? currentRaft();
    if (ride.active) {
      if (!raftGfx) {
        // Anim_ItemFrameTiles slot $09 → tile $6C (wide raft).
        const laid = items.itemTexture(chrTileForItemId(0x0c));
        raftGfx = new Sprite(laid.texture);
        raftGfx.scale.set(laid.narrow ? 1 : 1);
        enemyLayer.addChild(raftGfx);
      }
      raftGfx.visible = true;
      raftGfx.x = ride.x;
      raftGfx.y = ride.y;
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
    const activeBooms = [...liveBoomerangs(boomerangs)];
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
    // Coords are room-local; leftover rooms convert into the current anchor.
    let moving = null;
    let movingRoom = roomId;
    for (const [id, b] of pushBlocks) {
      if (b?.state === PUSH_STATE.MOVING) {
        moving = b;
        movingRoom = id;
        break;
      }
    }
    if (moving) {
      const tex = ensurePushBlockTexture();
      if (tex) {
        if (!pushGfx) {
          pushGfx = new Sprite(tex);
          enemyLayer.addChild(pushGfx);
        } else if (pushGfx.texture !== tex) {
          pushGfx.texture = tex;
        }
        const here = offsetFromRoom(movingRoom, moving.x, moving.y);
        pushGfx.visible = true;
        pushGfx.x = here.x;
        pushGfx.y = here.y;
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
      bomb.owner = focus.current?.index ?? 0;
      bombs.push(bomb);
      refreshHud();
      fx.playSfx('bomb_set');
      setStatus(`Bomb set (${inv.bombs} left)`);
      return;
    }

    if (slot === B_ITEM.BOOMERANG) {
      if (!inv.boomerang && !inv.magicBoomerang) {
        setStatus('No boomerang');
        return;
      }
      if (playerBoomerang(boomerangs, focus.current?.index ?? 0)) {
        setStatus('Boomerang out');
        return;
      }
      boomerangs.push(
        throwBoomerang(
          link.x,
          link.y,
          link.dir,
          Boolean(inv.magicBoomerang),
          focus.current?.index ?? 0,
        ),
      );
      fx.playSfx('arrow');
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
      refreshOpenMenus();
      setStatus('Bait dropped');
      return;
    }

    if (slot === B_ITEM.CANDLE) {
      if (flames.length >= FLAME_SLOTS) {
        setStatus('Flame already out');
        return;
      }
      if (mode === 'overworld') {
        const result = tryUseCandle(
          inv,
          candleForRoom(asCandleStore(candleRoom), occupyingRoom(roomId, link.x, link.y).roomId),
          null,
        );
        if (!result.ok) {
          setStatus(result.reason ?? 'Candle failed');
          return;
        }
        const lit = createOwFlame(link.x, link.y, link.dir);
        flames.push(lit);
        applyOwSecretReveal('burn', lit.x, lit.y);
        fx.playSfx('flame');
        setStatus('Candle flame');
        return;
      }
      const occ = uwHeroDoorContext();
      const result = tryUseCandle(
        inv,
        candleForRoom(asCandleStore(candleRoom), occ.occId),
        occ.occRoom ?? dungeon?.room,
      );
      if (!result.ok) {
        setStatus(result.reason ?? 'Candle failed');
        return;
      }
      flames.push(createOwFlame(link.x, link.y, link.dir));
      fx.playSfx('flame');
      syncDarkOverlay();
      setStatus(result.lit ? 'Candle lights the room' : 'Candle flame');
      return;
    }

    if (slot === B_ITEM.POTION) {
      if (canShowLetter(caveView()?.cave, inv)) {
        showLetter(inv);
        fx.playSfx('secret');
        caveView()?.refreshWares(caveTaken, false, inv);
        refreshHud();
        refreshOpenMenus();
        setStatus('You showed the letter — the wares appear');
        // Switch from the locked refusal to the medicine pitch.
        openCaveDialogue(caveView()?.cave);
        return;
      }
      const result = drinkPotion(inv);
      if (!result.ok) {
        setStatus(result.reason ?? 'No potion');
        return;
      }
      refreshHud();
      refreshOpenMenus();
      setStatus(result.potion ? 'Potion! (now blue)' : 'Potion restored hearts');
      return;
    }

    if (slot === B_ITEM.FLUTE) {
      if (!inv.flute) {
        setStatus('No recorder');
        return;
      }
      if (mode === 'overworld' && whirlwind?.alive) {
        setStatus('Whirlwind already out');
        return;
      }
      fx.playSfx('flute');
      if (mode === 'overworld') {
        // The cell Link occupies, not the stream anchor. A leftover recorder
        // blast used to drain (or skip) the friend's cave-mouth screen.
        const fluteRoom = occupyingRoom(roomId, link.x, link.y).roomId;
        // Room $42 reveals in Q1 and summons in Q2; the other ten invert that.
        if (fluteActionForRoom(fluteRoom, inv.quest === 2 ? 2 : 1) === 'reveal') {
          if ((fluteRoom & 0xff) !== (roomId & 0xff)) {
            pondSecret = restorePondSecret(owSecretsRevealed, fluteRoom);
            owWaterRgb = OW_WATER_RGB;
          }
          setStatus(
            startPondSecret(pondSecret)
              ? 'The waters recede…'
              : 'Recorder melody…',
          );
          return;
        }
        if (canSummonWhirlwind(inv, lastWhirlwindLevel)) {
          whirlwind = createWhirlwind(
            link.y,
            whirlwindSpawnX(roomId, link.x, link.y),
          );
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
      // WieldRod starts UpdateSwordOrRod; MakeMagicShot waits for state 3.
      if (!tryStartRod(sword, link.dir)) {
        return;
      }
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
      fx.playSfx('arrow');
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
   * @param {boolean} [mayOwnAnchor] false when this hero was already living
   *   deep in a neighbour — they must not steal the anchor. The seam lip
   *   still counts: a stride can land one pixel past the edge with
   *   gridOffset set, and the next frame has to be allowed to finish the exit.
   * @returns {boolean} true when a cross (or a maze loop) was handled
   */
  function resolveOwRoomCross(raftApproach, mayOwnAnchor = true) {
    if (!mayOwnAnchor && !raftApproach) return false;
    const cross = raftApproach ?? detectRoomCross(roomId, link.x, link.y);
    if (!cross) return false;
    const maze = checkMaze(mazeState, roomId, cross.dir);
    if (maze.playSecretTune) fx.playSfx('secret');
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
    // A leftover hero on the island dock is several rooms from the stream
    // anchor (ally walked back to the sword cave). One-screen `rebaseEntities`
    // would leave everyone else in the wrong cell; the rider's pose is then
    // overwritten, but the dock room never becomes the anchor they occupy.
    if (raftApproach) rebaseToRoom(cross.nextRoomId);
    else rebaseEntities(cross.dir);
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
    // Raft ride freezes normal movement (UpdateDock halt). Must run even if
    // Link is dying or `heroIsBusy` — otherwise a cave-load busy flag (or
    // combat zeroing hearts mid-ride) skips physics while the raft sprite is
    // left stranded.
    // Also runs while `screen` is briefly unbound so a dock soft-enter cannot
    // soft-lock the ride on a black playfield.
    //
    // The ride is this hero's. An ally standing on the pier keeps walking.
    const ride = currentRaft();
    if (ride.active) {
      if (!owScreenBound()) {
        prefetchOwRoom(roomId);
      }
      const r = stepRaftRide(link, ride, roomId);
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
        ride.crossed = true;
        softEnterOwRoom(r.cross.nextRoomId, r.cross.dir, {
          dropHomeRoom: fromRoom,
        });
        applyPlayCamera();
        syncRaftSprite();
        return;
      }
      if (r?.landed) {
        fx.playSfx('secret');
        setStatus('Docked');
      }
      // No stepCombat during dock scroll — Link is halted on the raft.
      syncRaftSprite();
      return;
    }

    if (heroIsBusy()) return;

    // Hold the world still for the frame or two a not-yet-streamed room needs
    // rather than stepping against the previous screen's tiles and warps.
    // Pickups and shield still run — an ally collecting in the leftover room
    // must not freeze because the new anchor is still fetching.
    if (!owScreenBound()) {
      prefetchOwRoom(roomId);
      if (activePlayers(players).length > 1) stepCombat();
      return;
    }

    const mayOwnAnchor = canClaimAnchorCross(link.x, link.y);

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
      const owTileOpts = overworldLinkTileOpts(moveMask);
      stepLink(
        link,
        screen.tileGrid,
        moveMask,
        overworldLinkQSpeed(link, screen.tileGrid, owTileOpts),
        CONTINUOUS_OW,
        owTileOpts,
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
          const from = occupyingOwPack();
          setStatus(`Whirlwind → Level ${level}`);
          void enterLevel(level, {
            fromRoomId: from.roomId,
            fromAttrs: from.attrs ?? screen?.attrs ?? {},
            spawnOverride: { x: 0x78, y: ty, dir: DIR.UP },
          }).catch((err) => {
            console.error('whirlwind enterLevel failed', level, err);
          });
          return;
        }
      }
      syncWhirlwindSprite();
      // While the tornado is out, do not rebase or walk into a cave mouth —
      // leftover `$F0` used to trip `detectRoomCross`, and a cave on this
      // screen (ally inside) used to swallow the rider mid-flight.
      return;
    }

    syncRaftSprite();
    syncWhirlwindSprite();

    // Continuous OW: dock-room water blocks south look-ahead on the northern
    // shore, so the seam is never crossed. Force the NES post-scroll entry
    // (dock room at Y=$3D) when Link is on the south lip with the raft.
    const raftApproach = !fairyHalt
      ? planRaftNorthApproachFromAnchor(link, roomId, inv)
      : null;
    // Cull/release before spawn so a seam-edge latch drop cannot share a frame
    // with a fresh wave of the same ROM spawn points.
    cullStreamEnemies();
    if (!resolveOwRoomCross(raftApproach, mayOwnAnchor)) {
      spawnVisibleOwRooms(link.dir);
    }

    // After seam/room updates — NES UpdateDock reads RoomId + ObjX/ObjY with
    // no facing check. Run here so a same-frame southbound cross into `$55`/`$3F`
    // can still catch the `$3D` north-edge trigger.
    if (!fairyHalt && tryStartRaftRide(link, roomId, inv, ride)) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
      fx.playSfx('secret');
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
    resolveOwRoomCross(null, mayOwnAnchor);

    // Push graves / rocks: exact X + vertical hold $10.
    // Occupying-room local — leftover $21 must not shove the host screen's grave.
    // Nudge first — standing under either half of the 16×16 looks aligned but
    // NES compares X equal (same gap as dungeon push blocks).
    const occOw = occupyingOwPack();
    const graveHold = focus.current?.gravePushHold;
    if (inputMask && occOw.secrets?.length && occOw.tileGrid && graveHold) {
      const pushDir = pickSingleDir(inputMask) || (link.dir & (DIR.UP | DIR.DOWN));
      const graveOpts = {
        bracelet: inv.bracelet,
        stairPositionIndex: occOw.attrs?.stairPositionIndex,
      };
      const occId = occOw.roomId & 0xff;
      const local = { ...link, ...offsetToRoom(occId, link.x, link.y) };
      const nudged = nudgeLinkOntoGraveAxis(
        occOw.secrets,
        owSecretsRevealed,
        occId,
        local,
        pushDir,
        graveOpts,
      );
      if (nudged) {
        const p = offsetFromRoom(occId, local.x, local.y);
        writeLinkMotion(link, local, p.x, p.y);
      }
      const pushed = tryPushGraveSecret(
        occOw.secrets,
        owSecretsRevealed,
        occId,
        local,
        occOw.tileGrid,
        pushDir,
        graveHold,
        graveOpts,
      );
      if (pushed.length) {
        for (const secret of pushed) {
          patchOwBgSquare(secret.col, secret.row, OW_FLOOR_TILES, occId);
          if (secret.dest && secret.destTiles) {
            patchOwBgSquare(secret.dest.col, secret.dest.row, secret.destTiles, occId);
          }
          if (secret.stairs) {
            patchOwBgSquare(secret.stairs.col, secret.stairs.row, SECRET_STAIRS_TILES, occId);
          }
        }
        fx.playSfx('secret');
        setStatus('Pushed a secret open!');
      }
    } else {
      graveHold?.clear();
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
    const owStanding = standingTileMulti(owRooms.gridMap(), roomId, link.x, link.y);
    const me = focus.current;
    if (me?.undergroundExitType && !isOwWarpTile(owStanding)) {
      me.undergroundExitType = 0;
    }
    const occPack = occupyingOwPack();
    if (!occPack.tileGrid) prefetchOwRoom(occPack.roomId);
    const ahead = neighborRoomId(occPack.roomId, link.dir);
    if (ahead != null && !owRooms.tileGrid(ahead)) prefetchOwRoom(ahead);
    const cave = me?.undergroundExitType
      ? null
      : checkCaveEntry(link, occPack.tileGrid, occPack.attrs, occPack.roomId, {
        standingTile: (x, y) =>
          standingTileMulti(owRooms.gridMap(), roomId, x, y),
      });
    if (!cave) {
      if (me) me.owWarpLatch = false;
    } else if (!me?.owWarpLatch) {
      if (me) me.owWarpLatch = true;
      if (cave.kind === 'level') {
        void enterLevel(cave.id).catch((err) => {
          console.error('enterLevel failed', cave.id, err);
          if (me) me.owWarpLatch = false;
        });
      } else {
        openCave(cave.id);
      }
    }
  }

  function stepDungeon(inputMask) {
    if (endingUi.visible || heroIsBusy()) return;
    if (!dungeon?.room || inv.dead) return;
    // Soft continuous rooms still need a tile grid; cellar hard-loads too.
    if (!dungeonTileGrid) {
      dungeonTileGrid = uwRooms.tileGrid(roomId) ?? null;
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

    // Walk and unlock in the cell this hero occupies. The world's `roomId`
    // is whoever last crossed; using it for DoorwayDir left player two
    // stuck on solid door tiles in a room they were already standing in.
    const door = uwHeroDoorContext();
    const { occId, occRoom, localLink } = door;
    // LevelBlock floor-item bits 5–6: rumble while this cell is next to the
    // boss. Re-request every frame; audio.js keeps one DMC slot in flight.
    const roar = bossNoiseSfx(occRoom?.floorItem?.bossNoise);
    if (roar) fx.playSfx(roar);
    const doorMode = door.mode;
    const inDoor = doorMode === 'corridor';
    const occGrid = uwOccupyingTileGrid(occId);

    const heldByWallmaster = linkHeldByWallmaster();
    if (
      !heldByWallmaster
      && !isSwordActive(sword)
      && inv.shovePixels <= 0
      && (inv.itemLiftTimer ?? 0) <= 0
    ) {
      const unlockedSide = tryUnlockFacingKeyDoor(
        localLink,
        occRoom,
        dungeon.doorState,
        inv,
      );
      if (unlockedSide) {
        refreshDungeonRoomVisual();
        refreshNeighborDoorVisual(occId, unlockedSide);
        refreshHud();
        fx.playSfx('door');
        setStatus(`Unlocked door (${inv.keys} keys left)`);
      }

      // NES: DoorwayDir ≠ 0 skips BoundByRoom + tile collision; otherwise
      // ObjectRoomBoundsUW + GetCollidingTileMoving both apply.
      if (doorMode === 'neighbor') {
        if (!occGrid) {
          void ensureUwRoom(occId);
        } else {
          stepLink(
            localLink,
            occGrid,
            inputMask,
            undefined,
            NO_ROOM_BOUNDS,
            dungeonHeroWalkOpts(occRoom, occGrid, inputMask, false),
          );
          writeUwLocal(occId, localLink);
        }
      } else if (inDoor) {
        // Door lip + water (L5 `$26` east/west moat): the floor column is
        // still "in the doorway" so BoundByRoom can walk into an east door,
        // but CheckLadder must still see `$F4` and deploy. Prefer the real
        // room grid whenever a stepladder would place.
        const lipOpts = occGrid
          ? prepareLadderTileOpts(
              occGrid,
              inputMask,
              'dungeon',
              dungeonTileOpts(inv),
              false,
            )
          : null;
        if (lipOpts?.ladder && occGrid) {
          stepLink(
            localLink,
            occGrid,
            inputMask,
            undefined,
            UW_ROOM_BOUNDS,
            lipOpts,
          );
          ladderObj = stepLadderObject(ladderObj, localLink);
        } else {
          ladderObj = null;
          stepLink(localLink, OPEN_UW_GRID, inputMask, undefined, NO_ROOM_BOUNDS);
          const roomIds = new Set(level.rooms.map((r) => r.roomId));
          clampUwDoorwayPath(localLink, occRoom, {
            doorState: dungeon.doorState,
            roomIds,
          });
        }
        writeUwLocal(occId, localLink);
      } else if (!occGrid) {
        void ensureUwRoom(occId);
      } else {
        const sameAnchor = (occId & 0xff) === (roomId & 0xff);
        const uwOpts = dungeonHeroWalkOpts(occRoom, occGrid, inputMask, sameAnchor);
        const inCellar = isCellarRoom(occRoom, level);
        const roomBounds = inCellar ? NO_ROOM_BOUNDS : UW_ROOM_BOUNDS;
        stepLink(localLink, occGrid, inputMask, undefined, roomBounds, uwOpts);
        if (sameAnchor) ladderObj = stepLadderObject(ladderObj, link);
        localLink.x = Math.max(left, Math.min(right, localLink.x));
        const minY = inCellar ? CELLAR_EXIT_MIN_Y : top;
        localLink.y = Math.max(minY, Math.min(bottom + 8, localLink.y));
        writeUwLocal(occId, localLink);
      }
    }

    tickPushBlock(inputMask);
    syncLadderSprite();
    cullStreamEnemies();
    spawnVisibleUwRooms(link.dir);
    stepCombat();

    // Cellar: walk up past Y<$40 to return (NES CheckSubroom mode 9).
    // Stairs / cellar remain hard cuts (full reload).
    if (isCellarRoom(occRoom, level)) {
      const up = checkCellarExit(localLink, occRoom, level, play, inputMask);
        if (up && !heroIsBusy()) {
        stairsLatch = true;
        void loadDungeonRoom(up.nextRoomId, DIR.DOWN, cellarReturnSpawn(up.attrsC)).then(
          (ok) => {
            if (!ok) stairsLatch = false;
          },
        );
        return;
      }
    } else if (checkUwStairsEntry(localLink, occGrid)) {
        if (!stairsLatch && !heroIsBusy()) {
        const cellarId = cellarForStairsRoom(level, occId);
        if (cellarId != null) {
          stairsLatch = true;
          dungeon.cellarSourceRoomId = occId;
          setStatus(`Stairs → cellar $${cellarId.toString(16)}`);
          fx.playSfx('stairs');
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

    if (door.me?.uwDoorwayBlockSide && doorwayLatchCleared(localLink, door.me.uwDoorwayBlockSide)) {
      if (dungeon.doorwayBlockSide === door.me.uwDoorwayBlockSide) {
        dungeon.doorwayBlockSide = null;
      }
      door.me.uwDoorwayBlockSide = null;
    }
    tryOpenPersonDialogue();

    // South doorway of the start room returns to overworld.
    if (
      (occId & 0xff) === (level.startRoom & 0xff)
      && localLink.gridOffset === 0
      && (localLink.dir & DIR.DOWN)
      && inDoorway(localLink, 'south')
    ) {
      void exitDungeon();
      return;
    }

    // No room-to-room exits from cellars (only the ladder).
    if (isCellarRoom(occRoom, level)) return;

    // Unlocked doors are a walkable path: cross at this hero's room seam,
    // then make that destination the world's streaming anchor.
    const after = uwHeroDoorContext();
    const cross = detectOwnedUwDoorCross(after.localLink, after.occRoom, {
      doorState: dungeon.doorState,
      rooms: level.rooms,
    });
    if (cross) {
      rebaseToRoom(cross.nextRoomId);
      link.x = cross.x;
      link.y = cross.y;
      link.dir = cross.dir;
      if (after.me) {
        after.me.uwOccRoomId = cross.nextRoomId;
        after.me.uwDoorwayBlockSide = entrySideForFacing(cross.dir);
      }
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
      fx.playMusic('title');
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
    refreshOpenMenus();
    persistSave('second quest');
    setStatus('SECOND QUEST — good luck!');
  }

  /**
   * @param {number} slot
   * @param {'new' | 'continue'} kind
   * @param {string} [name]
   */
  async function beginPlay(slot, kind, name = 'LINK') {
    // File continue from a live session (and title continue) must not
    // autosave a half-restored world over the slot being loaded.
    playing = false;
    activeSlot = slot;
    questCompleted = 0;
    endingUi.hide();
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
    for (const p of players) {
      p.undergroundExitType = 0;
      p.owWarpLatch = false;
    }
    hud.root.visible = true;
    world.visible = true;

    if (kind === 'continue') {
      const payload = saveStore.load(slot);
      if (!payload) {
        setStatus('Empty slot');
        return;
      }
      const startSecondQuest = saveStartsSecondQuest(payload);
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
      questCompleted = meta.questCompleted ?? 0;
      resetRupeeRoll(rupeeRoll, inv.rupees ?? 0);
      titleUi.hide();
      if (startSecondQuest) {
        // Legacy files have no `questCompleted`; promotion still requires it.
        questCompleted = 1;
        // Keep playing=true so persistSave inside the promotion writes Q2.
        playing = true;
        await beginSecondQuestAfterVictory();
        applyDebugKit();
        applyPartyCaps(sharedInv, activePlayers(players).length);
        focus.to(hostPlayer(players) ?? players[0]);
        refreshJoinHint();
        return;
      }
      // Keep playing=false until world is restored so bootstrap OW load
      // cannot overwrite a mid-dungeon save as overworld-only.
      applyDebugKit();
      applyPartyCaps(sharedInv, activePlayers(players).length);
      focus.to(hostPlayer(players) ?? players[0]);
      const healed = await restoreWorldFromSave(meta.position);
      applyPartySnapshot(players, meta.party, { skipPose: [0] });
      await restorePartyWorlds(meta.party, { includeHost: !healed });
      playing = true;
      refreshJoinHint();
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
    applyPartyCaps(sharedInv, activePlayers(players).length);
    titleUi.hide();
    await loadOverworldScreen(worldIndex.startScreen, {
      x: worldIndex.startX,
      y: worldIndex.startY,
      dir: worldIndex.startDir,
    });
    playing = true;
    refreshJoinHint();
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
    fx.playMusic('title');
  }

  let acc = 0;
  const stepMs = 1000 / TARGET_FPS;
  let last = performance.now();
  /** Frames `zeldaDebug.step()` has queued; consumed by the next ticker run. */
  let debugSteps = 0;
  /**
   * Hold the world still between animation frames (`?debug=1&pause=1`).
   *
   * A golden run has to start from a known frame. Without this the loop keeps
   * advancing on wall-clock time from the moment the page loads until the
   * harness gets around to its first `step()`, so how many frames the game had
   * already simulated depended on how long the browser took to boot — and the
   * hash of a run would change from one machine to the next.
   */
  let framePaused = urlParams.get('debug') === '1' && urlParams.get('pause') === '1';

  exposeDebugHandle();

  /**
   * One animation frame, simulated as the player in focus.
   *
   * Everything in here reads the world context of whoever `focus.on()` loaded.
   * At one player that is always player one and the swap is a no-op; the split
   * into a per-player part and a shared part (enemies, streaming, rendering)
   * comes next.
   */
  /**
   * One hero's physics step, in whatever place that hero is standing.
   *
   * Called with the focus already on them, so `mode`, `link` and the rest mean
   * this player. `device` is their controller: player one's keys and every
   * pad when alone, one set each in company.
   */
  function stepHero(device) {
    const mask = inv.paralyzed > 0 || inv.dead ? 0 : device.mask();
    if (mode === 'cave') {
      stepCave(mask);
    } else if (mode === 'overworld' && (screen || currentRaft().active)) {
      // Raft can outlive a brief unbound `screen` after a dock soft-enter;
      // keep stepping so UpdateDock still lands.
      stepOverworld(mask);
    } else if (mode === 'dungeon') {
      stepDungeon(mask);
    }
  }

  /** One hero's sprites, positioned for the frame just simulated. */
  function drawHero() {
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
    const tag = focus.current?.gfx?.tag;
    if (tag) {
      tag.x = link.x + 4;
      tag.y = drawY - 8;
    }
    drawSwordBlade();
  }

  function tickFrame() {
    const now = performance.now();
    if (debugSteps > 0) {
      // `zeldaDebug.step(n)` asks for exactly n simulated frames. Deriving
      // them from the wall clock made the count depend on how long the tool
      // call took, so a batch could silently simulate nothing at all.
      acc = stepMs * debugSteps;
      debugSteps = 0;
      last = now;
    } else if (framePaused) {
      // Keep the clock with us so resuming does not simulate the whole pause.
      last = now;
      acc = 0;
      return;
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
        if (demoTick.playTitleMusic) fx.playMusic('title');
        if (demoTick.finished) {
          demoUi.hide();
          inAttract = false;
          // File select still owns the screen; HUD returns when play begins.
          titleUi.setSlots(saveStore.listSlots());
          titleUi.show();
          setStatus('File select — Enter to start · O options');
          fx.playMusic('title');
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

    // Edge-detect buttons once per frame (not once per physics step), and
    // once per device: asking consumes the edge, so every player's buttons
    // are read here and read nowhere else.
    const pressed = inputs.map((device) => ({
      start: device.pressedStart(),
      a: device.pressedA(),
      b: device.pressedB(),
      select: device.pressedSelect(),
    }));
    // Start on an empty seat sits that player down. Start+Select on a
    // seated one stands them up. The last player cannot leave this way.
    const leaveConsumed = new Set();
    /** Start that sat someone down must not also open the submenu. */
    const joinConsumed = new Set();
    let joinConsumedStart = false;
    const pads = navigator.getGamepads?.() ?? [];
    const spare = joiningPads(pads, {
      padSlots: options.padSlots,
      activeIndexes: activePlayers(players).map((p) => p.index),
    });
    const spareStarts = padStartEdges.rising(spare, pads);
    if (playing && !deathUi.visible && !endingUi.visible) {
      for (const pad of spareStarts) {
        const seat = seatForJoiningPad(pad, {
          padSlots: options.padSlots,
          players,
          max: maxPlayers,
        });
        if (seat < 0) continue;
        if (!options.padSlots) options.padSlots = [null, 1, 2, 3];
        options.padSlots[seat] = pad;
        const joined = joinPlayer(seat);
        if (joined) {
          joinConsumed.add(joined);
          joinConsumedStart = true;
        }
      }
      for (let i = 0; i < inputs.length; i += 1) {
        const press = pressed[i];
        const occupant = players.find((p) => p.index === i);
        if (occupant?.active) {
          if (press.start && inputs[i].holdingSelect() && canLeave(players, occupant)) {
            leavePlayer(occupant);
            leaveConsumed.add(occupant);
          }
        } else if (press.start && !inputs[i].holdingSelect()) {
          const joined = joinPlayer(i);
          if (joined) {
            joinConsumed.add(joined);
            joinConsumedStart = true;
          }
        }
      }
    }

    // The ending and the continue menu are still the group's. Anyone's
    // Start pages the credits; dialogue and the submenu belong to whoever
    // opened them.
    const { start: startPressed, a: aPressed, b: bPressed } = {
      start: pressed[0].start && !joinConsumedStart,
      a: pressed[0].a,
      b: pressed[0].b,
    };

    // Mode $13 owns Start once Zelda is rescued.
    if (endingUi.visible) {
      stepEndingMode({ start: pressed.some((p) => p.start) });
      acc = 0;
      return;
    }

    // Only the reader (or a story-beat audience) can page the box.
    // Their press must not also swing a sword or open the submenu.
    const dialogueConsumed = new Set();
    if (storyPager?.holding() && storyBox.active) {
      let closedStory = null;
      for (const p of activePlayers(players)) {
        if (!playerIsStoryReader(p)) continue;
        const press = pressed[p.index];
        if (!press || !(press.a || press.b || press.start)) continue;
        dialogueConsumed.add(p);
        const res = storyPager.advance(p.index);
        if (res.turned || res.closed) fx.playSfx('text');
        if (res.allDone) {
          closedStory = { closed: true, kind: storyBox.kind, meta: storyBox.meta };
          storyBox.close();
          storyPager = null;
          break;
        }
      }
      if (closedStory) onDialogueClosed(closedStory);
    }
    for (const p of activePlayers(players)) {
      const box = playerTextBox(p);
      if (!box.active || playerIsStoryReader(p) || !playerCanPageDialogue(p)) continue;
      const press = pressed[p.index];
      if (!(press.a || press.b || press.start)) continue;
      dialogueConsumed.add(p);
      const res = box.advance();
      if (res.closed) {
        if (talkingPlayer === p) {
          talkingPlayer =
            activePlayers(players).find((q) => q !== p && playerTextBox(q).active) ?? null;
        }
        focus.on(p, () => onDialogueClosed(res));
      }
    }

    // Mode $08 reads Start and Select itself; see stepDeathMode.
    let deathInput = { select: pressed[0].select, start: startPressed };
    for (const p of activePlayers(players)) {
      const press = pressed[p.index];
      if (
        !press.start
        || dialogueConsumed.has(p)
        || leaveConsumed.has(p)
        || joinConsumed.has(p)
      ) {
        continue;
      }
      focus.on(p, () => {
        if (inv.dead) return;
        const ui = menuUi(p);
        if (ui.open) {
          ui.close();
          persistSave();
          return;
        }
        ui.toggle(inv, invView());
      });
    }
    focus.to(players[0]);

    // While a player's inventory is open they cycle their own B slot.
    for (const p of activePlayers(players)) {
      const ui = menuUi(p);
      if (!ui.open || ui.phase !== 'open' || dialogueConsumed.has(p)) continue;
      const press = pressed[p.index];
      if (!press.b) continue;
      focus.on(p, () => {
        const prevB = inv.selectedB;
        cycleBItem(inv);
        if (inv.selectedB !== prevB) fx.playSfx('rupee');
        refreshHud();
        ui.refresh(inv, invView());
      });
    }
    focus.to(players[0]);
    // NES CurVScroll ±3px/frame — slide panel + scroll the playfield.
    // Status bar docks to the bottom while the submenu is open (original layout).
    for (const ui of invUis) ui.tick();
    if (playerCount <= 1) {
      world.y = invUi.worldSlideY();
      hud.root.y = Math.round(invUi.hudDockT() * (QUAD_H - HUD_HEIGHT));
    }

    // Letter-show is the only B action allowed inside a cave (medicine shop).
    if (
      !inv.dead
      && !playerIsInMenu(players[0])
      && !textBox.active
      && mode === 'cave'
      && bPressed
      && canShowLetter(caveView()?.cave, inv)
    ) {
      tryUseB();
    }

    // Every hero swings their own sword and uses their own B item, unless
    // they are the one reading or they opened the submenu. A fountain halt
    // is that hero's — an ally underground must still be able to swing.
    for (const p of activePlayers(players)) {
      if (playerIsFrozenByDialogue(p) || playerIsInMenu(p) || dialogueConsumed.has(p)) continue;
      if (p.pondFairyHalt) continue;
      const press = pressed[p.index];
      if (!press.a && !press.b) continue;
      focus.on(p, () => {
        if (inv.dead || mode === 'cave') return;
        if (press.a) {
          const swung = canSwingSword(inv) && tryStartSword(sword, link.dir, inv.sword);
          if (swung) fx.playSfx('sword');
          if (inv.sword < 1) setStatus('No sword — stand still on the cave mouth');
        }
        if (press.b) tryUseB();
      });
    }
    focus.to(players[0]);

    while (acc >= stepMs) {
      acc -= stepMs;
      frameCounter = (frameCounter + 1) & 0xff;
      simTick += 1;

      // UpdateHeartsAndRupees → World_ChangeRupees: spin the status-bar total
      // one step every other frame, chirping the heart tune as it goes.
      // Keep rolling during cave speech so door-repair / shop fees are visible
      // while the text box is up (NES ticks the counter independently).
      if (stepRupeeRoll(rupeeRoll, inv.rupees ?? 0).playTune) {
        fx.playSfx('text');
        refreshHud();
      }

      // The submenu freezes only its owner, the same as a private conversation.
      // Story beats (`levelEntry`, `briefing`) still hold everyone. Cave Mode B
      // lets you walk the shop while the text crawls. Solo is unchanged: the
      // only player is the owner, so the world still stops for the goldens.

      // Keep an in-progress raft ride ticking even after death so Link is not
      // stranded mid-water with a frozen dock object. One hero down no longer
      // stops the others; the continue menu is the only death that holds the
      // whole party, and at one player that is still the ROM's own flow.
      const raftInProgress = activePlayers(players).some(
        (p) => p.world?.mode === 'overworld' && p.raftRide?.active,
      );
      if (deathUi.visible && !raftInProgress) {
        // Physics may run several steps per animation frame; the edge-
        // detected presses must only be seen by the first of them.
        stepDeathMode(deathInput);
        deathInput = NO_DEATH_INPUT;
        continue;
      }

      // GameMode $12 halts the world until hearts finish filling.
      if (triforceCeremonyActive(triforceCeremony)) {
        const finder =
          players.find((p) => p.active && p.index === (triforceCeremony.playerIndex ?? 0))
          ?? players[0];
        focus.on(finder, () => {
          const step = stepTriforceCeremony(triforceCeremony, inv);
          if (step.playFillTune) fx.playSfx('text');
          syncItemLiftSprite();
          refreshHud();
          if (step.finished) {
            refreshOpenMenus();
            persistSave();
            // Hearts are full and the palette has stopped flashing — now talk.
            if (pendingBriefingLevel != null) {
              const level = pendingBriefingLevel;
              pendingBriefingLevel = null;
              openLevelBriefing(level);
            }
          }
        });
        continue;
      }

      // Tune0 $40 is re-requested every frame; arbitration drops it when
      // square 1 is busy, so a single call would usually be swallowed.
      if (!inv.dead && (inv.halfHearts ?? 0) > 0 && (inv.halfHearts ?? 0) <= 2) {
        fx.playSfx('low_health');
      }

      rallyFollowers();

      stepCoopDeaths();

      // Each hero walks their own world, on their own device. Work shared by
      // everyone standing in one place — the foes, the collisions — is claimed
      // by whoever gets there first this tick; see firstInWorldThisFrame.
      for (const p of activePlayers(players)) {
        if (playerIsFrozenByDialogue(p) || playerIsInMenu(p) || p.deathSeq) continue;
        focus.on(p, () => stepHero(inputs[p.index]));
      }
    }

    // The rest of the frame is the view's, not the last hero simulated.
    focus.to(players[0]);

    // Each live cave keeps its fires going even when that interior is not
    // the one being captured this pass.
    for (const scene of caveScenes.values()) scene.tick();
    for (const box of textBoxes) box.tick();
    storyBox.tick();
    // Radar-only repaint: the mark pulse must breathe without rebuilding the
    // sprite-heavy half of the status bar every frame. Soft OW/UW room crosses
    // update `roomId` without `refreshHud`, so pass locator state here or the
    // player dot sticks until some other HUD event happens to catch up.
    uiFrame = (uiFrame + 1) & 0xffff;
    hud.pulseMap(uiFrame, currentMapMarks(), currentDungeonMapMarks(), {
      roomId: lookingRoomId(),
      mode,
      dungeon,
    });

    for (const p of activePlayers(players)) focus.on(p, drawHero);
    focus.to(players[0]);

    syncEnemySprites();
    drawBombs();
    presentViews();
    syncSessionMusic();

    syncTriforceFlash();

    // Collision probe readout + optional solid-tile overlay (?debug=1 / ?coll=1).
    // Player one's, like the rest of the status line.
    const attacking = isSwordActive(sword);
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
  }

  app.ticker.add(() => focus.on(players[0], tickFrame));
}

main().catch((err) => {
  setStatus(err.message || 'Failed to start');
  console.error(err);
});
