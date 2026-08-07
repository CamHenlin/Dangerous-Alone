/**
 * Decode LoZ NES PersonText / cave dialogue (bank-1 @ CPU $8000).
 *
 * High 2 bits are line control (not a simple terminator):
 *   $00 = continue on same line
 *   $80 = end of line → next line
 *   $40 / $C0 = end of message
 * Character tile uses low 6 bits ($00–$3F).
 */

const CHAR = {
  0x24: ' ',
  0x25: ' ',
  0x2c: ' ',
  0x28: '!',
  0x29: '!',
  0x2e: ',',
  0x2f: '.',
  0x3f: '?',
  0x2a: "'",
  0x2d: "'",
};

/**
 * @param {number} tile low 6 bits
 */
function charFromTile(tile) {
  const c = tile & 0x3f;
  if (CHAR[c] != null) return CHAR[c];
  if (c <= 9) return String(c);
  if (c >= 0x0a && c <= 0x23) return String.fromCharCode(65 + (c - 0x0a));
  return '';
}

/**
 * @param {Uint8Array | Buffer} prg
 * @param {number} cpuAddr
 * @param {number} [bankPrgBase=0x4000]
 * @returns {string[]}
 */
export function decodeCaveLines(prg, cpuAddr, bankPrgBase = 0x4000) {
  let off = bankPrgBase + (cpuAddr - 0x8000);
  /** @type {string[]} */
  const lines = [''];
  let li = 0;
  for (let i = 0; i < 160; i += 1) {
    const raw = prg[off + i];
    if (raw === undefined) break;
    if (raw === 0xff && i === 0) return [];
    const flags = raw & 0xc0;
    lines[li] += charFromTile(raw);
    if (flags === 0x80) {
      li += 1;
      lines.push('');
    } else if (flags === 0x40 || flags === 0xc0) {
      break;
    }
  }
  return lines.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * @param {Uint8Array | Buffer} prg
 * @param {number} cpuAddr
 * @param {number} [bankPrgBase=0x4000]
 */
export function decodeCaveString(prg, cpuAddr, bankPrgBase = 0x4000) {
  return decodeCaveLines(prg, cpuAddr, bankPrgBase).join(' ');
}

/**
 * @param {Uint8Array | Buffer} prg
 * @param {number} textId even index from cave textFlags low 6 bits
 * @param {{ textPointersPrg?: number, bankPrgBase?: number }} [opts]
 * @returns {string[]}
 */
export function linesForTextId(prg, textId, opts = {}) {
  const ptrBase = opts.textPointersPrg ?? 0x4000;
  const bankBase = opts.bankPrgBase ?? 0x4000;
  const idx = (textId & 0x3f) >> 1;
  const lo = prg[ptrBase + idx * 2];
  const hi = prg[ptrBase + idx * 2 + 1];
  const cpu = lo | (hi << 8);
  return decodeCaveLines(prg, cpu, bankBase);
}

/**
 * @param {Uint8Array | Buffer} prg
 * @param {number} textId
 * @param {{ textPointersPrg?: number, bankPrgBase?: number }} [opts]
 */
export function stringForTextId(prg, textId, opts = {}) {
  return linesForTextId(prg, textId, opts).join(' ');
}
