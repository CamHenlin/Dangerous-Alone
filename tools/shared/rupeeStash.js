/**
 * Object type $35 — Rupee Stash (InitRupeeStash / UpdateRupeeStash @ Z_01.asm).
 *
 * The room monster expands into 10 individual rupee pickups at fixed positions.
 * Touching one grants a rupee; taking any one zeros RoomObjCount so shutters /
 * clear secrets fire while the rest stay collectible until you leave.
 */

import { addRupees } from './inventory.js';

/** ObjType $35. */
export const RUPEE_STASH = 0x35;

/** NES RupeeStashXs / RupeeStashYs (screen space, HUD included in Y). */
export const RUPEE_STASH_XS = Object.freeze([
  0x78, 0x70, 0x80, 0x60, 0x70, 0x80, 0x90, 0x70, 0x80, 0x78,
]);
export const RUPEE_STASH_YS = Object.freeze([
  0x70, 0x80, 0x80, 0x90, 0x90, 0x90, 0x90, 0xa0, 0xa0, 0xb0,
]);

/**
 * |Link − rupee| on ObjX/ObjY. The ROM used $09 from the top-left; we use the
 * 16×16 slots so standing on a stash rupee still collects it.
 */
export const RUPEE_STASH_TOUCH = 0x10;

/**
 * @param {number} objType
 */
export function isRupeeStash(objType) {
  return objType === RUPEE_STASH;
}

/**
 * Expand generator `$35` into 10 child rupee spawn specs.
 * @param {{ x?: number, y?: number }} [origin] dungeon room origin
 * @returns {{ objType: number, x: number, y: number }[]}
 */
export function expandRupeeStash(origin = { x: 0, y: 0 }) {
  const ox = origin.x ?? 0;
  const oy = origin.y ?? 0;
  /** @type {{ objType: number, x: number, y: number }[]} */
  const out = [];
  for (let i = 0; i < RUPEE_STASH_XS.length; i += 1) {
    out.push({
      objType: RUPEE_STASH,
      x: RUPEE_STASH_XS[i] + ox,
      y: RUPEE_STASH_YS[i] + oy,
    });
  }
  return out;
}

/**
 * Stash rupee proximity: 16×16 slot overlap (same as Link taking a drop).
 * @param {{ x: number, y: number }} e
 * @param {number} linkX
 * @param {number} linkY
 */
export function rupeeStashTouchesLink(e, linkX, linkY) {
  return (
    Math.abs(linkY - e.y) < RUPEE_STASH_TOUCH
    && Math.abs(linkX - e.x) < RUPEE_STASH_TOUCH
  );
}

/**
 * Take one stash rupee: grant +1, destroy it, and zero RoomObjCount semantics
 * so remaining stash no longer blocks room-clear secrets.
 *
 * @param {{ alive?: boolean, objType?: number, rupeeStashRoomOpened?: boolean }[]} enemies
 * @param {{ x: number, y: number }} link
 * @param {{ rupees: number }} inv
 * @returns {{ taken: boolean, openedRoom: boolean }}
 */
export function tryTakeRupeeStash(enemies, link, inv) {
  if (!enemies?.length || !link || !inv) return { taken: false, openedRoom: false };
  for (const e of enemies) {
    if (!e?.alive || !isRupeeStash(e.objType)) continue;
    if (!rupeeStashTouchesLink(e, link.x, link.y)) continue;
    e.alive = false;
    e.hp = 0;
    addRupees(inv, 1);
    // STA RoomObjCount #$00 — remaining pickups stay, clear count does not.
    let openedRoom = false;
    for (const o of enemies) {
      if (!isRupeeStash(o.objType)) continue;
      if (!o.rupeeStashRoomOpened) openedRoom = true;
      o.rupeeStashRoomOpened = true;
    }
    return { taken: true, openedRoom };
  }
  return { taken: false, openedRoom: false };
}
