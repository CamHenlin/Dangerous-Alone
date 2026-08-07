# Phase 19 — Quality of Life 2

**Status:** Complete  
**Outcome:** Make improvements beyond the original game

## Checklist

- [x] Text from characters should be displayed in a nicely formatted and animated box at the top of the screen, similar to newer 2D Zelda games such as Link's Awakening and A Link to the Past. It should have a transparent background to increase text readability. If the text is long, is should write out as much as it can fit, then when the player presses a button, it should clear the box and write additional text, and so on until the text is fully written out. After the last piece of text is written, pressing the button should close the box and return to the game. This should happen any time text comes from a character or NPC: old men, etc. We should also provide helpful hints as pieces of triforce are picked up at the end of dungeons to explain where the player should go next, along with a short story of what is going on with the next triforce piece, what monster guards it, what items may be needed, what new secrets may be available (since the player has more triforce pieces or received a new item within the dungeon, and can pick up new swords and so on) and so on.
- [x] Using the above, All of the text in the game should be expanded to tell a more coherent story, borrowing intent from the original game but making it more interesting and engaging, as well as helping better guide the player. For example, the old man in the cave that gives us the wooden sword, should explain that Zelda has been kidnapped and broken up the Triforce of Wisdom in to 8 pieces and hidden them in dungeons throughout Hyrule, and so on. Story elements can be borrowed and expanded from ideas in the docs/context folder where we have the original manual (manual.pdf) and the game walkthrough (walkthrough.txt). Let's put the text into editable files so I can write and expand it as needed, but you should take the first pass at expanding it based on the manual and walkthrough. You will need to write the text yourself but make it all fit together. 
- [x] As the player completes a dungeon and the story comes up to tell the player about next steps, it should also warn the player if they didn't pick up the dungeon's item or secret, and explain what they need to do to get it as not getting it may hamper their progress or ability to enter or complete the next dungeon.
- [x] The next dungeon should be marked on the map at the top of the screen. Additionally, if a character (such as an old man) tells us about an item or secret on the map, its location should be marked on the map as well - use a different color for this. If the map is marked for an item, it should disappear once you collect the item.

## Done when

All of these items are implemented.

## Notes

### Where the words live

`story/` at the repo root holds every line an NPC says — `caves.js`,
`persons.js`, `levels.js`, assembled by `index.js`, documented in
[`story/README.md`](../../story/README.md). Engine code never imports it
directly; `tools/shared/storyText.js` is the only door, and every lookup falls
back to the original ROM string, so deleting an entry restores the 1986 line
rather than blanking the box.

Keys come from the ROM's own `PersonText` pointer table, listed with their
English in `assets/extracted/tables/caves.json` → `textLines`. Caves resolve
`byCaveId` before `byTextId` (the white and magical sword caves share text
`$02`); persons resolve `level:textId` before `textId` (levels 3/4/6/8 share
one selector table, so level-specific lines need the compound key).

### The box

- `tools/shared/textBoxModel.js` — pure wrap / paginate / typewriter. 28 cols ×
  3 rows, one glyph every other frame like `UpdatePersonState_Textbox`.
  Pagination balances a paragraph across its pages (4 lines read 2 + 2, not
  3 + 1 with an orphan word).
- `game/src/play/textBox.js` — translucent panel under the status bar, NES BG
  charset, blinking chevron for "more" and a square for "last page".
- One box serves every speaker. `personDialogue.js` is gone and `caveScene.js`
  no longer draws its own text.

### Briefings

Taking a shard arms `pendingBriefingLevel`; the briefing opens when the
GameMode `$12` fanfare finishes filling hearts, so it never talks over the
palette flash. Pages are `LEVELS[N].onPiece` + `LEVELS[N+1].brief` + warnings.

Warnings are computed from the extracted level pack against
`dungeon.takenItems`, so they are true for the actual playthrough rather than a
hardcoded list. They are ordered by `MISSED_PRIORITY` (progression blockers
first) and capped at `MISSED_MAX` so a briefing stays advice, not an audit.

### Map marks

`tools/shared/mapMarks.js` derives everything from the extracted overworld
table. `caveId === level && !ignoreSecretQ<quest>` is what separates a real
entrance from the same cave id on a screen the quest never opens — level 5
claims both `$0B` and `$1B`, level 8 both `$6C` and `$6D`. Quest-1 entrances
come out as 1:`$37` 2:`$3C` 3:`$74` 4:`$45` 5:`$0B` 6:`$22` 7:`$42` 8:`$6D`
9:`$05`, asserted against the pack by `storyText.test.js`.

Hint marks persist in the save as `roomId:clearCondition` strings and retire
themselves the moment `CLEAR_CONDITIONS[condition](inv)` goes true.

### Charset

`tools/shared/nesCharset.js` now owns the character → CHR tile table (moved out
of `game/src/play/nesFont.js`, which re-exports it). That lets `npm test` fail
on a story string the box cannot draw — an em dash was caught this way.

### Debugging

`?debug=1` exposes `window.zeldaDebug`. `step(n)` advances exact 60Hz frames:
a backgrounded tab suspends `requestAnimationFrame`, so without it the game
cannot be driven from a headless browser at all.

It did not actually advance n frames until
[Phase 20](./phase-20-streaming-cleanup.md) fixed it, and it still cannot let a
promise resolve inside its own loop — `await` between calls when a screen load
or `enterLevel` has to settle.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-07 | Story prose lives in a top-level `story/` folder of plain ES modules, not JSON or an extracted pack | The ask was "editable files"; ES modules take comments, need no fetch, and are importable by both Vite and `node --test` |
| 2026-08-07 | Every lookup falls back to the ROM string | Deleting an entry has to be safe, and untranslated selectors should still say something |
| 2026-08-07 | The box is modal — the world holds still while it is open | "Pressing the button should close the box and return to the game" only reads as modal, and it stops a page turn from also swinging the sword |
| 2026-08-07 | Death outranks dialogue in the step loop (`textBox.active && !inv.dead`) | An open box halting mode `$11` would strand the death sequence |
| 2026-08-07 | Missed-treasure warnings are derived from `levelData.floorItem` vs `takenItems`, not authored per level | Stays correct for cellars, quest 2, and any future re-extract |
| 2026-08-07 | Dungeon entrances are derived from `caveId` + the quest's `ignoreSecret` flag; `world_index.json` now carries those flags | Hardcoding the nine screens would rot; the flag is the ROM's own answer to "is this entrance real in this quest" |
| 2026-08-07 | Radar marks repaint through `hud.pulseMap`, not `hud.update` | The pulse needs 60Hz; rebuilding every heart and counter sprite each frame does not |
| 2026-08-07 | Paragraph pages are balanced rather than greedily filled | A 4-line paragraph was ending on a page holding the single word "NOW." |

## Open questions

- The full post-dungeon briefing runs ~11 pages (more with warnings). Trim in
  `story/levels.js` if it plays long.
