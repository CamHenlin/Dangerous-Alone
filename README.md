# NES Zelda — Modern Reimplementation

Rebuild *The Legend of Zelda* (NES, 1986) as a **cross-platform game** that runs on modern machines **without an emulator**. We extract maps, graphics, audio, and game rules from a legally obtained ROM, then reimplement the engine in **vanilla JavaScript** with a modern 2D renderer.

**Primary target:** macOS (browser)  
**Secondary targets:** Linux, Windows, and anything else with a modern browser  
**Optional later:** desktop shell (Tauri/Electron) if we want a double-click app

---

## Goal

A playable, faithful recreation of the original game that:

1. Loads all world/dungeon/item/enemy data from assets **extracted from** `zelda.nes` (not hardcoded from memory/guesswork).
2. Implements game logic in portable modern code (collision, combat, secrets, save system, UI, audio).
3. Renders and plays audio through modern APIs (no cycle-accurate 6502 / PPU / APU emulation at runtime).
4. Matches original behavior closely enough that a speedrunner or longtime player would recognize it as the same game.

This is **not** “run the ROM in an emulator wrapped in a window.” Emulators may be used as **development tools** (reference, debugging, asset verification) only.

---

## Legal / ownership

- Keep `zelda.nes` **local and private**. Do not commit the ROM or extracted Nintendo assets to a public repository.
- This project is for personal / educational use with a ROM you own.
- Prefer distributing **tools + engine code + empty asset stubs**. Users supply their own ROM and run the extractor.
- Add `zelda.nes`, `assets/extracted/`, and any dump outputs to `.gitignore` from day one.

---

## What we have

| Item | Value |
|------|--------|
| File | `zelda.nes` |
| Size | 131,088 bytes (16-byte iNES header + 128 KiB PRG) |
| Mapper | MMC1 (mapper 1), battery-backed SRAM |
| CHR | CHR-RAM (patterns uploaded from PRG at runtime) |
| Mirroring | Horizontal (header) |
| Banks | 8 × 16 KiB PRG; bank 7 fixed at `$C000–$FFFF`, banks 0–6 swap at `$8000–$BFFF` |

**Identified (Phase 0):** USA **PRG1** / NES-ZL-1 (PRG CRC32 `EAF7ED72`). Not PRG0. Details in [`docs/rom-notes.md`](docs/rom-notes.md). Offsets in community docs are usually **PRG-relative**; add `+0x10` for iNES file offsets.

---

## Strategy (chosen approach)

### Recommended: data extraction + clean engine reimplementation

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Emulator shell** | Fast “playable” | Not the goal | Reject for product |
| **B. Matching 6502 decomp → C** | Maximum fidelity | Huge effort; still fights NES constraints | Reference only |
| **C. Extract data + reimplement systems** | Playable early; portable; maintainable | Behavior must be verified against original | **Primary path** |
| **D. Hybrid** | Use disassembly as oracle while building JS game systems | Needs discipline | **How we execute C** |

We follow **C + D**:

1. Extract structured data from the ROM into JSON / binary packs we own the schema for.
2. Reimplement systems (overworld, underworld, Link, enemies, items, shops, audio) against those packs.
3. Use published disassemblies and Data Crystal maps as the **behavior oracle**, and an emulator as a **visual/behavioral reference**.

We do **not** need a byte-identical recompilation of the NES binary to ship a playable game. We *do* need extracted data that matches the ROM and logic that matches observed behavior.

### Prior art (use, don’t reinvent)

| Resource | Use for |
|----------|---------|
| [aldonunez/zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly) | Complete buildable ca65 disassembly; bank structure; control flow |
| [Computer Archeology — Zelda](https://www.computerarcheology.com/NES/Zelda/) | Bank map, boot path, high-level ROM layout |
| [Data Crystal — ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map) | Offsets for screens, columns, enemies, caves, dungeons |
| [Data Crystal — Dungeon Data](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/Dungeon_Data) | Per-level dungeon tables |
| [RHDN — Screens, Columns, Blocks](https://www.romhacking.net/documents/845/) | Column/screen compression model |
| Trax / ZeldaHacks docs | Annotated underworld/overworld formats |
| Mesen / FCEUX | Debugger, CHR viewer, RAM watch during verification |

---

## Tech stack

Chosen for readability (vanilla JS), one language across tools + game, and near-zero porting cost (browser everywhere).

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **Vanilla JavaScript (ES modules)** | Easy to read/modify; no TypeScript build friction |
| Renderer | **PixiJS v8** | Fast WebGL/WebGPU 2D; sprites + tile-friendly; we own the game loop |
| Game framework | **None (custom)** | NES-accurate collision/timing; avoid fighting Phaser physics/scenes |
| Audio | **Web Audio API** | Built-in; synth or decoded samples later |
| Input | Keyboard + Gamepad API | Works in-browser; remap in options |
| Tooling / extractors | **Node.js** (same vanilla JS) | One language for ROM parsing and the game |
| Bundler / dev server | **Vite** | Fast refresh, simple static build |
| Data format | **JSON** (+ PNG sheets) | Human-readable; natural fit for JS |
| Tests | **Node test runner** (`node:test`) or Vitest | Unit-test extractors and pure game logic |
| Desktop shell (optional) | Tauri or Electron | Only if we want a packaged app later |

### PixiJS vs Phaser

| | **PixiJS (chosen)** | Phaser |
|--|---------------------|--------|
| Role | Renderer | Full game framework |
| Fit for Zelda RE | We control tick, hitboxes, screen scroll | Faster scaffolding, but physics/tilemaps often fight NES rules |
| Learning surface | Smaller API focused on drawing | Larger scene/physics/plugin surface |
| Verdict | **Use this** | Keep in mind if we ever want a quick prototype jam |

Phaser remains a fine library; for a fidelity-first reimplementation, PixiJS + our own systems is the better default.

---

## Target architecture

```
zelda.nes
    │
    ▼
┌─────────────────┐
│  extract tools  │  Node.js CLI: parse banks, dump tables
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  asset packs    │  maps, tiles, sprites, palettes, SFX, music, tables
│  (gitignored)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  game (browser) │  Vanilla JS + PixiJS + Vite
│  ┌───────────┐  │
│  │ world     │  │  overworld 16×8 screens, caves, warps
│  │ dungeon   │  │  levels 1–9, doors, items, bosses
│  │ entities  │  │  Link, enemies, projectiles, NPCs
│  │ systems   │  │  collision, combat, inventory, secrets
│  │ audio     │  │  Web Audio: sequenced music + SFX
│  │ save      │  │  localStorage / downloadable save (SRAM semantics)
│  └───────────┘  │
└─────────────────┘
```

### NES concepts → modern equivalents

| NES | Browser engine |
|-----|----------------|
| 256×240 PPU frame (NTSC) | Logical 256×240 PixiJS stage, integer-scaled to the canvas |
| CHR patterns in RAM | Texture atlases / sprite sheets from extracted tiles |
| Nametable + attributes | Screen tilemaps built from column → block → tile |
| MMC1 bank switches | Irrelevant at runtime (all data loaded from packs) |
| APU square/triangle/noise/DMC | Web Audio synth from extracted sequences, or decoded PCM later |
| Controller | Keyboard + Gamepad API |
| Battery SRAM | `localStorage` / exported save file with same flag semantics |

---

## Repository layout (target)

```
nes_zelda/
├── README.md                 ← high-level plan (this file)
├── package.json              ← workspace scripts (extract, dev, build, test)
├── .gitignore                ← ROM, extracted assets, node_modules, dist
├── zelda.nes                 ← local only (never commit)
├── docs/
│   ├── rom-notes.md          ← verified offsets, hashes, revision
│   ├── behavior-oracle.md    ← cross-phase fidelity checklist
│   ├── context/              ← manual + walkthrough (later playability)
│   └── phases/               ← per-phase checklists + working notes
│       ├── README.md         ← phase index + status table
│       ├── phase-00-….md
│       └── …
├── tools/
│   ├── extract/              ← Node CLI: ROM → asset pack
│   ├── verify/               ← compare dumps / hashes
│   └── shared/               ← pure JS helpers used by tools + tests
├── story/                    ← editable NPC dialogue + dungeon briefings
│   ├── README.md             ← entry shapes, charset rules, key tables
│   ├── caves.js              ← overworld cave dwellers
│   ├── persons.js            ← underworld old men, per dungeon
│   └── levels.js             ← dungeon dossiers + Triforce briefings
├── assets/
│   ├── schema/               ← JSON schemas / format docs (committed)
│   └── extracted/            ← dumps from your ROM (gitignored)
└── game/                     ← Vite + PixiJS app (vanilla JS)
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.js
        ├── app.js
        ├── render/
        ├── audio/
        ├── input/
        ├── world/
        ├── dungeon/
        ├── entity/
        ├── combat/
        ├── inventory/
        └── save/
```

---

## Executable plan

Work in **vertical slices**: each phase ends with something runnable or a verifiable artifact. Do not try to reverse the whole ROM before writing an engine.

**Living checklists and working notes live in [`docs/phases/`](docs/phases/README.md).**  
This README stays high-level; as we execute a phase, we update that phase’s markdown (status, notes, decisions, open questions) and the status table in [`docs/phases/README.md`](docs/phases/README.md).

| Phase | Outcome | Notes |
|------:|---------|-------|
| [0](docs/phases/phase-00-hygiene-rom-identity.md) | Safe repo; known ROM revision | `.gitignore`, hashes, emulator setup |
| [1](docs/phases/phase-01-bank-splitter.md) | ROM → bank/table dump CLI | `npm run extract -- banks` |
| [2](docs/phases/phase-02-graphics-pipeline.md) | Tiles & palettes viewable | NES 2bpp → PNG + PixiJS viewer |
| [3](docs/phases/phase-03-overworld-extraction.md) | Full overworld as data | Columns → screens → stitched map |
| [4](docs/phases/phase-04-dungeon-extraction.md) | Levels 1–9 (+ Q2) as data | Rooms, doors, items |
| [5](docs/phases/phase-05-minimal-playable.md) | Walk one screen | Link + collision on start screen |
| [6](docs/phases/phase-06-world-traversal.md) | Explore overworld | Screen transitions, cave stubs, HUD |
| [7](docs/phases/phase-07-link-inventory.md) | Core player verbs | Sword, items, damage, economy |
| [8](docs/phases/phase-08-enemies-combat.md) | Enemies & bosses | Clear Level 1 end-to-end |
| [9](docs/phases/phase-09-dungeon-systems.md) | Full underworld loop | Quest 1 completable |
| [10](docs/phases/phase-10-caves-secrets.md) | Shops, secrets, NPCs | No softlocks for progression |
| [11](docs/phases/phase-11-audio.md) | Music & SFX | Web Audio synth or samples |
| [12](docs/phases/phase-12-save-polish.md) | Daily-driver 1.0 | Saves, options, CI, docs |
| [13](docs/phases/phase-13-hardening-stretch.md) | Post-1.0 stretch | Q2 L9 verify, practice F5/F9, replay tests, JSON editor |

Cross-cutting references:

- [`docs/rom-notes.md`](docs/rom-notes.md) — dump identity, verified offsets
- [`docs/behavior-oracle.md`](docs/behavior-oracle.md) — fidelity rules that span phases

### Extract CLI & viewer

```bash
npm run extract -- info      # header + PRG hashes
npm run extract -- banks     # assets/extracted/banks/bank_N.bin
npm run extract -- tables    # dump ranges from assets/schema/rom_ranges.json
npm run extract -- rom-map   # assets/extracted/rom_map.json
npm run extract -- graphics  # CHR pattern PNGs + palettes.json
npm run extract -- overworld # overworld JSON + stitched map + play/world_index.json
npm run extract -- dungeons  # levels 1–9 (Q1+Q2) JSON + room/level PNGs
npm run extract -- all       # banks + tables + rom-map + graphics + overworld + dungeons
npm run dev                  # Vite: /play.html, /map.html, /dungeon.html, /
npm run dev                  # tile viewer + map viewer
npm test                     # unit tests for parsers (no ROM required)
```

Viewer URLs (with `npm run dev` running):

- **Play (file select):** http://localhost:5173/play.html
- Tile sheets: http://localhost:5173/
- Overworld map: http://localhost:5173/map.html
- Dungeon viewer: http://localhost:5173/dungeon.html
- Level editor: http://localhost:5173/editor.html

### Open in browser (Mac / Linux)

Same workflow on both platforms — Node 18+ and a Chromium/Firefox/Safari browser.

```bash
# 1. Clone and install
cd nes_zelda
npm install

# 2. Play — drop your legally obtained Zelda (USA) `.nes` ROM onto the window
npm run dev
# open http://localhost:5173/play.html
```

The first visit shows a dropzone. The ROM is stored in the browser (`localStorage`)
and all maps, tiles, and audio are extracted from it there. Clearing site data
removes the ROM; drop it again to restore play. `play.html?resetRom=1` does the
same without wiping save slots.

**Optional (tools / Node tests):** keep a local `zelda.nes` at the repo root and
run `npm run extract -- all` to dump JSON/PNGs under `assets/extracted/` (gitignored).
The game itself does not need that folder.

**File select:** ↑↓ slot · Enter continue/new · N rename · R register/overwrite · E erase · O options.  
Progress autosaves to the browser (`localStorage` slots). Clearing site data erases saves.

**Production preview:**

```bash
npm run build
npm run preview
# http://localhost:4173/play.html
```

CI runs `npm test` + `npm run build` with **no ROM**. Nintendo assets are never committed.

---

## Milestone schedule (working cadence)

Estimates assume part-time focused work; adjust freely. Prefer shipping Phase 5 early.

| Milestone | Phases | Rough target |
|-----------|--------|----------------|
| M0 Toolkit | 0–1 | Week 1 |
| M1 See Hyrule | 2–3 | Weeks 2–4 |
| M2 Walk | 4–6 | Weeks 5–8 |
| M3 Fight | 7–8 | Weeks 9–14 |
| M4 Finish Quest 1 | 9–11 | Weeks 15–24 |
| M5 1.0 | 12 | Weeks 25–28 |

After each milestone: update the relevant phase notes and the status table in [`docs/phases/README.md`](docs/phases/README.md) with what matched the original, what intentionally differs, and open questions.
---

## Verification discipline

Fidelity is earned with tests, not vibes.

1. **Data tests:** Extractor golden hashes for tables (fixtures from your ROM, private).
2. **Unit tests:** Collision helpers, column expansion, damage tables, shop price decode.
3. **Scene tests:** Given screen ID + seed, enemy spawn list matches expected fixture.
4. **Oracle checklist:** Maintain `docs/behavior-oracle.md` — e.g. “boomerang stun duration,” “bomb fuse frames,” “Link’s sword knockback.”
5. **Side-by-side:** Keep Mesen open; same inputs when hunting bugs.
6. **Playtests:** Full Level 1 clear, then full quest, recorded notes.

Do **not** chase cycle-accurate PPU timing unless a specific visual bug requires it. Prefer matching gameplay rules and 60 Hz feel.

---

## Fidelity policy (decide once, write down)

Default policy for this project:

| Area | Policy |
|------|--------|
| Map / item / enemy placement | Exact from ROM data |
| Damage, drops, secret flags | Exact |
| Movement / hitboxes | Exact where documented; within 1–2 px otherwise until measured |
| Screen transition | Prefer NES-style scroll; instant OK until scroll implemented |
| Resolution | Internal 256×240; integer scale |
| Audio tone | Approximated synth OK if notes/timing match |
| QoL | Window scale, rebind, modern saves OK; no gameplay cheats in default mode |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Wrong ROM revision → offset mismatch | Hash PRG; document revision; prefer US PRG0 |
| Undocumented behaviors | Disassembly + Mesen traces; isolate in oracle doc |
| Scope explosion (pixel-perfect everything) | Ship vertical slices; lock fidelity policy |
| Accidental ROM/asset leak | `.gitignore`, pre-commit secret/ROM size check |
| Music engine too hard | Hybrid PCM for music; keep SFX data-driven |
| Burnout on enemy AI edge cases | Implement enemies by dungeon order, not all at once |

---

## Immediate next actions

Phases 0–16 are complete (Quest 1 daily-driver + Q2 OW/UW LevelInfo, full boss fight rules including Manhandla/Gleeok/Patra, ROM fidelity pass). Stretch leftovers: Moldorm/Lamnola multi-segment AI; whirlwind; rod/sword-beam; Hungry Goriya.

---

## Reference links

- [Data Crystal — The Legend of Zelda ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map)
- [Data Crystal — Dungeon Data](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/Dungeon_Data)
- [aldonunez/zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly)
- [Computer Archeology — Zelda](https://www.computerarcheology.com/NES/Zelda/)
- [NESdev Wiki](https://www.nesdev.org/wiki/Nesdev_Wiki)
- [PixiJS](https://pixijs.com/)
- [Vite](https://vitejs.dev/)
