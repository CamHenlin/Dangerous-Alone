# Story text

Every word an NPC says lives in this folder. Edit these files and reload the
game — nothing has to be re-extracted, and no engine code needs to change.

| File | Holds |
|------|-------|
| [`caves.js`](./caves.js) | Overworld cave dwellers: the sword old man, shopkeepers, clue-sellers, Moblins, the old woman |
| [`persons.js`](./persons.js) | Underworld old men and the money-or-life ghost, per dungeon |
| [`levels.js`](./levels.js) | Dungeon dossiers, and the briefing shown when a Triforce piece is claimed |
| [`index.js`](./index.js) | Assembles the three into one `STORY` pack |

The engine reads the pack through [`tools/shared/storyText.js`](../tools/shared/storyText.js),
which falls back to the original ROM strings for anything this folder does not
override. Deleting an entry is therefore safe — you get the 1986 line back.

## Writing rules

- **Charset.** The box draws with the NES background charset. Only `A–Z`,
  `0–9`, space, and `, . ! ? ' " & -` render. Lowercase is upcased for you;
  anything else comes out as a blank cell. `npm test` fails on an unrenderable
  character, so a typo is caught before you see it in game.
- **Pages.** A page is 3 lines of 28 characters. You do **not** wrap by hand —
  write a paragraph and the box breaks it. Each string in a `pages` array
  starts a fresh page, so use the array to control where the player has to
  press a button.
- **Length.** Two or three pages reads well. Five is a lecture.

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

Shop caves (`$1D`–`$20`) each have their own intro in `byCaveId`. A second
page is built at runtime from `shopItemBlurbs` for whatever is still on the
shelf, so a merchant never pitches goods he is not selling (or that Link
already owns). The closer in `shopPitchClosers` switches for one / two / many
items so a lone ware is not "ALL OF IT".
