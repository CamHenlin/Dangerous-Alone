/**
 * Game mode `$13` — the words at the end.
 *
 * Three beats, in the order the ROM plays them:
 *
 *   `THANKS`   Zelda's first sentence, typed one glyph per 6 frames in the
 *              little box beside the pair, before the palette flash.
 *   `PEACE`    the line under the flash, one glyph per 8 frames. The ROM's
 *              `EndingFlashLongTimer` cuts to the credits after `$280` frames
 *              whatever is still untyped, so this beat stays short on purpose.
 *   `EPILOGUE` ours. Full pages, held one at a time, Start turns them early.
 *              This is where the story that phase 19 started actually lands.
 *
 * Deleting any of these restores the 1986 text — `endingStory()` falls back to
 * the strings in `assets/extracted/play/ending.json`.
 *
 * Charset rules are the same as everywhere else in `story/`; see ./README.md.
 * Lines here are paragraphs, not pre-wrapped rows — `THANKS` and `PEACE` are
 * laid out by `tools/shared/endingStory.js` for the ending's fixed-row
 * textboxes, and `EPILOGUE` is rendered into storyboard panels by
 * `npm run story:boards`.
 */

import { ACCENT } from '../tools/shared/storyboard.js';

/**
 * Zelda, the moment the shutters open. Typed at 6 frames a glyph, so every
 * character here costs a tenth of a second on screen — keep it to one breath.
 */
export const THANKS = 'THANKS, LINK. I KNEW SOMEBODY WOULD COME.';

/**
 * Under the flash. `EndingFlashLongTimer` cuts to the credits after `$280`
 * frames at 8 frames a glyph, so anything past about 70 characters is typed
 * into a screen that is already gone.
 */
export const PEACE = 'FINALLY, PEACE RETURNS TO HYRULE.';

/** Shown in the gap in the top border of the epilogue's first panel. */
export const EPILOGUE_TITLE = 'THE END OF THE STORY';

/**
 * Words that get an accent colour on the epilogue boards. Kept in step with
 * `story/prologue.js` so the two ends of the game read as a pair.
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
 * The epilogue proper — vine-framed panels in the prologue's own shape, shown
 * after the peace text and before the credit roll. `npm run story:boards`
 * renders these paragraphs into `assets/extracted/play/epilogue.png`, and the
 * ending pages through however many panels they fill.
 *
 * Paragraphs wrap to 24 characters and 11 lines fill a panel; the build prints
 * the fill per panel so a stranded two-line page is obvious.
 */
export const EPILOGUE = [
  'THE TRIFORCE OF WISDOM GOES BACK TOGETHER IN HER HANDS, THE WAY IT NEVER WOULD IN YOURS.',

  'SHE BROKE IT IN ONE NIGHT WITH SOLDIERS ON THE STAIR, AND SHE HAS CARRIED THAT CHOICE EVER SINCE.',

  'THE TRIFORCE OF POWER IS YOURS NOW, TAKEN BACK FROM A THING THAT SHOULD NEVER HAVE HELD IT.',

  'IMPA IS ALIVE. THE OLD MEN COME UP OUT OF THEIR CAVES, BLINK AT THE DAYLIGHT, AND ARGUE ABOUT WHO TOLD YOU WHAT.',

  'THE LABYRINTHS STAY WHERE THEY ARE. HYRULE DOES NOT FILL THEM IN. SOME DOORS ARE WORTH LEAVING SHUT.',

  'YOU WENT INTO A CAVE WITH A STICK OF SHARPENED WOOD AND CAME BACK WITH THE KINGDOM.',

  'THIS ENDS THE STORY.',
];

export default { THANKS, PEACE, EPILOGUE };
