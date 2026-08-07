# Phase 7 — Link actions & inventory

**Status:** Done  
**Outcome:** Core player verbs.

## Checklist

- [x] Sword (wood → white → master) swing hitboxes / durations from disassembly timings
- [x] Use item button: bombs usable; candle/boomerang stubs
- [x] Inventory / subscreen (B-item select) — functional first, pretty later
- [x] Damage, knockback, invulnerability frames
- [x] Heart containers (half-hearts), death / continue stub
- [x] Rupees, keys, bombs economy (HUD + bomb spend; rupees/keys display only)

## Done when

You can fight and die on the overworld with wooden sword behavior that feels correct vs emulator reference.

## Commands

```bash
npm test
npm run dev   # http://localhost:5173/play.html
```

**Quick path:** start `$77` → stand on cave mouth → get wood sword + 4 bombs → walk to a neighboring screen → Z/Space swing, X bomb, take hits until death → Enter continue.

## Controls

| Action | Keys | Pad |
|--------|------|-----|
| Move | Arrows / WASD | D-pad / stick |
| A (sword) | Z / Space | A |
| B (item) | X | B |
| Start (inventory / continue) | Enter / Shift | Start |

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Inventory state | `tools/shared/inventory.js` |
| Sword swing | `tools/shared/sword.js` |
| Bombs | `tools/shared/bomb.js` |
| OW combat dummies | `tools/shared/dummyEnemy.js` |
| Play loop wiring | `game/src/play/main.js` |
| HUD / inventory UI | `game/src/play/hud.js`, `inventoryUi.js` |
| Input edges | `game/src/play/input.js` |

### Behavior (from aldonunez timings)

| Item | Detail |
|------|--------|
| New game | No sword; 3 hearts (6 half-hearts) |
| Sword cave | `caveId === $10` on start screen grants wood sword + 4 bombs (shops/candle: Phase 10) |
| Swing | Freeze move; 16 frames (5 windup + 8 hit + 1+1+1 recover) |
| Hit window | Damage only in 8-frame HIT phase |
| Wood damage | `$10` (one dummy kill) |
| Attack tiles | Link body side `$10`, down `$14`, up `$18`; blade is separate CHR `$20` |
| Bomb gfx | Fuse CHR `$34`; dust clouds `$44` (approx; NES `$70+` not in common extract) |
| Invuln | 48 frames after harm |
| Knockback | `$20` px @ 4 px/frame |
| Bomb fuse / explode | `$30` / `$18` frames |
| Death | Overlay; Enter → full hearts; dungeon entrance or OW start |

### Intentional simplifications

- No white/magic sword acquisition path yet (tiers coded, not granted)
- Candle / boomerang are status stubs
- Enemies are red-box dummies (real AI in Phase 8)
- ~~No save slot / name entry; continue is session-only~~ → Phase 12
- Inventory overlay is text, not NES subscreen art
- Sword beam not implemented

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | A = Z/Space (not WASD A) | Keeps W/A/S/D for movement |
| 2026-08-05 | Sword cave grants bombs too | Lets B-item path be testable without shops |
| 2026-08-05 | No dummies on `$77` | Get sword before first fight |
| 2026-08-05 | Finish 8px grid step before re-checking tiles | Cave mouth look-ahead ($F3) was freezing Link at Y=$54 before warp Y=$4D |
| 2026-08-05 | Edge-detect Start/A/B once per frame | Multi-step frames were eating inventory close |

## Open questions

- Port sword beam at full health before Phase 8?
- ~~Exact shove vs solid tiles (currently soft clamp)~~ → `stepShove` stops on solids / bounds

## References

- [`docs/behavior-oracle.md`](../behavior-oracle.md)
- aldonunez: sword ObjState, `PlayerToWeaponOffsets`, `BombTimes`, heart half-units
