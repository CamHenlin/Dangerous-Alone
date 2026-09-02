/**
 * Cave / shop logic (Phase 10).
 *
 * Cave IDs $10–$23. Item codes match Data Crystal Item_codes.
 * Shop & potion price rows are stored 4 entries before the item row.
 */

import {
  ARROW,
  B_ITEM,
  CANDLE_TIER,
  SWORD,
  addBombs,
  addRupees,
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
  // $16 — "LET'S PLAY MONEY MAKING GAME" (CaveFlags money-game / HandleMoneyGame).
  if (caveId === 0x16) return 'gamble';
  if (caveId === 0x17) return 'door';
  if (caveId === 0x1a) return 'potion';
  // $1B/$1C — "PAY ME AND I'LL TALK" pay-for-hint caves (flagsT), not gambling.
  if (caveId === 0x1b || caveId === 0x1c) return 'clue';
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
 * Moblin secret amounts share that same shifted strip: native rows for
 * shops $1D–$1F hold [0,30,0] / [0,100,0] / [0,10,0], which caves
 * $21–$23 read via caveIndex − 4 (middle price → PostCredit).
 * @param {number} caveId
 * @param {CaveKind} kind
 */
export function priceRowIndex(caveId, kind) {
  const idx = caveIndex(caveId);
  if (kind === 'shop' || kind === 'potion' || kind === 'moblin' || kind === 'money') {
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
 * Shop / potion shelves restock every visit. `caveTaken` is shared with
 * permanent gift caves and is saved, so a bomb purchase would otherwise
 * erase that slot forever. Clear this cave's ware keys when entering.
 *
 * @param {{ caveId?: number, kind?: string } | null | undefined} cave
 * @param {Set<string>} taken
 */
export function clearShopVisitTaken(cave, taken) {
  if (!cave || !taken) return;
  if (cave.kind !== 'shop' && cave.kind !== 'potion') return;
  const id = cave.caveId;
  if (id == null) return;
  for (let i = 0; i < 3; i += 1) taken.delete(`${id}:${i}`);
}

/**
 * Unique shop goods Link already carries — hide from the shelf and refuse
 * another purchase. Magic shield is intentionally excluded (Like-Likes can
 * steal it). Consumables (bombs, keys, bait, hearts, potions) stay buyable.
 *
 * @param {object} inv
 * @param {number} itemId
 */
export function alreadyOwnsShopItem(inv, itemId) {
  if (!inv) return false;
  switch (itemId) {
    case ITEM.WOOD_ARROW:
      return (inv.arrow ?? 0) >= 1;
    case ITEM.SILVER_ARROW:
      return (inv.arrow ?? 0) >= 2;
    case ITEM.BLUE_CANDLE:
      return (inv.candle ?? 0) >= CANDLE_TIER.BLUE;
    case ITEM.RED_CANDLE:
      return (inv.candle ?? 0) >= CANDLE_TIER.RED;
    case ITEM.BLUE_RING:
      return (inv.ring ?? 0) >= 1;
    case ITEM.RED_RING:
      return (inv.ring ?? 0) >= 2;
    case ITEM.BOW:
      return (inv.bow ?? 0) >= 1;
    case ITEM.RECORDER:
      return (inv.flute ?? 0) >= 1;
    case ITEM.RAFT:
      return (inv.raft ?? 0) >= 1;
    case ITEM.LADDER:
      return (inv.ladder ?? 0) >= 1;
    case ITEM.MAGIC_KEY:
      return (inv.magicKey ?? 0) >= 1;
    default:
      return false;
  }
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
      if (inv.arrow < ARROW.WOOD) inv.arrow = ARROW.WOOD;
      if (inv.bow && inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOW;
      return 'Arrows';
    case ITEM.SILVER_ARROW:
      inv.arrow = ARROW.SILVER;
      if (inv.bow && inv.selectedB === B_ITEM.NONE) inv.selectedB = B_ITEM.BOW;
      return 'Silver arrows';
    case ITEM.BOW:
      // Arrows stay a separate shop purchase — do not soft-grant InvArrow.
      inv.bow = 1;
      if (inv.arrow >= ARROW.WOOD && inv.selectedB === B_ITEM.NONE) {
        inv.selectedB = B_ITEM.BOW;
      }
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
      addRupees(inv, 5);
      return '5 rupees';
    case ITEM.BLUE_RING:
      if (inv.ring < 1) inv.ring = 1;
      return 'Blue ring';
    case ITEM.RED_RING:
      inv.ring = 2;
      return 'Red ring';
    case ITEM.LETTER:
      if (!inv.letter) inv.letter = 1;
      // CheckMissingItem puts the letter on the potion B slot; equip it so
      // the HUD shows the paper and B at the medicine shop can fire.
      if ((inv.potion ?? 0) === 0) inv.selectedB = B_ITEM.POTION;
      return 'Letter';
    case ITEM.RUPEE:
      addRupees(inv, 1);
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
 * Cave kinds that persist "taken" via the OW room item flag
 * (`GetRoomFlagUWItemState` / `SetRoomFlagUWItemState` in Z_01.asm).
 * Several screens share one caveId; the entrance room distinguishes them.
 * @param {string | undefined} kind
 */
export function caveRemembersByRoom(kind) {
  return kind === 'take_any' || kind === 'door' || kind === 'moblin';
}

/**
 * Stable `caveTaken` key. Room-scoped kinds encode the OW screen so looting
 * one take-any / door / moblin cave does not empty the others.
 * @param {{ caveId?: number, kind?: string }} cave
 * @param {string | number} suffix slot index, `'any'`, `'door'`, `'gift'`, …
 * @param {number | null | undefined} [roomId] OW screen Link entered from
 */
export function caveTakenKey(cave, suffix, roomId = null) {
  const id = cave?.caveId ?? 0;
  if (caveRemembersByRoom(cave?.kind) && roomId != null) {
    return `${roomId & 0xff}:${id}:${suffix}`;
  }
  return `${id}:${suffix}`;
}

/**
 * @param {object} inv
 * @param {object} cave
 * @param {number} slotIndex 0–2
 * @param {{ taken?: Set<string>, roomId?: number | null }} [state]
 *   `taken` keys are `${caveId}:${slot}` for unique caves, or
 *   `${roomId}:${caveId}:${slot|any}` for room-flag caves.
 */
export function tryBuyCaveSlot(inv, cave, slotIndex, state = {}) {
  const slot = cave.slots[slotIndex];
  if (!slot || slot.item === ITEM.NOTHING) {
    return { ok: false, reason: 'Empty slot' };
  }
  const roomId = state.roomId ?? null;
  const key = caveTakenKey(cave, slotIndex, roomId);
  const takeAnyKey = caveTakenKey(cave, 'any', roomId);
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

  if (
    (cave.kind === 'shop' || cave.kind === 'potion')
    && alreadyOwnsShopItem(inv, slot.item)
  ) {
    return { ok: false, reason: 'Already own this' };
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
    for (let i = 0; i < 3; i += 1) {
      state.taken?.add(caveTakenKey(cave, i, roomId));
    }
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
/** Stake shown under each rupee before a pick (`InvRupees >= $0A`). */
export const MONEY_GAME_STAKE = MONEY_GAME_LOSS[0];
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
 * Signed price string for a money-game amount (NES PrependSignToPrice).
 * Wins (+20/+50) get '+'; losses get '-'.
 * @param {number} amount signed delta
 */
export function formatMoneyGameAmount(amount) {
  const n = Math.abs(amount | 0);
  return `${amount > 0 ? '+' : '-'}${n}`;
}

/** Labels under each rupee before a pick — always the stake. */
export function moneyGameStakeLabels() {
  const label = formatMoneyGameAmount(-MONEY_GAME_STAKE);
  return [label, label, label];
}

/**
 * Labels revealed after a pick — all three rolled amounts with signs.
 * @param {number[]} amounts signed deltas from {@link rollMoneyGameAmounts}
 */
export function moneyGameResultLabels(amounts) {
  return [0, 1, 2].map((i) => formatMoneyGameAmount(amounts[i] ?? 0));
}

/**
 * Apply one money-game slot after the player walks onto a ware.
 * ROM: HandleMoneyGame requires ≥10 rupees, then credits 20|50 or debits 10|40
 * (floored at 0) for the chosen slot — Z_01.asm:925.
 * @param {object} inv
 * @param {object} cave
 * @param {number} [slotIndex] 0–2
 * @param {number[] | (() => number|boolean)} [amountsOrRng]
 *   Pre-rolled amounts (preferred) or legacy RNG / boolean coin.
 */
export function tryGamble(inv, cave, slotIndex = 1, amountsOrRng = Math.random) {
  // Legacy boolean coin: true → +20, false → −10.
  if (typeof amountsOrRng === 'boolean') {
    if (inv.rupees < MONEY_GAME_STAKE) {
      return { ok: false, reason: `Need ${MONEY_GAME_STAKE} rupees` };
    }
    if (amountsOrRng) {
      addRupees(inv, 20);
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

  // Stake gate matches ROM InvRupees < $0A — not the chosen loss amount.
  if (inv.rupees < MONEY_GAME_STAKE) {
    return { ok: false, reason: `Need ${MONEY_GAME_STAKE} rupees` };
  }

  const delta = amounts[slotIndex % 3] ?? 0;
  addRupees(inv, delta);
  if (delta > 0) {
    return { ok: true, label: `Won ${delta}!`, rupees: inv.rupees, delta };
  }
  return { ok: true, label: `Lost ${-delta}…`, rupees: inv.rupees, delta };
}

/**
 * Door-repair list prices are $05/$0A/$14; NES takes the largest (20).
 * `find(price > 0)` would wrongly charge 5.
 * @param {object} cave
 */
export function doorRepairPrice(cave) {
  let max = 0;
  for (const s of cave?.slots ?? []) {
    const p = s?.price ?? 0;
    if (p > max) max = p;
  }
  return max > 0 ? max : 20;
}

/**
 * Door repair charge (pay once per cave room — GetRoomFlagUWItemState).
 * NES takes the fee as soon as the cave text runs; if Link is short, it
 * drains whatever he has (never refuses for being broke).
 * @param {object} inv
 * @param {object} cave
 * @param {{ taken?: Set<string>, roomId?: number | null }} [state]
 */
export function tryDoorRepair(inv, cave, state = {}) {
  const key = caveTakenKey(cave, 'door', state.roomId ?? null);
  if (state.taken?.has(key)) {
    return { ok: false, reason: 'Already paid' };
  }
  const price = doorRepairPrice(cave);
  const paid = Math.min(Math.max(0, inv.rupees | 0), price);
  inv.rupees = (inv.rupees | 0) - paid;
  state.taken?.add(key);
  return { ok: true, label: `Paid ${paid} for the door`, price: paid };
}

/**
 * Moblin secret money — NES PostCredit(CavePrices+1): middle price byte.
 * Walk onto the floating rupee (ware slot 1); amount is 30 / 100 / 10.
 * @param {object} inv
 * @param {object} cave
 * @param {{ taken?: Set<string>, roomId?: number | null }} state
 */
export function tryMoblinGift(inv, cave, state = {}) {
  const roomId = state.roomId ?? null;
  const key = caveTakenKey(cave, 'gift', roomId);
  if (state.taken?.has(key)) {
    return { ok: false, reason: 'Already looted' };
  }
  // Middle slot only (CavePrices+1). Skip $00/$FF filler from mis-indexed rows.
  const mid = cave.slots[1]?.price ?? 0;
  const amount = mid > 0 && mid < 255 ? mid : 30;
  addRupees(inv, amount);
  state.taken?.add(key);
  // Clear the floating rupee sprite (caveWareSlots keys by slot index).
  state.taken?.add(caveTakenKey(cave, 1, roomId));
  return { ok: true, label: `Moblin gave ${amount} rupees`, amount };
}

/**
 * NES take-any-road destinations: four OW screens form a loop; the three
 * staircases advance Link by +1 / +2 / +3 from the entrance he used.
 * @param {readonly number[]} roads
 * @param {number} fromRoomId entrance OW screen
 * @param {number} stairIndex 0..2 (left / middle / right)
 * @returns {number | null}
 */
export function takeAnyRoadDest(roads, fromRoomId, stairIndex) {
  if (!roads?.length || stairIndex < 0 || stairIndex > 2) return null;
  let from = roads.indexOf(fromRoomId & 0xff);
  if (from < 0) from = 0;
  return roads[(from + stairIndex + 1) % roads.length] ?? null;
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
