# Story text

Every word an NPC says lives in this folder. Edit these files and reload the
game — nothing has to be re-extracted, and no engine code needs to change.

| File | Holds |
|------|-------|
| [`caves.js`](./caves.js) | Overworld cave dwellers: the sword old man, shopkeepers, clue-sellers, Moblins, the old woman |
| [`persons.js`](./persons.js) | Underworld old men and the money-or-life ghost, per dungeon |
| [`levels.js`](./levels.js) | Dungeon dossiers: the first-entry line, the briefing shown when a Triforce piece is claimed, and the missed-treasure warnings |
| [`items.js`](./items.js) | What an item says the first time Link holds it overhead |
| [`prologue.js`](./prologue.js) | The attract-mode storyboard — "MANY YEARS AGO…" |
| [`ending.js`](./ending.js) | Zelda's line, the peace line, and the epilogue after it |
| [`index.js`](./index.js) | Assembles them into one `STORY` pack |

The engine reads the pack through [`tools/shared/storyText.js`](../tools/shared/storyText.js)
(and [`endingStory.js`](../tools/shared/endingStory.js) for mode `$13`), which
falls back to the original ROM strings for anything this folder does not
override. Deleting an entry is therefore safe — you get the 1986 line back.

The one exception is `items.js`: the NES says nothing at all when you pick
something up, so there is no ROM line under it. Deleting an item entry makes
that pickup silent rather than restoring anything.

## Writing rules

- **Charset.** The box draws with the NES background charset. Only `A–Z`,
  `0–9`, space, and `, . ! ? ' " & -` render. Lowercase is upcased for you;
  anything else comes out as a blank cell. `npm test` fails on an unrenderable
  character, so a typo is caught before you see it in game.
- **Pages.** A page is 3 lines of 28 characters. You do **not** wrap by hand —
  write a paragraph and the box breaks it. Each string in a `pages` array
  starts a fresh page, so use the array to control where the player has to
  press a button.
- **Length.** Each string may wrap to at most **two** pages — `npm test` fails
  a third. Use more array entries rather than longer strings; that way you
  choose where the player presses the button instead of the wrapper choosing.
- **The audit is the exception.** `ITEM_ADVICE`, `MISSED_HEADER` and
  `MISSED_FOOTER` are held to a single page each, because they land at the tail
  of a briefing the player has already read a dozen pages of.

## The storyboards

`prologue.js` and the `EPILOGUE` in `ending.js` are not dialogue — they are the
vine-framed full screens at either end of the game. They wrap to **24
characters**, and **11 lines** fill one panel; you write paragraphs and
[`storyboard.js`](../tools/shared/storyboard.js) paginates them.

The prologue is baked into an image. After editing it, run:

```bash
npm run story:boards
```

That writes `assets/extracted/play/prologue.png` and prints how full each panel
came out, so a stranded two-line panel is obvious without opening it. The
attract sequence scrolls through however many panels the prose fills. Deleting
the PNG restores the ROM's own one-screen storyboard.

The epilogue needs no build step — it is typed out at runtime, so `endingUi.js`
draws the same frame live.

`HIGHLIGHT` gives a word an accent colour wherever it appears. NES attributes
cover 16×16 pixels, so a tinted word also tints the space beside it — which is
invisible, and is exactly what the ROM does around its own "GANNON". `npm test`
fails a `HIGHLIGHT` word the prose never actually says.

## Shapes

A dialogue entry is either a bare array of pages or an object:

```js
2: {
  pages: ['FIRST PAGE...', 'SECOND PAGE...'],
  // Optional: shown instead once the cave's gift has already been taken.
  repeatPages: ['SHORTER REMINDER...'],
  // Optional: shown instead while a gate is still closed (e.g. potion shop
  // before the letter). Pass `{ locked: true }` from `caveStory`.
  lockedPages: ['I DO NOT SELL TO STRANGERS...'],
  // Optional: put a marker on the overworld map at the top of the screen.
  marks: [{ caveId: 0x12, clears: 'whiteSword', label: 'WHITE SWORD' }],
  // Optional (persons): if the player lacks this CLEAR_CONDITIONS item,
  // append missingPages and place missingMarks.
  ifMissing: 'recorder',
  missingPages: ['IT LOOKS LIKE YOU DO NOT HAVE THE PROPER ITEM...'],
  // Optional: level-specific lines (e.g. already inside the labyrinth).
  missingPagesByLevel: { 5: ['THE RECORDER IS STILL IN THIS LABYRINTH...'] },
  missingMarks: [
    { dungeonLevel: 5, itemType: 0x05, clears: 'recorder', label: 'RECORDER' },
    { level: 5, clears: 'recorder', label: 'RECORDER' },
  ],
}
```

`marks` locate themselves from extracted data, so they stay correct if the
overworld tables ever change:

| Field | Meaning |
|-------|---------|
| `caveId` | Screen holding that cave (`0x12` = white sword cave, `0x1a` = a potion shop, …) |
| `screen` | Explicit overworld screen id, when no cave sits there |
| `level` | Overworld screen holding that dungeon's entrance |
| `dungeonLevel` + `itemType` / `roomId` | Underworld room on that labyrinth's minimap |
| `clears` | Name from `CLEAR_CONDITIONS` in [`mapMarks.js`](../tools/shared/mapMarks.js); the mark vanishes once it is true |
| `label` | Shown in the status line when the mark is placed |

## Keys

`caves.js` is keyed by the ROM's `textId` (`byTextId`) or by cave id
(`byCaveId`, which wins). `persons.js` is keyed by `level:textId` (which wins)
or plain `textId`. The ids for both come from the same ROM pointer table —
`assets/extracted/tables/caves.json` → `textLines` lists every one of them
alongside the original English.

`items.js` is keyed by the ROM's `Item_codes` — the same numbers
`grantRoomItem` switches on — so one entry covers a labyrinth floor, a cave
gift, a shop shelf and the bracelet under the Armos alike.

The selector tables make an underworld text look shared between four
labyrinths, but each level only ever spawns one person type, so in practice
almost every id belongs to exactly one dungeon:

```
L1 38 | L2 40 | L3 42 | L4 44 | L5 46 48 50 | L6 56 58
L7 36 50 62 | L8 64 66 | L9 68 70 72 74      (quest 2 adds 52, 54, 60)
```

That is why most person entries sit in `byTextId` and name their labyrinth in
a comment; `byLevelAndTextId` is for ids two dungeons really do share, like the
bomb trader in 5 and 7. `npm test` fails a `level:textId` key for a selector
that level cannot reach, so dead prose cannot ship.

Shop caves (`$1D`–`$20`) each have their own intro in `byCaveId`. A second
page is built at runtime from `shopItemBlurbs` for whatever is still on the
shelf, so a merchant never pitches goods he is not selling (or that Link
already owns). The closer in `shopPitchClosers` switches for one / two / many
items so a lone ware is not "ALL OF IT".

## When each beat plays

| Beat | Fires | Repeats? |
|------|-------|----------|
| `caves.byCaveId` / `byTextId` | Entering a cave | Every visit (`repeatPages` once the gift is gone) |
| `persons.*` | Walking into a labyrinth room with an old man | Once per room visit |
| `levels[N].onEnter` | First descent into labyrinth N | Never again on that file |
| `items[type]` | First time that item is taken, anywhere | Never again on that file |
| `levels[N].onPiece` + `levels[N+1].brief` + warnings | Taking the shard, after the mode `$12` fanfare fills hearts | Once per shard |
| `ending.*` | Touching Zelda in level 9 | Once per quest |

The one-shot beats are remembered in the save as `toldStory` keys
(`item:10`, `level:3`). A save written before they existed just starts with an
empty set, so a resumed run may hear one item introduced a second time.

## Ending layout

The ending renderer does not wrap — it draws `{ row, col, text }` records onto
the nametable grid, which is how the ROM stores `ThanksText` and `PeaceText`.
`endingStory.js` turns the paragraphs in `ending.js` into that shape.

Two pacing limits are enforced by `npm test`:

- **`PEACE` must be short.** `EndingFlashLongTimer` ends the peace submode
  after `$280` frames whatever is left untyped, and it types at 8 frames a
  glyph. Past ~70 characters you are writing into a screen that is already gone.
- **`EPILOGUE` pages fit six lines** and type at 3 frames a glyph, so a page is
  a few seconds rather than the sixteen the peace rate would give it. Start
  fills the current page, then turns it.

`THANKS` and `PEACE` are centred line by line, the way the ROM's one-line boxes
are. Epilogue pages are set as a block — one shared left margin, block centred
— because centring each line of a wrapped paragraph turns it into a diamond.
