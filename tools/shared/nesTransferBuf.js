/**
 * NES PPU "transfer buffer" records — `ContinueTransferTileBuf` @ `Z_06.asm:578`.
 *
 * A record is `[addrHi, addrLo, ctrl, data…]`:
 *   - `ctrl` bit 7 → PPUCTRL bit 2, i.e. the VRAM pointer steps by 32 per write.
 *   - `ctrl` bit 6 → the record carries one byte that is written `count` times.
 *   - `ctrl` bits 5–0 → the write count; zero means 64 (the `BNE`/`SEC` fixup
 *     that rotates a set carry back into the count).
 * The buffer ends at the first byte with bit 7 set (`BPL` guard on addrHi).
 */

const NAMETABLE_BYTES = 0x400;

/**
 * @typedef {object} TransferRecord
 * @property {number} addr VRAM destination
 * @property {boolean} vertical 32-byte VRAM stride
 * @property {boolean} repeat single byte written `count` times
 * @property {number} count
 * @property {number[]} data
 * @property {number} offset byte index of the record within `bytes`
 */

/**
 * @param {Uint8Array} bytes
 * @param {number} [start]
 * @returns {{ records: TransferRecord[], end: number }} `end` indexes the terminator
 */
export function decodeTransferRecords(bytes, start = 0) {
  /** @type {TransferRecord[]} */
  const records = [];
  let i = start;
  while (i < bytes.length) {
    const hi = bytes[i];
    if (hi & 0x80) break;
    const lo = bytes[i + 1];
    const ctrl = bytes[i + 2];
    const vertical = Boolean(ctrl & 0x80);
    const repeat = Boolean(ctrl & 0x40);
    const count = (ctrl & 0x3f) || 64;
    const dataLen = repeat ? 1 : count;
    if (i + 3 + dataLen > bytes.length) {
      throw new Error(`Transfer record at ${i} runs past the buffer`);
    }
    records.push({
      addr: (hi << 8) | lo,
      vertical,
      repeat,
      count,
      data: [...bytes.subarray(i + 3, i + 3 + dataLen)],
      offset: i,
    });
    i += 3 + dataLen;
  }
  return { records, end: i };
}

/**
 * Replay records into one 1KB nametable image (960 tiles + 64 attribute bytes).
 * Writes outside `[base, base + $400)` are ignored, which drops the handful of
 * records that target the *other* nametable.
 *
 * @param {TransferRecord[]} records
 * @param {number} [base] nametable base VRAM address
 * @returns {{ tiles: Uint8Array, attrs: Uint8Array }}
 */
export function nametableFromRecords(records, base = 0x2000) {
  const vram = new Uint8Array(NAMETABLE_BYTES);
  for (const record of records) {
    let offset = record.addr - base;
    if (offset < 0 || offset >= NAMETABLE_BYTES) continue;
    const step = record.vertical ? 32 : 1;
    for (let k = 0; k < record.count; k += 1) {
      if (offset < 0 || offset >= NAMETABLE_BYTES) break;
      vram[offset] = record.repeat ? record.data[0] : record.data[k];
      offset += step;
    }
  }
  return { tiles: vram.subarray(0, 0x3c0), attrs: vram.subarray(0x3c0) };
}

/**
 * Palette row (0–3) for a tile cell, from the 64-byte attribute table.
 * @param {ArrayLike<number>} attrs
 * @param {number} col 0–31
 * @param {number} row 0–29
 */
export function attrPaletteAt(attrs, col, row) {
  const byte = attrs[(row >> 2) * 8 + (col >> 2)] ?? 0;
  const shift = ((row & 2) << 1) | (col & 2);
  return (byte >> shift) & 3;
}
