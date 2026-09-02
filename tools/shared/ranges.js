import { copyBytes } from './bytes.js';

/**
 * Parse a hex/decimal integer string or number.
 * @param {string|number} value
 */
export function parseOffset(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid offset number: ${value}`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid offset type: ${typeof value}`);
  }
  const trimmed = value.trim().toLowerCase();
  const n = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid offset: ${value}`);
  }
  return n;
}

/**
 * Normalize a range entry from rom_ranges.json.
 * @param {object} range
 */
export function normalizeRange(range) {
  const start = parseOffset(range.prg_start);
  const endInclusive = parseOffset(range.prg_end_inclusive);
  if (endInclusive < start) {
    throw new Error(`Range ${range.id}: end < start`);
  }
  return {
    id: range.id,
    description: range.description ?? '',
    source: range.source ?? '',
    trust: range.trust ?? 'unverified',
    prgStart: start,
    prgEndInclusive: endInclusive,
    length: endInclusive - start + 1,
  };
}

/**
 * Slice PRG for a normalized range.
 * @param {Uint8Array} prg
 * @param {{ id: string, prgStart: number, prgEndInclusive: number, length: number }} range
 */
export function sliceRange(prg, range) {
  if (range.prgEndInclusive >= prg.length) {
    throw new Error(
      `Range ${range.id} ends at 0x${range.prgEndInclusive.toString(16)} but PRG is only 0x${prg.length.toString(16)} bytes`,
    );
  }
  return copyBytes(prg, range.prgStart, range.prgEndInclusive + 1);
}
