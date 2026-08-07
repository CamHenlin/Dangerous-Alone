# Phase 14 — Behavior fidelity (enemies, drops, triggers, stairs)

**Status:** Complete (with intentional leftovers)  
**Outcome:** Close the largest ROM-vs-play gaps left after Phases 8–13. Sprites for commons are largely mapped; this phase is **logic**.

## Context

Phases 8–9 shipped a completable Quest 1 loop with intentional MVPs (chase-biased wander, boss stubs, raft teleport). CHR coverage for OW/UW commons landed later. Side-by-side with `reference/zelda1-disassembly`, several systems still diverge enough to break feel or block secrets.

Audit sources: `Update*` / `CheckSecret*` / `SetUpDroppedItem` in `Z_04`/`Z_05`/`Z_01`/`Z_07`, plus `tools/shared/{enemies,enemyDrops,roomSecrets,pushBlock,dungeonCellar,projectiles}.js` and [`docs/behavior-oracle.md`](../behavior-oracle.md).

## Checklist

### P0 — Progression / feel breakers

- [x] **TRG-01** Room clear ignores bubbles + traps — `countsTowardRoomClear` / `roomAllDead`
- [x] **TRG-03 / DUN-07c** `BLOCK_STAIRS` (effect 5) — push spawns stairs at `$D0,$60` tile `$70`
- [x] **ENM-15** Invincibility masks — `damageMasks.js` + hit testers
- [x] **ENM-17** OW shooters — Moblin arrow, Lynel sword-shot, Goriya boom, Zora fireball
- [x] **ENM-21** Peahat hurt window — weapons only in flyer state 5
- [x] **ENM-23** Zora burrow + fireball — states 0–5; fireball at state 3
- [x] **ENM-24** Armos statue wake + under-armos secrets — fade-in, touch wake, OW stairs/bracelet
- [x] **ENM-26** Darknut shield + no-stun — face-parry; stun cleared every frame
- [x] **ENM-27** Bubble immortal + sword block — `$2B`/`$2C`/`$2D`
- [x] **ENM-29** Wallmaster capture — crawl rush + return to dungeon entrance
- [x] **ENM-30** Wizzrobe teleport + magic shot `$59`
- [x] **ENM-34** Like-Like capture — paralysis + steal magic shield at `$60`
- [x] **ENM-35** Blade traps — `$49`/`$4A` expand 6/4; sense / rush / retract

### P1 — Noticeably wrong

- [x] **TRG-02** Ringleader (effect 2) — slot 1 empty → force-kill clear-counting foes
- [x] **TRG-04** Money-or-life (effect 6) — person `$51` + pay wares; shutters when person clears
- [x] **TRG-05** Last-boss flag (effect 3) — `lastBossDefeated`, not plain all-dead
- [x] **TRG-08** Per-level item XY — `ShortcutOrItemPosArray` in LevelInfo → `itemPositions`
- [x] **DROP-03 / KEY-02** NES object slot 1 for drop suppress / key carriers
- [x] **DROP-07** `RoomKillCount` / cleared-room foe suppress (via `clearedRooms`, battery-backed)
- [x] **ENM-16 / ENM-42** `Wanderer_TargetPlayer` turn rates + grid-boundary facing (`wandererAi.js`)
- [x] **ENM-18** Honor HP pairs (Gel nibble 0 stays 0; no `$10` clamp)
- [x] **ENM-19** Zero-damage contact (bubbles) must not grant hurt invuln / ring min-damage
- [x] **ENM-25** Ghini death cascades Flying Ghini
- [x] **ENM-28** Rope rush — axis-aligned rush when Link within 8px
- [x] **ENM-31** Vire death → 2× red Keese
- [x] **ENM-32** Zol death/split → 2× Gel `$14`
- [x] **ENM-33** Pols Voice — sword-only + arrow instakill
- [x] **ENM-38–41** Boss AI beyond stubs — Dodongo / Gohma / Digdogger / Ganon — → [Phase 15](./phase-15-bosses-q2-ow.md)
- [x] **DUN-07b** Ambiguous cellar routing — LevelInfo order, attrs A|B match only (no lone fallback)
- [x] **DUN-12** Raft `UpdateDock` scroll — 1px/f dock ride + neighbor transition

### P2 — Polish

- [x] **DROP-04–06** Fairy flyer SM; lift `$80` + item SFX on take; Link/sword/boom/arrow takers
- [x] **TRG-09** Push-block exact pixel align (no ±4 soft align)
- [x] **SEC-02** Quest 2 overworld secret transforms — → [Phase 15](./phase-15-bosses-q2-ow.md)
- [x] **SEC-03** Push-grave face+hold fidelity — exact X, vertical, `$10` hold
- [x] **ENM-20** Bait 3×`$FF` phases + NES chase-set (not Lynel)
- [x] **ENM-22** Keese flyer state machine (speed-up / decide / chase / wander / slow / delay)
- [x] **ENM-36–37** Gibdo turn rate `$80` (via wanderer); Tektite hop arcs (`tektiteAi.js`)
- [x] **DUN-13** Ladder object sprite under Link (keeps `$F4` remap walkability)
- [x] **DUN-07d** Cellar enter spawn — `$30`/`$C0` ladder X, Y=`$41`, face down

## Done when

- [x] Bubble/trap rooms clear shutters and reveal FOES_FOR_ITEM correctly  
- [x] At least one `BLOCK_STAIRS` dungeon room works end-to-end  
- [x] Darknut, Bubble, Peahat, and Like-Like match NES vulnerability/contact rules in play  
- [x] Behavior-oracle rows added/updated for each shipped item; intentional leftovers listed under Decisions  

## Commands

```bash
npm test
npm run dev
# http://localhost:5173/play.html?debug=1
# Spot-check: cellar ladder side, raft dock $3F/$55, grave push hold, bait phases, tektite hops
```

## Notes

### Deliverables (shipped)

| Piece | Path |
|-------|------|
| Room-clear / secrets | `roomSecrets.js`, `moneyOrLife.js`, `pushBlock.js` |
| Damage masks + contact | `damageMasks.js`, `enemies.js`, `main.js` |
| Wanderer / keese / tektite | `wandererAi.js`, `tektiteAi.js`, `enemies.js` |
| Trap expand + slide | `trapAi.js` |
| Raft dock scroll | `raft.js` |
| Cellar enter / route | `dungeonCellar.js` |
| Drops / fairy / lift | `enemyDrops.js` |
| Grave push | `owSecrets.js` |
| Oracle updates | `docs/behavior-oracle.md` |

### Intentional leftovers

| Item | Why |
|------|-----|
| Simplified flyer/jumper timers | Feel-correct; not cycle-accurate APU/NMI |
| Ladder sprite heuristic | Visual stand-in; `$F4` remap remains the gameplay path |
| Raft ±2px dock X snap | QSpeed rarely hits exact NES X |
| Manhandla / Gleeok / Patra multi-slot AI | → [Phase 15](./phase-15-bosses-q2-ow.md) |

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-05 | New phase for fidelity (not reopen 8/9 as Complete) | Keep history; track remaining gaps as one backlog |
| 2026-08-05 | P0 = secrets + vulnerability rules before full AI ports | Unblocks rooms and makes commons “feel” NES first |
| 2026-08-05 | DROP-07 via `clearedRooms` empty spawn | Battery already tracks cleared |
| 2026-08-05 | Money-or-life skips full textbox; pay by ware XY only | Unblocks shutters without PersonText UI |
| 2026-08-05 | Boss AI → Phase 15 candidate | Scope control |
| 2026-08-05 | Finish P1/P2 polish (wanderer, raft scroll, cellar spawn, bait, grave) | Checklist completion without boss ports |

## References

- [`docs/behavior-oracle.md`](../behavior-oracle.md)
- aldonunez `Z_05.asm` — `RoomAllDead` / `CheckSecretTrigger*` / `InitMode9_EnterCellar`
- aldonunez `Z_04.asm` — wanderer / keese / tektite / dock / armos / traps
- aldonunez `Z_01.asm` — LifeOrMoney / item takers
