# Phase 23 — Multiplayer

**Status:** TODO
**Outcome:** 1–4 players share one Hyrule, each with their own camera, in their
own quadrant

Every phase so far has assumed one hero. `game/src/play/main.js` is built around
three closure-local objects — `link`, `inv` and `sword` — with ~440 direct
references in that file and ~900 more across `tools/shared/`. The shared layer is
already parameterized (`stepLink(link, …)`, `harmLink(inv, …)`), but it is
parameterized for *the* hero, not *a* hero. This phase makes the hero plural and
gives each one a viewport, without changing what a solo playthrough looks or
feels like.

Three things are settled before any code (see Decisions): the frame grows to
512×544 at two or more players so each quadrant is a full-size NES view, players
are fully independent and may be in different modes at the same time, and the
sim stays single with four cameras drawing it.

## Checklist

### The plural hero

- [ ] Replace the singular `link` / `inv` / `sword` closure locals with a
  `players[]` array of player records, each holding its own `link` (position,
  facing, animation), `sword` swing state, per-player inventory fields, and its
  own world context (`mode`, `roomId`, `screen`, `dungeon`, `caveReturn`). Thread
  it through every call site in `main.js` and every `tools/shared/` entry point
  that takes `link` or `inv`. **At the end of this item the game is still
  single-player and behaves identically** — `players` just has length 1, and
  `npm test` is green. Nothing below starts until this lands.
- [ ] Split the inventory into the part that is shared and the part that is not.
  Shared: items owned, quest flags, rupees, keys, bombs, sword tier, world
  flags (`owSecretsRevealed`, `caveTaken`, `owItemsTaken`, `hintMarks`,
  `toldStory`, dungeon progress, `clock`). Per-player: `selectedB`, `halfHearts`,
  `maxHalfHearts`, `invuln`, `shoveDir`, `shovePixels`, `dead`, `paralyzed`,
  `swordBlocked`, `itemLiftTimer`. Keep `createInventory()` as the shared half so
  the existing field names and the save keys stay put. `clock` is shared because
  it freezes enemies and the enemies are global.

### Controllers, joining and leaving

- [ ] Extend the options screen with a controller setup for players 1–4: assign a
  device (keyboard set A, keyboard set B, or a specific gamepad index) to each
  slot, and rebind every button per slot. Today `input.js` merges *all* gamepads
  into one mask and hard-codes A=0, B=1, Select=8, Start=9; that becomes per-slot
  bindings persisted alongside `binds` in `tools/shared/options.js`.
- [ ] Two independent keyboard bind sets, so two players can share one keyboard
  and multiplayer is playable — and testable — with no gamepads attached. The
  defaults split the existing `DEFAULT_BINDS`: WASD for set A, arrows for set B,
  with distinct action keys. A key may not appear in both sets.
- [ ] `createInput()` becomes one input source per player slot, reading only its
  assigned device. Unassigned devices are still polled, but only for the join
  chord.
- [ ] Pressing Start on a configured-but-inactive controller joins that player
  (Start on an *active* controller opens the shared menu, so the two can't
  collide). A joining player spawns at the position and mode of the lowest-
  numbered active player, with full hearts at the current shared
  `maxHalfHearts`, and their quadrant fades in from the join prompt.
- [ ] Pressing Start + Select together leaves the game and returns that player's
  quadrant to the join prompt. The last remaining player cannot leave this way.
- [ ] Joining works at one player too, when there is no visible join prompt on
  screen: a configured, inactive controller pressing Start splits the screen.

### Split screen

- [ ] Make `INTERNAL_W` / `INTERNAL_H` depend on the player count instead of
  being constants: 256×240 at one player, 512×544 at two or more, resizing the
  Pixi renderer on the transition. Solo therefore stays the ROM's exact frame and
  never pays the display-scale cost of the larger one.
- [ ] Lay the multiplayer frame out as a 2×2 grid of 256×240 quadrants filling
  y 0–480, with a 512×64 shared status bar beneath at y 480–544. Each quadrant
  keeps the ROM's own split: a 64px bar on top, a 256×176 playfield below. The
  playfield is the same size a solo player gets, so nobody sees more or less
  world than they do today.
- [ ] The per-player bar carries that player's number, hearts and A/B item
  boxes — today's HUD with the minimap and counters removed. The shared bar
  carries what is read once rather than four times: minimap, rupees, keys and
  bombs. Its full 512px width is what makes room for a four-digit rupee counter.
- [ ] Rehome everything else authored against the 256×240 frame — title, name
  entry, attract/demo, inventory submenu, death and continue UI, ending and
  credits. At one player every one of them is pixel-identical to today.
- [ ] Give each player its own view: its own `streamView` instance, enemy sprite
  map and camera, all driven by the one simulation. `applyPlayCamera()` and
  `cameraLocalForLink()` become per-view.
- [ ] An unused quadrant is black with the player number and "PRESS START TO
  JOIN".
- [ ] Dropping back to one player returns to the single full-size view.
- [ ] Every other player's Link visible in your quadrant is drawn with their
  player number floating above their head. Your own Link is unmarked.

### One world, four places in it

- [ ] Room streaming, enemy spawning and culling become "visible to *any*
  camera". `cullOffscreenEnemies()` and `releaseSpawnLatch()` in
  `tools/shared/roomStream.js` currently test one camera rect; the spawn latch
  must not release while another player still has the room on screen.
- [ ] Enemies, bosses and wanderers target the nearest living player rather than
  `link`. Applies to `enemies.js`, `bossAi.js`, `wandererAi.js` and the
  projectile aim.
- [ ] Any player can damage any enemy and the damage accumulates on that enemy.
  Players do not collide with each other, cannot damage each other, and their
  swords, bombs, arrows and flames pass through each other harmlessly. Your own
  bomb still hurts you, as it does in the ROM. Enemy health is not scaled up to
  compensate for four swords — four players make the game easier, and that is
  the point.
- [ ] Item pickups are shared: a Triforce shard, a heart container, a dungeon
  item or a rupee taken by anyone is taken by everyone. A heart refill heals only
  the player who touched it; a heart container raises the max for all players and
  fills the finder.
- [ ] Consumable caps scale with the active player count: 255 rupees and 8 bombs
  each become ×N. `formatStatusCount()` in `tools/shared/statusBarText.js` clamps
  at 255 and emits exactly three glyphs, so the status bar needs a wider counter
  before 4-player 1020 rupees can be shown. Bomb-bag upgrades from caves multiply
  the same way. When a player leaves and the cap drops below the current purse,
  the excess is kept but not added to.
- [ ] Dungeon room state stays global while players occupy different rooms of the
  same dungeon: a shutter opens for the room that was cleared, key doors consume
  from the shared key count, and pushed blocks stay pushed. A room counts as
  cleared when no living enemy has that `homeRoomId`, regardless of who killed
  them or who is standing there.
- [ ] Players may be in different modes at once — overworld, a cave and two
  different labyrinths. Stairs, cave mouths and warps move only the player who
  took them.

### Shared menus, private conversations

- [ ] The inventory submenu shows the shared bag, and any player may open it.
  Opening it stops the world for everyone and whoever opened it drives it, but
  the B item they choose is their own — four players draw from one bag and each
  carries what they like. It may be opened while another player has a text box
  open; the box pauses with everything else and resumes on close.
- [ ] Dialogue is per-player and shown only in that player's quadrant. A text box
  freezes only its own reader — the phase 22 behaviour where an open box freezes
  a labyrinth must not freeze the other three players. One-shot beats
  (`toldStory`) stay shared, so an item is introduced to whoever picks it up
  first and stays quiet afterwards.
- [ ] Post-dungeon briefings and labyrinth-entry beats are the exception: they
  are the story, so they open in every active player's quadrant at once and each
  player pages their own copy. Ordinary NPC and item dialogue stays private.
- [ ] A player at zero hearts dies alone: their quadrant runs the death
  animation, then they respawn beside the lowest-numbered living player with
  three hearts, entering that player's cave or labyrinth if that is where they
  are. A shared life potion is drunk automatically on death and consumed for the
  group, as the ROM does. The continue/save/retry menu only appears when *all*
  active players are dead, and at one player the whole death flow is the ROM's
  unchanged.
- [ ] Music follows the lowest-numbered active player's mode. Sound effects play
  for events in any player's view.
- [ ] The ending plays once, triggered by whoever completes it, on the full
  screen for everybody.

### Save and test

- [ ] Extend the save format to hold per-player hearts and positions with a
  version bump. A multiplayer save loaded with fewer controllers starts the
  players that have controllers; a single-player save joined by a second
  controller works from the join path.
- [ ] Extend `tools/shared/replay.js` from one mask per frame to N, so join,
  leave, cap scaling, target selection, room-clear and shared pickups can all be
  driven headlessly.

## Done when

All of the above are implemented, `npm test` is green, a solo playthrough is
indistinguishable from today, and a 4-player session has been driven in the
browser — including joining mid-dungeon, leaving mid-dungeon, four players in
four different modes at once, and a death with the others still alive.

## What was added

## Notes

### Known load-bearing constants

| What | Where |
|------|-------|
| `INTERNAL_W` / `INTERNAL_H` = 256 / 240 | `game/src/play/main.js:460` |
| `HUD_HEIGHT` = `$40` | `tools/shared/collision.js:56` |
| `PLAY_W` / `PLAY_H` = 256 / 176 | `tools/shared/continuousCamera.js:13` |
| `createLinkState` | `tools/shared/linkMotion.js:189` |
| `createInventory` | `tools/shared/inventory.js:61` |
| `createSwordState` | `tools/shared/sword.js:52` |
| Counter clamped to 255, 3 glyphs | `tools/shared/statusBarText.js:14` |
| `SAVE_VERSION` = 1, `PERSISTED_INV_KEYS` | `tools/shared/save.js` |
| Single camera offset on `playField` | `applyPlayCamera()` in `main.js` |
| One-camera cull and spawn latch | `tools/shared/roomStream.js` |

### Display scale

512×544 is taller than half of 1080, so `integerScale()` gives it 1× on a 1080p
screen where today's 256×240 gets 4×. Two mitigations are worth trying before
accepting a small window: offer a non-integer fit for the multiplayer frame
(nearest-neighbour at a fractional scale gives uneven pixel widths, which is
much less objectionable at 2.4× than at 1.2×), and revisit the fixed 1–6× list
in the options, which is calibrated for the small frame.

### Performance

Four cameras streaming up to four rooms each is up to 4× the background
containers and 4× the live enemy set of today's worst case. The spawn latch and
the off-camera cull are what keep that bounded, which is why they have to become
multi-camera aware rather than being widened to "never cull".

## Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-13 | The frame grows to 512×544 at two or more players; each quadrant is a full 256×240 NES view | Quartering the existing frame leaves 128×88 of world per player — a quarter of a room, not enough to see an Octorok before it lands |
| 2026-08-13 | The frame size follows the player count rather than being a constant | 512×544 only integer-scales 1× on a 1080p screen; making the size dynamic means a solo player keeps today's 4× and only co-op pays |
| 2026-08-13 | Players are fully independent: mode, room, dungeon and dialogue are all per-player | Tethering everyone to one player's cave door is the cheap version and it is not the game described |
| 2026-08-13 | One simulation, four views | Pixi is already drawing one `playField` from a shared entity list; four scene graphs over one sim keeps the physics and the fidelity tests singular |
| 2026-08-13 | Hearts and the selected B item are per-player; the bag itself is shared | A shared purse is what makes co-op cooperative, but a shared B slot means four players fighting over one button — one bag, four loadouts |
| 2026-08-13 | The plural-hero refactor lands first and alone, with `players.length === 1` | It touches ~1300 references; landing it behind identical behaviour means the rest of the phase builds on green |
| 2026-08-13 | Death respawns you beside the lowest-numbered living player, not where you died | Co-op that scatters you further apart every time you die punishes the thing it should reward; regrouping is the forgiving read |
| 2026-08-13 | Two keyboard bind sets | Otherwise nobody without two gamepads can play — or test — anything in this phase |
| 2026-08-13 | The life potion is auto-drunk from the shared bag on any player's death | It is the ROM's behaviour, and a shared bag means a shared safety net |
| 2026-08-13 | `clock` is shared, not per-player | It freezes enemies, and the enemies are global; a per-player clock has nothing to act on |
| 2026-08-13 | Briefings play to everyone, ordinary dialogue to one | Phase 22 made the briefing the spine of the story; three players missing the plot because someone else grabbed the shard is not a trade worth making |

## Open questions

- Should each player's Link be recoloured (green / red / blue / purple) as well
  as numbered? `tools/shared/recolor.js` exists and would make four Links
  readable at a glance, but it is a departure from the ROM palette.
- Two players in four quadrants wastes half the screen. Is a 2-up split worth a
  special case, or is the constant quadrant layout (with two join prompts)
  actually the clearer read?
- Does a leaving player's share of the purse matter — should the cap drop
  immediately, or ratchet down only as rupees are spent?
- Item usage that changes the world (the flute drying the lake, a bombed wall)
  is shared, but the raft and ladder are physical states on one Link. Confirm
  nothing about a second player standing on a dock breaks the raft ride.
- Attract mode and the demo playback are single-player recordings. Do they stay
  that way, shown on the full screen before anyone joins?
