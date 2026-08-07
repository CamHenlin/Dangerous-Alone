# Phase 11 — Audio

**Status:** Complete (sequence replayer MVP)  
**Outcome:** Music and SFX without APU emulation (we re-voice the sequences).

## Approach options

Pick one early in the phase:

1. **Sequence replayer:** Extract note/channel data from the game’s music engine; play via Web Audio with simple synth (pulse/triangle/noise approximations).
2. **Sample bank:** Capture or reconstruct tracks as assets (less “from ROM logic,” easier fidelity).

Prefer (1) for purity; fall back to hybrid if the music engine is too costly mid-project.

## Checklist

- [x] Choose approach (sequence vs samples vs hybrid) and record under Decisions
- [x] Identify music engine in disassembly; dump track pointers / instruments
- [x] Overworld theme, dungeon theme, item get, game over, fanfares
- [x] SFX: sword, hurt, secret chime, stairs, boss defeat, etc.
- [x] Mute / volume options

## Done when

Completing Level 1 plays correct cues; overworld music loops cleanly.

## Commands

```bash
npm test
npm run extract -- audio
npm run dev
# http://localhost:5173/play.html
# First click/key unlocks AudioContext
# M mute · , / . volume
```

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Schema / extract | `assets/schema/audio.json`, `tools/extract/audio.js` → `audio/audio.json` |
| Format parser | `tools/shared/musicFormat.js` (Bank 0 descriptors + note table) |
| Web Audio player | `game/src/play/audio.js` |
| Cue wiring | `game/src/play/main.js` |

### Playlists (ROM part offsets)

| Cue | Parts |
|-----|-------|
| Overworld loop | `$75 Z` + `$7D/$85/$95/$7D/$8D/$95` (Z-[A1-A2-A3-A1-B-A3]) |
| Underworld | `$9D`, `$A5` |
| Level 9 | `$AD` |
| Item / Triforce / Ganon / Zelda | `$67` / `$6E` / `$B5` / `$F5` |

### Intentional simplifications

| Topic | MVP choice |
|-------|------------|
| Synth | Web Audio square/triangle + buffered noise (not cycle-accurate APU) |
| Duty / sweep / envelope | Approximate decay ramps only |
| Some combat SFX | Procedural (sword/hurt/secret) when not in MiscSounds table |
| Low-health beep | Extracted but not auto-looped yet |

### Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Sequence replayer from Bank 0 | Matches phase preference; Computer Archeology docs the format |
| 2026-08-05 | Delay-set byte is base offset into `$9FD1` | Matches `GetNoteLen` (`ADC $05F4`) |
| 2026-08-05 | Mute/volume in `localStorage` | Simple QoL without a settings screen |

## Open questions

- Full APU envelope/duty tables for closer timbre
- Auto low-health beep when hearts ≤ 1
