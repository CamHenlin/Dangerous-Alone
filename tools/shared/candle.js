/** Candle tiers match InvCandle: 1 = blue (once/room), 2 = red (unlimited). */
import { DIR } from './collision.js';

export const CANDLE = Object.freeze({
  NONE: 0,
  BLUE: 1,
  RED: 2,
});

/** Fire object slots $10 and $11. */
export const FLAME_SLOTS = 2;
/** NES: walk $10 px then stand timer $3F. */
export const FLAME_MOVE_DIST = 0x10;
export const FLAME_STAND_TIME = 0x3f;
/** Damage points vs monsters (CheckMonsterBombOrFireCollision). */
export const FLAME_DAMAGE = 0x10;

/**
 * @typedef {object} CandleRoomState
 * @property {boolean} usedCandle  blue already used this stay
 * @property {boolean} lit         room brightened this stay
 */

export function createCandleRoomState() {
  return { usedCandle: false, lit: false };
}

/**
 * Room needs the dark overlay.
 * @param {object | null | undefined} room
 * @param {CandleRoomState} state
 */
export function roomIsDark(room, state) {
  return Boolean(room?.floorItem?.dark) && !state.lit;
}

/**
 * Attempt to wield the candle in the current room.
 * @param {{ candle: number }} inv
 * @param {CandleRoomState} state
 * @param {object | null | undefined} room
 * @returns {{ ok: boolean, lit: boolean, reason?: string }}
 */
export function tryUseCandle(inv, state, room) {
  const tier = inv.candle ?? CANDLE.NONE;
  if (tier <= CANDLE.NONE) {
    return { ok: false, lit: state.lit, reason: 'No candle' };
  }
  if (tier === CANDLE.BLUE && state.usedCandle) {
    return { ok: false, lit: state.lit, reason: 'Blue candle already used in this room' };
  }

  if (tier === CANDLE.BLUE) state.usedCandle = true;

  // NES only runs the brightening fade in dark rooms; still “use” the candle elsewhere.
  if (room?.floorItem?.dark) {
    state.lit = true;
    return { ok: true, lit: true };
  }
  return { ok: true, lit: false, reason: 'Candle flame (room is already lit)' };
}

/**
 * Label for HUD / inventory.
 * @param {number} tier
 */
export function candleLabel(tier) {
  if (tier >= CANDLE.RED) return 'red';
  if (tier >= CANDLE.BLUE) return 'blue';
  return 'no';
}

/**
 * Candle fire object: move $10 then stand $3F (UpdateBombOrFire).
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir DIR bitmask
 */
export function createOwFlame(linkX, linkY, dir) {
  let x = linkX + 4;
  let y = linkY + 2;
  if (dir & DIR.UP) y -= 16;
  else if (dir & DIR.DOWN) y += 16;
  else if (dir & DIR.LEFT) x -= 16;
  else if (dir & DIR.RIGHT) x += 16;
  return {
    x,
    y,
    dir,
    phase: 'move',
    moved: 0,
    timer: FLAME_STAND_TIME,
    alive: true,
    damaged: false,
  };
}

/**
 * @param {{ x: number, y: number, dir: number, phase: string, moved: number, timer: number, alive: boolean }} flame
 */
export function stepOwFlame(flame) {
  if (!flame?.alive) return flame;
  if (flame.phase === 'move') {
    if (flame.dir & DIR.UP) flame.y -= 1;
    if (flame.dir & DIR.DOWN) flame.y += 1;
    if (flame.dir & DIR.LEFT) flame.x -= 1;
    if (flame.dir & DIR.RIGHT) flame.x += 1;
    flame.moved = (flame.moved ?? 0) + 1;
    if (flame.moved >= FLAME_MOVE_DIST) {
      flame.phase = 'stand';
      flame.timer = FLAME_STAND_TIME;
    }
    return flame;
  }
  flame.timer -= 1;
  if (flame.timer <= 0) flame.alive = false;
  return flame;
}

/**
 * @param {object} flame
 * @param {{ x: number, y: number, w: number, h: number }} target
 */
export function flameHits(flame, target) {
  if (!flame?.alive) return false;
  const cx = flame.x + 8;
  const cy = flame.y + 8;
  const tx = target.x + target.w / 2;
  const ty = target.y + target.h / 2;
  return Math.abs(cx - tx) < 0x0e && Math.abs(cy - ty) < 0x0e;
}
