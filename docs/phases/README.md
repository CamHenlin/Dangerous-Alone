# Phase notes

Working notes for each phase of the engine. The [visitor README](../../README.md) is the public overview; [`DEV.md`](../../DEV.md) is the engineering handbook. **These files** are where we track status, discoveries, decisions, and open questions as we go.

## Convention

- One file per phase: `phase-NN-short-name.md`
- Update **Status** when work starts or finishes
- Put ROM offsets, weird behaviors, and “why we did X” in the phase notes (or link out to `docs/rom-notes.md` / `docs/behavior-oracle.md` when it becomes cross-cutting)
- Keep checkboxes current; don’t leave the README as the only living checklist

## Index

| Phase | Doc | Status |
|------:|-----|--------|
| 0 | [Project hygiene & ROM identity](./phase-00-hygiene-rom-identity.md) | Done |
| 1 | [Bank splitter & dump toolkit](./phase-01-bank-splitter.md) | Done |
| 2 | [Graphics pipeline](./phase-02-graphics-pipeline.md) | Done |
| 3 | [Overworld map extraction](./phase-03-overworld-extraction.md) | Done |
| 4 | [Underworld / dungeon extraction](./phase-04-dungeon-extraction.md) | Done |
| 5 | [Minimal playable slice](./phase-05-minimal-playable.md) | Done |
| 6 | [World traversal](./phase-06-world-traversal.md) | Done |
| 7 | [Link actions & inventory](./phase-07-link-inventory.md) | Done |
| 8 | [Enemies & combat](./phase-08-enemies-combat.md) | Complete |
| 9 | [Dungeons as a system](./phase-09-dungeon-systems.md) | Complete |
| 10 | [Caves, shops, secrets, NPCs](./phase-10-caves-secrets.md) | Complete |
| 11 | [Audio](./phase-11-audio.md) | Complete |
| 12 | [Save system & polish](./phase-12-save-polish.md) | Complete |
| 13 | [Hardening & stretch goals](./phase-13-hardening-stretch.md) | Complete |
| 14 | [Behavior fidelity (enemies, drops, triggers, stairs)](./phase-14-behavior-fidelity.md) | Complete |
| 15 | [Boss AI & Quest 2 overworld](./phase-15-bosses-q2-ow.md) | Complete |
| 16 | [ROM fidelity pass](./phase-16-rom-fidelity-pass.md) | Complete |
| 17 | [Stretch systems](./phase-17-stretch-systems.md) | Complete |
| 18 | [Quality of life 1](./phase-18-quality-of-life.md) | Complete |
| 19 | [Quality of life 2](./phase-19-quality-of-life-2.md) | Complete |
| 20 | [Continuous-camera cleanup](./phase-20-streaming-cleanup.md) | Complete |
| 21 | [Story text expansion](./phase-21-story-text-expansion.md) | Complete |
| 22 | [Multiplayer (1–4 players, split screen)](./phase-22-multiplayer.md) | PLAYABLE |
| — | [Thorough review (fidelity audit)](./phase-thorough-review.md) | Complete |

## Shared docs

| Doc | Purpose |
|-----|---------|
| [../rom-notes.md](../rom-notes.md) | Verified offsets, hashes, revision notes |
| [../behavior-oracle.md](../behavior-oracle.md) | Cross-phase “must match original” checklist |
| [../context/](../context/README.md) | Local-only manual + walkthrough (gitignored) for playability checks |
| [../../story/](../../story/README.md) | Every word the game says — NPCs, item pickups, labyrinth entries, the ending. Edit here, no re-extract (Phases 19, 21) |
