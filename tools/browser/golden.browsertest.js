/**
 * Golden traces for the real game, driven in a headless browser.
 *
 * Run with `npm run test:browser`. Deliberately not part of `npm test`: it
 * needs a Chromium download and takes tens of seconds, where the Node suite
 * is two seconds and needs nothing.
 *
 * These cover what `tools/shared/goldenSession.js` cannot reach — the mode
 * machine, room streaming, the HUD and submenu, and the ~440 hero references
 * that live inside the Pixi closure in `main.js`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import {
  KEYS,
  hero,
  ignoreHits,
  isMonotonic,
  netDelta,
  pose,
  sawWalkCycle,
  waitUntilAlive,
  tailIsConstant,
  traceHold,
  walkUntilStopped,
} from './movementHarness.js';

/**
 * Scripted sessions. Every one of these must be reproducible: see the
 * stability test at the bottom, and the note on spawn placement below.
 */
const SCENARIOS = Object.freeze({
  /** Boot and stand still — pins the opening frame and the idle world. */
  stand: async (g) => {
    await g.step(60);
  },

  /** Two sword swings on the spot. */
  swing: async (g) => {
    await g.step(5);
    await g.press(['KeyZ'], 20);
    await g.press(['KeyZ'], 20);
  },

  /** Open the submenu and close it: the world freezes and comes back. */
  inventory: async (g) => {
    await g.step(5);
    await g.press(['Enter'], 40);
    await g.press(['Enter'], 40);
  },

  /** Walk into the foes below the start screen and swing at them. */
  walkAndFight: async (g) => {
    await g.press(['ArrowDown'], 40);
    await g.press(['KeyZ'], 15);
    await g.press(['ArrowLeft'], 40);
  },

  /** East toward the seam, close enough to stream and spawn the next room. */
  walkEast: async (g) => {
    await g.press(['ArrowRight'], 90);
  },

  /** All the way across the seam into `$78`, then a swing on the far side. */
  crossSeam: async (g) => {
    await g.press(['ArrowRight'], 200);
    await g.press(['KeyZ'], 20);
  },

  /** North into the next screen's worth of world, then a swing. */
  wanderNorth: async (g) => {
    await g.press(['ArrowUp'], 50);
    await g.press(['ArrowRight'], 20);
    await g.press(['KeyZ'], 15);
  },

  /** A longer scrap: five swings with steps between them. */
  longFight: async (g) => {
    await g.press(['ArrowDown'], 30);
    for (let i = 0; i < 5; i += 1) {
      await g.press(['KeyZ'], 12);
      await g.press(['ArrowLeft'], 10);
    }
  },

  /**
   * Into the first labyrinth and a swing inside it.
   *
   * Every other scenario is on the overworld, so nothing above notices a
   * change to the transition between one place and the next — which is
   * exactly what the world registry is rebuilding.
   */
  enterDungeon: async (g) => {
    await g.step(10);
    await g.enterLevel(1);
    await g.dismissDialogue();
    await g.press(['ArrowUp'], 30);
    await g.press(['KeyZ'], 15);
  },

  /** In and back out again: the overworld has to be rebuilt behind you. */
  dungeonAndBack: async (g) => {
    await g.step(10);
    const home = (await g.probe()).roomId;
    await g.enterLevel(1);
    await g.dismissDialogue();
    await g.press(['ArrowUp'], 20);
    await g.returnToOverworld(home);
    await g.step(30);
    await g.press(['ArrowDown'], 20);
  },
});

/**
 * The contract: a rolling hash of every frame of each scenario.
 *
 * A diff is a behaviour change in `main.js` or anything it drives. Regenerate
 * only when the change was intended, and say so in the commit.
 */
const GOLDENS = Object.freeze({
  stand: 'F2D26EE4',
  swing: 'B4607BBF',
  inventory: 'E1D3871C',
  walkEast: '7D244C3C',
  crossSeam: '0F4D0352',
  walkAndFight: '7A8283A3',
  wanderNorth: '80085248',
  longFight: 'D549FCD8',
  enterDungeon: '7B347916',
  dungeonAndBack: 'B04135B4',
});

describe('browser goldens', { concurrency: false }, () => {
  /** @type {{ url: string, close: () => Promise<void> }} */
  let server;
  /** @type {import('playwright').Browser} */
  let browser;

  before(async () => {
    server = await startGameServer();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  /**
   * Play one scenario in a fresh page and return the driver.
   * @param {keyof typeof SCENARIOS} name
   */
  async function play(name) {
    const game = await openGame(browser, { url: server.url });
    await SCENARIOS[name](game);
    const result = {
      trace: game.trace,
      violations: [...game.violations],
      pageErrors: [...game.pageErrors],
      probe: await game.probe(),
    };
    await game.close();
    return result;
  }

  for (const name of Object.keys(SCENARIOS)) {
    test(name, async () => {
      const run = await play(/** @type {keyof typeof SCENARIOS} */ (name));
      assert.deepEqual(run.pageErrors, [], 'the page threw');
      assert.deepEqual(run.violations, [], 'a streaming invariant broke');
      assert.equal(run.trace, GOLDENS[name]);
    });
  }

  test('the game boots into a sane world', async () => {
    const game = await openGame(browser, { url: server.url });
    const probe = await game.probe();
    assert.equal(probe.frame, 0, 'paused means no frame has run yet');
    assert.equal(probe.mode, 'overworld');
    assert.equal(probe.screenRoomId, probe.roomId, 'screen tracks the room');
    await game.close();
  });

  test('two players, two heroes, two sets of keys', async () => {
    // The point of the whole plural-hero refactor, in one test: the arrows
    // move one Link and IJKL moves the other, and neither drags the other
    // along. `?players=2` is what asks for the second one.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    const heroes = async () => (await game.state()).heroes;
    await game.step(5);

    const start = await heroes();
    assert.equal(start.length, 2, 'the party is two');
    assert.equal((await game.state()).dialogue, false, 'nobody is talking at boot');
    assert.notEqual(start[1].x, start[0].x, 'they stand apart');

    await game.press(['ArrowDown'], 20);
    // Link finishes the tile he is on after the key is let go, so settle
    // before reading, or the glide looks like the other hero moving him.
    await game.step(20);
    const p1Walked = await heroes();
    assert.notEqual(p1Walked[0].y, start[0].y, 'player one walked');
    assert.deepEqual(p1Walked[1], start[1], 'player two stayed put');
    assert.notEqual(
      p1Walked[0].camLocalY,
      p1Walked[1].camLocalY,
      'player one\'s camera followed them; player two\'s did not',
    );

    await game.press(['KeyK'], 20);
    await game.step(20);
    const p2Walked = await heroes();
    assert.deepEqual(p2Walked[0], p1Walked[0], 'player one stayed put');
    assert.notEqual(p2Walked[1].y, p1Walked[1].y, 'player two walked');

    const size = await game.page.evaluate(() => ({
      w: document.querySelector('canvas')?.width ?? 0,
      h: document.querySelector('canvas')?.height ?? 0,
    }));
    // 512×544 NES pixels, times the renderer resolution (the art scale).
    assert.ok(size.w >= 512, `the canvas grew for two columns, got ${size.w}`);
    assert.ok(size.h >= 544, `two players open the 2×2, got ${size.h}`);
    const layout = await game.state();
    assert.equal(layout.sharedBar, true, 'the purse lives on the strip');
    assert.equal(layout.compactHud, true);
    assert.equal(layout.hud?.map, true, 'each quadrant still has a minimap');
    assert.equal(layout.hud?.counters, true, 'each quadrant still has rupee/key/bomb counts');
    assert.equal(layout.canvasH, 544);
    assert.equal(layout.joinPrompts, 2, 'empty cells are join prompts');
    const caps = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(caps.rupeeCap, 510);
    assert.equal(caps.maxBombs, 16);

    await game.close();
  });

  test('each player swings their own sword', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    const swinging = async () => (await game.state()).heroes.map((h) => h.swinging);
    await game.step(5);

    await game.hold('KeyZ');
    await game.step(2);
    assert.deepEqual(await swinging(), [true, false], 'Z is player one');
    await game.release();
    await game.step(30);

    await game.hold('KeyF');
    await game.step(2);
    assert.deepEqual(await swinging(), [false, true], 'F is player two');
    await game.release();

    // And the swing has to end. Stepping the sword lived inside the world's
    // once-a-frame work, so only the first hero to reach it each frame ever
    // advanced their swing: player two swung once and froze mid-slash, since
    // a hero holding a sword out cannot walk.
    await game.step(60);
    assert.deepEqual(await swinging(), [false, false], 'a swing that never ends');

    const before = (await game.state()).heroes;
    await game.press(['KeyK'], 20);
    await game.step(20);
    const after = (await game.state()).heroes;
    assert.notEqual(after[1].y, before[1].y, 'player two can move again');

    await game.close();
  });

  test('magic rod swings then fires the beam', async () => {
    // WieldRod used to skip UpdateSwordOrRod and spawn the shot immediately,
    // so Link never struck the attack pose and the rod sprite never appeared.
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.rod = 1;
      window.zeldaDebug.selectB(0, 'rod');
    });

    await game.hold('KeyX');
    await game.step(2);
    const windup = await game.state();
    assert.equal(windup.heroes[0].swinging, true, 'B must start the rod swing');
    assert.equal(windup.heroes[0].swingKind, 1, 'the swing is the rod, not the sword');
    assert.equal(windup.heroes[0].swordVisible, false, 'the rod hides during windup');
    assert.equal(windup.projectiles.length, 0, 'MakeMagicShot waits for state 3');
    await game.release();

    await game.step(6);
    const slash = await game.state();
    assert.equal(slash.heroes[0].swinging, true, 'still in the swing');
    assert.equal(slash.heroes[0].swordVisible, true, 'the rod sprite must be drawn');
    assert.ok((slash.heroes[0].swordGfx?.w ?? 0) > 0, 'the rod has no texture');
    assert.equal(
      slash.projectiles.filter((p) => p.kind === 0x59).length,
      0,
      'the beam must not exist yet',
    );

    await game.step(10);
    const shot = await game.state();
    assert.ok(
      shot.projectiles.some((p) => p.kind === 0x59 && p.friendly),
      'the magic shot fires when the swing reaches state 3',
    );

    await game.close();
  });

  test("player two's sword and bomb are drawn", async () => {
    // Split-screen used to latch everyone else's blade off while painting
    // player one's view, and bombs were only flushed from player one's world.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);

    await game.hold('KeyF');
    await game.step(8);
    const swung = await game.state();
    assert.equal(swung.heroes[1].swinging, true, 'player two must be mid-swing');
    assert.equal(swung.heroes[1].swordVisible, true, 'player two\'s blade must be on');
    assert.ok((swung.heroes[1].swordGfx?.w ?? 0) > 0, 'the blade has no texture');
    assert.ok(
      Math.abs((swung.heroes[1].swordGfx?.x ?? 0) - swung.heroes[1].x) < 24,
      `blade was not at player two (blade=${swung.heroes[1].swordGfx?.x} hero=${swung.heroes[1].x})`,
    );
    await game.release();
    await game.step(30);

    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'bomb'));
    await game.press([KEYS[1].b], 2);
    const bombed = await game.state();
    assert.ok(bombed.bombCount > 0, 'player two did not place a bomb');
    assert.ok(bombed.fxCount > 0, 'the bomb sprite was never added');

    await game.close();
  });

  test("player two's sword still draws when player one is in a labyrinth", async () => {
    // Painting player one's dungeon view used to latch player two's blade
    // off, and player two's own pass never turned it back on.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    assert.equal((await game.state()).heroes[1].world, 'overworld');

    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.hold('KeyF');
    await game.step(8);
    const st = await game.state();
    assert.equal(st.heroes[1].swinging, true);
    assert.equal(st.heroes[1].swordVisible, true, 'the leftover hero must still see their blade');
    await game.release();

    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'bomb'));
    await game.press([KEYS[1].b], 2);
    const bombed = await game.state();
    assert.ok(bombed.heroes[1].bombsOut > 0, 'player two did not place a bomb on the overworld');
    assert.ok(bombed.fxCount > 0, 'the bomb sprite was never added');

    await game.close();
  });

  test('the submenu freezes only its owner', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    const start = (await game.state()).heroes;

    await game.press(['KeyH'], 20);
    const opened = await game.state();
    assert.equal(opened.invOpen, true, 'H is player two\'s Start');
    assert.equal(opened.menuPlayer, 1);
    assert.equal(opened.heroes[1].menu, true, 'the opener sees the panel');
    assert.equal(opened.heroes[0].menu, false, 'the other quadrant does not');

    await game.press(['KeyK'], 20);
    await game.step(20);
    const owner = (await game.state()).heroes;
    assert.equal(owner[1].y, start[1].y, 'the opener cannot walk');

    await game.press(['ArrowDown'], 20);
    await game.step(20);
    const other = (await game.state()).heroes;
    assert.notEqual(other[0].y, start[0].y, 'the other hero can');

    await game.press(['KeyH'], 40);
    assert.equal((await game.state()).invOpen, false, 'the owner shuts it');
    await game.close();
  });

  test('each player can have the submenu up at the same time', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    const start = (await game.state()).heroes;

    await game.press(['Enter', 'KeyH'], 20);
    const opened = await game.state();
    assert.equal(opened.heroes[0].menu, true, 'player one should see their panel');
    assert.equal(opened.heroes[1].menu, true, 'player two should see their panel');

    await game.press(['ArrowDown', 'KeyK'], 20);
    await game.step(20);
    const frozen = (await game.state()).heroes;
    assert.equal(frozen[0].y, start[0].y, 'player one cannot walk with their menu open');
    assert.equal(frozen[1].y, start[1].y, 'player two cannot walk with their menu open');

    await game.press(['Enter'], 20);
    const one = await game.state();
    assert.equal(one.heroes[0].menu, false, 'player one shut theirs');
    assert.equal(one.heroes[1].menu, true, 'player two kept theirs');
    await game.close();
  });

  test('a private conversation freezes only the reader', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.say(['HELLO']));
    const st = await game.state();
    assert.equal(st.dialogue, true);
    assert.equal(st.talking, 0, 'the box opened on player one');

    const before = st.heroes;
    await game.press(['ArrowDown'], 20);
    await game.step(20);
    const afterP1 = (await game.state()).heroes;
    assert.equal(afterP1[0].y, before[0].y, 'the reader cannot walk');

    await game.press(['KeyK'], 20);
    await game.step(20);
    const afterP2 = (await game.state()).heroes;
    assert.notEqual(afterP2[1].y, before[1].y, 'the other hero can');
    await game.close();
  });

  test("an old man's speech goes to the hero who walked in, not the ally outside", async () => {
    // The world's streaming room was $41 (player two's cell). Player one's
    // leftover step still looked there, found the NPC, and opened the box
    // as the reader — so the text sat on player one's statue room.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x41);
    // $73 is two columns east and three rows south of $41. Pose player one
    // there in leftover space before anyone steps, so the old man never
    // talks to a party that is still stacked in $41.
    const PLAY_W = 256;
    const PLAY_H = 176;
    await pose(game, 0, 0x78 + 2 * PLAY_W, 0x8d + 3 * PLAY_H, 0x08);
    await pose(game, 1, 0x78, 0x8d, 0x08);
    await game.step(8);

    const st = await game.state();
    assert.equal(st.heroes[0].linkRoom, 0x73, 'player one must stay in $73');
    assert.equal(st.heroes[1].linkRoom, 0x41, 'player two must be in the old-man cell');
    assert.equal(st.dialogue, true, 'the old man should have spoken');
    assert.equal(st.talking, 1, 'player two walked in; they are the reader');

    const before = st.heroes;
    await game.press(['ArrowDown'], 20);
    const afterP1 = (await game.state()).heroes;
    assert.notEqual(afterP1[0].y, before[0].y, 'the ally outside must still walk');

    await game.press(['KeyK'], 20);
    const afterP2 = (await game.state()).heroes;
    assert.equal(afterP2[1].y, before[1].y, 'the reader cannot walk');
    await game.close();
  });

  test('a player can enter a labyrinth without dragging the other', async () => {
    // A world lives while someone is in it. Player one going underground
    // used to take the whole party — one camera meant a hero left behind
    // was invisible. Each player has a view now, so the overworld stays
    // up for whoever did not take the stairs.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();

    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('dungeon:1'), 'the labyrinth is loaded');
    assert.ok(worlds.live.includes('overworld'), 'the overworld stayed up');

    const arrived = (await game.state()).heroes;
    assert.equal(arrived[0].world, 'dungeon:1');
    assert.equal(arrived[1].world, 'overworld');

    const before = arrived[1];
    await game.press(['KeyK'], 20);
    await game.step(20);
    const after = (await game.state()).heroes;
    assert.notEqual(after[1].y, before.y, 'player two can still walk outside');
    await game.close();
  });

  test("a cellar descent does not take the ally's camera", async () => {
    // Mode-9 cellars used to hard-load on the shared dungeon world, so the
    // ally still upstairs saw the basement and vanished from their own view.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    const parked = await hero(game, 0);
    assert.equal(parked.world, 'dungeon:1');
    assert.equal(parked.linkRoom, 0x73);

    await game.goRoom(0x7f, 0x08, 1);
    const after = await game.state();
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('dungeon:1'), 'the labyrinth must stay up');
    assert.ok(
      after.heroes[1].world?.startsWith('cellar:'),
      `player two should be in the cellar (world=${after.heroes[1].world})`,
    );
    assert.equal(after.heroes[0].world, 'dungeon:1', 'player one was dragged downstairs');
    assert.equal(after.heroes[0].linkRoom, 0x73, 'player one must stay in $73');
    assert.equal(after.heroes[0].x, parked.x, 'player one was moved');
    assert.equal(after.heroes[0].y, parked.y, 'player one was moved');
    assert.equal(after.heroes[1].linkRoom, 0x7f);
    assert.ok(
      (after.uwStreamRooms ?? []).includes(0x73),
      `player one's room was dropped from the stream, got ${JSON.stringify(after.uwStreamRooms)}`,
    );

    await game.press(['ArrowRight'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.x > parked.x, 'player one could not walk while the ally was downstairs');
    assert.equal(walked.world, 'dungeon:1');
    assert.equal(walked.linkRoom, 0x73);
    await game.close();
  });

  test('a save records the host room, not an ally in a cellar', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await game.goRoom(0x7f, 0x08, 1);
    assert.ok((await hero(game, 1)).world?.startsWith('cellar:'));

    const save = await game.page.evaluate(() => window.zeldaDebug.collectSave());
    assert.equal(save.dungeon?.roomId, 0x73, 'the file must keep player one upstairs');
    assert.equal(save.party?.[1]?.worldId?.startsWith('cellar:'), true);

    await game.page.evaluate(() => window.zeldaDebug.practiceSave());
    await game.goRoom(0x22, 0x04, 1);
    assert.equal((await hero(game, 1)).world, 'dungeon:1');

    await game.page.evaluate(async () => {
      await window.zeldaDebug.practiceLoad();
    });
    await game.step(10);
    const after = await game.state();
    assert.equal(after.heroes[0].world, 'dungeon:1');
    assert.equal(after.heroes[0].linkRoom, 0x73, 'player one must not load into the cellar');
    assert.ok(
      after.heroes[1].world?.startsWith('cellar:'),
      `player two should return to the cellar (world=${after.heroes[1].world})`,
    );
    await game.close();
  });

  test('dying upstairs does not drop you onto a cellar ladder', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.goRoom(0x7f, 0x08, 1);
    assert.ok((await hero(game, 1)).world?.startsWith('cellar:'));

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    const after = await waitUntilAlive(game, 0);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].dead, false);
    assert.equal(after.heroes[0].halfHearts, 6, 'three hearts, as continue does');
    assert.equal(after.heroes[0].world, 'dungeon:1');
    assert.equal(after.heroes[0].linkRoom, 0x73, 'player one must stay at the entrance');
    assert.ok(
      after.heroes[1].world?.startsWith('cellar:'),
      'player two must stay in the cellar',
    );
    await game.close();
  });

  test('leaving a cellar does not black out the ally still downstairs', async () => {
    // Both in the L1 basement: climbing out rebuilds the top-down stream
    // around $22. That used to clear $7f and leave the friend in a void.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x7f, 0x08, 0);
    await game.goRoom(0x7f, 0x08, 1);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.ok((await hero(game, 1)).world?.startsWith('cellar:'));

    await game.goRoom(0x22, 0x04, 1);
    const after = await game.state();
    assert.equal(after.heroes[1].world, 'dungeon:1');
    assert.equal(after.heroes[1].linkRoom, 0x22);
    assert.ok(
      after.heroes[0].world?.startsWith('cellar:'),
      `player one should still be downstairs (world=${after.heroes[0].world})`,
    );
    assert.equal(after.heroes[0].linkRoom, 0x7f);
    assert.ok(
      (after.uwStreamRooms ?? []).includes(0x7f),
      `cellar tiles were dropped, got ${JSON.stringify(after.uwStreamRooms)}`,
    );

    const x = after.heroes[0].x;
    await game.press(['ArrowRight'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.x > x, 'player one could not walk in the cellar');
    assert.ok(walked.world?.startsWith('cellar:'));
    await game.close();
  });

  test("climbing out of a cellar does not rebuild the ally's room", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await game.goRoom(0x7f, 0x08, 1);
    assert.ok((await hero(game, 1)).world?.startsWith('cellar:'));

    await game.goRoom(0x22, 0x04, 1);
    const after = await game.state();
    assert.equal(after.heroes[1].world, 'dungeon:1', 'player two should rejoin the labyrinth');
    assert.equal(after.heroes[0].world, 'dungeon:1');
    assert.equal(after.heroes[0].linkRoom, 0x73, 'player one must stay in $73');
    assert.equal(after.heroes[1].linkRoom, 0x22, 'player two should land on the cellar exit room');
    await game.close();
  });

  test('overworld foes chase the hero still outside, not the one in a labyrinth', async () => {
    // Moblins treated player one's dungeon x,y as overworld tiles, so they
    // walked through trees onto the cave that happens to sit at those numbers.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0x4d, 0x08);
    await pose(game, 1, 0xb0, 0x8d, 0x01);

    const planted = await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({
        player: 1,
        objType: 0x04,
        x: 0x70,
        y: 0x8d,
      }),
    );
    assert.ok(planted?.id != null);

    await game.step(50);
    const foe = await game.page.evaluate(
      (id) => window.zeldaDebug.foes(1).find((e) => e.id === id),
      planted.id,
    );
    assert.ok(foe, 'the Moblin left the overworld');
    assert.ok(
      foe.x > planted.x + 8,
      `chased the labyrinth (x=${foe.x} from ${planted.x}; y=${foe.y})`,
    );
    assert.ok(
      Math.abs(foe.y - planted.y) < 24,
      `walked onto the cave mouth (y=${foe.y})`,
    );
    await game.close();
  });

  test('an open east dungeon door can be walked through', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    // L1 entrance $73 opens east into $74. Stand on the approach and hold
    // Right — the live bug froze Link halfway through this opening.
    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0xc0, 0x8d);
    });
    await game.press(['ArrowRight'], 90);
    const st = await game.state();
    assert.equal(st.heroes[0].linkRoom, 0x74, 'must finish the east doorway');
    await game.close();
  });

  test('dungeon enemies keep wandering after you leave their room', async () => {
    // BoundByRoom stops them walking through the door. If they still chase
    // Link after he leaves, they all face the seam and collapse onto that
    // wall instead of keeping their wander. Plant three Goriyas across $73,
    // walk out west, and they must still be spread out in $73.
    const game = await openGame(browser, { url: server.url });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();

    const planted = await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0x30, 0x8d);
      return [0x40, 0x78, 0xc0].map((x) =>
        window.zeldaDebug.plantFoe({ x, y: 0x8d, home: 0x73 }),
      );
    });
    assert.equal(planted.length, 3);
    const ids = new Set(planted.map((e) => e.id));
    await game.step(20);

    await game.press(['ArrowLeft'], 90);
    assert.equal((await game.state()).heroes[0].linkRoom, 0x72, 'Link left west');

    // Long enough that a chase-to-door walk would pin all three on $21.
    await game.step(90);
    const after = (await game.probe()).enemies.filter((e) => e.alive && ids.has(e.id));
    assert.equal(after.length, 3, 'the same three foes must still be alive');
    for (const e of after) {
      assert.equal(e.home, 0x73);
      assert.ok(e.x >= 256, `id=${e.id} followed west (x=${e.x})`);
    }
    const localX = after.map((e) => e.x - 256);
    const piled = localX.every((x) => x <= 0x29);
    assert.equal(
      piled,
      false,
      `collapsed to the west wall: ${localX.map((x) => `$${x.toString(16)}`).join(',')}`,
    );
    // Wander can close the gap; the bug stacked everyone on $21 (spread 0).
    assert.ok(
      Math.max(...localX) - Math.min(...localX) >= 0x18,
      `lost their spread: ${localX.map((x) => `$${x.toString(16)}`).join(',')}`,
    );
    await game.close();
  });

  test('dungeon enemies do not follow through a door and back', async () => {
    // The chase pad that lets overworld wanderers cross a seam also walked
    // Goriyas through dungeon doors: go right and they appear in the next
    // room, go left and the same ones come back. BoundByRoom keeps them home.
    const game = await openGame(browser, { url: server.url });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();

    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0xc0, 0x8d);
      window.zeldaDebug.plantFoe({ x: 0xb0, y: 0x8d, home: 0x73 });
      window.zeldaDebug.plantFoe({ x: 0xa8, y: 0x9d, home: 0x73 });
    });
    await game.step(40);

    const before = (await game.probe()).enemies.filter((e) => e.alive && e.home === 0x73);
    assert.ok(before.length >= 2, 'the planted Goriyas must be alive');
    const ids = new Set(before.map((e) => e.id));

    await game.press(['ArrowRight'], 90);
    assert.equal((await game.state()).heroes[0].linkRoom, 0x74, 'Link crossed east');

    const inNewRoom = (await game.probe()).enemies.filter(
      (e) => e.alive && ids.has(e.id) && e.x >= 0 && e.x < 256,
    );
    assert.equal(
      inNewRoom.length,
      0,
      `home-$73 foes followed into $74: ${inNewRoom.map((e) => `id=${e.id} x=${e.x}`).join(', ')}`,
    );
    for (const e of (await game.probe()).enemies.filter((e) => ids.has(e.id))) {
      assert.equal(e.home, 0x73);
      assert.ok(e.x < 0, `id=${e.id} should still sit in $73 (x=${e.x})`);
    }

    await game.press(['ArrowLeft'], 90);
    assert.equal((await game.state()).heroes[0].linkRoom, 0x73, 'Link crossed back');
    const again = (await game.probe()).enemies.filter((e) => e.alive && e.home === 0x73);
    assert.equal(
      again.filter((e) => ids.has(e.id)).length,
      ids.size,
      'the same foes are still the $73 set',
    );
    assert.ok(
      again.length <= before.length,
      `walking back spawned extras: before=${before.length} after=${again.length}`,
    );
    await game.close();
  });

  test('a hero left in an east door can still walk through after an ally crosses', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    // Player one stands just inside the NES $F0 lip. Player two walks through.
    // After the rebase, player one sits at a small negative X — the position
    // that used to drop DoorwayDir and freeze Right.
    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0xed, 0x8d);
      window.zeldaDebug.poseHero(1, 0xc0, 0x8d);
    });
    await game.press(['KeyL'], 90);
    const afterP2 = (await game.state()).heroes;
    assert.equal(afterP2[1].linkRoom, 0x74, 'player two crossed east');

    const x0 = afterP2[0].x;
    await game.press(['ArrowRight'], 40);
    const afterP1 = (await game.state()).heroes;
    assert.ok(
      afterP1[0].x > x0 || afterP1[0].linkRoom === 0x74,
      `player one stuck in the door at x=${afterP1[0].x} room=$${afterP1[0].linkRoom.toString(16)}`,
    );
    await game.close();
  });

  test('each dungeon camera follows its own hero', async () => {
    // Walking through a door used to rebase the world's room onto whoever
    // crossed. The ally left behind sat in that room's doorway overflow, so
    // the next frame they "exited" the other way and stole the anchor —
    // player two's picture tracked player one and lost its own center.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    const together = (await game.state()).heroes;
    assert.equal(together[0].world, 'dungeon:1');
    assert.equal(together[1].world, 'dungeon:1');

    // Level 1's entrance is on the south rim ($73). Stand player two one
    // full room north ($63) so the cameras have to look at different cells.
    await game.page.evaluate(
      ({ x, y }) => {
        window.zeldaDebug.poseHero(0, x, y);
        window.zeldaDebug.poseHero(1, x, y - 176);
      },
      { x: together[0].x, y: together[0].y },
    );
    await game.step(2);

    const split = (await game.state()).heroes;
    assert.ok(
      split[0].y - split[1].y >= 120,
      `player two stayed north, p1=${split[0].y} p2=${split[1].y}`,
    );
    assert.ok(
      split[1].camLocalY < split[0].camLocalY - 40,
      `player two's camera followed them north, p1=${split[0].camLocalY} p2=${split[1].camLocalY}`,
    );
    await game.close();
  });

  test('a dungeon ally keeps their tile when the other walks through a door', async () => {
    // Screenshot: P2 idle two tiles south of the north door. P1 walking
    // through used to corridor-clamp P2 onto that doorway.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0x78, 0x6d, 0x08);
      window.zeldaDebug.poseHero(1, 0x78, 0x70, 0x08);
    });
    const before = (await game.state()).heroes[1];
    await game.press(['ArrowUp'], 90);
    const after = (await game.state()).heroes;
    assert.equal(after[0].linkRoom, 0x63, 'player one must finish the north doorway');
    assert.equal(after[1].linkRoom, 0x73, 'player two must stay in $73');
    const drifted = Math.abs(after[1].y - (before.y + 176));
    assert.ok(
      drifted <= 2,
      `player two moved ${drifted}px toward the door (before=${before.y} after=${after[1].y})`,
    );
    await game.close();
  });

  test('player two can pick up a key player one is not standing on', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0x40, 0x8d);
      window.zeldaDebug.poseHero(1, 0xc0, 0x8d);
      window.zeldaDebug.placeRoomItem(1, 0x19);
    });
    const before = (await game.state()).keys;
    await game.step(10);
    const after = await game.state();
    assert.equal(after.heroes[1].linkRoom, 0x73);
    assert.equal(
      after.keys,
      before + 1,
      `player two should take the key once (before=${before} after=${after.keys})`,
    );
    assert.equal(
      (after.heroes[1].floorItems ?? []).some((it) => it.type === 0x19),
      false,
      'the key sprite must leave the floor',
    );
    await game.step(20);
    assert.equal(
      (await game.state()).keys,
      before + 1,
      'standing on the tile must not grant another key',
    );
    await game.close();
  });

  test('player two can enter a new room while player one is elsewhere', async () => {
    // Door walking used the world's streaming anchor — player two in $73
    // could not go north while player one held the anchor in $74.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0xc0, 0x8d);
      window.zeldaDebug.poseHero(1, 0x30, 0x8d);
    });
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(
      split[0].linkRoom,
      0x74,
      `player one should be in $74 (x=${split[0].x} y=${split[0].y} room=$${split[0].linkRoom.toString(16)})`,
    );

    // $73 is west of the new anchor, so $73-local (0x78, 0x6d) is at x=$-88.
    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(1, 0x78 - 256, 0x6d, 0x08);
    });
    await game.press(['KeyI'], 90);
    const after = (await game.state()).heroes;
    assert.equal(after[0].linkRoom, 0x74, 'player one stays in $74');
    assert.equal(
      after[1].linkRoom,
      0x63,
      `player two must walk north of $73 (x=${after[1].x} y=${after[1].y} room=$${after[1].linkRoom.toString(16)})`,
    );
    await game.close();
  });

  test('leaving a dungeon does not freeze the player still inside', async () => {
    // P1 walking out used to clear the UW stream and null the shared dungeon
    // record. P2's quadrant went black and stepDungeon returned immediately.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.enterLevel(1, 1);
    await game.step(5);

    await game.page.evaluate(() => {
      // South doorway of L1's start room ($73) is the overworld exit.
      window.zeldaDebug.poseHero(0, 0x78, 0xdd, 0x04);
      window.zeldaDebug.poseHero(1, 0x40, 0x8d, 0x08);
    });
    await game.press(['ArrowDown'], 20);
    await game.step(10);

    const st = await game.state();
    assert.equal(st.heroes[0].world, 'overworld', 'player one should be outside');
    assert.equal(st.heroes[1].world, 'dungeon:1', 'player two should still be in the labyrinth');
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('dungeon:1'), 'the labyrinth stayed loaded');
    assert.ok(worlds.live.includes('overworld'), 'the overworld came back for player one');
    assert.ok(
      (st.uwStreamRooms ?? []).includes(0x73),
      `dungeon tiles still streamed, got ${JSON.stringify(st.uwStreamRooms)}`,
    );

    const y = st.heroes[1].y;
    await game.press(['KeyL'], 20);
    await game.step(20);
    const walked = (await game.state()).heroes[1];
    assert.equal(walked.world, 'dungeon:1');
    assert.notEqual(walked.x, st.heroes[1].x, 'player two must still be able to walk');
    assert.equal(walked.y, y, 'and not be yanked north into a door');
    await game.close();
  });

  test('a player dies alone and comes back beside the living', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.press(['KeyK'], 30);
    await game.step(20);
    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    const dying = await game.state();
    assert.equal(dying.heroes[0].dead, true);
    assert.equal(dying.heroes[0].spinning, true, 'they spin before regrouping');
    assert.equal(dying.deadMenu, false);
    const st = await waitUntilAlive(game, 0);
    assert.equal(st.deadMenu, false, 'someone is still standing');
    assert.equal(st.heroes[0].dead, false);
    assert.equal(st.heroes[0].halfHearts, 6, 'three hearts, as continue does');
    assert.ok(
      Math.abs(st.heroes[0].x - st.heroes[1].x) <= 2
        && Math.abs(st.heroes[0].y - st.heroes[1].y) <= 2,
      'they regrouped on the living',
    );
    const y = st.heroes[1].y;
    await game.press(['KeyK'], 20);
    await game.step(20);
    assert.notEqual((await game.state()).heroes[1].y, y, 'the living kept walking');
    await game.close();
  });

  test('the continue menu waits until everyone is down', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.wipeParty());
    const st = await game.state();
    assert.equal(st.deadMenu, true);
    assert.equal(st.heroes[0].dead, true);
    assert.equal(st.heroes[1].dead, true);
    await game.close();
  });

  test('Start on an unused device joins, Start+Select leaves', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    assert.equal((await game.state()).heroes.filter((h) => h.active).length, 1);

    await game.press(['KeyH'], 5);
    const joined = await game.state();
    assert.equal(joined.heroes.filter((h) => h.active).length, 2, 'H sits player two down');
    assert.equal(joined.invOpen, false, 'the join Start must not open the submenu');
    assert.equal(joined.canvasW, 512);
    assert.equal(joined.canvasH, 544, 'two players open the 2×2, not a 2-up strip');
    assert.equal(joined.sharedBar, true);
    assert.equal(joined.joinPrompts, 2);
    const wide = await game.page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
    assert.ok(wide >= 512, `the canvas grew, got ${wide}`);
    const y = joined.heroes[0].y;
    await game.press(['ArrowDown'], 20);
    assert.notEqual((await game.state()).heroes[0].y, y, 'the world still moves after a join');

    await game.hold('KeyY');
    await game.press(['KeyH'], 5);
    await game.release();
    const left = await game.state();
    assert.equal(left.heroes.filter((h) => h.active).length, 1, 'H+Y stands them up');
    const narrow = await game.page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
    assert.ok(narrow < 512, `the canvas shrank, got ${narrow}`);
    await game.close();
  });

  test('the join hint names the next seat, and its Start sits them down', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(2);
    const hint = (await game.state()).joinHint;
    assert.match(hint, /Player 2/, 'solo play must say how to join');
    await game.press(['KeyH'], 5);
    const afterH = await game.state();
    assert.equal(afterH.heroes.filter((h) => h.active).length, 2);
    assert.equal(afterH.invOpen, false, 'joining must not freeze the party in the submenu');
    assert.match(afterH.joinHint, /Player 3/);
    await game.press(['NumpadAdd'], 5);
    assert.equal((await game.state()).heroes.filter((h) => h.active).length, 3);
    await game.close();
  });

  test('three players open the 2×2 and leave a join prompt', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=3' });
    await game.step(2);
    const st = await game.state();
    assert.equal(st.heroes.filter((h) => h.active).length, 3);
    const size = await game.page.evaluate(() => ({
      w: document.querySelector('canvas')?.width ?? 0,
      h: document.querySelector('canvas')?.height ?? 0,
    }));
    assert.ok(size.w >= 512, `wide enough for two columns, got ${size.w}`);
    assert.ok(size.h >= 544, `tall enough for the 2×2 and a bar, got ${size.h}`);
    const caps = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(caps.rupeeCap, 765);
    assert.equal(caps.maxBombs, 24);
    assert.equal(st.sharedBar, true, 'the purse lives on the strip under the 2×2');
    assert.equal(st.compactHud, true);
    assert.equal(st.joinPrompts, 1, 'the empty cell is a join prompt');
    await game.close();
  });

  test('four players fill the 2×2', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=4' });
    await game.step(2);
    const st = await game.state();
    assert.equal(st.heroes.filter((h) => h.active).length, 4);
    assert.equal(st.canvasW, 512);
    assert.equal(st.canvasH, 544);
    assert.equal(st.joinPrompts, 0);
    assert.equal(st.sharedBar, true);
    assert.equal(st.compactHud, true);
    assert.equal(st.joinHint, '');
    const caps = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(caps.rupeeCap, 1020);
    assert.equal(caps.maxBombs, 32);
    await game.close();
  });

  test('leaving three for two keeps the 2×2', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=3' });
    await game.step(2);
    const left = await game.page.evaluate(() => window.zeldaDebug.leave(2));
    assert.equal(left, true);
    const st = await game.state();
    assert.equal(st.heroes.filter((h) => h.active).length, 2);
    assert.equal(st.canvasW, 512);
    assert.equal(st.canvasH, 544, 'two players are still the company frame');
    assert.equal(st.joinPrompts, 2);
    assert.equal(st.sharedBar, true);
    assert.equal(st.compactHud, true);
    const caps = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(caps.rupeeCap, 510);
    assert.equal(caps.maxBombs, 16);
    await game.close();
  });

  test('the last remaining player cannot leave', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    assert.equal(await game.page.evaluate(() => window.zeldaDebug.leave(1)), true);
    const alone = await game.state();
    assert.equal(alone.heroes.filter((h) => h.active).length, 1);
    assert.equal(alone.canvasW, 256);
    assert.equal(alone.canvasH, 240);
    assert.equal(alone.sharedBar, false);
    assert.equal(await game.page.evaluate(() => window.zeldaDebug.leave(0)), false);
    const still = await game.state();
    assert.equal(still.heroes.filter((h) => h.active).length, 1);
    assert.equal(still.canvasH, 240);
    await game.close();
  });

  test('a joiner stands on the host with a full glass', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(2);
    await pose(game, 0, 0x48, 0x9d, 0x08);
    const host = (await game.state()).heroes[0];
    await game.page.evaluate(() => window.zeldaDebug.join(1));
    const st = await game.state();
    const joiner = st.heroes[1];
    assert.equal(joiner.active, true);
    assert.equal(joiner.x, host.x);
    assert.equal(joiner.y, host.y);
    assert.equal(joiner.world, host.world);
    assert.equal(joiner.maxHalfHearts, host.maxHalfHearts);
    assert.equal(joiner.halfHearts, host.maxHalfHearts, 'they sit down at full');
    await game.close();
  });

  test('leaving does not confiscate rupees; spending walks the ceiling down', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.rupees = 400;
    });
    assert.equal((await game.page.evaluate(() => window.zeldaDebug.leave(1))), true);
    const afterLeave = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(afterLeave.rupees, 400);
    assert.equal(afterLeave.rupeeCapFloor, 255);
    assert.equal(afterLeave.rupeeCap, 400, 'the ceiling stays on the pile');
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.rupees -= 50;
    });
    const afterSpend = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(afterSpend.rupees, 350);
    assert.equal(afterSpend.rupeeCap, 350);
    await game.close();
  });

  test('bombs keep the excess when someone leaves', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.bombs = 14;
    });
    await game.page.evaluate(() => window.zeldaDebug.leave(1));
    const caps = await game.page.evaluate(() => window.zeldaDebug.caps());
    assert.equal(caps.maxBombs, 8);
    assert.equal(caps.bombs, 14, 'the extra bombs stay until spent');
    await game.close();
  });

  test('a potion in the bag stands a downed hero back up', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.potion = 1;
      window.zeldaDebug.kill(0);
    });
    const st = await game.state();
    assert.equal(st.heroes[0].dead, false, 'the bottle was drunk for them');
    assert.equal(st.heroes[0].spinning, false);
    assert.equal(st.heroes[0].halfHearts, st.heroes[0].maxHalfHearts);
    assert.equal(st.deadMenu, false);
    assert.equal(await game.page.evaluate(() => window.zeldaDebug.inv.potion), 0);
    await game.close();
  });

  test('two heroes on one tile walk through each other', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);
    await pose(game, 1, 0x70, 0x8d, 0x02);
    await game.press(['ArrowRight'], 20);
    await game.step(8);
    const afterP1 = await game.state();
    assert.ok(afterP1.heroes[0].x > 0x70, 'player one walked east through the ally');
    await game.press(['KeyJ'], 20);
    await game.step(8);
    const afterP2 = await game.state();
    assert.ok(afterP2.heroes[1].x < afterP1.heroes[1].x, 'player two walked west through the ally');
    await game.close();
  });

  test('your bomb can still catch you; an ally walks through it', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    const before = await game.state();
    const host = before.heroes[0];
    await game.page.evaluate(
      ({ x, y }) => {
        window.zeldaDebug.poseHero(1, x, y);
        window.zeldaDebug.plantBomb(0, true);
      },
      { x: host.x, y: host.y },
    );
    await game.step(2);
    const after = await game.state();
    assert.ok(
      after.heroes[0].halfHearts < before.heroes[0].halfHearts,
      'the owner took the blast',
    );
    assert.equal(
      after.heroes[1].halfHearts,
      before.heroes[1].halfHearts,
      'the ally did not',
    );
    await game.close();
  });

  test('a heart container raises everyone and fills only the finder', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(2);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.maxHalfHearts = 6;
      window.zeldaDebug.inv.halfHearts = 2;
    });
    const after = await game.page.evaluate(() => window.zeldaDebug.grantHeart());
    const p1 = after.find((h) => h.index === 0);
    const p2 = after.find((h) => h.index === 1);
    assert.equal(p1.max, 8);
    assert.equal(p1.hh, 4, 'the finder gained the container\'s heart');
    assert.equal(p2.max, 8);
    assert.equal(p2.hh, 6, 'the other is not healed');
    await game.close();
  });

  test('one player is still exactly one player', async () => {
    // The party only grows when asked; the default game must be untouched.
    const game = await openGame(browser, { url: server.url });
    assert.equal((await game.state()).heroes.length, 1);
    await game.close();
  });

  test('the submenu opens and closes again', async () => {
    // Same trap as the labyrinth: an open submenu freezes the world, so a
    // scenario that opens one and never closes it hashes a still frame.
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await game.press(['Enter'], 40);
    assert.equal((await game.state()).invOpen, true);
    await game.press(['Enter'], 40);
    assert.equal((await game.state()).invOpen, false);
    await game.close();
  });

  test('the labyrinth is playable once the old man has had his say', async () => {
    // A speech freezes the world, and a frozen world hashes perfectly stably —
    // which is how the two labyrinth scenarios spent a while proving nothing.
    // Walking is the cheapest evidence that the place is actually running.
    const game = await openGame(browser, { url: server.url });
    await game.step(10);
    await game.enterLevel(1);
    assert.equal((await game.state()).dialogue, true, 'entering says something');

    await game.dismissDialogue();
    const before = (await game.probe()).link;
    await game.press(['ArrowUp'], 30);
    const after = (await game.probe()).link;

    assert.equal((await game.state()).dialogue, false);
    assert.notEqual(after.y, before.y, 'Link is stuck in the entrance');
    await game.close();
  });

  test('a scenario replays identically in a second page', async () => {
    // The goldens are worth nothing if a run is not reproducible, and this is
    // the cheapest place to notice that it has stopped being so.
    const a = await play('walkAndFight');
    const b = await play('walkAndFight');
    assert.equal(a.trace, b.trace);
  });

  test('a labyrinth is its own world, and the overworld dies behind you', async () => {
    // The registry only earns its place if transitions really go through it.
    // At one player the rule "a world lives while someone is in it" is what
    // reproduces the ROM's respawn on the way back out, so the overworld must
    // genuinely be gone while Link is underground rather than kept warm.
    const game = await openGame(browser, { url: server.url });
    await game.step(10);
    const home = (await game.probe()).roomId;
    const start = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.deepEqual(start, { live: ['overworld'], current: 'overworld' });

    await game.enterLevel(1);
    const inside = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.deepEqual(inside, { live: ['dungeon:1'], current: 'dungeon:1' });

    await game.returnToOverworld(home);
    const back = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.deepEqual(back, { live: ['overworld'], current: 'overworld' });
    assert.deepEqual(game.pageErrors, [], 'the page threw');
    await game.close();
  });

  test('leaving the world and coming back changes nothing', async () => {
    // Each player owning their own place is carried by a swap that only runs
    // when the focus moves between players — which at one player is never, so
    // no scenario above can tell a complete swap from an empty one. Visiting a
    // scratch world forces the move: the same scenario, interrupted by a round
    // trip through an empty world, has to end on the same hash. A field the
    // swap forgets to *save* comes back as the scratch world's empty version
    // of it and the trace diverges from that frame on.
    //
    // It cannot see a field missing from the *load* — the live value simply
    // stays put, so a round trip looks clean either way. Only the save side is
    // covered here; the load side needs two players to be observable at all.
    const game = await openGame(browser, { url: server.url });
    await game.press(['ArrowDown'], 40);

    // Both probes are read either side of a synchronous call in one page
    // evaluation. Reading them as separate calls leaves a window in which a
    // late room load can land and change the world on its own, which fails
    // this test perhaps one run in three for a reason that has nothing to do
    // with the swap.
    const trip = await game.page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      for (let s = 0; window.zeldaDebug.pendingLoads() > 0 && s < 2000; s += 1) {
        await tick();
      }
      const before = window.zeldaDebug.probe();
      const visit = window.zeldaDebug.visitScratchWorld();
      return { before, visit, after: window.zeldaDebug.probe() };
    });

    assert.equal(trip.visit.world, 'overworld', 'came back to the world it left');
    assert.deepEqual(
      trip.visit.inside,
      { x: 0x11, y: 0x22 },
      'the frame ran as the other hero, not merely in the other world',
    );
    assert.deepEqual(trip.after, trip.before, 'the world is not where it was left');

    await game.press(['KeyZ'], 15);
    await game.press(['ArrowLeft'], 40);
    assert.deepEqual(game.pageErrors, [], 'the page threw');
    assert.deepEqual([...game.violations], [], 'a streaming invariant broke');
    assert.equal(game.trace, GOLDENS.walkAndFight, 'the round trip left a mark');
    await game.close();
  });

  async function enterLabyrinth(game, extraIndexes = []) {
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    for (const i of extraIndexes) {
      await game.enterLevel(1, i);
    }
    await game.step(5);
  }

  test('solo overworld walking animates and does not bounce on a wall', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    const down = await traceHold(game, 0, KEYS[0].down, 36);
    assert.ok(sawWalkCycle(down), 'the walk cycle never flipped');
    assert.ok(netDelta(down, 'y') > 20, `did not walk south (dy=${netDelta(down, 'y')})`);
    assert.equal(netDelta(down, 'x'), 0, 'south walked sideways');
    assert.ok(isMonotonic(down.map((t) => t.y), 1), 'southbound y jittered backwards');

    await pose(game, 0, 0x78, 0x8d, 0x02);
    const left = await walkUntilStopped(game, 0, KEYS[0].left);
    assert.ok(sawWalkCycle(left), 'west walk cycle never flipped');
    assert.ok(
      tailIsConstant(left.map((t) => t.x), 12),
      `never settled on the west trees: ${left.slice(-8).map((t) => t.x).join(',')}`,
    );
    await game.close();
  });

  test('mountain stairs animate the walk cycle', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x3c, { x: 0x70, y: 0xcd, dir: 0x08 });
    await pose(game, 0, 0x70, 0xcd, 0x08);
    const up = await traceHold(game, 0, KEYS[0].up, 48);
    assert.ok(sawWalkCycle(up), 'stairs froze the walk cycle');
    assert.ok(netDelta(up, 'y') < -4, `did not climb the stairs (dy=${netDelta(up, 'y')})`);
    await game.close();
  });

  test('two players walk independently with their own walk cycles', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await pose(game, 0, 0x70, 0x8d, 0x08);
    await pose(game, 1, 0x80, 0x8d, 0x08);

    const p1 = await traceHold(game, 0, KEYS[0].down, 36);
    const idle = await hero(game, 1);
    assert.ok(sawWalkCycle(p1), 'player one slid without a walk cycle');
    assert.equal(idle.y, 0x8d, 'player two drifted while player one walked');
    assert.equal(idle.animFrame, 0, 'an idle ally animated');

    const p2 = await traceHold(game, 1, KEYS[1].down, 36);
    assert.ok(sawWalkCycle(p2), 'player two slid without a walk cycle');
    assert.ok(netDelta(p2, 'y') > 20, `player two did not walk south (dy=${netDelta(p2, 'y')})`);
    const p1After = await hero(game, 0);
    assert.equal(p1After.y, p1[p1.length - 1].y, 'player one drifted while player two walked');
    await game.close();
  });

  test('a second player walking matches a solo walk from the same tile', async () => {
    const solo = await openGame(browser, { url: server.url });
    await solo.step(5);
    await pose(solo, 0, 0x78, 0x8d, 0x08);
    const soloDown = await traceHold(solo, 0, KEYS[0].down, 24);
    await solo.close();

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await pose(party, 0, 0x60, 0x8d, 0x04);
    await pose(party, 1, 0x78, 0x8d, 0x08);
    const p2Down = await traceHold(party, 1, KEYS[1].down, 24);
    await party.close();

    assert.deepEqual(
      p2Down.map((t) => t.y),
      soloDown.map((t) => t.y),
      'player two southbound from the same tile did not match solo',
    );
    assert.deepEqual(
      p2Down.map((t) => t.animFrame),
      soloDown.map((t) => t.animFrame),
      'player two\'s walk cycle did not match solo',
    );
  });

  test('four players can each walk without jittering into a wall', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=4' });
    await game.step(5);
    const spots = [0x50, 0x60, 0x70, 0x80];
    for (let i = 0; i < 4; i += 1) {
      await pose(game, i, spots[i], 0x8d, 0x08);
    }
    for (let i = 0; i < 4; i += 1) {
      const down = await traceHold(game, i, KEYS[i].down, 24);
      assert.ok(sawWalkCycle(down), `player ${i + 1} had no walk cycle`);
      assert.ok(netDelta(down, 'y') > 12, `player ${i + 1} did not walk south`);
    }
    for (let i = 0; i < 4; i += 1) {
      await pose(game, i, 0x78, 0x8d, 0x02);
      const left = await walkUntilStopped(game, i, KEYS[i].left);
      assert.ok(
        left.length < 200,
        `player ${i + 1} never hit a wall (frames=${left.length} x=${left.at(-1)?.x})`,
      );
      assert.ok(
        tailIsConstant(left.map((t) => t.x), 8),
        `player ${i + 1} jittered on the wall: ${left.slice(-8).map((t) => t.x).join(',')}`,
      );
    }
    await game.close();
  });

  test('an open submenu does not change how the others walk', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    await pose(game, 1, 0x60, 0x8d, 0x04);
    const free = await traceHold(game, 0, KEYS[0].down, 24);

    await pose(game, 0, 0x78, 0x8d, 0x08);
    await game.press(['KeyH'], 20);
    assert.equal((await game.state()).invOpen, true);
    const during = await traceHold(game, 0, KEYS[0].down, 24);
    assert.deepEqual(
      during.map((t) => [t.y, t.animFrame]),
      free.map((t) => [t.y, t.animFrame]),
      'the other hero walked differently while the submenu was open',
    );
    await game.close();
  });

  test('dungeon walking animates for every player', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    // From the south-door spawn, which is the one pose the goldens already walk.
    const p1 = await traceHold(game, 0, KEYS[0].up, 36);
    assert.ok(sawWalkCycle(p1), 'player one slid without a dungeon walk cycle');
    assert.ok(netDelta(p1, 'y') < -8, `player one did not walk north (dy=${netDelta(p1, 'y')})`);

    const p1Now = await hero(game, 0);
    await pose(game, 1, p1Now.x, p1Now.y + 16, 0x08);
    const p2 = await traceHold(game, 1, KEYS[1].up, 36);
    assert.ok(sawWalkCycle(p2), 'player two slid without a dungeon walk cycle');
    assert.ok(netDelta(p2, 'y') < -8, `player two did not walk north (dy=${netDelta(p2, 'y')})`);
    await game.close();
  });

  test('a leftover dungeon ally is not ejected, and can still walk', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.page.evaluate(() => {
      window.zeldaDebug.poseHero(0, 0xc0, 0x8d);
      window.zeldaDebug.poseHero(1, 0x78, 0x8d);
    });
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(split[0].linkRoom, 0x74, 'player one should have crossed east');
    assert.equal(split[1].linkRoom, 0x73, 'player two should have stayed in $73');
    const parked = { x: split[1].x, y: split[1].y, room: split[1].linkRoom };
    await game.step(60);
    const still = await hero(game, 1);
    assert.equal(still.linkRoom, parked.room, 'a leftover ally was ejected into the anchor');
    assert.ok(
      Math.abs(still.x - parked.x) <= 2 && Math.abs(still.y - parked.y) <= 2,
      `leftover ally drifted after the cross (before=${parked.x},${parked.y} after=${still.x},${still.y})`,
    );

    const p2Walk = await traceHold(game, 1, KEYS[1].down, 36);
    assert.ok(sawWalkCycle(p2Walk), 'player two in a leftover room had no walk cycle');
    assert.ok(netDelta(p2Walk, 'y') > 8, 'player two could not walk in the leftover room');
    await game.close();
  });

  async function livingSwordBeams(game) {
    return ((await game.state()).projectiles ?? []).filter((p) => p.kind === 0x57);
  }

  async function fireSwordBeam(game, index) {
    await game.page.evaluate(() => window.zeldaDebug.refillHearts());
    await game.hold(KEYS[index].a);
    /** @type {{ kind: number, x: number, y: number } | null} */
    let beam = null;
    for (let i = 0; i < 24 && !beam; i += 1) {
      await game.step(1);
      beam = (await livingSwordBeams(game))[0] ?? null;
    }
    return beam;
  }

  test("player two's sword beam flies in the same dungeon room", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x02);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    const beam = await fireSwordBeam(game, 1);
    assert.ok(beam, 'player two did not fire a sword beam');
    const x0 = beam.x;
    await game.step(8);
    const later = await livingSwordBeams(game);
    await game.release();
    assert.ok(later.length, 'the beam died in the shared room');
    assert.ok(later[0].x < x0, `the beam did not travel (x0=${x0} x=${later[0].x})`);
    await game.close();
  });

  test("player two's sword beam still flies from a leftover dungeon room", async () => {
    // Projectile motion is stepped once per world, by player one, whose
    // camera is the anchor playfield. A leftover beam used to spawn outside
    // that box and die on the first tick.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0xc0, 0x8d);
    await pose(game, 1, 0x78, 0x8d);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(split[0].linkRoom, 0x74, 'player one should have crossed east');
    assert.equal(split[1].linkRoom, 0x73, 'player two should have stayed in $73');
    assert.ok(split[1].x < 0, `leftover ally should be west of the anchor (x=${split[1].x})`);

    await pose(game, 1, split[1].x, split[1].y, 0x02);
    const parked = await hero(game, 1);
    const beam = await fireSwordBeam(game, 1);
    assert.ok(beam, 'player two did not fire a leftover sword beam');
    assert.ok(
      Math.abs(beam.x - parked.x) < 40,
      `beam spawned away from player two (beam=${beam.x} hero=${parked.x})`,
    );
    const x0 = beam.x;
    await game.step(8);
    const later = await livingSwordBeams(game);
    await game.release();
    assert.ok(later.length, 'the leftover beam died on player one\'s camera');
    assert.ok(later[0].x < x0, `the leftover beam did not travel (x0=${x0} x=${later[0].x})`);
    assert.equal((await hero(game, 0)).linkRoom, 0x74, 'player one must stay in $74');
    await game.close();
  });

  test('dungeon walls hold every player without jitter', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x68, 0x8d, 0x08);
    await pose(game, 1, 0x88, 0x8d, 0x08);
    const p1 = await traceHold(game, 0, KEYS[0].up, 90);
    const p2 = await traceHold(game, 1, KEYS[1].up, 90);
    assert.ok(
      tailIsConstant(p1.map((t) => t.y)),
      `player one bounced on the north wall: ${p1.slice(-8).map((t) => t.y).join(',')}`,
    );
    assert.ok(
      tailIsConstant(p2.map((t) => t.y)),
      `player two bounced on the north wall: ${p2.slice(-8).map((t) => t.y).join(',')}`,
    );
    await game.close();
  });

  test('two players starting in L1 $72 can walk the east door and the floor', async () => {
    // Hard-cutting into $72 used to leave player two colliding against $73
    // (stale occupancy) and player one frozen in the east opening because
    // the shared DoorwayDir latch was cleared by whoever was already inside.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x72);
    await ignoreHits(game);

    const atStart = (await game.state()).heroes;
    assert.equal(atStart[0].linkRoom, 0x72);
    assert.equal(atStart[1].linkRoom, 0x72);
    assert.equal(atStart[0].uwOccRoomId, 0x72, 'player one occupancy after goRoom');
    assert.equal(atStart[1].uwOccRoomId, 0x72, 'player two occupancy after goRoom');

    await pose(game, 1, 0x40, 0x8d, 0x01);
    const floor = await traceHold(game, 1, KEYS[1].right, 36);
    assert.ok(sawWalkCycle(floor), 'player two slid on $72 ghost solids');
    assert.ok(netDelta(floor, 'x') > 8, `player two could not walk the $72 floor (dx=${netDelta(floor, 'x')})`);
    assert.equal((await hero(game, 1)).linkRoom, 0x72);

    await pose(game, 0, 0xc0, 0x8d, 0x01);
    await game.press(['ArrowRight'], 90);
    assert.equal((await hero(game, 0)).linkRoom, 0x73, 'player one must finish the $72 east doorway');
    await game.close();
  });

  test("player two's boomerang comes back to player two", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'boomerang'));

    await game.press([KEYS[1].b], 2);
    const thrown = await game.state();
    assert.ok(thrown.boomerang, 'player two did not throw');
    assert.equal(thrown.boomerang.owner, 1);

    let lastBoom = thrown.boomerang;
    let last = thrown;
    for (let i = 0; i < 90; i += 1) {
      await game.step(1);
      last = await game.state();
      if (last.boomerang) lastBoom = last.boomerang;
      else break;
    }
    assert.equal(last.boomerang, null, 'the boom never came back');
    const p1 = last.heroes[0];
    const p2 = last.heroes[1];
    const toP2 = Math.abs(lastBoom.x - p2.x);
    const toP1 = Math.abs(lastBoom.x - p1.x);
    assert.ok(
      toP2 < toP1 && toP2 <= 16,
      `caught at x=${lastBoom.x} (p1=${p1.x} p2=${p2.x})`,
    );
    await game.close();
  });

  test("player two's boomerang follows them, not player one", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x28, 0x8d, 0x01);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'boomerang'));
    await game.press([KEYS[1].b], 2);
    assert.ok((await game.state()).boomerang, 'player two did not throw');

    // Walk player two east while the boom is in the air. It must chase them,
    // not sit on player one.
    const walked = await traceHold(game, 1, KEYS[1].right, 40);
    const st = await game.state();
    const p1 = st.heroes[0];
    const p2 = st.heroes[1];
    assert.ok(netDelta(walked, 'x') > 8, 'player two did not walk');
    if (st.boomerang) {
      const toP2 = Math.abs(st.boomerang.x - p2.x);
      const toP1 = Math.abs(st.boomerang.x - p1.x);
      assert.ok(
        toP2 < toP1,
        `boom chased player one (boom=${st.boomerang.x} p1=${p1.x} p2=${p2.x})`,
      );
    } else {
      assert.ok(
        Math.abs(p2.x - 0x70) > 8,
        'boom vanished without player two having moved',
      );
    }
    await game.close();
  });

  test("player one's boomerang still comes back to player one", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xd0, 0x8d, 0x02);
    await game.page.evaluate(() => window.zeldaDebug.selectB(0, 'boomerang'));
    await game.press([KEYS[0].b], 2);
    const thrown = await game.state();
    assert.ok(thrown.boomerang, 'player one did not throw');
    assert.equal(thrown.boomerang.owner, 0);

    let lastBoom = thrown.boomerang;
    let last = thrown;
    for (let i = 0; i < 90; i += 1) {
      await game.step(1);
      last = await game.state();
      if (last.boomerang) lastBoom = last.boomerang;
      else break;
    }
    assert.equal(last.boomerang, null, 'player one never caught their boom');
    const p1 = last.heroes[0];
    const p2 = last.heroes[1];
    const toP1 = Math.abs(lastBoom.x - p1.x);
    const toP2 = Math.abs(lastBoom.x - p2.x);
    assert.ok(
      toP1 < toP2 && toP1 <= 16,
      `caught at x=${lastBoom.x} (p1=${p1.x} p2=${p2.x})`,
    );
    await game.close();
  });

  test('two heroes can each have a boomerang in the air', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => {
      window.zeldaDebug.selectB(0, 'boomerang');
      window.zeldaDebug.selectB(1, 'boomerang');
    });
    await game.press([KEYS[0].b, KEYS[1].b], 2);
    const st = await game.state();
    assert.equal((st.boomerangs ?? []).length, 2, 'each thrower should have a boom out');
    const owners = new Set((st.boomerangs ?? []).map((b) => b.owner));
    assert.ok(owners.has(0) && owners.has(1), `owners=${[...owners]}`);
    assert.ok(st.boomerang, 'the first live boom still shows on state().boomerang');
    await game.close();
  });

  test('a late dungeon descent stands at the mouth, not on the ally', async () => {
    // snapToHost used to copy whoever was already underground, so walking
    // the stairs stacked player two on player one instead of the south door.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await pose(game, 0, 0x78, 0x8d, 0x08);
    const parked = await hero(game, 0);

    await game.enterLevel(1, 1);
    const after = (await game.state()).heroes;
    assert.equal(after[1].world, 'dungeon:1');
    assert.equal(after[1].linkRoom, 0x73, 'player two must land in the start room');
    assert.equal(after[1].uwOccRoomId, 0x73);
    assert.equal(after[1].y, 0xdd, 'south-door entrance row');
    assert.equal(after[1].x, 0x78, 'south-door entrance column');
    assert.equal(after[0].linkRoom, 0x73, 'player one must stay in the start room');
    assert.equal(after[0].x, parked.x);
    assert.equal(after[0].y, parked.y, 'player one must not be yanked to the mouth');
    assert.ok(after[1].y !== after[0].y, 'the two heroes must not overlap');
    await game.close();
  });

  test('a late dungeon descent is the start room when the ally is elsewhere', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(1);
    await game.dismissDialogue();
    await game.goRoom(0x74);
    await pose(game, 0, 0x78, 0x8d, 0x01);
    const parked = await hero(game, 0);
    assert.equal(parked.linkRoom, 0x74);
    assert.equal((await hero(game, 1)).world, 'overworld', 'player two is still outside');

    await game.enterLevel(1, 1);
    const after = (await game.state()).heroes;
    assert.equal(after[1].world, 'dungeon:1');
    assert.equal(after[1].linkRoom, 0x73, 'player two must spawn at the mouth, not in $74');
    assert.equal(after[1].uwOccRoomId, 0x73);
    assert.equal(after[1].y, 0xdd, 'south-door entrance row');
    assert.equal(after[0].linkRoom, 0x74, 'player one must stay in $74');
    assert.ok(
      Math.abs(after[0].x - parked.x) < 2 && Math.abs(after[0].y - parked.y) < 2,
      `player one was dragged (x=${after[0].x},${after[0].y})`,
    );

    await ignoreHits(game);
    const y = after[1].y;
    await game.press(['KeyI'], 20);
    const walked = (await game.state()).heroes[1];
    assert.equal(walked.linkRoom, 0x73);
    assert.ok(walked.y < y, `player two could not walk in from the mouth (y=${walked.y})`);
    await game.close();
  });

  test('a wallmaster dump takes only the grabbed player', async () => {
    // loadDungeonRoom(entrance) used to rebuild the cell on top of everyone.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x74);
    await ignoreHits(game);

    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    const before = (await game.state()).heroes;
    assert.equal(before[0].linkRoom, 0x74);
    assert.equal(before[1].linkRoom, 0x74);

    const grab = await game.page.evaluate(() => window.zeldaDebug.grabWallmaster(1));
    assert.ok(grab, 'the hand never closed');
    assert.equal(grab.victim, 1);

    let after = await game.state();
    for (let i = 0; i < 400 && after.heroes[1].linkRoom === 0x74; i += 1) {
      await game.step(1);
      after = await game.state();
    }
    assert.equal(after.mode, 'dungeon', 'the dump must not leave the labyrinth');
    assert.equal(after.heroes[1].linkRoom, 0x73, 'player two must land in the start room');
    assert.equal(after.heroes[1].uwOccRoomId, 0x73);
    assert.equal(after.heroes[1].y, 0xdd, 'south-door entrance row');
    assert.equal(after.heroes[0].linkRoom, 0x74, 'player one must stay in $74');
    assert.ok(
      Math.abs(after.heroes[0].x - before[0].x) < 8
        && Math.abs(after.heroes[0].y - before[0].y) < 8,
      `player one was dragged (x=${after.heroes[0].x},${after.heroes[0].y})`,
    );

    await game.press(['ArrowRight'], 20);
    await game.step(20);
    const walked = (await game.state()).heroes[0];
    assert.notEqual(walked.x, before[0].x, 'player one must still be able to walk');

    await game.close();
  });

  test('player two can push a block while player one stands in the same room', async () => {
    // The world's one push object used to tick for every hero. Player one,
    // idle and unaligned, zeroed the hold every frame so player two never
    // reached the 16-frame shove.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x42);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0x60, 0x8d, 0x01);
    await game.press(['KeyL'], 40);
    const blocks = (await game.state()).pushBlocks ?? [];
    const block = blocks.find((b) => b.roomId === 0x42);
    assert.ok(block, 'the $42 block must still exist');
    assert.equal(block.x, 0x80, `block sat at x=${block.x}`);
    assert.equal(block.complete, true);
    await game.close();
  });

  test('player two can push a leftover-room block', async () => {
    // After player one walked east, the live push object belonged to $43 and
    // leftover $42 kept its baked $B0 — collision without a shove, and a
    // phantom align against the wrong cell.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.goRoom(0x42);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 1, 0x60, 0x8d, 0x01);
    await pose(game, 0, 0xc0, 0x8d, 0x01);
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(split[0].linkRoom, 0x43, 'player one should leave through the east door');
    assert.equal(split[1].linkRoom, 0x42, 'player two must stay with the block');

    await game.press(['KeyL'], 40);
    const after = await game.state();
    assert.equal(after.heroes[1].linkRoom, 0x42);
    const block = (after.pushBlocks ?? []).find((b) => b.roomId === 0x42);
    assert.ok(block, 'the leftover room must keep its own block');
    assert.equal(block.x, 0x80, `leftover block sat at x=${block.x}`);
    assert.equal(block.complete, true);
    await game.close();
  });
});
