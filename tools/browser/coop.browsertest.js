/**
 * Two-player play tests for the world-split cases the goldens do not cover.
 *
 * Caves, file Continue (not F9), join/leave inside a labyrinth, independent
 * B slots, story beats that hold everyone, leftover-room death, and the
 * ending folding split-screen back to one NES frame.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { KEYS, hero, ignoreHits, netDelta, pose, sawWalkCycle, traceHold, waitUntilAlive } from './movementHarness.js';

/** Shop cave `$1d`. */
const SHOP_CAVE = 0x1d;
/** Take-any cave `$11`. */
const TAKE_ANY_CAVE = 0x11;
/** Magical sword under a gravestone — three-page old-man speech. */
const GRAVE_SWORD_CAVE = 0x13;
/** L4 `$01` is dark. */
const L4_DARK_ROOM = 0x01;

describe('coop play', { concurrency: false }, () => {
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
   * @param {number[]} extraIndexes
   */
  async function enterLabyrinth(game, extraIndexes = [], level = 1) {
    await game.step(10);
    await game.enterLevel(level);
    await game.dismissDialogue();
    for (const i of extraIndexes) {
      await game.enterLevel(level, i);
    }
    await game.step(5);
  }

  async function mashStory(game, index, maxPresses = 80) {
    const a = KEYS[index].a;
    for (let i = 0; i < maxPresses; i += 1) {
      const st = await game.state();
      if (!st.story?.holding) return;
      if (st.story.finished?.[index]) return;
      await game.press([a], 4);
    }
    throw new Error(`player ${index + 1} never finished the story`);
  }

  async function splitCellarOverworld(game) {
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.equal((await hero(game, 1)).world, 'overworld');
  }

  test('player two can page the grave keeper while player one is underground', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await game.openCave(GRAVE_SWORD_CAVE, 1);
    await game.step(2);
    const opened = await game.state();
    assert.equal(opened.heroes[1].world, `cave:${GRAVE_SWORD_CAVE}`);
    assert.equal(opened.dialogue, true, 'the old man should have spoken');
    assert.equal(opened.talking, 1, 'player two walked in; they are the reader');

    await game.press(['KeyZ'], 8);
    assert.equal(
      (await game.state()).dialogue,
      true,
      'player one paged player two\'s cave speech',
    );

    const y = opened.heroes[1].y;
    await game.press(['KeyI'], 16);
    assert.notEqual((await hero(game, 1)).y, y, 'the visitor should still be able to walk');

    for (let i = 0; i < 40; i += 1) {
      if (!(await game.state()).dialogue) break;
      await game.press(['KeyF'], 4);
    }
    assert.equal((await game.state()).dialogue, false, 'player two could not close the old man');
    await game.close();
  });

  test('a cave descent does not take the ally still outside', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);
    const parked = await hero(game, 0);
    const home = parked.linkRoom;

    await game.openCave(SHOP_CAVE, 1);
    const after = await game.state();
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('overworld'), 'the overworld must stay up');
    assert.equal(after.heroes[1].world, `cave:${SHOP_CAVE}`);
    assert.equal(after.heroes[0].world, 'overworld', 'player one was dragged inside');
    assert.equal(after.heroes[0].linkRoom, home);
    assert.equal(after.heroes[0].x, parked.x);
    assert.ok(
      (after.owStreamRooms ?? []).includes(home),
      `player one's screen was dropped, got ${JSON.stringify(after.owStreamRooms)}`,
    );

    await game.press(['ArrowRight'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.x > parked.x, 'player one could not walk while the ally was in a cave');
    assert.equal(walked.world, 'overworld');
    await game.close();
  });

  test('leaving a cave does not black out the ally still inside', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SHOP_CAVE, 0);
    await game.openCave(SHOP_CAVE, 1);
    assert.equal((await hero(game, 0)).world, `cave:${SHOP_CAVE}`);
    assert.equal((await hero(game, 1)).world, `cave:${SHOP_CAVE}`);

    await pose(game, 0, 0x78, 0xb0, 0x08);
    const y = (await hero(game, 0)).y;
    await game.leaveCave(1);
    const after = await game.state();
    assert.equal(after.heroes[1].world, 'overworld');
    assert.equal(after.heroes[0].world, `cave:${SHOP_CAVE}`);

    await game.press(['ArrowUp'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.y < y, 'player one could not walk in the cave');
    assert.equal(walked.world, `cave:${SHOP_CAVE}`);
    await game.close();
  });

  test('two players can stand in two different caves', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SHOP_CAVE, 0);
    await game.openCave(TAKE_ANY_CAVE, 1);
    const st = await game.state();
    assert.equal(st.heroes[0].world, `cave:${SHOP_CAVE}`);
    assert.equal(st.heroes[1].world, `cave:${TAKE_ANY_CAVE}`);
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes(`cave:${SHOP_CAVE}`));
    assert.ok(worlds.live.includes(`cave:${TAKE_ANY_CAVE}`));

    await pose(game, 0, 0x78, 0xb0, 0x08);
    await pose(game, 1, 0x78, 0xb0, 0x08);
    const before = (await game.state()).heroes;
    await game.press(['ArrowUp'], 20);
    const p1 = (await game.state()).heroes[0];
    assert.ok(p1.y < before[0].y, 'player one could not walk their shop');
    assert.equal(p1.world, `cave:${SHOP_CAVE}`);
    await game.press(['KeyI'], 20);
    const p2 = (await game.state()).heroes[1];
    assert.ok(p2.y < before[1].y, 'player two could not walk their cave');
    assert.equal(p2.world, `cave:${TAKE_ANY_CAVE}`);
    await game.close();
  });

  test('file continue restores an ally who was in a cave', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);
    await game.openCave(SHOP_CAVE, 1);
    assert.equal((await hero(game, 1)).world, `cave:${SHOP_CAVE}`);

    const slot = await game.persistSlot();
    assert.equal(slot, 0);
    await game.continuePlay(0);
    const after = await game.state();
    assert.equal(after.heroes[0].world, 'overworld', 'player one must not load into the cave');
    assert.equal(
      after.heroes[1].world,
      `cave:${SHOP_CAVE}`,
      `player two should return to the cave (world=${after.heroes[1].world})`,
    );
    const x = after.heroes[0].x;
    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > x, 'player one could not walk after continue');
    await game.close();
  });

  test('file continue restores an ally who was in a cellar', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await game.goRoom(0x7f, 0x08, 1);
    assert.ok((await hero(game, 1)).world?.startsWith('cellar:'));

    await game.persistSlot();
    await game.continuePlay(0);
    const after = await game.state();
    assert.equal(after.heroes[0].world, 'dungeon:1');
    assert.ok(
      after.heroes[1].world?.startsWith('cellar:'),
      `player two should return to the cellar (world=${after.heroes[1].world})`,
    );
    assert.notEqual(after.heroes[0].linkRoom, 0x7f, 'player one must not load onto the ladder');
    await game.close();
  });

  test('a third player can sit down in a split labyrinth and walk', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0xc0, 0x8d);
    await pose(game, 1, 0x78, 0x8d);
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(split[0].linkRoom, 0x74, 'player one should have crossed east');
    assert.equal(split[1].linkRoom, 0x73, 'player two should have stayed in $73');

    await game.page.evaluate(() => window.zeldaDebug.join(2));
    await game.step(5);
    const joined = await game.state();
    assert.equal(joined.heroes.filter((h) => h.active).length, 3);
    assert.equal(joined.heroes[2].world, 'dungeon:1');
    assert.equal(joined.heroes[2].linkRoom, 0x74, 'the joiner stands with the host');
    assert.equal(joined.heroes[1].linkRoom, 0x73, 'player two must not be yanked');

    await pose(game, 2, joined.heroes[2].x, 0x8d, 0x08);
    const down = await traceHold(game, 2, KEYS[2].down, 36);
    assert.ok(sawWalkCycle(down), 'player three slid without a walk cycle');
    assert.ok(netDelta(down, 'y') > 8, 'player three could not walk after joining');

    await game.page.evaluate(() => window.zeldaDebug.leave(2));
    await game.step(5);
    const left = await game.state();
    assert.equal(left.heroes.filter((h) => h.active).length, 2);
    assert.equal(left.heroes[0].linkRoom, 0x74);
    assert.equal(left.heroes[1].linkRoom, 0x73);
    await game.close();
  });

  test('each player cycles their own B slot', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => {
      window.zeldaDebug.selectB(0, 'boomerang');
      window.zeldaDebug.selectB(1, 'bomb');
    });
    await game.press(['Enter', 'KeyH'], 20);
    await game.step(70);
    const opened = await game.state();
    assert.equal(opened.heroes[0].menu, true);
    assert.equal(opened.heroes[1].menu, true);
    assert.equal(opened.heroes[0].menuPhase, 'open');
    assert.equal(opened.heroes[1].menuPhase, 'open');

    await game.press(['KeyX'], 4);
    await game.press(['KeyG'], 4);
    const after = await game.state();
    assert.notEqual(after.heroes[0].selectedB, 'boomerang', 'player one did not cycle');
    assert.notEqual(after.heroes[1].selectedB, 'bomb', 'player two did not cycle');
    assert.notEqual(
      after.heroes[0].selectedB,
      after.heroes[1].selectedB,
      'both seats landed on the same item',
    );
    await game.close();
  });

  test('a briefing freezes everyone until the last reader closes it', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x08);
    await pose(game, 1, 0x80, 0x8d, 0x08);
    await game.page.evaluate(() => window.zeldaDebug.briefing(1));
    await game.step(2);
    const opened = await game.state();
    assert.equal(opened.dialogue, true, 'the briefing should have opened');
    assert.equal(opened.story?.holding, true);

    const before = opened.heroes;
    await game.press(['ArrowDown'], 20);
    await game.press(['KeyK'], 20);
    const frozen = (await game.state()).heroes;
    assert.equal(frozen[0].y, before[0].y, 'player one walked during the briefing');
    assert.equal(frozen[1].y, before[1].y, 'player two walked during the briefing');

    await mashStory(game, 0);
    const mid = await game.state();
    assert.equal(mid.story?.holding, true, 'the world released before player two finished');
    assert.equal(mid.story?.finished?.[0], true);
    assert.equal(mid.story?.finished?.[1], false);
    const still = mid.heroes[1].y;
    await game.press(['KeyK'], 20);
    assert.equal((await game.state()).heroes[1].y, still, 'player two walked while still reading');

    await mashStory(game, 1);
    await game.step(40);
    const done = await game.state();
    assert.equal(done.dialogue, false);
    assert.equal(done.heroes[0].world, 'overworld', 'the briefing walks the party out');
    assert.equal(done.heroes[1].world, 'overworld');
    await game.close();
  });

  test('a candle outside does not spend the blue use in a dark cell', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await game.enterLevel(4);
    await game.dismissDialogue();
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    const parked = await hero(game, 1);
    assert.equal(parked.world, 'overworld');

    await game.goRoom(L4_DARK_ROOM, 0x08, 0);
    const dark = await game.state();
    assert.equal(dark.heroes[0].linkRoom, L4_DARK_ROOM);
    assert.equal(dark.dark, true, 'the cell should start dark');
    assert.equal(dark.heroes[1].world, 'overworld');

    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'candle'));
    await game.press(['KeyG'], 8);
    await game.page.evaluate(() => window.zeldaDebug.selectB(0, 'candle'));
    await game.press(['KeyX'], 8);
    const lit = await game.state();
    assert.equal(lit.dark, false, 'player one could not light their own cell');
    assert.equal(lit.candleLit, true);
    const y = parked.y;
    await game.press(['KeyK'], 20);
    assert.notEqual((await hero(game, 1)).y, y, 'player two could not walk outside');
    await game.close();
  });

  test('dying in a leftover room regroups on the ally still in the last cell', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0xc0, 0x8d);
    await pose(game, 1, 0x78, 0x8d);
    await game.press(['ArrowRight'], 90);
    const split = (await game.state()).heroes;
    assert.equal(split[0].linkRoom, 0x74);
    assert.equal(split[1].linkRoom, 0x73);

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    const after = await waitUntilAlive(game, 0);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].dead, false);
    assert.equal(after.heroes[0].halfHearts, 6, 'three hearts, as continue does');
    assert.equal(after.heroes[0].linkRoom, 0x73, 'player one must regroup in $73');
    assert.equal(after.heroes[1].linkRoom, 0x73);
    assert.ok(
      Math.abs(after.heroes[0].x - after.heroes[1].x) <= 2
        && Math.abs(after.heroes[0].y - after.heroes[1].y) <= 2,
      'they regrouped on the living',
    );
    const y = after.heroes[1].y;
    await game.press(['KeyK'], 20);
    assert.notEqual((await game.state()).heroes[1].y, y, 'the living kept walking');
    await game.close();
  });

  test('the ending folds split-screen back to one NES frame', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    const before = await game.page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
    assert.ok(before >= 512, `split-screen should already be wide, got ${before}`);

    await game.page.evaluate(() => window.zeldaDebug.ending());
    await game.step(2);
    const st = await game.state();
    assert.equal(st.ending, true);
    assert.equal(st.cinematic, true);
    assert.equal(st.canvasW, 256);
    const wide = await game.page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
    assert.ok(wide <= 256, `the canvas should fold to 256, got ${wide}`);
    await game.close();
  });

  test('a late cave descent stands at the mouth, not on the ally', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SHOP_CAVE, 0);
    await pose(game, 0, 0x78, 0xb0, 0x08);
    const parked = await hero(game, 0);

    await game.openCave(SHOP_CAVE, 1);
    const after = (await game.state()).heroes;
    assert.equal(after[1].world, `cave:${SHOP_CAVE}`);
    assert.equal(after[1].x, 0x78, 'south-mouth column');
    assert.equal(after[1].y, 0xb8, 'enter spawn, not on the ally');
    assert.equal(after[0].world, `cave:${SHOP_CAVE}`);
    assert.equal(after[0].x, parked.x);
    assert.equal(after[0].y, parked.y, 'player one must not be yanked to the mouth');
    assert.ok(after[1].y !== after[0].y, 'the two heroes must not overlap');

    const y = after[1].y;
    await game.press(['KeyI'], 20);
    const walked = (await game.state()).heroes[1];
    assert.equal(walked.world, `cave:${SHOP_CAVE}`);
    assert.ok(walked.y < y, 'player two could not walk in from the mouth');
    await game.close();
  });

  test('joining a live cave sits you with the host, and you can walk', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=1' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SHOP_CAVE, 0);
    await pose(game, 0, 0x78, 0xb0, 0x08);
    const host = await hero(game, 0);

    await game.page.evaluate(() => window.zeldaDebug.join(1));
    await game.step(5);
    const joined = await game.state();
    assert.equal(joined.heroes.filter((h) => h.active).length, 2);
    assert.equal(joined.heroes[1].world, `cave:${SHOP_CAVE}`);
    assert.equal(joined.heroes[1].x, host.x);
    assert.equal(joined.heroes[1].y, host.y);
    assert.equal(joined.heroes[0].world, `cave:${SHOP_CAVE}`, 'the host was yanked out');

    await pose(game, 1, host.x, 0xb0, 0x08);
    const y = (await hero(game, 1)).y;
    await game.press(['KeyI'], 20);
    const walked = await hero(game, 1);
    assert.ok(walked.y < y, 'the joiner could not walk the shop');
    assert.equal(walked.world, `cave:${SHOP_CAVE}`);
    await game.close();
  });

  test('file continue restores a host who was in a cave', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    const parked = await hero(game, 1);
    await game.openCave(SHOP_CAVE, 0);
    assert.equal((await hero(game, 0)).world, `cave:${SHOP_CAVE}`);
    assert.equal((await hero(game, 1)).world, 'overworld');

    await game.persistSlot();
    await game.continuePlay(0);
    const after = await game.state();
    assert.equal(
      after.heroes[0].world,
      `cave:${SHOP_CAVE}`,
      `host should return to the cave (world=${after.heroes[0].world})`,
    );
    assert.equal(after.heroes[1].world, 'overworld', 'player two must not load into the cave');
    assert.equal(after.heroes[1].x, parked.x);
    const x = after.heroes[1].x;
    await game.press(['KeyL'], 20);
    assert.ok((await hero(game, 1)).x > x, 'player two could not walk after continue');
    await pose(game, 0, 0x78, 0xb0, 0x08);
    const y = (await hero(game, 0)).y;
    await game.press(['ArrowUp'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.y < y, 'host could not walk the cave after continue');
    assert.equal(walked.world, `cave:${SHOP_CAVE}`);
    await game.close();
  });

  test('a labyrinth-entry beat holds the ally still outside', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);
    const parked = await hero(game, 0);

    await game.enterLevel(1, 1);
    await game.step(2);
    const opened = await game.state();
    assert.equal(opened.dialogue, true, 'the entry speech should have opened');
    assert.equal(opened.story?.holding, true);
    assert.equal(opened.heroes[1].world, 'dungeon:1');
    assert.equal(opened.heroes[0].world, 'overworld');

    await game.press(['ArrowRight'], 20);
    assert.equal((await hero(game, 0)).x, parked.x, 'player one walked during the entry speech');

    await mashStory(game, 1);
    const mid = await game.state();
    assert.equal(mid.story?.holding, true, 'the world released before player one finished');
    assert.equal(mid.story?.finished?.[1], true);
    assert.equal(mid.story?.finished?.[0], false);
    await game.press(['ArrowRight'], 20);
    assert.equal((await hero(game, 0)).x, parked.x, 'player one walked while still the last reader');

    await mashStory(game, 0);
    await game.step(5);
    const done = await game.state();
    assert.equal(done.dialogue, false);
    assert.ok(!done.story?.holding, 'the entry speech should have closed');
    assert.equal(done.heroes[0].world, 'overworld');
    assert.equal(done.heroes[1].world, 'dungeon:1');
    const x = done.heroes[0].x;
    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > x, 'player one could not walk after the speech');
    await game.close();
  });

  test('four players can occupy four different modes and each walk', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=4' });
    await game.step(10);
    await ignoreHits(game);

    await game.enterLevel(1, 2);
    await game.dismissDialogue();
    await game.enterLevel(1, 3);
    await game.goRoom(0x7f, 0x08, 3);
    await game.openCave(SHOP_CAVE, 1);
    await game.step(5);

    const st = await game.state();
    assert.equal(st.heroes.filter((h) => h.active).length, 4);
    assert.equal(st.heroes[0].world, 'overworld');
    assert.equal(st.heroes[1].world, `cave:${SHOP_CAVE}`);
    assert.equal(st.heroes[2].world, 'dungeon:1');
    assert.ok(
      st.heroes[3].world?.startsWith('cellar:'),
      `player four should be in the cellar (world=${st.heroes[3].world})`,
    );
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('overworld'));
    assert.ok(worlds.live.includes(`cave:${SHOP_CAVE}`));
    assert.ok(worlds.live.includes('dungeon:1'));
    assert.ok(worlds.live.some((id) => String(id).startsWith('cellar:')));

    await pose(game, 0, 0x70, 0x8d, 0x01);
    await pose(game, 1, 0x78, 0xb0, 0x08);
    await pose(game, 2, 0x78, 0x8d, 0x08);
    await pose(game, 3, 0x78, 0x8d, 0x08);
    const before = (await game.state()).heroes;

    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > before[0].x, 'player one could not walk the overworld');
    await game.press(['KeyI'], 20);
    assert.ok((await hero(game, 1)).y < before[1].y, 'player two could not walk the shop');
    await game.press(['Numpad8'], 20);
    assert.ok((await hero(game, 2)).y < before[2].y, 'player three could not walk the labyrinth');
    await game.press(['KeyP'], 20);
    assert.ok((await hero(game, 3)).y < before[3].y, 'player four could not walk the cellar');

    assert.equal((await hero(game, 0)).world, 'overworld');
    assert.equal((await hero(game, 1)).world, `cave:${SHOP_CAVE}`);
    assert.equal((await hero(game, 2)).world, 'dungeon:1');
    assert.ok((await hero(game, 3)).world?.startsWith('cellar:'));
    await game.close();
  });

  test('an ally keeps walking while you ride the raft', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x55, { x: 0x80, y: 0x7d, dir: 0x08 });
    const warped = await game.state();
    assert.equal(warped.roomId, 0x55, 'goOw must change the overworld anchor');
    await pose(game, 1, 0x30, 0x8d, 0x01);
    await pose(game, 0, 0x80, 0x7d, 0x08);
    let boarded = null;
    for (let i = 0; i < 20 && !boarded; i += 1) {
      await game.step(1);
      const st = await game.state();
      if (st.raft) boarded = st;
    }
    const last = boarded ?? (await game.state());
    assert.ok(
      boarded,
      `player one should have boarded the raft (room=$${last.roomId?.toString(16)} x=${last.heroes[0].x} y=${last.heroes[0].y})`,
    );
    assert.equal(boarded.raft.owner, 0);
    assert.equal(boarded.heroes[0].rafting, true);
    assert.equal(boarded.heroes[1].rafting, false);
    const y0 = boarded.heroes[0].y;
    const x1 = boarded.heroes[1].x;
    await game.press(['KeyL'], 24);
    const after = await game.state();
    assert.ok(after.heroes[1].x > x1, 'player two froze because the raft was global');
    assert.equal(after.heroes[1].rafting, false);
    assert.ok(after.raft, 'the ride should still belong to player one');
    assert.equal(after.raft.owner, 0);
    assert.ok(after.heroes[0].y <= y0, 'player one should still be scrolling on the raft');
    await game.close();
  });

  test('a leftover dark cell stays dark when the ally is in a lit room', async () => {
    // L4 `$20` (lit) east-open onto dark `$21`. `goRoom` is a hard cut of
    // the shared labyrinth, so leftover occupancy is posed, not walked.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1], 4);
    await ignoreHits(game);
    await game.goRoom(0x20);
    await pose(game, 0, 0x78, 0x8d, 0x01);
    await pose(game, 1, 0x78 + 256, 0x8d, 0x01);
    await game.step(4);
    const st = await game.state();
    assert.equal(st.heroes[0].linkRoom, 0x20, 'player one should stay in lit $20');
    assert.equal(st.heroes[0].dark, false);
    assert.equal(st.heroes[1].linkRoom, 0x21, 'player two must occupy leftover $21');
    assert.equal(st.heroes[1].dark, true, 'the leftover dark cell was painted light');
    const y = st.heroes[1].y;
    await game.press(['KeyK'], 20);
    assert.notEqual((await hero(game, 1)).y, y, 'player two could not walk the leftover cell');
    await game.close();
  });

  test('lighting a dark cell does not light a leftover dark cell', async () => {
    // L4 `$01` (dark) east-open onto dark `$02`. One `lit` flag for the
    // labyrinth used to undarken both the moment anyone used a candle.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1], 4);
    await ignoreHits(game);
    await game.goRoom(0x01);
    await pose(game, 0, 0x78, 0x8d, 0x01);
    await pose(game, 1, 0x78 + 256, 0x8d, 0x01);
    await game.step(4);
    const dark = await game.state();
    assert.equal(dark.heroes[0].linkRoom, 0x01);
    assert.equal(dark.heroes[0].dark, true);
    assert.equal(dark.heroes[1].linkRoom, 0x02);
    assert.equal(dark.heroes[1].dark, true);

    await game.page.evaluate(() => window.zeldaDebug.selectB(0, 'candle'));
    await game.press(['KeyX'], 8);
    const lit = await game.state();
    assert.equal(lit.heroes[0].dark, false, 'player one could not light their own cell');
    assert.equal(lit.heroes[1].dark, true, 'the leftover dark cell inherited the light');
    assert.equal(lit.candleLit, true);
    await game.close();
  });

  test('each split view keeps its own minimap and counters', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[0].hudMap, true, 'player one must still have a radar');
    assert.equal(views[0].hudCounters, true, 'player one must still see rupees/keys/bombs');
    assert.equal(views[1].hudMap, true, 'player two must still have a radar');
    assert.equal(views[1].hudCounters, true, 'player two must still see rupees/keys/bombs');
    assert.equal(views[0].hudMode, 'dungeon', 'the cellar view should keep the labyrinth map');
    assert.equal(views[1].hudMode, 'overworld', 'the overworld view should keep the overworld map');
    await game.close();
  });

  test("player two's sword beam still draws when an ally is in a cellar", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.equal((await hero(game, 1)).world, 'overworld');

    await pose(game, 1, 0x78, 0x8d, 0x02);
    await game.page.evaluate(() => window.zeldaDebug.refillHearts());
    await game.hold(KEYS[1].a);
    /** @type {{ id: string, shots: number, shotVisible: number }[] | null} */
    let gfx = null;
    for (let i = 0; i < 24; i += 1) {
      await game.step(1);
      gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
      const ow = gfx.find((g) => g.id === 'overworld');
      if ((ow?.shots ?? 0) >= 1) break;
    }
    await game.release();
    // New sprites default to visible; the latch showed up on the next present.
    await game.step(2);
    gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const other = gfx.filter((g) => g.id !== 'overworld');
    assert.ok((ow?.shots ?? 0) >= 1, 'player two did not fire a sword beam');
    assert.ok((ow?.shotVisible ?? 0) >= 1, 'player two must see the beam in their quadrant');
    assert.ok(
      other.every((g) => g.shotVisible === 0),
      'the cellar must not keep an overworld beam sprite',
    );
    await game.close();
  });

  test('overworld enemy shots still draw when an ally is in a cellar', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.equal((await hero(game, 1)).world, 'overworld');

    await pose(game, 1, 0x50, 0x8d, 0x01);
    const planted = await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({ player: 1, x: 0x70, y: 0x8d, kind: 0x53 }),
    );
    assert.ok(planted?.id != null);
    await game.step(2);
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const other = gfx.filter((g) => g.id !== 'overworld');
    assert.ok(ow.shots >= 1, 'the overworld still holds the rock');
    assert.ok(ow.shotVisible >= 1, 'player two must see the enemy shot in their quadrant');
    assert.ok(
      other.every((g) => g.shotVisible === 0),
      'the cellar must not keep an overworld shot sprite',
    );
    await game.close();
  });

  test('overworld drops still draw when an ally is in a cellar', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.equal((await hero(game, 1)).world, 'overworld');

    await pose(game, 1, 0x50, 0x8d, 0x01);
    const planted = await game.page.evaluate(() =>
      window.zeldaDebug.plantDrop({ player: 1, x: 0x70, y: 0x8d, itemId: 0x18 }),
    );
    assert.ok(planted?.id != null);
    await game.step(2);
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const other = gfx.filter((g) => g.id !== 'overworld');
    assert.ok(ow.drops >= 1, 'the overworld still holds the rupee');
    assert.ok(ow.dropVisible >= 1, 'player two must see the drop in their quadrant');
    assert.ok(
      other.every((g) => g.dropVisible === 0),
      'the cellar must not keep an overworld drop sprite',
    );
    const before = (await game.state()).rupees;
    await game.press(['KeyL'], 24);
    await game.step(4);
    assert.ok(
      (await game.state()).rupees > before,
      'player two should still be able to pick the drop up',
    );
    await game.close();
  });

  test('a pond fairy orbit stays in the fountain world', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));

    await pose(game, 1, 0x78, 0xad, 0x04);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x2f, x: 0x78, y: 0x7d }),
    );
    await game.step(8);
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const other = gfx.filter((g) => g.id !== 'overworld');
    assert.ok(ow.pondHearts > 0, 'the fountain should have grown orbit hearts');
    assert.ok(ow.pondVisible > 0, 'player two must see the orbit');
    assert.ok(
      other.every((g) => g.pondVisible === 0 && g.pondHearts === 0),
      'player one in the cellar must not see the fountain orbit',
    );
    await game.close();
  });

  test("player two's wood shield parries a rock", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    const before = (await hero(game, 1)).halfHearts;
    await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({
        player: 1,
        x: 0xc0,
        y: 0x8d,
        kind: 0x53,
        dir: 0x02,
        speed: 0,
      }),
    );
    await game.step(4);
    const after = await game.state();
    assert.equal(after.heroes[1].halfHearts, before, 'player two took a rock they were facing');
    const shot = (after.projectiles ?? []).find((p) => p.kind === 0x53);
    assert.ok(shot?.bouncing, 'the rock should have bounced off player two');
    await game.close();
  });

  test("player two's raft stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));
    assert.equal((await hero(game, 1)).world, 'overworld');

    await game.returnToOverworld(0x55, { x: 0x80, y: 0x7d, dir: 0x08 }, 1);
    await pose(game, 1, 0x80, 0x7d, 0x08);
    let boarded = null;
    for (let i = 0; i < 24 && !boarded; i += 1) {
      await game.step(1);
      const st = await game.state();
      if (st.heroes[1].rafting) boarded = st;
    }
    assert.ok(boarded, 'player two should have boarded the raft');
    assert.equal(boarded.raft?.owner, 1);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[1].raftVisible, true, 'player two must see their raft');
    assert.equal(views[0].raftVisible, false, 'player one in the cellar must not see the raft');
    await game.close();
  });

  test('a clock player two picks up still freezes overworld foes', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(1, 0);
    await game.dismissDialogue();
    await game.goRoom(0x7f, 0x08, 0);
    assert.ok((await hero(game, 0)).world?.startsWith('cellar:'));

    await pose(game, 1, 0x70, 0x8d, 0x01);
    const foe = await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x07, x: 0xa0, y: 0x8d }),
    );
    assert.ok(foe?.id != null);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantDrop({
        player: 1,
        x: 0x70,
        y: 0x8d,
        itemId: 0x21,
        lifetime: 0xee,
      }),
    );
    await game.step(4);
    const st = await game.state();
    assert.equal(st.clock, true, 'player two did not keep the clock');
    const frozen = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    assert.ok(
      frozen.some((e) => e.clockFrozen),
      'the overworld foes should be clock-frozen',
    );
    const x0 = frozen.find((e) => e.id === foe.id)?.x;
    await game.step(20);
    const later = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    assert.equal(later.find((e) => e.id === foe.id)?.x, x0, 'the frozen foe kept walking');
    assert.equal((await game.state()).clock, true, 'the cellar visit expired the clock');
    await game.close();
  });

  test('player two can pick up a rupee under their right foot', async () => {
    // Screenshot: P2 overlapping a 5-rupee from the left. The ROM's 9px
    // top-left box misses that, so the sprite sat there forever.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x02);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantDrop({
        player: 1,
        x: 0x70 + 12,
        y: 0x8d,
        itemId: 0x0f,
        lifetime: 0xee,
      }),
    );
    const before = (await game.state()).rupees;
    await game.step(4);
    assert.ok(
      (await game.state()).rupees > before,
      'player two was standing on the rupee and could not take it',
    );
    await game.close();
  });

  test('player two can pick up a heart on a leftover room seam', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 256 + 0xf0, 0x8d, 0x01);
    await game.step(2);
    assert.ok((await hero(game, 1)).x > 255, 'player two should be leftover east');

    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantDrop({
        player: 1,
        x: p.x,
        y: p.y,
        itemId: 0x22,
        lifetime: 0xee,
      });
    });
    const planted = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = planted.find((g) => g.id === 'overworld');
    assert.ok(ow.drops >= 1, 'the leftover heart was never planted');
    await game.step(4);
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const after = gfx.find((g) => g.id === 'overworld');
    assert.equal(after.drops, 0, 'player two could not pick the seam heart up');
    assert.equal(after.dropVisible, 0, 'the heart sprite stayed after pickup');
    await game.close();
  });

  test('player two can pick up a leftover rupee that only overlaps a foot', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 256 + 0xf0, 0x8d, 0x02);
    await game.step(2);
    assert.ok((await hero(game, 1)).x > 255, 'player two should be leftover east');

    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantDrop({
        player: 1,
        x: p.x + 12,
        y: p.y,
        itemId: 0x0f,
        lifetime: 0xee,
      });
    });
    const before = (await game.state()).rupees;
    await game.step(4);
    assert.ok(
      (await game.state()).rupees > before,
      'the leftover rupee under player two\'s foot was not taken',
    );
    await game.close();
  });

  test("player two's ladder stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantLadder({ player: 1, x: 0x80, y: 0x8d, dir: 0x01 }),
    );
    await game.page.evaluate(() => window.zeldaDebug.present());
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[1].ladderVisible, true, 'player two must see their stepladder');
    assert.equal(views[0].ladderVisible, false, 'player one in the cellar must not see the ladder');
    await game.close();
  });

  test("player two's whirlwind stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantWhirlwind({ player: 1, x: 0x40, y: 0x8d }),
    );
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[1].whirlVisible, true, 'player two must see the whirlwind');
    assert.equal(views[0].whirlVisible, false, 'player one in the cellar must not see the whirlwind');
    await game.close();
  });

  test("player two's bait stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantBait({ player: 1, x: 0x70, y: 0x8d, dir: 0x01 }),
    );
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[1].baitVisible, true, 'player two must see the bait');
    assert.equal(views[0].baitVisible, false, 'player one in the cellar must not see the bait');
    await game.close();
  });

  test("player two's bomb stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.plantBomb(1));
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.ok(views[1].bombCount > 0, 'player two must see their bomb');
    assert.equal(views[0].bombCount, 0, 'player one in the cellar must not see the overworld bomb');
    await game.close();
  });

  test("player two's boomerang stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'boomerang'));
    await game.press([KEYS[1].b], 2);
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.ok(views[1].boomVisible > 0, 'player two must see their boomerang');
    assert.equal(views[0].boomVisible, 0, 'player one in the cellar must not see the boomerang');
    await game.close();
  });

  test("player two's item lift stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.startLift(1, 0x16));
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[1].liftVisible, true, 'player two must see the held item');
    assert.equal(views[0].liftVisible, false, 'player one in the cellar must not see the lift');
    await game.close();
  });

  test('split worlds can each hold a bomb', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 0, 0x78, 0x8d, 0x01);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => {
      window.zeldaDebug.plantBomb(0);
      window.zeldaDebug.plantBomb(1);
    });
    await game.step(2);
    const st = await game.state();
    assert.ok(st.heroes[0].bombsOut > 0, 'the cellar should keep player one\'s bomb');
    assert.ok(st.heroes[1].bombsOut > 0, 'the overworld should keep player two\'s bomb');
    await game.close();
  });

  test('one world still only flies one bomb', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.plantBomb(0));
    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'bomb'));
    await game.press([KEYS[1].b], 2);
    await game.step(2);
    const st = await game.state();
    assert.equal(st.heroes[0].bombsOut, 1, 'a second bomb should not land while one is fusing');
    assert.equal(st.heroes[1].bombsOut, 1);
    await game.close();
  });

  test('a heart heals only the hero who picks it up', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => {
      window.zeldaDebug.setHearts(0, 8, 16);
      window.zeldaDebug.setHearts(1, 4, 16);
      window.zeldaDebug.plantDrop({
        player: 1,
        x: 0xc0,
        y: 0x8d,
        itemId: 0x22,
        lifetime: 0xee,
      });
    });
    await game.step(4);
    const st = await game.state();
    assert.equal(st.heroes[0].halfHearts, 8, 'player one should not drink player two\'s heart');
    assert.ok(st.heroes[1].halfHearts > 4, 'player two should heal');
    await game.close();
  });

  test("player one's wood shield still parries with an ally nearby", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x80, 0x8d, 0x01);
    await pose(game, 1, 0x30, 0x8d, 0x01);
    const before = (await hero(game, 0)).halfHearts;
    await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({
        player: 0,
        x: 0x80,
        y: 0x8d,
        kind: 0x53,
        dir: 0x02,
        speed: 0,
      }),
    );
    await game.step(4);
    const after = await game.state();
    assert.equal(after.heroes[0].halfHearts, before, 'player one took a rock they were facing');
    const shot = (after.projectiles ?? []).find((p) => p.kind === 0x53);
    assert.ok(shot?.bouncing, 'the rock should have bounced off player one');
    await game.close();
  });

  test("player two's leftover wood shield parries a rock", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 256 + 0xf0, 0x8d, 0x01);
    await game.step(2);
    assert.ok((await hero(game, 1)).x > 255, 'player two should be leftover east');
    const before = (await hero(game, 1)).halfHearts;
    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantShot({
        player: 1,
        x: p.x,
        y: p.y,
        kind: 0x53,
        dir: 0x02,
        speed: 0,
      });
    });
    await game.step(4);
    const after = await game.state();
    assert.equal(after.heroes[1].halfHearts, before, 'leftover player two took a rock they were facing');
    await game.close();
  });

  test('a facing ally parries a rock that overlaps a friend looking away', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x80, 0x8d, 0x01);
    await pose(game, 1, 0x80, 0x8d, 0x02);
    const before = (await game.state()).heroes.map((h) => h.halfHearts);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({
        player: 0,
        x: 0x80,
        y: 0x8d,
        kind: 0x53,
        dir: 0x02,
        speed: 0,
      }),
    );
    await game.step(4);
    const after = await game.state();
    assert.equal(after.heroes[0].halfHearts, before[0], 'the facing hero should parry');
    assert.equal(after.heroes[1].halfHearts, before[1], 'the rock should not hit the ally looking away');
    const shot = (after.projectiles ?? []).find((p) => p.kind === 0x53);
    assert.ok(shot?.bouncing, 'the rock should bounce when anyone overlapping can block');
    await game.close();
  });

  test('a sword beam does not hurt an ally', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0x80, 0x8d, 0x01);
    const before = (await hero(game, 1)).halfHearts;
    await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({
        player: 0,
        x: 0x80,
        y: 0x8d,
        kind: 0x57,
        dir: 0x01,
        speed: 0,
        friendly: true,
      }),
    );
    await game.step(4);
    assert.equal(
      (await hero(game, 1)).halfHearts,
      before,
      'player two should walk through player one\'s beam',
    );
    await game.close();
  });

  test('a like-like holds only the hero it grabbed', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x17, x: 0xc0, y: 0x8d }),
    );
    await game.step(3);
    const start = (await game.state()).heroes;
    await game.press(['ArrowRight'], 8);
    await game.press(['KeyL'], 4);
    const after = (await game.state()).heroes;
    assert.ok(after[0].x > start[0].x, 'player one should still walk');
    assert.ok((after[1].paralyzed ?? 0) > 0, 'player two should be held');
    assert.equal(after[1].x, start[1].x, 'player two should stay in the like-like');
    await game.close();
  });

  test("player two's leftover arrow still draws", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantShot({
        player: 1,
        x: 0x90,
        y: 0x8d,
        kind: 0x5b,
        dir: 0x01,
        friendly: true,
      }),
    );
    await game.step(2);
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const other = gfx.filter((g) => g.id !== 'overworld');
    assert.ok((ow?.shots ?? 0) >= 1, 'player two did not fire an arrow');
    assert.ok((ow?.shotVisible ?? 0) >= 1, 'player two must see the arrow in their quadrant');
    assert.ok(
      other.every((g) => g.shotVisible === 0),
      'the cellar must not keep an overworld arrow sprite',
    );
    await game.close();
  });

  test("player two's candle flame stays off player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await splitCellarOverworld(game);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'candle'));
    await game.press([KEYS[1].b], 2);
    await game.step(2);
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.ok(views[1].bombCount > 0, 'player two must see their flame');
    assert.equal(views[0].bombCount, 0, 'player one in the cellar must not see the flame');
    await game.close();
  });

  test('a leftover foe hurts only the hero it is standing on', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 256 + 0xf0, 0x8d, 0x01);
    await game.step(2);
    const before = (await game.state()).heroes.map((h) => h.halfHearts);
    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x07, x: p.x, y: p.y });
    });
    await game.step(8);
    const after = (await game.state()).heroes;
    assert.equal(after[0].halfHearts, before[0], 'player one should not take leftover contact');
    assert.ok(after[1].halfHearts < before[1], 'player two should take a hit from the leftover foe');
    await game.close();
  });
});
