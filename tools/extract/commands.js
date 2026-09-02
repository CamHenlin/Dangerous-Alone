import fs from 'node:fs';
import path from 'node:path';
import {
  assertZeldaShape,
  parseInes,
  prgIdentity,
  prgOffsetToBank,
  splitPrgBanks,
  INES_HEADER_SIZE,
} from '../shared/ines.js';
import { normalizeRange, sliceRange } from '../shared/ranges.js';
import { crc32Hex } from '../shared/hash.js';
import { md5Hex, sha1Hex, sha256Hex } from '../shared/hashNode.js';
import { bytesToHex } from '../shared/bytes.js';
import {
  BANKS_DIR,
  DEFAULT_ROM_PATH,
  EXTRACTED_DIR,
  RANGES_SCHEMA_PATH,
  ROM_MAP_PATH,
  TABLES_DIR,
} from '../shared/paths.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hex(n) {
  return `0x${n.toString(16).toUpperCase()}`;
}

/**
 * @param {string} romPath
 */
export function loadInesFile(romPath) {
  if (!fs.existsSync(romPath)) {
    throw new Error(`ROM not found: ${romPath}`);
  }
  return parseInes(fs.readFileSync(romPath));
}

/**
 * @param {string} schemaPath
 */
export function loadRangeSchema(schemaPath) {
  const raw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ranges = (raw.ranges ?? []).map(normalizeRange);
  return {
    revisionTarget: raw.revision_target ?? null,
    offsetUnit: raw.offset_unit ?? 'prg_relative',
    ranges,
  };
}

/**
 * @param {Uint8Array} prg
 */
function prgIdentityFull(prg) {
  return {
    ...prgIdentity(prg),
    md5: md5Hex(prg),
    sha1: sha1Hex(prg),
    sha256: sha256Hex(prg),
  };
}

/**
 * @param {string} romPath
 */
export function loadValidatedRom(romPath = DEFAULT_ROM_PATH) {
  const rom = loadInesFile(romPath);
  assertZeldaShape(rom);
  return rom;
}

/**
 * @param {object} opts
 * @param {string} [opts.romPath]
 * @param {boolean} [opts.json]
 */
export function cmdInfo({ romPath = DEFAULT_ROM_PATH, json = false } = {}) {
  const rom = loadValidatedRom(romPath);
  const identity = prgIdentityFull(rom.prg);
  const info = {
    romPath,
    headerHex: bytesToHex(rom.header),
    prgBanks: rom.prgBanks,
    chrBanks: rom.chrBanks,
    mapper: rom.mapper,
    battery: rom.battery,
    trainer: rom.trainer,
    mirroring: rom.mirroring,
    prg: identity,
  };

  if (json) {
    console.log(JSON.stringify(info, null, 2));
    return info;
  }

  console.log(`ROM: ${romPath}`);
  console.log(`Header: ${info.headerHex}`);
  console.log(
    `Mapper ${rom.mapper} (MMC1), PRG ${rom.prgBanks}×16KiB, CHR ${rom.chrBanks}, mirroring=${rom.mirroring}, battery=${rom.battery}`,
  );
  console.log(`PRG CRC32  ${identity.crc32}`);
  console.log(`PRG SHA-1  ${identity.sha1}`);
  console.log(`PRG SHA-256 ${identity.sha256}`);
  return info;
}

/**
 * @param {object} opts
 * @param {string} [opts.romPath]
 * @param {string} [opts.outDir]
 */
export function cmdBanks({ romPath = DEFAULT_ROM_PATH, outDir = BANKS_DIR } = {}) {
  const rom = loadValidatedRom(romPath);
  const banks = splitPrgBanks(rom.prg);
  ensureDir(outDir);

  const written = [];
  banks.forEach((bank, index) => {
    const name = `bank_${index}.bin`;
    const filePath = path.join(outDir, name);
    fs.writeFileSync(filePath, bank);
    written.push({
      index,
      path: filePath,
      size: bank.length,
      crc32: crc32Hex(bank),
      sha256: sha256Hex(bank),
    });
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    romPath,
    prg: prgIdentity(rom.prg),
    bankSize: banks[0]?.length ?? 0,
    banks: written.map(({ index, size, crc32, sha256, path: p }) => ({
      index,
      file: path.relative(EXTRACTED_DIR, p),
      size,
      crc32,
      sha256,
    })),
  };
  const manifestPath = path.join(outDir, 'banks_manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${written.length} banks → ${outDir}`);
  written.forEach((b) => {
    console.log(`  bank_${b.index}.bin  ${b.size} bytes  crc32=${b.crc32}`);
  });
  console.log(`Manifest: ${manifestPath}`);
  return manifest;
}

/**
 * @param {object} opts
 * @param {string} [opts.romPath]
 * @param {string} [opts.schemaPath]
 * @param {string} [opts.outDir]
 */
export function cmdTables({
  romPath = DEFAULT_ROM_PATH,
  schemaPath = RANGES_SCHEMA_PATH,
  outDir = TABLES_DIR,
} = {}) {
  const rom = loadValidatedRom(romPath);
  const schema = loadRangeSchema(schemaPath);
  ensureDir(outDir);

  const entries = [];
  for (const range of schema.ranges) {
    const bytes = sliceRange(rom.prg, range);
    const binName = `${range.id}.bin`;
    const binPath = path.join(outDir, binName);
    fs.writeFileSync(binPath, bytes);

    const meta = {
      ...range,
      prgStartHex: hex(range.prgStart),
      prgEndInclusiveHex: hex(range.prgEndInclusive),
      inesStart: range.prgStart + INES_HEADER_SIZE,
      inesEndInclusive: range.prgEndInclusive + INES_HEADER_SIZE,
      bankHint: prgOffsetToBank(range.prgStart),
      crc32: crc32Hex(bytes),
      sha256: sha256Hex(bytes),
      file: path.relative(EXTRACTED_DIR, binPath),
    };
    entries.push(meta);
    console.log(
      `  ${range.id}: ${hex(range.prgStart)}–${hex(range.prgEndInclusive)} (${range.length} bytes) crc32=${meta.crc32} [${range.trust}]`,
    );
  }

  const tablesManifest = {
    generatedAt: new Date().toISOString(),
    romPath,
    schemaPath,
    revisionTarget: schema.revisionTarget,
    prg: prgIdentity(rom.prg),
    tables: entries,
  };
  const tablesManifestPath = path.join(outDir, 'tables_manifest.json');
  fs.writeFileSync(tablesManifestPath, `${JSON.stringify(tablesManifest, null, 2)}\n`);
  console.log(`Wrote ${entries.length} tables → ${outDir}`);
  return tablesManifest;
}

/**
 * Build rom_map.json from schema + live dump metadata.
 * @param {object} opts
 */
export function cmdRomMap({
  romPath = DEFAULT_ROM_PATH,
  schemaPath = RANGES_SCHEMA_PATH,
  outPath = ROM_MAP_PATH,
} = {}) {
  const rom = loadValidatedRom(romPath);
  const schema = loadRangeSchema(schemaPath);
  const identity = prgIdentityFull(rom.prg);

  const romMap = {
    generatedAt: new Date().toISOString(),
    romPath,
    revisionTarget: schema.revisionTarget,
    offsetUnit: schema.offsetUnit,
    headerSize: INES_HEADER_SIZE,
    prg: identity,
    cartridge: {
      mapper: rom.mapper,
      prgBanks: rom.prgBanks,
      chrBanks: rom.chrBanks,
      battery: rom.battery,
      mirroring: rom.mirroring,
    },
    ranges: schema.ranges.map((range) => {
      const bytes = sliceRange(rom.prg, range);
      return {
        id: range.id,
        description: range.description,
        source: range.source,
        trust: range.trust,
        prgStart: range.prgStart,
        prgEndInclusive: range.prgEndInclusive,
        prgStartHex: hex(range.prgStart),
        prgEndInclusiveHex: hex(range.prgEndInclusive),
        length: range.length,
        inesStart: range.prgStart + INES_HEADER_SIZE,
        inesEndInclusive: range.prgEndInclusive + INES_HEADER_SIZE,
        bankHint: prgOffsetToBank(range.prgStart),
        crc32: crc32Hex(bytes),
        sha256: sha256Hex(bytes),
      };
    }),
  };

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, `${JSON.stringify(romMap, null, 2)}\n`);
  console.log(`Wrote ROM map (${romMap.ranges.length} ranges) → ${outPath}`);
  return romMap;
}

/**
 * banks + tables + rom_map
 * @param {object} opts
 */
export function cmdAll(opts = {}) {
  const banks = cmdBanks(opts);
  console.log('');
  const tables = cmdTables(opts);
  console.log('');
  const romMap = cmdRomMap(opts);
  return { banks, tables, romMap };
}
