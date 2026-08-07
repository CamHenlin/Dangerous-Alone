# Phase 2 — Graphics pipeline (tiles & palettes)

**Status:** Done  
**Outcome:** Viewable overworld / dungeon tiles without the full game.

## Context

Zelda stores pattern data in PRG and copies it into CHR-RAM. Extraction must follow bank loads the game uses (disassembly + Mesen CHR viewer as guide).

## Checklist

- [x] Locate and dump 8×8 pattern tables used for overworld, underworld, Link, enemies, HUD
- [x] Decode NES 2bpp → PNG sheets (`overworld_tiles.png`, `link.png`, etc.)
- [x] Extract palette sets (overworld outer/inner, dungeon palettes per level)
- [x] Build a tiny **tile viewer** page (PixiJS) that shows sheets + palette swaps

## Done when

We can visually confirm bushes, water, dungeon walls, and Link frames match the original.

## Notes

### 2026-08-05 — executed

Pattern block offsets taken from `reference/zelda1-disassembly/src/bins.xml` (Computer Archeology / aldonunez). Verified on USA PRG1 — lengths divisible by 16; sheets decode cleanly.

| Deliverable | Location |
|-------------|----------|
| Pattern schema | `assets/schema/pattern_blocks.json` |
| Extract command | `npm run extract -- graphics` |
| PNG / BIN / palettes | `assets/extracted/graphics/` (gitignored) |
| 2bpp + PNG helpers | `tools/shared/nes2bpp.js`, `png.js`, `nesPalette.js` |
| Tile viewer | `game/` — Vite + PixiJS v8, vanilla JS |

**Sheets extracted (15):** demo_*, common_sprites (Link/items), common_background (font), overworld_bg / overworld_sprites, underworld_bg / underworld sprite sets, boss sets.

**Palettes:** Parsed from each `LevelInfo*` blob (`3F 00 20` + 32 NES color indices + `FF`) → `palettes.json` for overworld + levels 1–9.

**Viewer:** `npm run dev` → sheet picker, LevelInfo palette set, palette row, greyscale toggle. Recolors live from `.bin` pattern data (not baked PNG only).

**Visual check:** `common_sprites.png` shows Link walk/attack frames, swords, bombs, hearts, etc. Overworld/underworld BG sheets show terrain/wall metatile pieces (preview uses one palette row — in-game attribute coloring comes in Phase 3+).

```bash
npm run extract -- graphics
npm run dev          # http://localhost:5173
npm test             # 11 pass
npm run build        # Vite production build OK
```

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Trust aldonunez `bins.xml` offsets | Matched PRG1; avoids rediscovering CHR copy tables |
| 2026-08-05 | Zero-dep PNG encoder in Node | Keep extract tooling dependency-light |
| 2026-08-05 | Viewer recolors from `.bin` + palette JSON | Real palette swaps without re-extract |
| 2026-08-05 | Preview BG with opaque black for color 0 | Easier sheet reading than checkerboard |

## Open questions

- Should Phase 3 emit assembled 16×16 “square” atlases (primary/secondary square tables) in addition to raw 8×8 sheets?

## References

- [Computer Archeology — Zelda tile images](https://www.computerarcheology.com/NES/Zelda/)
- `reference/zelda1-disassembly/src/bins.xml`
- NESdev: PPU pattern tables / 2bpp format
