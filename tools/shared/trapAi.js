import { DIR } from './collision.js';
import { OBJ } from './enemies.js';

/** NES TrapXs / TrapYs (screen space, HUD included in Y). */
export const TRAP_XS = Object.freeze([0x20, 0x20, 0xd0, 0xd0, 0x40, 0xb0]);
export const TRAP_YS = Object.freeze([0x5d, 0xbd, 0x5d, 0xbd, 0x8d, 0x8d]);

/** Allowed dir bits per trap index (TrapAllowedDirs). */
const TRAP_ALLOWED = Object.freeze([0x05, 0x09, 0x06, 0x0a, 0x01, 0x02]);

export const TRAP_STATE = Object.freeze({
  SENSE: 0,
  RUSH: 1,
  RETRACT: 2,
});

/**
 * @param {number} objType
 */
export function isTrapType(objType) {
  return objType === OBJ.TRAP || objType === OBJ.TRAP2;
}

/**
 * Expand generator `$49` (6) / `$4A` (4) into child trap spawn specs.
 * @param {number} objType
 * @param {{ x?: number, y?: number }} [origin] dungeon room origin
 * @returns {{ objType: number, x: number, y: number, trapIndex: number }[]}
 */
export function expandTrapGenerator(objType, origin = { x: 0, y: 0 }) {
  if (!isTrapType(objType)) return [];
  const count = objType === OBJ.TRAP ? 6 : 4;
  const ox = origin.x ?? 0;
  const oy = origin.y ?? 0;
  /** @type {{ objType: number, x: number, y: number, trapIndex: number }[]} */
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      objType: OBJ.TRAP,
      x: TRAP_XS[i] + ox,
      y: TRAP_YS[i] + oy,
      trapIndex: i,
    });
  }
  return out;
}

/**
 * @param {object} e trap enemy
 * @param {{ x: number, y: number }} link
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 */
export function stepTrap(e, link, bounds) {
  const idx = e.trapIndex ?? 0;
  const allowed = TRAP_ALLOWED[idx] ?? 0x0f;
  const state = e.trapState ?? TRAP_STATE.SENSE;

  if (state === TRAP_STATE.SENSE) {
    const dy = Math.abs(link.y - e.y);
    const dx = Math.abs(link.x - e.x);
    if (dy < 0x0e && dx >= 1) {
      const dir = link.x >= e.x ? DIR.RIGHT : DIR.LEFT;
      if (dir & allowed) {
        e.trapHome = e.x;
        e.dir = dir;
        e.trapState = TRAP_STATE.RUSH;
        e.qSpeed = 2; // ~$70
      }
      return;
    }
    if (dx < 0x0e && dy >= 1) {
      const dir = link.y >= e.y ? DIR.DOWN : DIR.UP;
      if (dir & allowed) {
        e.trapHome = e.y;
        e.dir = dir;
        e.trapState = TRAP_STATE.RUSH;
        e.qSpeed = 2;
      }
    }
    return;
  }

  // Move
  const spd = state === TRAP_STATE.RUSH ? 2 : 1;
  if (e.dir & DIR.RIGHT) e.x += spd;
  if (e.dir & DIR.LEFT) e.x -= spd;
  if (e.dir & DIR.DOWN) e.y += spd;
  if (e.dir & DIR.UP) e.y -= spd;

  // Clamp to room
  e.x = Math.max(bounds.minX, Math.min(bounds.maxX, e.x));
  e.y = Math.max(bounds.minY, Math.min(bounds.maxY, e.y));

  if (state === TRAP_STATE.RUSH) {
    const horiz = Boolean(e.dir & (DIR.LEFT | DIR.RIGHT));
    const cur = horiz ? e.x : e.y;
    const target = horiz ? 0x78 : 0x90;
    if (Math.abs(cur - target) < 5) {
      e.dir =
        e.dir & DIR.RIGHT
          ? DIR.LEFT
          : e.dir & DIR.LEFT
            ? DIR.RIGHT
            : e.dir & DIR.DOWN
              ? DIR.UP
              : DIR.DOWN;
      e.trapState = TRAP_STATE.RETRACT;
      e.qSpeed = 1;
    }
    return;
  }

  // RETRACT — home to original axis coord
  const horiz = Boolean(e.dir & (DIR.LEFT | DIR.RIGHT));
  const home = e.trapHome ?? (horiz ? e.x : e.y);
  const cur = horiz ? e.x : e.y;
  if (Math.abs(cur - home) <= 2) {
    if (horiz) e.x = home;
    else e.y = home;
    e.trapState = TRAP_STATE.SENSE;
    e.qSpeed = 0;
  }
}
