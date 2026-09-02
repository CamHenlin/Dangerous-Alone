/**
 * Gamepad sources, stored as strings next to keyboard codes.
 *
 * The browser's Standard Gamepad layout is only a default. Cheap pads and
 * D-input modes often put the D-pad on other buttons or axes, so each seat
 * can remap these the same way it remaps keys.
 */

/** Same deadzone the original stick path used. */
export const PAD_DEADZONE = 0.45;

/** @param {number} i */
export function padBtn(i) {
  return `PadBtn:${i | 0}`;
}

/**
 * @param {number} i
 * @param {number} sign negative = low end of the axis
 */
export function padAxis(i, sign) {
  return `PadAxis:${i | 0}${sign < 0 ? '-' : '+'}`;
}

/**
 * @param {'up' | 'down' | 'left' | 'right'} dir
 */
export function hidDpad(dir) {
  return `HidDpad:${dir}`;
}

const HID_DPAD_DIRS = Object.freeze(['up', 'down', 'left', 'right']);

/**
 * @param {{ up?: boolean, down?: boolean, left?: boolean, right?: boolean } | null | undefined} dirs
 */
export function hidDpadCodesFromDirs(dirs) {
  return HID_DPAD_DIRS.filter((d) => dirs?.[d]).map(hidDpad);
}

export const DEFAULT_PAD_BINDS = Object.freeze({
  up: Object.freeze([padBtn(12), padAxis(1, -1)]),
  down: Object.freeze([padBtn(13), padAxis(1, 1)]),
  left: Object.freeze([padBtn(14), padAxis(0, -1)]),
  right: Object.freeze([padBtn(15), padAxis(0, 1)]),
  a: Object.freeze([padBtn(0)]),
  b: Object.freeze([padBtn(1)]),
  start: Object.freeze([padBtn(9)]),
  select: Object.freeze([padBtn(8)]),
});

const BTN_LABELS = Object.freeze([
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Select',
  'Start',
  'L3',
  'R3',
  '↑',
  '↓',
  '←',
  '→',
]);

const AXIS_LABELS = Object.freeze({
  '0-': 'Stick ←',
  '0+': 'Stick →',
  '1-': 'Stick ↑',
  '1+': 'Stick ↓',
  '2-': 'RS ←',
  '2+': 'RS →',
  '3-': 'RS ↑',
  '3+': 'RS ↓',
});

/**
 * @param {unknown} code
 */
export function isPadCode(code) {
  return typeof code === 'string' && (code.startsWith('PadBtn:') || code.startsWith('PadAxis:') || code.startsWith('HidDpad:'));
}

/**
 * @param {unknown} code
 */
export function validPadCode(code) {
  return typeof code === 'string' && (/^PadBtn:\d+$/.test(code) || /^PadAxis:\d+[+-]$/.test(code) || /^HidDpad:(up|down|left|right)$/.test(code));
}

/**
 * @param {typeof DEFAULT_PAD_BINDS} [src]
 */
export function clonePadBinds(src = DEFAULT_PAD_BINDS) {
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]]));
}

/**
 * @param {unknown} raw
 * @param {typeof DEFAULT_PAD_BINDS} [fallback]
 */
export function normalizePadBinds(raw, fallback = DEFAULT_PAD_BINDS) {
  const out = clonePadBinds(fallback);
  if (!raw || typeof raw !== 'object') return out;
  const binds = /** @type {Record<string, unknown>} */ (raw);
  for (const action of Object.keys(DEFAULT_PAD_BINDS)) {
    const list = binds[action];
    if (Array.isArray(list) && list.length && list.every(validPadCode)) {
      out[action] = [...list];
    }
  }
  return out;
}

/**
 * @param {string} code
 */
export function padCodeLabel(code) {
  const btn = /^PadBtn:(\d+)$/.exec(code);
  if (btn) {
    const i = Number(btn[1]);
    const name = BTN_LABELS[i];
    return name ? `Pad ${name}` : `Btn ${i}`;
  }
  const axis = /^PadAxis:(\d+)([+-])$/.exec(code);
  if (axis) {
    const named = AXIS_LABELS[`${axis[1]}${axis[2]}`];
    if (named) return named;
    return `Axis ${axis[1]}${axis[2] === '-' ? '−' : '+'}`;
  }
  const hid = /^HidDpad:(up|down|left|right)$/.exec(code);
  if (hid) {
    return `HID ${{ up: '↑', down: '↓', left: '←', right: '→' }[hid[1]]}`;
  }
  return code;
}

/**
 * Some pads report a held D-pad as `value` without flipping `pressed`.
 * @param {{ pressed?: boolean, value?: number } | null | undefined} btn
 */
export function padButtonDown(btn) {
  if (!btn) return false;
  if (btn.pressed || btn.touched) return true;
  const v = btn.value ?? 0;
  return v >= 0.5 || v <= -0.5;
}

/**
 * @param {{ buttons?: ArrayLike<{ pressed?: boolean, value?: number } | null | undefined>, axes?: ArrayLike<number> } | null | undefined} pad
 * @param {string} code
 * @param {number} [dead]
 */
export function padSourceActive(pad, code, dead = PAD_DEADZONE, hidDirs) {
  const hid = /^HidDpad:(up|down|left|right)$/.exec(code);
  if (hid) return Boolean(hidDirs?.[hid[1]]);
  if (!pad || !validPadCode(code)) return false;
  const btn = /^PadBtn:(\d+)$/.exec(code);
  if (btn) return padButtonDown(pad.buttons?.[Number(btn[1])]);
  const axis = /^PadAxis:(\d+)([+-])$/.exec(code);
  if (!axis) return false;
  const v = pad.axes?.[Number(axis[1])] ?? 0;
  return axis[2] === '-' ? v <= -dead : v >= dead;
}

const NONE_DIRS = Object.freeze({ up: false, down: false, left: false, right: false });

/**
 * POV / hat D-pad on one axis. Safari remaps this to buttons 12–15; Chrome
 * often leaves the raw hat, so left/right never show up as those buttons.
 *
 * Chromium's `DpadFromAxis`: -1 is up, then clockwise to 1 (up+left). Idle
 * is a value > 1 (commonly ~1.28). 0 is "no data", not up.
 *
 * @param {number} dir
 */
export function povHatDirs(dir) {
  if (!Number.isFinite(dir) || dir === 0) return { ...NONE_DIRS };
  return {
    up: (dir >= -1 && dir < -0.7) || (dir >= 0.95 && dir <= 1),
    right: dir >= -0.75 && dir < -0.1,
    down: dir >= -0.2 && dir < 0.45,
    left: dir >= 0.4 && dir <= 1,
  };
}

/**
 * 8-way D-pad from an octant. 0 is up, then clockwise.
 * @param {number} oct
 */
function octantDirs(oct) {
  const n = ((oct % 8) + 8) % 8;
  return {
    up: n === 0 || n === 1 || n === 7,
    right: n === 1 || n === 2 || n === 3,
    down: n === 3 || n === 4 || n === 5,
    left: n === 5 || n === 6 || n === 7,
  };
}

function mergeDirs(into, extra) {
  into.up = dirsTrue(into.up, extra.up);
  into.down = dirsTrue(into.down, extra.down);
  into.left = dirsTrue(into.left, extra.left);
  into.right = dirsTrue(into.right, extra.right);
}

function dirsTrue(a, b) {
  return Boolean(a || b);
}

/**
 * Decode one extra axis that Safari already turned into D-pad buttons.
 * Tries Chromium's -1…1 hat, integer 0–7 hats, and DirectInput degrees.
 *
 * @param {number} v
 */
export function extraAxisDirs(v) {
  const dirs = { ...NONE_DIRS };
  if (!Number.isFinite(v)) return dirs;
  if (v > 1.05 && v < 1.55) return dirs;
  if (v >= -1 && v <= 1) mergeDirs(dirs, povHatDirs(v));
  if (v >= 0.5 && v <= 7.5 && Math.abs(v - Math.round(v)) < 0.1) {
    mergeDirs(dirs, octantDirs(Math.round(v)));
  }
  if (v > 8 && v <= 360) mergeDirs(dirs, octantDirs(Math.round(v / 45)));
  if (v > 360 && v <= 36000) mergeDirs(dirs, octantDirs(Math.round(v / 4500)));
  return dirs;
}

/**
 * @param {{ axes?: ArrayLike<number> } | null | undefined} pad
 * @param {number} i
 */
export function padAxisAt(pad, i) {
  const v = pad?.axes?.[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Stick X/Y in −1…1. Idle POV hats sit above 1 and must not count as right.
 *
 * @param {ArrayLike<number> | null | undefined} axes
 * @param {number} [dead]
 */
export function analogStickDirs(axes, dead = PAD_DEADZONE) {
  const dirs = { ...NONE_DIRS };
  applyAnalogStick(dirs, axes?.[0], axes?.[1], dead);
  return dirs;
}

/**
 * Chrome sometimes exposes a second Gamepad slot with the axes the mapped
 * slot deleted.
 *
 * @param {object | null | undefined} pad
 * @param {ArrayLike<object | null | undefined> | null | undefined} allPads
 */
export function twinPadAxes(pad, allPads) {
  for (const p of allPads ?? []) {
    if (!p || p === pad) continue;
    if ((p.axes?.length ?? 0) >= 2) return p.axes;
  }
  return null;
}

function applyAnalogStick(dirs, x, y, dead) {
  if (typeof x === 'number' && x >= -1.05 && x <= 1.05) {
    if (x <= -dead) dirs.left = true;
    if (x >= dead) dirs.right = true;
  }
  if (typeof y === 'number' && y >= -1.05 && y <= 1.05) {
    if (y <= -dead) dirs.up = true;
    if (y >= dead) dirs.down = true;
  }
}

/**
 * Directions the Standard Gamepad slots miss. Chrome on macOS often leaves
 * the D-pad as a hat or extra axes; Safari remaps those to buttons 12–15.
 *
 * @param {{ mapping?: string, axes?: ArrayLike<number> } | null | undefined} pad
 * @param {number} [dead]
 */
export function padFallbackDirs(pad, dead = PAD_DEADZONE) {
  const dirs = { ...NONE_DIRS };
  const axisCount = pad?.axes?.length ?? 0;
  // Mapped 0079 pads report length 0; Chrome may still keep X at index 0.
  if (axisCount === 0) {
    applyAnalogStick(dirs, padAxisAt(pad, 0), padAxisAt(pad, 1), dead);
  }
  const axes = pad?.axes ? Array.from(pad.axes) : [];
  // Safari remaps hats onto the standard slots. Chrome often leaves the
  // raw HID axes, including X/Y on 0/1 when mapping is empty.
  const start = pad?.mapping === 'standard' ? 4 : 0;
  for (let i = start; i < axes.length; i += 1) {
    const v = axes[i] ?? 0;
    mergeDirs(dirs, extraAxisDirs(v));
    if (v > 1.05) continue;
    const integerHat = v >= 0.5 && v <= 7.5 && Math.abs(v - Math.round(v)) < 0.1;
    if (integerHat) continue;
    if (i % 2 === 0) {
      if (v <= -dead) dirs.left = true;
      if (v >= dead) dirs.right = true;
    } else if (start > 0 || i >= 2) {
      if (v <= -dead) dirs.up = true;
      if (v >= dead) dirs.down = true;
    }
  }
  return dirs;
}

/**
 * Live readout for the options screen, so a Chrome vs Safari mapping
 * mismatch is visible instead of a silent dead D-pad.
 *
 * @param {{ id?: string, mapping?: string, buttons?: ArrayLike<{ pressed?: boolean, value?: number } | null | undefined>, axes?: ArrayLike<number> } | null | undefined} pad
 */
export function formatPadProbe(pad) {
  if (!pad) return 'No pad in this slot — press a button on the controller.';
  const id = String(pad.id || 'Gamepad').slice(0, 72);
  const mapping = pad.mapping || 'raw';
  const buttons = pad.buttons ?? [];
  const held = [];
  for (let i = 0; i < buttons.length; i += 1) {
    if (padButtonDown(buttons[i])) held.push(String(i));
  }
  const axes = pad.axes ? Array.from(pad.axes) : [];
  const ax = axes.map((v, i) => `${i}:${Number(v).toFixed(2)}`).join(' ');
  const dpad = [12, 13, 14, 15]
    .map((i) => {
      const b = buttons[i];
      const v = b?.value ?? 0;
      const flags = `${b?.pressed ? 'p' : ''}${b?.touched ? 't' : ''}`;
      return `${i}:${Number(v).toFixed(2)}${flags ? `/${flags}` : ''}`;
    })
    .join(' ');
  let axLine = ax || 'no axes';
  if (!axes.length) {
    const peek = [];
    for (let i = 0; i < 4; i += 1) {
      const v = padAxisAt(pad, i);
      if (v != null) peek.push(`${i}:${v.toFixed(2)}`);
    }
    if (peek.length) axLine = `length 0 but ${peek.join(' ')}`;
  }
  return `${id}\n${mapping} · ${buttons.length} buttons · ${axes.length} axes\nB ${held.join(' ') || '—'}\n${axLine}\nD-pad ${dpad}`;
}

/**
 * @param {ArrayLike<{ buttons?: ArrayLike<unknown>, axes?: ArrayLike<number> } | null | undefined> | null | undefined} list
 */
export function formatGamepadSlots(list) {
  const n = Math.max(4, list?.length ?? 0);
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const p = list?.[i];
    if (!p) {
      parts.push(`${i}:—`);
      continue;
    }
    parts.push(`${i}:${p.buttons?.length ?? 0}b/${p.axes?.length ?? 0}ax`);
  }
  return `slots ${parts.join('  ')}`;
}

/**
 * Every button and axis that is down right now.
 * @param {{ buttons?: ArrayLike<{ pressed?: boolean, value?: number } | null | undefined>, axes?: ArrayLike<number> } | null | undefined} pad
 * @param {number} [dead]
 */
export function activePadSources(pad, dead = PAD_DEADZONE) {
  /** @type {string[]} */
  const out = [];
  const buttons = pad?.buttons ?? [];
  for (let i = 0; i < buttons.length; i += 1) {
    if (padButtonDown(buttons[i])) out.push(padBtn(i));
  }
  const axes = pad?.axes ?? [];
  for (let i = 0; i < axes.length; i += 1) {
    const v = axes[i] ?? 0;
    if (v > 1.05) continue;
    if (v <= -dead) out.push(padAxis(i, -1));
    else if (v >= dead) out.push(padAxis(i, 1));
  }
  return out;
}

/**
 * First newly held pad source. Buttons beat axes so a face press still
 * binds when the stick is drifting.
 *
 * @param {ArrayLike<{ buttons?: ArrayLike<{ pressed?: boolean, value?: number } | null | undefined>, axes?: ArrayLike<number> } | null | undefined>} pads
 * @param {Set<string>} [baseline] sources that were already down when listening started
 * @param {number} [dead]
 */
export function newPadSource(pads, baseline = new Set(), dead = PAD_DEADZONE, extraCodes = []) {
  let axisCode = null;
  let axisMag = dead;
  for (const pad of pads ?? []) {
    if (!pad) continue;
    const buttons = pad.buttons ?? [];
    for (let i = 0; i < buttons.length; i += 1) {
      const code = padBtn(i);
      if (baseline.has(code)) continue;
      if (padButtonDown(buttons[i])) return code;
    }
  }
  for (const code of extraCodes) {
    if (code && !baseline.has(code)) return code;
  }
  for (const pad of pads ?? []) {
    if (!pad) continue;
    const axes = pad.axes ?? [];
    for (let i = 0; i < axes.length; i += 1) {
      const v = axes[i] ?? 0;
      if (v > 1.05) continue;
      const mag = Math.abs(v);
      if (mag < dead) continue;
      const code = padAxis(i, v < 0 ? -1 : 1);
      if (baseline.has(code)) continue;
      if (mag > axisMag) {
        axisMag = mag;
        axisCode = code;
      }
    }
  }
  return axisCode;
}
