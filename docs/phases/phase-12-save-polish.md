# Phase 12 — Save system & polish

**Status:** Complete  
**Outcome:** Daily-driver playable build.

## Checklist

- [x] Title / file select (3 slots) matching original semantics
- [x] Persist inventory, dungeon items, map/compass, triforce, position, quest flags
- [x] Options: scale (1×–6×), fullscreen, integer vs smooth filter (optional), key rebind
- [x] Performance budget: stable 60 FPS in Chrome/Firefox/Safari on typical laptops
- [x] CI: `npm test` + production build (no ROM in CI; use synthetic fixtures)
- [x] Document “open in browser” workflow for Mac and Linux
- [x] Inventory should be displayed as in the original game, with the items in a grid and the equipped items displayed in a row above the inventory.
- [x] The minimap should be displayed as in the original game, with the map in a grid and the player's position marked with a dot.

## Done when

Full Quest 1 playthrough on Mac in the browser with save/load; Linux verified the same way.

## Commands

```bash
# One-time (needs your zelda.nes)
npm run extract -- all
# or at least: overworld dungeons caves graphics audio

npm test
npm run build          # no ROM required
npm run dev
# http://localhost:5173/play.html
```

### File select

- ↑↓ choose slot · Enter continue (or register name if empty)
- **N** rename (keeps progress) · **R** register/overwrite (confirms wipe) · **E** erase · **O** options
- Autosave on OW screen change, cave/dungeon exit, inventory close, tab hide, ~15s
- Continue bootstrap keeps `playing=false` until the world is restored (avoids wiping mid-dungeon saves)

### Options

Toolbar **Options** or title **O**: scale, filter, fullscreen, key rebind.  
Audio still M mute · ,/. volume (Phase 11).

### Skip title (dev)

`play.html?debug=1` or `play.html?slot=0` loads a slot without the file-select gate.

## Notes

### Deliverables

| Path | Role |
|------|------|
| `tools/shared/save.js` | Slot serialize/hydrate (inventory + dungeon progress + position) |
| `tools/shared/options.js` | Scale / filter / binds persistence |
| `game/src/play/titleUi.js` | Title + 3-slot file select |
| `game/src/play/optionsUi.js` | HTML options panel |
| `game/src/play/inventoryUi.js` | Equipped row + B-item grid + graphical minimap |
| `.github/workflows/ci.yml` | `npm test` + `npm run build` without ROM |

### Save payload (v1)

- Inventory (non-ephemeral fields)
- Position: mode, room, x/y/dir; dungeon resume; cave return
- `owSecretsRevealed`, `caveTaken`
- Per-level: cleared / taken / visited / pushed / doors / map / compass

Dungeon progress now survives leaving a level (Phase 9 wiped Sets on every `enterLevel`).

### Inventory / map UI

- Top row: A (sword) + B (selected) + triforce count
- Grid of selectable B items; passives listed below
- Right panel: 16×8 dungeon room grid (visited fill, white player dot, compass boss/TF marks) or OW locator

### Performance

Fixed 60 Hz accumulator unchanged (`TARGET_FPS = 60`). Integer scale + nearest filtering by default.

### Intentional differences

- Name entry is A–Z only (no NES controller letter grid)
- Inventory icons are labeled cells (not full CHR item sprites)
- OW minimap is a coarse 16×8 locator, not the NES triforce/radar HUD art
- Status bar (top HUD) shows the same OW locator / dungeon compact map live during play
- Mid-cave pose resumes outside the mouth (cave pickups still saved)
- Fullscreen is gesture-only (not restored on load — browser policy)

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | localStorage slots `zelda_slot_{0,1,2}` | Browser daily-driver; no emulator SRAM |
| 2026-08-05 | Persist per-level dungeon Sets + map/compass | Quest 1 requires revisit without losing clears |
| 2026-08-05 | CI builds with empty `assets/extracted` | ROM/assets stay private; engine still typechecks/bundles |
| 2026-08-05 | Clear `inv.map`/`inv.compass` on OW; restore per level on enter | Matches NES Items RAM swap |
| 2026-08-05 | N=rename, R=overwrite-with-confirm | Prevent silent wipe of filled slots |

## Open questions

- Optional: NES-style scrolling name-entry grid
- Optional: D-pad cursor on inventory B-grid (vs X cycle)
