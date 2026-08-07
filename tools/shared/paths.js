import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (`nes_zelda/`). */
export const ROOT = path.resolve(here, '../..');

export const DEFAULT_ROM_PATH = path.join(ROOT, 'zelda.nes');
export const EXTRACTED_DIR = path.join(ROOT, 'assets', 'extracted');
export const BANKS_DIR = path.join(EXTRACTED_DIR, 'banks');
export const TABLES_DIR = path.join(EXTRACTED_DIR, 'tables');
export const ROM_MAP_PATH = path.join(EXTRACTED_DIR, 'rom_map.json');
export const RANGES_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'rom_ranges.json');
