# ROM notes

Verified facts about the supported local `zelda.nes` dump (gitignored). Prefer linking here from phase notes instead of duplicating hashes/offsets everywhere.

## Dump identity

| Field | Value |
|-------|--------|
| File | `zelda.nes` (local only; gitignored) |
| File size | 131,088 bytes (16-byte iNES header + 128 KiB PRG) |
| iNES magic | `4E 45 53 1A` (`NES\x1a`) |
| Header (16 bytes) | `4E45531A 0800 1200 0000000000000000` |
| PRG ROM | 8 × 16 KiB = **128 KiB** |
| CHR ROM | **0** (CHR-RAM; patterns uploaded from PRG) |
| Mapper | **1 (MMC1)** |
| Battery SRAM | **yes** |
| Trainer | no |
| Mirroring (header) | **horizontal** |
| PRG CRC32 | `EAF7ED72` |
| PRG MD5 | `d3f453931146e95b04a31647de80fdab` |
| PRG SHA-1 | `BE2F5DC8C5BA8EC1A344A71F9FB204750AF24FE7` |
| PRG SHA-256 | `ec0d4ebf6d2fcecd1d95fef7329954efe79676959bc281ea908b226459bc6dc2` |
| Full-file SHA-256 | `89232edf4f9b52e3cb872094bc78973de080befca2ddea893b6e936066514d4e` |
| Identified revision | **USA PRG1 / NES-ZL-1 / Rev A** |
| GoodNES-style name | `Legend of Zelda, The (U) (PRG1) [!]` |
| No-Intro-style name | `Legend of Zelda, The (USA) (Rev A)` |

### PRG0 vs PRG1

| | PRG0 (NES-ZL-0) | **Our dump: PRG1 (NES-ZL-1)** |
|--|-----------------|--------------------------------|
| PRG CRC32 | `3FE272FB` | **`EAF7ED72`** |
| Notable diff | No “hold Reset” save caution | Game Over / save caution text added |
| aldonunez disassembly `Original.nes` | Expects **PRG0** | Use as reference; expect small code/text diffs |

**Project target revision: USA PRG1** (the dump we have). Community docs and the aldonunez disassembly are often PRG0-centric — verify offsets against our banks before trusting them.

## Offset convention

Community docs (Data Crystal, etc.) usually use **PRG-relative** offsets. For the `.nes` file on disk, add `+0x10` (iNES header).

## Verified ranges

| PRG offset | iNES offset | Description | Verified? |
|------------|-------------|-------------|-----------|
| `$00000`–`$1FFFF` | `$00010`–`$2000F` | Full PRG | yes (hashed) |

Configured (still **unverified** structurally) seed ranges live in [`assets/schema/rom_ranges.json`](../assets/schema/rom_ranges.json). Re-dump with `npm run extract -- tables`.

### Bank CRC32s (PRG1)

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

## Bank map (working)

| Bank | CPU map | Notes |
|------|---------|-------|
| 0–6 | `$8000–$BFFF` (swapped) | MMC1 16K switchable |
| 7 | `$C000–$FFFF` (fixed) | Always mapped |

## Reference materials (local)

| Path | Purpose |
|------|---------|
| `reference/zelda1-disassembly/` | [aldonunez/zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly) (gitignored) |
