/**
 * The attract-mode prologue — the vine-framed screens that scroll up after the
 * title, before the "ALL OF TREASURES" crawl.
 *
 * The NES kept this as a nametable transfer buffer, which is why it shipped as
 * a baked PNG. It is prose now: `tools/story/buildPrologue.js` renders these
 * paragraphs back into `assets/extracted/play/prologue.png`, and the attract
 * sequence pages through however many panels they fill.
 *
 * Run after editing:
 *
 *     npm run story:prologue
 *
 * ## Writing rules
 *
 * Same charset as the rest of `story/` — `A–Z`, `0–9`, space and
 * `, . ! ? ' " & -`. Lines wrap to 25 characters and 11 lines fill a panel;
 * you write paragraphs and the builder paginates them.
 *
 * `HIGHLIGHT` tints a word. Colour lands on the NES 16×16 attribute grid, so a
 * tinted word bleeds onto the space beside it — which is invisible, and is
 * exactly what the ROM does around its own "GANNON".
 */

import { ACCENT } from '../tools/shared/storyboard.js';

/** Shown in the gap in the top border of the first panel. */
export const TITLE = 'THE LEGEND OF ZELDA';

/**
 * Words that get an accent colour wherever they appear.
 * Red is the ROM's own choice for names; blue is reserved for the count, so
 * "8" reads as the number the whole quest hangs on.
 */
export const HIGHLIGHT = Object.freeze({
  GANON: ACCENT.red,
  ZELDA: ACCENT.red,
  TRIFORCE: ACCENT.red,
  LINK: ACCENT.red,
  IMPA: ACCENT.red,
  HYRULE: ACCENT.red,
  8: ACCENT.blue,
});

/**
 * The prologue, in reading order. Paragraphs are kept whole on a panel where
 * they fit, so a break lands between thoughts rather than mid-sentence.
 */
export const PARAGRAPHS = [
  'MANY YEARS AGO GANON CAME UP OUT OF THE WESTERN DESERT WITH AN ARMY BEHIND HIM.',

  'HE TOOK THE TRIFORCE OF POWER FROM THE KING OF HYRULE. THERE HAS BEEN NO KING SINCE.',

  'PRINCESS ZELDA HELD THE SECOND RELIC, THE TRIFORCE OF WISDOM, AND SHE WOULD NOT GIVE IT UP.',

  'IN ONE NIGHT SHE BROKE IT INTO 8 SHARDS AND HID THEM IN 8 LABYRINTHS.',

  'THEN SHE SENT HER NURSE IMPA OUT TO FIND A HERO. GANON TOOK HER FOR IT.',

  'SHE HAS BEEN UNDER DEATH MOUNTAIN EVER SINCE AND SHE HAS NEVER TOLD HIM WHERE THE PIECES WENT.',

  'GATHER ALL 8 AND WISDOM IS WHOLE AGAIN. NOTHING ELSE OPENS THE LAST DOOR.',

  'GO FIND THE 8 UNITS, LINK, AND SAVE HER.',
];

export default { TITLE, HIGHLIGHT, PARAGRAPHS };
