# Phase 0 — Project hygiene & ROM identity

**Status:** Done  
**Outcome:** Safe repo; known ROM revision.

## Checklist

- [x] Add `.gitignore` for `zelda.nes`, `assets/extracted/`, `node_modules/`, `dist/`, `*.sav`
- [x] Record iNES header fields and PRG size in [`docs/rom-notes.md`](../rom-notes.md)
- [x] Compute CRC32 / SHA-256 of PRG (bytes after header) and identify dump (US PRG0 preferred; matches aldonunez “Original.nes”)
- [x] Clone/read [zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly) as a **reference checkout** (do not vendor Nintendo code into a public tree carelessly)
- [x] Install Mesen (or FCEUX) for side-by-side verification

## Done when

We know exactly which revision we’re targeting and the ROM is ignored by git.

## Notes

### 2026-08-05 — executed

- Initialized local git repo; `git check-ignore` confirms `zelda.nes` is ignored via `*.nes`.
- `reference/` is gitignored; cloned `aldonunez/zelda1-disassembly` (shallow) to `reference/zelda1-disassembly/`.
- **ROM identity is USA PRG1 (NES-ZL-1 / Rev A), not PRG0.**
  - PRG CRC32 `EAF7ED72`, SHA-1 `BE2F5DC8C5BA8EC1A344A71F9FB204750AF24FE7` (matches published NES-ZL-1).
  - aldonunez build verification expects PRG0 (`3FE272FB`). Fine as a logic/reference checkout; do not assume byte-identical tables without checking our dump.
- Installed **Mesen 2.1.1** (macOS Apple Silicon) to `/Applications/Mesen.app`. SDL2 installed via Homebrew (Mesen macOS requirement).
- Manual + walkthrough kept as later-phase playability context under [`docs/context/`](../context/README.md) (gitignored; not runtime assets).

### How to use the reference emulator

```bash
open /Applications/Mesen.app "/Users/camh/Documents/projects/nes_zelda/zelda.nes"
```

Use debugger / CHR viewer / event viewer when verifying later phases.

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Target **USA PRG1** for extraction & gameplay | It’s the dump we have; hashes match NES-ZL-1 |
| 2026-08-05 | Keep disassembly under `reference/` (gitignored) | Useful oracle; avoid vendoring into the public tree |
| 2026-08-05 | Prefer Mesen 2 over Homebrew FCEUX for now | Better debugger UX for RE; FCEUX remains a brew fallback |

## Open questions

- Do we ever want a second local PRG0 dump for 1:1 rebuild checks against aldonunez? (Optional; not blocking.)

## References

- [`docs/rom-notes.md`](../rom-notes.md)
- [aldonunez/zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly)
- [NES Cart DB / PRG CRC notes](https://nesdir.github.io/3FE272FB_USA.html) (PRG0 vs PRG1)
- [Mesen 2 releases](https://github.com/SourMesen/Mesen2/releases)
