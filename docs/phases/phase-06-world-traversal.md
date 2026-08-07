# Phase 6 — World traversal

**Status:** Done  
**Outcome:** Explore the whole overworld; reach Level 1 stub.

## Checklist

- [x] Screen-to-screen transitions (instant cut; NES scroll deferred)
- [x] Load attributes per screen (palette ids, caveId, etc. from play packs)
- [x] Cave / dungeon entrances: detect warp tiles; Level 1–9 → stub dungeon room
- [x] Special terrain: hooks only (water/ladder/graves deferred; warp tiles wired)
- [x] HUD stub: hearts, rupees, keys, bombs, location label

## Done when

You can walk from the start to Level 1’s entrance and enter a placeholder dungeon room.

## Commands

```bash
npm run extract -- overworld   # writes play/world_index.json + play/screens/*.json
npm run extract -- dungeons    # Level 1 room art for the stub
npm run dev                    # http://localhost:5173/play.html
```

**Path to Level 1:** from start `$77` walk **north** four screens to `$37`, stand still on the cave mouth (`↓` exits the stub back to OW).

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| World index + screens | `assets/extracted/play/world_index.json`, `play/screens/XX.json` |
| Transition / cave logic | `tools/shared/world.js` |
| Play loop | `game/src/play/main.js` |
| HUD stub | `game/src/play/hud.js` |

### Behavior

| Item | Detail |
|------|--------|
| Edge trigger | `PlayerScreenEdgeBounds` `$3D/$DD/$00/$F0` when `gridOffset===0` |
| Room Δ | N −`$10`, S +`$10`, W −1, E +1 (16×8 map; null off-edge) |
| Arrive spawn | Instant cut on walk grid: `$CD` / `$4D` / `$E0` / `$10` (not raw `$4E`/`$11`) |
| Warp tiles | `$24`, `$88`, `$70`–`$73` while standing (`Y&$0F===$0D`) |
| Level entry | `caveId` 1–9 → dungeon stub (Q1 room art) |
| Other caves | `caveId≥$10` → full cave UI (Phase 10) |
| Leave Level 1 | Walk south off stub → OW `$37` at exit X=`$70`, Y=`$7D` |

### Intentional simplifications

- No NES nametable scroll animation (instant screen swap)
- Dungeon rooms: full walls/door faces via `composeDungeonRoomTiles` (runtime + extract)
- Non-level caves not enterable yet
- Water / raft / ladder / secrets not implemented

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Instant screen cut | Matches phase “scroll style choice”; scroll can come later |
| 2026-08-05 | Per-screen `play/screens/*.json` | On-demand tile grids without a huge single JSON |
| 2026-08-05 | Allow walk past `ObjectRoomBounds` toward edges when a neighbor exists | Required to reach `PlayerScreenEdgeBounds` |

## Open questions

- Port mode-7 scroll animation before Phase 7, or keep instant?
- Enter sword cave (`caveId=$10`) as a text/NPC stub in Phase 10?

## References

- aldonunez `Z_07.asm`: `PlayerScreenEdgeBounds`, `CheckScreenEdge`
- aldonunez `Z_05.asm`: `NextRoomIdOffsets`, `HandleWarpOW`, scroll spawn
