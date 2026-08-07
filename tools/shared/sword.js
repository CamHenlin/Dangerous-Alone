import { DIR } from './collision.js';
import { SWORD, SWORD_DAMAGE } from './inventory.js';

/** Sword ObjState timings (frames). */
export const SWORD_PHASE = Object.freeze({
  WINDUP: 1,
  HIT: 2,
  RECOVER_A: 3,
  RECOVER_B: 4,
  RECOVER_C: 5,
});

const PHASE_DURATION = Object.freeze({
  [SWORD_PHASE.WINDUP]: 5,
  [SWORD_PHASE.HIT]: 8,
  [SWORD_PHASE.RECOVER_A]: 1,
  [SWORD_PHASE.RECOVER_B]: 1,
  [SWORD_PHASE.RECOVER_C]: 1,
});

/** PlayerToWeaponOffsets for hit window (U,D,L,R). */
const SWORD_OFFSET = Object.freeze({
  [DIR.UP]: { x: -1, y: -10 },
  [DIR.DOWN]: { x: 1, y: 13 },
  [DIR.LEFT]: { x: -11, y: 3 },
  [DIR.RIGHT]: { x: 11, y: 3 },
});

/**
 * PlayerToWeaponOffsets by phase (after windup) × direction.
 * NES skips drawing in state 1 (windup). Dir order: U,D,L,R.
 * @type {Record<number, Record<number, { x: number, y: number }>>}
 */
const WEAPON_DRAW_OFFSET = Object.freeze({
  [SWORD_PHASE.HIT]: {
    [DIR.UP]: { x: -1, y: -10 },
    [DIR.DOWN]: { x: 1, y: 13 },
    [DIR.LEFT]: { x: -11, y: 3 },
    [DIR.RIGHT]: { x: 11, y: 3 },
  },
  [SWORD_PHASE.RECOVER_A]: {
    [DIR.UP]: { x: -1, y: -9 },
    [DIR.DOWN]: { x: 1, y: 9 },
    [DIR.LEFT]: { x: -7, y: 3 },
    [DIR.RIGHT]: { x: 7, y: 3 },
  },
  [SWORD_PHASE.RECOVER_B]: {
    [DIR.UP]: { x: -1, y: -1 },
    [DIR.DOWN]: { x: 1, y: 5 },
    [DIR.LEFT]: { x: -3, y: 3 },
    [DIR.RIGHT]: { x: 3, y: 3 },
  },
  [SWORD_PHASE.RECOVER_C]: {
    [DIR.UP]: { x: -1, y: -1 },
    [DIR.DOWN]: { x: 1, y: 5 },
    [DIR.LEFT]: { x: -3, y: 3 },
    [DIR.RIGHT]: { x: 3, y: 3 },
  },
});

/**
 * @typedef {object} SwordState
 * @property {number} phase  0 = idle
 * @property {number} timer
 * @property {number} dir
 */

export function createSwordState() {
  return { phase: 0, timer: 0, dir: 0 };
}

export function isSwordActive(sword) {
  return sword.phase > 0;
}

/**
 * @param {SwordState} sword
 * @param {number} facingDir
 * @param {number} swordTier
 * @returns {boolean} started
 */
export function tryStartSword(sword, facingDir, swordTier) {
  if (sword.phase !== 0 || swordTier < SWORD.WOOD) {
    return false;
  }
  sword.phase = SWORD_PHASE.WINDUP;
  sword.timer = PHASE_DURATION[SWORD_PHASE.WINDUP];
  sword.dir = facingDir;
  return true;
}

/**
 * Advance one frame. Returns true while still swinging.
 * @param {SwordState} sword
 */
export function stepSword(sword) {
  if (sword.phase === 0) {
    return false;
  }
  sword.timer -= 1;
  if (sword.timer > 0) {
    return true;
  }
  if (sword.phase >= SWORD_PHASE.RECOVER_C) {
    sword.phase = 0;
    sword.timer = 0;
    return false;
  }
  sword.phase += 1;
  sword.timer = PHASE_DURATION[sword.phase] ?? 1;
  return true;
}

export function swordDoesDamage(sword) {
  return sword.phase === SWORD_PHASE.HIT;
}

/**
 * True on the frame the swing reaches state 3, where the NES draw routine
 * instantiates the sword/rod shot (Z_07.asm `CMP #$03` → `MakeSwordShot`).
 * @param {SwordState} sword
 * @param {number} prevPhase phase before this frame's `stepSword`
 */
export function swordSpawnsShot(sword, prevPhase) {
  return sword.phase === SWORD_PHASE.RECOVER_A && prevPhase !== SWORD_PHASE.RECOVER_A;
}

/**
 * Axis-aligned sword hitbox (world pixels) during the hit window.
 * @param {SwordState} sword
 * @param {number} linkX
 * @param {number} linkY
 */
export function swordHitbox(sword, linkX, linkY) {
  if (!swordDoesDamage(sword)) {
    return null;
  }
  const off = SWORD_OFFSET[sword.dir] ?? SWORD_OFFSET[DIR.UP];
  const wx = linkX + off.x;
  const wy = linkY + off.y;
  const vertical = Boolean(sword.dir & (DIR.UP | DIR.DOWN));
  // Approximate NES mid + thresh as a rect around the blade.
  if (vertical) {
    return { x: wx, y: wy, w: 12, h: 16 };
  }
  return { x: wx, y: wy, w: 16, h: 12 };
}

/**
 * @param {number} swordTier
 */
export function swordDamage(swordTier) {
  return SWORD_DAMAGE[swordTier] ?? 0;
}

/**
 * Attack pose base tile (left half) for Link.
 * ObjAnimFrameHeap[$4..$7]: side $10, down $14, up $18.
 * @param {number} dir
 */
export function swordAttackBaseTile(dir) {
  if (dir & DIR.UP) return 0x18;
  if (dir & DIR.DOWN) return 0x14;
  return 0x10; // side
}

/**
 * Screen position for the sword blade sprite (null during windup / idle).
 * @param {SwordState} sword
 * @param {number} linkX
 * @param {number} linkY
 * @returns {{ x: number, y: number, dir: number } | null}
 */
export function swordDrawPos(sword, linkX, linkY) {
  if (sword.phase < SWORD_PHASE.HIT || sword.phase > SWORD_PHASE.RECOVER_C) {
    return null;
  }
  const byDir = WEAPON_DRAW_OFFSET[sword.phase];
  const off = byDir?.[sword.dir] ?? byDir?.[DIR.UP];
  if (!off) return null;
  return { x: linkX + off.x, y: linkY + off.y, dir: sword.dir };
}

/**
 * AABB overlap.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
