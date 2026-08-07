import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attrPaletteAt, decodeTransferRecords, nametableFromRecords } from './nesTransferBuf.js';

test('decodeTransferRecords reads a sequential run', () => {
  const { records, end } = decodeTransferRecords(
    Uint8Array.from([0x20, 0x40, 0x03, 0x0a, 0x0b, 0x0c, 0xff]),
  );
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    addr: 0x2040,
    vertical: false,
    repeat: false,
    count: 3,
    data: [0x0a, 0x0b, 0x0c],
    offset: 0,
  });
  assert.equal(end, 6);
});

test('decodeTransferRecords honours the repeat and vertical control bits', () => {
  const { records } = decodeTransferRecords(
    // Second record is StatusBarStaticsTransferBuf's `$20 $8F $C2 $6C`.
    Uint8Array.from([0x23, 0xc0, 0x7f, 0x00, 0x20, 0x8f, 0xc2, 0x6c, 0xff]),
  );
  assert.deepEqual(
    records.map((r) => [r.addr, r.repeat, r.vertical, r.count]),
    [
      [0x23c0, true, false, 63],
      [0x208f, true, true, 2],
    ],
  );
});

// `CLC / BNE / SEC / ROR / LSR` turns a zero count field into 64.
test('decodeTransferRecords treats a zero count as 64', () => {
  const bytes = new Uint8Array(3 + 64);
  bytes[0] = 0x20;
  bytes[1] = 0x00;
  bytes[2] = 0x00;
  const { records } = decodeTransferRecords(bytes);
  assert.equal(records[0].count, 64);
  assert.equal(records[0].data.length, 64);
});

test('decodeTransferRecords stops at a negative VRAM high byte', () => {
  const { records, end } = decodeTransferRecords(Uint8Array.from([0xff, 0x00, 0x01, 0x00]));
  assert.equal(records.length, 0);
  assert.equal(end, 0);
});

test('nametableFromRecords replays writes and drops out-of-range ones', () => {
  const { records } = decodeTransferRecords(
    Uint8Array.from([
      0x20, 0x00, 0x02, 0x11, 0x22, // tiles
      0x23, 0xc0, 0x41, 0x55, // one attribute byte
      0x2b, 0xd0, 0x02, 0xff, 0xff, // other nametable — ignored
      0xff,
    ]),
  );
  const { tiles, attrs } = nametableFromRecords(records, 0x2000);
  assert.equal(tiles.length, 960);
  assert.equal(attrs.length, 64);
  assert.deepEqual([tiles[0], tiles[1]], [0x11, 0x22]);
  assert.equal(attrs[0], 0x55);
});

test('nametableFromRecords steps by 32 for vertical records', () => {
  const { records } = decodeTransferRecords(Uint8Array.from([0x20, 0x00, 0xc3, 0x6c, 0xff]));
  const { tiles } = nametableFromRecords(records, 0x2000);
  assert.deepEqual([tiles[0], tiles[32], tiles[64], tiles[96]], [0x6c, 0x6c, 0x6c, 0]);
});

test('attrPaletteAt picks the quadrant for a tile cell', () => {
  // 0b11_10_01_00 → BR=3, BL=2, TR=1, TL=0 within the 4×4-tile block.
  const attrs = new Uint8Array(64);
  attrs[0] = 0b11100100;
  assert.equal(attrPaletteAt(attrs, 0, 0), 0);
  assert.equal(attrPaletteAt(attrs, 2, 0), 1);
  assert.equal(attrPaletteAt(attrs, 0, 2), 2);
  assert.equal(attrPaletteAt(attrs, 3, 3), 3);
});
