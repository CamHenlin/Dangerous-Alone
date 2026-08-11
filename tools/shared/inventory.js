/** B-item ids for the select slot. */
export const B_ITEM = Object.freeze({
  NONE: 'none',
  BOMB: 'bomb',
  CANDLE: 'candle',
  BOOMERANG: 'boomerang',
  BAIT: 'bait',
  BOW: 'bow',
  POTION: 'potion',
  FLUTE: 'flute',
  ROD: 'rod',
});

/** Ring tier: 0 none, 1 blue (½ dmg), 2 red (¼ dmg). */
export const RING = Object.freeze({
  NONE: 0,
  BLUE: 1,
  RED: 2,
});

/** Potion: 0 none, 1 blue (fill), 2 red (fill + keep as blue). */
export const POTION = Object.freeze({
  NONE: 0,
  BLUE: 1,
  RED: 2,
});

/** Arrow tier: 0 none, 1 wooden, 2 silver. */
export const ARROW = Object.freeze({
  NONE: 0,
  WOOD: 1,
  SILVER: 2,
});

/** Sword tier in Items RAM ($657). */
export const SWORD = Object.freeze({
  NONE: 0,
  WOOD: 1,
  WHITE: 2,
  MAGIC: 3,
});

/** Candle tier in Items RAM (InvCandle): 1 blue, 2 red. */
export const CANDLE_TIER = Object.freeze({
  NONE: 0,
  BLUE: 1,
  RED: 2,
});

/** Wooden / white / magic damage points vs monsters. */
export const SWORD_DAMAGE = Object.freeze({
  [SWORD.WOOD]: 0x10,
  [SWORD.WHITE]: 0x20,
  [SWORD.MAGIC]: 0x40,
});

/**
 * New-game inventory (no sword — get it from the cave).
 * Hearts stored as half-hearts (NES: $80 partial = ½).
 */
export function createInventory() {
  return {
    sword: SWORD.NONE,
    bombs: 0,
    maxBombs: 8,
    candle: 0,
    boomerang: 0,
    magicBoomerang: 0,
    magicShield: 0,
    food: 0,
    bow: 0,
    /** @type {number} ARROW.NONE | WOOD | SILVER */
    arrow: 0,
    raft: 0,
    ladder: 0,
    /** Power bracelet (Armos under-item `$14`). */
    bracelet: 0,
    flute: 0,
    /** Magical rod (Items `$08`). */
    rod: 0,
    /** Book of Magic — rod shots leave fire (optional). */
    book: 0,
    map: 0,
    compass: 0,
    /** Letter: 0 none, 1 held, 2 shown (potion shops unlocked). */
    letter: 0,
    /** @type {number} POTION.NONE | BLUE | RED */
    potion: 0,
    /** @type {number} RING.NONE | BLUE | RED */
    ring: 0,
    magicKey: 0,
    /** Bitmask of Quest-1 triforce pieces (bit0 = Level 1 … bit7 = Level 8). */
    triforce: 0,
    /** Triforce of Power from Ganon (item `$0E`). */
    triforceOfPower: 0,
    /** Quest number (1 or 2) — selects extracted dungeon pack. */
    quest: 1,
    /** @type {string} */
    selectedB: B_ITEM.NONE,
    halfHearts: 6,
    maxHalfHearts: 6,
    rupees: 0,
    keys: 0,
    /** Invulnerability countdown (frames; we tick 1/frame ≈ NES $18×2). */
    invuln: 0,
    shoveDir: 0,
    shovePixels: 0,
    dead: false,
    /** InvClock — freezes foes until room change / death. */
    clock: 0,
    /** SwordBlocked — sticky 0/1 from red/blue bubbles. */
    swordBlocked: 0,
    /** SwordBlockedLongTimer — frames remaining from flashing bubble (~$A0). */
    swordBlockedTimer: 0,
    /** Like-Like / Wallmaster paralysis frames. */
    paralyzed: 0,
    /** Cave/cellar TakeItem lift (~$80 frames); unused for OW/UW drops. */
    itemLiftTimer: 0,
  };
}

/**
 * NES WieldArrow (Z_05): require Bow + arrow item and InvRupees > 0,
 * then post one rupee to subtract (we deduct immediately).
 * @param {ReturnType<typeof createInventory>} inv
 * @returns {{ ok: true } | { ok: false, reason: 'gear' | 'rupees' }}
 */
export function trySpendArrowShot(inv) {
  if (!inv.bow || (inv.arrow | 0) < 1) return { ok: false, reason: 'gear' };
  if ((inv.rupees | 0) <= 0) return { ok: false, reason: 'rupees' };
  inv.rupees -= 1;
  return { ok: true };
}

/**
 * Cycle B selection among owned items.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function cycleBItem(inv) {
  const owned = [];
  if (inv.bombs > 0 || inv.selectedB === B_ITEM.BOMB) owned.push(B_ITEM.BOMB);
  if (inv.boomerang > 0 || inv.magicBoomerang > 0) owned.push(B_ITEM.BOOMERANG);
  if (inv.food > 0 || inv.selectedB === B_ITEM.BAIT) owned.push(B_ITEM.BAIT);
  if (inv.candle > 0) owned.push(B_ITEM.CANDLE);
  // CheckMissingItem @ Z_07.asm:1054 — letter occupies the potion B slot when
  // held and no potion has been bought yet (medicine-shop "show letter" path).
  if (inv.potion > 0 || ((inv.letter ?? 0) === 1 && (inv.potion ?? 0) === 0)) {
    owned.push(B_ITEM.POTION);
  }
  if (inv.flute > 0) owned.push(B_ITEM.FLUTE);
  if (inv.rod > 0) owned.push(B_ITEM.ROD);
  if (inv.bow > 0 && inv.arrow > 0) owned.push(B_ITEM.BOW);
  if (owned.length === 0) {
    inv.selectedB = B_ITEM.NONE;
    return inv.selectedB;
  }
  if (inv.bombs > 0 && !owned.includes(B_ITEM.BOMB)) owned.unshift(B_ITEM.BOMB);
  const uniq = [...new Set(owned)];
  const idx = Math.max(0, uniq.indexOf(inv.selectedB));
  inv.selectedB = uniq[(idx + 1) % uniq.length];
  return inv.selectedB;
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} halfHeartsDamage
 */
export function harmLink(inv, halfHeartsDamage) {
  if (inv.dead || inv.invuln > 0) {
    return { died: false, applied: false };
  }
  // Zero-damage contact (bubbles) — no hurt invuln / ring floor.
  if (halfHeartsDamage <= 0) {
    return { died: false, applied: false };
  }
  let dmg = halfHeartsDamage;
  if ((inv.ring ?? 0) >= RING.RED) dmg = Math.max(1, Math.floor(dmg / 4));
  else if ((inv.ring ?? 0) >= RING.BLUE) dmg = Math.max(1, Math.floor(dmg / 2));
  inv.halfHearts = Math.max(0, inv.halfHearts - dmg);
  inv.invuln = 48; // ~$18 timer × 2 frames
  if (inv.halfHearts <= 0) {
    inv.halfHearts = 0;
    inv.dead = true;
    return { died: true, applied: true };
  }
  return { died: false, applied: true };
}

/**
 * Tick sword-block / paralysis timers (call once per frame).
 * @param {ReturnType<typeof createInventory>} inv
 */
export function stepLinkStatus(inv) {
  if (inv.swordBlockedTimer > 0) {
    inv.swordBlockedTimer -= 1;
    if (inv.swordBlockedTimer <= 0) inv.swordBlocked = 0;
  }
  if (inv.paralyzed > 0) inv.paralyzed -= 1;
  if (inv.itemLiftTimer > 0) inv.itemLiftTimer -= 1;
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 */
export function canSwingSword(inv) {
  // Like-Like sets LinkParalyzed (blocks movement) but CheckMonsterCollisions
  // still runs — sword must work while captured (UpdateLikeLike).
  return !inv.swordBlocked && inv.swordBlockedTimer <= 0;
}

/**
 * Bubble contact: `$2B` temp block (~$A0f); `$2C` clear; `$2D` sticky block.
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} bubbleType
 */
export function applyBubbleSwordBlock(inv, bubbleType) {
  if (bubbleType === 0x2b) {
    inv.swordBlocked = 1;
    inv.swordBlockedTimer = 0xa0;
    return;
  }
  if (bubbleType === 0x2c) {
    inv.swordBlocked = 0;
    inv.swordBlockedTimer = 0;
    return;
  }
  if (bubbleType === 0x2d) {
    inv.swordBlocked = 1;
    inv.swordBlockedTimer = 0; // sticky until blue bubble
  }
}

/**
 * Like-Like finish — clear magic shield.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function stealMagicShield(inv) {
  inv.magicShield = 0;
}

/**
 * Drink potion (B item). Red becomes blue after use.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function drinkPotion(inv) {
  if ((inv.potion ?? 0) <= POTION.NONE) {
    return { ok: false, reason: 'No potion' };
  }
  inv.halfHearts = inv.maxHalfHearts;
  if (inv.potion >= POTION.RED) {
    inv.potion = POTION.BLUE;
  } else {
    inv.potion = POTION.NONE;
    if (inv.selectedB === B_ITEM.POTION) inv.selectedB = B_ITEM.NONE;
  }
  return { ok: true, potion: inv.potion };
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} halfHearts
 */
export function healLink(inv, halfHearts) {
  inv.halfHearts = Math.min(inv.maxHalfHearts, inv.halfHearts + halfHearts);
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 */
export function grantWoodenSword(inv) {
  if (inv.sword < SWORD.WOOD) {
    inv.sword = SWORD.WOOD;
    return true;
  }
  return false;
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} n
 */
export function addBombs(inv, n) {
  const before = inv.bombs;
  inv.bombs = Math.min(inv.maxBombs, inv.bombs + n);
  if (inv.selectedB === B_ITEM.NONE && inv.bombs > 0) {
    inv.selectedB = B_ITEM.BOMB;
  }
  return inv.bombs - before;
}

/**
 * HUD-friendly heart breakdown.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function heartDisplay(inv) {
  const full = Math.floor(inv.halfHearts / 2);
  const half = inv.halfHearts % 2;
  const empty = Math.floor(inv.maxHalfHearts / 2) - full - half;
  return { full, half, empty: Math.max(0, empty) };
}

/** Full energy — sword beam gate (HeartPartial ≥ $80 implied by full half-hearts). */
export function heartsFull(inv) {
  return (inv.halfHearts ?? 0) >= (inv.maxHalfHearts ?? 0) && (inv.maxHalfHearts ?? 0) > 0;
}

/**
 * MakeSwordShot health gate: full hearts must equal containers−1 **and**
 * HeartPartial >= $80, so the beam still fires with half a heart missing.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function swordBeamHealthOk(inv) {
  const max = inv.maxHalfHearts ?? 0;
  return max > 0 && (inv.halfHearts ?? 0) >= max - 1;
}

/**
 * Apply a UW room item pickup (ItemId).
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} itemType
 * @param {{ level?: number }} [opts]
 * @returns {string} short status label
 */
export function grantRoomItem(inv, itemType, opts = {}) {
  switch (itemType) {
    case 0x00: // Bombs (floor refill)
      addBombs(inv, 4);
      return 'Bombs';
    case 0x0a: // Bow — arrows are a separate shop purchase (NES InvBow / InvArrow)
      inv.bow = 1;
      if (inv.arrow >= ARROW.WOOD && inv.selectedB === B_ITEM.NONE) {
        inv.selectedB = B_ITEM.BOW;
      }
      return 'Bow';
    case 0x08: // Wooden arrows
      if (inv.arrow < ARROW.WOOD) inv.arrow = ARROW.WOOD;
      if (inv.bow && inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOW;
      return 'Arrows';
    case 0x09: // Silver arrows
      inv.arrow = ARROW.SILVER;
      if (inv.bow && inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOW;
      return 'Silver arrows';
    case 0x07: // Red candle
      grantCandle(inv, CANDLE_TIER.RED);
      return 'Red candle';
    case 0x06: // Blue candle (rare as floor; shops use cave grant)
      grantCandle(inv, CANDLE_TIER.BLUE);
      return 'Blue candle';
    case 0x0b: // Magic key
      inv.magicKey = 1;
      return 'Magic key';
    case 0x0c: // Raft
      inv.raft = 1;
      return 'Raft';
    case 0x0d: // Ladder
      inv.ladder = 1;
      return 'Ladder';
    case 0x0e: // Triforce of Power (Ganon)
      inv.triforceOfPower = 1;
      return 'Triforce of Power';
    case 0x0f: // 5 rupees
      inv.rupees = Math.min(255, (inv.rupees ?? 0) + 5);
      return '5 rupees';
    case 0x12: // Blue ring
      if ((inv.ring ?? 0) < RING.BLUE) inv.ring = RING.BLUE;
      return 'Blue ring';
    case 0x13: // Red ring
      inv.ring = RING.RED;
      return 'Red ring';
    case 0x14: // Power bracelet
      inv.bracelet = 1;
      return 'Power bracelet';
    case 0x05: // Flute / recorder
      inv.flute = 1;
      if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.FLUTE;
      return 'Flute';
    case 0x10: // Magical rod
      inv.rod = 1;
      if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.ROD;
      return 'Magical rod';
    case 0x11: // Book of Magic
      inv.book = 1;
      return 'Book of Magic';
    case 0x04: // Bait / food
      inv.food += 1;
      if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BAIT;
      return 'Bait';
    case 0x16: // Compass
      inv.compass = 1;
      return 'Compass';
    case 0x17: // Map
      inv.map = 1;
      return 'Map';
    case 0x19: // Key (amount)
      inv.keys += 1;
      return 'Key';
    case 0x1a: // Heart container
      inv.maxHalfHearts += 2;
      inv.halfHearts = Math.min(inv.maxHalfHearts, inv.halfHearts + 2);
      return 'Heart container';
    case 0x1b: // Triforce piece
      return grantTriforce(inv, opts.level ?? 1);
    case 0x1c: // Magical shield
      inv.magicShield = 1;
      return 'Magic shield';
    case 0x1d: // Boomerang
      inv.boomerang = 1;
      if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOOMERANG;
      return 'Boomerang';
    case 0x1e: // Magical boomerang
      inv.magicBoomerang = 1;
      inv.boomerang = 1;
      if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOOMERANG;
      return 'Magic boomerang';
    default:
      return `Item $${itemType.toString(16)}`;
  }
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} level 1–8
 */
export function grantTriforce(inv, level) {
  const bit = 1 << (Math.max(1, Math.min(8, level)) - 1);
  inv.triforce |= bit;
  return `Triforce (L${level})`;
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 */
export function triforceCount(inv) {
  let n = 0;
  for (let i = 0; i < 8; i += 1) {
    if (inv.triforce & (1 << i)) n += 1;
  }
  return n;
}

/**
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} level 1–8
 */
export function hasTriforce(inv, level) {
  return Boolean(inv.triforce & (1 << (level - 1)));
}

/**
 * @deprecated Phase 10: shops/secrets grant boom/bait/candle. Kept for debug kits.
 * @param {ReturnType<typeof createInventory>} inv
 */
export function grantCaveExtras(inv) {
  if (!inv.boomerang) inv.boomerang = 1;
  if (inv.food < 1) inv.food = 1;
  if (inv.candle < CANDLE_TIER.BLUE) inv.candle = CANDLE_TIER.BLUE;
}

/**
 * Upgrade candle (blue → red). Idempotent for red.
 * @param {ReturnType<typeof createInventory>} inv
 * @param {number} tier
 */
export function grantCandle(inv, tier = CANDLE_TIER.BLUE) {
  if (tier > inv.candle) inv.candle = tier;
  if (inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.CANDLE;
  return inv.candle;
}
