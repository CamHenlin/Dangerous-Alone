/**
 * Player options (scale, filter, keybinds) persisted in localStorage.
 */

export const OPTIONS_KEY = 'zelda_options';

export const DEFAULT_BINDS = Object.freeze({
  up: Object.freeze(['ArrowUp', 'KeyW']),
  down: Object.freeze(['ArrowDown', 'KeyS']),
  left: Object.freeze(['ArrowLeft', 'KeyA']),
  right: Object.freeze(['ArrowRight', 'KeyD']),
  a: Object.freeze(['KeyZ', 'Space']),
  b: Object.freeze(['KeyX', 'KeyC', 'KeyB']),
  start: Object.freeze(['Enter', 'NumpadEnter', 'Escape', 'ShiftLeft', 'ShiftRight']),
  /** NES Select — only the continue question reads it. */
  select: Object.freeze(['Tab', 'Backquote']),
});

function cloneBinds(src = DEFAULT_BINDS) {
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]]));
}

export const DEFAULT_OPTIONS = Object.freeze({
  /** @type {number | 'auto'} 1–6 or auto-fit */
  scale: 'auto',
  /** @type {'integer' | 'smooth'} */
  filter: 'integer',
  fullscreen: false,
});

/**
 * @param {unknown} raw
 */
export function normalizeOptions(raw) {
  const base = {
    scale: DEFAULT_OPTIONS.scale,
    filter: DEFAULT_OPTIONS.filter,
    fullscreen: false,
    binds: cloneBinds(),
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.scale === 'auto' || (typeof o.scale === 'number' && o.scale >= 1 && o.scale <= 6)) {
    base.scale = /** @type {number | 'auto'} */ (o.scale);
  }
  if (o.filter === 'integer' || o.filter === 'smooth') base.filter = o.filter;
  base.fullscreen = Boolean(o.fullscreen);
  if (o.binds && typeof o.binds === 'object') {
    const binds = /** @type {Record<string, unknown>} */ (o.binds);
    for (const action of Object.keys(DEFAULT_BINDS)) {
      const list = binds[action];
      if (Array.isArray(list) && list.every((c) => typeof c === 'string') && list.length) {
        base.binds[action] = [...list];
      }
    }
  }
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
