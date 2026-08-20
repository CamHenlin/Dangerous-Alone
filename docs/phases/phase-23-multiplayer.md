# Phase 23 — Multiplayer

**Status:** PLAYABLE
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

### A sim you can prove things about

- [x] Extract the simulation out of the Pixi closure into a module that can
  be stepped headlessly. `tools/shared/playSim.js` is that step: given a
  session state and an input mask it advances one frame with no `Container`,
  no `Sprite` and no `window`. `goldenSession.js` builds the session and
  hashes the trajectory. Mode transitions, room loads, drops and the rest of
  the Pixi orchestration stay in `main.js` and stay under the browser
  harness — lifting `stepCombat` out of that closure would churn the 86
  browser goldens for no playable gain. **No behaviour change** — the Node
  hashes are the same functions in a new file.
- [x] A golden harness over the shared sim: `tools/shared/goldenSession.js`
  scripts a session across link motion, the sword and its hits, enemy stepping,
  contact damage and the hurt/invuln/shove machine, and commits a rolling hash
  of **every frame** (five scenarios in `goldenSession.test.js`). `replay.js` is
  left as the `stepLink`-only MVP it was; the harness is a new module rather
  than a rewrite of it.
  - The hash is a trajectory, not a resting state. Hashing only the final state
    passed a deliberately broken build where the hero and the foes stepped in
    the wrong order — a swing landing a frame late still ends with a dead
    Octorok. The rolling fold catches it, and a test pins that property by
    running two routes to one destination and asserting the traces differ.
  - Each golden is paired with plain-language assertions (the Octorok dies, no
    hearts are traded for it, invulnerability holds the follow-up off), so a
    break can be triaged without reverse-engineering a CRC.
- [x] A second harness for the `main.js` orchestration the Node one cannot
  reach: `tools/browser/` drives the real game in headless Chromium through
  `window.zeldaDebug`, folding `probe()` into the same kind of rolling
  trajectory hash. Six scenarios, `npm run test:browser`, ~14s, kept out of
  `npm test` so the two-second Node suite stays dependency-free.
  - Determinism needed three fixes: `?debug=1&pause=1` so the loop stops
    advancing on wall-clock time before the harness takes over, a seeded RNG
    for edge spawns, and draining in-flight room loads at each frame boundary.
    See Two holes in determinism.
  - Verified by breaking `main.js` on purpose (a sword swing that never
    starts) and confirming the affected goldens fail.
  - Each frame is also checked against the invariants `probe()` was built for:
    the screen tracks the room, Link is inside the anchor, the collision grid
    is the array the tile probes read, no sprite outlives its enemy.
- [x] Those hashes are the contract for everything below: the plural-hero
  refactor is done when they are unchanged, not when it looks right. Solo
  browser goldens have stayed on the same traces through the party work.

### The plural hero

- [x] The roster exists: `tools/shared/player.js` holds a player record and
  `main.js` has `players = [createPlayer({ index: 0, link, sword })]`.
  `link` and `sword` are `const` and only ever mutated, so the record holds
  the very objects the closure locals point at — `players[0].link === link` —
  and all ~1300 existing references keep working while the structure goes in
  around them. Enemy targeting is the first consumer and now asks
  `activeLinks(players)` instead of naming `link`.
- [x] Replace the singular `link` / `inv` / `sword` closure locals with a
  `players[]` array of player records, each holding its own `link` (position,
  facing, animation), `sword` swing state, per-player inventory fields, and its
  own world context (`mode`, `roomId`, `screen`, `dungeon`, `caveReturn`). Thread
  it through every call site in `main.js` and every `tools/shared/` entry point
  that takes `link` or `inv`. **At the end of this item the game is still
  single-player and behaves identically** — `players` just has length 1, and
  `npm test` is green. Nothing below starts until this lands.

  The world context is not threaded. `mode`, `roomId`, `screen`, `dungeon` and
  `caveReturn` are 619 reference lines in `main.js` (`dungeon` alone is 249),
  and threading a player through all of them is a rewrite that no test can
  review. Instead `tools/shared/playerFocus.js` says *whose* those variables
  are: the frame runs inside `focus.on(player, ...)`, the variables are the
  live copy, and `player.world` is where a context waits while someone else is
  simulated. Every existing reference keeps working and now means "the player
  being simulated".

  Copying happens only when the focus moves between players, which is the part
  that matters. The first attempt loaded and saved every frame and hung the
  game on boot: `startGame()` sets `mode`, `roomId` and `screen` from outside
  any frame, so the next frame overwrote a booted world with a record still
  holding `screen: null`. Between frames the variables now stay with whoever
  last held them, so the many out-of-frame writers — picking a save file,
  walking into a cave, a room load resolving late — keep working untouched.
  `focus.adopt()` covers startup, where the world exists before anyone owns it.

  What remains for real divergence: split the frame into a per-player part and
  a shared part (enemies, streaming, rendering). The async continuations now
  capture `focus.current` and `resumeAs(me)` after each play-time `await`
  (`loadOverworldScreen`, `loadDungeonRoom`, `enterLevel`, `leaveCave`, the
  scroll begin/finish pair), so a room load that yields cannot finish as the
  wrong hero.
- [x] Split the inventory into the part that is shared and the part that is not.
  Shared: items owned, quest flags, rupees, keys, bombs, sword tier, world
  flags (`owSecretsRevealed`, `caveTaken`, `owItemsTaken`, `hintMarks`,
  `toldStory`, dungeon progress, `clock`). Per-player: `selectedB`, `halfHearts`,
  `maxHalfHearts`, `invuln`, `shoveDir`, `shovePixels`, `dead`, `paralyzed`,
  `swordBlocked`, `swordBlockedTimer`, `itemLiftTimer`. `clock` is shared because
  it freezes enemies and the enemies are global.

  Done as `createInventoryView(shared, status)` in `tools/shared/player.js`
  rather than as a signature change: the view is an inventory-shaped object
  whose eleven per-player keys read and write a `status` of its own and whose
  other twenty-eight route to one shared bag. `main.js` now builds `sharedInv`
  and hands player one a view of it, so four views give four heroes with their
  own hearts, knockback and B slot spending from one purse.

  The alternative was threading two objects through every function that touches
  the inventory. Thirteen functions in `inventory.js` read per-player fields and
  six of them read shared fields in the same breath — `harmLink()` wants
  `halfHearts` and `ring` together, `grantRoomItem()` wants nineteen shared keys
  and three private ones — so the split would have churned ~200 call sites and
  their tests to buy nothing the view does not already give. The division stays
  explicit in `PER_PLAYER_INVENTORY_KEYS`, which is also what the view is built
  from. The keys are the complete surface: every `inv.*` reference in the
  codebase resolves to one of `createInventory()`'s 39 fields.

  Saving still writes one hero. `snapshotInventory()` picks keys off the view,
  so a save records the shared bag plus *player one's* hearts and B slot. What a
  four-player save should hold is a question for the save item below.
- [x] `rebaseEntities()` shifts every hero, not just the one who crossed.
  Whoever walks out of the anchor room still fires the rebase (the world
  has one `roomId`), and the others move with it so they keep their place.
  Cameras already convert through `localToWorld` via `solvePlayCamera`, so
  a hero left behind in the previous room is still looked at correctly.
  What remains is choosing the anchor from the session rather than from
  whoever happened to cross — today the first player to hit a seam owns it.
- [x] The golden hashes from the previous section are unchanged at the end of
  this one. `players.length === 1` behaves exactly as one Link did.

### Controllers, joining and leaving

- [x] Extend the options screen with a controller setup for players 1–4: assign a
  device (keyboard set A, keyboard set B, or a specific gamepad index) to each
  slot, and rebind every button per slot. `options.js` now persists `playerBinds`
  and `padSlots` beside the original `binds` alias for player one, so an older
  settings file still remaps seat 0. The options panel picks a seat, claims a
  pad (or none), and rebinds that seat's keys.
- [x] Two independent keyboard bind sets, so two players can share one keyboard
  and multiplayer is playable — and testable — with no gamepads attached.
  Player one keeps the existing `DEFAULT_BINDS` (arrows and WASD). Player two
  is IJKL / F / G / H / Y (`DEFAULT_BINDS_P2`). No key appears in both sets.
  Players three and four have numpad / leftover-punctuation defaults so
  four can sit at one keyboard. Pad assignment is on the options screen.
- [x] `createInput()` is one source per slot. Unused seats are still polled,
  but only for the join chord. `setPadIndex` retargets pads when the party
  grows or shrinks: alone, every pad drives player one; in company each
  seat claims its own.
- [x] Pressing Start on a configured-but-inactive controller joins that player
  (Start on an *active* controller opens the shared menu, so the two can't
  collide). A joining player spawns at the position and world of the lowest-
  numbered active player, with a full glass at that host's `maxHalfHearts`.
  An unused 2×2 cell shows "PRESS START TO JOIN".

  The first playable hole: player one's leftover-pads claim (`null`) also
  ate every other controller's Start, so a spare pad opened the inventory
  instead of sitting someone down, and at one or two players there was no
  on-screen hint (empty quadrants only exist in the 2×2). Spare pads now
  join (`joiningPads` / `seatForJoiningPad`); in company player one keeps
  only the host pad so they do not walk with player two; the help line and
  a `#joinHint` name the next seat's Start key (H for player two). The same
  Start edge is consumed so it cannot also open the submenu — that froze
  the party the moment player two sat down.
- [x] Pressing Start + Select together leaves the game. The last remaining
  player cannot leave this way. Their quadrant goes away and the canvas
  shrinks.
- [x] Joining works at one player too: H (player two's Start) on a solo
  session splits the screen to 512×544. Dropping back to one player puts
  the ROM frame back on the stage.

### Split screen

- [x] Make `INTERNAL_W` / `INTERNAL_H` depend on the player count instead of
  being constants. One player is 256×240. Two or more is the 2×2 frame
  (512×544) with join prompts in empty cells. Solo still never pays for the
  larger canvas. `tools/shared/splitLayout.js` is the arithmetic.
- [x] Lay the multiplayer frame out as a 2×2 grid of 256×240 quadrants filling
  y 0–480, with a 512×64 shared status bar beneath at y 480–544. Each quadrant
  keeps the ROM's own split: a 64px bar on top, a 256×176 playfield below. The
  playfield is the same size a solo player gets, so nobody sees more or less
  world than they do today. Two players use that same grid (two join prompts)
  rather than a 2-up special case.
- [x] The per-player bar carries that player's number, hearts and A/B item
  boxes — today's HUD with the minimap and counters removed (`compact`). The
  shared bar carries what is read once rather than four times: minimap, rupees,
  keys and bombs. Its full 512px width is what makes room for a four-digit
  rupee counter (`formatPartyCount`).
- [x] Rehome everything else authored against the 256×240 frame — title, name
  entry, attract/demo, inventory submenu, death and continue UI, ending and
  credits. At one player every one of them is pixel-identical to today.
  Title / attract / name entry run before anyone has joined, on the ROM
  frame. The submenu lives in `frame` but is shown only in the opener's
  quadrant. Death and the ending drop to one 256×240 picture
  (`presentCinematic`).
- [x] Give each player its own camera, drawn through `presentViews()`. At one
  player that is still `applyPlayCamera()` on the live stage. At two the same
  `frame` is rendered into a texture per player after that player's camera
  is applied. Streaming (`roomsForCameras`) and culling
  (`rectFullyOffEveryCamera`) answer to every camera, not one.

  Still one playfield: two pictures of the same place are the same scene
  graph from two offsets. A stream view *each* is per occupied *world*,
  below, so L1 and L4 no longer share a room store.
- [x] A stream view, enemy sprite map and Pixi container per occupied world,
  so two labyrinths (or a leftover cell and a cellar) do not paint over
  each other. Same-place split-screen still shares one stream — four
  copies of `$73` would be four times the tiles for the same picture.
  Caves already had one Pixi scene per cave world. `presentViews` hides
  every other world's stream layer before capturing a quadrant.
- [x] An unused quadrant is black with the player number and "PRESS START TO
  JOIN". Company always opens the 2×2, so two players leave two prompts.
- [x] Dropping back to one player returns to the single full-size view.
- [x] Every other player's Link visible in your quadrant is drawn with their
  player number floating above their head. Your own Link is unmarked. The
  tags live on the shared hero layer and are shown or hidden per render,
  so each picture marks everyone but its owner.

### One world, four places in it

- [x] Room streaming, enemy spawning and culling become "visible to *any*
  camera". `roomsForCameras`, `rectFullyOffEveryCamera` and the `cameras:`
  list on cull / spawn / latch already do this.
- [x] Enemies, bosses and wanderers target the nearest living player rather than
  `link`. Applies to `enemies.js`, `bossAi.js`, `wandererAi.js` and the
  projectile aim.
  - [x] `tools/shared/targeting.js` owns the choice, and `stepCombat()` asks it
    once per foe instead of computing one `chase` for the whole room. Nearest
    is Manhattan, ties break to the lowest player number so an equidistant foe
    does not jitter between two of them, and bait still outranks every hero.
    At one player the answer is unchanged.
  - [x] Feed it the living, via `targetableLinks()`. If nobody is standing
    (solo mid-raft death) it falls back to every active hero so that frame
    still has a target and the goldens do not change.
  - [x] `bossAi.js` and `wandererAi.js` already take `opts.chase`. `stepCombat()`
    hands each foe the `enemyTarget()` pick, so a Gleeok head and a Goriya
    chase the nearest living hero the same way an Octorok does.
- [x] Any player can damage any enemy and the damage accumulates on that enemy.
  Players do not collide with each other, cannot damage each other, and their
  swords, bombs, arrows and flames pass through each other harmlessly — combat
  only ever asks the enemy list. Your own bomb still hurts you
  (`bombHurtsHero`); an ally standing on it does not. Enemy health is not
  scaled up to compensate for four swords — four players make the game easier,
  and that is the point.
- [x] Item pickups are shared: a Triforce shard, a dungeon item or a rupee
  taken by anyone is taken by everyone (one bag). A heart refill heals only
  the player who touched it; a heart container raises the max for all
  players and fills the finder (`shareHeartContainer`).
- [x] Consumable caps scale with the active player count: 255 rupees and the
  bomb bag each become ×N (`applyPartyCaps`). In company the HUD is compact
  and the shared strip prints four glyphs. Bomb-bag upgrades grow `bombBag`
  and re-multiply. Leaving does not confiscate the pile: the rupee ceiling
  ratchets down as rupees are spent (`ratchetRupeeCap`) until it meets the
  new party floor; bombs keep the excess and stop adding more.
- [x] Dungeon room state stays global while players occupy different rooms of the
  same dungeon: a shutter opens for the room that was cleared, key doors consume
  from the shared key count, and pushed blocks stay pushed. A room counts as
  cleared when no living enemy has that `homeRoomId` (`enemiesInRoom` before
  `roomAllDead`), regardless of who killed them or who is standing there.
- [x] Players may be in different modes at once — overworld, a cave and a
  labyrinth. Stairs, cave mouths and warps move only the player who took
  them. `bringPartyAlong` is gone; `clearEnemies` and stream teardown only
  run when the last occupant leaves. Joining a world someone already
  occupies shares that place rather than rebuilding it: a dungeon descent
  stands at the mouth, a cave at the doorstep, not on the occupant. Each
  occupied world has its own stream and sprite maps; `presentViews` shows
  that world's layers in that player's quadrant.

  This is the expensive one, and it is what the rest of the phase now hangs
  off, so the shape is worth stating. Three things are being confused with each
  other today, and they have different lifetimes:

  - **The session**: one of everything the party owns — the bag, quest flags,
    save slots, audio, the shared menus.
  - **A world**: one loaded place and everything alive in it — `enemies`,
    `projectiles`, `drops`, `bombs`, `flames`, `boomerangs`, `bait`, the
    whirlwind, the ladder, `spawnedRooms` / `spawnClaims`, its room store,
    its stream view and sprite maps, and its dungeon state. Roughly 400
    reference lines in `main.js`. The overworld is one world; each labyrinth
    level is one; each cave is one. Several are live at once when players
    split up.
  - **A view**: one player's window onto the world they are in — its own Pixi
    containers, its own `streamView`, its own sprite maps and its own camera.
    Two players in the same world but different rooms still need two views,
    because a container tree can only be at one offset at a time.

  Players in different *rooms* of one world is nearly free — the continuous
  streaming model already keeps many rooms alive at once, enemies carry a
  `homeRoomId`, and culling and spawning became multi-camera aware earlier in
  this phase. Players in different *worlds* is what needs the split above,
  because `clearEnemies()` currently wipes the entity arrays on every world
  change: they belong to "the world loaded right now", singular.

  **A world lives while at least one player is in it, and is discarded when the
  last one leaves.** That rule is what keeps single-player behaviour exactly as
  it is: walking into a labyrinth leaves nobody in the overworld, so the
  overworld is discarded and coming back out respawns it, which is what the
  ROM does. It also says what should happen when two players are out there and
  one ducks into a cave: the overworld keeps running because someone is still
  standing in it.

  The per-world state does not need its ~400 references rewritten either. The
  same swap that carries world context can carry the entity arrays: the
  variables stay, and the focus loads them from a world record when it moves
  between worlds. The frame then runs one shared step per *occupied world*
  rather than per player — every player's first half, one world step, every
  player's second half — so four players in one room do not step the enemies
  four times.

  - [x] `tools/shared/worldRegistry.js` holds the world record and the registry
    that keys them by id, hands two players entering one labyrinth the same
    world, and prunes the ones nobody is standing in. `WORLD_STATE_KEYS` is the
    swap contract — a field missing from it is a field that would leak from one
    place into another. Named for the registry because `world.js` is already
    the overworld's fixed geometry.
  - [x] Swap the ~400 lines of entity state through the focus. `main.js` builds
    the registry, enters the overworld and hands player one that world;
    `loadWorldContext()` / `saveWorldContext()` now carry the entity arrays,
    the spawn sets, the room's blocks and tiles and the `mode` / `dungeon` that
    say which place it is, alongside the player's own `roomId`, `screen` and
    `caveReturn`.

    Verifying it needed a new trick, because at one player the focus never
    moves and the swap is dead code that no golden can distinguish from an
    empty one. `zeldaDebug.visitScratchWorld()` forces the move — out to an
    empty world and straight back — and a browser golden runs `walkAndFight`
    with a round trip in the middle and expects the unchanged hash. Deleting a
    line from the save side fails it, as it should.

    It only covers the save side. A field missing from the *load* leaves the
    live value in place, so a round trip looks identical either way; that half
    is not observable until two players exist. `WORLD_STATE_KEYS` is the
    written contract in the meantime.
  - [x] Route the transitions through the registry. `movePlayerToWorld()` saves
    the place being left, wipes the live copy, enters the new world and prunes
    whatever nobody is standing in; `enterLevel`, `openCave`, `leaveCave` and
    `loadOverworldScreen` all go through it, and it is a no-op when the target
    is the world you are already in (one overworld screen to another).

    At one player the prune always fires, which is exactly why this reproduces
    `clearEnemies()`: the overworld dies behind you and is rebuilt with its
    foes respawned on the way back, the way the ROM does it. `clearEnemies()`
    still runs inside the move, because the sprite teardown belongs to the
    view, which is about to show somewhere else.

    Two browser goldens now cover the transitions at all — every earlier
    scenario was overworld-only, so nothing would have noticed this change.
    `enterDungeon` and `dungeonAndBack` pin the hashes, and a third test reads
    `zeldaDebug.worlds()` to assert the overworld is genuinely gone while Link
    is underground rather than merely unused.
  - [x] Make the world's shared work run once per world per frame rather than
    once per player, so four players in a room do not step its foes four
    times. Done as a guard inside `cullStreamEnemies()` and `stepCombat()`
    rather than by hoisting them out of the per-mode step, because the
    sequence they sit in is load-bearing and alternates: cull, then *this*
    player's seam cross, then spawn, then their raft check, then combat, then
    their cross again. Hoisting would reorder a single player's frame against
    itself; the guard leaves it exactly as it is and lets whoever arrives
    first do the shared part. Keyed on a new non-wrapping `simTick`, since the
    NES's own `frameCounter` rolls over every 256 frames and would answer
    "already done this frame" wrongly once per rollover.
  - [x] Swap the hero too. `link`, `sword`, `inv` and `cam` became `let` and
    joined the focus, so a frame can be run as somebody else without touching
    the ~440 references that read them. Safe because nothing captures the link
    object at construction — every UI module is built before it exists — and
    the objects are only ever mutated, never reassigned.

    `visitScratchWorld()` now hands the scratch player a hero of its own at a
    known position and reads `link.x` *from inside* the visit, so the test
    checks the frame really ran as the other hero rather than only that
    everything was restored afterwards.
  - [x] Give the room to the world, not to the hero. `roomId`, `screen` and
    `caveReturn` moved off the player record and onto the world, because the
    streaming model has one anchor: positions are anchor-local and the rooms
    around it are streamed in, so everyone looking through one camera is in
    one room by definition. They move back onto the player when views come
    apart. This also stopped a leak — the overworld's `screen` used to follow
    Link into a labyrinth and sit there stale — which shifted both labyrinth
    goldens. `enterLevel` now reads the stairs it came in by *before* the
    move, and `openCave` records the doorstep *after* it, since each of those
    facts belongs to the other side of the transition.
  - [x] A second player: `?players=2`. They get their own hero, sword, camera
    and view of the bag, their own sprites in shared blade/body layers, and
    their own device — IJKL, F and G on the keyboard, and one pad slot each
    instead of every pad driving everyone. A frame now steps each hero in turn
    inside `focus.on()`, then hands the focus back to player one for the
    camera, the status bar and the debug readout.

    Player one still speaks for the group: one submenu, one dialogue box, one
    camera. Everyone swings their own sword and uses their own B item.

    The party no longer travels together. Each player has a view, so a
    hero who does not take the stairs keeps their world and their camera.
    `movePlayerToWorld()` tears the abandoned place down only when it is
    empty, which is how solo still matches the ROM.

    The second playtest found the guard above was too coarse. `stepCombat()`
    is two things wearing one coat: stepping the foes and flying the arrows
    belong to the place, but the swing, what hits you, your shove and your
    invulnerability belong to the hero — and the whole function sat behind
    "first in this world this frame". Only the first hero each frame advanced
    their swing, so player two swung once and froze, since a hero holding a
    sword out cannot walk. They also could not be hit, shoved, or pick
    anything up.

    Fixed with a `shared` flag rather than by splitting the function in two,
    because the order inside it is load-bearing — a swing resolves before the
    foes move, contact after — and gathering it into two passes would reorder
    a single player's frame against itself. One player's frame is byte for
    byte what it was; the goldens say so. `stepDrops()` took the same flag: it
    ages the drops once and lets either hero pick them up.

    Boomerangs are per hero (`boomerangs[]`): each thrower guards only their
    own slot, and a Goriya boom tests every living hero in that world.
    Statues aim at the nearest living hero. A Wallmaster will not start a
    second grab on someone already held. Hostile tools that still share a
    world slot (bombs, bait, the candle flame cap) are the ones the ROM
    also shared.
    An open box no longer freezes everyone: a private conversation holds
    only its reader, and the submenu holds only its owner. Death is per-hero;
    see Shared menus.
  - [x] A view each, drawn from the same playfield. At two or more players the
    canvas is 512×544 — a 2×2 of ROM frames with join prompts in empty cells.
    The 256×240 `frame` (world + status bar) comes off the stage and is
    rendered once per player into a texture, with that player's camera and
    that player's hearts, then the textures sit in their quadrants. One
    player never builds a texture; the goldens stay on the same pixels.

    Streaming and culling now ask every camera, so a foe on player two's
    half of the world is not dropped because player one walked away, and
    rooms either of them can see stay loaded. `rebaseEntities()` shifts
    every hero, not just the one who crossed the seam, so when the anchor
    moves the others keep their place in the world.

    Still one playfield and one stream view: the two pictures are the same
    scene from two cameras, which is enough to walk apart and each see
    where they are. Per-player sprite maps, the 2×2 frame, the shared
    status bar and player numbers over the other Links are the rest of
    this item.
  - [x] Per-world Pixi: each occupied place has its own `roomStore`,
    `streamView` and enemy/projectile/drop sprite maps. Two cameras on the
    same overworld still share one stream (that is one picture). L1 `$73`
    and L4 `$73` no longer collide. The 512×544 layout and the join
    prompts are in. Door-frame overlays are still one shared stream.

### Shared menus, private conversations

- [x] The inventory submenu shows the shared bag, and any player may open it.
  Opening it freezes only the owner; the others keep walking. Whoever opened
  it drives it (Start to close, B to cycle their own slot). Only that player's
  quadrant shows the panel; the others keep a normal play picture. Opening it
  while someone else is reading is still blocked for the reader — their
  buttons belong to the box — and allowed for everyone else. Solo still
  freezes the world, so the goldens do not move.
- [x] Dialogue is per-player and shown only in that player's quadrant. A text
  box freezes only its own reader; the others keep walking. `toldStory` stays
  shared. Private kinds (`debug`, `item`, `person`, `cave`) hide the box in
  every view but the reader's; `levelEntry` and `briefing` still hold the
  whole party and draw in every quadrant, which is the next item.
- [x] Post-dungeon briefings and labyrinth-entry beats are the exception: they
  are the story, so they open in every active player's quadrant at once and each
  player pages their own copy (`storyPager`). The world stays frozen until
  the last reader closes their copy. Ordinary NPC and item dialogue stays
  private. Solo still uses the one shared box, so the goldens do not move.
- [x] A player at zero hearts dies alone. A shared potion is drunk for them
  first (`tryAutoRevive`). If someone else is standing they spin in their
  quadrant (~80 frames, the ROM's death spin, no fade / GAME OVER) and then
  regroup beside that ally with three hearts, following them into a cave or
  labyrinth if that is where they are. The continue/save/retry menu only
  appears when *all* active players are dead. At one player with no potion
  that is the ROM's own flow (`deathUi`).
- [x] Music follows the lowest-numbered living player's mode
  (`syncSessionMusic`). Sound effects already play from whichever hero's
  frame caused them.
- [x] The ending plays once, triggered by whoever completes it, on the full
  screen for everybody. Split-screen folds back to the 256×240 frame
  (`presentCinematic`); anyone's Start pages the credits. The continue menu
  does the same. After either one, `adoptSessionLayout` puts the party view
  back.

### Save and test

- [x] Extend the save format to hold per-player hearts and positions with a
  version bump (`SAVE_VERSION` 2). Version 1 files still load. A multiplayer
  save loaded with fewer controllers starts the players that have controllers
  (`applyPartySnapshot` writes onto seated seats only); a single-player save
  joined by a second controller works from the join path. Player one's pose
  still comes from `position`, so a zero-heart continue is not undone by the
  party snapshot.
- [x] Extend the golden harness from one mask per frame to N (`heroes`,
  `masks`, `holdEach`). Solo scripts are unchanged and still assert the
  committed hashes. Join, leave, cap scaling and shared pickups stay on the
  browser harness, which can reach `main.js`.

## Done when

All of the above are implemented, `npm test` is green, a solo playthrough is
indistinguishable from today, and a 4-player session has been driven in the
browser — including joining mid-dungeon, leaving mid-dungeon, four players in
four different modes at once, and a death with the others still alive.

## What was added

- `tools/shared/coopDeath.js` — who is living, when the continue menu opens,
  auto-potion, and regrouping on an ally.
- `tools/shared/coopRoster.js` — host, join seat, leave rule, and the hearts
  a joiner sits down with.
- `tools/shared/coopEconomy.js` — rupee/bomb caps ×N, and sharing a heart
  container across the party.
- `tools/shared/coopCombat.js` — a bomb hurts its owner and no one else.
- `tools/shared/partySave.js` — per-hero hearts and poses on a v2 save.
- `tools/shared/sharedBar.js` — 512×64 strip and a four-digit rupee field.
- `presentCinematic()` — ending and continue drop to one 256×240 picture.
- `tools/shared/storyPager.js` — each player pages their own copy of a
  briefing or labyrinth-entry beat.
- Runtime join/leave in `main.js` (`KeyH` sits player two down from a solo
  session; a spare controller's Start does the same; `KeyH`+`KeyY` stands
  them up). The canvas grows and shrinks. A `#joinHint` names the next seat.
- Transitions move only the player who took them. A world is discarded only
  when the last occupant leaves.

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
| Party counter, 4 glyphs | `tools/shared/sharedBar.js` |
| `SAVE_VERSION` = 2 (v1 still loads), `PERSISTED_INV_KEYS` | `tools/shared/save.js` |
| Single camera offset on `playField` | `applyPlayCamera()` in `main.js` |
| One-camera cull and spawn latch | `tools/shared/roomStream.js` (done — takes `cameras`) |
| Enemy target selection | `tools/shared/targeting.js` (done — takes a target list) |
| Anchor-relative entity coordinates | `rebaseEntities()` in `main.js` |

### Two holes in determinism, both closed

The same walk used to hash differently from one run to the next. Two separate
causes, neither of them where the symptom pointed (the first guess — that
rooms consumed one shared spawn RNG in load-completion order — was wrong):

- **`Math.random` in the sim.** `tryEdgeSpawn()` in `tools/shared/spawn.js`
  defaults its RNG to `Math.random`, and `main.js` called it without one, so
  the edge cell a streamed room's foes walked in from was genuinely random.
  Everything else already drew from the seeded `dropRng`; this was the only
  hole in it. Fixed by passing `pickRng`, an index-picker over that stream.
- **Room loads landing on different frames.** A room's tiles arrive over
  `fetch`, so which frame it appears on follows I/O timing. Fixed on the
  harness side rather than the game's: `main.js` counts in-flight loads and
  exposes `zeldaDebug.pendingLoads()`, and the driver drains it to zero at
  each frame boundary, so streaming lands on a frame the simulation chose
  rather than one the disk did.

With both closed, a walk clean across the seam into `$78` is reproducible and
is now a committed golden (`crossSeam`). The off-camera foes in the probe
digest are still hashed by identity rather than position — cheap insurance,
and their position genuinely does not matter until they are on screen.

`rollMoneyGameAmounts()` still uses `Math.random`, which is correct for a game
of chance but means a gambling cave cannot be a golden scenario without being
handed a seed.

### A green harness that was testing nothing

Building the second player turned up a hole in the browser harness worth
recording, because it is the failure mode a golden hash is worst at showing.

`press()` held a key, stepped the frames, and released it — with no frame
stepped while the key was up. The game edge-detects its buttons by comparing
each frame to the last, so the release was never observed, the button stayed
"held" forever, and **every press after the first in a page did nothing**. The
`swing` scenario swung once, not twice. `inventory` opened the submenu and
never closed it. Both labyrinth scenarios walked into the entry speech, which
freezes the world, and then hashed forty frames of a still image — perfectly
stable, perfectly green, and evidence of nothing.

`press()` now steps one frame with the key up, which is also what a person
does. Every scenario hash moved as a result; `stand`, the only one with no
presses, did not, which is the check that the change is what it claims.

Three tests now stand between us and a repeat: the submenu must be shut again
by its second press, the labyrinth must be walkable once the old man has had
his say (`dismissDialogue()` mashes A through it), and the two-player test
asserts each hero moves only for its own keys. Assertions about what the game
*did* are the thing a hash cannot replace: a frozen game is the most
reproducible game there is.

### Harness coverage

`goldenSession.js` builds a scripted session; `playSim.js` is the one-frame
step it drives. Together they cover the shared layer, which is where ~900 of
the ~1300 hero references live. They cannot reach the other ~440: mode
transitions, room loading and streaming, drops, projectiles, bombs, dialogue
and every UI beat are inside the Pixi closure in `main.js`. The browser
harness covers that side. The frame order in `playSim.js` mirrors
`stepOverworld()` + `stepCombat()` for the subset it does cover — when that
order changes in `main.js` it has to change here, or the goldens start
pinning the harness instead of the game.

That gap is now covered from the other side. `tools/browser/` drives the real
`main.js` in headless Chromium via `window.zeldaDebug`, so the two harnesses
between them see the whole hero surface: Node for the shared functions, fast
and dependency-free; the browser for the orchestration, slower and behind
`npm run test:browser`. `playSim.js` is the Node-side extract; a full
`stepCombat` lift out of `main.js` would collapse the two into one suite
and is not required to keep the goldens green.

The browser harness is scoped by one thing worth remembering: a scenario is
scripted as key presses against the real title-less boot, so anything deep in
the game — a labyrinth, a late item — needs either a save slot to start from or
`zeldaDebug.enterLevel` / `goOw` to jump there.

### The single anchor

Every positioned thing in the world — Link, enemies, projectiles, drops, bombs,
flames, the push block, the ladder, the raft — is stored in coordinates
relative to the *current anchor room*, and `rebaseEntities()` translates the
whole world by ±`PLAY_W` / ±`PLAY_H` whenever Link crosses a seam so those
numbers stay near the origin.

This survives four players, but only because the rebase is a uniform
translation: relative geometry is preserved, no AI masks a position to a byte,
and the widest spread on the map (4096×1408) is nowhere near a precision
concern. What does not survive is *whose* cross triggers it. The anchor has to
become session state, rebased once per frame at most and shifting all four
Links with everything else, and each camera has to reach its player's room
through `localToWorld` / `worldToLocal` instead of assuming the anchor is its
own room. `cullOffscreenEnemies()` keeps taking anchor-local sprite
coordinates for that reason — only its home-room test could be widened to all
cameras, because only that test already speaks world space.

The alternative — dropping the rebase and fixing the world origin at room
$00 — is tempting and would delete `rebaseEntities()` outright, but it changes
every coordinate the golden hashes are recorded against, so it is not free and
should not be bundled with the plural-hero move.

### Display scale

512×544 is taller than half of 1080, so an integer fit is 1× on a 1080p
screen where today's 256×240 gets 4×. Auto therefore integer-scales the ROM
frame and uses a fractional CSS fit (`fitScale`, still `image-rendering:
pixelated`) once the buffer is larger than 256×240. Fixed 1–6× in the
options still ignore the window. See `tools/shared/displayScale.js`.

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
| 2026-08-14 | The sim is lifted out of the Pixi closure before the hero is pluralised, and golden hashes are recorded first | The 979 tests cover `tools/shared/` well and `main.js` not at all, which is where ~440 of the references and the whole mode machine live. Without a harness, "behaves identically" is a hope. Four cameras over one sim needs the split anyway, so this is the goal's road, not a detour |
| 2026-08-13 | Death respawns you beside the lowest-numbered living player, not where you died | Co-op that scatters you further apart every time you die punishes the thing it should reward; regrouping is the forgiving read |
| 2026-08-13 | Two keyboard bind sets | Otherwise nobody without two gamepads can play — or test — anything in this phase |
| 2026-08-13 | The life potion is auto-drunk from the shared bag on any player's death | It is the ROM's behaviour, and a shared bag means a shared safety net |
| 2026-08-13 | `clock` is shared, not per-player | It freezes enemies, and the enemies are global; a per-player clock has nothing to act on |
| 2026-08-13 | Briefings play to everyone, ordinary dialogue to one | Phase 22 made the briefing the spine of the story; three players missing the plot because someone else grabbed the shard is not a trade worth making |
| 2026-08-19 | Links are numbered, not recoloured | `recolor.js` would make four Links readable at a glance, but it is a departure from the ROM palette; the player-number tags are enough |
| 2026-08-19 | Company always uses the 2×2 (512×544), including two players | A 2-up strip made two players a different game than three; empty cells as join prompts are the clearer read |
| 2026-08-19 | A leaving player's rupee share ratchets down as rupees are spent | Dropping the ceiling to 255 under a 400-rupee pile would look like a confiscation; `rupeeCap = max(partyFloor, held)` until spending walks it down |
| 2026-08-19 | The raft is physical state on one Link | An ally on the pier must keep walking; a dock object that freezes the world is the cheap version |
| 2026-08-19 | Attract / demo stay single-player on the ROM frame | They run before anyone has joined; joining is gated on `playing` |

## Open questions

Answered 2026-08-19 and moved into Decisions:

- Recolour each Link? No — numbers are enough.
- 2-up split vs constant 2×2? The 2×2, with join prompts in empty cells.
- Purse cap on leave? Ratchet down as rupees are spent.
- Raft vs an ally on the dock? The ride only moves the boarded hero.
- Attract / demo? Stay single-player on the full screen before anyone joins.