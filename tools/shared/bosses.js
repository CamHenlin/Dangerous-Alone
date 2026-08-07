import { DIR } from './collision.js';

/** Boss / end-game object types (UpdateObject_JumpTable). */
export const BOSS = Object.freeze({
  /** Three-Dodongo rooms (L5/L7) — same AI as $32. */
  DODONGO_1: 0x31,
  DODONGO: 0x32,
  /** Red Gohma (L8). */
  GOHMA_RED: 0x33,
  GOHMA: 0x34,
  /** Digdogger that splits into 1 child. */
  DIGDOGGER_1: 0x38,
  /** Digdogger that splits into 3 children. */
  DIGDOGGER: 0x39,
  MANHANDLA: 0x3c,
  AQUAMENTUS: 0x3d,
  GANON: 0x3e,
  ZELDA: 0x37,
  GLEEOK_2: 0x43,
  GLEEOK_3: 0x44,
  GLEEOK_4: 0x45,
  /** Detached flying Gleeok head (immortal until body dies). */
  GLEEOK_HEAD: 0x46,
  PATRA: 0x47,
  /** Red Patra (L9). */
  PATRA_RED: 0x48,
});

/** Little digdogger after flute split (not a boss type). */
export const CHILD_DIGDOGGER = 0x18;
/** Patra orbiters (wide / tight). */
export const PATRA_CHILD = 0x25;
export const PATRA_CHILD_RED = 0x26;

const BOSS_SET = new Set(
  Object.values(BOSS).filter((t) => t !== BOSS.GLEEOK_HEAD),
);

export function isBossType(objType) {
  return BOSS_SET.has(objType);
}

export function isZelda(objType) {
  return objType === BOSS.ZELDA;
}

export function isGanon(objType) {
  return objType === BOSS.GANON;
}

export function isDodongo(objType) {
  return objType === BOSS.DODONGO || objType === BOSS.DODONGO_1;
}

export function isGohma(objType) {
  return objType === BOSS.GOHMA || objType === BOSS.GOHMA_RED;
}

export function isGleeok(objType) {
  return (
    objType === BOSS.GLEEOK_2
    || objType === BOSS.GLEEOK_3
    || objType === BOSS.GLEEOK_4
  );
}

export function isPatra(objType) {
  return objType === BOSS.PATRA || objType === BOSS.PATRA_RED;
}

export function isPatraChild(objType) {
  return objType === PATRA_CHILD || objType === PATRA_CHILD_RED;
}

/** Neck/head count for Gleeok type ($43→2 … $45→4); NES last-index = type−$42. */
export function gleeokHeadCount(objType) {
  if (!isGleeok(objType)) return 0;
  return objType - 0x41;
}

/** Bosses that ignore sword entirely (Gohma eye — arrows only). Ganon uses phase rules. */
export function bossNeedsArrow(objType) {
  return isGohma(objType);
}

/**
 * @param {number} objType
 */
export function bossSize(objType) {
  if (objType === BOSS.ZELDA) return { w: 16, h: 16 };
  if (objType === BOSS.PATRA || objType === BOSS.PATRA_RED) return { w: 16, h: 16 };
  if (objType === BOSS.GANON) return { w: 32, h: 32 };
  if (
    objType === BOSS.MANHANDLA
    || objType === BOSS.GLEEOK_2
    || objType === BOSS.GLEEOK_3
    || objType === BOSS.GLEEOK_4
  ) {
    return { w: 32, h: 32 };
  }
  return { w: 32, h: 24 };
}

/**
 * Fallback HP when HpPairs under-reports (stub bosses must be killable).
 * @param {number} objType
 * @param {number} baseHp from hpForType
 */
export function bossHp(objType, baseHp) {
  if (objType === BOSS.ZELDA) return 0xffff;
  if (objType === BOSS.GANON) return Math.max(baseHp, 0xa0);
  if (isPatra(objType)) return Math.max(baseHp, 0xb0);
  if (isGleeok(objType)) return Math.max(baseHp, 0xa0);
  if (objType === BOSS.MANHANDLA) return Math.max(baseHp, 0x40);
  return Math.max(baseHp, 0x60);
}

/**
 * Simplified boss motion: pace horizontally; Zelda stands still.
 * @param {import('./enemies.js').Enemy} e
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
export function stepBoss(e, bounds) {
  if (!e.alive || isZelda(e.objType)) return;
  e.timer -= 1;
  if (e.timer <= 0) {
    e.dir = e.dir & DIR.LEFT ? DIR.RIGHT : DIR.LEFT;
    e.timer = 48;
  }
  if ((e.anim & 3) === 0) {
    if (e.dir & DIR.LEFT) e.x -= 1;
    if (e.dir & DIR.RIGHT) e.x += 1;
  }
  if (e.x < bounds.minX + 24) e.dir = DIR.RIGHT;
  if (e.x > bounds.maxX - 24) e.dir = DIR.LEFT;
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX - 16, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY - 16, e.y));
}

/**
 * DMC roar played by each boss's Init routine (`STA SampleRequest`):
 * `$10` Aquamentus/Gleeok/Ganon, `$20` Dodongo/Gohma, `$40`
 * Digdogger/Manhandla/Patra.
 * @param {number} objType
 * @returns {string | null} SFX name, or null when the type has no roar
 */
export function bossRoarSfx(objType) {
  switch (objType) {
    case BOSS.AQUAMENTUS:
    case BOSS.GANON:
    case BOSS.GLEEOK_2:
    case BOSS.GLEEOK_3:
    case BOSS.GLEEOK_4:
      return 'boss_roar_1';
    case BOSS.DODONGO:
    case BOSS.DODONGO_1:
    case BOSS.GOHMA:
    case BOSS.GOHMA_RED:
      return 'boss_roar_2';
    case BOSS.DIGDOGGER:
    case BOSS.DIGDOGGER_1:
    case BOSS.MANHANDLA:
    case BOSS.PATRA:
    case BOSS.PATRA_RED:
      return 'boss_roar_3';
    default:
      return null;
  }
}

/**
 * Arrow damage vs bosses (Ganon final blow wants silver = tier 2).
 * @param {number} objType
 * @param {number} arrowTier 1 wood, 2 silver
 */
export function arrowDamageForBoss(objType, arrowTier) {
  if (objType === BOSS.GANON && arrowTier < 2) return 0;
  if (bossNeedsArrow(objType) || isBossType(objType)) {
    return arrowTier >= 2 ? 0x40 : 0x20;
  }
  return arrowTier >= 2 ? 0x20 : 0x10;
}
