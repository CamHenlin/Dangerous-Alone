import crypto from 'node:crypto';

/** Unsigned CRC-32 (IEEE), uppercase hex. */
export function crc32Hex(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function sha1Hex(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}
