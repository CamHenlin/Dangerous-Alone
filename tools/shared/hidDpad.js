/**
 * Chrome's Gamepad API mapper for DragonRise 0079:0011 ("2Axes 8Keys")
 * copies analog X/Y onto D-pad buttons 12–15 and then reports `axes.length
 * === 0`. On macOS the X axis never updates, so left/right vanish. Safari
 * maps the same hat to button 14. WebHID still sees the raw X/Y bytes.
 */

const NONE = Object.freeze({ up: false, down: false, left: false, right: false });

const DRAGONRISE_VID = 0x0079;
const DRAGONRISE_PID = 0x0011;

/** Joystick / game pad collections. Keyboards and mice stay out of the list. */
const HID_FILTERS = Object.freeze([
  { vendorId: DRAGONRISE_VID, productId: DRAGONRISE_PID },
  { vendorId: DRAGONRISE_VID },
  { usagePage: 0x01, usage: 0x04 },
  { usagePage: 0x01, usage: 0x05 },
]);

/** @type {{ up: boolean, down: boolean, left: boolean, right: boolean }} */
let overlay = { ...NONE };
/** @type {{ addEventListener: Function, removeEventListener: Function, open: Function, close: Function, opened?: boolean, vendorId?: number, productName?: string } | null} */
let device = null;
let lastRaw = '';

/**
 * @param {string} [id]
 */
export function padIdIsDragonRise0011(id) {
  return /Vendor:\s*0079/i.test(id ?? '') && /Product:\s*0011/i.test(id ?? '');
}

/**
 * Chrome mapped this pad, hid its axes, and left/right have nowhere to go.
 * @param {{ id?: string, axes?: ArrayLike<number> } | null | undefined} pad
 */
export function padHasStrippedDpad(pad) {
  if (!/Vendor:\s*0079/i.test(pad?.id ?? '')) return false;
  return (pad.axes?.length ?? 0) === 0;
}

function analogCentered(v) {
  return v >= 80 && v <= 175;
}

function xyDirs(x, y) {
  const dirs = { ...NONE };
  const ax = x & 0xff;
  const ay = y & 0xff;
  if (ax < 80) dirs.left = true;
  if (ax > 175) dirs.right = true;
  if (ay < 80) dirs.up = true;
  if (ay > 175) dirs.down = true;
  return dirs;
}

/**
 * Analog sticks as 8-bit unsigned, 127 at rest.
 *
 * Chrome's Mapper2Axes8Keys reads the first stick and drops the rest. On
 * 0079:0011 that first stick never moves (`7f 7f`); left/right live on the
 * second stick. Real reports from Chrome:
 *   rest  `01 7f 7f 7f 7f 0f 00 00`
 *   left  `01 7f 7f 00 7f 0f …`
 *   right `01 7f 7f ff 7f 0f …`
 *
 * @param {ArrayLike<number>} bytes
 */
export function parse2Axes8KeysDpad(bytes) {
  if (!bytes || bytes.length < 2) return { ...NONE };
  const at = (i) => bytes[i] & 0xff;
  let off = 0;
  // Report id in the payload (WebHID leaves reportId 0 and keeps the byte).
  if (bytes.length >= 3 && at(0) <= 4 && at(1) >= 16 && at(2) >= 16) {
    off = 1;
  }
  let x = at(off);
  let y = at(off + 1);
  if (analogCentered(x) && analogCentered(y) && bytes.length >= off + 4) {
    x = at(off + 2);
    y = at(off + 3);
  }
  return xyDirs(x, y);
}

export function hidDpadDirs() {
  return overlay;
}

export function hidDpadListening() {
  return device != null;
}

export function hidDpadDebugLine() {
  if (!device) return '';
  const held = ['up', 'down', 'left', 'right'].filter((k) => overlay[k]).join(' ') || '—';
  return `HID ${lastRaw || '(waiting for a report)'} · ${held}`;
}

function onReport(event) {
  const view = event.data;
  if (!view?.byteLength) return;
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  lastRaw = Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ');
  if (event.reportId) lastRaw = `id${event.reportId} ${lastRaw}`;
  overlay = parse2Axes8KeysDpad(bytes);
}

async function listen(next) {
  if (device && device !== next) {
    device.removeEventListener('inputreport', onReport);
    try {
      await device.close();
    } catch {
      /* already closed */
    }
  }
  device = next;
  lastRaw = '';
  if (!device) {
    overlay = { ...NONE };
    return;
  }
  if (!device.opened) await device.open();
  device.addEventListener('inputreport', onReport);
}

/**
 * Re-open a device the user already allowed (no chooser).
 */
export async function restoreHidDpad() {
  const hid = globalThis.navigator?.hid;
  if (!hid?.getDevices) return false;
  try {
    const granted = await hid.getDevices();
    const match = granted.find((d) => d.vendorId === DRAGONRISE_VID);
    if (!match) return false;
    await listen(match);
    return true;
  } catch {
    return false;
  }
}

/**
 * Chooser — must run from a user click. Vendor 0079 first so the list is
 * this USB pad instead of every HID gadget; joystick/gamepad usages are
 * a fallback if Chrome reports a different VID.
 *
 * @returns {Promise<{ ok: boolean, reason: string }>}
 */
export async function grantHidDpad() {
  const hid = globalThis.navigator?.hid;
  if (!hid) {
    return { ok: false, reason: 'This page has no WebHID (needs Chrome over http://localhost).' };
  }
  if (!hid.requestDevice) {
    return { ok: false, reason: 'This Chrome build cannot request HID devices.' };
  }
  try {
    const picked = await hid.requestDevice({ filters: [...HID_FILTERS] });
    const next = picked?.[0];
    if (!next) {
      return {
        ok: false,
        reason:
          'No device chosen. The picker is a bar at the TOP of the Chrome window — pick “USB Gamepad”. If that list was empty, unplug/replug the pad and try once more.',
      };
    }
    await listen(next);
    return {
      ok: true,
      reason: `Reading ${next.productName || 'USB Gamepad'} via HID. Hold left — the probe should say “left”.`,
    };
  } catch (err) {
    const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'HID request failed';
    return {
      ok: false,
      reason: `${msg} If Chrome already claimed this pad, unplug it, click the button, pick it, then plug it back in while this page stays open.`,
    };
  }
}
