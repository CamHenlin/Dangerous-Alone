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

/** Blade length from Link's center to the sword midpoint (px). */
const ARC_RADIUS = 14;
/** Hitbox size around the blade midpoint. */
const ARC_HIT_W = 14;
const ARC_HIT_H = 14;

/**
 * Arc swing angles in radians. Screen space: 0 = right, positive = clockwise
 * (Y grows downward). Each facing sweeps ~180° like LA / ALttP.
 *
 * Values are [startAngle, endAngle] over the HIT window; recover eases inward.
 * @type {Record<number, [number, number]>}
 */
const ARC_ANGLES = Object.freeze({
  // Right: from above, down through forward, finishing low.
  [DIR.RIGHT]: [-Math.PI * 0.85, Math.PI * 0.35],
  // Left: mirrored (above → through left → low).
  [DIR.LEFT]: [-Math.PI * 0.15, -Math.PI * 1.35],
  // Down: from left shoulder across to right hip.
  [DIR.DOWN]: [Math.PI * 0.15, Math.PI * 0.85],
  // Up: from right shoulder across to left.
  [DIR.UP]: [-Math.PI * 0.15, -Math.PI * 0.85],
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

/** Abort a swing immediately (room transitions, cave Mode B, death). */
export function cancelSword(sword) {
  sword.phase = 0;
  sword.timer = 0;
  sword.dir = 0;
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
 * Progress 0..1 through the visible swing (HIT + recover).
 * @param {SwordState} sword
 */
export function swordArcProgress(sword) {
  if (sword.phase < SWORD_PHASE.HIT || sword.phase > SWORD_PHASE.RECOVER_C) {
    return 0;
  }
  const hitDur = PHASE_DURATION[SWORD_PHASE.HIT];
  if (sword.phase === SWORD_PHASE.HIT) {
    // timer counts down from hitDur → 1 during HIT.
    return (hitDur - sword.timer) / (hitDur + 2);
  }
  if (sword.phase === SWORD_PHASE.RECOVER_A) return hitDur / (hitDur + 2);
  if (sword.phase === SWORD_PHASE.RECOVER_B) return (hitDur + 1) / (hitDur + 2);
  return 1;
}

/**
 * Arc angle (radians) for the current swing frame.
 * @param {SwordState} sword
 */
export function swordArcAngle(sword) {
  const pair = ARC_ANGLES[sword.dir] ?? ARC_ANGLES[DIR.UP];
  const [a0, a1] = pair;
  let t = swordArcProgress(sword);
  if (sword.phase === SWORD_PHASE.WINDUP) t = 0;
  // Smoothstep for a more natural slash feel.
  t = t * t * (3 - 2 * t);
  return a0 + (a1 - a0) * t;
}

/**
 * Link body center used as the arc pivot.
 * @param {number} linkX
 * @param {number} linkY
 */
function pivot(linkX, linkY) {
  return { x: linkX + 8, y: linkY + 8 };
}

/**
 * Blade midpoint in screen pixels for the current arc pose.
 * @param {SwordState} sword
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} [radius]
 */
export function swordArcPoint(sword, linkX, linkY, radius = ARC_RADIUS) {
  const ang = swordArcAngle(sword);
  const p = pivot(linkX, linkY);
  // During recover, ease the radius inward toward Link.
  let r = radius;
  if (sword.phase === SWORD_PHASE.RECOVER_A) r = radius * 0.75;
  else if (sword.phase === SWORD_PHASE.RECOVER_B) r = radius * 0.45;
  else if (sword.phase === SWORD_PHASE.RECOVER_C) r = radius * 0.25;
  return {
    x: p.x + Math.cos(ang) * r,
    y: p.y + Math.sin(ang) * r,
    angle: ang,
  };
}

/**
 * Sweeping sword hitbox during the hit window (moves with the arc).
 * @param {SwordState} sword
 * @param {number} linkX
 * @param {number} linkY
 */
export function swordHitbox(sword, linkX, linkY) {
  if (!swordDoesDamage(sword)) {
    return null;
  }
  const tip = swordArcPoint(sword, linkX, linkY);
  return {
    x: tip.x - ARC_HIT_W / 2,
    y: tip.y - ARC_HIT_H / 2,
    w: ARC_HIT_W,
    h: ARC_HIT_H,
  };
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
 * `angle` is radians for Pixi rotation (0 = upright CHR pointing up… callers
 * convert — see drawSwordBlade). `dir` remains the facing for texture choice.
 *
 * @param {SwordState} sword
 * @param {number} linkX
 * @param {number} linkY
 * @returns {{ x: number, y: number, dir: number, angle: number } | null}
 */
export function swordDrawPos(sword, linkX, linkY) {
  if (sword.phase < SWORD_PHASE.HIT || sword.phase > SWORD_PHASE.RECOVER_C) {
    return null;
  }
  const tip = swordArcPoint(sword, linkX, linkY);
  // Texture is drawn from its top-left; center the 8×16 / 16×8 blade on the tip.
  return {
    x: tip.x - 8,
    y: tip.y - 8,
    dir: sword.dir,
    angle: tip.angle,
  };
}

/**
 * Pixi rotation for an up-pointing sword texture so the tip follows `angle`.
 * Up-texture tip points toward angle -π/2 in screen space when rotation=0.
 * @param {number} angle sword tip direction (screen radians)
 */
export function swordSpriteRotation(angle) {
  return angle + Math.PI / 2;
}

/**
 * AABB overlap.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
