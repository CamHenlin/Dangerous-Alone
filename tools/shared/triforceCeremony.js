/**
 * GameMode $12 (UpdateMode12EndLevel) triforce-piece ceremony.
 *
 * NES sequence (Z_05.asm InitMode12 / UpdateMode12EndLevel,
 * Z_07.asm DrawLinkLiftingItem):
 *   1. Link halts holding the shard overhead (`ItemTypeToLift` = $1B).
 *   2. End-level fanfare plays; palette flashes white every 4 frames.
 *   3. `World_FillHearts` tops Link up.
 *   4. Curtain wipe → `EndGameMode12` warps to the dungeon entrance on OW.
 *
 * This port inserts the between-labyrinth briefing after step 3; the play
 * loop then calls `exitDungeon` when that dialogue closes.
 */

import {
  applyNesHeartsToInv,
  nesHeartsFromInv,
  stepWorldFillHearts,
} from './pondFairy.js';

/** Link's fanfare timer before hearts begin filling. */
export const TRIFORCE_FANFARE_FRAMES = 0x80;
/** Palette flip cadence during the fanfare. */
export const TRIFORCE_FLASH_PERIOD = 8;

export const TRIFORCE_PHASE = Object.freeze({
  IDLE: 0,
  FANFARE: 1,
  FILL: 2,
});

/**
 * @typedef {object} TriforceCeremony
 * @property {number} phase
 * @property {number} timer
 * @property {boolean} whiteFlash palette is currently the white row
 * @property {{ hearts: number, partial: number, containers: number } | null} nes
 */

/** @returns {TriforceCeremony} */
export function createTriforceCeremony() {
  return { phase: TRIFORCE_PHASE.IDLE, timer: 0, whiteFlash: false, nes: null };
}

/**
 * @param {TriforceCeremony} c
 */
export function triforceCeremonyActive(c) {
  return c.phase !== TRIFORCE_PHASE.IDLE;
}

/**
 * Begin the ceremony on triforce pickup.
 * @param {TriforceCeremony} c
 */
export function startTriforceCeremony(c) {
  c.phase = TRIFORCE_PHASE.FANFARE;
  c.timer = TRIFORCE_FANFARE_FRAMES;
  c.whiteFlash = false;
  c.nes = null;
}

/**
 * Advance one frame.
 * @param {TriforceCeremony} c
 * @param {{ halfHearts?: number, maxHalfHearts?: number }} inv
 * @returns {{ active: boolean, playFillTune: boolean, finished: boolean }}
 */
export function stepTriforceCeremony(c, inv) {
  if (c.phase === TRIFORCE_PHASE.IDLE) {
    return { active: false, playFillTune: false, finished: false };
  }

  if (c.phase === TRIFORCE_PHASE.FANFARE) {
    c.timer -= 1;
    // Level palette for the first half of each 8-frame window, white for the rest.
    c.whiteFlash = (c.timer & (TRIFORCE_FLASH_PERIOD - 1)) >= TRIFORCE_FLASH_PERIOD / 2;
    if (c.timer > 0) {
      return { active: true, playFillTune: false, finished: false };
    }
    c.phase = TRIFORCE_PHASE.FILL;
    c.whiteFlash = false;
    c.nes = nesHeartsFromInv(inv);
    return { active: true, playFillTune: false, finished: false };
  }

  // FILL
  const nes = c.nes;
  if (!nes) {
    c.phase = TRIFORCE_PHASE.IDLE;
    return { active: false, playFillTune: false, finished: true };
  }
  const { filling, playTune } = stepWorldFillHearts(nes);
  applyNesHeartsToInv(inv, nes.hearts, nes.partial);
  if (filling) {
    return { active: true, playFillTune: playTune, finished: false };
  }
  // Fully topped up.
  inv.halfHearts = inv.maxHalfHearts ?? inv.halfHearts ?? 0;
  c.phase = TRIFORCE_PHASE.IDLE;
  c.nes = null;
  return { active: false, playFillTune: false, finished: true };
}
