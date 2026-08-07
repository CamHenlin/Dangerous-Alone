# Phase 17 — Stretch systems

**Status:** Complete  
**Outcome:** Phase 16 “future stretch” leftovers implemented as playable MVP systems.

## Checklist

- [x] Moldorm (`$41`) / Lamnola (`$3A`/`$3B`) — 5-segment chain, head AI, tail-shorten on hit
- [x] Recorder whirlwind (`$2E`) — OW summon when triforce owned; warp to next owned dungeon
- [x] Magic rod (`$59`) B-item + sword beam (`$57`) at full hearts
- [x] Candle fire — move `$10` then stand `$3F`; `DAMAGE.FIRE` / `$10` damage points (OW + UW)
- [x] Hungry Goriya / Grumble (`$36`) — feed bait nearby to clear
- [x] UW statue fireballs — layouts `$23` / `$24` → `$55` shots

## Modules

| Module | Role |
|--------|------|
| `tools/shared/moldormLamnola.js` | Worm expand / step / damage |
| `tools/shared/whirlwind.js` | Flute secrets + teleport level pick |
| `tools/shared/statues.js` | Layout timers → fireballs |
| `tools/shared/grumble.js` | Bait gate NPC |
| `tools/shared/candle.js` | Flame weapon motion + hit |

## Known MVP gaps

- Whirlwind skips full NT scroll / multi-screen flight
- Book of Magic does not yet leave residual fire from rod shots
- Grumble has no textbox; only bait proximity + despawn

## Commands

```bash
npm test
npm run dev
```

## References

- `Z_04.asm` — UpdateMoldorm / UpdateLamnola / UpdateStatues / UpdateBombOrFire
- `Z_05.asm` — SummonWhirlwind / UpdateWhirlwind
- `Z_01.asm` — CheckMonsterBombOrFireCollision / magical rod / sword beam
