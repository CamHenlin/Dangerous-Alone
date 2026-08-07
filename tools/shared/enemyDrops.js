/**
 * NES enemy drop system (SetUpDroppedItem / HandleMonsterDied / UpdateItem).
 *
 * Item IDs: $00 bomb, $0F 5-rupees, $18 1-rupee, $21 clock, $22 heart, $23 fairy.
 */

import { DIR } from './collision.js';
import { addBombs, healLink } from './inventory.js';

/** Damage type bit used when HelpDropCount hits $0A (bomb → bomb drop). */
export const DROP_DAMAGE_BOMB = 0x08;

export const DROP_ITEM = Object.freeze({
  BOMB: 0x00,
  RUPEE5: 0x0f,
  RUPEE1: 0x18,
  CLOCK: 0x21,
  HEART: 0x22,
  FAIRY: 0x23,
});

/** Types that never leave a drop (NoDropMonsterTypes). */
export const NO_DROP_TYPES = Object.freeze([
  0x5d, 0x14, 0x15, 0x1b, 0x1c, 0x1d, 0x17,
]);

/** Do not advance WorldKillCycle (metastate $14). */
export const NO_KILL_CYCLE_TYPES = Object.freeze([0x5d, 0x14, 0x1c]);

const DROP_TYPES_ROW0 = Object.freeze([0x07, 0x08, 0x0e, 0x04, 0x0f, 0x23]);
const DROP_TYPES_ROW1 = Object.freeze([
  0x21, 0x22, 0x0d, 0x10, 0x13, 0x28, 0x2a, 0x27, 0x16,
]);
const DROP_TYPES_ROW2 = Object.freeze([
  0x09, 0x0a, 0x03, 0x01, 0x12, 0x06, 0x0b, 0x24, 0x30,
]);

/** DropItemRates — random byte must be < rate to drop. */
export const DROP_RATES = Object.freeze([0x50, 0x98, 0x68, 0x68]);

/**
 * DropItemTable — 4 rows × 10 columns (WorldKillCycle).
 * Row-major: row0[0..9], row1[0..9], …
 */
export const DROP_TABLE = Object.freeze([
  // row 0
  0x22, 0x18, 0x22, 0x18, 0x23, 0x18, 0x22, 0x22, 0x18, 0x18,
  // row 1
  0x0f, 0x18, 0x22, 0x18, 0x0f, 0x22, 0x21, 0x18, 0x18, 0x18,
  // row 2
  0x22, 0x00, 0x18, 0x21, 0x18, 0x22, 0x00, 0x18, 0x00, 0x22,
  // row 3
  0x22, 0x22, 0x23, 0x18, 0x22, 0x23, 0x22, 0x22, 0x22, 0x18,
]);

/**
 * CHR top tiles from Anim_ItemFrameTiles (via ItemIdToSlot / Anim_ItemFrameOffsets).
 * Heart $F3 is on common_misc (8×16 OAM bit0 → top $F2); others are common_sprites.
 */
export const DROP_CHR = Object.freeze({
  [DROP_ITEM.BOMB]: 0x34,
  [DROP_ITEM.RUPEE1]: 0x32,
  [DROP_ITEM.RUPEE5]: 0x32,
  [DROP_ITEM.HEART]: 0xf3,
  [DROP_ITEM.CLOCK]: 0x66,
  [DROP_ITEM.FAIRY]: 0x50,
});

/**
 * @typedef {object} DropCounters
 * @property {number} worldKillCycle 0–9
 * @property {number} worldKillCount consecutive kills (Help / fairy)
 * @property {number} helpDropCount 0–10
 * @property {number} helpDropValue 0 = 5-rupee help, ≠0 = bomb help
 */

/**
 * @returns {DropCounters}
 */
export function createDropCounters() {
  return {
    worldKillCycle: 0,
    worldKillCount: 0,
    helpDropCount: 0,
    helpDropValue: 0,
  };
}

/**
 * Reset streak counters when Link is harmed (Link_BeHarmed).
 * @param {DropCounters} c
 */
export function resetDropStreak(c) {
  c.worldKillCount = 0;
  c.helpDropCount = 0;
  c.helpDropValue = 0;
}

/**
 * @param {number} objType
 */
export function dropTableRow(objType) {
  if (NO_DROP_TYPES.includes(objType)) return -1;
  if (DROP_TYPES_ROW0.includes(objType)) return 0;
  if (DROP_TYPES_ROW1.includes(objType)) return 1;
  if (DROP_TYPES_ROW2.includes(objType)) return 2;
  return 3;
}

/**
 * HandleMonsterDied counter bumps (before drop setup).
 * @param {DropCounters} c
 * @param {number} damageType DROP_DAMAGE_BOMB or other
 */
export function noteMonsterDied(c, damageType = 0) {
  c.worldKillCount = (c.worldKillCount + 1) & 0xff;
  if (c.helpDropCount < 0x0a) {
    c.helpDropCount += 1;
    if (c.helpDropCount === 0x0a && damageType === DROP_DAMAGE_BOMB) {
      c.helpDropValue += 1;
    }
  }
}

/**
 * Advance WorldKillCycle for types that count (metastate $14).
 * @param {DropCounters} c
 * @param {number} objType
 */
export function advanceKillCycle(c, objType) {
  if (NO_KILL_CYCLE_TYPES.includes(objType)) return;
  c.worldKillCycle += 1;
  if (c.worldKillCycle >= 0x0a) c.worldKillCycle = 0;
}

/**
 * SetUpDroppedItem — returns item id or null (destroy / no drop).
 * @param {object} opts
 * @param {number} opts.objType
 * @param {DropCounters} opts.counters
 * @param {() => number} opts.randomByte 0–255 (NES Random,X)
 * @param {number} [opts.slotIndex] NES object slot (1 = stalfos/gibdo suppress)
 */
export function resolveDroppedItem(opts) {
  const { objType, counters, randomByte } = opts;
  const row = dropTableRow(objType);
  if (row < 0) return null;

  // Slot 1 room-item carriers (Like-Like / Stalfos / Gibdo) — no random drop.
  const slot = opts.slotIndex ?? 0;
  if (slot === 1 && (objType === 0x17 || objType === 0x2a || objType === 0x30)) return null;

  let itemId = DROP_TABLE[row * 10 + (counters.worldKillCycle % 10)];

  if (counters.worldKillCount === 0x10) {
    itemId = DROP_ITEM.FAIRY;
    counters.helpDropCount = 0;
    counters.helpDropValue = 0;
    return itemId;
  }

  if (counters.helpDropCount >= 0x0a) {
    itemId = counters.helpDropValue === 0 ? DROP_ITEM.RUPEE5 : DROP_ITEM.BOMB;
    counters.helpDropCount = 0;
    counters.helpDropValue = 0;
    return itemId;
  }

  const roll = randomByte() & 0xff;
  if (roll >= DROP_RATES[row]) return null;
  return itemId;
}

/**
 * Full kill → optional drop (counters + cycle + table).
 * @param {object} opts
 * @param {number} opts.objType
 * @param {DropCounters} opts.counters
 * @param {() => number} opts.randomByte
 * @param {number} [opts.damageType]
 * @param {number} [opts.slotIndex]
 * @param {number} opts.x
 * @param {number} opts.y
 * @returns {DroppedItem | null}
 */
export function tryCreateDropFromKill(opts) {
  noteMonsterDied(opts.counters, opts.damageType ?? 0);
  advanceKillCycle(opts.counters, opts.objType);
  const itemId = resolveDroppedItem(opts);
  if (itemId == null) return null;
  return createDroppedItem(opts.x, opts.y, itemId);
}

/**
 * @typedef {object} DroppedItem
 * @property {number} [id] play-side sprite key
 * @property {number} x
 * @property {number} y
 * @property {number} itemId
 * @property {number} lifetime
 * @property {boolean} alive
 * @property {number} dir fairy facing
 * @property {number} timer fairy re-roll
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {number} itemId
 * @returns {DroppedItem}
 */
export function createDroppedItem(x, y, itemId) {
  return {
    id: 0,
    x,
    y,
    itemId,
    lifetime: 0xff,
    alive: true,
    dir: DIR.UP,
    timer: 0,
  };
}

/**
 * Every other frame decrement lifetime (UpdateItem).
 * @param {DroppedItem} item
 * @param {number} frameCounter
 */
export function stepDroppedItemLifetime(item, frameCounter) {
  if (!item.alive) return;
  if (frameCounter & 1) {
    item.lifetime = (item.lifetime - 1) & 0xff;
  }
  if (item.lifetime === 0) item.alive = false;
}

/** Flyer states (shared with keese-style ControlFairyFlight). */
const FAIRY_STATE = Object.freeze({
  SPEED_UP: 0,
  DECIDE: 1,
  CHASE: 2,
  WANDER: 3,
  SLOW: 4,
  DELAY: 5,
});

/**
 * Fairy flyer (UpdateFairyObject / ControlFairyFlight).
 * @param {DroppedItem} item
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ x: number, y: number } | null} [chase]
 */
export function stepFairy(item, bounds, chase = null) {
  if (item.itemId !== DROP_ITEM.FAIRY || !item.alive) return;
  if (item.flyerState == null) {
    item.flyerState = FAIRY_STATE.SPEED_UP;
    item.flyerTurns = 6;
    item.flyerSpeed = 1;
  }

  item.timer -= 1;
  if (item.timer <= 0) {
    const st = item.flyerState;
    if (st === FAIRY_STATE.SPEED_UP) {
      item.flyerSpeed = Math.min(2, (item.flyerSpeed ?? 1) + 1);
      item.flyerState = FAIRY_STATE.DECIDE;
      item.timer = 4;
    } else if (st === FAIRY_STATE.DECIDE) {
      const r = (item.x + item.y + item.lifetime) & 0xff;
      item.flyerState = r >= 0xa0 ? FAIRY_STATE.CHASE : r >= 0x20 ? FAIRY_STATE.WANDER : FAIRY_STATE.SLOW;
      item.flyerTurns = 6;
      item.timer = 8;
    } else if (st === FAIRY_STATE.DELAY) {
      item.flyerState = FAIRY_STATE.SPEED_UP;
      item.timer = 10;
    } else {
      item.flyerTurns = (item.flyerTurns ?? 1) - 1;
      if (item.flyerTurns <= 0) {
        item.flyerState = st === FAIRY_STATE.SLOW ? FAIRY_STATE.DELAY : FAIRY_STATE.DECIDE;
        if (st === FAIRY_STATE.SLOW) item.flyerSpeed = 1;
        item.timer = 12;
      } else {
        if (st === FAIRY_STATE.CHASE && chase) {
          const dx = chase.x - item.x;
          const dy = chase.y - item.y;
          item.dir =
            Math.abs(dx) > Math.abs(dy)
              ? dx >= 0
                ? DIR.RIGHT
                : DIR.LEFT
              : dy >= 0
                ? DIR.DOWN
                : DIR.UP;
        } else {
          const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
          item.dir = dirs[(item.lifetime + item.flyerTurns) & 3];
        }
        item.timer = 6 + (item.lifetime & 3);
      }
    }
  }

  const spd = item.flyerState === FAIRY_STATE.SLOW || item.flyerState === FAIRY_STATE.DELAY
    ? 1
    : item.flyerSpeed ?? 1;
  if (item.flyerState !== FAIRY_STATE.DELAY) {
    if (item.dir & DIR.UP) item.y -= spd;
    else if (item.dir & DIR.DOWN) item.y += spd;
    else if (item.dir & DIR.LEFT) item.x -= spd;
    else if (item.dir & DIR.RIGHT) item.x += spd;
  }
  item.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.x));
  item.y = Math.max(bounds.minY, Math.min(bounds.maxY, item.y));
}

/**
 * Item lift hold frames (TakeItem) — NES only arms this in caves/cellars
 * (GameMode ≠ $05). OW/UW drops must not freeze Link.
 */
export const ITEM_LIFT_FRAMES = 0x80;

/**
 * NES ItemTakerObjSlots — Link / sword / boom / arrow only.
 * @param {'link' | 'sword' | 'boom' | 'arrow' | string} kind
 */
export function isValidItemTaker(kind) {
  return kind === 'link' || kind === 'sword' || kind === 'boom' || kind === 'arrow';
}

/**
 * Pickup delay: lifetime must be < $F0.
 * @param {DroppedItem} item
 */
export function dropPickupReady(item) {
  return item.alive && item.lifetime < 0xf0;
}

/**
 * TryTakeItem proximity (Link Y+3; |dx|<9, |dy|<9).
 * @param {DroppedItem} item
 * @param {number} takerX
 * @param {number} takerY
 */
export function dropTouchesTaker(item, takerX, takerY) {
  if (!dropPickupReady(item)) return false;
  const dy = Math.abs(takerY + 3 - item.y);
  const dx = Math.abs(takerX - item.x);
  return dy < 9 && dx < 9;
}

/**
 * Grant drop to inventory (TakeItem amounts).
 * @param {object} inv
 * @param {number} itemId
 * @returns {{ ok: boolean, label: string }}
 */
export function grantDroppedItem(inv, itemId) {
  switch (itemId) {
    case DROP_ITEM.BOMB: {
      const n = addBombs(inv, 4);
      return { ok: n > 0 || inv.bombs > 0, label: 'Bombs' };
    }
    case DROP_ITEM.RUPEE1:
      inv.rupees = Math.min(255, inv.rupees + 1);
      return { ok: true, label: 'Rupee' };
    case DROP_ITEM.RUPEE5:
      inv.rupees = Math.min(255, inv.rupees + 5);
      return { ok: true, label: '5 Rupees' };
    case DROP_ITEM.HEART:
      healLink(inv, 2); // 1 heart
      return { ok: true, label: 'Heart' };
    case DROP_ITEM.FAIRY:
      healLink(inv, 6); // 3 hearts
      return { ok: true, label: 'Fairy' };
    case DROP_ITEM.CLOCK:
      inv.clock = 1;
      return { ok: true, label: 'Clock' };
    default:
      return { ok: false, label: `Item $${itemId.toString(16)}` };
  }
}

/**
 * @param {number} itemId
 */
export function dropChrTile(itemId) {
  return DROP_CHR[itemId] ?? 0x24;
}

/**
 * Pickup SFX name for a drop (NES TakeItem / TakeOneRupee / PlayKeyTakenTune).
 * Fairy uses TakeHeartsNoSound → null.
 * @param {number} itemId
 * @returns {'rupee' | 'key' | null}
 */
export function dropPickupSfx(itemId) {
  switch (itemId) {
    case DROP_ITEM.RUPEE1:
    case DROP_ITEM.RUPEE5:
      return 'rupee';
    case DROP_ITEM.FAIRY:
      return null;
    case DROP_ITEM.HEART:
    case DROP_ITEM.BOMB:
    case DROP_ITEM.CLOCK:
      return 'key';
    default:
      return 'key';
  }
}
