/**
 * Bombable-wall crack hint overlays (QoL).
 *
 * Unopened OW bomb secrets ($E6) and closed UW bombable doors get a 16×16
 * pixel-art crack sprite so the player can see the wall is bombable.
 */

import { PLAY_H, PLAY_W } from './continuousCamera.js';
import { isDoorMarkedOpen } from './dungeonDoors.js';
import { doorFacePlayRect } from './dungeonRoomLayout.js';
import { secretAction } from './owSecrets.js';

export const BOMB_CRACK_SIZE = 16;

/** Public URL (Vite serves `assets/extracted` as `/`). */
export const BOMB_CRACK_URL = '/play/bomb_crack.png';

/**
 * Dual-tone pixel art: [x, y, shade] where shade 1 = dark core, 2 = light edge.
 * Kept in sync with `assets/extracted/play/bomb_crack.png`.
 */
export const BOMB_CRACK_PIXELS = Object.freeze([
  [7, 0, 1], [8, 0, 2],
  [6, 1, 2], [7, 1, 1], [8, 1, 1],
  [6, 2, 1], [7, 2, 1], [8, 2, 2],
  [5, 3, 2], [6, 3, 1], [7, 3, 1],
  [5, 4, 1], [6, 4, 1], [7, 4, 2],
  [4, 5, 2], [5, 5, 1], [6, 5, 1], [9, 5, 1], [10, 5, 2],
  [4, 6, 1], [5, 6, 1], [6, 6, 2], [8, 6, 2], [9, 6, 1],
  [3, 7, 2], [4, 7, 1], [5, 7, 1], [8, 7, 1], [9, 7, 2],
  [3, 8, 1], [4, 8, 1], [5, 8, 2], [7, 8, 2], [8, 8, 1],
  [2, 9, 2], [3, 9, 1], [4, 9, 1], [7, 9, 1], [8, 9, 2], [10, 9, 1], [11, 9, 2],
  [3, 10, 1], [4, 10, 2], [5, 10, 1], [6, 10, 1], [7, 10, 1], [10, 10, 1],
  [5, 11, 1], [6, 11, 1], [7, 11, 2], [9, 11, 2], [10, 11, 1], [11, 11, 2],
  [6, 12, 1], [7, 12, 1], [8, 12, 1], [9, 12, 1],
  [7, 13, 1], [8, 13, 1], [9, 13, 2],
  [8, 14, 1], [9, 14, 1], [10, 14, 2],
  [9, 15, 1], [10, 15, 1],
  [9, 2, 1], [10, 2, 2],
  [10, 3, 1], [11, 3, 2],
]);

/**
 * @typedef {{ key: string, x: number, y: number }} BombCrackPlacement
 */

/**
 * Center a 16×16 crack inside an axis-aligned rect (screen / room pixels).
 * @param {{ x: number, y: number, w: number, h: number }} rect
 */
export function centerCrackInRect(rect) {
  return {
    x: rect.x + Math.floor((rect.w - BOMB_CRACK_SIZE) / 2),
    y: rect.y + Math.floor((rect.h - BOMB_CRACK_SIZE) / 2),
  };
}

/**
 * Unopened overworld bomb secrets → room-local crack placements.
 * @param {object[]} secrets
 * @param {Set<string>} revealed keys `${mapIndex}:${row}:${col}`
 * @param {number} mapIndex
 * @returns {BombCrackPlacement[]}
 */
export function owBombCrackPlacements(secrets, revealed, mapIndex) {
  /** @type {BombCrackPlacement[]} */
  const out = [];
  const id = mapIndex & 0xff;
  for (const secret of secrets ?? []) {
    if (secretAction(secret) !== 'bomb') continue;
    const key = `${id}:${secret.row}:${secret.col}`;
    if (revealed?.has(key)) continue;
    out.push({
      key: `ow:${key}`,
      x: secret.col * 16,
      y: secret.row * 16,
    });
  }
  return out;
}

/**
 * Closed bombable dungeon doors → room-local crack placements (no HUD offset).
 * Centered on the door-face wall tiles, not the bomb blast probe on the floor.
 * @param {object} room
 * @param {{ open?: Set<string> } | null} doorState
 * @returns {BombCrackPlacement[]}
 */
export function uwBombCrackPlacements(room, doorState) {
  /** @type {BombCrackPlacement[]} */
  const out = [];
  if (!room?.doors) return out;
  const roomId = room.roomId & 0xff;
  for (const side of ['north', 'south', 'west', 'east']) {
    const door = room.doors[side];
    if (door?.type !== 'bombable') continue;
    if (doorState && isDoorMarkedOpen(doorState, roomId, side)) continue;
    const face = doorFacePlayRect(side);
    if (!face) continue;
    const pos = centerCrackInRect(face);
    out.push({
      key: `uw:${roomId}:${side}`,
      x: pos.x,
      y: pos.y,
    });
  }
  return out;
}

/**
 * Sanity: crack stays inside the play field.
 * @param {BombCrackPlacement} p
 */
export function crackInPlayBounds(p) {
  return (
    p.x >= 0
    && p.y >= 0
    && p.x + BOMB_CRACK_SIZE <= PLAY_W
    && p.y + BOMB_CRACK_SIZE <= PLAY_H
  );
}
