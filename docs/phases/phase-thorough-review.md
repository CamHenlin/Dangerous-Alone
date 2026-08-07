# Phase THOROUGH-REVIEW — Feature completeness & correctness audit

**Status:** Complete (with intentional-diff / deferred items noted below)
**Outcome:** Close every verified gap between our reimplementation and the original USA PRG1 ROM, so the game is feature complete and behaviorally correct.

## How this list was built

Five parallel subsystem audits compared `tools/shared/`, `game/src/`, and `tools/extract/` against the
ca65 disassembly in `reference/zelda1-disassembly/src/`, cross-checked with `docs/context/walkthrough.txt`.

Every item below cites the ROM label that defines the expected behavior. Items are **verified against the
disassembly**, not against community lore — see [Rejected findings](#rejected-findings-verified-not-bugs)
for claims that were investigated and disproved.

**Baseline at time of audit:** 416 tests pass; phases 0–17 complete; 142 rules tracked in
[`../behavior-oracle.md`](../behavior-oracle.md).

**Post-implementation:** 598 tests pass. Remaining open boxes are deferred (P18/P19 conflicts) or
reclassified as `intentional-diff`.

---

## Severity legend

| Severity | Meaning |
|----------|---------|
| **BLOCKER** | Original behavior is absent entirely, or progression/experience is broken |
| **MAJOR** | Present but noticeably wrong; a longtime player would spot it |
| **MINOR** | Polish / fidelity nit |

---

## BLOCKER — missing systems

### B1. Lost Woods maze (room `$61`)

- [x] Implement `CheckMazes` for the forest maze
- **ROM:** `CheckMazes` @ `Z_01.asm:4837`; `ForestMazeDirs` @ `Z_01.asm:4828` = `$08,$02,$04,$02` (Up, Left, Down, Left)
- **Now:** `tools/shared/mazes.js` + wired in overworld screen transitions

### B2. Lost Hills maze (room `$1B`)

- [x] Implement `CheckMazes` for the mountain maze
- **ROM:** `MountainMazeDirs` @ `Z_01.asm:4831` = `$08,$08,$08,$08` (Up ×4)
- Shares one implementation with B1

### B3. Attract / demo mode + story scroll

- [x] Implement game mode `$00`
- **ROM:** `UpdateMode0Demo` / `InitDemo_RunTasks` / `AnimateDemo` @ `Z_02.asm:180–538`
- **Now:** `tools/shared/demoMode.js` + `tools/extract/demo.js` → `play/demo.json` + `play/title.png` / `play/story.png` (ROM `GameTitleTransferBuf` / `StoryTileAttrTransferBuf`); `game/src/play/demoUi.js` renders title/waterfall/fade, storyboard scroll/hold, then treasure crawl; boot runs attract until Start, then file select. Title song playlist is wired.

### B4. Death sequence + Continue/Save/Retry menu

- [x] Implement game mode `$11` (death) and mode `$08` (continue question)
- **Now:** `deathSequence.js` / `continueMenu.js` / `deathUi.js`
- [x] Death counter on file select; tallied at submode `$C`
- [x] Continue restores three hearts (`CONTINUE_HALF_HEARTS`)

### B5. Ending sequence + credits + second-quest prompt

- [x] Implement game mode `$13`
- **ROM:** `UpdateMode13WinGame` @ `Z_02.asm:3203`; `DrawCredits` @ `Z_02.asm:3768`; `SwitchProfileToSecondQuest` @ `Z_02.asm:4037`
- **Now:** `endingSequence.js` / `endingText.js` / `endingUi.js` wired from `checkZeldaRescue`; Start on the tableau calls `beginSecondQuestAfterVictory`

### B6. Second quest is unreachable

- [x] Unlock Q2 by registering the name `ZELDA` — **ROM:** `Z_02.asm:1683`
- [x] Unlock Q2 after beating the game — **ROM:** `SwitchProfileToSecondQuest` @ `Z_02.asm:4037`
- **Now:** `nameUnlocksSecondQuest` / `resetProfileToSecondQuest` in `save.js`

---

## MAJOR — present but wrong

### Overworld

- [x] **M1. `CheckShortcut` warp-stair network missing.** **Rejected — see [R9](#rejected-findings-verified-not-bugs).**
- [x] **M2. Flute room `$42` Q1/Q2 behavior not branched.** Implemented in `WieldFlute` path.
- [x] **M3. Screen transitions are instant cuts.** NES ScrollWorld speeds via `screenScroll.js` (OW/UW).

### Dungeon

- [x] **M4. Shutter doors never re-close on entry.**
- [x] **M6. Triforce pickup lacks the mode `$12` ceremony.**
- [x] **M7. Map/compass use global booleans.** **Reclassified `intentional-diff`** — per-level save/restore matches observable behavior.

### Enemies

- [x] **M8. Red and Blue Wizzrobe AI split** (`wizzrobeAi.js`; colours match ROM: blue walks, red teleports).
- [x] **M9. Pols Voice hop machine** (`polsVoiceAi.js`).
- [x] **M10. Ghini dedicated AI.**
- [x] **M11. Ganon blue-phase flicker.**

### Link / combat

- [x] **M13. Sword beam at RECOVER_A.**
- [x] **M14. Book of Magic rod fire.**

### Audio

- [x] **M15–M22.** Channel priority, title/ending playlists, ROM SFX/DPCM/envelopes, unused cue wiring.

### Text & presentation

- [x] **M23. Dialogue uses NES font.** Cave + underworld person typewriter via `nesMultilineText` / `common_background` CHR (prices too).
- [x] **M24. Title screen is plain text.** Attract mode draws `demo_background` / `demo_sprites` (NES title art). File select remains a simplified UI (mode `$01`).
- [x] **M25. Potion shop letter step.** `potionShop.js` + B allowed in caves for `canShowLetter`; `cycleBItem` offers the potion slot when letter is held (`CheckMissingItem`).
- [x] **M26. Name entry NES character grid.** `nameEntry.js` / `nameEntryUi.js` wired through `titleUi`; in-game Q2 `"2"` badge under the minimap when `inv.quest === 2`.

---

## MINOR

### Enemies

- [x] N1. Bubble turn rate `$40`.
- [x] N2. Moldorm/Lanmola — two 5-seg chains (10 objects), matching `InitMoldorm` / `InitLamnola`.
- [x] N3. Spawn cloud puff (`spawnCloud` + `cloudTexture`) on OW/UW spawn and edge entry.
- [x] N4. Object-slot cap.
- [x] N5. Aquamentus aimed spread.
- [x] N6. Gleeok neck visuals — **already drawn** (`gleeok.js` + `enemySprites.js`); residual lerp stretch vs ROM physics is polish-only → `intentional-diff`.
- [x] N7. Tektite/flyer timer simplifications — **`intentional-diff`** (documented in phase 14).

### Dungeon

- [x] N8–N11. LevelInfo fields, FOES_FOR_ITEM tune, Wallmaster snapshot.

### Overworld / caves

- [x] N12. Flute pond color-cycle (`pondSecret.js`).
- [x] N13. `UndergroundExitType` latch.
- [x] N14. Cave dweller art stand-ins — **`intentional-diff`** (`CAV-09`).
- [x] N15. Raft CHR tile `$6C` via `itemTexture`.
- [x] N16. Gambling uses `MoneyGamePermutations` / end-indexes; slot by ware X.
- [x] N17. Q2 OW layout rebuilds — **matches ROM** (only rooms `$0B`/`$3C`/`$74`); attr patches cover the rest.

### Link

- [x] N18–N21. Stair slowdown, `itemLiftTimer`, dual candle flames, rupee roll.

### Save

- [x] N23. Autosave documented as `intentional-diff`.

---

## Rejected findings (verified NOT bugs)

Recorded so these don't get re-raised.

- **R1. Pols Voice is NOT killed by the recorder in this ROM.** Widely repeated as fact, but `UsedFlute`
  appears at only three sites (`Z_04.asm:5180`, `5208`, `5276`) and **all three are Digdogger**. The
  whistle-kills-Pols-Voice behavior is from the Japanese FDS release; it is absent from USA PRG1. Our
  sword-only + arrow-instakill handling is correct.
- **R2. Bubble "wall-hugging" AI does not exist.** `UpdateBubble` @ `Z_04.asm:1122` is a plain
  `UpdateCommonWanderer` call. Our generic-wander routing is right; only the turn rate is off (see N1).
- **R3. No separate Rupee/Bomb Zola object types.** Only Zora `$11` exists.
- **R4. No boss key, dual-torch puzzle, moving floor, or sand conveyor in Z1.** Dark rooms use the
  single-candle mechanic, which is implemented.
- **R5. No day/night cycle, swimming, or sword spin/charge in Z1.**
- **R6. `dummyEnemy.js` is dead code in production** — test harness only, never imported by `main.js`.
  Not a bug; noted so future auditors don't flag it.
- **R9. `CheckShortcut` is unreachable in the shipped ROM.** Originally filed as "M1: warp-stair network
  missing", and the original description was also wrong — `CheckShortcut` (`Z_05.asm:6071`) *exits* when the
  secret has been found (`ASL / BCS @Exit`), so it is not a post-secret reveal. It then requires bit 5
  (`$20`) of the room's flags. Only `MarkRoomVisited` (`Z_07.asm:783`) sets that bit, and its sole play-mode
  caller skips it in the overworld (`Z_07.asm:1589`: `LDA CurLevel / BEQ …` branches past the `JSR`); the
  other caller is cellar-only. The three `$80`-byte flag blocks (`WorldFlagBlockAddrs` @ `Z_02.asm:4034` =
  `$067F/$06FF/$077F`) keep the overworld's flags separate from the dungeons', so a UW visit cannot leak
  into an OW screen either. Every other `ORA #$20` in the ROM is sprite priority or Link's boomerang-catch
  state. The overworld "take any road" warp caves that *do* work are reached through ordinary
  bomb/burn secret stairs, which we already implement.
- **R8. Minimap rotation is already handled correctly.** Originally filed as "M5: ignores
  `submenuMapRotation`". In fact `roomsFromDrawnMap` (`dungeons.js:269`) applies the inverse rotation at
  *decode* time to recover true RoomIds, and `minimap.js` then crops to `roomBounds()` in RoomId space.
  That is geometrically correct and keeps Link's dot aligned; re-applying the rotation at draw time would
  corrupt it. `submenuMapRotation` is a fixed-width-window centering trick on NES, which our
  bounding-box crop replaces. Verified on Q1 L1 (rot=4): rooms decode to a contiguous cols 1–5 / rows 2–7
  cluster, with the lone col-15 outlier `$7F` correctly excluded as a cellar.
- **R10. `inv.clock`, `swordBlocked`, and `UsedFlute` are *supposed* to be session-only.** Originally filed
  as "N22: not persisted". Loading a profile copies `Items` bytes `$00–$27` (`$657–$67E`) out of SRAM and
  then immediately zeroes `SwordBlocked` and `InvClock` (`@ChooseSlot` @ `Z_02.asm:2812`), so the clock
  never survives a load even though its byte lives inside the saved block. `UsedFlute` (`$51B`) and
  `SwordBlocked` (`$52E`) sit outside the block entirely. The rest of the block is accounted for:
  `LastBossDefeated` (`$672`) is persisted per level as `lastBoss`, and `WorldFlags` (`$67F`) is copied
  separately. Our session-only handling matches.
- **R7. Invincibility duration (48f) is correct.** Originally filed as "M12: ~2× too long" because
  `BeginShove` sets `ObjInvincibilityTimer = $18` (24). But `DecrementInvincibilityTimer` @ `Z_07.asm:5782`
  only decrements **every second frame** (`LDA FrameCounter / LSR / BCS @Exit`), so `$18` ticks = 48 game
  frames. `inventory.js:176` and oracle rule ATK-03 were both right.

---

## Suggested sequencing

1. ~~**Reachability first** — B6 (Q2 unlock).~~
2. ~~**Cheap correctness** — M12, M13, N1, N19, M5, M4.~~
3. ~~**Missing progression** — B1/B2 (mazes), M1 (shortcut network).~~
4. ~~**Enemy AI** — M8, M9, M10, M11.~~
5. ~~**Audio data** — M17/M18/M19, then M15/M16/M21/M22.~~
6. ~~**Framing modes** — B3, B4, B5.~~
7. ~~**Deferred** — M3 / M23~~ (implemented; P18/P19 remain separate QoL tracks).

## Done when

Every unchecked box above is either implemented or explicitly reclassified as `intentional-diff` in
[`../behavior-oracle.md`](../behavior-oracle.md).

**Remaining unchecked:** none.

## Notes

- Attract/demo extract: `npm run extract -- demo` → `assets/extracted/play/demo.json`
- Ending extract: `npm run extract -- ending` → `assets/extracted/play/ending.json`
- Boot path: attract → Start → file select → play. Debug: `?skipTitle=1`

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-06 | Defer M3 + M23 | P18/P19 replace NES scroll and dialogue font |
| 2026-08-06 | Implement M3 NES scroll | ScrollWorld speeds in `screenScroll.js`; P18 remains a separate continuous-camera QoL track |
| 2026-08-06 | Implement M23 NES dialogue font | `nesMultilineText` in cave/person dialogue; P19 remains a separate QoL track |
| 2026-08-06 | File select stays simplified | Mode `$01` is not the title CHR; attract covers M24 |
| 2026-08-06 | N6/N7/N14 as intentional-diff | Visual polish / documented stand-ins; fight logic correct |

## Open questions

- ~~Should M3 / M23 be implemented?~~ Both done (NES scroll + NES dialogue font).
- ~~Faithful ending wanted?~~ Implemented via `endingUi`.
