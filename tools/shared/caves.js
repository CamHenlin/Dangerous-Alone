/**
 * Cave / shop logic (Phase 10).
 *
 * Cave IDs $10–$23. Item codes match Data Crystal Item_codes.
 * Shop & potion price rows are stored 4 entries before the item row.
 */

import {
  CANDLE_TIER,
  SWORD,
  addBombs,
  grantCandle,
  grantWoodenSword,
  healLink,
} from './inventory.js';

/** @typedef {'give' | 'shop' | 'potion' | 'take_any' | 'road' | 'letter' | 'gamble' | 'door' | 'money' | 'clue' | 'moblin'} CaveKind */

export const ITEM = Object.freeze({
  BOMBS: 0x00,
  WOOD_SWORD: 0x01,
  WHITE_SWORD: 0x02,
  MAGIC_SWORD: 0x03,
  BAIT: 0x04,
  RECORDER: 0x05,
  BLUE_CANDLE: 0x06,
  RED_CANDLE: 0x07,
  WOOD_ARROW: 0x08,
  SILVER_ARROW: 0x09,
  BOW: 0x0a,
  MAGIC_KEY: 0x0b,
  RAFT: 0x0c,
  LADDER: 0x0d,
  FIVE_RUPEE: 0x0f,
  BLUE_RING: 0x12,
  RED_RING: 0x13,
  LETTER: 0x15,
  RUPEE: 0x18,
  KEY: 0x19,
  HEART_CONTAINER: 0x1a,
  MAGIC_SHIELD: 0x1c,
  BOOMERANG: 0x1d,
  MAGIC_BOOMERANG: 0x1e,
  BLUE_POTION: 0x1f,
  RED_POTION: 0x20,
  /** Shop heart (heal 1♥) — cave `$1f` / take-any variants. */
  HEART: 0x22,
  NOTHING: 0x3f,
});

const SHOP_PRICE_DELTA = 4;

/**
 * @param {number} caveId
 * @param {number} textFlags
 * @param {{ flagsN: boolean, flagsM: boolean, flagsH: boolean, flagsT: boolean, flagsP: boolean, flagsI: boolean }} itemFlags
 * @returns {CaveKind}
 */
export function classifyCave(caveId, textFlags, itemFlags) {
  if (caveId === 0x10) return 'give';
  if (caveId === 0x11) return 'take_any';
  if (caveId === 0x12 || caveId === 0x13) return 'give';
  if (caveId === 0x14) return 'road';
  if (caveId === 0x18) return 'letter';
  if (caveId === 0x16) return 'money';
  if (caveId === 0x17) return 'door';
  if (caveId === 0x1a) return 'potion';
  if (caveId === 0x1b || caveId === 0x1c) return 'gamble';
  if (caveId >= 0x1d && caveId <= 0x20) return 'shop';
  if (caveId >= 0x21 && caveId <= 0x23) return 'moblin';
  if (itemFlags.flagsH && (textFlags & 0x40)) return 'gamble';
  if (textFlags & 0x80) return 'shop';
  return 'clue';
}

/**
 * @param {number} caveId
 */
export function caveIndex(caveId) {
  return caveId - 0x10;
}

/**
 * Shop/potion prices live 4 rows earlier than items (Data Crystal).
 * @param {number} caveId
 * @param {CaveKind} kind
 */
export function priceRowIndex(caveId, kind) {
  const idx = caveIndex(caveId);
  if (kind === 'shop' || kind === 'potion') {
    return Math.max(0, idx - SHOP_PRICE_DELTA);
  }
  return idx;
}

/**
 * @param {Uint8Array | Buffer} items60
 * @param {Uint8Array | Buffer} prices60
 * @param {Uint8Array | Buffer} textFlags20
 * @param {Uint8Array | Buffer} dwellers20
 * @param {string[]} texts
 * @param {number[]} takeAnyRoad
 */
export function buildCaveTable(items60, prices60, textFlags20, dwellers20, texts, takeAnyRoad) {
  /** @type {object[]} */
  const caves = [];
  for (let i = 0; i < 20; i += 1) {
    const caveId = 0x10 + i;
    const b0 = items60[i * 3];
    const b1 = items60[i * 3 + 1];
    const b2 = items60[i * 3 + 2];
    const itemFlags = {
      flagsN: Boolean(b0 & 0x80),
      flagsM: Boolean(b0 & 0x40),
      flagsH: Boolean(b1 & 0x80),
      flagsT: Boolean(b1 & 0x40),
      flagsP: Boolean(b2 & 0x80),
      flagsI: Boolean(b2 & 0x40),
    };
    const textFlags = textFlags20[i];
    const kind = classifyCave(caveId, textFlags, itemFlags);
    const pIdx = priceRowIndex(caveId, kind);
    const slots = [0, 1, 2].map((s) => {
      const raw = items60[i * 3 + s];
      return {
        item: raw & 0x3f,
        price: prices60[pIdx * 3 + s] ?? 0,
        raw,
      };
    });
    const textId = textFlags & 0x3f;
    caves.push({
      caveId,
      kind,
      textId,
      text: texts[textId] ?? texts[textId >> 1] ?? '',
      canPickup: Boolean(textFlags & 0x40),
      shopBit: Boolean(textFlags & 0x80),
      dweller: dwellers20[i],
      itemFlags,
      slots,
      takeAnyRoad: kind === 'road' ? [...takeAnyRoad] : undefined,
    });
  }
  return caves;
}

/**
 * @param {object[]} caveTable from buildCaveTable / caves.json
 * @param {number} caveId
 */
export function getCave(caveTable, caveId) {
  return caveTable.find((c) => c.caveId === caveId) ?? null;
}

/**
 * Heart containers required (white=5, magic=12).
 * @param {object} cave
 */
export function heartRequirement(cave) {
  if (!cave?.itemFlags?.flagsM) return 0;
  if (cave.caveId === 0x12) return 5;
  if (cave.caveId === 0x13) return 12;
  return 12;
}

/**
 * @param {object} inv
 */
export function heartContainers(inv) {
  return Math.floor((inv.maxHalfHearts ?? 0) / 2);
}

/**
 * Apply a purchased / gifted item id to inventory.
 * @param {object} inv
 * @param {number} itemId
 * @returns {string}
 */
export function grantCaveItem(inv, itemId) {
  switch (itemId) {
    case ITEM.BOMBS:
      addBombs(inv, 4);
      return 'Bombs';
    case ITEM.WOOD_SWORD:
      grantWoodenSword(inv);
      addBombs(inv, 4);
      return 'Wooden sword';
    case ITEM.WHITE_SWORD:
      if (inv.sword < SWORD.WHITE) inv.sword = SWORD.WHITE;
      return 'White sword';
    case ITEM.MAGIC_SWORD:
      if (inv.sword < SWORD.MAGIC) inv.sword = SWORD.MAGIC;
      return 'Magic sword';
    case ITEM.BAIT:
      inv.food += 1;
      return 'Bait';
    case ITEM.RECORDER:
      inv.flute = 1;
      return 'Recorder';
    case ITEM.BLUE_CANDLE:
      grantCandle(inv, CANDLE_TIER.BLUE);
      return 'Blue candle';
    case ITEM.RED_CANDLE:
      grantCandle(inv, CANDLE_TIER.RED);
      return 'Red candle';
    case ITEM.WOOD_ARROW:
      if (inv.arrow < 1) inv.arrow = 1;
      return 'Arrows';
    case ITEM.SILVER_ARROW:
      inv.arrow = 2;
      return 'Silver arrows';
    case ITEM.BOW:
      inv.bow = 1;
      if (inv.arrow < 1) inv.arrow = 1;
      return 'Bow';
    case ITEM.MAGIC_KEY:
      inv.magicKey = 1;
      return 'Magic key';
    case ITEM.RAFT:
      inv.raft = 1;
      return 'Raft';
    case ITEM.LADDER:
      inv.ladder = 1;
      return 'Ladder';
    case ITEM.FIVE_RUPEE:
      inv.rupees = Math.min(255, inv.rupees + 5);
      return '5 rupees';
    case ITEM.BLUE_RING:
      if (inv.ring < 1) inv.ring = 1;
      return 'Blue ring';
    case ITEM.RED_RING:
      inv.ring = 2;
      return 'Red ring';
    case ITEM.LETTER:
      if (!inv.letter) inv.letter = 1;
      return 'Letter';
    case ITEM.RUPEE:
      inv.rupees = Math.min(255, inv.rupees + 1);
      return 'Rupee';
    case ITEM.KEY:
      inv.keys += 1;
      return 'Key';
    case ITEM.HEART_CONTAINER:
      inv.maxHalfHearts += 2;
      inv.halfHearts = Math.min(inv.maxHalfHearts, inv.halfHearts + 2);
      return 'Heart container';
    case ITEM.MAGIC_SHIELD:
      inv.magicShield = 1;
      return 'Magic shield';
    case ITEM.BOOMERANG:
      inv.boomerang = 1;
      return 'Boomerang';
    case ITEM.MAGIC_BOOMERANG:
      inv.magicBoomerang = 1;
      inv.boomerang = 1;
      return 'Magic boomerang';
    case ITEM.BLUE_POTION:
      inv.potion = Math.max(inv.potion ?? 0, 1);
      return 'Blue potion';
    case ITEM.RED_POTION:
      inv.potion = 2;
      return 'Red potion';
    case ITEM.HEART:
      healLink(inv, 2); // 1 heart
      return 'Heart';
    default:
      return `Item $${itemId.toString(16)}`;
  }
}

/**
 * Visible / buyable slots (skip NOTHING).
 * @param {object} cave
 */
export function activeSlots(cave) {
  return cave.slots
    .map((slot, index) => ({ ...slot, index }))
    .filter((s) => s.item !== ITEM.NOTHING);
}

/**
 * @param {object} inv
 * @param {object} cave
 * @param {number} slotIndex 0–2
 * @param {{ taken?: Set<string> }} [state] per-cave taken keys `${caveId}:${slot}`
 */
export function tryBuyCaveSlot(inv, cave, slotIndex, state = {}) {
  const slot = cave.slots[slotIndex];
  if (!slot || slot.item === ITEM.NOTHING) {
    return { ok: false, reason: 'Empty slot' };
  }
  const key = `${cave.caveId}:${slotIndex}`;
  const takeAnyKey = `${cave.caveId}:any`;
  if (state.taken?.has(key) && cave.kind === 'give') {
    return { ok: false, reason: 'Already taken' };
  }
  if (cave.kind === 'take_any' && state.taken?.has(takeAnyKey)) {
    return { ok: false, reason: 'Already taken' };
  }

  // `UpdateCavePerson` @ `Z_01.asm:322` never even draws the wares until
  // `InvLetter` reaches 2, so holding the letter is not enough to buy.
  if (cave.kind === 'potion' && (inv.letter ?? 0) < 2) {
    return { ok: false, reason: 'Show the letter first' };
  }

  const heartsNeed = heartRequirement(cave);
  if (heartsNeed > 0 && heartContainers(inv) < heartsNeed) {
    return { ok: false, reason: `Need ${heartsNeed} heart containers` };
  }

  // One-time free gifts (swords / letter / take-any middle item).
  const isGift =
    cave.kind === 'give' ||
    cave.kind === 'letter' ||
    cave.kind === 'take_any' ||
    cave.kind === 'moblin';

  if (!isGift && cave.kind !== 'shop' && cave.kind !== 'potion') {
    return { ok: false, reason: 'Cannot buy here' };
  }

  const price = isGift ? 0 : slot.price;
  if (inv.rupees < price) {
    return { ok: false, reason: `Need ${price} rupees` };
  }

  if (price > 0) inv.rupees -= price;
  const label = grantCaveItem(inv, slot.item);
  state.taken?.add(key);
  // Take-any: pick one, then clear the offer (NES one-choice).
  if (cave.kind === 'take_any') {
    state.taken?.add(takeAnyKey);
    for (let i = 0; i < 3; i += 1) state.taken?.add(`${cave.caveId}:${i}`);
  }

  // Letter cave: the old woman hands over the unused letter (`InvLetter` = 1).
  if (cave.kind === 'letter' && slot.item === ITEM.LETTER) {
    inv.letter = Math.max(inv.letter ?? 0, 1);
  }

  return { ok: true, label, price, item: slot.item };
}

/** MoneyGameLossAmounts / win pool (Z_01.asm:63). */
export const MONEY_GAME_LOSS = Object.freeze([0x0a, 0x28]);
export const MONEY_GAME_WIN = Object.freeze([0x14, 0x32]);
/** MoneyGamePermutations @ Z_01.asm:66 — flattened triplets of pool indexes. */
export const MONEY_GAME_PERMUTATIONS = Object.freeze([
  0, 1, 2, 1, 2, 0, 2, 0, 1, 0, 2, 1, 2, 1, 0, 1, 0, 2,
]);
/** MoneyGamePermutationEndIndexes @ Z_01.asm:71. */
export const MONEY_GAME_PERM_ENDS = Object.freeze([2, 5, 8, 11, 14, 17]);

/**
 * Build the three signed rupee deltas shown in a money-making game cave.
 * ROM: InitCaveContinue money-game branch @ Z_01.asm:200 — random loss (10|40),
 * fixed loss 10, random win (20|50), then rearranged by a permutation triplet.
 * @param {() => number} [rng] returns [0,1)
 * @returns {number[]} length-3 signed deltas (negative = loss)
 */
export function rollMoneyGameAmounts(rng = Math.random) {
  const r0 = Number(rng());
  const r1 = Number(rng());
  const end = MONEY_GAME_PERM_ENDS[Math.floor(r0 * MONEY_GAME_PERM_ENDS.length) % 6];
  const indexes = [
    MONEY_GAME_PERMUTATIONS[end - 2],
    MONEY_GAME_PERMUTATIONS[end - 1],
    MONEY_GAME_PERMUTATIONS[end],
  ];
  const pool = [
    -MONEY_GAME_LOSS[r1 < 0.5 ? 0 : 1],
    -MONEY_GAME_LOSS[0],
    MONEY_GAME_WIN[r1 < 0.5 ? 0 : 1],
  ];
  return indexes.map((i) => pool[i]);
}

/**
 * Apply one money-game slot after the player walks onto a ware.
 * @param {object} inv
 * @param {object} cave
 * @param {number} [slotIndex] 0–2
 * @param {number[] | (() => number|boolean)} [amountsOrRng]
 *   Pre-rolled amounts (preferred) or legacy RNG / boolean coin.
 */
export function tryGamble(inv, cave, slotIndex = 1, amountsOrRng = Math.random) {
  // Legacy boolean coin: true → +20, false → −10.
  if (typeof amountsOrRng === 'boolean') {
    if (inv.rupees < 10) return { ok: false, reason: 'Need 10 rupees' };
    if (amountsOrRng) {
      inv.rupees = Math.min(255, inv.rupees + 20);
      return { ok: true, label: 'Won 20!', rupees: inv.rupees, delta: 20 };
    }
    inv.rupees -= 10;
    return { ok: true, label: 'Lost 10…', rupees: inv.rupees, delta: -10 };
  }

  /** @type {number[]} */
  let amounts;
  if (Array.isArray(amountsOrRng)) {
    amounts = amountsOrRng;
  } else if (typeof amountsOrRng === 'function') {
    amounts = rollMoneyGameAmounts(amountsOrRng);
  } else {
    amounts = rollMoneyGameAmounts();
  }

  const delta = amounts[slotIndex % 3] ?? 0;
  if (delta < 0 && inv.rupees < -delta) {
    return { ok: false, reason: `Need ${-delta} rupees` };
  }
  inv.rupees = Math.max(0, Math.min(255, inv.rupees + delta));
  if (delta > 0) {
    return { ok: true, label: `Won ${delta}!`, rupees: inv.rupees, delta };
  }
  return { ok: true, label: `Lost ${-delta}…`, rupees: inv.rupees, delta };
}

/**
 * Door repair charge (pay once per cave room — GetRoomFlagUWItemState).
 * @param {object} inv
 * @param {object} cave
 * @param {{ taken?: Set<string> }} [state]
 */
export function tryDoorRepair(inv, cave, state = {}) {
  const key = `${cave.caveId}:door`;
  if (state.taken?.has(key)) {
    return { ok: false, reason: 'Already paid' };
  }
  const price = cave.slots.find((s) => s.price > 0)?.price ?? 20;
  if (inv.rupees < price) {
    return { ok: false, reason: `Need ${price} rupees` };
  }
  inv.rupees -= price;
  state.taken?.add(key);
  return { ok: true, label: `Paid ${price} for the door`, price };
}

/**
 * Moblin secret money — grant price amount as rupees (ROM stores amounts in price bytes).
 * @param {object} inv
 * @param {object} cave
 * @param {{ taken?: Set<string> }} state
 */
export function tryMoblinGift(inv, cave, state = {}) {
  const key = `${cave.caveId}:gift`;
  if (state.taken?.has(key)) {
    return { ok: false, reason: 'Already looted' };
  }
  const amount = cave.slots.find((s) => s.price > 0 && s.price < 255)?.price ?? 30;
  inv.rupees = Math.min(255, inv.rupees + amount);
  state.taken?.add(key);
  return { ok: true, label: `Moblin gave ${amount} rupees`, amount };
}

/**
 * Status line summarizing a cave for the overlay.
 * @param {object} cave
 */
export function describeCave(cave) {
  if (Array.isArray(cave.textLines) && cave.textLines.length) {
    return cave.textLines.join(' ');
  }
  return cave.text || `Cave $${cave.caveId.toString(16)}`;
}

/**
 * @param {number} itemId
 */
export function itemLabel(itemId) {
  const names = {
    [ITEM.BOMBS]: 'bombs',
    [ITEM.WOOD_SWORD]: 'wood sword',
    [ITEM.WHITE_SWORD]: 'white sword',
    [ITEM.MAGIC_SWORD]: 'magic sword',
    [ITEM.BAIT]: 'bait',
    [ITEM.RECORDER]: 'recorder',
    [ITEM.BLUE_CANDLE]: 'blue candle',
    [ITEM.RED_CANDLE]: 'red candle',
    [ITEM.WOOD_ARROW]: 'arrows',
    [ITEM.SILVER_ARROW]: 'silver arrows',
    [ITEM.BOW]: 'bow',
    [ITEM.BLUE_RING]: 'blue ring',
    [ITEM.RED_RING]: 'red ring',
    [ITEM.LETTER]: 'letter',
    [ITEM.KEY]: 'key',
    [ITEM.HEART_CONTAINER]: 'heart',
    [ITEM.MAGIC_SHIELD]: 'magic shield',
    [ITEM.BLUE_POTION]: 'blue potion',
    [ITEM.RED_POTION]: 'red potion',
    [ITEM.RUPEE]: 'rupee',
    [ITEM.FIVE_RUPEE]: '5 rupees',
  };
  return names[itemId] ?? `$${itemId.toString(16)}`;
}
