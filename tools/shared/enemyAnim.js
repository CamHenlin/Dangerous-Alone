import { DIR } from './collision.js';
import {
  BOSS,
  CHILD_DIGDOGGER,
  PATRA_CHILD,
  PATRA_CHILD_RED,
  MOLDORM,
  RED_LAMNOLA,
  BLUE_LAMNOLA,
  GRUMBLE,
  hasBossComposer,
} from './bossSpriteLayouts.js';

/**
 * PPU sprite tile bases from ObjAnimations / ObjAnimFrameHeap (Z_01.asm).
 * DrawObjectWithType indexes ObjAnimations[type+1].
 * Pattern blocks load enemy CHR at PPU $8E (common UW / OW sprites).
 */
export const SPRITE_PPU_BASE = 0x8e;
export const UW_SPECIAL_PPU_BASE = 0x9e;
export const BOSS_PPU_BASE = 0xc0;

const T = Object.freeze({
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
  POLS_VOICE: 0x16,
  LIKE_LIKE: 0x17,
  CHILD_DIGDOGGER,
  PEAHAT: 0x1a,
  BLUE_KEESE: 0x1b,
  RED_KEESE: 0x1c,
  BLACK_KEESE: 0x1d,
  ARMOS: 0x1e,
  BOULDER_SET: 0x1f,
  BOULDER: 0x20,
  GHINI: 0x21,
  FLYING_GHINI: 0x22,
  BLUE_WIZZROBE: 0x23,
  RED_WIZZROBE: 0x24,
  PATRA_CHILD,
  PATRA_CHILD_RED,
  WALLMASTER: 0x27,
  ROPE: 0x28,
  STALFOS: 0x2a,
  BUBBLE: 0x2b,
  BUBBLE_BLUE: 0x2c,
  BUBBLE_RED: 0x2d,
  POND_FAIRY: 0x2f,
  GIBDO: 0x30,
  /** Rupee stash pickup — Anim_ItemFrameTiles rupee ($32). */
  RUPEE_STASH: 0x35,
  DODONGO_1: BOSS.DODONGO_1,
  DODONGO: BOSS.DODONGO,
  GOHMA_RED: BOSS.GOHMA_RED,
  GOHMA: BOSS.GOHMA,
  GRUMBLE,
  ZELDA: BOSS.ZELDA,
  DIGDOGGER_1: BOSS.DIGDOGGER_1,
  DIGDOGGER: BOSS.DIGDOGGER,
  RED_LAMNOLA,
  BLUE_LAMNOLA,
  MANHANDLA: BOSS.MANHANDLA,
  AQUAMENTUS: 0x3d,
  GANON: BOSS.GANON,
  MOLDORM,
  GLEEOK_2: BOSS.GLEEOK_2,
  GLEEOK_3: BOSS.GLEEOK_3,
  GLEEOK_4: BOSS.GLEEOK_4,
  GLEEOK_HEAD: BOSS.GLEEOK_HEAD,
  PATRA: BOSS.PATRA,
  PATRA_RED: BOSS.PATRA_RED,
  TRAP: 0x49,
  TRAP2: 0x4a,
  /** Underworld persons Person1–Person8 (Old Man tile). */
  PERSON1: 0x4b,
  PERSON8: 0x52,
});

/** Leever phase values (mirror enemies.js LEEVER_PHASE). */
const LEEVER_PHASE = Object.freeze({
  BURIED: 0,
  EMERGE: 1,
  ACTIVE: 2,
  DIG: 3,
});

/**
 * ObjAnimFrameHeap Leever strip (10 frames):
 * prodrome ×4, active ×2, postdrome ×4.
 */
const LEEVER_FRAMES = Object.freeze([
  0xbc, 0xbe, 0xc0, 0xc0, 0xc2, 0xc4, 0xc0, 0xc0, 0xbc, 0xbe,
]);

/** Walker side/down/up left-tiles (AnimateObjectWalking frame images 0–3). */
const WALKER_LYNEL = Object.freeze([0xce, 0xd2, 0xd6, 0xda]);
const WALKER_MOBLIN = Object.freeze([0xf0, 0xf4, 0xf8, 0xfc]);
const WALKER_GORIYA = Object.freeze([0xb8, 0xbc, 0xb0, 0xb4]);

/** Left-tile PPU indices per animation frame for supported types. */
const FRAME_TILES = Object.freeze({
  [T.RED_LYNEL]: WALKER_LYNEL,
  [T.BLUE_LYNEL]: WALKER_LYNEL,
  [T.RED_MOBLIN]: WALKER_MOBLIN,
  [T.BLUE_MOBLIN]: WALKER_MOBLIN,
  [T.RED_GORIYA]: WALKER_GORIYA,
  [T.BLUE_GORIYA]: WALKER_GORIYA,
  [T.RED_OCTOROK_SLOW]: [0xb4, 0xb0, 0xb0, 0xb8, 0xb2, 0xb2],
  [T.RED_OCTOROK_FAST]: [0xb4, 0xb0, 0xb0, 0xb8, 0xb2, 0xb2],
  [T.BLUE_OCTOROK_SLOW]: [0xb4, 0xb0, 0xb0, 0xb8, 0xb2, 0xb2],
  [T.BLUE_OCTOROK_FAST]: [0xb4, 0xb0, 0xb0, 0xb8, 0xb2, 0xb2],
  // ObjAnimations[type+1]: red $0B → heap $64, blue $0C → heap $6A.
  // Both strips are H0,D0,U0,H1,D1,U1 and identical in the ROM ($B8,$AC,$B4…).
  // Red previously reused the octorok @$21 strip; DrawObjectNotMirrored then
  // paired octorok left columns with the wrong +2/+3 tiles and split the body.
  [T.RED_DARKNUT]: [0xb8, 0xac, 0xb4, 0xbc, 0xb0, 0xb4],
  [T.BLUE_DARKNUT]: [0xb8, 0xac, 0xb4, 0xbc, 0xb0, 0xb4],
  [T.BLUE_TEKTITE]: [0xca, 0xcc],
  [T.RED_TEKTITE]: [0xca, 0xcc],
  [T.BLUE_LEEVER]: LEEVER_FRAMES,
  [T.RED_LEEVER]: LEEVER_FRAMES,
  // Zora active head frames (heap $EC/$EE); mound omitted for MVP visibility.
  [T.ZORA]: [0xec, 0xee],
  [T.VIRE]: [0xac, 0xae, 0xb0, 0xb2],
  [T.ZOL]: [0xa8, 0xaa],
  [T.GEL]: [0x92, 0x94],
  [T.GEL2]: [0x92, 0x94],
  [T.POLS_VOICE]: [0xa0, 0xa2],
  [T.LIKE_LIKE]: [0xa6, 0xa4, 0xa2, 0xa4],
  [T.PEAHAT]: [0xc6, 0xc8],
  [T.BLUE_KEESE]: [0x9a, 0x9c],
  [T.RED_KEESE]: [0x9a, 0x9c],
  [T.BLACK_KEESE]: [0x9a, 0x9c],
  // Armos: frontA, backA, frontB, backB
  [T.ARMOS]: [0xa0, 0xa8, 0xa4, 0xac],
  // ObjAnimFrameHeap @$4F: $90 / $E8 (DrawObjectNotMirrored rock spin).
  [T.BOULDER]: [0x90, 0xe8],
  [T.GHINI]: [0xe4, 0xe0],
  [T.FLYING_GHINI]: [0xe4, 0xe0],
  // Wizzrobe: side0, side1, up0, up1
  [T.BLUE_WIZZROBE]: [0xb4, 0xb8, 0xbc, 0xbe],
  [T.RED_WIZZROBE]: [0xb4, 0xb8, 0xbc, 0xbe],
  // Open $AC..$AF (NotMirrored). Closed heap is $9C/$9E but left is patched to $AC
  // (Z_04 Wallmaster @PatchSprites) — see wallmasterRightTile.
  [T.WALLMASTER]: [0xac, 0x9c],
  [T.ROPE]: [0xa0, 0xa4],
  [T.STALFOS]: [0xa8],
  [T.BUBBLE]: [0x8e],
  [T.BUBBLE_BLUE]: [0x8e],
  [T.BUBBLE_RED]: [0x8e],
  // DrawFairy → Anim_ItemFrameTiles @$19/$1A ($50 / $52), narrow 8×16.
  [T.POND_FAIRY]: [0x50, 0x52],
  // DrawItemInInventory slot $16 → Anim_ItemFrameTiles @$1C → $32.
  [T.RUPEE_STASH]: [0x32],
  [T.GIBDO]: [0xa4],
  [T.TRAP]: [0x96],
  [T.TRAP2]: [0x96],
  // Person_Draw → ObjAnimFrameHeap $CA → left tile $98 (mirrored).
  [T.PERSON1]: [0x98],
  [0x4c]: [0x98],
  [0x4d]: [0x98],
  [0x4e]: [0x98],
  [0x4f]: [0x98],
  [0x50]: [0x98],
  [0x51]: [0x98],
  [T.PERSON8]: [0x98],
  // Boss / stretch — single-tile or simple strips (composites use hasBossComposer).
  [T.GRUMBLE]: [0xb0],
  [T.ZELDA]: [0xf6],
  [T.PATRA]: [0xf8],
  [T.PATRA_RED]: [0xf8],
  [T.PATRA_CHILD]: [0xfc, 0xfe],
  [T.PATRA_CHILD_RED]: [0xfc, 0xfe],
  [T.GLEEOK_HEAD]: [0xde, 0xee],
  [T.MOLDORM]: [0x44],
  [T.RED_LAMNOLA]: [0x9e, 0xa0],
  [T.BLUE_LAMNOLA]: [0x9e, 0xa0],
  [T.CHILD_DIGDOGGER]: [0xd8, 0xda],
});

/** Aquamentus face/body tiles (top of each 8×16) — two mouth frames × 6 sprites. */
export const AQUAMENTUS_FRAMES = Object.freeze([
  [0xcc, 0xc4, 0xc8, 0xc2, 0xc6, 0xca],
  [0xcc, 0xc4, 0xc8, 0xce, 0xd0, 0xd2],
]);

export const AQUAMENTUS_OFFSETS = Object.freeze([
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 16, y: 0 },
  { x: 0, y: 16 },
  { x: 8, y: 16 },
  { x: 16, y: 16 },
]);

export const PROJECTILE_TILE = Object.freeze({
  ROCK: 0x9e,
  FIREBALL: 0x44,
});

/**
 * Types that render via Aquamentus / boss composers (or other non-FRAME_TILES path).
 * @param {number} objType
 */
export function hasSpecialEnemySprite(objType) {
  // BoulderSet is an invisible spawner — covered so play never color-stubs it.
  return (
    objType === T.AQUAMENTUS
    || objType === T.BOULDER_SET
    || hasBossComposer(objType)
  );
}

/**
 * True when play can resolve a CHR texture for this object type.
 * @param {number} objType
 */
export function hasEnemySprite(objType) {
  return FRAME_TILES[objType] != null || hasSpecialEnemySprite(objType);
}

/**
 * NES LevelPatternBlockSrcAddrs — UW special sprites at PPU $9E.
 * Levels 1/2/7 → 127, 3/5/8 → 358, 4/6/9 → 469.
 * @param {number} [level] 1–9
 */
export function uwSpecialSheetForLevel(level = 1) {
  const n = level | 0;
  if (n === 4 || n === 6 || n === 9) return 'uw469';
  if (n === 3 || n === 5 || n === 8) return 'uw358';
  return 'uw127';
}

/**
 * NES BossPatternBlockSrcAddrs — boss sprites at PPU $C0.
 * @param {number} [level] 1–9
 */
export function bossSheetForLevel(level = 1) {
  const n = level | 0;
  if (n === 9) return 'boss9';
  if (n === 3 || n === 4 || n === 6 || n === 8) return 'boss3468';
  return 'boss1257';
}

/**
 * Which extracted sheet holds a PPU sprite tile (play-time mapping).
 * @param {number} ppuTile
 * @param {'overworld' | 'dungeon'} mode
 * @param {number} [level] dungeon level 1–9 (selects UW special / boss sheet)
 */
export function sheetForPpuTile(ppuTile, mode, level = 1) {
  if (ppuTile < SPRITE_PPU_BASE) {
    return { sheet: 'common', index: ppuTile };
  }
  if (mode === 'overworld') {
    return { sheet: 'overworld', index: ppuTile - SPRITE_PPU_BASE };
  }
  if (ppuTile < UW_SPECIAL_PPU_BASE) {
    return { sheet: 'uwCommon', index: ppuTile - SPRITE_PPU_BASE };
  }
  if (ppuTile < BOSS_PPU_BASE) {
    return { sheet: uwSpecialSheetForLevel(level), index: ppuTile - UW_SPECIAL_PPU_BASE };
  }
  return { sheet: bossSheetForLevel(level), index: ppuTile - BOSS_PPU_BASE };
}

function isOctorok(objType) {
  return (
    objType === T.RED_OCTOROK_SLOW
    || objType === T.RED_OCTOROK_FAST
    || objType === T.BLUE_OCTOROK_SLOW
    || objType === T.BLUE_OCTOROK_FAST
  );
}

function isWalker(objType) {
  return (
    objType === T.RED_LYNEL
    || objType === T.BLUE_LYNEL
    || objType === T.RED_MOBLIN
    || objType === T.BLUE_MOBLIN
    || objType === T.RED_GORIYA
    || objType === T.BLUE_GORIYA
  );
}

function isDarknut(objType) {
  return objType === T.RED_DARKNUT || objType === T.BLUE_DARKNUT;
}

function isWizzrobe(objType) {
  return objType === T.BLUE_WIZZROBE || objType === T.RED_WIZZROBE;
}

function isGhini(objType) {
  return objType === T.GHINI || objType === T.FLYING_GHINI;
}

function isBubble(objType) {
  return objType === T.BUBBLE || objType === T.BUBBLE_BLUE || objType === T.BUBBLE_RED;
}

function isTrap(objType) {
  return objType === T.TRAP || objType === T.TRAP2;
}

/** UW Person1–Person8 ($4B–$52). $53 is flying rock. */
function isPersonAnim(objType) {
  return objType >= T.PERSON1 && objType <= T.PERSON8;
}

function walkBit(anim) {
  return (anim >> 3) & 1;
}

/** AnimateObjectWalking: 0/1 side, 2 down, 3 up. */
function walkerFrameIndex(dir, anim) {
  if (dir & DIR.UP) return 3;
  if (dir & DIR.DOWN) return 2;
  return walkBit(anim);
}

/**
 * @param {number} objType
 * @param {number} dir
 * @param {number} anim
 * @param {{ leeverPhase?: number, timer?: number }} [meta]
 */
export function enemyFrameIndex(objType, dir, anim, meta = {}) {
  const tiles = FRAME_TILES[objType];
  if (!tiles) return 0;

  if (isOctorok(objType)) {
    const walk = walkBit(anim) ? 3 : 0;
    if (dir & DIR.UP) return walk + 1;
    if (dir & DIR.DOWN) return walk + 2;
    return walk;
  }

  if (isWalker(objType)) {
    return walkerFrameIndex(dir, anim);
  }

  if (isDarknut(objType)) {
    let base = 0;
    if (dir & DIR.DOWN) base = 1;
    else if (dir & DIR.UP) base = 2;
    return base + (walkBit(anim) ? 3 : 0);
  }

  if (objType === T.ARMOS) {
    return (walkBit(anim) ? 2 : 0) + ((dir & DIR.UP) ? 1 : 0);
  }

  if (isGhini(objType)) {
    return dir & DIR.UP ? 0 : 1;
  }

  if (isWizzrobe(objType)) {
    return (dir & DIR.UP ? 2 : 0) + walkBit(anim);
  }

  if (objType === T.VIRE) {
    return (dir & DIR.UP ? 2 : 0) + walkBit(anim);
  }

  if (objType === T.RED_LAMNOLA || objType === T.BLUE_LAMNOLA) {
    return meta.wormHead ? 0 : 1;
  }

  if (objType === T.PATRA || objType === T.PATRA_RED || objType === T.GLEEOK_HEAD
    || objType === T.PATRA_CHILD || objType === T.PATRA_CHILD_RED
    || objType === T.CHILD_DIGDOGGER) {
    return walkBit(anim) % tiles.length;
  }

  if (objType === T.BLUE_LEEVER || objType === T.RED_LEEVER) {
    const phase = meta.leeverPhase ?? LEEVER_PHASE.ACTIVE;
    const t = meta.timer ?? 0;
    if (phase === LEEVER_PHASE.EMERGE) {
      return Math.min(3, Math.max(0, 3 - Math.floor(t / 4)));
    }
    if (phase === LEEVER_PHASE.DIG) {
      return 6 + Math.min(3, Math.max(0, 3 - Math.floor(t / 4)));
    }
    return 4 + walkBit(anim);
  }

  if (objType === T.STALFOS || isBubble(objType) || objType === T.GIBDO || isTrap(objType)) {
    return walkBit(anim);
  }

  if (objType === T.ROPE) {
    return walkBit(anim);
  }

  // DrawFairy: every 4 frames switch $50 ↔ $52.
  if (objType === T.POND_FAIRY) {
    return (anim >> 2) & 1;
  }

  return walkBit(anim) % tiles.length;
}

/**
 * @param {number} objType
 * @param {number} frameIndex
 */
export function enemyFrameTile(objType, frameIndex) {
  const tiles = FRAME_TILES[objType];
  if (!tiles) return null;
  return tiles[frameIndex % tiles.length];
}

/**
 * Wallmaster right-column tile after DrawObjectNotMirrored (+2) / @PatchSprites.
 * Frame 0: open hand right ($AE). Frame 1: closed-hand right ($9E); left stays $AC.
 * @param {number} frameIndex
 */
export function wallmasterRightTile(frameIndex) {
  return (frameIndex & 1) ? 0x9e : 0xae;
}

/**
 * NES draw flags for a 16×16 enemy.
 *
 * @param {number} objType
 * @param {number} dir
 * @param {number} frameIndex
 * @returns {{ mirror: boolean, flipH: boolean, flipV: boolean }}
 */
export function enemyDrawFlags(objType, dir, frameIndex) {
  const vertical = Boolean(dir & (DIR.UP | DIR.DOWN));

  // Stalfos / Gibdo / bubbles: CHR stores one 8×16 column; walk anim is H-flip.
  // Pairing tile+2 (NotMirrored) pulls the next enemy's column and splits the body.
  if (objType === T.STALFOS || isBubble(objType) || objType === T.GIBDO) {
    return { mirror: true, flipH: Boolean(frameIndex & 1), flipV: false };
  }

  if (objType === T.ROPE) {
    return { mirror: false, flipH: Boolean(dir & DIR.LEFT), flipV: false };
  }

  if (isTrap(objType)) {
    return { mirror: true, flipH: false, flipV: false };
  }

  // Person_DrawAndCheckCollisions → DrawObjectMirrored.
  if (isPersonAnim(objType) || objType === T.ZELDA) {
    return { mirror: true, flipH: false, flipV: false };
  }

  if (objType === T.GRUMBLE || objType === T.POND_FAIRY) {
    return { mirror: false, flipH: false, flipV: false };
  }

  if (objType === T.PATRA || objType === T.PATRA_RED) {
    return { mirror: false, flipH: Boolean(frameIndex & 1), flipV: false };
  }

  if (
    objType === T.PATRA_CHILD
    || objType === T.PATRA_CHILD_RED
  ) {
    return { mirror: false, flipH: false, flipV: false };
  }

  if (objType === T.GLEEOK_HEAD || objType === T.CHILD_DIGDOGGER) {
    return { mirror: true, flipH: false, flipV: false };
  }

  if (objType === T.MOLDORM || objType === T.RED_LAMNOLA || objType === T.BLUE_LAMNOLA) {
    return { mirror: false, flipH: false, flipV: false };
  }

  if (isWizzrobe(objType)) {
    if (dir & DIR.UP) {
      return { mirror: true, flipH: false, flipV: false };
    }
    return { mirror: false, flipH: Boolean(dir & DIR.RIGHT), flipV: false };
  }

  if (isDarknut(objType)) {
    const flipH =
      Boolean(dir & DIR.LEFT)
      || (Boolean(dir & DIR.UP) && Boolean(frameIndex >= 3));
    return { mirror: false, flipH, flipV: false };
  }

  // Goriya side CHR is the same UW strip as Darknut ($B8/$BC) — faces right,
  // so H-flip on LEFT. Lynel/Moblin OW side CHR faces left (flip on RIGHT).
  if (objType === T.RED_GORIYA || objType === T.BLUE_GORIYA) {
    return {
      mirror: false,
      flipH: Boolean(dir & DIR.LEFT),
      flipV: false,
    };
  }

  if (objType === T.ARMOS || isWalker(objType)) {
    return {
      mirror: false,
      flipH: Boolean(dir & DIR.RIGHT),
      flipV: false,
    };
  }

  if (isGhini(objType)) {
    return { mirror: false, flipH: Boolean(dir & DIR.RIGHT), flipV: false };
  }

  // Boulder: DrawObjectNotMirrored — no H-mirror pair.
  if (objType === T.BOULDER) {
    return { mirror: false, flipH: false, flipV: false };
  }

  // Wallmaster: DrawObjectNotMirrored (Z_04). Mirroring $AC turns the open hand
  // into a blob. Step H-flip is via [0F] / WallmasterDirsAndAttrs — approximate
  // with facing; full attr table can come later.
  if (objType === T.WALLMASTER) {
    return {
      mirror: false,
      flipH: Boolean(dir & DIR.LEFT),
      flipV: false,
    };
  }

  const alwaysMirror =
    objType === T.BLUE_TEKTITE
    || objType === T.RED_TEKTITE
    || objType === T.BLUE_LEEVER
    || objType === T.RED_LEEVER
    || objType === T.ZORA
    || objType === T.VIRE
    || objType === T.ZOL
    || objType === T.GEL
    || objType === T.GEL2
    || objType === T.POLS_VOICE
    || objType === T.LIKE_LIKE
    || objType === T.PEAHAT
    || objType === T.BLUE_KEESE
    || objType === T.RED_KEESE
    || objType === T.BLACK_KEESE;

  let mirror = alwaysMirror;
  if (isOctorok(objType)) {
    mirror = vertical;
  }

  const flipH =
    !mirror
    && Boolean(dir & DIR.RIGHT)
    && isOctorok(objType);

  const flipV = isOctorok(objType) && frameIndex % 3 === 1;

  return { mirror, flipH, flipV };
}

/**
 * @deprecated use enemyDrawFlags
 * @param {number} objType
 * @param {number} dir
 */
export function enemyFlipH(objType, dir) {
  return enemyDrawFlags(objType, dir, 0).flipH;
}

/**
 * @param {{ timer: number }} e
 */
export function aquamentusMouthOpen(e) {
  return e.timer < 0x20;
}
