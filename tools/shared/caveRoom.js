/**
 * NES overworld cave subroom (Mode B) layout helpers.
 *
 * Positions from aldonunez DrawCaveItems / cave init:
 *   dweller ($78, $80), wares X $58/$78/$98 Y $98, mouth at south.
 */

import { DIR, HUD_HEIGHT, OW_BOUNDS } from './collision.js';
import { ITEM, activeSlots, alreadyOwnsShopItem, caveTakenKey } from './caves.js';

/** Cave ware X positions (NES ObjX). */
export const CAVE_WARE_XS = Object.freeze([0x58, 0x78, 0x98]);
export const CAVE_WARE_Y = 0x98;
/** Take-any-road staircases share the ware columns. */
export const CAVE_ROAD_XS = CAVE_WARE_XS;
export const CAVE_ROAD_Y = CAVE_WARE_Y;
export const CAVE_DWELLER_X = 0x78;
export const CAVE_DWELLER_Y = 0x80;
/** Standing fires flanking the dweller. */
export const CAVE_FIRE_XS = Object.freeze([0x48, 0xa8]);
export const CAVE_FIRE_Y = 0x80;

/** Link enters just inside the mouth, facing up (not on the exit trigger). */
export const CAVE_ENTER_SPAWN = Object.freeze({
  x: 0x78,
  y: 0xb8,
  dir: 0x08, // UP
});

/**
 * Drop OW combat leftovers that would softlock Mode B.
 *
 * Caves do not run `stepCombat`, so a knockback or sword swing still armed
 * when Link steps on the mouth never finishes — `stepCave` refuses to walk
 * while `shovePixels > 0` or the blade is active, and the room looks frozen.
 *
 * @param {{
 *   link: { posFrac?: number, gridOffset?: number, moving?: boolean },
 *   inv: {
 *     shovePixels?: number,
 *     shoveDir?: number,
 *     paralyzed?: number,
 *     itemLiftTimer?: number,
 *   },
 *   sword?: { phase?: number, timer?: number, dir?: number } | null,
 *   cancelSword?: (sword: object) => void,
 * }} state
 */
export function clearCaveTransitState(state) {
  const { link, inv, sword = null, cancelSword = null } = state;
  link.posFrac = 0;
  link.gridOffset = 0;
  link.moving = false;
  inv.shovePixels = 0;
  inv.shoveDir = 0;
  inv.paralyzed = 0;
  inv.itemLiftTimer = 0;
  if (sword && cancelSword) cancelSword(sword);
  else if (sword) {
    sword.phase = 0;
    sword.timer = 0;
    sword.dir = 0;
  }
}

/** Playfield size matches OW (256×176 under HUD). */
export const CAVE_BOUNDS = Object.freeze({
  left: 0x10,
  right: 0xe0,
  top: HUD_HEIGHT + 0x10,
  bottom: 0xd8,
});

/**
 * Dweller visual kind from ROM dweller byte ($58–$5B).
 * These match ObjAnimations heap indices for cave person types ($6A+).
 * @param {number} dweller
 * @returns {'old_man'|'old_woman'|'merchant'|'moblin'}
 */
export function dwellerKind(dweller) {
  switch (dweller) {
    case 0x59:
      return 'old_woman';
    case 0x5a:
      return 'merchant';
    case 0x5b:
      return 'moblin';
    default:
      return 'old_man';
  }
}

/**
 * DrawCavePerson / ObjAnimFrameHeap+$58..$5B + ObjAnimAttrHeap.
 * Old man/woman/merchant are mirrored; moblin (≥$7B cave type) is not.
 * @param {number} dweller ROM dweller / anim index $58–$5B
 * @returns {{ tile: number, pal: number, mirror: boolean }}
 */
export function caveDwellerDraw(dweller) {
  switch (dweller & 0xff) {
    case 0x59: // old woman — tile $9A, attr $02
      return { tile: 0x9a, pal: 2, mirror: true };
    case 0x5a: // merchant — tile $9C, attr $00
      return { tile: 0x9c, pal: 0, mirror: true };
    case 0x5b: // moblin — tile $F8, attr $02, not mirrored
      return { tile: 0xf8, pal: 2, mirror: false };
    default: // old man — tile $98, attr $02
      return { tile: 0x98, pal: 2, mirror: true };
  }
}

/** Cave bonfire object type $40 → ObjAnimFrameHeap[$08] = $5C. */
export const CAVE_FIRE_TILE = 0x5c;
/** ObjAnimAttrHeap[$08] low bits → sprite palette 2. */
export const CAVE_FIRE_PAL = 2;

/**
 * Build a walkable cave tile grid (22×32). Black floor; mouth row walkable warp.
 * @returns {number[][]}
 */
export function createCaveTileGrid() {
  const rows = 22;
  const cols = 32;
  /** @type {number[][]} */
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0x26)); // sand-ish walkable
  // Darker “interior” — still walkable (NES cave floor is open).
  for (let r = 2; r < 18; r += 1) {
    for (let c = 2; c < 30; c += 1) {
      grid[r][c] = 0x26;
    }
  }
  // South mouth: warp tiles so standing still can also be used; exit is edge-based.
  for (let c = 14; c <= 17; c += 1) {
    grid[20][c] = 0x70;
    grid[21][c] = 0x71;
  }
  return grid;
}

/**
 * Visible ware slots for the cave scene.
 * Unique goods Link already owns are treated as gone (shelf empty).
 * @param {object} cave
 * @param {Set<string>} taken
 * @param {object | null} [inv]
 * @param {number | null} [roomId] OW screen for room-flag caves (take-any)
 */
export function caveWareSlots(cave, taken, inv = null, roomId = null) {
  const takeAnyGone =
    cave.kind === 'take_any' && taken.has(caveTakenKey(cave, 'any', roomId));
  const moblinGiftGone =
    (cave.kind === 'moblin' || cave.kind === 'money')
    && taken.has(caveTakenKey(cave, 'gift', roomId));
  return activeSlots(cave)
    .filter((s) => s.item !== ITEM.NOTHING)
    .map((s) => {
      const key = caveTakenKey(cave, s.index, roomId);
      return {
        ...s,
        x: CAVE_WARE_XS[s.index] ?? 0x78,
        y: CAVE_WARE_Y,
        key,
        gone:
          takeAnyGone
          || moblinGiftGone
          || taken.has(key)
          || alreadyOwnsShopItem(inv, s.item),
      };
    });
}

/**
 * Pickup when Link overlaps a ware (NES touch).
 * @param {{ x: number, y: number }} link
 * @param {ReturnType<typeof caveWareSlots>} slots
 */
export function wareUnderLink(link, slots) {
  for (const slot of slots) {
    if (slot.gone) continue;
    // Link is 16×16; ware is ~8×16. Generous box matches NES touch pickup.
    if (
      Math.abs(link.x - slot.x) < 16
      && Math.abs(link.y - slot.y) < 18
    ) {
      return slot;
    }
  }
  return null;
}

/**
 * Which take-any-road staircase Link is standing on, or -1.
 * @param {{ x: number, y: number }} link
 */
export function roadStairUnderLink(link) {
  if (Math.abs(link.y - CAVE_ROAD_Y) > 18) return -1;
  for (let i = 0; i < CAVE_ROAD_XS.length; i += 1) {
    if (Math.abs(link.x - CAVE_ROAD_XS[i]) < 16) return i;
  }
  return -1;
}

/**
 * Touch box for door-repair dwellers (legacy; door repair charges on enter).
 * Kept for layout/tests — Moblin gifts use ware touch like NES.
 * Latch + pay must share this — a wider latch with a tighter pay check
 * eats the interaction on approach from the south mouth and never retries.
 * @param {{ x: number, y: number }} link
 */
export function nearCaveNpc(link) {
  return (
    Math.abs(link.x - CAVE_DWELLER_X) < 16
    && Math.abs(link.y - CAVE_DWELLER_Y) < 24
  );
}

/**
 * Bottom-of-cave control hint for the Mode-B interior.
 * @param {string} kind CaveKind
 */
export function caveHintLine(kind) {
  switch (kind) {
    case 'road':
      return 'WALK TO STAIRS  SOUTH TO LEAVE';
    case 'give':
    case 'take_any':
    case 'letter':
    case 'shop':
    case 'potion':
      return 'WALK TO ITEM  SOUTH TO LEAVE';
    case 'moblin':
    case 'money':
      return 'WALK TO RUPEE  SOUTH TO LEAVE';
    default:
      return 'SOUTH TO LEAVE';
  }
}

/**
 * Leave cave by walking into the south mouth.
 * Link uses OW room bounds in caves (`stepLink` without roomId), so the
 * farthest south Y is `OW_BOUNDS.bottom` ($CD). Mid-cell snaps can leave him
 * on $CC for a frame, so accept that too.
 * @param {{ x: number, y: number, dir: number }} link
 */
export function checkCaveExit(link) {
  // At / past the south walk limit, facing down, centered on the mouth.
  if (link.y < OW_BOUNDS.bottom - 1) return false;
  if ((link.dir & DIR.DOWN) === 0) return false;
  return link.x >= 0x60 && link.x <= 0x90;
}
