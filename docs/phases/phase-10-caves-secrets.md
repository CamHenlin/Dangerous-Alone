# Phase 10 — Caves, shops, secrets, NPCs

**Status:** Complete (Quest 1 progression MVP)  
**Outcome:** Overworld progression softlocks removed.

## Checklist

- [x] Cave types table (shops, gambling, clues, white/magic sword, take-any-road, etc.)
- [x] Text decoding + dialogue renderer (full multiline ROM strings; cave interior typewriter)
- [x] Secret triggers: burn, bomb, push grave, play recorder
- [x] Money-making / gambling (MVP RNG), potion shop (letter gate), door repair charge
- [ ] 2nd quest overworld transformations → deferred to Phase 13 (Q2 dungeons already via `?quest=2`)

## Done when

A blind playthrough can obtain swords, potions, and required dungeon items without cheats.

## Commands

```bash
npm test
npm run extract -- caves
npm run extract -- overworld   # play packs include secrets[]
npm run dev
# http://localhost:5173/play.html
```

**Progression (no `?debug=1`):**
1. Start `$77` → cave `$10` → wood sword + 4 bombs (keys **2**)
2. Farm rupees → shop `$66` (G7, cave `$1e`) → blue candle **60R** (keys **1–3**)
3. Burn bushes / bomb rocks → more caves
4. White sword `$0a` (cave `$12`) at 5 heart containers
5. Letter cave `$0e`/`$11` (cave `$18`) → potion shops (`$1a`) sell medicine
6. Blue ring shop `$34` (cave `$20`) optional **250R**

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Cave schema / extract | `assets/schema/caves.json`, `tools/extract/caves.js` → `tables/caves.json` |
| Cave logic | `tools/shared/caves.js`, `caveText.js` |
| OW secrets | `tools/shared/owSecrets.js` (+ `secrets[]` on play packs) |
| Cave room | `tools/shared/caveRoom.js`, `game/src/play/caveScene.js` |
| Inventory | `letter`, `potion`, `ring`; sword cave no longer soft-grants candle |

### Intentional simplifications

| Topic | MVP choice |
|-------|------------|
| Dialogue | Full multiline ROM text with typewriter; monospace (not CHR-blit tiles yet) |
| NPC sprites | Drawn stand-ins (person CHR bank not separately extracted) |
| Gambling / money game | 50% double-or-nothing on stake |
| Take-any-road | Walk mid-room onto road slot → warp |
| Shop prices | Item row + price row offset −4 for shops/potions (Data Crystal) |
| Q2 OW layout swaps | → [Phase 15](./phase-15-bosses-q2-ow.md) |
| Soft-grants | Removed from sword cave; use shops/secrets |

### Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Shop price index = item index − 4 | Matches DC potion/store price offsets; parallel tables alone put candle at 0R |
| 2026-08-05 | Drop sword-cave candle soft-grant | Done-when requires buying candle |
| 2026-08-05 | Real cave Mode-B scene (not overlay menu) | Match NES enter/exit, ware touch, dweller layout |

## Open questions

- CHR-blit dialogue + ROM person sprite tiles
- Exact gambling permutation tables vs MVP RNG
