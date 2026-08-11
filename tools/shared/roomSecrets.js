import { chrTileForItemId } from './itemFrame.js';
import { rectsOverlap } from './sword.js';

/**
 * Fallback when level JSON lacks itemPositions (L1 ShortcutOrItemPosArray).
 * Byte: high nibble = X, low nibble = Y/16.
 */
export const L1_ITEM_POS = Object.freeze([
  { x: 0xc0, y: 0x90 }, // $C9
  { x: 0xa0, y: 0xc0 }, // $AC
  { x: 0x80, y: 0x90 }, // $89
  { x: 0x80, y: 0x70 }, // $87
]);

/**
 * Decode LevelInfo itemPositions / packed bytes → screen XY list.
 * @param {readonly { x: number, y: number }[] | readonly number[] | null | undefined} raw
 */
export function itemPositionsFromLevel(raw) {
  if (!raw?.length) return [...L1_ITEM_POS];
  if (typeof raw[0] === 'number') {
    return raw.map((b) => decodeItemPosByte(b));
  }
  return raw.map((p) => ({ x: p.x, y: p.y }));
}

/** Room item type $03 stands in for “no item”. */
export const ROOM_ITEM_NONE = 0x03;

export const ROOM_ITEM = Object.freeze({
  BOW: 0x0a,
  COMPASS: 0x16,
  MAP: 0x17,
  KEY: 0x19,
  HEART_CONTAINER: 0x1a,
  TRIFORCE: 0x1b,
});

export const SECRET = Object.freeze({
  NONE: 0,
  ALL_DEAD: 1,
  RINGLEADER: 2,
  LAST_BOSS: 3,
  BLOCK_DOOR: 4,
  BLOCK_STAIRS: 5,
  MONEY_OR_LIFE: 6,
  FOES_FOR_ITEM: 7,
});

/** ObjTypes that carry the room item (NES MoveAndDrawRoomItem slot 1). */
export const ROOM_ITEM_CARRIERS = Object.freeze([
  0x17, // Like-Like
  0x2a, // Stalfos
  0x30, // Gibdo
]);

/**
 * Decode one ShortcutOrItemPosArray byte → screen XY.
 * @param {number} packed
 */
export function decodeItemPosByte(packed) {
  return {
    x: packed & 0xf0,
    y: (packed & 0x0f) << 4,
  };
}

/**
 * @param {object} room
 * @param {{ x: number, y: number }} [_origin] ignored — positions are screen-absolute
 * @param {readonly { x: number, y: number }[]} [positions]
 */
export function createRoomItem(room, _origin = { x: 0, y: 0 }, positions = L1_ITEM_POS) {
  const itemType = room?.floorItem?.itemType ?? ROOM_ITEM_NONE;
  if (itemType === ROOM_ITEM_NONE) return null;
  const effect = room.specialItem?.effectType ?? SECRET.NONE;
  const posIdx = room.specialItem?.positionIndex ?? 0;
  const pos = positions[posIdx] ?? positions[0];
  const hidden = effect === SECRET.FOES_FOR_ITEM || effect === SECRET.LAST_BOSS;
  return {
    itemType,
    effect,
    /** Fixed spawn from LevelInfo (used when not carried). */
    homeX: pos.x,
    homeY: pos.y,
    x: pos.x,
    y: pos.y,
    visible: !hidden,
    taken: false,
    carried: false,
  };
}

/**
 * First living carrier in NES object-slot-1 order (our enemies[0]).
 * @param {import('./enemies.js').Enemy[] | null | undefined} enemies
 */
export function roomItemCarrier(enemies) {
  const e = enemies?.[0];
  if (!e?.alive || e.npc || e.edgePending) return null;
  if (!ROOM_ITEM_CARRIERS.includes(e.objType)) return null;
  return e;
}

/**
 * Stick the room item to a Like-Like / Stalfos / Gibdo while it lives
 * (AnimateRoomItemOnMonster). Otherwise park at the LevelInfo home pos.
 * @param {object | null} roomItem
 * @param {import('./enemies.js').Enemy[]} enemies
 */
export function syncRoomItemPosition(roomItem, enemies) {
  if (!roomItem || roomItem.taken || !roomItem.visible) return;
  const carrier = roomItemCarrier(enemies);
  if (carrier) {
    roomItem.x = carrier.x;
    roomItem.y = carrier.y;
    roomItem.carried = true;
    return;
  }
  if (roomItem.carried) {
    // Keep last carried coords when the carrier dies (“drops” the key).
    roomItem.carried = false;
    return;
  }
  roomItem.x = roomItem.homeX;
  roomItem.y = roomItem.homeY;
}

/**
 * NES RoomAllDead: living types that block clear are `$01–$2A` and `$2E–$48`.
 * Bubbles `$2B–$2D` and types `≥$49` (traps) are ignored; NPCs ignored.
 * @param {{ alive?: boolean, npc?: boolean, objType?: number } | null | undefined} e
 */
export function countsTowardRoomClear(e) {
  if (!e || e.npc || !e.alive) return false;
  const t = e.objType ?? 0;
  if (t >= 0x2b && t <= 0x2d) return false; // bubbles
  if (t >= 0x49) return false; // traps / people / shots
  if (t === 0x46 || e.immortal) return false; // detached Gleeok head
  // Rupee stash ($35): taking any one zeros RoomObjCount (UpdateRupeeStash).
  if (t === 0x35 && e.rupeeStashRoomOpened) return false;
  return t > 0;
}

/**
 * Obj types that still spawn after a room is in `clearedRooms`
 * (old men / traps — not kill-counted foes).
 * @param {number} objType
 */
export function persistsAfterRoomClear(objType) {
  const t = objType ?? 0;
  if (t === 0x37) return true; // Zelda — NPC, not a clear-counting foe
  if (t >= 0x4b && t <= 0x52) return true; // UW persons
  if (t === 0x49 || t === 0x4a) return true; // traps
  return false;
}

/**
 * True if the room list includes (or included) a clear-counting monster type.
 * Ignores alive — dead foes still mean the room was a fight room.
 * @param {{ npc?: boolean, objType?: number, immortal?: boolean }[]} enemies
 */
export function roomHasClearCountingType(enemies) {
  return enemies.some((e) => {
    if (!e || e.npc || e.immortal) return false;
    const t = e.objType ?? 0;
    if (t >= 0x2b && t <= 0x2d) return false;
    if (t >= 0x49) return false;
    if (t === 0x46) return false;
    return t > 0;
  });
}

/**
 * @param {import('./enemies.js').Enemy[]} enemies
 */
export function roomAllDead(enemies) {
  return !enemies.some((e) => countsTowardRoomClear(e));
}

/**
 * CheckSecretTriggerRingleader — slot 1 empty → kill remaining clear-counting foes.
 * @param {import('./enemies.js').Enemy[]} enemies
 * @returns {boolean} true if a cascade ran
 */
export function tryRingleaderClear(enemies) {
  const slot1 = enemies[0];
  if (slot1?.alive && countsTowardRoomClear(slot1)) return false;
  let killed = false;
  for (const e of enemies) {
    if (!countsTowardRoomClear(e)) continue;
    e.alive = false;
    e.hp = 0;
    killed = true;
  }
  return killed;
}

/**
 * @param {object | null} roomItem
 * @param {boolean} allDead
 * @param {number} [effectOverride] room specialItem.effectType when no floor item
 * @param {{ lastBossDefeated?: boolean }} [opts]
 * @returns {{ shutter: boolean, revealItem: boolean, effect: number }}
 */
export function applyRoomClear(roomItem, allDead, effectOverride, opts = {}) {
  const effect = effectOverride ?? roomItem?.effect ?? SECRET.NONE;
  if (effect === SECRET.LAST_BOSS) {
    // NES: LastBossDefeated after Ganon dies. Require both the flag and a clear
    // room so Patra (or a stale save flag) cannot open Zelda's shutter early.
    if (!opts.lastBossDefeated || !allDead) {
      return { shutter: false, revealItem: false, effect };
    }
  } else if (!allDead) {
    return { shutter: false, revealItem: false, effect: SECRET.NONE };
  }
  const shutter =
    effect === SECRET.ALL_DEAD
    || effect === SECRET.FOES_FOR_ITEM
    || effect === SECRET.LAST_BOSS
    || effect === SECRET.MONEY_OR_LIFE
    || effect === SECRET.RINGLEADER;
  let revealItem = false;
  const revealEffects = effect === SECRET.FOES_FOR_ITEM || effect === SECRET.LAST_BOSS;
  if (roomItem && !roomItem.taken && revealEffects && !roomItem.visible) {
    roomItem.visible = true;
    roomItem.x = roomItem.homeX ?? roomItem.x;
    roomItem.y = roomItem.homeY ?? roomItem.y;
    roomItem.carried = false;
    revealItem = true;
  }
  return { shutter, revealItem, effect };
}

/**
 * @param {object | null | undefined} room
 */
export function roomSecretEffect(room) {
  return room?.specialItem?.effectType ?? SECRET.NONE;
}

/**
 * @param {object | null} roomItem
 * @param {number} linkX
 * @param {number} linkY
 */
export function tryPickupRoomItem(roomItem, linkX, linkY) {
  if (!roomItem || roomItem.taken || !roomItem.visible) return null;
  if (!rectsOverlap({ x: roomItem.x, y: roomItem.y, w: 8, h: 16 }, { x: linkX, y: linkY, w: 16, h: 16 })) {
    return null;
  }
  roomItem.taken = true;
  roomItem.visible = false;
  roomItem.carried = false;
  return roomItem.itemType;
}

/**
 * CHR top tile for room items (Anim_ItemFrameTiles via ItemIdToSlot).
 * @param {number} itemType
 */
export function roomItemChrTile(itemType) {
  // Keep mapping next to ItemId tables in itemFrame.js.
  return chrTileForItemId(itemType);
}
