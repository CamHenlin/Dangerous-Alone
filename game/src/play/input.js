import { DIR } from '@shared/collision.js';
import { DEFAULT_BINDS } from '@shared/options.js';

const DIGIT_CODES = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Numpad1: 1,
  Numpad2: 2,
  Numpad3: 3,
  Numpad4: 4,
};

/**
 * Keyboard + Gamepad: dirs, A (sword), B (item), Start (inventory).
 * Bindings are remappable via setBinds().
 */
export function createInput(initialBinds = DEFAULT_BINDS) {
  /** @type {Record<string, string[]>} */
  let binds = Object.fromEntries(
    Object.entries(initialBinds).map(([k, v]) => [k, [...v]]),
  );

  /** @type {Set<string>} */
  const keys = new Set();
  let prevA = false;
  let prevB = false;
  let prevStart = false;
  let prevSelect = false;
  /** @type {Set<number>} */
  const prevDigits = new Set();

  function dirCodeMap() {
    /** @type {Record<string, number>} */
    const map = {};
    for (const code of binds.up) map[code] = DIR.UP;
    for (const code of binds.down) map[code] = DIR.DOWN;
    for (const code of binds.left) map[code] = DIR.LEFT;
    for (const code of binds.right) map[code] = DIR.RIGHT;
    return map;
  }

  function isTracked(code) {
    const dirs = dirCodeMap();
    return (
      code in dirs
      || code in DIGIT_CODES
      || binds.a.includes(code)
      || binds.b.includes(code)
      || binds.start.includes(code)
      || (binds.select ?? []).includes(code)
      // Title / audio extras (always observed).
      || code === 'KeyE'
      || code === 'KeyN'
      || code === 'KeyR'
      || code === 'KeyO'
      || code === 'KeyM'
      || code === 'Comma'
      || code === 'Period'
      || code === 'Enter'
      || code === 'NumpadEnter'
    );
  }

  const onDown = (e) => {
    if (isTracked(e.code)) {
      e.preventDefault();
      keys.add(e.code);
    }
  };
  const onUp = (e) => {
    keys.delete(e.code);
  };

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  function keyboardMask() {
    const dirs = dirCodeMap();
    let mask = 0;
    for (const code of keys) {
      mask |= dirs[code] ?? 0;
    }
    return mask;
  }

  function gamepadDirs() {
    const pads = navigator.getGamepads?.() ?? [];
    let mask = 0;
    for (const pad of pads) {
      if (!pad) continue;
      if (pad.buttons[12]?.pressed) mask |= DIR.UP;
      if (pad.buttons[13]?.pressed) mask |= DIR.DOWN;
      if (pad.buttons[14]?.pressed) mask |= DIR.LEFT;
      if (pad.buttons[15]?.pressed) mask |= DIR.RIGHT;
      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      const dead = 0.45;
      if (ly < -dead) mask |= DIR.UP;
      if (ly > dead) mask |= DIR.DOWN;
      if (lx < -dead) mask |= DIR.LEFT;
      if (lx > dead) mask |= DIR.RIGHT;
    }
    return mask;
  }

  function gamepadButton(index) {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (pad?.buttons[index]?.pressed) return true;
    }
    return false;
  }

  function anyBound(list) {
    return list.some((code) => keys.has(code));
  }

  return {
    /**
     * @param {Record<string, string[]>} next
     */
    setBinds(next) {
      binds = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, [...v]]),
      );
    },
    getBinds() {
      return Object.fromEntries(
        Object.entries(binds).map(([k, v]) => [k, [...v]]),
      );
    },
    /** Currently held keyboard codes (for title-screen extras). */
    heldCodes() {
      return keys;
    },
    mask() {
      return keyboardMask() | gamepadDirs();
    },
    pressedA() {
      const down = anyBound(binds.a) || gamepadButton(0);
      const pressed = down && !prevA;
      prevA = down;
      return pressed;
    },
    pressedB() {
      const down = anyBound(binds.b) || gamepadButton(1);
      const pressed = down && !prevB;
      prevB = down;
      return pressed;
    },
    pressedStart() {
      const down = anyBound(binds.start) || gamepadButton(9);
      const pressed = down && !prevStart;
      prevStart = down;
      return pressed;
    },
    pressedSelect() {
      const down = anyBound(binds.select ?? []) || gamepadButton(8);
      const pressed = down && !prevSelect;
      prevSelect = down;
      return pressed;
    },
    /** Edge-triggered digit 1–4 (cave shop slots / take-any-road). */
    pressedDigit() {
      let hit = 0;
      const down = new Set();
      for (const [code, n] of Object.entries(DIGIT_CODES)) {
        if (keys.has(code)) {
          down.add(n);
          if (!prevDigits.has(n) && !hit) hit = n;
        }
      }
      prevDigits.clear();
      for (const n of down) prevDigits.add(n);
      return hit;
    },
    /** Raw edge for title UI (code just pressed). */
    justPressed(code) {
      return keys.has(code);
    },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    },
  };
}
