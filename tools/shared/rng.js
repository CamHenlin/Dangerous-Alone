/**
 * Seeded PRNG for deterministic replay / tests.
 * Mulberry32 — small, fast, good enough for game RNG injection.
 */

/**
 * @param {number} seed
 * @returns {() => number} float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} seed
 * @returns {(max: number) => number} integer in [0, max)
 */
export function createIntRng(seed) {
  const next = mulberry32(seed);
  return (max) => {
    const n = Math.max(0, Math.floor(max));
    if (n <= 0) return 0;
    return Math.floor(next() * n);
  };
}

/**
 * @param {number} seed
 * @returns {() => boolean} fair coin
 */
export function createCoinRng(seed) {
  const next = mulberry32(seed ^ 0xa5a5a5a5);
  return () => next() < 0.5;
}

/**
 * NES-style random byte (0–255), for DropItemRates compares.
 * @param {number} seed
 * @returns {() => number}
 */
export function createByteRng(seed) {
  const next = mulberry32(seed ^ 0x5a5a5a5a);
  return () => (next() * 256) & 0xff;
}
