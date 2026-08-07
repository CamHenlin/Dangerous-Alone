import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import { parseOffset } from '../shared/ranges.js';
import {
  creditsRowLayout,
  creditsScrollEnd,
  decodeCreditsLines,
  decodePeaceString,
  decodePeaceText,
  decodeThanksText,
  peaceLayout,
  thanksLayout,
} from '../shared/endingText.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';

export const ENDING_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'ending.json');
export const ENDING_OUT_PATH = path.join(EXTRACTED_DIR, 'play', 'ending.json');

/**
 * Extract the mode `$13` text: Zelda's thanks, the closing line, and credits.
 * @param {{ romPath?: string, schemaPath?: string, outPath?: string }} [opts]
 */
export function cmdEnding(opts = {}) {
  const romPath = opts.romPath ?? DEFAULT_ROM_PATH;
  const schemaPath = opts.schemaPath ?? ENDING_SCHEMA_PATH;
  const outPath = opts.outPath ?? ENDING_OUT_PATH;
  const { prg } = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  /** Read a fixed-length byte table named in the schema. */
  const table = (name) => {
    const entry = schema.offsets[name];
    const start = parseOffset(entry.prg);
    return Array.from(prg.slice(start, start + entry.length));
  };

  const thanks = decodeThanksText(prg, parseOffset(schema.offsets.thanksText.prg));
  const peaceOffset = parseOffset(schema.offsets.peaceText.prg);
  const peace = decodePeaceText(prg, peaceOffset);
  const credits = decodeCreditsLines(
    prg,
    parseOffset(schema.offsets.creditsTextLines.prg),
    schema.creditsLineOffsets,
  );

  const { rows, totalRows } = creditsRowLayout(table('creditsPagesTextMasks'));
  const doc = {
    generatedAt: new Date().toISOString(),
    thanksText: thanks,
    thanksLines: thanksLayout(
      thanks,
      table('thanksLineAddrsLo'),
      undefined,
      parseOffset(schema.thanksVramHigh),
    ),
    peaceText: peace,
    peaceLines: peaceLayout(
      decodePeaceString(prg, peaceOffset),
      table('peaceCharAddrsLo'),
      parseOffset(schema.peaceVramHigh),
    ),
    creditsLines: credits.map((line, i) => ({ ...line, row: rows[i] ?? null })),
    creditsTotalRows: totalRows,
    creditsScrollEnd: creditsScrollEnd(
      table('creditsLastScreens'),
      table('creditsLastVscrolls'),
    ),
    creditsQuestGating: schema.creditsQuestGating,
    playerNameLineIndex: schema.playerNameLineIndex,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(
    `Ending: ${thanks.length} thanks lines, ${peace.length} peace lines, ${credits.length} credits lines → ${outPath}`,
  );
  return doc;
}
