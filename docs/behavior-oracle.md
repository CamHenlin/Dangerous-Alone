# Behavior oracle

Cross-phase checklist of behaviors that must match the original game (or are intentionally different). Detailed investigation notes belong in the relevant [phase doc](./phases/README.md); summarize the rule here once confirmed.

| ID | Area | Rule | Source | Status |
|----|------|------|--------|--------|
| OW-01 | Overworld | Screen edges at `$3D/$DD/$00/$F0`; neighbor Δ ±`$10`/±1 | Phase 6 | implemented |
| OW-02 | Overworld | Warp tiles `$24/$88/$70–$73` while `Y&$0F===$0D` and still | Phase 6 | implemented |
| LNK-01 | Link | Walk QSpeed `$60` → 1.5 px/frame average | Phase 5 | implemented |
| LNK-02 | Link | New game: no sword; 3 hearts as 6 half-hearts | Phase 7 | implemented |
| ATK-01 | Sword | Swing 16f (5+8+1+1+1); damage only in 8f HIT | Phase 7 | implemented |
| ATK-02 | Sword | Wood / white / magic damage `$10/$20/$40` | Phase 7 | implemented |
| ATK-03 | Combat | Invuln `$18` ticks @ 2 frames/tick = 48f (`DecrementInvincibilityTimer`); knockback `$20` px @ 4 px/f; stops on solid tiles; eject if embedded | Phase 7 | implemented |
| ITM-01 | Bombs | Fuse `$30` then explode `$18` | Phase 7 | implemented |
| ITM-02 | Inventory | B-item select via Start; A=sword B=item | Phase 7 | intentional-diff |
| ENM-01 | Spawn | FoeCounts OW `[1,4,5,6]`; L1 `[3,5,6,8]` | Phase 8 | implemented |
| ENM-02 | Spawn | List ID bit6 from arrangement; `$32–$61` force count 1 | Phase 8 | implemented |
| ENM-03 | HP | Wood sword `$10`; Aquamentus `$60` via HpPairs | Phase 8 | implemented |
| ENM-03b | Damage | ObjTypeToDamagePoints → half-hearts ($80=½♥, $01=1♥, $04=4♥) | Phase 8 | implemented |
| ENM-04 | OW | Screen `$78` → 4× red slow Octorok (`$07`) | Phase 8 | implemented |
| ENM-04b | OW | Screen `$48` → 4× red Leever (`$10`); dig/emerge cycle | Phase 8 | implemented |
| ENM-05 | Graphics | Enemy CHR via ObjAnimFrameHeap; blocks at PPU `$8E/$9E/$C0` | Phase 8 | implemented |
| ENM-05b | Graphics | Red/blue foes remap baked SP0 → LevelInfo SP1/SP2 | Phase 8 | implemented |
| ENM-06 | Projectiles | Octorok rock `$53`; Aquamentus 3× fireball `$55` | Phase 8 | implemented |
| ENM-07 | Secrets | Effect 7 reveals floor item on all-dead; `$7F` Bow always present | Phase 8 | implemented |
| ENM-08 | Collision | Ground foes use GetCollidingTileMoving (−$10); keese ignore tiles | Phase 8 | implemented |
| ENM-09 | Shield | Rock `$53` parried by wood when facing opposite; fireball `$55` needs magic | Phase 8 | implemented |
| ENM-14 | Contact | Link↔enemy: centers (Obj+8) within threshold `$09` (CheckLinkCollision) | Phase 8/13 | implemented |
| ENM-10 | Stun | Boomerang stun ~`$A0` frames; Aquamentus boom-immune (`invulnMask`) | Phase 8 | implemented |
| ENM-11 | Bait | Food attracts OW wanderer family while alive | Phase 8 | implemented (MVP) |
| ENM-12 | Spawn | `monsterEntry` edge slide-in via FindNextEdgeSpawnCell-style borders | Phase 8 | implemented |
| ENM-13 | UW | Dungeon foes use `firstUnwalkable = $78` play grid | Phase 8 | implemented |
| DROP-01 | Drops | `SetUpDroppedItem` tables/rates by monster group + `WorldKillCycle` | Phase 8 | implemented |
| DROP-02 | Drops | Keese/gel/like-like etc. never drop; red keese skips kill cycle | Phase 8 | implemented |
| DROP-03 | Drops | Help streak: 10 kills → 5R or bomb (if 10th was bomb dmg); reset on hurt | Phase 8 | implemented |
| DROP-04 | Drops | `WorldKillCount==$10` forces fairy; fairy heals 3♥ silently | Phase 8 | implemented |
| DROP-05 | Drops | Lifetime `$FF`, pickup after `<$F0`; Link/sword/arrow/boom can take | Phase 8 | implemented |
| DROP-06 | Drops | Clock freezes foes + tops Link invuln; clears on room change / hurt | Phase 8 | implemented |
| KEY-01 | Keys | UW keys are room items `$19` (not DropItemTable); FOES_FOR_ITEM reveals on clear | Phase 8/9 | implemented |
| KEY-02 | Keys | Stalfos / Like-Like / Gibdo (slot 1) carry the room key until death | Phase 8/9 | implemented |
| DUN-01 | Doors | Key door consumes 1 key and stays open both sides | Phase 9 | implemented |
| DUN-01b | Doors | Wall frames + door faces (`FillWalls` / `LayOutDoors`) | Phase 9 | implemented |
| DUN-02 | Doors | Shutters open on ALL_DEAD / FOES_FOR_ITEM / LAST_BOSS clear | Phase 9 | implemented |
| DUN-03 | Doors | Bombable wall opens when blast hits doorway probe | Phase 9 | implemented |
| DUN-04 | Items | Triforce piece sets inventory bitmask bit (level−1) | Phase 9 | implemented |
| DUN-05 | Push | Room-clear required; hold ~`$10` frames; travel `$10`; `$B0`↔`$74` tiles | Phase 9 | implemented |
| DUN-06 | Push | `BLOCK_DOOR` secret opens shutters on push complete | Phase 9 | implemented |
| DUN-07 | Cellar | Stairs `$70–$73` → cellar; exit up uses attrs A/B by X; return via attrs C | Phase 9 | implemented |
| DUN-08 | Map | Submenu shows visited; map fills layout; compass marks boss/triforce | Phase 9/12 | implemented (grid + player dot) |
| DUN-08b | Map | Status-bar minimap: OW radar + dungeon compact map (visit/map/compass) | Phase 12 | implemented |
| DUN-09 | Dark | `floorItem.dark` rooms start unlit; candle lights for current stay only | Phase 9 | implemented |
| DUN-10 | Candle | Blue once/stay (`UsedCandle`); red unlimited | Phase 9 | implemented |
| DUN-11 | Doors | `wall_or_pass` always walkable (false wall) | Phase 9 | implemented |
| DUN-11b | Doors | Exit only in doorway corridor; spawn in frame; DoorwayDir overflow matches NES (`Y=$8D`/`X=$78`, west `X<$21`) so floor statues keep collision | Phase 9 | implemented |
| DUN-12 | Raft | Dock screens `$3F`/`$55` cross with InvRaft | Phase 14 | implemented (`UpdateDock` scroll) |
| DUN-13 | Ladder | `$F4` walkable with InvLadder | Phase 9 | implemented |
| DUN-14 | Bosses | L2–L8 killable; Gohma eye/arrows; Ganon phases; Dodongo/Digdogger rules | Phase 15 | implemented |
| DUN-15 | L9 | Ganon death → Zelda room; proximity ends Quest 1 | Phase 9 | implemented |
| DUN-16 | Quest | `inv.quest` 1\|2 selects dungeon pack path | Phase 9 | implemented |
| CAV-01 | Caves | Cave IDs `$10–$23` from ROM item/price/text/dweller tables | Phase 10 | implemented |
| CAV-02 | Shops | Shop/potion prices use item-row index − 4 | Phase 10 | implemented |
| CAV-03 | Sword | `$10` grants wood sword + 4 bombs; `$12`/`$13` need 5/12 hearts | Phase 10 | implemented |
| CAV-04 | Potion | `$1a` requires letter; blue/red potions `$1F`/`$20` | Phase 10 | implemented |
| CAV-05 | Candle | Blue candle sold in shop `$1e` for 60R (no sword-cave soft-grant) | Phase 10 | implemented |
| SEC-01 | OW | Secret squares `$26–$2B` → burn/bomb/push/recorder; reveal stairs `$70–$73` | Phase 10 | implemented |
| SEC-02 | OW | Blue candle flame can burn bushes on overworld | Phase 10 | implemented |
| CAV-06 | Text | Cave strings use PersonText line flags (`$80` EOL, `$40/$C0` EOM) | Phase 10 | implemented |
| CAV-07 | Cave | Enter Mode-B room: black interior, dweller, fires, wares at `$58/$78/$98,$98` | Phase 10 | implemented |
| CAV-08 | Cave | Take/buy by walking onto ware; leave via south mouth | Phase 10 | implemented |
| CAV-09 | Cave | NPC/fire art are stand-ins (person CHR not extracted) | Phase 10 | intentional-diff |
| AUD-01 | Music | Overworld playlist Z-[A1-A2-A3-A1-B-A3] loops from Bank 0 parts | Phase 11 | implemented |
| AUD-02 | Music | Underworld `$9D`/`$A5` (L9 `$AD`) while in dungeon | Phase 11 | implemented |
| AUD-03 | Fanfare | Item `$67` / Triforce `$6E` interrupt then resume BGM | Phase 11 | implemented |
| AUD-04 | SFX | Sword, hurt, secret, stairs, enemy/boss death cues | Phase 11 | implemented |
| AUD-05 | Options | Mute (M) + volume (,/.) persisted in localStorage | Phase 11 | implemented |
| AUD-06 | Synth | Web Audio square/triangle/noise approx (not cycle-accurate APU) | Phase 11 | intentional-diff |
| SAV-01 | Save | 3 file slots in localStorage; inventory + dungeon progress + position | Phase 12 | implemented |
| SAV-02 | Save | Death continue keeps inventory/progress; dungeon → entrance, OW → start | Phase 12 | implemented |
| SAV-03 | UI | Inventory: equipped A/B row above B-item grid; minimap with player dot | Phase 12 | implemented |
| SAV-04 | Save | Map/compass cleared on OW; restored per level from dungeon progress | Phase 12 | implemented |
| SAV-05 | Save | Mid-dungeon continue restores room + x/y/dir; bootstrap does not clobber save | Phase 12 | implemented |
| OPT-01 | Options | Scale 1–6/auto, integer/smooth filter, key rebind; fullscreen gesture-only | Phase 12 | implemented |
| Q2-01 | Quest 2 | Dungeon packs via `inv.quest`; L9 boss/TF meta from room monsters | Phase 13 | implemented |
| Q2-02 | Quest 2 | Ganon→Zelda end overlay reports Quest 2; OW AttrsB/layout transforms | Phase 15 | implemented |
| QOL-01 | Practice | F5/F9 practice savestate (`zelda_practice`) separate from file slots | Phase 13 | implemented |
| TST-01 | Replay | Headless deterministic walk replay + state hash | Phase 13 | implemented |
| TRG-01 | Secrets | `RoomAllDead` skips bubbles `$2B–$2D` and types `≥$49` | Phase 14 | implemented |
| TRG-02 | Secrets | Ringleader: empty slot 1 force-kills clear-counting foes | Phase 14 | implemented |
| TRG-03 | Secrets | `BLOCK_STAIRS` push spawns stairs at `$D0,$60` (`$70`) | Phase 14 | implemented |
| TRG-04 | Secrets | Money-or-life `$51`: pay ware `$58`/−♥ or `$98`/−50R → shutters | Phase 14 | implemented |
| TRG-05 | Secrets | `LAST_BOSS` uses `LastBossDefeated`, not plain all-dead | Phase 14 | implemented |
| TRG-08 | Secrets | Room item XY from LevelInfo `ShortcutOrItemPosArray` | Phase 14 | implemented |
| ENM-15 | Combat | ObjInvincibilityMask (Darknut/Wizz `$F6`, Pols `$FE`, …) | Phase 14 | implemented |
| ENM-17 | Combat | Moblin arrow / Lynel sword-shot / Goriya boom / Zora fireball | Phase 14 | implemented |
| ENM-18 | Combat | HP pairs honored (Gel nibble 0 = one-shot) | Phase 14 | implemented |
| ENM-19 | Combat | Zero-damage contact skips hurt invuln / ring floor | Phase 14 | implemented |
| ENM-21 | Combat | Peahat weapons only in flyer rest state 5 | Phase 14 | implemented |
| ENM-23 | Combat | Zora burrow states; fireball when emerged (state 3) | Phase 14 | implemented |
| ENM-24 | Combat | Armos statue wake + fade; OW under-Armos stairs/bracelet | Phase 14 | implemented |
| ENM-25 | Combat | Ghini death cascades living Flying Ghini | Phase 14 | implemented |
| ENM-26 | Combat | Darknut face-parry + stun cleared every frame | Phase 14 | implemented |
| ENM-27 | Combat | Bubbles immortal; `$2B`/`$2C`/`$2D` sword-block rules | Phase 14 | implemented |
| ENM-28 | Combat | Rope axis rush when Link within 8px | Phase 14 | implemented |
| ENM-29 | Combat | Wallmaster crawl + capture → dungeon entrance | Phase 14 | implemented |
| ENM-30 | Combat | Wizzrobe teleport + magic shot `$59` | Phase 14 | implemented |
| ENM-31 | Combat | Vire death → 2× red Keese | Phase 14 | implemented |
| ENM-32 | Combat | Zol death → 2× Gel | Phase 14 | implemented |
| ENM-33 | Combat | Pols Voice sword-only; arrow instakill | Phase 14 | implemented |
| ENM-34 | Combat | Like-Like paralysis; steal magic shield at timer `$60` | Phase 14 | implemented |
| ENM-35 | Combat | Trap `$49`/`$4A` expand 6/4; sense / rush / retract | Phase 14 | implemented |
| DROP-07 | Drops | Cleared rooms suppress foe respawn (`clearedRooms`) | Phase 14 | implemented |
| DROP-04 | Drops | Fairy flyer SM; non-fairy take lifts `$80` + item SFX | Phase 14 | implemented |
| DROP-06 | Drops | Item takers: Link / sword / boom / arrow only | Phase 14 | implemented |
| ENM-16 | AI | Wanderer turn rates + tile-boundary facing (`wandererAi.js`) | Phase 14 | implemented |
| ENM-20 | AI | Bait 3×`$FF` phases; chase-set excludes Lynel | Phase 14 | implemented |
| ENM-22 | AI | Keese flyer state machine | Phase 14 | implemented |
| ENM-36 | AI | Gibdo/Stalfos turn rate `$80` via wanderer | Phase 14 | implemented |
| ENM-37 | AI | Tektite hop arcs (`tektiteAi.js`) | Phase 14 | implemented |
| TRG-09 | Secrets | Push-block exact X/(Y+3) align | Phase 14 | implemented |
| SEC-03 | Secrets | Grave push: exact X, vertical face, `$10` hold | Phase 14 | implemented |
| DUN-07b | Cellar | Route by LevelInfo cellar list + attrs A\|B match | Phase 14 | implemented |
| DUN-07d | Cellar | Enter spawn `$30`/`$C0`, Y=`$41`, face down | Phase 14 | implemented |
| DUN-12 | Raft | `UpdateDock` 1px/f scroll + north neighbor | Phase 14 | implemented |
| DUN-13 | Ladder | Underfoot ladder sprite when InvLadder | Phase 14 | implemented |
| ENM-38 | Bosses | Dodongo / Gohma / Digdogger / Ganon fight AI (`bossAi.js`) | Phase 15 | implemented |
| ENM-39 | Bosses | Manhandla mouths + speed-up; Gleeok heads/`$46`; Patra orbiters | Phase 15 | implemented |
| SEC-02b | OW | Quest 2 overworld secret transforms (`quest2OwPatch.js`) | Phase 15 | implemented |
| Q2-03 | Quest 2 | UW `LevelInfoUWQ2Replacements*` start/boss/TF/cellars/items/map | Phase 15 | implemented |
| ENM-34b | Combat | Like-Like capture blocks movement only — sword still works | Phase 16 | implemented |
| ENM-38b | Bosses | Boss IDs `$31/$33/$44/$48`; Dodongo fuse-eat + stun; Gohma UP arrows | Phase 16 | implemented |
| ENM-10b | Combat | Boomerang DealDamage(0) kills Gel | Phase 16 | implemented |
| SAV-06 | Save | Power bracelet persisted; `lastBoss` in dungeon progress | Phase 16 | implemented |
| TRG-03b | Secrets | `BLOCK_STAIRS` restored on revisit; Armos reveals persisted | Phase 16 | implemented |
| SEC-03b | Secrets | Rock push requires InvBracelet | Phase 16 | implemented |
| DUN-13b | Ladder | OW LadderRoomsOW water walk with InvLadder | Phase 16 | implemented |
| CAV-10 | Cave | Take-any one choice; door repair one-shot; MoneyGame amounts | Phase 16 | implemented |
| ENM-40 | Combat | Moldorm/Lamnola: two 5-seg chains (10 objs); hits shorten tail | Phase 17 / thorough review N2 | implemented |
| ENM-41 | Combat | Hungry Goriya `$36` feeds on bait then despawns | Phase 17 | implemented |
| ENM-42 | Combat | UW statue layouts `$23`/`$24` shoot `$55` | Phase 17 | implemented |
| WPN-01 | Weapons | Candle fire move `$10` / stand `$3F`; `DAMAGE.FIRE` | Phase 17 | implemented |
| WPN-02 | Weapons | Magical rod `$59`; sword beam `$57` at full hearts | Phase 17 | implemented |
| OW-WW | OW | Recorder whirlwind → next owned triforce dungeon | Phase 17 | implemented |
| DEMO-01 | Modes | Attract mode `$00` title/waterfall/story crawl before file select | Thorough review B3 | implemented |
| END-01 | Modes | Mode `$13` thanks → credits → tableau → Q2 profile switch | Thorough review B5 | implemented |
| CAV-11 | Cave | Potion shop wares hidden until letter shown with B (`InvLetter`→2) | Thorough review M25 | implemented |
| ENM-43 | Spawn | Moldorm/Lamnola: 2×5-seg chains (`InitMoldorm` / `InitLamnola`) | Thorough review N2 | implemented |
| ENM-44 | Spawn | Spawn cloud puff (`spawnCloud`) before foe sprite | Thorough review N3 | implemented |
| UI-01 | Title | NES register grid (mode `$E`) for name entry | Thorough review M26 | implemented |
| SCR-01 | OW/UW | NES ScrollWorld screen/room scroll (OW 4px/UW 2px H; V 8px @ 2/4 frames) | Thorough review M3 | implemented |
| TXT-01 | Cave | Cave / person dialogue uses NES BG charset (`nesMultilineText`) | Thorough review M23 | implemented |

**Status values:** `unknown` · `measured` · `implemented` · `intentional-diff`
