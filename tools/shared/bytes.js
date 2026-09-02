/**
 * Byte helpers that work with Uint8Array in both Node and the browser.
 * Extracted ROM slices used to be `Buffer.from(...)`; that is Node-only.
 */

/**
 * Copy a byte range into a standalone Uint8Array.
 * @param {Uint8Array|ArrayBuffer|number[]} src
 * @param {number} [start]
 * @param {number} [end]
 */
export function copyBytes(src, start = 0, end = src.length) {
  const view = src instanceof Uint8Array ? src : new Uint8Array(src);
  return Uint8Array.from(view.subarray(start, end));
}

/**
 * @param {Uint8Array|number[]} bytes
 */
export function bytesToAscii(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += String.fromCharCode(bytes[i] & 0xff);
  }
  return s;
}

/**
 * Lowercase hex, no 0x prefix.
 * @param {Uint8Array|number[]} bytes
 */
export function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    s += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * @param {Uint8Array} bytes
 */
export function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
