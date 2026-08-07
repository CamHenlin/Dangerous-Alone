# Phase 5 — Minimal playable slice (“Screen 0”)

**Status:** Done  
**Outcome:** Walk Link on the starting overworld screen with collision — still no full game.

## Checklist

- [x] Vite + PixiJS app: fixed 256×240 internal res, integer-scaled canvas
- [x] Load one screen’s tilemap + collision from extracted data
- [x] Link spawn, 4-direction movement, walk cycle frames
- [x] Tile collision (solid / water / sand as needed for that screen)
- [x] Camera = one screen (no scroll yet) or simple screen transition stub
- [x] Keyboard + Gamepad API input

## Done when

You can walk around the starting screen with collision that matches the original within a few pixels (document any intentional smoothing later).

## Commands

```bash
npm run extract -- overworld   # writes assets/extracted/play/start_screen.json
npm run dev                    # http://localhost:5173/play.html
```

Controls: **Arrow keys / WASD**, or gamepad D-pad / left stick.

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Play pack | `assets/extracted/play/start_screen.json` |
| Collision rules | `tools/shared/collision.js` |
| Link motion / anim | `tools/shared/linkMotion.js` |
| Play page | `game/play.html` + `game/src/play/` |

### Behavior (matched to disassembly)

| Item | Value |
|------|-------|
| Screen | `$77` |
| Spawn | X=`$78`, Y=`$8D` (from LevelInfo), face up |
| Speed | QSpeed `$60` × 4 / frame → **1.5 px/frame** |
| Collision | CHR tile after `WalkableTiles` remap; walkable if `< $89` |
| Hotspot | `(ObjX, ObjY+$0B)` + dir offset (−8 / +8 / +$10) |
| Draw | Link sprite Y = ObjY **+ 2** on overworld |
| Walk frames | `common_sprites` `$00`–`$0E`, 6-frame anim period |
| Camera | Fixed one screen; screen edges clamp (no transition yet) |

Start screen `$77` is mostly ground `$0E` (`$26` tiles) and solid rock — no water/sand. Remap list still implemented for fidelity.

### Intentional simplifications

- Perpendicular turns only when `gridOffset === 0` and on NES grid (`x&7===0`, `y&7===5`); full `Link_ModifyDirOnGridLine` reverse-in-cell logic not ported yet
- No ladder, cave entry, enemies, or HUD meters (black HUD bar stub only)
- Link palette comes from the graphics preview sheet (not live LevelInfo sprite rows)

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Collision on expanded CHR tiles, not square indices | Matches `GetCollidingTile`; corner squares `$33`–`$35` have mixed walkability |
| 2026-08-05 | Emit `play/start_screen.json` from overworld extract | Browser gets a ready tile grid without re-decoding columns |

## Open questions

- Port full mid-cell turn-around (`Link_ModifyDirOnGridLine`) before Phase 6 screen transitions?
- Live Link palette from LevelInfo sprite rows?

## References

- aldonunez `Z_07.asm`: `GetCollidingTileMoving`, `MoveObject`, `AnimateLinkBase`, `WalkableTiles`
- aldonunez `Z_05.asm`: `InitLinkSpeed`, `ObjectRoomBoundsOW`, spawn in `InitMode3_Sub8`
