# Phase 4 — Underworld / dungeon extraction

**Status:** Done  
**Outcome:** Levels 1–9 (+ quest 2) as data + dungeon map viewer.

## Checklist

- [x] Extract dungeon room templates / column macros
- [x] Extract per-level headers: palettes, boss room, stair/cellar list, map bits, start room, etc.
- [x] Extract room grid (shared layouts for level groups / quests as documented)
- [x] Extract door types, item rooms, pushable blocks, underground passages (cellar room IDs)
- [x] Emit `dungeons/qN/level_N/` JSON + PNGs + dungeon map viewer

## Done when

Level 1 layout, item locations, and boss room match a known map; Level 9 and 2nd quest variants are represented in data (even if unused by gameplay yet).

## Commands

```bash
npm run extract -- graphics   # required first (UW tiles + level palettes)
npm run extract -- dungeons
npm run dev                   # http://localhost:5173/dungeon.html
```

## Notes

- Schema: [`assets/schema/dungeons.json`](../../assets/schema/dungeons.json)
- Decoder: [`tools/shared/dungeons.js`](../../tools/shared/dungeons.js)
- Extract: [`tools/extract/dungeons.js`](../../tools/extract/dungeons.js)
- Viewer: [`game/dungeon.html`](../../game/dungeon.html)

### Format (verified on USA PRG1)

| Piece | Detail |
|-------|--------|
| Room layouts | 42 × 12 column descriptors @ `0x160DE` |
| Column heaps | 10 tables; bit7 = column start; bits0–2 = square; bits4–6 = extra repeats |
| Primary squares UW | `$B0,$74,$94,$B4,$70,$68,$F4,$24` — `WriteSquareUW`: consecutive tiles if `$70 ≤ p < $F3`, else solid |
| Floor size | **12×7 squares** (walls/doors drawn separately in-game; not in floor extract) |
| Level blocks | 768 B: NS doors, EW doors, monsters, room types, floor items, specials |
| LevelInfo | 252 B blobs @ `0x193FC` + 252×N (same offsets as `pattern_blocks.json` / bins.xml) |
| Room membership | Submenu map mask (bit7 = top) **after** undoing `submenuMapRotation`, plus start/boss/triforce/cellars |

### Level 1 checks

| Field | Value |
|-------|------:|
| Start room | `$73` |
| Boss | `$35` |
| Triforce | `$36` |
| Cellar | `$7F` |
| Entrance layout | `33` (`$21`) |
| Entrance north door | key (need key from side rooms — matches walkthrough) |
| Room count | 18 (17 map + cellar) |

### Open follow-ups (not blocking)

- Q2 **LevelInfo replacements** applied via `quest2LevelInfo.js` in `buildLevel` / `finalizeLevelMeta`.
- ~~Wall/door tile frames are not composited into room PNGs (floor only).~~ → `composeDungeonRoomTiles` / full 256×176 extract + runtime paint.
- Floor item IDs are raw enum values (gameplay decode in later phases).

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Discover rooms via submenu mask + rotation, not door flood-fill | Levels 1–6 share one door block; flood-fill bleeds across levels |
| 2026-08-05 | LevelInfo PRG = `0x193FC` (103420), not `0x1941C` | Matches bins.xml / graphics palette extract |
| 2026-08-05 | AttrsB high nibble = **west**, mid = **east** | Matches `FindDoorTypeByDoorBit` (not Data Crystal’s E/W label) |

## References

- [Data Crystal — Dungeon Data](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/Dungeon_Data)
- aldonunez `Z_05.asm`: `LayoutUWFloor`, `WriteSquareUW`, submenu map mask
- Local `docs/context/walkthrough.txt` (gitignored) — Level 1 path for door/item checks
