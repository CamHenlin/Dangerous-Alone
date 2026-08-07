# Phase 1 — Bank splitter & dump toolkit

**Status:** Done  
**Outcome:** CLI that slices the ROM into analyzable pieces.

## Checklist

- [x] Parse iNES header; reject wrong mapper/PRG size
- [x] Split into 8 × 16 KiB banks → `assets/extracted/banks/bank_N.bin`
- [x] Dump raw tables by offset (configurable JSON of known ranges from Data Crystal)
- [x] Export a machine-readable `rom_map.json` of every range we trust

## Done when

`npm run extract -- banks` reproduces stable bank files from `zelda.nes`.

## Notes

### 2026-08-05 — executed

Scaffolded a zero-dependency Node ESM toolkit:

| Path | Role |
|------|------|
| `package.json` | `npm run extract`, `npm test` |
| `tools/shared/ines.js` | iNES parse, Zelda-shape assert, bank split, hashes |
| `tools/shared/ranges.js` | Inclusive PRG range parsing/slicing |
| `tools/extract/cli.js` | CLI: `info`, `banks`, `tables`, `rom-map`, `all` |
| `assets/schema/rom_ranges.json` | Seed Data Crystal ranges (`trust: unverified`) |

Verified against our PRG1 dump:

```text
npm test                  → 6 pass
npm run extract -- info   → PRG CRC32 EAF7ED72 (matches Phase 0)
npm run extract -- banks  → 8 × 16384-byte banks + banks_manifest.json
npm run extract -- all    → banks + 9 table dumps + rom_map.json
```

Bank CRC32s (PRG1):

| Bank | CRC32 |
|-----:|-------|
| 0 | `A9BFA224` |
| 1 | `03F58F16` |
| 2 | `1374265B` |
| 3 | `28A97EB2` |
| 4 | `7066DBF3` |
| 5 | `A096E5BB` |
| 6 | `DDFB0EF5` |
| 7 | `7735F76A` |

Table dumps landed under `assets/extracted/tables/` (gitignored). Schema ranges are still **unverified** — Phase 3+ should promote `trust` after visual/structural checks.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Vanilla Node ESM, no npm deps for extract | Easy to read/review; enough for binary slicing |
| 2026-08-05 | Inclusive `prg_end_inclusive` in schema | Matches how Data Crystal publishes “from–to” |
| 2026-08-05 | Keep extracted binaries gitignored; commit schema only | ROM-derived data stays local |

## Open questions

- When we verify a range on PRG1, do we bump `trust` to `verified` in-schema and also copy CRC into `docs/rom-notes.md`? (Likely yes.)

## References

- [Data Crystal — ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map)
- [`docs/rom-notes.md`](../rom-notes.md)
- [`assets/schema/rom_ranges.json`](../../assets/schema/rom_ranges.json)
