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
/** QoL: dark rooms with a candle brighten after this many frames (~1s at 60fps). */
export const AUTO_LIGHT_DELAY_FRAMES = 60;

/**
 * @typedef {object} CandleRoomState
 * @property {boolean} usedCandle  blue already used this stay
 * @property {boolean} lit         room brightened this stay
 * @property {number} autoLightTimer  frames until QoL auto-light (0 = idle)
 */

export function createCandleRoomState() {
  return { usedCandle: false, lit: false, autoLightTimer: 0 };
}

/**
 * Per-room candle stays for one place (a labyrinth, a cellar, the overworld).
 * One `lit` flag for the whole world would undarken leftover `$02` when you
 * light `$01`.
 *
 * @typedef {object} CandleStore
 * @property {Map<number, CandleRoomState>} rooms
 */
export function createCandleStore() {
  return { rooms: new Map() };
}

/** @param {unknown} value */
export function asCandleStore(value) {
  if (value && value.rooms instanceof Map) return /** @type {CandleStore} */ (value);
  return createCandleStore();
}

/** @param {number | null | undefined} roomId */
export function candleRoomId(roomId) {
  return (roomId ?? 0) & 0xff;
}

/**
 * The stay record for this cell, created empty if nobody has entered yet.
 * @param {CandleStore} store
 * @param {number | null | undefined} roomId
 */
export function candleForRoom(store, roomId) {
  const rooms = store.rooms ?? (store.rooms = new Map());
  const id = candleRoomId(roomId);
  let s = rooms.get(id);
  if (!s) {
    s = createCandleRoomState();
    rooms.set(id, s);
  }
  return s;
}

/**
 * Start a stay in `roomId`. Someone already standing there: join their light.
 * Empty: NES reset — dark, unused blue, auto-light armed if you own a candle.
 *
 * @param {CandleStore} store
 * @param {number | null | undefined} roomId
 * @param {object | null | undefined} pack
 * @param {{ candle?: number } | null | undefined} inv
 * @param {boolean} [occupied]
 */
export function beginCandleStay(store, roomId, pack, inv, occupied = false) {
  if (occupied) return candleForRoom(store, roomId);
  const s = createCandleRoomState();
  const rooms = store.rooms ?? (store.rooms = new Map());
  rooms.set(candleRoomId(roomId), s);
  armDarkRoomAutoLight(s, pack, inv);
  return s;
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
 * Start the QoL auto-light countdown when entering a dark room with a candle.
 * Does not consume blue candle uses — that still requires wielding the flame.
 * @param {CandleRoomState} state
 * @param {object | null | undefined} room
 * @param {{ candle?: number } | null | undefined} inv
 */
export function armDarkRoomAutoLight(state, room, inv) {
  state.autoLightTimer = 0;
  if (state.lit) return;
  if (!room?.floorItem?.dark) return;
  if ((inv?.candle ?? CANDLE.NONE) <= CANDLE.NONE) return;
  state.autoLightTimer = AUTO_LIGHT_DELAY_FRAMES;
}

/**
 * Tick QoL auto-light. Returns true when the room just brightened this frame.
 * @param {CandleRoomState} state
 */
export function stepDarkRoomAutoLight(state) {
  if (state.lit || (state.autoLightTimer ?? 0) <= 0) return false;
  state.autoLightTimer -= 1;
  if (state.autoLightTimer > 0) return false;
  state.lit = true;
  return true;
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
    state.autoLightTimer = 0;
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
