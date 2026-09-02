import { crc32Hex } from './hash.js';
import { bytesToAscii, copyBytes } from './bytes.js';

export const INES_HEADER_SIZE = 16;
export const PRG_BANK_SIZE = 16 * 1024;

/** Expected Zelda (USA) cartridge shape for this project. */
export const ZELDA_EXPECTATIONS = {
  prgBanks: 8,
  chrBanks: 0,
  mapper: 1,
  battery: true,
};

/**
 * @typedef {object} InesRom
 * @property {Uint8Array} header
 * @property {Uint8Array} prg
 * @property {Uint8Array} chr
 * @property {number} prgBanks
 * @property {number} chrBanks
 * @property {number} mapper
 * @property {boolean} battery
 * @property {boolean} trainer
 * @property {'horizontal'|'vertical'|'four-screen'} mirroring
 */

/**
 * Parse an iNES (.nes) file buffer into header + PRG/CHR slices.
 * @param {Uint8Array|ArrayBuffer} file
 * @returns {InesRom}
 */
export function parseInes(file) {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  if (bytes.length < INES_HEADER_SIZE) {
    throw new Error(`File too small for iNES header (${bytes.length} bytes)`);
  }

  const magic = bytesToAscii(bytes.subarray(0, 4));
  if (magic !== 'NES\u001a') {
    throw new Error(`Not an iNES ROM (magic=${JSON.stringify(magic)})`);
  }

  const prgBanks = bytes[4];
  const chrBanks = bytes[5];
  const flags6 = bytes[6];
  const flags7 = bytes[7];

  const trainer = Boolean(flags6 & 0x04);
  const battery = Boolean(flags6 & 0x02);
  const fourScreen = Boolean(flags6 & 0x08);
  const mirroring = fourScreen
    ? 'four-screen'
    : flags6 & 0x01
      ? 'vertical'
      : 'horizontal';
  const mapper = ((flags7 & 0xf0) | (flags6 >> 4)) & 0xff;

  let offset = INES_HEADER_SIZE;
  if (trainer) {
    offset += 512;
  }

  const prgSize = prgBanks * PRG_BANK_SIZE;
  const chrSize = chrBanks * 8 * 1024;
  const end = offset + prgSize + chrSize;

  if (bytes.length < end) {
    throw new Error(
      `ROM truncated: need ${end} bytes for header/trainer/PRG/CHR, have ${bytes.length}`,
    );
  }

  const prg = copyBytes(bytes, offset, offset + prgSize);
  const chr = copyBytes(bytes, offset + prgSize, end);

  return {
    header: copyBytes(bytes, 0, INES_HEADER_SIZE),
    prg,
    chr,
    prgBanks,
    chrBanks,
    mapper,
    battery,
    trainer,
    mirroring,
  };
}

/**
 * Reject ROMs that are not Zelda-shaped for this project.
 * @param {InesRom} rom
 * @param {Partial<typeof ZELDA_EXPECTATIONS>} [expect]
 */
export function assertZeldaShape(rom, expect = ZELDA_EXPECTATIONS) {
  const problems = [];
  if (rom.prgBanks !== expect.prgBanks) {
    problems.push(`PRG banks ${rom.prgBanks} !== ${expect.prgBanks}`);
  }
  if (rom.chrBanks !== expect.chrBanks) {
    problems.push(`CHR banks ${rom.chrBanks} !== ${expect.chrBanks}`);
  }
  if (rom.mapper !== expect.mapper) {
    problems.push(`mapper ${rom.mapper} !== ${expect.mapper}`);
  }
  if (expect.battery != null && rom.battery !== expect.battery) {
    problems.push(`battery ${rom.battery} !== ${expect.battery}`);
  }
  if (problems.length) {
    throw new Error(`ROM rejected (not Zelda USA MMC1 shape): ${problems.join('; ')}`);
  }
}

/**
 * Split PRG into fixed 16 KiB banks.
 * @param {Uint8Array} prg
 * @returns {Uint8Array[]}
 */
export function splitPrgBanks(prg) {
  if (prg.length % PRG_BANK_SIZE !== 0) {
    throw new Error(`PRG size ${prg.length} is not a multiple of ${PRG_BANK_SIZE}`);
  }
  const banks = [];
  for (let i = 0; i < prg.length; i += PRG_BANK_SIZE) {
    banks.push(copyBytes(prg, i, i + PRG_BANK_SIZE));
  }
  return banks;
}

/**
 * Identity hashes for the PRG image (header excluded).
 * CRC-32 is available everywhere; MD5/SHA live on the Node CLI.
 * @param {Uint8Array} prg
 */
export function prgIdentity(prg) {
  return {
    size: prg.length,
    crc32: crc32Hex(prg),
  };
}

/**
 * PRG-relative offset → which bank / offset within bank.
 * @param {number} prgOffset
 */
export function prgOffsetToBank(prgOffset) {
  if (!Number.isInteger(prgOffset) || prgOffset < 0) {
    throw new Error(`Invalid offset: ${prgOffset}`);
  }
  const bank = Math.floor(prgOffset / PRG_BANK_SIZE);
  const offsetInBank = prgOffset % PRG_BANK_SIZE;
  return { bank, offsetInBank };
}
