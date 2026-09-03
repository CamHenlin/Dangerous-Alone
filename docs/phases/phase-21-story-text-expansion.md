# Phase 21 — Story Text Expansion

**Status:** Complete
**Outcome:** Every moment in the game that should have words has them, and the
words fit together

Follows [Phase 19](./phase-19-quality-of-life-2.md), which built the text box,
the `story/` folder and the post-dungeon briefing. That phase covered NPCs. A
full playthrough showed the direction was right but the coverage was not: three
whole classes of moment still said nothing, and a few lines that did exist were
being shown to the wrong player.

## Checklist

- [x] Review every piece of text the game can put on screen and find the gaps
- [x] Fix the lines that are wrong or unreachable
- [x] Give the duplicated cave ids their own voices
- [x] Introduce an item the first time it is picked up, anywhere
- [x] Introduce a labyrinth the first time Link stands in it
- [x] Replace the 1986 ending with one that pays off the story we tell
- [x] Even out the post-dungeon briefings and say what each shard unlocked
- [x] Re-author the attract-mode prologue, and give the epilogue the same frame

## Done when

All of these are implemented, `npm test` is green, and the new beats have been
driven in the browser rather than assumed.

## What was wrong

The review resolved every person spawn per level (`spawnDungeonEnemies` →
`textIdForUnderworldPerson`) rather than trusting the selector tables, which is
what turned up the first two:

- **The level 9 gatekeeper's line was inverted.** Room `$66` spawns objType
  `$4B` → text 68, and `filterLevel9EntranceGate` deletes that person the
  instant the Triforce is whole. So text 68 is *only* read by someone still
  short of 8 shards — and it opened "SO YOU CARRY ALL 8. THE TRIFORCE OF WISDOM
  IS WHOLE." It is now the refusal it has to be; the congratulation moved to
  text 70, which is read after the shutters open.
- **`8:60` was unreachable.** Labyrinth 8 only spawns persons using texts 64 and
  66, so the page carrying "GO NORTH TO DEATH MOUNTAIN AND BOMB THE GREY WALL"
  — the single most important navigation hint in the game — was never shown to
  anybody. It moved into text 66, with a map pin on the level 9 entrance.
- **Duplicated caves shared one line.** Three Moblin caves holding 30, 100 and
  10 rupees all said the same sentence; both "PAY ME AND I'LL TALK" sellers sold
  the same clue.
- **Nothing spoke at a pickup, a descent, or the end.** The raft, the recorder
  and the book of magic arrived with a status-bar line. The ending resolved a
  kidnapping, a broken relic and eight labyrinths in two ROM sentences.

## What was added

### `story/items.js`

Keyed by `Item_codes`, so one entry covers a labyrinth floor, a cave gift, a
shop shelf and the bracelet under the Armos. Four call sites feed the same
`tellItemStory`. The box opens while Link still has the thing over his head: in
a labyrinth the world is frozen under an open box, so the lift pose simply
waits, which reads as deliberate.

Small change is silent. Keys, rupees and bomb refills have no entry, and
`itemStory` returns no pages rather than falling back to anything.

### `levels[N].onEnter`

One page-set per labyrinth, on the first descent only, naming the place and its
guardian and repeating the one thing that will block you at the bottom. Guarded
on `!opts.spawnOverride && resumeRoom === startRoom` so resuming a save inside a
dungeon is not treated as arriving.

### The ending

An `EPILOGUE` phase between the peace text and the credit roll. The ROM cuts
straight from one sentence to the staff list; there was no room in the existing
state machine for anything longer, and the peace beat cannot simply be extended
because `EndingFlashLongTimer` ends that submode after `$280` frames whatever is
left untyped.

With no epilogue pages the phase is skipped and the order is the ROM's, so the
fallback path is the original ending exactly.

### The prologue, and `tools/shared/storyboard.js`

The "MANY YEARS AGO" screen was a baked nametable (`StoryTileAttrTransferBuf`),
which is why it was the one piece of prose `story/` could not reach.
`storyboard.js` rebuilds that nametable *from text*: vine frame, title in the
gap in the top border, wrapped body, per-word accent colours. `story/prologue.js`
holds the words and `npm run story:boards` renders them to
`assets/extracted/play/prologue.png`.

It goes to `prologue.png` rather than over `story.png` because the latter is
extractor output — `npm run extract -- demo` would overwrite it. The game
prefers the authored file and falls back to the ROM's, so deleting it restores
the 1986 screen. Same rule as the rest of `story/`.

Two NES constraints shape the layout, and both are visible in the ROM's own
storyboard once you know to look:

- Attributes cover 2×2 tiles, so body lines sit on every *other* row. A
  single-spaced line would share its attribute row with its neighbour and drag
  that neighbour's colour with it.
- For the same reason text stops at column 27, not 28: columns 28 and 29 share
  an attribute block with the right-hand vine, and a character there repaints
  the vine white. The first render had exactly that speckle down the right edge.

The prologue now runs four panels. The attract sequence scrolls between them
(`STORY_SUB.PANEL_IN`) and derives the count from the image height, so adding a
paragraph is the only edit needed to add a panel. `crawlFirstLineY(panels)`
moves the treasure crawl below the last one — left at the ROM constant it would
have already scrolled past by the time the crawl started.

### The epilogue's frame

The epilogue is *not* baked, because its text is typed a glyph at a time.
`endingUi.js` draws the same frame live from the same constants, and
`endingStory.js` wraps the words to it. Both ends of the game therefore share
`storyboard.js` as their geometry and read as a pair.

The one visible difference: a baked panel gets a real four-colour palette row
and its vine is three shades of green, while a tinted sprite can only be one.
At 8px it does not read.

### One-shot bookkeeping

`toldStory` — a `Set` of `item:<type>` / `level:<n>` keys — rides in the save
next to `hintMarks`. A save written before it existed loads an empty set, so at
worst a resumed run hears one item introduced twice.

## Notes

### Queueing, and why

A shopkeeper is usually still mid-speech when Link walks onto the ware he is
selling — cave Mode B keeps stepping under an open box, and cave wares are taken
by touch, not by a button. A labyrinth old man can be talking when a floor item
is taken two rooms later. Dropping the second speech would lose it permanently,
because these beats fire once.

So `sayStory` queues behind an open box and `onDialogueClosed` drains it. Two
exceptions:

- Shop purchases pass `interrupt: true` and close the merchant instead. He has
  had his say by the time the player is buying.
- Every forced close in `main.js` goes through `closeDialogue()`, which drops
  the queue. All eight of them are mode changes — a room load, a cave exit,
  death, a new file — and a beat waiting behind the box belonged to the
  situation being torn down.

### Pacing

Post-dungeon briefings run 14–19 box pages. Story prose may wrap to two pages;
the missed-treasure audit at the tail may not, and `storyText.test.js` enforces
that. Tightening the warnings to one page each took the worst case from 24 down
to 19 without shortening a single line of story.

### What the tests now catch

- An unrenderable glyph anywhere in the pack, including the new files.
- A story string that wraps to three or more pages.
- A warning string that wraps to two.
- An `items` key nothing in the game grants.
- A labyrinth with no `onEnter`, or one that does not name itself.
- A `level:textId` person entry for a selector that level cannot reach.
- A level 9 gate line that congratulates instead of refusing.
- A peace line too long to finish typing before the ROM timer cuts away.
- An epilogue page taller than the eleven body rows inside the frame.
- A prologue line wider than the frame, or a panel with more lines than rows.
- A pagination pass that drops or reorders an authored word.
- A `HIGHLIGHT` word the prologue never actually says.
- Body text reaching the column that shares an attribute block with the vine.
- A crawl origin that would start behind the last storyboard panel.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-13 | Item text is keyed by `Item_codes`, not by pickup site | The raft is the raft whether it came off a floor, a shelf or a statue; one entry, four call sites |
| 2026-08-13 | The box opens during the item-lift pose rather than after it | An open box freezes the world in a labyrinth, so the pose holds under the text instead of racing it |
| 2026-08-13 | `items.js` has no ROM fallback | The NES says nothing at a pickup, so there is no 1986 line to fall back to — a deleted entry is silence, and that is the honest behaviour |
| 2026-08-13 | The epilogue is a new phase, not a longer `PeaceText` | `EndingFlashLongTimer` ends the peace submode on a fixed timer; anything past ~70 glyphs types into a screen that has already gone |
| 2026-08-13 | Epilogue pages are set as a block, not centered line by line | Per-line centering is right for the ROM's one-line boxes and turns a wrapped paragraph into a diamond |
| 2026-08-13 | Most person entries live in `byTextId` with a comment naming the labyrinth | Resolving real spawns showed each text belongs to one dungeon; a compound key would be redundant, and redundancy drifts |
| 2026-08-13 | A queued beat dies with its situation | `closeDialogue()` in place of bare `textBox.close()` — every forced close is a mode change, and a shopkeeper's follow-up has no business opening over the overworld |
| 2026-08-13 | The missed-treasure audit is held to one page per line | It lands after a dozen pages the player already read and is the part they did not ask for |
| 2026-08-14 | The prologue is generated to a PNG, the epilogue is drawn live | The prologue is static and scrolls, so baking it costs nothing; the epilogue types, which a baked image cannot do. They share the composer's geometry, so they still match |
| 2026-08-14 | Authored boards go to `prologue.png`, never over `story.png` | `story.png` belongs to `npm run extract -- demo`; writing there means the next extract silently reverts the prologue |
| 2026-08-14 | The attract sequence derives its panel count from the image height | The alternative is a constant that has to be edited in step with the prose, which is exactly the kind of pair that drifts |
| 2026-08-14 | Prologue body rows stay double-spaced | Single spacing would fit ~20 lines a panel instead of 11, but NES attributes are 16px tall — a coloured word would bleed onto the line above it |

## Open questions

- Death and the continue menu still say nothing. It was on the table and cut;
  the hook would sit in `beginDeath`.
- The prologue's four panels add roughly 40 seconds to an attract loop nobody
  watches twice. Start still skips it instantly, but if it plays long, cut a
  paragraph from `story/prologue.js` — the panel count follows the prose.
