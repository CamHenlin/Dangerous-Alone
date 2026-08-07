# Phase 16 — ROM fidelity pass

**Status:** Complete  
**Outcome:** Softlock / wrong-kill / save gaps closed after a disassembly audit vs `reference/zelda1-disassembly`.

## Checklist

### Combat / bosses

- [x] Like-Like: sword while captured (`canSwingSword` ignores `paralyzed`)
- [x] Boss IDs `$31` Dodongo / `$33` Gohma / `$44` Gleeok / `$48` Patra registered + masks
- [x] Gohma eye: arrows **UP only**
- [x] Dodongo: eat on **fuse**; explode dust → **stun** (sword while stunned)
- [x] Boomerang `DealDamage(0)` kills Gel
- [x] Digdogger flute window `$40` frames

### Save / secrets / OW

- [x] Power bracelet persisted in save
- [x] `BLOCK_STAIRS` restored on room revisit
- [x] Armos under-statue stairs/floor persisted in `owSecretsRevealed`
- [x] Rock push requires bracelet
- [x] OW ladder rooms `$17/$18/$19/$27/$4F/$5F` water walk with InvLadder
- [x] Take-any = one choice; door repair one-shot; gambling loss/win tables
- [x] `lastBoss` written into dungeon progress snapshots

## Closed here / elsewhere

| Item | Where |
|------|--------|
| Softlock / save / OW ladder / Dodongo–Gohma kill rules | This phase |
| Manhandla / Gleeok / Patra fight AI | [Phase 15](./phase-15-bosses-q2-ow.md) |
| Q2 `LevelInfoUWQ2Replacements*` | [Phase 15](./phase-15-bosses-q2-ow.md) |

## Stretch (done in Phase 17)

Moved to [phase-17-stretch-systems.md](./phase-17-stretch-systems.md): Moldorm/Lamnola, whirlwind, rod/beam/candle fire, Grumble, UW statues.

## Commands

```bash
npm test
npm run dev
```

## References

- `Z_04.asm` — UpdateLikeLike, Dodongo_CheckBombHit, Gohma_HandleWeaponCollision, UpdateRockOrGravestone
- `Z_07.asm` — LadderRoomsOW / CheckLadder
- `Z_01.asm` — MoneyGamePermutations / DealDamage
