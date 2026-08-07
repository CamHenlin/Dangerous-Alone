/**
 * NES ObjInvincibilityMask + damage-type bits (Z_01 CheckMonster*Collision).
 * Invincible when `(mask & damageType) !== 0`.
 */

export const DAMAGE = Object.freeze({
  SWORD: 0x01,
  BOOMERANG: 0x02,
  ARROW: 0x04,
  BOMB: 0x08,
  MAGIC: 0x10,
  FIRE: 0x20,
});

/** Default: vulnerable to everything (mask 0). */
const DEFAULT_MASK = 0x00;

/**
 * Init-time / steady masks by object type.
 * Darknut/Wizzrobe $F6 = all but sword+bomb; Pols $FE = sword only;
 * Aquamentus $E2 = boom+fire immune; Bubble $FF = immortal to weapons.
 */
const MASK_BY_TYPE = Object.freeze({
  0x0b: 0xf6, // red darknut
  0x0c: 0xf6, // blue darknut
  0x16: 0xfe, // pols voice
  0x23: 0xf6, // blue wizzrobe
  0x24: 0xf6, // red wizzrobe
  0x2b: 0xff, // bubble flash
  0x2c: 0xff,
  0x2d: 0xff,
  0x31: 0xff, // dodongo 1 — bomb eat / stun special-cased; sword when stunned
  0x32: 0xff, // dodongo
  0x33: 0xfb, // red gohma — arrows only (eye window)
  0x34: 0xfb, // gohma
  0x38: 0xff, // big digdogger — flute split only
  0x39: 0xff, // digdogger (3-child) — flute split only
  0x25: 0xfe, // patra child (wide)
  0x26: 0xfe, // patra child (tight)
  0x3c: 0xe2, // manhandla
  0x3d: 0xe2, // aquamentus
  0x3e: 0x00, // ganon — phase rules in bossAi / hit testers
  0x43: 0xfe, // gleeok 2 — sword only (InitGleeok)
  0x44: 0xfe, // gleeok 3
  0x45: 0xfe, // gleeok 4
  0x46: 0xff, // detached gleeok head — immortal
  0x47: 0xfe, // patra — sword only
  0x48: 0xfe, // patra red
  0x49: 0xff, // trap
  0x4a: 0xff,
});

/**
 * @param {number} objType
 */
export function invincibilityMaskForType(objType) {
  if (MASK_BY_TYPE[objType] != null) return MASK_BY_TYPE[objType];
  // Remaining boss-family defaults: boom-immune.
  if (objType >= 0x31 && objType <= 0x48) return 0x02;
  return DEFAULT_MASK;
}

/**
 * @param {number} mask
 * @param {number} damageType
 */
export function isImmuneToDamage(mask, damageType) {
  return ((mask ?? 0) & (damageType ?? 0)) !== 0;
}
