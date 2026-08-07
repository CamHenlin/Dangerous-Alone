# Phase 15 — Boss AI & Quest 2 overworld

**Status:** Complete  
**Outcome:** Full Phase-15 boss fight rules (including Manhandla / Gleeok / Patra); Quest 2 OW AttrsB + layout transforms; Quest 2 UW `LevelInfoUWQ2Replacements*`.

## Checklist

### Boss AI (ENM-38–41)

- [x] **Dodongo** — sword-immune; swallow bombs on fuse; stun on explode; die after 2 eats
- [x] **Gohma** — mask `$FB`; eye open window; arrows UP only when eye open; `$56` shots
- [x] **Digdogger** — invulnerable until flute; split into 1×/3× child `$18`
- [x] **Ganon** — blue sword phase → brown; silver arrow finish only in brown; `$56` while blue
- [x] **Aquamentus** — `$88`–`$C7` move limits
- [x] **Manhandla** — 4 mouth HP pools `$40`; speed-up on mouth death; `$56` shots; mask `$E2`
- [x] **Gleeok** — N heads (`type−$41`) HP `$A0` each; sword-only `$FE`; detach immortal `$46` flyers; `$56` shots
- [x] **Patra** — 8 orbiters (`$25`/`$26`); parent invulnerable until children clear; sword-only `$FE`

### Quest 2

- [x] OW AttrsB cave remaps (`$0E/$0F/$22/$34/$3C/$45/$74` + `$0B` monster overflow)
- [x] OW Layout swaps `$0B/$3C/$74` → play overlays under `play/q2/screens/`
- [x] OW AttrsA/F exit patches for `$3C/$74`
- [x] Runtime OW apply when `inv.quest === 2`
- [x] UW `LevelInfoUWQ2Replacements*` (`quest2LevelInfo.js`) — start/boss/TF/cellars/item XY/map

## Commands

```bash
npm run extract -- overworld   # writes play/q2/screens overlays
npm run extract -- dungeons    # Q2 LevelInfo applied in buildLevel
npm test
npm run dev
# http://localhost:5173/play.html?quest=2&debug=1
```

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | Boss AI as dedicated `bossAi.js` | Keep `enemies.js` dispatch thin |
| 2026-08-05 | Q2 layout overlays only for 3 rooms; AttrsB at runtime | Avoid dual full OW extract |
| 2026-08-05 | Manhandla mouths as HP pools (not 5 sprites) | Faithful kill/speed rules without multi-slot IK |
| 2026-08-05 | Gleeok necks collapsed to head HP + flyer detach | Spectacle necks are visual; fight loop is heads |
| 2026-08-05 | Q2 LevelInfo applied in `buildLevel` + `finalizeLevelMeta` | Extract and runtime stay consistent |

## References

- `Z_04.asm` — UpdateDodongo / UpdateGohma / UpdateDigdogger / UpdateGanon / UpdateManhandla / UpdateGleeok / UpdatePatra
- `Z_06.asm` — `@PatchQ2Rooms`, `LevelInfoUWQ2Replacements*`
