import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRG_BANK_SIZE,
  assertZeldaShape,
  parseInes,
  prgIdentity,
  prgOffsetToBank,
  splitPrgBanks,
} from './ines.js';
import { crc32Hex } from './hash.js';
import { normalizeRange, parseOffset, sliceRange } from './ranges.js';

function makeZeldaLikeRom({ prgBanks = 8, mapper = 1, battery = true } = {}) {
  const header = Buffer.alloc(16, 0);
  header.write('NES\u001a', 0, 4, 'ascii');
  header[4] = prgBanks;
  header[5] = 0; // CHR-RAM
  const flags6 = (mapper & 0x0f) << 4;
  header[6] = flags6 | (battery ? 0x02 : 0x00); // horizontal + optional battery
  header[7] = mapper & 0xf0;
  const prg = Buffer.alloc(prgBanks * PRG_BANK_SIZE, 0xaa);
  for (let i = 0; i < prgBanks; i += 1) {
    prg[i * PRG_BANK_SIZE] = i;
  }
  return Buffer.concat([header, prg]);
}

test('parseInes reads Zelda-shaped header', () => {
  const rom = parseInes(makeZeldaLikeRom());
  assert.equal(rom.prgBanks, 8);
  assert.equal(rom.chrBanks, 0);
  assert.equal(rom.mapper, 1);
  assert.equal(rom.battery, true);
  assert.equal(rom.mirroring, 'horizontal');
  assert.equal(rom.prg.length, 8 * PRG_BANK_SIZE);
});

test('assertZeldaShape rejects wrong mapper', () => {
  const rom = parseInes(makeZeldaLikeRom({ mapper: 2 }));
  assert.throws(() => assertZeldaShape(rom), /mapper/);
});

test('splitPrgBanks yields eight 16KiB banks', () => {
  const rom = parseInes(makeZeldaLikeRom());
  const banks = splitPrgBanks(rom.prg);
  assert.equal(banks.length, 8);
  banks.forEach((bank, i) => {
    assert.equal(bank.length, PRG_BANK_SIZE);
    assert.equal(bank[0], i);
  });
});

test('prgIdentity crc32 matches known empty-ish vector style', () => {
  // CRC of single zero byte is a common reference: 0xD202EF8D
  assert.equal(crc32Hex(Buffer.from([0])), 'D202EF8D');
  const id = prgIdentity(Buffer.alloc(4, 0));
  assert.equal(id.size, 4);
  assert.match(id.crc32, /^[0-9A-F]{8}$/);
  assert.equal(id.md5, undefined);
});

test('prgOffsetToBank maps addresses', () => {
  assert.deepEqual(prgOffsetToBank(0), { bank: 0, offsetInBank: 0 });
  assert.deepEqual(prgOffsetToBank(0x4000), { bank: 1, offsetInBank: 0 });
  assert.deepEqual(prgOffsetToBank(0x15418), {
    bank: 5,
    offsetInBank: 0x1418,
  });
});

test('range slicing is inclusive end', () => {
  const prg = Buffer.from([10, 11, 12, 13, 14]);
  const range = normalizeRange({
    id: 'demo',
    prg_start: 1,
    prg_end_inclusive: 3,
  });
  assert.equal(range.length, 3);
  assert.deepEqual([...sliceRange(prg, range)], [11, 12, 13]);
  assert.equal(parseOffset('0x15418'), 0x15418);
});
