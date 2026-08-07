import fs from 'node:fs';
import { crc32Hex, md5Hex, sha1Hex, sha256Hex } from './hash.js';

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
 * @property {Buffer} header
 * @property {Buffer} prg
 * @property {Buffer} chr
 * @property {number} prgBanks
 * @property {number} chrBanks
 * @property {number} mapper
 * @property {boolean} battery
 * @property {boolean} trainer
 * @property {'horizontal'|'vertical'|'four-screen'} mirroring
 */

/**
 * Parse an iNES (.nes) file buffer into header + PRG/CHR slices.
 * @param {Buffer} file
 * @returns {InesRom}
 */
export function parseInes(file) {
  if (file.length < INES_HEADER_SIZE) {
    throw new Error(`File too small for iNES header (${file.length} bytes)`);
  }

  const magic = file.subarray(0, 4).toString('ascii');
  if (magic !== 'NES\u001a') {
    throw new Error(`Not an iNES ROM (magic=${JSON.stringify(magic)})`);
  }

  const prgBanks = file[4];
  const chrBanks = file[5];
  const flags6 = file[6];
  const flags7 = file[7];

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

  if (file.length < end) {
    throw new Error(
      `ROM truncated: need ${end} bytes for header/trainer/PRG/CHR, have ${file.length}`,
    );
  }

  const prg = file.subarray(offset, offset + prgSize);
  const chr = file.subarray(offset + prgSize, end);

  return {
    header: Buffer.from(file.subarray(0, INES_HEADER_SIZE)),
    prg: Buffer.from(prg),
    chr: Buffer.from(chr),
    prgBanks,
    chrBanks,
    mapper,
    battery,
    trainer,
    mirroring,
  };
}

/**
 * Load and parse a .nes path.
 * @param {string} romPath
 */
export function loadInesFile(romPath) {
  if (!fs.existsSync(romPath)) {
    throw new Error(`ROM not found: ${romPath}`);
  }
  return parseInes(fs.readFileSync(romPath));
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
 * @param {Buffer} prg
 * @returns {Buffer[]}
 */
export function splitPrgBanks(prg) {
  if (prg.length % PRG_BANK_SIZE !== 0) {
    throw new Error(`PRG size ${prg.length} is not a multiple of ${PRG_BANK_SIZE}`);
  }
  const banks = [];
  for (let i = 0; i < prg.length; i += PRG_BANK_SIZE) {
    banks.push(Buffer.from(prg.subarray(i, i + PRG_BANK_SIZE)));
  }
  return banks;
}

/**
 * Identity hashes for the PRG image (header excluded).
 * @param {Buffer} prg
 */
export function prgIdentity(prg) {
  return {
    size: prg.length,
    crc32: crc32Hex(prg),
    md5: md5Hex(prg),
    sha1: sha1Hex(prg),
    sha256: sha256Hex(prg),
  };
}

/**
 * PRG-relative offset → which bank / offset within bank.
 * @param {number} prgOffset
 */
export function prgOffsetToBank(prgOffset) {
  if (!Number.isInteger(prgOffset) || prgOffset < 0) {
    throw new Error(`Invalid PRG offset: ${prgOffset}`);
  }
  const bank = Math.floor(prgOffset / PRG_BANK_SIZE);
  const offsetInBank = prgOffset % PRG_BANK_SIZE;
  return { bank, offsetInBank };
}
