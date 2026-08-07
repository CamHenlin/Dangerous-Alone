# Phase 3 — Overworld map extraction

**Status:** Done  
**Outcome:** Full Hyrule as structured data + a map viewer.

## Context

Original encoding (high level):

1. **Overworld** = 16×8 = **128 screens**
2. Arrangement byte → unique **layout** (121 layouts × 16 column descriptors)
3. Each column descriptor → compressed **11 squares** (bit7 = column start in table; bit6 = repeat row)
4. Each square → 2×2 CHR tiles via primary/secondary square tables
5. Attribute tables: palette, Zora, cave/level, enemies, secrets, exits

## Checklist

- [x] Extract screen → column index tables
- [x] Extract column definitions; expand to 16×11 block grids per screen
- [x] Expand blocks → tilemaps + collision material IDs
- [x] Extract screen attribute tables (Data Crystal `$18400`… — verified on our dump)
- [x] Emit `overworld.json` (or packed form) + optional stitched PNG of all 128 screens
- [x] PixiJS **map viewer**: scroll Hyrule, click screen, show attributes / collision

## Done when

Stitched map matches a known Zelda overworld screenshot, and cave/level entrance IDs look sane on sample screens (e.g. Level 1 tree, starting screen).

## Notes

### 2026-08-05 — executed

| Deliverable | Path |
|-------------|------|
| Schema | `assets/schema/overworld.json` |
| Decoder | `tools/shared/overworld.js` |
| Extract cmd | `npm run extract -- overworld` |
| Data + PNGs | `assets/extracted/overworld/` |
| Map viewer | http://localhost:5173/map.html |

**Verified on PRG1:**

- Start screen `$77` (layout 114)
- Level 1 entrance `$37` (row 3, col 7), `caveId = 1`
- Stitched map `4096×1408` shows recognizable Hyrule (Lost Woods, graveyard, Spectacle Rock, rivers, desert)
- Layout index uses `arrangement & 0x7F` (bit 7 = monster groups); 121 unique layouts
- Column decode may read past column-table end (matches game’s overlapping stream)

**Collision / materials:** each square index is exported as the material ID (`squares[row][col]`). Walkability rules come in Phase 5.

**Bugfix (same day):** `squareToTiles` incorrectly used `primary < $10` to choose secondary tiles. The game uses **square index** `< $10` (`WriteSquareOW`). Fixed and map regenerated — ground/coast tiles no longer pull the wrong CHR.

**Known preview quirks:** water animation frames; outer vs inner palette still uses a simple edge heuristic.

```bash
npm run extract -- graphics   # prerequisite
npm run extract -- overworld
npm run dev                   # /map.html
npm test                      # 15 pass
```

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Layout id = `arrange & 0x7F` | Fits 121 layouts; bit7 is monster-group flag |
| 2026-08-05 | Secret primaries `$E5–$EA` → secrets table graphics | Unopened secret visuals |
| 2026-08-05 | Material id = square index for now | Enough for Phase 5 collision work |
| 2026-08-05 | Edge squares use outer palette | Simple stand-in for NES attribute coloring |

## Open questions

- Exact outer/inner palette region (attribute tiles vs square edge)?
- Water / coast animation frames for preview fidelity?
- Does LayoutRoomOW in the disassembly mask bit7 in a path we haven’t mirrored? (`& 0x7F` works empirically)

## References

- [Data Crystal — ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map)
- [RHDN — Screens, Columns, Blocks](https://www.romhacking.net/documents/845/)
- Tril / ZeldaHacks overworld column format
- `reference/zelda1-disassembly/src/Z_05.asm` (`LayoutRoomOW`, `WriteSquareOW`)
