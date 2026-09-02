/**
 * Node-only cryptographic hashes. The browser extract path uses CRC-32 from
 * `hash.js` and never imports this file.
 */
import crypto from 'node:crypto';

export function sha1Hex(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}
