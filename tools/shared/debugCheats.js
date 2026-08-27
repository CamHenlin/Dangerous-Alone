/**
 * Play-mode debug cheats (refill, kill screen, invincible, OHK, always-drop).
 * Pure helpers so the HTML debug menu and `zeldaDebug` share one code path.
 */

import { B_ITEM } from './inventory.js';
import { countsTowardRoomClear } from './roomSecrets.js';

/**
 * @returns {{ invincible: boolean, oneHitKills: boolean, insaneDrops: boolean }}
 */
export function createDebugCheats() {
  return {
    invincible: false,
    oneHitKills: false,
    insaneDrops: false,
  };
}

/**
 * Fill hearts and clear death flag.
 * @param {{ halfHearts: number, maxHalfHearts: number, dead?: boolean }} inv
 */
export function refillHearts(inv) {
  inv.halfHearts = inv.maxHalfHearts;
  inv.dead = false;
}

/**
 * Fill bombs to capacity; auto-select B-item bomb if none selected.
 * @param {{ bombs: number, maxBombs: number, selectedB?: string }} inv
 */
export function refillBombs(inv) {
  inv.bombs = inv.maxBombs;
  if (inv.selectedB === B_ITEM.NONE && inv.bombs > 0) {
    inv.selectedB = B_ITEM.BOMB;
  }
}

/** NES rupee counter saturates at 255. Co-op multiplies that by party size. */
export const MAX_RUPEES = 255;

/**
 * Fill rupees to the current purse ceiling (255 alone, ×N in company).
 * @param {{ rupees: number, rupeeCap?: number }} inv
 */
export function refillRupees(inv) {
  inv.rupees = inv.rupeeCap ?? MAX_RUPEES;
}

/**
 * Force Link into the dead state (ignores invuln / invincible).
 * @param {{ halfHearts: number, dead?: boolean }} inv
 * @returns {boolean} true if this call started a death
 */
export function killLink(inv) {
  if (inv.dead) return false;
  inv.halfHearts = 0;
  inv.dead = true;
  return true;
}

/**
 * After a weapon hit helper returns, force a kill when OHK is on.
 * Respects parry / miss (`hit !== true`).
 * @param {{ alive?: boolean, hp?: number } | null | undefined} e
 * @param {true | false | 'parry' | unknown} hit
 * @returns {boolean} true if this forced a kill
 */
export function applyOneHitKill(e, hit) {
  if (hit !== true || !e?.alive) return false;
  e.hp = 0;
  e.alive = false;
  return true;
}

/**
 * On-screen foes the kill-all cheat should remove (non-NPC clear-count enemies).
 * @param {{ alive?: boolean, npc?: boolean, objType?: number, immortal?: boolean } | null | undefined} e
 * @param {(e: object) => boolean} isOffCamera
 */
export function shouldKillOnScreen(e, isOffCamera) {
  if (!countsTowardRoomClear(e)) return false;
  if (isOffCamera(e)) return false;
  return true;
}
