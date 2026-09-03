# Dangerous Alone — developer notes

Visitor-facing overview (what this is, how to play, legal): **[`README.md`](./README.md)**.

This file is the engineering handbook: cartridge identity, architecture, extract CLI,
tests, phases, and fidelity policy.

---

## Goal

An engine reimplementation with multiplayer support, not a redistributable cartridge or a ROM that can be played on emulators:

1. Load world, dungeon, item, and enemy **data from a user-supplied ROM** (no hardcoded dumps in git).
2. Implement play systems in portable JavaScript (collision, combat, secrets, save, UI, audio, enhancements).
3. Render and mix audio through modern APIs — no 6502 / PPU / APU emulator at runtime.
4. Match the supported cartridge closely enough that the original game is playable through this engine.

This is **not** “run the ROM in an emulator wrapped in a window.” Emulators are **development tools** (reference, debugging, verification) only.

---

## Git hygiene

Do not commit a `.nes` file, extracted packs, official manuals, or other third-party assets. `.gitignore` already covers `zelda.nes`, `assets/extracted/`, `docs/context/manual.pdf`, and `docs/context/walkthrough.txt`. CI builds with no ROM.

---

## Supported cartridge

| Item | Value |
|------|--------|
| Local dump (optional) | `zelda.nes` at repo root (gitignored) |
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
2. Reimplement systems (overworld, underworld, player, enemies, items, shops, audio) against those packs.
3. Use published disassemblies and Data Crystal maps as the **behavior oracle**, and an emulator as a **visual/behavioral reference**.

We do **not** need a byte-identical recompilation of the NES binary. We *do* need extracted data that matches the ROM and logic that matches observed behavior.

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
| [Ship of Harkinian](https://www.shipofharkinian.com) | Kindred *product* idea (OoT engine + your ROM); different technical path (matching decomp, native) |

---

## Tech stack

Chosen for readability (vanilla JS), one language across tools + engine, and near-zero porting cost (browser everywhere).

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **Vanilla JavaScript (ES modules)** | Easy to read/modify; no TypeScript build friction |
| Renderer | **PixiJS v8** | Fast WebGL/WebGPU 2D; sprites + tile-friendly; we own the game loop |
| Game framework | **None (custom)** | NES-accurate collision/timing; avoid fighting Phaser physics/scenes |
| Audio | **Web Audio API** | Built-in; synth or decoded samples later |
| Input | Keyboard + Gamepad API | Works in-browser; remap in options |
| Tooling / extractors | **Node.js** (same vanilla JS) | One language for ROM parsing and the engine |
| Bundler / dev server | **Vite** | Fast refresh, simple static build |
| Data format | **JSON** (+ PNG sheets) | Human-readable; natural fit for JS |
| Tests | **Node test runner** (`node:test`) | Unit-test extractors and pure game logic |
| Desktop shell (optional) | Tauri or Electron | Only if we want a packaged app later |

---

## Target architecture

```
your .nes ROM (not in git)
    │
    ▼
┌─────────────────┐
│  extract tools  │  Node.js CLI or in-browser pack builder
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  asset packs    │  maps, tiles, sprites, palettes, SFX, music, tables
│  (never committed) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  engine (browser) │  Vanilla JS + PixiJS + Vite
│  ┌───────────┐  │
│  │ world     │  │  overworld 16×8 screens, caves, warps
│  │ dungeon   │  │  levels 1–9, doors, items, bosses
│  │ entities  │  │  player, enemies, projectiles, NPCs
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

## Repository layout

```
./
├── README.md                 ← visitor overview (what it is, how to play)
├── DEV.md                    ← this file
├── package.json              ← workspace scripts (extract, dev, build, test)
├── .gitignore                ← ROM, extracted assets, node_modules, dist
├── zelda.nes                 ← optional local dump for CLI tools (never commit)
├── docs/
│   ├── rom-notes.md          ← verified offsets, hashes, revision
│   ├── behavior-oracle.md    ← cross-phase fidelity checklist
│   ├── context/              ← local-only manual + walkthrough (gitignored)
│   └── phases/               ← per-phase checklists + working notes
├── tools/
│   ├── extract/              ← Node CLI: ROM → asset pack
│   ├── verify/               ← compare dumps / hashes
│   └── shared/               ← pure JS helpers used by tools + tests
├── story/                    ← editable NPC dialogue + dungeon briefings
├── assets/
│   ├── schema/               ← JSON schemas / format docs (committed)
│   └── extracted/            ← dumps from your ROM (gitignored)
└── game/                     ← Vite + PixiJS engine UI (vanilla JS)
```

---

## Executable plan

Work in **vertical slices**: each phase ends with something runnable or a verifiable artifact. Do not try to reverse the whole ROM before writing an engine.

**Living checklists and working notes live in [`docs/phases/`](docs/phases/README.md).**  
Update that phase’s markdown (status, notes, decisions, open questions) and the status table in [`docs/phases/README.md`](docs/phases/README.md) as you go.

| Phase | Outcome | Notes |
|------:|---------|-------|
| [0](docs/phases/phase-00-hygiene-rom-identity.md) | Safe repo; known ROM revision | `.gitignore`, hashes, emulator setup |
| [1](docs/phases/phase-01-bank-splitter.md) | ROM → bank/table dump CLI | `npm run extract -- banks` |
| [2](docs/phases/phase-02-graphics-pipeline.md) | Tiles & palettes viewable | NES 2bpp → PNG + PixiJS viewer |
| [3](docs/phases/phase-03-overworld-extraction.md) | Full overworld as data | Columns → screens → stitched map |
| [4](docs/phases/phase-04-dungeon-extraction.md) | Levels 1–9 (+ Q2) as data | Rooms, doors, items |
| [5](docs/phases/phase-05-minimal-playable.md) | Walk one screen | Player + collision on start screen |
| [6](docs/phases/phase-06-world-traversal.md) | Explore overworld | Screen transitions, cave stubs, HUD |
| [7](docs/phases/phase-07-link-inventory.md) | Core player verbs | Sword, items, damage, economy |
| [8](docs/phases/phase-08-enemies-combat.md) | Enemies & bosses | Clear Level 1 end-to-end |
| [9](docs/phases/phase-09-dungeon-systems.md) | Full underworld loop | Quest 1 completable |
| [10](docs/phases/phase-10-caves-secrets.md) | Shops, secrets, NPCs | No softlocks for progression |
| [11](docs/phases/phase-11-audio.md) | Music & SFX | Web Audio synth or samples |
| [12](docs/phases/phase-12-save-polish.md) | Daily-driver 1.0 | Saves, options, CI, docs |
| [13](docs/phases/phase-13-hardening-stretch.md) | Post-1.0 stretch | Q2 L9 verify, practice F5/F9, replay tests, JSON editor |
| [14](docs/phases/phase-14-behavior-fidelity.md) | Enemy / drop / stair fidelity | Commons logic vs ROM; sprites already mapped |
| [15](docs/phases/phase-15-bosses-q2-ow.md) | Boss AI & Quest 2 overworld | Manhandla / Gleeok / Patra; Q2 OW + UW LevelInfo |
| [16](docs/phases/phase-16-rom-fidelity-pass.md) | ROM fidelity pass | Softlock / wrong-kill / save gaps vs disassembly |
| [17](docs/phases/phase-17-stretch-systems.md) | Stretch leftovers as MVP | Moldorm / Lamnola, whirlwind, rod, sword beam |
| [18](docs/phases/phase-18-quality-of-life.md) | Quality of life 1 | Continuous overworld camera |
| [19](docs/phases/phase-19-quality-of-life-2.md) | Quality of life 2 | Dialogue box, `story/` folder, map marks |
| [20](docs/phases/phase-20-streaming-cleanup.md) | Continuous-camera cleanup | Monsters, collision, and triggers across seams |
| [21](docs/phases/phase-21-story-text-expansion.md) | Story text expansion | Prologue, pickups, labyrinth briefings, epilogue |
| [22](docs/phases/phase-22-multiplayer.md) | Split-screen co-op | 1–4 players, independent cameras, shared world |
| [—](docs/phases/phase-thorough-review.md) | Thorough fidelity audit | Feature-complete vs USA PRG1; intentional diffs noted |

Cross-cutting references:

- [`docs/rom-notes.md`](docs/rom-notes.md) — dump identity, verified offsets
- [`docs/behavior-oracle.md`](docs/behavior-oracle.md) — fidelity rules that span phases

---

## Local workflow

Node 18+ and a Chromium/Firefox/Safari browser.

```bash
npm install
npm run dev                  # Vite: play, map, dungeon, tiles, editor
```

| Page | URL |
|------|-----|
| Play (file select) | http://localhost:5173/play.html (also `/`) |
| Tile sheets | http://localhost:5173/tiles.html |
| Overworld map | http://localhost:5173/map.html |
| Dungeon viewer | http://localhost:5173/dungeon.html |
| Level editor | http://localhost:5173/editor.html |

The first visit to play shows a dropzone. The ROM is stored in `localStorage` and
maps, tiles, and audio are extracted there. `play.html?resetRom=1` forgets the dump
without wiping save slots.

**Optional (CLI / Node tests):** keep a local `zelda.nes` at the repo root and
run `npm run extract -- all` to dump JSON/PNGs under `assets/extracted/` (gitignored).
The play client does not need that folder.

```bash
npm run extract -- info      # header + PRG hashes
npm run extract -- banks     # assets/extracted/banks/bank_N.bin
npm run extract -- tables    # dump ranges from assets/schema/rom_ranges.json
npm run extract -- rom-map   # assets/extracted/rom_map.json
npm run extract -- graphics  # CHR pattern PNGs + palettes.json
npm run extract -- overworld # overworld JSON + stitched map + play/world_index.json
npm run extract -- dungeons  # levels 1–9 (Q1+Q2) JSON + room/level PNGs
npm run extract -- all
npm test                     # unit tests (no ROM required)
npm run test:browser         # Playwright goldens (needs a local ROM for some cases)
npm run build
npm run preview              # http://localhost:4173/play.html
```

CI runs `npm test` + `npm run build` with **no ROM**. Nintendo assets are never committed.

**GitHub Pages:** a push to `main` or `master` builds `dist/` and deploys it.
Keep **Settings → Pages → Source: GitHub Actions**. Do not add GitHub’s
“Deploy static content” starter workflow (`static.yml`) — that uploads the repo
root instead of `dist/` and 404s. The play client is the site root (`/` redirects
to `play.html`). Tool pages (tiles, map, dungeon, editor) stay on `npm run dev`
and are not in the Pages artifact. Nothing Nintendo-owned is in the artifact.

---

## Verification discipline

Fidelity is earned with tests, not vibes.

1. **Data tests:** Extractor golden hashes for tables (fixtures from your ROM, private).
2. **Unit tests:** Collision helpers, column expansion, damage tables, shop price decode.
3. **Scene tests:** Given screen ID + seed, enemy spawn list matches expected fixture.
4. **Oracle checklist:** Maintain `docs/behavior-oracle.md` — e.g. “boomerang stun duration,” “bomb fuse frames,” “player sword knockback.”
5. **Side-by-side:** Keep Mesen open; same inputs when hunting bugs.
6. **Playtests:** Full Level 1 clear, then full quest, recorded notes.

Do **not** chase cycle-accurate PPU timing unless a specific visual bug requires it. Prefer matching gameplay rules and 60 Hz feel.

---

## Fidelity policy (decide once, write down)

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

Phases 0–22 plus the thorough review are in [`docs/phases/`](docs/phases/README.md). Remaining polish lives in the phase notes (segment bosses vs ROM, etc.).

---

## Reference links

- [Ship of Harkinian](https://www.shipofharkinian.com) — unofficial *Ocarina of Time* engine (kindred product idea; different technical path)
- [Data Crystal — The Legend of Zelda ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map)
- [Data Crystal — Dungeon Data](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/Dungeon_Data)
- [aldonunez/zelda1-disassembly](https://github.com/aldonunez/zelda1-disassembly)
- [Computer Archeology — Zelda](https://www.computerarcheology.com/NES/Zelda/)
- [NESdev Wiki](https://www.nesdev.org/wiki/Nesdev_Wiki)
- [PixiJS](https://pixijs.com/)
- [Vite](https://vitejs.dev/)
