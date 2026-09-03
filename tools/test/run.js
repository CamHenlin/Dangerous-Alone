#!/usr/bin/env node
/**
 * Unit-test entry used by `npm test`.
 *
 * Locally (ROM + extract present) this runs the full suite. CI has neither, so
 * files that read `zelda.nes` or `assets/extracted` at import time are skipped
 * instead of failing the job. Pass `--no-cartridge` to force that filter.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const forceNoCartridge = process.argv.includes('--no-cartridge');
const hasRom = existsSync(join(ROOT, 'zelda.nes'));
const hasExtracted = existsSync(join(ROOT, 'assets/extracted/play/world_index.json'));
const skipCartridge = forceNoCartridge || !hasRom || !hasExtracted;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walkTestFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...walkTestFiles(p));
      continue;
    }
    if (name.endsWith('.test.js') && !name.endsWith('.browsertest.js')) out.push(p);
  }
  return out;
}

/**
 * True when the file reads the local ROM or extracted pack (often at import).
 * @param {string} source
 */
function needsLocalCartridge(source) {
  if (/\bzelda\.nes\b/.test(source)) return true;
  if (source.includes('assets/extracted')) return true;
  if (/['"]assets['"]/.test(source) && /['"]extracted['"]/.test(source)) return true;
  return false;
}

const toolsRoot = join(ROOT, 'tools');
const all = walkTestFiles(toolsRoot);
const files = skipCartridge
  ? all.filter((file) => !needsLocalCartridge(readFileSync(file, 'utf8')))
  : all;

if (skipCartridge) {
  const skipped = all.length - files.length;
  console.log(
    `test: skipping ${skipped} ROM/extract files (${files.length} remain; no cartridge in this environment)`,
  );
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
