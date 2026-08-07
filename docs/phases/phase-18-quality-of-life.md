# Phase 18 — Quality of Life 1

**Status:** Complete  
**Outcome:** Make improvements beyond the original game

## Checklist

- [x] In the overworld, rather than doing screen transitions, where hitting the edge of the screen moves you to the next screen, we should be able to smoothly walk between screens with the view centered on link at all times except at the extreme edges of the map. So essentially, if Link is moving left, the camera should move with him and load tiles and enemies from the next screen as needed. As soon as an enemy comes into view, it can also follow Link beyond the bounds of the area that it was previously within, so long as it remains on screen. 
- [x] Transitions to dungeons, caves, and so on, will be the only actual transitions in the game rather than smooth scrolls as above. 
- [x] Same as above, but for dungeons. In dungeons, if you have not yet visited a room, you should not see the contents of that room until it becomes visited. Once a room is visited, it should be visible and the player should be able to see the contents of the room. Enemies will not appear and become active until the room is visited, and will not become inactive until they fully go off screen. Revisiting a room that previously went completely off screen should regenerate the enemies as if the room was being visited in the normal mode. 
- [x] Link's sword should swing on an arc rather than in a straight line, similar to newer 2D Zelda games such as Link's Awakening and A Link to the Past. 

## Done when

All of these items are implemented.

## Notes

- Shared modules (`continuousCamera`, `multiRoomTiles`, `roomStream`) plus `game/src/play/streamView.js` own the geometry / streaming / fog helpers; `game/src/play/main.js` wires them into the play loop.
- OW: `detectRoomCross` + rebase; mazes use `mazeLoopSpawn` (no neighbor cross) and respawn that screen’s foes.
- UW: door exits call `softEnterDungeonRoom` (no ScrollWorld freeze) and keep rebased Link coords so doorways feel like a path. Locked key doors stay solid until bumped with a key. Unvisited neighbors draw black fog via `streamView.setFog`. Spawn latch released when a room fully leaves the camera (`releaseSpawnLatch`).
- Hard cuts kept: cave enter/leave, dungeon enter/exit, cellar stairs, raft room change, whirlwind, death/continue.
- Sword draw uses UP CHR + `swordSpriteRotation(angle)` with center pivot.
- Legacy `beginOverworldScroll` / `beginDungeonScroll` remain in `main.js` but are no longer called from the step loops.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-06 | Streams are source of truth for OW/UW backgrounds; `bg` / `roomSprite` are aliases to the current stream sprite | Keeps `patchOwBgSquare` / room painting working without dual ownership |
| 2026-08-06 | Dungeon soft-enter keeps rebased Link coords (no `dungeonRoomSpawn` teleport); locked doors are solid until unlocked | Removes doorway camera skip; keys remove the door block like a path |
| 2026-08-06 | Enemy chase bounds use `chaseBoundsForCamera` in OW/UW | Lets active foes follow Link across seams until culled off-camera |
| 2026-08-06 | `stepEnemy` must forward `collidingTile`/`standingTile`; never `& $F8` on continuous X | Offset foes were colliding against the clamped anchor grid and sinking into trees |
| 2026-08-06 | Spawn latch releases only when a room fully leaves the camera; living foes stay while home room is visible | Kill-all must not refill mid-visit; peek+chase must not empty a visible room |
| 2026-08-06 | Clock freezes only enemies visible at pickup (`clockFrozen`); clears on room change / hurt / last tagged death | Continuous OW kept `inv.clock` forever across soft enters |
| 2026-08-07 | Streamed foes use `viewActivated` — AI/draw start only after first camera intersection | Neighbor tektites on `$77` were hopping before entering view |
| 2026-08-07 | Spawn latch stays while home foes live; room spawns use `tryAddMonster`; spawn before combat | Seam revisit stacked inert octorok copies |
| 2026-08-07 | Vertical look-ahead prefers an OW warp tile when either sampled column is one | `$0F` cave mouth was only enterable from an 8px band beside ornament solids |
| 2026-08-07 | Warp/dungeon entry accepts off-grid Y on a warp; `detectRoomCross` snaps Y to `$?D` | Soft-cross could wedge Link on Level 1's mouth at Y=`$84` |

## Open questions

- Inventory / cave / HUD stay on `world` / stage; only the play field is camera-offset.

## Follow-up

Four assumptions that only held on a single screen survived this phase and
caused frozen monster sprites, collision drifting off its art, and dead cave /
shutter triggers. See [Phase 20](./phase-20-streaming-cleanup.md).
