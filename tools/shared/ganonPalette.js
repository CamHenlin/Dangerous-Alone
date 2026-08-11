import { nesColor } from './nesPalette.js';
import { GANON_PHASE } from './bossAi.js';

/**
 * `GanonColorSets` / `Ganon_AppendPaletteRowTransferRecord_*` — PPU row $3F1C
 * (SP3) colors for Ganon's fight phases.
 *
 * Template always starts with $0F; the last three slots are overwritten from
 * `GanonColorSets` ending at Y=$02 (brown) or Y=$05 (blue).
 *
 * @see Z_04.asm:10910–10957, Z_06.asm:692–693
 */
export const GANON_PALETTE_NES = Object.freeze({
  BROWN: Object.freeze([0x0f, 0x07, 0x17, 0x30]),
  BLUE: Object.freeze([0x0f, 0x16, 0x2c, 0x3c]),
});

/**
 * @param {number} [phase] `GANON_PHASE.BLUE` | `GANON_PHASE.BROWN`
 * @returns {(readonly number[])[]} four RGB triples for the active Ganon row
 */
export function ganonPaletteRgb(phase = GANON_PHASE.BLUE) {
  const indices =
    phase === GANON_PHASE.BROWN ? GANON_PALETTE_NES.BROWN : GANON_PALETTE_NES.BLUE;
  return indices.map((i) => nesColor(i));
}
