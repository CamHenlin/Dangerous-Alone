# Phase 13 — Hardening & stretch goals

**Status:** Complete  
**Outcome:** Optional work after 1.0 — shipped MVPs; remaining items explicitly deferred.

## Checklist

- [x] Quest 2 complete verification
- [x] Rewind / practice savestates (modern QoL, clearly optional)
- [x] Deterministic replay for regression tests
- [x] Level editor that writes *our* asset format (not the NES ROM)

## Done when

Stretch items we care about are either shipped or explicitly deferred.

## Commands

```bash
npm test
npm run extract -- dungeons   # re-extract writes corrected Q2 L9 meta via finalizeLevelMeta
npm run dev

# Quest 2 L9 smoke (needs silver arrows + triforce kit)
# http://localhost:5173/play.html?quest=2&debug=1
# Enter L9 → Ganon room $17 → Zelda room (triforceRoom) → proximity ends Quest 2

# Practice savestates (optional QoL — not file slots)
# F5 save · F9 load  → localStorage key zelda_practice

# Level editor
# http://localhost:5173/editor.html
# Download JSON → place under assets/overrides/<same path as extracted>
```

## Notes

### Quest 2 verification

| Gap | Fix |
|-----|-----|
| Room art hardcoded `q1/` | Uses `inv.quest` pack path |
| Shared LevelInfo → wrong L9 boss/TF rooms | `finalizeLevelMeta()` scans for Ganon `$3E` / Zelda `$37` |
| End text always “Quest 1” | Uses `inv.quest` |
| Q1/Q2 dungeon progress collision | Save keys `quest:level` (legacy bare level → Q1) |

**Q2 L9 path:** Ganon `$17`, Zelda at finalized `triforceRoom` (extracted data had Zelda in `$31` / `$53`).

**Deferred (at ship):** Quest 2 overworld secret transforms; per-quest LevelInfo tables; full boss AI.  
**Later:** OW transforms, LevelInfo Q2 replacements, and boss AI (incl. Manhandla/Gleeok/Patra) shipped in [Phase 15](./phase-15-bosses-q2-ow.md).

### Practice savestates

- `tools/shared/practiceSave.js` — `zelda_practice` key only
- Reuses battery serialize/hydrate; does not write slots 0–2
- Progress-level restore (not mid-swing enemy rewind)

### Deterministic replay

- `tools/shared/replay.js` + `rng.js` — headless walk golden hash
- `tryGamble` / `tryEdgeSpawn` accept injectable RNG (edge spawn already did)
- Expand fixtures later for combat scenes

### Level editor

- `game/editor.html` — paint OW `tileGrid` or UW `squares`, set monster id
- Download JSON only (never ROM)
- `assets/overrides/` served over extracted via Vite middleware

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Runtime `finalizeLevelMeta` on load + extract | Fixes Q2 without requiring users to re-extract immediately |
| 2026-08-05 | Practice state separate from file slots | Keep NES-like battery semantics clean |
| 2026-08-05 | Editor writes overrides / download, not ROM | Legal + matches “our asset format” goal |
| 2026-08-05 | Defer Q2 overworld transforms | Completion path is L9; OW Q2 is a larger data pass |

## Open questions

- ~~Record live input from `play.html` into replay fixtures?~~ → deferred (headless golden walk is enough for now)
- ~~Per-quest LevelInfo extraction if community docs confirm separate tables?~~ → deferred (`finalizeLevelMeta` covers L9 completion)

## Explicitly deferred (not blocking Complete)

| Item | Why deferred |
|------|----------------|
| ~~Quest 2 overworld secret transforms~~ | → [Phase 15](./phase-15-bosses-q2-ow.md) |
| ~~Full boss AI (vs stubs)~~ | → [Phase 15](./phase-15-bosses-q2-ow.md) |
| Live input → replay fixture recorder | Optional tooling; unit replay covers regressions |
| Desktop shell / CRT filter | Out of scope for this phase’s checklist |
