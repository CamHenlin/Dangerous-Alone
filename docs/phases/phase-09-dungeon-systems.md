# Phase 9 — Dungeons as a system

**Status:** Complete (Quest 1 MVP end-to-end)  
**Outcome:** Full underworld loop.

## Checklist

- [x] Room transitions with real key doors (consume key, persist open)
- [x] Shutters open on room clear (per-room / both sides)
- [x] Bombable walls open from bomb blast near doorway
- [x] Walk-through walls (`wall_or_pass` always passable)
- [x] Push blocks + UW stairs / cellar (L1 Bow path)
- [x] Raft / ladder dungeon puzzles (MVP)
- [x] Triforce piece bitmask + heart-container boss reward (L1–L8)
- [x] Compass / map submenu text map (visited + boss/triforce marks)
- [x] Dark rooms + candle (blue once/stay; red unlimited)
- [x] Levels 2 → 9 bosses (generic stubs) + items; Quest 2 data flag
- [x] Level 9 → Ganon → Zelda end overlay

## Done when

Quest 1 is completable: all triforces → Level 9 → Ganon → Zelda.

## Commands

```bash
npm test
npm run extract -- dungeons
npm run dev
# http://localhost:5173/play.html
# http://localhost:5173/play.html?debug=1   # full kit + 8 TF for L9 testing
# http://localhost:5173/play.html?quest=2   # load Q2 dungeon packs
```

**L9 path (debug):** `?debug=1` → L9 cave → silver arrows cellar `$4F` (if needed; debug already has them) → Patra `$52` → Ganon `$42` (dark; candle + silver arrows) → north to Zelda `$32` → walk up to her.

**Raft:** L3 cellar `$0F` → Raft; OW docks `$3F` / `$55` face up near water.  
**Ladder:** L4+ cellar / item → `$F4` water tiles become walkable.

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Door state | `tools/shared/dungeonDoors.js` |
| Push / cellar / candle / map | `pushBlock.js`, `dungeonCellar.js`, `candle.js`, `dungeonMap.js` |
| Boss stubs | `tools/shared/bosses.js` |
| Raft / ladder | `tools/shared/raft.js`, `ladder.js` |
| Arrows | `projectiles.js` `shootArrow` + B-item Bow |
| Play wiring | `game/src/play/main.js` |

### Boss MVP

| Level | Boss | Damage |
|------:|------|--------|
| 1, 7 | Aquamentus | Sword (+ existing AI) |
| 2 | Dodongo | Sword |
| 3 | Manhandla | Sword |
| 4, 8 | Gleeok | Sword |
| 5 | Digdogger | Sword (no flute split) |
| 6 | Gohma | Arrows only |
| 9 | Ganon | Silver arrows only |
| 9 | Zelda | NPC — proximity ends quest |
| 9 | Patra | Sword stub |

Bosses without CHR frame tables draw as colored rectangles.

### Intentional simplifications

- Boss AI is pace-left/right (except Aquamentus); no multi-head / eye / flute phases
- Raft is a dock-edge teleport, not `UpdateDock` scroll
- Ladder remaps `$F4` → floor (no ladder object sprite)
- Orphan cellars discovered via layout `$3E/$3F` + attrs A/B (fixes L3 raft)
- Quest 2 is a load-path flag only (`inv.quest`); OW transforms later in Phase 15
- End sequence is a text overlay (no credits curtain)
- `?debug=1` grants full mid/late-game kit for L9 verification

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Persist door opens in a Set for the dungeon visit | WorldFlags deferred to Phase 12 |
| 2026-08-05 | Generic boss stubs for L2–9 | Completable path without full AI ports |
| 2026-08-05 | Gohma/Ganon arrow-gated | Preserves item dependency without full patterns |
| 2026-08-05 | Discover orphan cellars at buildLevel | LevelInfo cellar list incomplete (L3 raft) |
| 2026-08-07 | Discover bomb-secret rooms omitted from DrawnMap | L7 `$08`/`$1a` (and peers) were openable but had no destination room |
| 2026-08-05 | `inv.quest` selects `q1`/`q2` JSON | Minimal Quest 2 flag |

## Open questions

- ~~Persist door / clear / push / triforce in WorldFlags (Phase 12)?~~ → done in Phase 12 save slots
- ~~Replace boss stubs with per-boss AI in Phase 13?~~ → Phase 15 (`bossAi.js`)

## References

- [`docs/behavior-oracle.md`](../behavior-oracle.md)
- aldonunez `Z_04`/`Z_05`/`Z_07` bosses, dock, ladder, CheckSubroom
- Local `docs/context/walkthrough.txt` (gitignored)
