/**
 * Hardcoded overworld heart container (NES CreateRoomObjects @MakeHeartContainerOW).
 *
 * Room `$5F` (eastern dock / P-6): item `$1A` at (`$C0`, `$90`).
 * Requires the stepladder to walk onto the water platform.
 */

import { ROOM_ITEM, SECRET } from './roomSecrets.js';

/** Eastern coast dock screen (P-6). */
export const OW_HEART_ROOM = 0x5f;

/** AnimateItemObject / ItemId heart container. */
export const OW_HEART_ITEM = ROOM_ITEM.HEART_CONTAINER;

/** ObjX / ObjY for the dock platform heart. */
export const OW_HEART_X = 0xc0;
export const OW_HEART_Y = 0x90;

/**
 * @param {number} roomId
 * @returns {boolean}
 */
export function isOwHeartRoom(roomId) {
  return (roomId & 0xff) === OW_HEART_ROOM;
}

/**
 * Room-item object for the OW heart, or null when not that room / already taken.
 * Shape matches `createRoomItem` so draw / pickup paths stay shared.
 *
 * @param {number} roomId
 * @param {Set<number> | Iterable<number> | null | undefined} takenRooms
 * @returns {{
 *   itemType: number,
 *   effect: number,
 *   homeX: number,
 *   homeY: number,
 *   x: number,
 *   y: number,
 *   visible: boolean,
 *   taken: boolean,
 *   carried: boolean,
 * } | null}
 */
export function createOwHeartContainer(roomId, takenRooms = null) {
  if (!isOwHeartRoom(roomId)) return null;
  const taken = takenRooms instanceof Set
    ? takenRooms.has(OW_HEART_ROOM)
    : [...(takenRooms ?? [])].some((id) => (id & 0xff) === OW_HEART_ROOM);
  if (taken) return null;
  return {
    itemType: OW_HEART_ITEM,
    effect: SECRET.NONE,
    homeX: OW_HEART_X,
    homeY: OW_HEART_Y,
    x: OW_HEART_X,
    y: OW_HEART_Y,
    visible: true,
    taken: false,
    carried: false,
  };
}
