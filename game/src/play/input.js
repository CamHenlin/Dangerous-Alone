import { DIR } from '@shared/collision.js';
import { DEFAULT_BINDS, padsForPlayer } from '@shared/options.js';
import { DEFAULT_PAD_BINDS, analogStickDirs, clonePadBinds, padFallbackDirs, padSourceActive, twinPadAxes } from '@shared/padBinds.js';
import { hidDpadDirs, hidDpadListening, padHasStrippedDpad } from '@shared/hidDpad.js';

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
 * Keyboard + Gamepad: dirs, A (sword), B (item), Start (inventory),
 * Select (cycle B / continue menu).
 * Keyboard and pad bindings are remappable via setBinds() / setPadBinds().
 */
export function createInput(
  initialBinds = DEFAULT_BINDS,
  { padIndex: initialPadIndex = null, padBinds: initialPadBinds = DEFAULT_PAD_BINDS } = {},
) {
  /** @type {Record<string, string[]>} */
  let binds = Object.fromEntries(
    Object.entries(initialBinds).map(([k, v]) => [k, [...v]]),
  );

  /** Claimed pad, or `null` to read every pad (the solo game). */
  let padIndex = initialPadIndex;

  /** @type {Record<string, string[]>} */
  let padBinds = clonePadBinds(initialPadBinds);

  /** @type {Set<string>} */
  const keys = new Set();
  let prevA = false;
  let prevB = false;
  let prevStart = false;
  let prevStartKey = false;
  let prevSelect = false;
  let prevDirMask = 0;
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

  /** This player's pads: all of them alone, exactly one in company. */
  function myPads() {
    return padsForPlayer(navigator.getGamepads?.() ?? [], padIndex);
  }

  function padActionDown(action) {
    const list = padBinds[action] ?? [];
    if (!list.length) return false;
    const hid = hidDpadDirs();
    for (const code of list) {
      if (padSourceActive(null, code, undefined, hid)) return true;
    }
    for (const gp of myPads()) {
      for (const code of list) {
        if (padSourceActive(gp, code, undefined, hid)) return true;
      }
    }
    return false;
  }

  function mergeDirs(mask, dirs) {
    let next = mask;
    if (dirs.up) next |= DIR.UP;
    if (dirs.down) next |= DIR.DOWN;
    if (dirs.left) next |= DIR.LEFT;
    if (dirs.right) next |= DIR.RIGHT;
    return next;
  }

  function gamepadDirs() {
    let mask = 0;
    if (padActionDown('up')) mask |= DIR.UP;
    if (padActionDown('down')) mask |= DIR.DOWN;
    if (padActionDown('left')) mask |= DIR.LEFT;
    if (padActionDown('right')) mask |= DIR.RIGHT;
    const allPads = navigator.getGamepads?.() ?? [];
    for (const gp of myPads()) {
      mask = mergeDirs(mask, padFallbackDirs(gp));
      if (padHasStrippedDpad(gp) || hidDpadListening()) {
        const twin = twinPadAxes(gp, allPads);
        if (twin) mask = mergeDirs(mask, analogStickDirs(twin));
        mask = mergeDirs(mask, hidDpadDirs());
      }
    }
    return mask;
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
    /**
     * @param {Record<string, string[]>} next
     */
    setPadBinds(next) {
      padBinds = clonePadBinds(next);
    },
    getBinds() {
      return Object.fromEntries(
        Object.entries(binds).map(([k, v]) => [k, [...v]]),
      );
    },
    /**
     * Who this device reads pads for. `null` is every pad — the solo game.
     * @param {number|null} index
     */
    setPadIndex(index) {
      padIndex = index;
    },
    getPadIndex() {
      return padIndex;
    },
    /** Select is held right now — Start+Select leave, which is not an edge. */
    holdingSelect() {
      return anyBound(binds.select ?? []) || padActionDown('select');
    },
    /** Start is held — Select must not cycle B while the leave combo is down. */
    holdingStart() {
      return anyBound(binds.start) || padActionDown('start');
    },
    /**
     * Direction bits that went down this frame. Menu L/R uses the edge so a
     * held stick does not fly through the B grid.
     */
    pressedDirs() {
      const down = keyboardMask() | gamepadDirs();
      const pressed = down & ~prevDirMask;
      prevDirMask = down;
      return pressed;
    },
    /** Currently held keyboard codes (for title-screen extras). */
    heldCodes() {
      return keys;
    },
    mask() {
      return keyboardMask() | gamepadDirs();
    },
    pressedA() {
      const down = anyBound(binds.a) || padActionDown('a');
      const pressed = down && !prevA;
      prevA = down;
      return pressed;
    },
    pressedB() {
      const down = anyBound(binds.b) || padActionDown('b');
      const pressed = down && !prevB;
      prevB = down;
      return pressed;
    },
    pressedStart() {
      const down = anyBound(binds.start) || padActionDown('start');
      const pressed = down && !prevStart;
      prevStart = down;
      return pressed;
    },
    /**
     * Keyboard Start only. Empty seats join from their own key (H, numpad
     * +, …). Gamepad Start sits one player down via spare pads, so one
     * controller must not fill every empty seat.
     */
    pressedStartKey() {
      const down = anyBound(binds.start);
      const pressed = down && !prevStartKey;
      prevStartKey = down;
      return pressed;
    },
    pressedSelect() {
      const down = anyBound(binds.select ?? []) || padActionDown('select');
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
