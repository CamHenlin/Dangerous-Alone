import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import { parseOffset } from '../shared/ranges.js';
import { buildCaveTable } from '../shared/caves.js';
import { linesForTextId, stringForTextId } from '../shared/caveText.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';

export const CAVES_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'caves.json');
export const CAVES_OUT_PATH = path.join(EXTRACTED_DIR, 'tables', 'caves.json');

/**
 * @param {{ romPath?: string, schemaPath?: string }} [opts]
 */
export function cmdCaves(opts = {}) {
  const romPath = opts.romPath ?? DEFAULT_ROM_PATH;
  const schemaPath = opts.schemaPath ?? CAVES_SCHEMA_PATH;
  const { prg } = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  const slice = (key) => {
    const start = parseOffset(schema.offsets[key].prg);
    const length = schema.offsets[key].length;
    return prg.subarray(start, start + length);
  };

  const bankBase = parseOffset(schema.textBankPrgBase);
  const textOpts = {
    textPointersPrg: parseOffset(schema.offsets.textPointers.prg),
    bankPrgBase: bankBase,
  };
  /** @type {Record<string, string>} */
  const texts = {};
  /** @type {Record<string, string[]>} */
  const textLines = {};
  for (let textId = 0; textId < 76; textId += 2) {
    const lines = linesForTextId(prg, textId, textOpts);
    textLines[textId] = lines;
    texts[textId] = lines.join(' ') || stringForTextId(prg, textId, textOpts);
  }

  const takeAnyRoad = [...slice('takeAnyRoad')];
  const caves = buildCaveTable(
    slice('items'),
    slice('prices'),
    slice('textFlags'),
    slice('dwellers'),
    texts,
    takeAnyRoad,
  );
  for (const cave of caves) {
    cave.textLines = textLines[cave.textId] ?? (cave.text ? [cave.text] : []);
  }

  fs.mkdirSync(path.dirname(CAVES_OUT_PATH), { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    revision_target: schema.revision_target,
    shopPriceIndexDelta: schema.shopPriceIndexDelta,
    takeAnyRoad,
    texts,
    textLines,
    caves,
  };
  fs.writeFileSync(CAVES_OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`  caves → ${CAVES_OUT_PATH} (${caves.length} types)`);
  return out;
}
