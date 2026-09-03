/**
 * Persist the dropped ROM in localStorage.
 *
 * The extracted pack (JSON + images) is too large for typical quotas; the ROM
 * is ~131 KiB and is the source of every cartridge asset. Re-extract on boot.
 */

import { base64ToBytes, bytesToBase64 } from '@shared/bytes.js';

export const ROM_STORAGE_KEY = 'zelda_rom_v1';
export const ROM_STORAGE_VERSION = 1;

/**
 * @returns {Uint8Array | null}
 */
export function loadStoredRom() {
  try {
    const raw = localStorage.getItem(ROM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== ROM_STORAGE_VERSION || typeof parsed.b64 !== 'string') {
      return null;
    }
    return base64ToBytes(parsed.b64);
  } catch {
    return null;
  }
}

/**
 * @param {Uint8Array} bytes
 */
export function saveStoredRom(bytes) {
  const payload = JSON.stringify({
    v: ROM_STORAGE_VERSION,
    b64: bytesToBase64(bytes),
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(ROM_STORAGE_KEY, payload);
}

export function clearStoredRom() {
  localStorage.removeItem(ROM_STORAGE_KEY);
}
