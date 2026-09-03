/**
 * Player options (scale, filter, keybinds) persisted in localStorage.
 */

import {
  DEFAULT_PAD_BINDS,
  clonePadBinds,
  isPadCode,
  normalizePadBinds,
  padCodeLabel,
} from './padBinds.js';

export { DEFAULT_PAD_BINDS } from './padBinds.js';

export const OPTIONS_KEY = 'zelda_options';

export const DEFAULT_BINDS = Object.freeze({
  up: Object.freeze(['ArrowUp', 'KeyW']),
  down: Object.freeze(['ArrowDown', 'KeyS']),
  left: Object.freeze(['ArrowLeft', 'KeyA']),
  right: Object.freeze(['ArrowRight', 'KeyD']),
  a: Object.freeze(['KeyZ', 'Space']),
  b: Object.freeze(['KeyX', 'KeyC', 'KeyB']),
  start: Object.freeze(['Enter', 'NumpadEnter', 'Escape', 'ShiftLeft', 'ShiftRight']),
  /** NES Select — cycle B in play; continue menu still reads it. */
  select: Object.freeze(['Tab', 'Backquote']),
});

/**
 * The second player's keyboard, for two at one machine (Phase 22).
 *
 * Player one already answers to both the arrows and WASD, so the left half of
 * the keyboard is spoken for; this is the right hand — IJKL to walk, F to
 * swing, G for the B item. Players three and four are expected to bring
 * controllers, which is also why the pads are assigned by index rather than
 * merged from here on.
 *
 * No key appears in both sets: `options.test.js` checks that, because the
 * failure is one player driving both heroes and it is not obvious on sight.
 */
export const DEFAULT_BINDS_P2 = Object.freeze({
  up: Object.freeze(['KeyI']),
  down: Object.freeze(['KeyK']),
  left: Object.freeze(['KeyJ']),
  right: Object.freeze(['KeyL']),
  a: Object.freeze(['KeyF']),
  b: Object.freeze(['KeyG']),
  start: Object.freeze(['KeyH']),
  select: Object.freeze(['KeyY']),
});

/**
 * Player three on the numpad, so four can sit at one machine without
 * borrowing player one's arrows or player two's IJKL.
 */
export const DEFAULT_BINDS_P3 = Object.freeze({
  up: Object.freeze(['Numpad8']),
  down: Object.freeze(['Numpad5']),
  left: Object.freeze(['Numpad4']),
  right: Object.freeze(['Numpad6']),
  a: Object.freeze(['Numpad0']),
  b: Object.freeze(['NumpadDecimal']),
  start: Object.freeze(['NumpadAdd']),
  select: Object.freeze(['NumpadSubtract']),
});

/**
 * Player four on leftover punctuation. Pads are the expected device; these
 * keys exist so a fourth seat can be joined and driven in tests.
 */
export const DEFAULT_BINDS_P4 = Object.freeze({
  up: Object.freeze(['KeyP']),
  down: Object.freeze(['Semicolon']),
  left: Object.freeze(['Quote']),
  right: Object.freeze(['Backslash']),
  a: Object.freeze(['KeyN']),
  b: Object.freeze(['Minus']),
  start: Object.freeze(['Equal']),
  select: Object.freeze(['Digit0']),
});

/** Keyboard defaults per player number. */
export const DEFAULT_PLAYER_BINDS = Object.freeze([
  DEFAULT_BINDS,
  DEFAULT_BINDS_P2,
  DEFAULT_BINDS_P3,
  DEFAULT_BINDS_P4,
]);

/**
 * The pads one player reads.
 *
 * With nobody to share with, every pad drives the one hero — plug in whatever
 * you like and it works, which is the behaviour the game has always had. Once
 * a second player joins, a pad belongs to whoever claimed its slot, or nobody.
 *
 * @param {ArrayLike<object|null>} pads `navigator.getGamepads()`
 * @param {number|null} [index] the pad this player claimed
 */
export function padsForPlayer(pads, index = null) {
  const all = Array.from(pads ?? []).filter(Boolean);
  if (index == null) return all;
  const claimed = pads?.[index];
  return claimed ? [claimed] : [];
}

function cloneBinds(src = DEFAULT_BINDS) {
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]]));
}

/**
 * One player's keys, filled from a saved list and falling back per action
 * so a half-written remap cannot leave someone unable to walk.
 * @param {unknown} raw
 * @param {typeof DEFAULT_BINDS} [fallback]
 */
export function normalizeBinds(raw, fallback = DEFAULT_BINDS) {
  const out = cloneBinds(fallback);
  if (!raw || typeof raw !== 'object') return out;
  const binds = /** @type {Record<string, unknown>} */ (raw);
  for (const action of Object.keys(DEFAULT_BINDS)) {
    const list = binds[action];
    if (Array.isArray(list) && list.every((c) => typeof c === 'string') && list.length) {
      out[action] = [...list];
    }
  }
  return out;
}

/** Pad index each seat claims. `null` means "every pad", which is solo P1. */
export const DEFAULT_PAD_SLOTS = Object.freeze([null, 1, 2, 3]);

/**
 * @param {unknown} raw
 */
function normalizePadSlots(raw) {
  const out = [...DEFAULT_PAD_SLOTS];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < out.length; i += 1) {
    const v = raw[i];
    if (v == null) out[i] = null;
    else if (v === -1) out[i] = -1;
    else if (Number.isInteger(v) && v >= 0 && v <= 3) out[i] = v;
  }
  return out;
}

/**
 * The keys one seat reads.
 * @param {object} opts
 * @param {number} index
 */
export function bindsForPlayer(opts, index) {
  const i = Math.max(0, index | 0);
  return opts?.playerBinds?.[i] ?? DEFAULT_PLAYER_BINDS[i] ?? DEFAULT_BINDS;
}

/**
 * The pad sources one seat reads. Defaults are the Standard Gamepad slots.
 * @param {object} opts
 * @param {number} index
 */
export function padBindsForPlayer(opts, index) {
  const i = Math.max(0, index | 0);
  return opts?.playerPadBinds?.[i] ?? DEFAULT_PAD_BINDS;
}

/**
 * Restore one seat's keyboard and pad maps. Other seats stay as they are, and
 * the pad claim dropdown is left alone — that is which device, not the map.
 * @param {object} opts
 * @param {number} index
 */
export function resetPlayerControls(opts, index) {
  const i = Math.max(0, Math.min(DEFAULT_PLAYER_BINDS.length - 1, index | 0));
  const playerBinds = DEFAULT_PLAYER_BINDS.map((def, n) =>
    cloneBinds(opts?.playerBinds?.[n] ?? def),
  );
  const playerPadBinds = DEFAULT_PLAYER_BINDS.map((_, n) =>
    clonePadBinds(opts?.playerPadBinds?.[n] ?? DEFAULT_PAD_BINDS),
  );
  playerBinds[i] = cloneBinds(DEFAULT_PLAYER_BINDS[i]);
  playerPadBinds[i] = clonePadBinds();
  const patch = { ...opts, playerBinds, playerPadBinds };
  if (i === 0) patch.binds = cloneBinds(playerBinds[0]);
  return patch;
}

export const DEFAULT_OPTIONS = Object.freeze({
  /** @type {number | 'auto'} 1–6 or auto-fit */
  scale: 'auto',
  /** @type {'integer' | 'smooth'} */
  filter: 'integer',
  fullscreen: false,
  /**
   * Art set. The game draws the original NES tiles, byte for byte, and there
   * is no longer an alternative: the enhanced sets were withdrawn. Kept as an
   * option so saved settings from earlier builds still load, and so that
   * re-enabling an art set is a change here rather than across the renderer.
   * @type {'classic'}
   */
  graphics: 'classic',
});

/**
 * @param {unknown} raw
 */
export function normalizeOptions(raw) {
  const base = {
    scale: DEFAULT_OPTIONS.scale,
    filter: DEFAULT_OPTIONS.filter,
    fullscreen: false,
    graphics: DEFAULT_OPTIONS.graphics,
    binds: cloneBinds(),
    playerBinds: DEFAULT_PLAYER_BINDS.map((def) => cloneBinds(def)),
    playerPadBinds: DEFAULT_PLAYER_BINDS.map(() => clonePadBinds()),
    padSlots: [...DEFAULT_PAD_SLOTS],
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.scale === 'auto' || (typeof o.scale === 'number' && o.scale >= 1 && o.scale <= 6)) {
    base.scale = /** @type {number | 'auto'} */ (o.scale);
  }
  if (o.filter === 'integer' || o.filter === 'smooth') base.filter = o.filter;
  // Any saved value normalises to 'classic': a profile saved while the
  // enhanced set existed must not leave the game pointing at art that is no
  // longer served.
  base.graphics = DEFAULT_OPTIONS.graphics;
  base.fullscreen = Boolean(o.fullscreen);
  base.playerBinds = DEFAULT_PLAYER_BINDS.map((def, i) =>
    normalizeBinds(Array.isArray(o.playerBinds) ? o.playerBinds[i] : null, def),
  );
  // `binds` is the name the options screen has always written for player
  // one. A file that only has that field still remaps seat 0; a file that
  // only has `playerBinds` still fills the alias so older readers agree.
  if (o.binds && typeof o.binds === 'object') {
    base.binds = normalizeBinds(o.binds);
    base.playerBinds[0] = cloneBinds(base.binds);
  } else {
    base.binds = cloneBinds(base.playerBinds[0]);
  }
  base.padSlots = normalizePadSlots(o.padSlots);
  base.playerPadBinds = DEFAULT_PLAYER_BINDS.map((_, i) =>
    normalizePadBinds(Array.isArray(o.playerPadBinds) ? o.playerPadBinds[i] : null),
  );
  return base;
}

/**
 * @param {Storage | { getItem(k:string): string|null, setItem(k:string,v:string): void }} [storage]
 */
export function loadOptions(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(OPTIONS_KEY);
    if (!raw) return normalizeOptions(null);
    return normalizeOptions(JSON.parse(raw));
  } catch {
    return normalizeOptions(null);
  }
}

/**
 * @param {object} opts
 * @param {Storage | { setItem(k:string,v:string): void }} [storage]
 */
export function saveOptions(opts, storage = globalThis.localStorage) {
  const normalized = normalizeOptions(opts);
  storage.setItem(OPTIONS_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Human-readable key label for help text.
 * @param {string} code
 */
export function codeLabel(code) {
  if (isPadCode(code)) return padCodeLabel(code);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'NumpadEnter') return 'Enter';
  return code;
}
