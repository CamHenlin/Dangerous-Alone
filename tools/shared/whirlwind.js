/**
 * Recorder whirlwind teleport (Z_05 SummonWhirlwind / UpdateWhirlwind).
 */

import { occupyingRoom, roomPlayOrigin } from './continuousCamera.js';
import { triforceCount } from './inventory.js';

export const WHIRLWIND_TYPE = 0x2e;

/** Rooms where flute reveals a secret instead of (or before) summoning. */
export const FLUTE_SECRET_ROOMS = Object.freeze([
  0x42, 0x06, 0x29, 0x2b, 0x30, 0x3a, 0x3c, 0x58, 0x60, 0x6e, 0x72,
]);

/** Drop Y by destination level index 0–7 (TeleportYs). */
export const TELEPORT_YS = Object.freeze([
  0x8d, 0xad, 0x8d, 0x8d, 0xad, 0x8d, 0xad, 0x5d,
]);

/**
 * @param {number} roomId
 */
export function isFluteSecretRoom(roomId) {
  return FLUTE_SECRET_ROOMS.includes(roomId & 0xff);
}

/**
 * `WieldFlute` @ `Z_07.asm:2500`: what the recorder does on an overworld screen.
 *
 * Room `$42` (index 0 of `FluteRoomSecretsOW`) is the only Q1 room with a flute
 * secret, and the only listed room *without* one in Q2 — so it is inverted
 * relative to the other ten. Screens off the list always summon.
 *
 * @param {number} roomId
 * @param {number} quest 1 or 2
 * @returns {'reveal' | 'whirlwind'}
 */
export function fluteActionForRoom(roomId, quest) {
  const index = FLUTE_SECRET_ROOMS.indexOf(roomId & 0xff);
  if (index < 0) return 'whirlwind';
  const isQ2 = quest === 2;
  if (index === 0) return isQ2 ? 'whirlwind' : 'reveal';
  return isQ2 ? 'reveal' : 'whirlwind';
}

/**
 * Next owned triforce level (1–8) after `fromLevel` (0 = none yet).
 * Walks forward wrapping; requires at least one piece.
 * @param {number} triforce bitmask
 * @param {number} [fromLevel=0] last teleported level 0–8
 */
export function nextWhirlwindLevel(triforce, fromLevel = 0) {
  if (!triforce) return 0;
  for (let i = 1; i <= 8; i += 1) {
    const level = ((fromLevel + i - 1) % 8) + 1;
    if (triforce & (1 << (level - 1))) return level;
  }
  return 0;
}

/**
 * Left edge of the cell Link occupies, in the streaming anchor's local X.
 *
 * A leftover hero's numbers are anchor-relative. Starting at X=0 (the
 * anchor's west wall) never overlaps someone standing in leftover `$48`,
 * so the tornado finished at `$F0` and warped them without picking them
 * up — and while it flew, `checkCaveEntry` could still fire.
 * @param {number} anchorRoomId
 * @param {number} linkX
 * @param {number} linkY
 */
export function whirlwindSpawnX(anchorRoomId, linkX, linkY) {
  const occ = occupyingRoom(anchorRoomId, linkX, linkY);
  return roomPlayOrigin(occ.roomId).ox - roomPlayOrigin(anchorRoomId & 0xff).ox;
}

/**
 * @param {number} linkY
 * @param {number} [startX=0] west edge of the cell, in anchor-local X
 */
export function createWhirlwind(linkY, startX = 0) {
  const x = startX | 0;
  return {
    x,
    y: linkY,
    doneAt: x + 0xf0,
    alive: true,
    carrying: false,
    done: false,
  };
}

/**
 * Move +2 X/frame; pick up Link on overlap; finish at the cell's `$F0`.
 * @param {object} ww
 * @param {{ x: number, y: number }} link
 */
export function stepWhirlwind(ww, link) {
  if (!ww?.alive) return ww;
  ww.x += 2;
  if (!ww.carrying) {
    if (Math.abs(ww.x - link.x) < 12 && Math.abs(ww.y - link.y) < 12) {
      ww.carrying = true;
    }
  } else {
    link.x = ww.x;
    link.y = ww.y;
  }
  if (ww.x >= (ww.doneAt ?? 0xf0)) {
    ww.alive = false;
    ww.done = true;
  }
  return ww;
}

/**
 * @param {{ triforce: number }} inv
 * @param {number} [lastLevel]
 */
export function canSummonWhirlwind(inv, lastLevel = 0) {
  return triforceCount(inv) > 0 && nextWhirlwindLevel(inv.triforce, lastLevel) > 0;
}
