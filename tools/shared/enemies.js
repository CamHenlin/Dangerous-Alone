import {
  DIR,
  OW_FIRST_UNWALKABLE,
  OW_WALKABLE_REMAP,
  UW_BOUNDS,
  UW_FIRST_UNWALKABLE,
  getMonsterCollidingTile,
  normalizeOwTile,
} from './collision.js';
import { standingTile } from './world.js';
import { cellarKeeseSpawns } from './dungeonCellar.js';
import { objectTouchesLink } from './objectCollision.js';
import { rectsOverlap, swordDamage, swordHitbox } from './sword.js';
import { bombHits } from './bomb.js';
import {
  FOE_COUNTS_L1,
  FOE_COUNTS_OW,
  capMonsterList,
  monsterSlotsFree,
  resolveSpawns,
  tryAddMonster,
  tryAddMonsterToRoom,
} from './spawn.js';
import { BOOMERANG_STUN_FRAMES, boomerangHits } from './boomerang.js';
import { enemyChasesBait } from './bait.js';
import {
  BOSS,
  PATRA_CHILD,
  PATRA_CHILD_RED,
  bossHp,
  bossNeedsArrow,
  bossSize,
  isBossType,
  isDodongo,
  isGleeok,
  isGohma,
  isPatra,
  isPatraChild,
  isZelda,
} from './bosses.js';
import {
  CHILD_DIGDOGGER,
  DODONGO_STATE,
  clearGleeokHeads,
  damageGleeok,
  damageManhandla,
  expandBossFamily,
  ganonAcceptsSwordHit,
  ganonRegisterSwordHit,
  ganonSwordKoToBrown,
  gohmaEyeVulnerable,
  initBossAi,
  patraParentVulnerable,
  spawnDigdoggerChildren,
  spawnGleeokHead,
  stepBossAi,
  tryDodongoBombInteract,
} from './bossAi.js';
import { gleeokOverlapsHitbox, gleeokTouchesLink } from './gleeok.js';
import { damageHalfHeartsForType } from './damage.js';
import { DAMAGE, invincibilityMaskForType, isImmuneToDamage } from './damageMasks.js';
import { expandTrapGenerator, isTrapType, stepTrap } from './trapAi.js';
import { expandRupeeStash, isRupeeStash, RUPEE_STASH } from './rupeeStash.js';
import { isPersonType } from './moneyOrLife.js';
import {
  advanceGridOffset,
  goriyaDecideFacing,
  isGoriyaStyleFacing,
  isWandererType,
  onTileBoundary,
  tickWandererTurnTimer,
  truncateWandererGridOffset,
  turnRateForType,
  wandererDecideFacing,
} from './wandererAi.js';
import { stepTektite } from './tektiteAi.js';
import {
  BLUE_WIZZROBE,
  RED_WIZZROBE,
  initWizzrobe,
  isWizzrobeType,
  stepWizzrobe,
  wizzrobeIsVisible,
} from './wizzrobeAi.js';
import { POLS_VOICE, initPolsVoice, stepPolsVoice } from './polsVoiceAi.js';
import { BOULDER, BOULDER_SET, stepBoulderSet } from './boulder.js';
import {
  BLUE_LAMNOLA,
  MOLDORM,
  RED_LAMNOLA,
  damageWorm,
  expandWorm,
  isWormType,
  stepWorm,
} from './moldormLamnola.js';
import { GRUMBLE, createGrumble, isGrumble, stepGrumble } from './grumble.js';
import { FLAME_DAMAGE, flameHits } from './candle.js';
import {
  BLUE_LEEVER_STATE_QSPEEDS,
  QSPEED,
  RED_LEEVER_STATE_QSPEEDS,
  armosQSpeedFrac,
  consumeQSpeedPixels,
  qSpeedFracForType,
} from './objQSpeed.js';
import {
  DIRECTIONS8,
  FLYER_STATE,
  KEESE_FLYING_MAX_SPEED_FRAC,
  flyerSpeedThresholdTransition,
  keeseInitFlyerSpeed,
  moveFlyer,
} from './flyerMove.js';
import {
  GEL_SHOVE_QSPEED,
  GEL_SPLIT_START_QSPEED,
  GEL_SPLIT_START_TIMER,
  GEL_STATE,
  ZOL_GEL_TURN_RATE,
  gelSplitChildDirs,
  initialGelState,
  isGelType,
  isZolOrGelType,
  normalZolGelQSpeed,
  pickZolGelEdgeDelay,
  snapGelAfterShove,
  zolGelPaused,
} from './zolGelAi.js';

export {
  QSPEED,
  consumeQSpeedPixels,
  qSpeedFracForType,
  qSpeedToPxPerFrame,
  usesObjQSpeed,
} from './objQSpeed.js';

function oppositeDir(dir) {
  if (dir & DIR.UP) return DIR.DOWN;
  if (dir & DIR.DOWN) return DIR.UP;
  if (dir & DIR.LEFT) return DIR.RIGHT;
  if (dir & DIR.RIGHT) return DIR.LEFT;
  return 0;
}

/** ObjectTypeToHpPairs (Z_07.asm) — packed even/odd nibbles × $10. */
const HP_PAIRS = Object.freeze([
  0x06, 0x43, 0x25, 0x31, 0x12, 0x24, 0x81, 0x14, 0x22, 0x42, 0x00, 0xa9, 0x8f, 0x20, 0x00,
  0x3f, 0xf9, 0xfa, 0x46, 0x62, 0x11, 0x2f, 0xff, 0xff, 0x7f, 0xf6, 0x2f, 0xff, 0xff, 0x22,
  0x46, 0xf1, 0xf2, 0xaa, 0xaa, 0xfb, 0xbf, 0xf0,
]);

export const OBJ = Object.freeze({
  RED_LYNEL: 0x01,
  BLUE_LYNEL: 0x02,
  RED_MOBLIN: 0x03,
  BLUE_MOBLIN: 0x04,
  RED_GORIYA: 0x05,
  BLUE_GORIYA: 0x06,
  RED_OCTOROK_SLOW: 0x07,
  RED_OCTOROK_FAST: 0x08,
  BLUE_OCTOROK_SLOW: 0x09,
  BLUE_OCTOROK_FAST: 0x0a,
  RED_DARKNUT: 0x0b,
  BLUE_DARKNUT: 0x0c,
  BLUE_TEKTITE: 0x0d,
  RED_TEKTITE: 0x0e,
  BLUE_LEEVER: 0x0f,
  RED_LEEVER: 0x10,
  ZORA: 0x11,
  VIRE: 0x12,
  ZOL: 0x13,
  GEL: 0x14,
  GEL2: 0x15,
  POLS_VOICE,
  LIKE_LIKE: 0x17,
  PEAHAT: 0x1a,
  BLUE_KEESE: 0x1b,
  RED_KEESE: 0x1c,
  BLACK_KEESE: 0x1d,
  ARMOS: 0x1e,
  /** Invisible rockfall spawner (UpdateBoulderSet). */
  BOULDER_SET,
  /** Falling mountain rock (UpdateTektiteOrBoulder). */
  BOULDER,
  GHINI: 0x21,
  FLYING_GHINI: 0x22,
  BLUE_WIZZROBE,
  RED_WIZZROBE,
  WALLMASTER: 0x27,
  ROPE: 0x28,
  STALFOS: 0x2a,
  BUBBLE: 0x2b,
  BUBBLE_BLUE: 0x2c,
  BUBBLE_RED: 0x2d,
  /** Pond fairy fountain (InitPondFairy / UpdatePondFairy). */
  POND_FAIRY: 0x2f,
  GIBDO: 0x30,
  /** Rupee stash room generator → 10 pickups (InitRupeeStash). */
  RUPEE_STASH,
  /** Hungry Goriya / Grumble — bait gate. */
  GRUMBLE,
  RED_LAMNOLA,
  BLUE_LAMNOLA,
  MOLDORM,
  TRAP: 0x49,
  TRAP2: 0x4a,
  /** Money-or-life underworld person. */
  PERSON_LIFE_OR_MONEY: 0x51,
  /** Dead dummy (Armos/Ghini metastate). */
  DEAD_DUMMY: 0x5d,
  DODONGO: BOSS.DODONGO,
  DODONGO_1: BOSS.DODONGO_1,
  GOHMA: BOSS.GOHMA,
  GOHMA_RED: BOSS.GOHMA_RED,
  DIGDOGGER: BOSS.DIGDOGGER,
  DIGDOGGER_1: BOSS.DIGDOGGER_1,
  MANHANDLA: BOSS.MANHANDLA,
  AQUAMENTUS: BOSS.AQUAMENTUS,
  GANON: BOSS.GANON,
  ZELDA: BOSS.ZELDA,
  GLEEOK_2: BOSS.GLEEOK_2,
  GLEEOK_3: BOSS.GLEEOK_3,
  GLEEOK_4: BOSS.GLEEOK_4,
  GLEEOK_HEAD: BOSS.GLEEOK_HEAD,
  PATRA: BOSS.PATRA,
  PATRA_RED: BOSS.PATRA_RED,
  PATRA_CHILD,
  PATRA_CHILD_RED,
});

/** Leever dig / emerge cycle (simplified UpdateLeever). */
export const LEEVER_PHASE = Object.freeze({
  BURIED: 0,
  EMERGE: 1,
  ACTIVE: 2,
  DIG: 3,
});

export function isLeever(objType) {
  return objType === OBJ.BLUE_LEEVER || objType === OBJ.RED_LEEVER;
}

/** Draw colors (fallback stubs only). */
export const ENEMY_COLOR = Object.freeze({
  [OBJ.RED_LYNEL]: 0xc05030,
  [OBJ.BLUE_LYNEL]: 0x4060c0,
  [OBJ.RED_MOBLIN]: 0xc06020,
  [OBJ.BLUE_MOBLIN]: 0x4050a0,
  [OBJ.RED_GORIYA]: 0xc04040,
  [OBJ.BLUE_GORIYA]: 0x4060c0,
  [OBJ.RED_OCTOROK_SLOW]: 0xc04020,
  [OBJ.RED_OCTOROK_FAST]: 0xe05030,
  [OBJ.BLUE_OCTOROK_SLOW]: 0x4060c0,
  [OBJ.BLUE_OCTOROK_FAST]: 0x5080e0,
  [OBJ.RED_DARKNUT]: 0xc04020,
  [OBJ.BLUE_DARKNUT]: 0x4060c0,
  [OBJ.BLUE_TEKTITE]: 0x4060a0,
  [OBJ.RED_TEKTITE]: 0xc03030,
  [OBJ.BLUE_LEEVER]: 0x3060c0,
  [OBJ.RED_LEEVER]: 0xc04030,
  [OBJ.ZORA]: 0x40a060,
  [OBJ.VIRE]: 0x8060c0,
  [OBJ.ZOL]: 0x40a040,
  [OBJ.GEL]: 0x40a040,
  [OBJ.GEL2]: 0x40a040,
  [OBJ.POLS_VOICE]: 0xc0a040,
  [OBJ.LIKE_LIKE]: 0xc06080,
  [OBJ.PEAHAT]: 0xc06020,
  [OBJ.BLUE_KEESE]: 0x3040a0,
  [OBJ.RED_KEESE]: 0xa03030,
  [OBJ.BLACK_KEESE]: 0x303030,
  [OBJ.ARMOS]: 0x808080,
  [OBJ.BOULDER_SET]: 0x808080,
  [OBJ.BOULDER]: 0xa08060,
  [OBJ.GHINI]: 0xc0c0c0,
  [OBJ.FLYING_GHINI]: 0xc0c0c0,
  [OBJ.BLUE_WIZZROBE]: 0x4060c0,
  [OBJ.RED_WIZZROBE]: 0xc04040,
  [OBJ.WALLMASTER]: 0x808060,
  [OBJ.ROPE]: 0xc04020,
  [OBJ.STALFOS]: 0xd0d0d0,
  [OBJ.BUBBLE]: 0xc0c0c0,
  [OBJ.BUBBLE_BLUE]: 0x4060c0,
  [OBJ.BUBBLE_RED]: 0xc04040,
  [OBJ.GIBDO]: 0xa08040,
  [OBJ.RUPEE_STASH]: 0x40a0e0,
  [OBJ.GRUMBLE]: 0xc06040,
  [OBJ.RED_LAMNOLA]: 0xc04020,
  [OBJ.BLUE_LAMNOLA]: 0x4060c0,
  [OBJ.MOLDORM]: 0xc0a040,
  [OBJ.TRAP]: 0x808080,
  [OBJ.TRAP2]: 0x808080,
  [OBJ.AQUAMENTUS]: 0x40c040,
  [OBJ.DODONGO]: 0xc0a040,
  [OBJ.GOHMA]: 0xc040a0,
  [OBJ.DIGDOGGER]: 0xa08040,
  [OBJ.MANHANDLA]: 0x40a060,
  [OBJ.GANON]: 0xc02020,
  [OBJ.ZELDA]: 0xf0d060,
  [OBJ.GLEEOK_2]: 0x60c040,
  [OBJ.GLEEOK_4]: 0x50b030,
  [OBJ.PATRA]: 0xa060c0,
});

/**
 * @param {number} objType
 */
export function hpForType(objType) {
  const pair = HP_PAIRS[objType >> 1] ?? 0x10;
  if (objType & 1) {
    return (pair & 0x0f) << 4;
  }
  return pair & 0xf0;
}

/**
 * Contact damage in half-hearts (ObjTypeToDamagePoints).
 * @param {number} objType
 */
export function contactHalfHearts(objType) {
  return damageHalfHeartsForType(objType);
}

/**
 * @param {number} objType
 */
export function enemySize(objType) {
  if (isBossType(objType)) return bossSize(objType);
  if (objType === OBJ.GEL || objType === OBJ.GEL2) return { w: 8, h: 8 };
  return { w: 16, h: 16 };
}

/** ObjAttr bit $40 — half-width center for thin sprites (gels, etc.). */
export function enemyHalfWidth(objType) {
  return objType === OBJ.GEL || objType === OBJ.GEL2;
}

let nextId = 1;

/**
 * @typedef {object} Enemy
 * @property {number} id
 * @property {number} objType
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} dir
 * @property {number} invuln
 * @property {boolean} alive
 * @property {number} anim
 * @property {number} timer
 * @property {number} qSpeed whole pixels/frame (legacy movers)
 * @property {number} [qSpeedFrac] NES ObjQSpeedFrac (MoveObject ×4/frame)
 * @property {number} [posFrac] NES ObjPosFrac accumulator
 * @property {number} shootTimer
 * @property {number} stunTimer
 * @property {number} invulnMask NES ObjInvincibilityMask
 * @property {boolean} [edgePending]
 * @property {number} [leeverPhase]
 * @property {number} [slotIndex] NES-ish object slot (1-based) for drops/keys
 */

/**
 * @param {{ objType: number, x: number, y: number, edgePending?: boolean, dir?: number, trapIndex?: number, trapOriginX?: number, trapOriginY?: number, slotIndex?: number }} spawn
 * @returns {Enemy | null}
 */
export function createEnemy(spawn) {
  const { objType, x, y } = spawn;
  if (!objType) return null;
  const hp = hpForType(objType);
  const keese =
    objType === OBJ.BLUE_KEESE || objType === OBJ.RED_KEESE || objType === OBJ.BLACK_KEESE;
  const qFrac = qSpeedFracForType(objType);
  const boss = isBossType(objType);
  const leever = isLeever(objType);
  const trap = isTrapType(objType);
  let resolvedHp = boss ? bossHp(objType, hp) : hp;
  // Keese need ≥1; Gel nibble 0 stays 0 (one-shot). Do not clamp other zeros to $10.
  if (keese) resolvedHp = Math.max(resolvedHp, 1);
  const person = isPersonType(objType);
  const grumble = isGrumble(objType);
  const pondFairy = objType === OBJ.POND_FAIRY;
  const e = {
    id: nextId++,
    objType,
    // InitPondFairy: ($78, $7D). Persons/grumble: cave midline.
    x: person || grumble || pondFairy ? 0x78 : x,
    y:
      person || grumble
        ? 0x80
        : pondFairy
          ? 0x7d
          : objType === OBJ.AQUAMENTUS || boss
            ? (spawn.y || 0x80)
            : y,
    hp: grumble ? 0xffff : resolvedHp,
    dir:
      spawn.dir
      ?? (keese
        ? DIRECTIONS8[(x + y) & 7]
        : objType === OBJ.PEAHAT
          ? DIR.UP
          : DIR.LEFT),
    invuln: 0,
    alive: true,
    anim: 0,
    timer: leever
      ? 30 + ((spawn.x ?? 0) & 0x3f)
      : objType === OBJ.ARMOS
        ? 0x30
        : keese
          ? 0
          : isZolOrGelType(objType)
            ? pickZolGelEdgeDelay(objType, spawn.x ?? 0)
            : 20 + ((spawn.x ?? 0) & 0x1f),
    // Legacy whole-px field (flyers/worms/boss helpers). Walker types use qSpeedFrac.
    qSpeed: qFrac != null ? 0 : 1,
    // NES ObjQSpeedFrac — MoveObject applies ×4/frame (see objQSpeed.js).
    qSpeedFrac: qFrac,
    /** Restored after _TryShooting freeze (ObjQSpeedFrac := 0). */
    walkQSpeedFrac: qFrac,
    posFrac: 0,
    shootTimer: 0,
    stunTimer: 0,
    invulnMask: grumble ? 0xff : invincibilityMaskForType(objType),
    edgePending: Boolean(spawn.edgePending),
    npc: isZelda(objType) || person || grumble || pondFairy,
    grumble,
    fed: false,
    feedTimer: 0,
    leeverPhase: leever ? LEEVER_PHASE.BURIED : undefined,
    slotIndex: spawn.slotIndex,
    // Flyer: 0..4 active, 5 = resting (weapon-vulnerable for peahat) / keese delay.
    flyerState: keese
      ? FLYER_STATE.SPEED_UP
      : objType === OBJ.PEAHAT || objType === OBJ.FLYING_GHINI
        ? 2
        : undefined,
    armosStatue: objType === OBJ.ARMOS,
    /** Armos fade-in frames after wake (weapons ignored). */
    armosFade: objType === OBJ.ARMOS ? 0x30 : 0,
    zoraState: objType === OBJ.ZORA ? 0 : undefined,
    trapIndex: spawn.trapIndex,
    trapState: trap ? 0 : undefined,
    trapHome: undefined,
    trapOriginX: trap ? (spawn.trapOriginX ?? 0) : undefined,
    trapOriginY: trap ? (spawn.trapOriginY ?? 0) : undefined,
    captureTimer: 0,
    wallmasterGrab: false,
    /** Player index the closed hand is dragging (Phase 23). */
    wallmasterVictim: undefined,
    /** Set when capture slide finishes — that hero warps to the entrance. */
    wallmasterWarpPending: false,
    /** Dir toward nearest wall for the post-grab slide. */
    wallmasterRetreatDir: undefined,
    wallmasterTilesCrossed: objType === OBJ.WALLMASTER ? 0 : undefined,
    wallmasterCrawl: objType === OBJ.WALLMASTER ? 0 : undefined,
    turnRate: isWandererType(objType) || isZolOrGelType(objType)
      ? turnRateForType(objType)
      : undefined,
    turnTimer: 0,
    /** Gel_Move state (InitGel → 2; Zol children → 0). */
    gelState: initialGelState(objType),
    gridOffset: 0,
    wantsToShoot: false,
    jumperState:
      objType === OBJ.BLUE_TEKTITE || objType === OBJ.RED_TEKTITE || objType === OBJ.BOULDER
        ? 0
        : undefined,
    flyerTurns: keese ? 6 : undefined,
    // NES Flyer_ObjSpeed (not whole px/frame) — see flyerMove.js.
    flyerSpeed: keese ? keeseInitFlyerSpeed(objType) : undefined,
    flyerSpeedFrac: keese ? 0 : undefined,
    flyingMaxSpeedFrac: keese ? KEESE_FLYING_MAX_SPEED_FRAC : undefined,
    flyerDistTraveled: keese ? 0 : undefined,
  };
  if (
    isBossType(objType)
    || objType === CHILD_DIGDOGGER
    || objType === BOSS.GLEEOK_HEAD
    || isPatraChild(objType)
  ) {
    initBossAi(e);
  }
  if (isWizzrobeType(objType)) initWizzrobe(e, spawn.x ?? 0);
  if (objType === OBJ.POLS_VOICE) initPolsVoice(e);
  return e;
}

/** Buried Leevers / Armos statue / Zora mound / BoulderSet are hidden. */
export function enemyIsHidden(e) {
  if (!e) return false;
  if (e.objType === OBJ.BOULDER_SET) return true;
  if (isLeever(e.objType) && e.leeverPhase === LEEVER_PHASE.BURIED) return true;
  if (e.objType === OBJ.ZORA && (e.zoraState === 0 || e.zoraState === 5)) return true;
  if (isWizzrobeType(e.objType)) return !wizzrobeIsVisible(e);
  // Ganon is not listed: Ganon_CheckCollisions still runs CheckLinkCollision on
  // the frames he is not drawn, so he keeps hurting Link while invisible. His
  // draw gate lives in the sprite layer (ganonIsVisible).
  return false;
}

/**
 * Body contact allowed.
 * Peahat: always contacts Link; weapons only when resting (flyerState===5).
 */
export function enemyIsHostile(e) {
  if (!e?.alive || e.npc || e.edgePending) return false;
  if (e.objType === OBJ.BOULDER_SET) return false;
  if (isRupeeStash(e.objType)) return false;
  if (e.armosStatue) return true; // touch wakes; weapons ignored separately
  if (isLeever(e.objType)) return e.leeverPhase === LEEVER_PHASE.ACTIVE;
  if (e.objType === OBJ.ZORA) {
    const s = e.zoraState ?? 0;
    return s >= 2 && s <= 4;
  }
  if (isTrapType(e.objType)) return true;
  return true;
}

/** Weapons may damage this foe right now. */
export function enemyWeaponVulnerable(e) {
  if (!enemyIsHostile(e) || e.npc) return false;
  if (e.armosStatue) return false;
  if (e.objType === OBJ.ARMOS && (e.armosFade ?? 0) > 0) return false;
  if (e.objType === OBJ.PEAHAT && e.flyerState !== 5) return false;
  if (e.objType === OBJ.BUBBLE || e.objType === OBJ.BUBBLE_BLUE || e.objType === OBJ.BUBBLE_RED) {
    return false;
  }
  if (isTrapType(e.objType)) return false;
  // Wizzrobes only run CheckMonsterCollisions on the frames they are drawn.
  if (isWizzrobeType(e.objType) && !wizzrobeIsVisible(e)) return false;
  return true;
}

/**
 * @param {object} attrs
 * @param {object} [opts]
 * @returns {Enemy[]}
 */
export function spawnEnemiesFromAttrs(attrs, opts = {}) {
  const spawns = resolveSpawns(attrs, opts);
  /** @type {Enemy[]} */
  const list = [];
  let slot = 1;
  for (const s of spawns) {
    if (isTrapType(s.objType)) {
      for (const t of expandTrapGenerator(s.objType, opts.origin)) {
        const e = createEnemy({ ...t, slotIndex: slot++ });
        if (e) list.push(e);
      }
      continue;
    }
    if (isRupeeStash(s.objType)) {
      for (const t of expandRupeeStash(opts.origin)) {
        const e = createEnemy({ ...t, slotIndex: slot++ });
        if (e) list.push(e);
      }
      continue;
    }
    if (isWormType(s.objType)) {
      const segs = expandWorm({ ...s, slotIndex: slot }, createEnemy);
      slot += Math.max(1, segs.length);
      list.push(...segs);
      continue;
    }
    if (isGrumble(s.objType)) {
      const g = createGrumble(createEnemy, opts.origin);
      if (g) {
        g.slotIndex = slot++;
        list.push(g);
      }
      continue;
    }
    const e = createEnemy({ ...s, slotIndex: slot++ });
    if (e) list.push(e);
  }
  // Bosses sit toward the right side of the room (Aquamentus Init ~$B0,$80).
  for (const e of list) {
    if (isBossType(e.objType) && !isZelda(e.objType) && !isPatra(e.objType)) {
      e.x = (opts.origin?.x ?? 0) + 0xa0;
      e.y = (opts.origin?.y ?? 0) + 0x80;
    }
    if (isPatra(e.objType)) {
      e.x = (opts.origin?.x ?? 0) + 0x80;
      e.y = (opts.origin?.y ?? 0) + 0x70;
    }
    if (isZelda(e.objType)) {
      e.x = (opts.origin?.x ?? 0) + 0x78;
      e.y = (opts.origin?.y ?? 0) + 0x80;
    }
  }
  // Patra expands to 8 orbiters after parent is placed.
  const extras = [];
  for (const e of list) {
    extras.push(...expandBossFamily(e, createEnemy));
  }
  if (extras.length) list.push(...extras);
  return capMonsterList(list);
}

export function spawnOverworldEnemies(attrs, linkDir) {
  return spawnEnemiesFromAttrs(attrs, {
    foeCounts: FOE_COUNTS_OW,
    linkDir,
    allowEdgeSpawn: true,
  });
}

export function spawnDungeonEnemies(room, origin, linkDir) {
  if (!room) return [];
  // Mode 9: room monster byte is return-pos attrs C — spawn 4 blue keese instead.
  if (room.layoutId === 0x3e || room.layoutId === 0x3f) {
    /** @type {Enemy[]} */
    const keese = [];
    let slot = 1;
    for (const s of cellarKeeseSpawns()) {
      tryAddMonster(keese, createEnemy({ ...s, slotIndex: slot++ }));
    }
    return keese;
  }
  return spawnEnemiesFromAttrs(
    {
      monster: room.monster,
      useMonsterGroups: room.useMonsterGroups,
    },
    { foeCounts: FOE_COUNTS_L1, linkDir, origin, cycleStart: room.roomId },
  );
}

/**
 * @param {Enemy} e
 */
export function enemyRect(e) {
  const { w, h } = enemySize(e.objType);
  return { x: e.x, y: e.y, w, h };
}

function bounce(e, minX, maxX, minY, maxY) {
  if (e.x < minX) {
    e.x = minX;
    e.dir = DIR.RIGHT;
  }
  if (e.x > maxX) {
    e.x = maxX;
    e.dir = DIR.LEFT;
  }
  if (e.y < minY) {
    e.y = minY;
    e.dir = DIR.DOWN;
  }
  if (e.y > maxY) {
    e.y = maxY;
    e.dir = DIR.UP;
  }
}

function moveDir(e, speed) {
  if (e.dir & DIR.RIGHT) e.x += speed;
  if (e.dir & DIR.LEFT) e.x -= speed;
  if (e.dir & DIR.DOWN) e.y += speed;
  if (e.dir & DIR.UP) e.y -= speed;
}

const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

/** Flyers / hoppers / swimmers — room bounds only, no tile probes. */
export function enemyIgnoresTiles(objType) {
  return (
    objType === OBJ.BLUE_KEESE
    || objType === OBJ.RED_KEESE
    || objType === OBJ.BLACK_KEESE
    || objType === OBJ.PEAHAT
    || objType === OBJ.FLYING_GHINI
    || objType === OBJ.ZORA
    // Tektites hop onto rocks/water/forest Link cannot walk (UpdateTektiteOrBoulder).
    || objType === OBJ.BLUE_TEKTITE
    || objType === OBJ.RED_TEKTITE
    || objType === OBJ.BOULDER_SET
    || objType === OBJ.BOULDER
    || objType === OBJ.AQUAMENTUS
  );
}

/**
 * Ground walkers that must not remain on water/rock after spawn.
 * Skips flyers, Zora, bosses, NPCs, Armos statues, edge-pending,
 * and foes that intentionally stand on / phase through blocks
 * (Blue Wizzrobe fades through `$B0`/`$F4+`; Pols Voice hops them).
 * Per-frame eject of those types wedges them against block edges.
 * @param {Enemy} e
 */
export function enemyNeedsWalkableGround(e) {
  if (!e?.alive || e.edgePending || e.npc) return false;
  if (enemyIgnoresTiles(e.objType)) return false;
  if (e.armosStatue || e.objType === OBJ.ARMOS) return false;
  if (isBossType(e.objType)) return false;
  if (isWizzrobeType(e.objType) || e.objType === OBJ.POLS_VOICE) return false;
  return true;
}

/**
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function, standingTile?: Function }} [tileOpts]
 */
function resolveEnemyTileOpts(tileOpts = {}) {
  const firstUnwalkable = tileOpts.firstUnwalkable ?? OW_FIRST_UNWALKABLE;
  const walkableRemap =
    tileOpts.walkableRemap
    ?? (firstUnwalkable === UW_FIRST_UNWALKABLE ? [] : OW_WALKABLE_REMAP);
  return { firstUnwalkable, walkableRemap };
}

/**
 * Preserve continuous-camera tile probes when unpacking stepEnemy opts.
 * @param {object} [opts]
 */
function enemyTileOptsFrom(opts = {}) {
  return {
    firstUnwalkable: opts.firstUnwalkable,
    walkableRemap: opts.walkableRemap,
    collidingTile: opts.collidingTile,
    standingTile: opts.standingTile,
  };
}

/**
 * True when the standing tile under the enemy is impassable for walkers.
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function isEnemyStandingSolid(tileGrid, x, y, tileOpts = {}) {
  if (!tileGrid && typeof tileOpts.standingTile !== 'function') return false;
  const { firstUnwalkable, walkableRemap } = resolveEnemyTileOpts(tileOpts);
  const tile =
    typeof tileOpts.standingTile === 'function'
      ? tileOpts.standingTile(x, y)
      : standingTile(tileGrid, x, y);
  return !normalizeOwTile(tile, firstUnwalkable, walkableRemap).walkable;
}

/**
 * `GetCollidableTileStill` probe: raw tile byte plus walkability for a square.
 * Wizzrobes and Pols Voice branch on the tile value itself (blocks and water are
 * passable by fading or hopping), so the un-remapped byte has to survive.
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 * @returns {((x: number, y: number) => { tile: number, walkable: boolean }) | null}
 */
export function makeStandingProbe(tileGrid, tileOpts = {}) {
  if (!tileGrid && typeof tileOpts.standingTile !== 'function') return null;
  const { firstUnwalkable, walkableRemap } = resolveEnemyTileOpts(tileOpts);
  return (x, y) => {
    const tile = (
      typeof tileOpts.standingTile === 'function'
        ? tileOpts.standingTile(x, y)
        : standingTile(tileGrid, x, y)
    ) & 0xff;
    return {
      tile,
      walkable: normalizeOwTile(tile, firstUnwalkable, walkableRemap).walkable,
    };
  };
}

/**
 * NES spawn alignment for continuous (possibly negative / multi-screen) coords.
 * `x & $F0` / `y & $F0` fold X≥256 and Y≥256 back into one screen — the same
 * class of bug as clamping continuous probes with `$F8`.
 * @param {number} x
 * @param {number} y
 */
export function alignEnemySpawnCell(x, y) {
  return {
    x: Math.floor(x / 16) * 16,
    y: Math.floor(y / 16) * 16 + 0x0d,
  };
}

/**
 * True when a walker has at least one open cardinal from (x, y).
 * @param {number[][] | null | undefined} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {{ collidingTile?: Function, firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
function enemyHasOpenDir(tileGrid, x, y, tileOpts = {}) {
  const canProbe =
    Boolean(tileGrid) || typeof tileOpts.collidingTile === 'function';
  if (!canProbe) return true;
  return (
    canEnemyMove(tileGrid, x, y, DIR.UP, tileOpts)
    || canEnemyMove(tileGrid, x, y, DIR.DOWN, tileOpts)
    || canEnemyMove(tileGrid, x, y, DIR.LEFT, tileOpts)
    || canEnemyMove(tileGrid, x, y, DIR.RIGHT, tileOpts)
  );
}

/**
 * Slide a walker off water/rock (or a no-exit pocket) onto the nearest
 * NES-aligned walkable cell that can still move.
 * @param {Enemy} e
 * @param {number[][]} tileGrid
 * @param {object} [opts]
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function, standingTile?: Function }} [opts.tileOpts]
 * @param {number} [opts.maxRadius] search in 16px (then 8px) steps
 * @returns {{ ejected: boolean, dx: number, dy: number }}
 */
export function ejectEnemyFromSolid(e, tileGrid, opts = {}) {
  const tileOpts = opts.tileOpts ?? {};
  const hasProbe = Boolean(tileGrid) || typeof tileOpts.standingTile === 'function';
  if (!hasProbe || !enemyNeedsWalkableGround(e)) {
    return { ejected: false, dx: 0, dy: 0 };
  }

  const walkableAt = (x, y) => !isEnemyStandingSolid(tileGrid, x, y, tileOpts);
  const openAt = (x, y) => enemyHasOpenDir(tileGrid, x, y, tileOpts);
  const standingSolid = !walkableAt(e.x, e.y);
  const immobile = !openAt(e.x, e.y);
  // Stuck on a bush/rock, or wedged with no exit even on sand.
  if (!standingSolid && !immobile) {
    return { ejected: false, dx: 0, dy: 0 };
  }

  const maxRadius = opts.maxRadius ?? 6; // ×16px → 96px
  // Continuous mode places foes in anchor-relative coords (may be negative /
  // past one screen). Only apply classic OW room lips for single-screen eject.
  const clampSingleRoom = typeof tileOpts.standingTile !== 'function';
  const inSearchBounds = (x, y) => {
    if (!clampSingleRoom) return true;
    return x >= 0x10 && x <= 0xe0 && y >= 0x4d && y <= 0xcd;
  };

  const commit = (x, y) => {
    const out = { ejected: true, dx: x - e.x, dy: y - e.y };
    e.x = x;
    e.y = y;
    e.gridOffset = 0;
    return out;
  };

  /** @type {{ x: number, y: number } | null} */
  let soft = null;
  const consider = (x, y) => {
    if (!inSearchBounds(x, y) || !walkableAt(x, y)) return null;
    if (openAt(x, y)) return commit(x, y);
    if (!soft) soft = { x, y };
    return null;
  };

  // Prefer spawn-aligned cells (X multiple of $10, Y ≡ $D in each $10 band).
  const { x: ox, y: oy } = alignEnemySpawnCell(e.x, e.y);
  for (let r = 0; r <= maxRadius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const hit = consider(ox + dx * 16, oy + dy * 16);
        if (hit) return hit;
      }
    }
  }

  // Fallback: finer 8px ring around the original pixel.
  const fx = Math.floor(e.x / 8) * 8;
  const fy = Math.floor(e.y / 8) * 8 + 5;
  for (let r = 1; r <= maxRadius * 2; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const hit = consider(fx + dx * 8, fy + dy * 8);
        if (hit) return hit;
      }
    }
  }

  // Last resort: walkable even if still boxed in (better than sitting in a bush).
  if (soft) return commit(soft.x, soft.y);
  return { ejected: false, dx: 0, dy: 0 };
}

/**
 * Eject every walker currently standing on impassable terrain.
 * @param {Enemy[]} enemies
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function ejectEnemiesFromSolid(enemies, tileGrid, tileOpts = {}) {
  const hasProbe = Boolean(tileGrid) || typeof tileOpts.standingTile === 'function';
  if (!hasProbe || !enemies?.length) return;
  for (const e of enemies) {
    ejectEnemyFromSolid(e, tileGrid, { tileOpts });
  }
}

/**
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null} [tileGrid]
 * @param {{ chase?: { x: number, y: number } | null, firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts]
 */
function stepLeever(e, bounds, tileGrid, opts = {}) {
  const tileOpts = enemyTileOptsFrom(opts);
  const chase = opts.chase;
  const phase = e.leeverPhase ?? LEEVER_PHASE.BURIED;
  const blue = e.objType === OBJ.BLUE_LEEVER;

  if (phase === LEEVER_PHASE.BURIED) {
    // BlueLeever state0 $08; red state0 does not crawl ($00).
    e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[0] : RED_LEEVER_STATE_QSPEEDS[0];
    if (chase) faceTowardChase(e, chase);
    if (e.qSpeedFrac > 0) moveAndCollideQSpeed(e, bounds, null, tileOpts);
    if (e.timer <= 0) {
      e.leeverPhase = LEEVER_PHASE.EMERGE;
      e.timer = 16;
      e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[1] : RED_LEEVER_STATE_QSPEEDS[1];
    }
    return;
  }

  if (phase === LEEVER_PHASE.EMERGE) {
    e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[2] : RED_LEEVER_STATE_QSPEEDS[2];
    if (e.timer <= 0) {
      e.leeverPhase = LEEVER_PHASE.ACTIVE;
      // Red stays up longer / chases harder.
      e.timer = e.objType === OBJ.RED_LEEVER ? 90 + (e.id & 0x1f) : 50 + (e.id & 0x1f);
      e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[3] : RED_LEEVER_STATE_QSPEEDS[3];
    }
    return;
  }

  if (phase === LEEVER_PHASE.DIG) {
    e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[4] : RED_LEEVER_STATE_QSPEEDS[4];
    if (e.timer <= 0) {
      e.leeverPhase = LEEVER_PHASE.BURIED;
      e.timer = 40 + ((e.anim + e.id) & 0x3f);
    }
    return;
  }

  // ACTIVE — chase-biased wander on the surface (state 3 → $20).
  e.qSpeedFrac = blue ? BLUE_LEEVER_STATE_QSPEEDS[3] : RED_LEEVER_STATE_QSPEEDS[3];
  if (e.timer <= 0) {
    e.leeverPhase = LEEVER_PHASE.DIG;
    e.timer = 16;
    return;
  }
  if ((e.timer & 0x0f) === 0) {
    if (chase) faceTowardChase(e, chase);
    else e.dir = pickWanderDir(tileGrid, e.x, e.y, e.id + e.anim, tileOpts);
    if (tileGrid && !canEnemyMove(tileGrid, e.x, e.y, e.dir, tileOpts)) {
      e.dir = pickWanderDir(tileGrid, e.x, e.y, e.id + e.anim, tileOpts);
    }
  }
  moveEnemyStep(e, bounds, tileGrid, tileOpts);
}

/**
 * True if a ground enemy can step one cell in `dir` (monster hotspot).
 * @param {number[][] | null | undefined} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function canEnemyMove(tileGrid, x, y, dir, tileOpts = {}) {
  if ((!tileGrid && typeof tileOpts.collidingTile !== 'function') || !dir) return true;
  if (typeof tileOpts.collidingTile === 'function') {
    return Boolean(tileOpts.collidingTile(x, y, dir)?.walkable);
  }
  return getMonsterCollidingTile(tileGrid, x, y, dir, {
    firstUnwalkable: tileOpts.firstUnwalkable ?? OW_FIRST_UNWALKABLE,
    walkableRemap: tileOpts.walkableRemap,
  }).walkable;
}

/**
 * Walker_GetNextAltDir search when the current facing is blocked.
 * Order matches Z_07.asm: random perpendicular → other perp → reverse → none.
 * Returns 0 when no walkable alternate exists (moving dir cleared; facing kept).
 *
 * @param {number[][] | null | undefined} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {number} currentDir
 * @param {number} [salt] fallback entropy when randomByte is omitted
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function }} [tileOpts]
 * @param {(() => number) | null} [randomByte] NES Random,X (bit7 picks first perp)
 */
export function pickUnblockedDir(
  tileGrid,
  x,
  y,
  currentDir,
  salt = 0,
  tileOpts = {},
  randomByte = null,
) {
  const reverse = oppositeDir(currentDir);
  const perpendicular =
    currentDir & (DIR.UP | DIR.DOWN)
      ? [DIR.LEFT, DIR.RIGHT]
      : [DIR.UP, DIR.DOWN];
  // Walker_AltDir_GetRandomObjPerpendicularDir: ASL Random → BCS picks index 1.
  const roll = typeof randomByte === 'function' ? randomByte() & 0xff : salt & 0xff;
  if (roll & 0x80) perpendicular.reverse();

  /** @type {number[]} */
  const candidates = [];
  const pushUnique = (d) => {
    if (d && !candidates.includes(d)) candidates.push(d);
  };
  for (const d of perpendicular) pushUnique(d);
  pushUnique(reverse);

  if (!tileGrid && typeof tileOpts.collidingTile !== 'function') {
    return candidates[0] || reverse || 0;
  }

  for (const d of candidates) {
    if (canEnemyMove(tileGrid, x, y, d, tileOpts)) return d;
  }
  return 0;
}

/**
 * Wander re-roll: only consider currently open facings.
 * @param {number[][] | null | undefined} tileGrid
 * @param {number} x
 * @param {number} y
 * @param {number} salt
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 */
export function pickWanderDir(tileGrid, x, y, salt = 0, tileOpts = {}) {
  for (let i = 0; i < 4; i += 1) {
    const d = DIRS[(salt + i) & 3];
    if (canEnemyMove(tileGrid, x, y, d, tileOpts)) return d;
  }
  return DIRS[salt & 3];
}

/**
 * Bias facing toward a chase target when roughly axis-aligned (Wanderer_TargetPlayer).
 * @param {Enemy} e
 * @param {{ x: number, y: number } | null | undefined} chase
 */
export function faceTowardChase(e, chase) {
  if (!chase) return;
  const dx = chase.x - e.x;
  const dy = chase.y - e.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 9 && ady >= 9) {
    e.dir = dy < 0 ? DIR.UP : DIR.DOWN;
  } else if (ady < 9 && adx >= 9) {
    e.dir = dx < 0 ? DIR.LEFT : DIR.RIGHT;
  } else if (adx >= 9 || ady >= 9) {
    // Prefer the dominant axis toward the target.
    if (adx >= ady) e.dir = dx < 0 ? DIR.LEFT : DIR.RIGHT;
    else e.dir = dy < 0 ? DIR.UP : DIR.DOWN;
  }
}

/** UpdateVireState0 hop table (signed); |gridOffset| & $0F indexes it. */
export const VIRE_JUMP_OFFSETS = Object.freeze([
  0, -3, -2, -1, -1, 0, -1, 0, 0, 1, 0, 1, 1, 2, 3, 0,
]);

/**
 * Apply one frame of Vire hop while facing left/right (NES UpdateVireState0).
 * @param {Enemy} e
 */
export function applyVireJump(e) {
  if (!(e.dir & (DIR.LEFT | DIR.RIGHT))) return;
  const idx = Math.abs(e.gridOffset ?? 0) & 0x0f;
  e.y += VIRE_JUMP_OFFSETS[idx];
}

/**
 * Walker_CheckTileCollision only tests tiles when ObjGridOffset == 0
 * (BNE early-out). Mid-stride skips walkability so a committed 16px step
 * can pass through block corners. `$10` is nonzero until truncated after move.
 * @param {Enemy} e
 */
function atWalkerTileCheck(e) {
  return (e.gridOffset ?? 0) === 0;
}

/**
 * Try Walker_GetNextAltDir when the current facing is blocked.
 * @returns {boolean} true if a walkable facing was found
 */
function tryAltDir(e, tileGrid, tileOpts, randomByte) {
  const next = pickUnblockedDir(
    tileGrid,
    e.x,
    e.y,
    e.dir,
    e.id + e.anim,
    tileOpts,
    randomByte,
  );
  if (!next) return false;
  e.dir = next;
  e.timer = Math.min(e.timer, 4);
  return true;
}

/**
 * Move if room bounds + optional tile walkability allow it.
 * @param {Enemy} e
 * @param {number} speed
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 * @param {(() => number) | null} [randomByte]
 */
function moveAndCollide(e, speed, bounds, tileGrid, tileOpts = {}, randomByte = null) {
  const checkTiles =
    (Boolean(tileGrid) || typeof tileOpts.collidingTile === 'function')
    && atWalkerTileCheck(e)
    && !enemyIgnoresTiles(e.objType);
  if (checkTiles && !canEnemyMove(tileGrid, e.x, e.y, e.dir, tileOpts)) {
    // Same frame: if an alt facing is open, keep moving (TryNextDir).
    if (!tryAltDir(e, tileGrid, tileOpts, randomByte)) {
      bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
      return;
    }
  }
  const beforeX = e.x;
  const beforeY = e.y;
  moveDir(e, speed);
  bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  if (e.x !== beforeX || e.y !== beforeY) advanceGridOffset(e, speed);
}

/**
 * Wanderer move using ObjQSpeedFrac (InitDarknut / MoveObject).
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [tileOpts]
 * @param {(() => number) | null} [randomByte]
 */
function moveAndCollideQSpeed(e, bounds, tileGrid, tileOpts = {}, randomByte = null) {
  const checkTiles =
    (Boolean(tileGrid) || typeof tileOpts.collidingTile === 'function')
    && atWalkerTileCheck(e)
    && !enemyIgnoresTiles(e.objType);
  if (checkTiles && !canEnemyMove(tileGrid, e.x, e.y, e.dir, tileOpts)) {
    if (!tryAltDir(e, tileGrid, tileOpts, randomByte)) {
      bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
      return;
    }
  }
  // Direction none (blocked) skips MoveObject — do not advance posFrac.
  if (!e.dir) return;
  const speed = consumeQSpeedPixels(e);
  if (speed <= 0) return;
  const beforeX = e.x;
  const beforeY = e.y;
  moveDir(e, speed);
  bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  const moved = Math.abs(e.x - beforeX) + Math.abs(e.y - beforeY);
  if (moved > 0) advanceGridOffset(e, moved);
}

/** Prefer ObjQSpeedFrac MoveObject; fall back to whole-pixel qSpeed. */
function moveEnemyStep(e, bounds, tileGrid, tileOpts = {}, randomByte = null) {
  if (e.qSpeedFrac != null) {
    moveAndCollideQSpeed(e, bounds, tileGrid, tileOpts, randomByte);
  } else {
    moveAndCollide(e, e.qSpeed, bounds, tileGrid, tileOpts, randomByte);
  }
}

/** @param {Enemy} e @param {{ rngByte?: () => number }} [opts] */
function enemyRandomByte(e, opts = {}) {
  if (typeof opts.rngByte === 'function') return opts.rngByte;
  return () => (e.anim + e.id * 17 + (e.turnTimer ?? 0)) & 0xff;
}

/**
 * Gel_MoveSplitting — QSpeed $FF until tile or room boundary blocks.
 * @returns {boolean} true if blocked (C=1)
 */
function gelMoveSplitting(e, bounds, tileGrid, tileOpts = {}) {
  e.qSpeedFrac = GEL_SHOVE_QSPEED;
  if (
    (Boolean(tileGrid) || typeof tileOpts.collidingTile === 'function')
    && onTileBoundary(e)
    && !canEnemyMove(tileGrid, e.x, e.y, e.dir, tileOpts)
  ) {
    return true;
  }
  if (!e.dir) return true;
  const speed = consumeQSpeedPixels(e);
  if (speed <= 0) return false;
  const beforeX = e.x;
  const beforeY = e.y;
  moveDir(e, speed);
  let blocked = false;
  if (e.x < bounds.minX) {
    e.x = bounds.minX;
    blocked = true;
  }
  if (e.x > bounds.maxX) {
    e.x = bounds.maxX;
    blocked = true;
  }
  if (e.y < bounds.minY) {
    e.y = bounds.minY;
    blocked = true;
  }
  if (e.y > bounds.maxY) {
    e.y = bounds.maxY;
    blocked = true;
  }
  const moved = Math.abs(e.x - beforeX) + Math.abs(e.y - beforeY);
  if (moved > 0) advanceGridOffset(e, moved);
  // NES masks gridOffset to $0F; zero when landing on a square.
  if (((e.gridOffset ?? 0) & 0x0f) === 0) e.gridOffset = 0;
  return blocked;
}

/**
 * UpdateZol / UpdateGel movement (Z_04 UpdateNormalZolOrGel + Gel_Move).
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null | undefined} tileGrid
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[], collidingTile?: Function }} tileOpts
 * @param {{ x: number, y: number } | null | undefined} chase
 * @param {{ rngByte?: () => number }} [opts]
 */
function stepZolOrGel(e, bounds, tileGrid, tileOpts, chase, opts = {}) {
  if (isGelType(e.objType)) {
    if (e.gelState == null) e.gelState = GEL_STATE.NORMAL;

    if (e.gelState === GEL_STATE.SPLIT_START) {
      // Gel_Move @State0 → state 1 with QSpeed $20 and 5-frame timer.
      e.qSpeedFrac = GEL_SPLIT_START_QSPEED;
      e.timer = GEL_SPLIT_START_TIMER;
      e.gelState = GEL_STATE.SPLIT_SHOVE;
      return;
    }

    if (e.gelState === GEL_STATE.SPLIT_SHOVE) {
      // While timer > 0, shove; stop early if blocked. Then snap → state 2.
      if ((e.timer ?? 0) > 0) {
        if (!gelMoveSplitting(e, bounds, tileGrid, tileOpts)) return;
      }
      snapGelAfterShove(e);
      e.gelState = GEL_STATE.NORMAL;
      e.qSpeedFrac = QSPEED.GEL_ACTIVE;
      return;
    }
  }

  // UpdateNormalZolOrGel — Zol state 0 / Gel state 2.
  e.qSpeedFrac = normalZolGelQSpeed(e.objType);
  e.turnRate = ZOL_GEL_TURN_RATE;

  // ObjTimer >= 5: pause at the tile edge (no Wanderer_TargetPlayer).
  if (zolGelPaused(e.timer)) return;

  // Wanderer_TargetPlayer: tick timer → move → maybe reface on square.
  tickWandererTurnTimer(e);
  const rnd = enemyRandomByte(e, opts);
  moveEnemyStep(e, bounds, tileGrid, tileOpts, rnd);
  if (onTileBoundary(e)) {
    truncateWandererGridOffset(e);
    wandererDecideFacing(e, chase, rnd);
  }

  // At a square with timer == 0: roll the next edge delay (ZolGelDelays).
  if (onTileBoundary(e) && (e.timer ?? 0) === 0) {
    const rnd = typeof opts.rngByte === 'function'
      ? opts.rngByte()
      : (e.anim + e.id * 13) & 0xff;
    e.timer = pickZolGelEdgeDelay(e.objType, rnd);
  }
}

/**
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null} [tileGrid]
 * @param {{ chase?: { x: number, y: number } | null, firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts]
 */
/**
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null} [tileGrid]
 * @param {{ chase?: { x: number, y: number } | null, firstUnwalkable?: number, walkableRemap?: readonly number[], link?: { x: number, y: number } }} [opts]
 */
export function stepEnemy(e, bounds, tileGrid = null, opts = {}) {
  if (!e.alive || e.edgePending) return;
  if (e.invuln > 0) e.invuln -= 1;
  e.anim += 1;
  // NES ObjTimer: decrement only while > 0 (never wraps negative).
  if (e.timer > 0) e.timer -= 1;

  // Darknuts never stay stunned.
  if (e.objType === OBJ.RED_DARKNUT || e.objType === OBJ.BLUE_DARKNUT) {
    e.stunTimer = 0;
  }

  if (e.stunTimer > 0) {
    e.stunTimer -= 1;
    return;
  }

  const tileOpts = enemyTileOptsFrom(opts);
  const chase = opts.chase;
  const link = opts.link ?? chase;

  const t = e.objType;

  if (isTrapType(t)) {
    if (link) stepTrap(e, link, bounds);
    return;
  }

  // Stationary pickups — UpdateRupeeStash only draws / checks touch.
  if (isRupeeStash(t)) return;

  if (isWormType(t)) {
    stepWorm(e, bounds, chase, opts.enemies ?? []);
    return;
  }

  if (e.grumble) {
    stepGrumble(e);
    return;
  }

  if (t === OBJ.ARMOS && e.armosStatue) {
    // Statue until touched (wake handled in contact path).
    return;
  }

  // Armos / Flying Ghini fade-in (InitArmosOrFlyingGhini ObjTimer) — stay put.
  if ((t === OBJ.ARMOS || t === OBJ.FLYING_GHINI) && (e.armosFade ?? 0) > 0) {
    e.armosFade -= 1;
    if (e.armosFade === 0 && t === OBJ.ARMOS) {
      // InitArmos: $20 if Random < $80, else $60.
      const rnd = typeof opts.rngByte === 'function'
        ? opts.rngByte()
        : (e.id * 17 + e.anim) & 0xff;
      e.qSpeedFrac = armosQSpeedFrac(rnd);
      e.walkQSpeedFrac = e.qSpeedFrac;
      if (typeof opts.onArmosAwake === 'function') opts.onArmosAwake(e);
    }
    return;
  }

  if (t === OBJ.WALLMASTER) {
    stepWallmaster(e, bounds, tileGrid, tileOpts, link);
    return;
  }

  if (
    isBossType(t)
    || t === CHILD_DIGDOGGER
    || t === BOSS.GLEEOK_HEAD
    || isPatraChild(t)
  ) {
    const patraParent =
      isPatraChild(t) && opts.enemies
        ? opts.enemies.find((o) => o.id === e.patraParentId)
        : null;
    stepBossAi(e, bounds, {
      chase,
      fluteJustUsed: Boolean(opts.fluteJustUsed),
      onDigdoggerSplit: opts.onDigdoggerSplit,
      patraParent,
      moveEnemy: (speed) => moveAndCollide(e, speed, bounds, tileGrid, tileOpts),
    });
    return;
  }

  // Underworld persons stay put (money-or-life / old men).
  if (e.npc) return;

  if (t === OBJ.PEAHAT || t === OBJ.FLYING_GHINI) {
    stepFlyer(e, bounds, chase);
    return;
  }

  if (t === OBJ.BLUE_KEESE || t === OBJ.RED_KEESE || t === OBJ.BLACK_KEESE) {
    stepKeese(e, bounds, chase && enemyChasesBait(t) ? chase : chase);
    return;
  }

  if (t === OBJ.BOULDER_SET) {
    const spawn = stepBoulderSet(e, opts.enemies ?? [], {
      chase,
      rngByte: opts.rngByte,
    });
    if (spawn && opts.enemies) {
      // UpdateBoulderSet uses FindEmptyMonsterSlot — no slot, no rockfall.
      // Streamed rooms budget slots per room, so the boulder inherits the
      // spawner's home room and is already revealed (its parent is on camera).
      const home = e.homeRoomId;
      const rock = createEnemy(spawn);
      if (rock) {
        if (home != null) rock.homeRoomId = home;
        rock.viewActivated = e.viewActivated ?? true;
        if (home == null) tryAddMonster(opts.enemies, rock);
        else tryAddMonsterToRoom(opts.enemies, rock, home);
      }
    }
    return;
  }

  if (t === OBJ.BLUE_TEKTITE || t === OBJ.RED_TEKTITE || t === OBJ.BOULDER) {
    stepTektite(e, bounds, chase);
    return;
  }

  if (t === OBJ.ZORA) {
    stepZora(e, bounds);
    return;
  }

  if (isWizzrobeType(t)) {
    stepWizzrobe(e, {
      link,
      rngByte: opts.rngByte,
      probeTile: makeStandingProbe(tileGrid, tileOpts),
    });
    bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
    return;
  }

  if (t === OBJ.POLS_VOICE) {
    stepPolsVoice(e, {
      rngByte: opts.rngByte,
      probeTile: makeStandingProbe(tileGrid, tileOpts),
    });
    bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
    return;
  }

  if (t === OBJ.ROPE) {
    stepRope(e, bounds, tileGrid, tileOpts, link);
    return;
  }

  if (isZolOrGelType(t)) {
    stepZolOrGel(e, bounds, tileGrid, tileOpts, chase, opts);
    return;
  }

  if (isLeever(t)) {
    stepLeever(e, bounds, tileGrid, opts);
    return;
  }

  // Wanderer_TargetPlayer / UpdateGoriya: move first, then reface on square.
  if (isWandererType(t)) {
    tickWandererTurnTimer(e);
    const rnd = enemyRandomByte(e, opts);
    const goBefore = e.gridOffset ?? 0;
    moveEnemyStep(e, bounds, tileGrid, tileOpts, rnd);
    // UpdateVireState0: hop while facing left/right (table sums to 0 over a tile).
    // Only after a real step so a bounced edge cannot re-apply the same offset.
    if (t === OBJ.VIRE && (e.gridOffset ?? 0) !== goBefore) applyVireJump(e);
    if (onTileBoundary(e)) {
      truncateWandererGridOffset(e);
      if (isGoriyaStyleFacing(t)) {
        goriyaDecideFacing(e, chase);
      } else {
        wandererDecideFacing(e, chase, rnd);
      }
    }
    return;
  }

  // Fallback wander (Gel and other ObjQSpeed types not in isWandererType).
  if (e.timer <= 0) {
    if (chase) faceTowardChase(e, chase);
    else e.dir = pickWanderDir(tileGrid, e.x, e.y, e.id + e.anim, tileOpts);
    e.timer = 24 + ((e.id * 3) & 0x1f);
  }
  moveEnemyStep(e, bounds, tileGrid, tileOpts);
}

/**
 * ControlKeeseFlight + MoveFlyer (Z_04).
 * Speed uses Flyer_ObjSpeed fractions (max $C0 → 0.75 px/f), not whole pixels.
 */
function stepKeese(e, bounds, chase) {
  if (e.flyerState == null) e.flyerState = FLYER_STATE.SPEED_UP;
  if (e.flyerSpeed == null) e.flyerSpeed = keeseInitFlyerSpeed(e.objType);
  if (e.flyerSpeedFrac == null) e.flyerSpeedFrac = 0;
  if (e.flyingMaxSpeedFrac == null) e.flyingMaxSpeedFrac = KEESE_FLYING_MAX_SPEED_FRAC;

  const st = e.flyerState;
  if (st === FLYER_STATE.SPEED_UP) {
    e.flyerSpeed = (e.flyerSpeed + 1) & 0xff;
    const next = flyerSpeedThresholdTransition(e.flyerSpeed, e.flyingMaxSpeedFrac);
    if (next) {
      e.flyerState = next.state;
      if (next.state === FLYER_STATE.DELAY) {
        e.timer = 0x40 | ((e.anim + e.id) & 0x3f);
      }
    }
  } else if (st === FLYER_STATE.DECIDE) {
    // Flyer_KeeseDecideState: ≥$A0 chase, ≥$20 wander, else slow.
    const r = (e.anim + e.id * 13) & 0xff;
    e.flyerState =
      r >= 0xa0 ? FLYER_STATE.CHASE : r >= 0x20 ? FLYER_STATE.WANDER : FLYER_STATE.SLOW_DOWN;
    e.flyerTurns = 6;
  } else if (st === FLYER_STATE.DELAY) {
    if (e.timer <= 0) e.flyerState = FLYER_STATE.SPEED_UP;
  } else if (st === FLYER_STATE.SLOW_DOWN) {
    e.flyerSpeed = (e.flyerSpeed - 1) & 0xff;
    const next = flyerSpeedThresholdTransition(e.flyerSpeed, e.flyingMaxSpeedFrac);
    if (next) {
      e.flyerState = next.state;
      if (next.state === FLYER_STATE.DELAY) {
        e.timer = 0x40 | ((e.anim + e.id) & 0x3f);
      }
    }
  } else if (e.timer <= 0) {
    // Flyer_Chase / Flyer_Wander: $10 delay between turns, then back to Decide.
    e.flyerTurns = (e.flyerTurns ?? 1) - 1;
    if (e.flyerTurns <= 0) {
      e.flyerState = FLYER_STATE.DECIDE;
    } else {
      e.timer = 0x10;
      if (st === FLYER_STATE.CHASE && chase) faceTowardChase(e, chase);
      else e.dir = DIRECTIONS8[(e.anim + e.flyerTurns) & 7];
    }
  }

  // MoveFlyer runs every frame (incl. delay — whole speed is 0 then).
  if (moveFlyer(e)) {
    bounce(e, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  }
}

/** Peahat / Flying Ghini simplified flyer: states 0–4 move, 5 rest (hurt window). */
function stepFlyer(e, bounds, chase) {
  if (e.timer <= 0) {
    e.flyerState = ((e.flyerState ?? 0) + 1) % 6;
    e.timer =
      e.flyerState === 5
        ? 40 + (e.anim & 0x1f)
        : e.flyerState <= 1
          ? 16
          : 24 + (e.anim & 0x0f);
    if (e.flyerState !== 5) {
      if (chase && (e.flyerState === 2 || e.flyerState === 3)) faceTowardChase(e, chase);
      else e.dir = DIRS[e.anim & 3];
    }
  }
  if (e.flyerState === 5) return; // resting
  const spd = e.flyerState <= 1 ? 1 : e.qSpeed;
  moveAndCollide(e, spd, bounds, null);
}

/**
 * Zora burrower states 0–5; fireball at state 3 (via shootTimer in tryEnemyShoot).
 *
 * NES UpdateZora → UpdateBurrower never moves the Zora (no Wanderer_TargetPlayer /
 * Walker_Move). When the burrow cycle wraps to state 0, DestroyMonster + clear
 * ZoraActive so CheckZora can place a new one on water. Walking here let Zoras
 * leave the lake onto land under continuous OW camera bounds.
 */
function stepZora(e, _bounds) {
  // UpdateZora → UpdateBurrower: same BlueLeeverStateQSpeeds table.
  const st = e.zoraState ?? 0;
  e.qSpeedFrac = BLUE_LEEVER_STATE_QSPEEDS[st] ?? 0;
  if (e.timer > 0) return;
  e.zoraState = (st + 1) % 6;
  // Finished cycle (5 → 0): despawn so CheckZora can respawn on water.
  if (e.zoraState === 0) {
    e.alive = false;
    return;
  }
  const times = [40, 24, 32, 48, 32, 24];
  e.timer = times[e.zoraState] ?? 32;
  e.qSpeedFrac = BLUE_LEEVER_STATE_QSPEEDS[e.zoraState] ?? 0;
  if (e.zoraState === 3) e.shootTimer = 0; // fire next tryEnemyShoot
}

function stepRope(e, bounds, tileGrid, tileOpts, link) {
  // UpdateRope: rush ObjQSpeedFrac $60; otherwise $20 (reset on facing change).
  if (link) {
    const dx = Math.abs(link.x - e.x);
    const dy = Math.abs(link.y - e.y);
    if (dx < 8 && dy >= 8) {
      e.dir = link.y >= e.y ? DIR.DOWN : DIR.UP;
      e.qSpeedFrac = QSPEED.ROPE_RUSH;
    } else if (dy < 8 && dx >= 8) {
      e.dir = link.x >= e.x ? DIR.RIGHT : DIR.LEFT;
      e.qSpeedFrac = QSPEED.ROPE_RUSH;
    } else if (e.timer <= 0) {
      e.qSpeedFrac = QSPEED.ROPE_SLOW;
      e.dir = pickWanderDir(tileGrid, e.x, e.y, e.id + e.anim, tileOpts);
      e.timer = 20 + (e.anim & 0x1f);
    }
  } else if (e.timer <= 0) {
    e.qSpeedFrac = QSPEED.ROPE_SLOW;
    e.dir = pickWanderDir(tileGrid, e.x, e.y, e.id + e.anim, tileOpts);
    e.timer = 24;
  }
  moveEnemyStep(e, bounds, tileGrid, tileOpts);
}

/** Wake Armos statue on Link contact — starts fade-in (weapons ignored). */
export function wakeArmos(e) {
  if (e?.objType === OBJ.ARMOS && e.armosStatue) {
    e.armosStatue = false;
    e.armosFade = 0x30;
    e.timer = 16;
  }
}

/**
 * Post-grab retreat length. NES finishes the remaining emerge trip (up to 7);
 * we synthesize a short slide into the nearest wall, then warp.
 */
const WALLMASTER_CAPTURE_TILES = 3;

/**
 * Pick the wall to retreat into (shortest axis distance to room edge).
 * @param {{ x: number, y: number }} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
function wallmasterRetreatDir(e, bounds) {
  const distL = e.x - bounds.minX;
  const distR = bounds.maxX - e.x;
  const distU = e.y - bounds.minY;
  const distD = bounds.maxY - e.y;
  const min = Math.min(distL, distR, distU, distD);
  if (min === distL) return DIR.LEFT;
  if (min === distR) return DIR.RIGHT;
  if (min === distU) return DIR.UP;
  return DIR.DOWN;
}

/**
 * Capture slide: MoveObject at $18 with no tile/bounce clamp, pin Link, count tiles.
 * NES keeps the trip running until TilesCrossed ≥ 7, then Mode 3 unfurl.
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ x: number, y: number } | null | undefined} link
 */
function stepWallmasterCapture(e, bounds, link) {
  e.qSpeedFrac = QSPEED.WALLMASTER;
  if (e.wallmasterRetreatDir == null) {
    e.wallmasterRetreatDir = wallmasterRetreatDir(e, bounds);
    e.wallmasterTilesCrossed = e.wallmasterTilesCrossed ?? 0;
    e.gridOffset = 0;
  }
  e.dir = e.wallmasterRetreatDir;

  const speed = consumeQSpeedPixels(e);
  if (speed > 0) {
    moveDir(e, speed);
    advanceGridOffset(e, speed);
    // NES: at GridOffset $10 / $F0, truncate, INC step + tiles crossed.
    const go = e.gridOffset & 0xff;
    if (go === 0x10 || go === 0xf0) {
      e.gridOffset = 0;
      e.wallmasterTilesCrossed = (e.wallmasterTilesCrossed ?? 0) + 1;
    }
  }

  if (link) {
    link.x = e.x;
    link.y = e.y;
  }

  // Chase bounds already pad past the lip; leaving them means the hand is in the wall.
  const intoWall =
    e.x < bounds.minX
    || e.x > bounds.maxX
    || e.y < bounds.minY
    || e.y > bounds.maxY;
  if (intoWall || (e.wallmasterTilesCrossed ?? 0) >= WALLMASTER_CAPTURE_TILES) {
    e.wallmasterWarpPending = true;
  }
}

/**
 * Wallmaster: idle along walls, rush when Link shares axis within 8px;
 * on grab, slide into the wall with Link pinned until trip end.
 * @param {Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {number[][] | null} tileGrid
 * @param {object} tileOpts
 * @param {{ x: number, y: number } | null | undefined} link
 */
function stepWallmaster(e, bounds, tileGrid, tileOpts, link) {
  if (e.wallmasterGrab) {
    stepWallmasterCapture(e, bounds, link);
    return;
  }
  // Emerge setup: ObjQSpeedFrac $18.
  e.qSpeedFrac = e.qSpeedFrac ?? QSPEED.WALLMASTER;
  const crawl = e.wallmasterCrawl ?? 0;
  if (crawl > 0) {
    e.wallmasterCrawl = crawl - 1;
    moveEnemyStep(e, bounds, tileGrid, tileOpts);
    return;
  }
  if (link) {
    const dx = Math.abs(link.x - e.x);
    const dy = Math.abs(link.y - e.y);
    if (dx < 8 && dy >= 16) {
      e.dir = link.y >= e.y ? DIR.DOWN : DIR.UP;
      e.wallmasterCrawl = 0x28;
      return;
    }
    if (dy < 8 && dx >= 16) {
      e.dir = link.x >= e.x ? DIR.RIGHT : DIR.LEFT;
      e.wallmasterCrawl = 0x28;
      return;
    }
  }
  if (e.timer <= 0) {
    // Prefer edges of the room (crawl from wall).
    const edgeDirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    e.dir = edgeDirs[(e.anim + e.id) & 3];
    e.timer = 24 + (e.anim & 0x1f);
  }
  moveEnemyStep(e, bounds, tileGrid, tileOpts);
}

/**
 * True while a Wallmaster has Link and is sliding to the wall / entrance warp.
 * @param {Enemy} e
 */
export function wallmasterIsCapturing(e) {
  return Boolean(e?.alive && e.objType === OBJ.WALLMASTER && e.wallmasterGrab);
}

/**
 * True when this hand is dragging that player. A grab is personal: an ally
 * standing in the same room must still walk, and must not ride the warp.
 *
 * @param {Enemy} e
 * @param {number} playerIndex
 */
export function wallmasterHoldsPlayer(e, playerIndex) {
  return wallmasterIsCapturing(e) && (e.wallmasterVictim ?? 0) === (playerIndex ?? 0);
}


/**
 * Darknut ParryOrShove: if weapon dir OR monster dir is axis pair $03/$0C, parry.
 * Facing each other on the same axis (NES: OR of dirs is $03 or $0C) →
 * shield blocks; side / back attacks connect.
 * @param {number} monsterDir
 * @param {number} weaponDir
 */
export function darknutParries(monsterDir, weaponDir) {
  const m = monsterDir & 0x0f;
  const w = weaponDir & 0x0f;
  const axis = (d) => (d === 0x03 || d === 0x0c ? d : 0);
  // Facing each other on the same axis (NES: OR of dirs is $03 or $0C).
  const ored = m | w;
  return ored === 0x03 || ored === 0x0c || Boolean(axis(m) && axis(m) === axis(w));
}

/**
 * True when this foe is a Darknut whose shield faces the weapon.
 * @param {Enemy} e
 * @param {number} weaponDir
 */
function darknutFaceBlocks(e, weaponDir) {
  return (
    (e.objType === OBJ.RED_DARKNUT || e.objType === OBJ.BLUE_DARKNUT)
    && darknutParries(e.dir, weaponDir ?? 0)
  );
}

/**
 * @param {Enemy} e
 * @param {import('./boomerang.js').Boomerang} boom
 */
/**
 * @returns {true | false | 'parry'}
 */
export function tryBoomerangHitEnemy(e, boom) {
  if (!e.alive || e.stunTimer > 0 || !enemyWeaponVulnerable(e)) return false;
  if (!boomerangHits(boom, enemyRect(e))) return false;
  boom.hit = true;
  // Immune → PlayParryTune (Z_01.asm:5903), not DealDamage.
  if (isImmuneToDamage(e.invulnMask, DAMAGE.BOOMERANG)) return 'parry';
  e.stunTimer = BOOMERANG_STUN_FRAMES;
  // NES: boom DealDamage with 0 points — Gel (HP nibble 0) dies on touch.
  if (e.hp <= 0) e.alive = false;
  return true;
}

/**
 * @param {Enemy} e
 * @param {object} sword
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} swordTier
 */
/**
 * @returns {true | false | 'parry'}
 */
export function trySwordHitEnemy(e, sword, linkX, linkY, swordTier, opts = {}) {
  if (!e.alive || e.npc || e.invuln > 0 || !enemyWeaponVulnerable(e)) return false;
  if (e.immortal || e.objType === BOSS.GLEEOK_HEAD) return false;
  if (bossNeedsArrow(e.objType)) return false;
  // Brown Ganon needs the silver arrow; blue Ganon only while he is unseen.
  if (!ganonAcceptsSwordHit(e)) return false;
  if (isPatra(e.objType) && opts.enemies && !patraParentVulnerable(e, opts.enemies)) {
    return false;
  }
  const box = swordHitbox(sword, linkX, linkY);
  if (!box) return false;
  if (isGleeok(e.objType)) {
    if (!gleeokOverlapsHitbox(e, box)) return false;
  } else if (!rectsOverlap(box, enemyRect(e))) {
    return false;
  }
  // Dodongo: sword only while stunned (mask $FE path in ASM).
  const dodongoStunned =
    isDodongo(e.objType) && e.bossState === DODONGO_STATE.STUNNED;
  // Connected but blocked → PlayParryTune (Darknut face / invuln mask).
  // Fire/bomb skips are handled in those helpers; sword always chirps.
  if (!dodongoStunned && isImmuneToDamage(e.invulnMask, DAMAGE.SWORD)) {
    return 'parry';
  }
  if (darknutFaceBlocks(e, sword.dir ?? 0)) {
    return 'parry';
  }
  const dmg = swordDamage(swordTier);
  e.invuln = 16;
  if (isWormType(e.objType) && opts.enemies) {
    return damageWorm(e, opts.enemies, dmg);
  }
  if (e.objType === BOSS.MANHANDLA) {
    return damageManhandla(e, dmg);
  }
  if (isGleeok(e.objType)) {
    return damageGleeok(e, dmg, opts.onGleeokHeadDetach);
  }
  e.hp -= dmg;
  ganonRegisterSwordHit(e);
  if (e.hp <= 0) {
    if (ganonSwordKoToBrown(e)) return true;
    e.alive = false;
    if (isGleeok(e.objType) && opts.enemies) clearGleeokHeads(e.id, opts.enemies);
  }
  return true;
}

/**
 * @param {Enemy} e
 * @param {import('./projectiles.js').Projectile} arrow
 * @param {{ enemies?: Enemy[] }} [opts]
 */
/**
 * @returns {true | false | 'parry'}
 */
export function tryArrowHitEnemy(e, arrow, opts = {}) {
  if (!e.alive || e.npc || e.invuln > 0 || !enemyWeaponVulnerable(e) || !arrow?.alive) {
    return false;
  }
  if (arrow.kind !== 0x5b && arrow.kind !== 0x5c) return false;
  if (!rectsOverlap({ x: arrow.x, y: arrow.y, w: 8, h: 8 }, enemyRect(e))) {
    return false;
  }
  // Pols Voice: arrow instakill (special case outside $FE mask).
  if (e.objType === OBJ.POLS_VOICE) {
    e.hp = 0;
    e.alive = false;
    arrow.alive = false;
    return true;
  }
  // Gohma closed eye / wrong part → PlayParryTune (@PlayParryTune Z_04.asm:8500).
  if (isGohma(e.objType) && !gohmaEyeVulnerable(e, arrow)) {
    arrow.alive = false;
    return 'parry';
  }
  if (isImmuneToDamage(e.invulnMask, DAMAGE.ARROW)) {
    arrow.alive = false;
    return 'parry';
  }
  const tier = arrow.arrowTier ?? 1;
  // Ganon: silver only in brown phase.
  if (e.objType === BOSS.GANON) {
    if (tier < 2 || e.ganonPhase !== 1) {
      arrow.alive = false;
      return 'parry';
    }
  }
  const dmg =
    e.objType === BOSS.GANON
      ? 0x40
      : bossNeedsArrow(e.objType)
        ? tier >= 2
          ? 0x40
          : 0x20
        : tier >= 2
          ? 0x20
          : 0x10;
  e.invuln = 12;
  arrow.alive = false;
  if (isWormType(e.objType) && opts.enemies) {
    return damageWorm(e, opts.enemies, dmg);
  }
  e.hp -= dmg;
  if (e.hp <= 0) e.alive = false;
  return true;
}

/**
 * Candle fire ($10 damage points, DAMAGE.FIRE).
 * @param {Enemy} e
 * @param {object} flame
 * @param {{ enemies?: Enemy[] }} [opts]
 */
export function tryFireHitEnemy(e, flame, opts = {}) {
  if (!e.alive || e.npc || e.invuln > 0 || !enemyWeaponVulnerable(e)) return false;
  if (!flame?.alive) return false;
  if (e.immortal || e.objType === BOSS.GLEEOK_HEAD) return false;
  if (isImmuneToDamage(e.invulnMask, DAMAGE.FIRE)) return false;
  if (!flameHits(flame, enemyRect(e))) return false;
  e.invuln = 12;
  if (isWormType(e.objType) && opts.enemies) {
    return damageWorm(e, opts.enemies, FLAME_DAMAGE);
  }
  if (e.objType === BOSS.MANHANDLA) {
    return damageManhandla(e, FLAME_DAMAGE);
  }
  e.hp -= FLAME_DAMAGE;
  if (e.hp <= 0) e.alive = false;
  return true;
}

/**
 * Friendly sword beam ($57) / magic rod ($59).
 * @param {Enemy} e
 * @param {import('./projectiles.js').Projectile} p
 * @param {{ enemies?: Enemy[] }} [opts]
 */
/**
 * @returns {true | false | 'parry'}
 */
export function tryBeamOrRodHitEnemy(e, p, opts = {}) {
  if (!e.alive || e.npc || e.invuln > 0 || !enemyWeaponVulnerable(e) || !p?.alive) {
    return false;
  }
  if (!p.friendly) return false;
  // $57 sword beam / $59 magic rod (avoid importing projectiles — cycle).
  if (p.kind !== 0x57 && p.kind !== 0x59) return false;
  if (e.immortal || e.objType === BOSS.GLEEOK_HEAD) return false;
  if (!rectsOverlap({ x: p.x, y: p.y, w: 8, h: 8 }, enemyRect(e))) return false;
  const dtype = p.kind === 0x59 ? DAMAGE.MAGIC : DAMAGE.SWORD;
  if (isImmuneToDamage(e.invulnMask, dtype)) {
    p.alive = false;
    return 'parry';
  }
  // Sword beam uses the same face-parry as melee (rod is already mask-immune).
  if (darknutFaceBlocks(e, p.dir ?? 0)) {
    p.alive = false;
    return 'parry';
  }
  if (isPatra(e.objType) && opts.enemies && !patraParentVulnerable(e, opts.enemies)) {
    p.alive = false;
    return 'parry';
  }
  const dmg = p.weaponDamage || (p.kind === 0x59 ? 0x20 : 0x10);
  e.invuln = 12;
  p.alive = false;
  if (isWormType(e.objType) && opts.enemies) {
    return damageWorm(e, opts.enemies, dmg);
  }
  if (e.objType === BOSS.MANHANDLA) {
    return damageManhandla(e, dmg);
  }
  if (isGleeok(e.objType)) {
    return damageGleeok(e, dmg, opts.onGleeokHeadDetach);
  }
  e.hp -= dmg;
  if (e.hp <= 0) {
    if (ganonSwordKoToBrown(e)) return true;
    e.alive = false;
    if (isGleeok(e.objType) && opts.enemies) clearGleeokHeads(e.id, opts.enemies);
  }
  return true;
}

/**
 * @param {Enemy} e
 * @param {import('./bomb.js').Bomb} bomb
 * @param {{ enemies?: Enemy[] }} [opts]
 * @returns {true | false | 'parry'}
 */
export function tryBombHitEnemy(e, bomb, opts = {}) {
  if (!e.alive || e.invuln > 0) return false;
  if (e.immortal || e.objType === BOSS.GLEEOK_HEAD) return false;
  if (isDodongo(e.objType)) {
    return tryDodongoBombInteract(e, bomb);
  }
  if (!enemyWeaponVulnerable(e)) return false;
  if (isImmuneToDamage(e.invulnMask, DAMAGE.BOMB)) return false;
  if (isPatra(e.objType) && opts.enemies && !patraParentVulnerable(e, opts.enemies)) {
    return false;
  }
  if (!bombHits(bomb, enemyRect(e))) return false;
  // NES: blast uses Link's facing when the bomb was placed vs Darknut dir.
  if (darknutFaceBlocks(e, bomb.dir ?? 0)) {
    return 'parry';
  }
  e.invuln = 16;
  if (isWormType(e.objType) && opts.enemies) {
    return damageWorm(e, opts.enemies, 0x40);
  }
  if (e.objType === BOSS.MANHANDLA) {
    return damageManhandla(e, 0x40);
  }
  if (isGleeok(e.objType)) {
    // Gleeok mask $FE — bomb immune in NES; keep immune via mask above.
    return false;
  }
  e.hp -= 0x40;
  if (e.hp <= 0) e.alive = false;
  return true;
}

/**
 * Link contact — NES CheckLinkCollision (centers within $09).
 * @param {Enemy} e
 * @param {number} linkX
 * @param {number} linkY
 */
export function enemyTouchesLink(e, linkX, linkY) {
  if (!enemyIsHostile(e)) return false;
  // Bubbles / traps ignore invuln frames for contact effects.
  if (e.invuln > 0 && !isBubbleType(e.objType) && !isTrapType(e.objType)) return false;
  if (isGleeok(e.objType)) return gleeokTouchesLink(e, linkX, linkY);
  return objectTouchesLink(e.x, e.y, linkX, linkY, {
    halfWidth: enemyHalfWidth(e.objType),
  });
}

export function isBubbleType(objType) {
  return objType === OBJ.BUBBLE || objType === OBJ.BUBBLE_BLUE || objType === OBJ.BUBBLE_RED;
}

/**
 * On death: Vire → 2 red keese; Zol → 2 gels; Ghini cascades flying ghini.
 * @param {Enemy} dead
 * @param {Enemy[]} enemies
 * @returns {Enemy[]} newly spawned
 */
export function spawnDeathSplits(dead, enemies) {
  /** @type {Enemy[]} */
  const born = [];
  if (dead.objType === OBJ.VIRE) {
    for (let i = 0; i < 2; i += 1) {
      const k = createEnemy({
        objType: OBJ.RED_KEESE,
        x: dead.x + (i ? 8 : -8),
        y: dead.y,
        slotIndex: dead.slotIndex,
      });
      if (k) born.push(k);
    }
  } else if (dead.objType === OBJ.ZOL) {
    // CreateChildGel: type $14, state 0, shared gridOffset; opposite facings.
    const dirs = gelSplitChildDirs(dead.dir);
    for (let i = 0; i < 2; i += 1) {
      const g = createEnemy({
        objType: OBJ.GEL,
        x: dead.x,
        y: dead.y,
        dir: dirs[i],
        slotIndex: dead.slotIndex,
      });
      if (g) {
        g.gelState = GEL_STATE.SPLIT_START;
        g.gridOffset = dead.gridOffset ?? 0;
        g.timer = 0;
        born.push(g);
      }
    }
  } else if (dead.objType === OBJ.GHINI) {
    for (const e of enemies) {
      if (e.objType === OBJ.FLYING_GHINI && e.alive) {
        e.alive = false;
        e.hp = 0;
      }
    }
  } else if (dead.objType === OBJ.ARMOS) {
    // NES sets type to $5D dead dummy — we mark the corpse type for clarity.
    dead.objType = OBJ.DEAD_DUMMY;
  }
  // Splits still need object slots; the corpse frees the one it occupied.
  const room = monsterSlotsFree(enemies) + 1;
  return born.length > room ? born.slice(0, room) : born;
}

/** OW play bounds for wandering. */
export const OW_ENEMY_BOUNDS = Object.freeze({
  minX: 0x20,
  maxX: 0xd8,
  minY: 0x4d,
  maxY: 0xd0,
});

/**
 * UW BoundByRoom box in enemy chase-bounds form (`max*` is exclusive of the
 * 16px sprite, matching OW_ENEMY_BOUNDS). Boss AI clamps to this instead of
 * the Phase-18 camera chase pad so Manhandla / Patra / etc. stay in-room.
 */
export const UW_ENEMY_BOUNDS = Object.freeze({
  minX: UW_BOUNDS.left,
  maxX: UW_BOUNDS.right + 16,
  minY: UW_BOUNDS.top,
  maxY: UW_BOUNDS.bottom + 16,
});
