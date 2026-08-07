# Phase 20 — Continuous-camera cleanup

**Status:** Complete
**Outcome:** Monsters, collision, and triggers behave correctly under the
Phase 18 continuous camera

## Checklist

- [x] Monsters generate and despawn correctly — no foes frozen in place, no
      foes that run no AI and neither take nor deal damage
- [x] Collision stays attached to the graphics it belongs to
- [x] Caves, dungeon entrances, room-clear shutters, and fairies keep working
      after many screens of travel

## What was actually wrong

Phase 18 replaced per-screen transitions with a camera that keeps several
rooms live at once. Four assumptions that were safe on a single screen stopped
holding, and each produced one of the reported symptoms.

### 1. Enemy sprites outlived their enemies

`syncEnemySprites` only destroyed a sprite when it found the foe still in
`enemies` with `alive === false`. Every path that drops a foe *out of the
array* — `cullOffscreenEnemies` (which sets `alive = false` and removes it in
the same call), the room filter on a seam cross, the maze loop, `enemies = []`
in `loadOverworldScreen` — orphaned its `enemyGfx` entry instead. The sprite
stayed parented to the play field at its last world position forever.

That is precisely "a monster frozen to a spot that runs no AI and takes no
damage": there was no monster, only its picture. Walking a stress route of
~4 200 frames left **45 orphaned sprites against 8 live foes**.

`syncEnemySprites` now sweeps `enemyGfx` for ids that are no longer in
`enemies`, the way `projGfx` and `dropGfx` already did. It covers every
removal path, present and future, rather than patching each caller.

### 2. One monster table for the whole neighbourhood

`FindEmptyMonsterSlot` gives the NES 11 monster slots — **per screen**, because
only one screen exists. `tryAddMonster` kept that as a flat cap on the whole
streamed list, so two neighbours could exhaust the table and the room Link was
standing in would spawn nothing. The probe caught the table saturated at 11
across three rooms with Link's own room among the starved.

`tryAddMonsterToRoom(enemies, foe, roomId)` budgets `MONSTER_SLOT_COUNT` per
home room under a global `STREAM_ROOM_CAP` ceiling. Dead foes linger in the
list until their room leaves the camera but no longer hold a slot, matching the
ROM (the slot frees on death).

### 3. Room rules asked of every room

`roomAllDead`, the ringleader's "slot 1", money-or-life, the bomb-upgrade
person, the key that rides slot 1, and `roomKillCount` were all evaluated over
the entire streamed list. A visible neighbour with one living foe kept the room
Link stood in from ever clearing — shutters stayed shut and items never
appeared, which reads exactly like "triggers stop working after a few screens".

`enemiesInRoom(enemies, roomId)` is now the view those rules see. Untagged foes
count as members so caves and other single-screen modes are unaffected.

### 4. Stale aliases between collision and art

`screen`, `bg`, `roomSprite`, and `dungeonTileGrid` were rebound with
`?? previous` fallbacks. When a room was still streaming, the fallback left
them pointing at the room Link had just walked out of:

- `screen` carries the collision grid, the warp `caveId`, and the secret list —
  a stale one means cave mouths do nothing and secrets fire on the wrong screen.
- `patchOwBgSquare` / `patchRoomSquareAt` paint through those aliases, so a
  revealed secret or a pushed block changed the art on one room while the
  collision changed on another. That is the "collision drifts away from the
  object" report.

Every one of those bindings is now strict. `owScreenBound()` holds the world
still for the frame or two a not-yet-streamed room needs instead of stepping
against the wrong screen, and retries until the stream lands.

### 5. Armos reveals restored on the wrong square

`restoreArmosReveals` rebuilt each persisted patch by asking
`armosSecretAt(roomId, { x: col * 16, y: SECRET_ARMOS_Y })` — it kept the
stored **column** but threw the stored **row** away and substituted the
secret's own Y. Every Armos sharing the secret's column therefore came back as
a staircase.

On `$0B` that is visible from across the screen: the Level 5 door is ringed by
eight statues in two rows, and only the one at square (row 4, col 11) hides
stairs. Wake all eight, leave, come back, and the plain statue directly below
it has become a **second staircase** — which also warps into Level 5, because
`checkCaveEntry` returns the screen's single `caveId`. The reveal now uses
`HUD_HEIGHT + row * 16`, so each statue restores its own square.

Reproduced live and re-checked: after waking all eight and reloading the
screen, the grid holds exactly one `$70` at (row 4, col 11) and floor
everywhere else.

### 6. The underground-exit latch could outlive its purpose

`undergroundExitType` suppresses the warp Link just stepped out of. It cleared
on a single frame transition (`gridOffset` non-zero → zero) evaluated *inside*
the movement block, and nothing else in the game resets it.

Knockback moves Link through `stepShove`, which skips that block and leaves
`gridOffset` at 0 the whole way. Traced: a hit taken on the way out of Level 5
carried Link 28px clear of the mouth across 7 frames with `gridOffset` never
leaving 0 — the clear never ran. Walking normally afterwards does clear it, so
this is a stuck window rather than a permanent wedge, but while it is set
*every* cave and dungeon mouth silently refuses to open. It is now keyed on
whether Link is still standing on a warp tile, which cannot miss.

### Smaller fixes found along the way

- Edge-spawn (`monsterEntry` screens) only ever considered the anchor room, so
  a neighbour's edge foes sat `edgePending` forever: invisible, inert, and
  holding a monster slot. Placement now runs against each foe's own room grid,
  with Link's position mapped into that room's space for the distance test.
- Knockback moves Link inside `stepCombat`, after the seam check. A shove
  across a seam left the anchor one frame behind, so the cave-warp lookup ran
  against the screen Link had already left. `resolveOwRoomCross` now also runs
  after combat.
- Vire/Zol death splits, Gleeok heads, Digdogger children, and boulder rockfall
  inherit the parent's home room instead of spawning untagged.

## Verification

`?debug=1` gained `zeldaDebug.probe()`, which reports the invariants that
break when the stream desynchronises: `roomId` vs the bound `screen`, `roomId`
vs the room Link's world position falls in, whether the collision grid is the
same array the stream hands the tile probes, the enemy-id/sprite-id sets, and
per-room foe counts. `moveProbe()` reports every gate that can stop `stepLink`,
and `warpProbe()` answers "why did this cave mouth do nothing".

### The stepper had to be fixed first

`zeldaDebug.step(n)` did not simulate n frames. Two faults, both of which made
the harness lie about the game:

- It reseeded its fake clock from `performance.now()` on every call. A batch
  ran the clock ahead of the wall clock, so the next call handed Pixi a
  timestamp older than the ticker's own `lastTime` and every update was
  dropped. Backgrounded tabs get no rAF to correct it, so the game simply
  stopped advancing while the harness counted frames.
- The loop derived its step count from elapsed wall time, so `step(n)` ran
  however many frames the tool call happened to take — often zero.

`step()` now advances a monotonic clock and hands the loop an explicit
`debugSteps` count, one ticker pass per frame. Confirmed exact: `step(1)`,
`step(37)` and 25×`step(1)` advance the frame counter by 1, 37 and 25.

It still cannot resolve promises inside its synchronous loop, so a caller that
needs a pending `enterLevel` / screen load to settle must `await` between
calls. A long unawaited batch starves every async transition and looks exactly
like a hang — that false signal cost real time before it was understood.

### Results

Post-fix, on the corrected stepper: **12 940 frames** of overworld travel
across `$77`/`$67`/`$76`/`$75`, plus a Level 1 run — zero violations, with
`enemyIds.length === spriteIds.length` throughout.

The pre-fix leak evidence is a state observation, not a frame count, so it
stands: the same route left **45 orphaned sprites against 8 live foes**.

`npm test` — 731 pass.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-07 | Sprite lifecycle is reconciled from the enemy list each frame, not at each removal site | Six code paths drop foes from the array; only a sweep is safe against the seventh |
| 2026-08-07 | Monster slots are budgeted per home room (`tryAddMonsterToRoom`) | The ROM's 11 slots are a per-screen budget; a streamed neighbourhood needs the same budget per room or Link's own room starves |
| 2026-08-07 | Dead foes keep their place in the list but not their slot | They are still needed for splits and the dropped-key position that frame; the ROM frees the slot on death |
| 2026-08-07 | Room-clear rules read `enemiesInRoom`, never the streamed list | A neighbour's foes were holding shutters shut |
| 2026-08-07 | `screen` / `bg` / `roomSprite` / `dungeonTileGrid` never fall back to the previous room | The fallback is what tore collision away from art and killed cave warps |
| 2026-08-07 | A room that is still streaming halts the step loop instead of running on the old screen | One or two frozen frames beat a frame of wrong-screen collision and warps |
| 2026-08-07 | `world.test.js` "OW $0F secret cave" drops X=$78 | X=$78 is not a mouth column — Link's left half stands on mountain tile `$A5`, and the mid-cell standing test correctly refuses it |
| 2026-08-07 | `step()` takes an explicit frame count instead of inferring one from elapsed time | A harness that silently simulates zero frames turns every investigation into guesswork; three "reproductions" this phase were the stepper, a dead Link, and a starved promise |
| 2026-08-07 | Persisted Armos reveals restore from the stored row, not the secret's Y | Keeping the column but not the row turned every statue in the secret's column into a staircase |
| 2026-08-07 | `undergroundExitType` clears on "Link is off the warp tile", not on a `gridOffset` edge | The edge lived in a block that knockback skips, so a hit taken while leaving a cave kept every mouth shut until the next normal walk |
| 2026-08-07 | Cave/dungeon entry ignores NES Y nibble `$D` when feet are on a warp; soft-cross snaps Y to `$?D` | Continuous seam + stair QSpeed left Link on Level 1's mouth at Y=`$84` with solid look-ahead and no warp |

## Open questions

- At a four-room corner the camera can show slices of four rooms, so up to ~13
  foes can be active on screen at once versus the NES's 11. That is inherent to
  the continuous camera rather than a bug, but if it plays too crowded the knob
  is `spawnVisibleOwRooms`' `margin: 0` candidate set.
- **Screen `$0B`'s Armos staircase warps to Level 5.** `checkCaveEntry` returns
  the screen's single `attrs.caveId`, and `$0B`'s is `5`, so the staircase the
  secret Armos uncovers leads to the same dungeon as the front door six squares
  to its left. Confirmed live: standing on the revealed `$70`–`$73` square
  gives `{ kind: 'level', id: 5 }`. Whether the ROM gives these seven
  `SECRET_ARMOS_ROOMS` a separate destination (a `stairPositionIndex` /
  secondary cave lookup) has not been traced yet — the two Armos screens that
  are also level screens (`$0B` level 5, `$22` level 6) are the only ones where
  it is observable.
