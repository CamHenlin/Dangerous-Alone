# Phase 8 — Enemies & combat

**Status:** Complete (playable vertical slice)  
**Outcome:** Overworld + dungeon enemy behaviors.

## Context

Implement by **family**, data-driven where the ROM is data-driven. Verify side-by-side with Mesen; record HP/speed/drops in [`docs/behavior-oracle.md`](../behavior-oracle.md).

## Checklist

- [x] Spawn tables per screen / room (counts + group IDs) — `spawn.js` + FoeCounts / ObjLists / SpawnPos
- [x] Octorok, Tektite, Leever (OW set, simplified AI); Lynel/Moblin/Peahat/Armos/Zora TBD
- [x] Dungeon set started: Keese, Gel, Goriya, Stalfos, Wallmaster, Aquamentus
- [x] CHR enemy sprites (OW / UW common / L1-2-7 / boss sheets)
- [x] Strength colors via sprite palette remap (red SP2 / blue SP1 / …)
- [x] Octorok rocks + Aquamentus fireballs
- [x] Room clear → shutter flag + foes-for-item reveal
- [x] Bow / Level 1 floor-item path (`$7F` Bow; boss heart on clear)
- [x] Ground enemies respect OW tile walkability (monster hotspot −$10); keese still fly
- [x] Projectile interactions, blockable-by-shield rules (wood vs rocks; magic vs fireballs)
- [x] Stun / boomerang / bait interactions (MVP)
- [x] Chase-biased wanderer AI + edge slide-in spawn (`monsterEntry`)
- [x] UW room tile collision (`firstUnwalkable = $78`)
- [x] Random enemy drops (`SetUpDroppedItem` tables, help/fairy streaks, clock)

## Done when

Level 1 is clearable end-to-end with Aquamentus and the Bow (or whichever item Level 1 holds in our revision).

## Commands

```bash
npm test
npm run extract -- overworld   # refresh play attrs (includes useMonsterGroups)
npm run dev                    # http://localhost:5173/play.html
```

**OW combat:** start `$77` → get sword (+ boom/bait) → walk east to `$78` (4 red Octoroks + rocks). Face shots to parry with the wood shield. Enter inventory (Start) and cycle B (X) for boomerang / bait.

**Level 1:** `$77` north ×4 → `$37` cave → dungeon (real keys/shutters/bombs in Phase 9) → boss room `$35` Aquamentus. Bow in room `$7F`. ↓ from start room exits to OW.

## Notes

### Deliverables

| Piece | Path |
|-------|------|
| Spawn resolver | `tools/shared/spawn.js` |
| Enemy AI / combat | `tools/shared/enemies.js` |
| CHR frame maps | `tools/shared/enemyAnim.js` |
| Projectiles / shield | `tools/shared/projectiles.js` |
| Boomerang / bait | `tools/shared/boomerang.js`, `bait.js` |
| Room secrets / items | `tools/shared/roomSecrets.js` |
| Dungeon room exits + UW grid | `tools/shared/dungeonPlay.js` |
| Sprite composer | `game/src/play/enemySprites.js` |
| Play wiring | `game/src/play/main.js` |

### Spawn rules (from CreateRoomObjects)

| Rule | Detail |
|------|--------|
| List ID | `monsterId \| (useMonsterGroups ? $40 : 0)` |
| Count | `FoeCounts[countIndex]`; forced 1 if `$32 ≤ id < $62` |
| Lists | `id ≥ $62` → ObjLists[id−$62] |
| Positions | SpawnPosList by Link facing; Y low nibble `$D` |
| Edge entry | `monsterEntry` → pending until `tryEdgeSpawn` places on border |

### CHR mapping

Enemy pattern blocks load at PPU `$8E` (OW / UW common), `$9E` (level set), `$C0` (bosses). Frame left-tiles come from `ObjAnimFrameHeap`; Aquamentus uses the 6-sprite boss layout.

### Intentional simplifications

- Wander AI is chase-biased (face Link/bait then open-dir fallback), not full Wanderer_TargetPlayer turn machine
- Key / shutter / bombable doors: see Phase 9 (soft-unlock removed)
- RoomKillCount persistence in save flags still deferred (drops are live via `enemyDrops.js`)
- Arrow/Bow shooting not implemented (pickup only)
- Bait is one-phase life (`$FF`); boom/bait drawn as simple overlays (no item CHR yet)
- Magic shield only via room item `$1C` (not sold in Phase 8 shops)

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Capture ObjLists + FoeCounts as constants from PRG1 | Avoid blocking on extract schema expansion |
| 2026-08-05 | Soft-unlock L1 keys for the vertical slice | Reach Aquamentus before full dungeon item loop |
| 2026-08-05 | Soft-grant boom+bait with sword cave | Exercise stun/bait without shop loop |
| 2026-08-05 | Hardcode L1 item XY from LevelInfo+$29 | Schema does not yet export ShortcutOrItemPosArray |

## Open questions

- Wire RoomKillCount into WorldFlags before Phase 9?
- Extract ShortcutOrItemPosArray into dungeon JSON?

## References

- [`docs/behavior-oracle.md`](../behavior-oracle.md)
- aldonunez `Z_05.asm` CreateRoomObjects / CheckUnderworldSecrets
- aldonunez `Z_01.asm` ObjAnimations / ObjAnimFrameHeap
- aldonunez `Z_04.asm` UpdateOctorock / Aquamentus_Shoot
- aldonunez `Z_07.asm` ObjectTypeToHpPairs / UpdateObject_JumpTable
