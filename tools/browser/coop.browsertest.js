/**
 * Two-player play tests for the world-split cases the goldens do not cover.
 *
 * Caves, file Continue (not F9), join/leave inside a labyrinth, independent
 * B slots, story beats that hold their readers, a triforce briefing that
 * stays with the finder, leftover-room death, a far-cave exit onto a live
 * overworld (raft-island take-any vs start `$77`), the ending folding
 * split-screen back to one NES frame, and one player's words never painting
 * in another player's quadrant.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { walkIntoRoom } from './collisionHarness.js';
import { KEYS, hero, ignoreHits, netDelta, pose, sawWalkCycle, traceHold, waitUntilAlive } from './movementHarness.js';

/** Shop cave `$1d`. */
const SHOP_CAVE = 0x1d;
/** Take-any cave `$11`. */
const TAKE_ANY_CAVE = 0x11;
/** Magical sword under a gravestone — three-page old-man speech. */
const GRAVE_SWORD_CAVE = 0x13;
/** Wooden sword cave `$10` on the start screen. */
const SWORD_CAVE = 0x10;
/** Raft-island take-any (heart / potion). North of the `$3F` dock. */
const RAFT_ISLAND = 0x2f;
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

  async function mashDialogue(game, index, maxPresses = 80) {
    const a = KEYS[index].a;
    for (let i = 0; i < maxPresses; i += 1) {
      const st = await game.state();
      if (!st.heroes[index].dialogue) return;
      await game.press([a], 4);
    }
    throw new Error(`player ${index + 1} never finished the dialogue`);
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

  /**
   * Kill `deadIndex` and wait for the co-op regroup. Hits are ignored so a
   * seam that only yields to knockback fails instead of looking fixed.
   */
  async function killAndRegroup(game, deadIndex) {
    await game.page.evaluate((i) => window.zeldaDebug.kill(i), deadIndex);
    const after = await waitUntilAlive(game, deadIndex);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[deadIndex].dead, false);
    return after;
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

  test('overworld neighbours keep streaming while an ally is in a labyrinth', async () => {
    // One streamFetchGen used to make a dungeon room load cancel the
    // overworld neighbour fetch, so leftover cameras looked at black
    // between screens. $79 is east of leftover $78 and outside the start
    // screen's original stream margin.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await ignoreHits(game);
    await game.enterLevel(1, 1);
    await game.dismissDialogue();
    await game.step(5);
    assert.equal((await hero(game, 1)).world, 'dungeon:1');
    assert.equal((await hero(game, 0)).world, 'overworld');

    await pose(game, 0, 0x70, 0x8d, 0x01, 0x78);
    await game.step(8);
    await game.goRoom(0x74, 0x01, 1);
    await game.step(20);

    const st = await game.state();
    assert.equal(st.heroes[0].world, 'overworld');
    assert.equal(st.heroes[1].world, 'dungeon:1');
    const rooms = st.owStreamRooms ?? [];
    assert.ok(
      rooms.includes(0x78),
      `leftover $78 dropped, got ${JSON.stringify(rooms.map((id) => `$${id.toString(16)}`))}`,
    );
    assert.ok(
      rooms.includes(0x79),
      `east neighbour of $78 missing after a dungeon room load, got ${JSON.stringify(rooms.map((id) => `$${id.toString(16)}`))}`,
    );

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    await game.step(16);
    const dying = await game.state();
    assert.equal(dying.heroes[0].spinning, true);
    assert.ok(
      (dying.owStreamRooms ?? []).includes(0x78),
      'the death-spin dropped the overworld tiles under player one',
    );
    await game.close();
  });

  test('player two can walk into a labyrinth while player one is in a cave', async () => {
    // Shared caveLatch used to swallow leftover $37's stairs after player
    // one walked into the sword cave, and the mouth used the start screen's
    // caveId so it opened the wrong interior.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await ignoreHits(game);

    const PLAY_H = 176;
    await pose(game, 1, 0x70, 0x8d - 4 * PLAY_H, 0x08);
    await game.step(20);
    assert.equal((await hero(game, 1)).world, 'overworld');
    assert.equal((await hero(game, 1)).linkRoom, 0x37, 'player two must occupy leftover $37');

    await pose(game, 0, 0x40, 0x50, 0x08);
    await game.press(['ArrowUp'], 24);
    const inCave = await hero(game, 0);
    assert.equal(
      inCave.world,
      `cave:${SWORD_CAVE}`,
      `player one should be in the sword cave (world=${inCave.world})`,
    );

    await pose(game, 1, 0x70, 0x80 - 4 * PLAY_H, 0x08);
    await game.step(30);
    const after = await game.state();
    assert.equal(
      after.heroes[1].world,
      'dungeon:1',
      `player two froze on the overworld mouth (world=${after.heroes[1].world})`,
    );
    assert.equal(after.heroes[0].world, `cave:${SWORD_CAVE}`);
    assert.equal(after.talking, 0, 'dungeon intro stole the cave reader');
    assert.equal(after.story?.holding, true, 'labyrinth entry should have opened for player two');
    assert.equal(after.story?.finished?.[0], true, 'player one in the cave is not a story reader');
    await pose(game, 0, 0x78, 0xb0, 0x08);
    const y = (await hero(game, 0)).y;
    await game.press(['ArrowUp'], 20);
    assert.ok((await hero(game, 0)).y < y, 'player one froze for player two\'s dungeon intro');
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
    assert.equal(after.dialogue, true, 'player two leaving closed the shopkeeper');
    assert.equal(after.talking, 0, 'player one is still the reader');

    await game.press(['ArrowUp'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.y < y, 'player one could not walk in the cave');
    assert.equal(walked.world, `cave:${SHOP_CAVE}`);
    await game.close();
  });

  test('leaving the raft-island cave does not dump you on the ally\'s screen', async () => {
    // Screenshot: player two climbed out of the raft-island take-any (the
    // heart you raft to) and landed on `$77` beside player one. leaveCave's
    // join-live path copied the doorstep's local x,y onto the live stream
    // origin instead of converting, so a `$2F` mouth became those pixels
    // on the start screen.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);

    await game.openCave(SWORD_CAVE, 0);
    await game.returnToOverworld(RAFT_ISLAND, { x: 0x70, y: 0x8d, dir: 0x08 }, 1);
    await game.openCave(TAKE_ANY_CAVE, 1);
    assert.equal((await hero(game, 0)).world, `cave:${SWORD_CAVE}`);
    assert.equal((await hero(game, 1)).world, `cave:${TAKE_ANY_CAVE}`);

    // Player one climbs back onto `$77` while player two is still inside.
    // That rebuilds the live overworld under the frozen caveReturn.
    await game.leaveCave(0);
    const mid = await game.state();
    assert.equal(mid.heroes[0].world, 'overworld');
    assert.equal(mid.heroes[0].linkRoom, 0x77, 'player one must come out on the start screen');
    assert.equal(mid.heroes[1].world, `cave:${TAKE_ANY_CAVE}`);

    await game.leaveCave(1);
    const after = await game.state();
    assert.equal(after.heroes[1].world, 'overworld');
    assert.equal(
      after.heroes[1].linkRoom,
      RAFT_ISLAND,
      `player two left the island cave onto player one's screen (room=$${after.heroes[1].linkRoom?.toString(16)})`,
    );
    assert.equal(after.heroes[0].linkRoom, 0x77, 'player one was yanked to the island');
    await game.close();
  });

  test("a dungeon intro does not replace the ally's cave speech", async () => {
    // One shared box used to close the sword cave's old man when player two
    // walked out, then paint labyrinth-entry pages into the cave quadrant.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await game.step(2);
    assert.equal((await game.state()).talking, 0);
    assert.equal((await game.state()).dialogue, true, 'the old man should have spoken');

    await game.openCave(SWORD_CAVE, 1);
    await game.leaveCave(1);
    const left = await game.state();
    assert.equal(left.heroes[1].world, 'overworld');
    assert.equal(left.heroes[0].world, `cave:${SWORD_CAVE}`);
    assert.equal(left.dialogue, true, 'player two leaving closed the old man');
    assert.equal(left.talking, 0);

    await game.enterLevel(1, 1);
    await game.step(2);
    const split = await game.state();
    assert.equal(split.heroes[1].world, 'dungeon:1');
    assert.equal(split.talking, 0, 'dungeon intro stole the cave reader');
    assert.equal(split.story?.holding, true);
    assert.equal(split.story?.finished?.[0], true, 'the cave visitor is not a story reader');
    await pose(game, 0, 0x78, 0xb0, 0x08);
    const yCave = (await hero(game, 0)).y;
    await game.press(['ArrowUp'], 20);
    assert.ok((await hero(game, 0)).y < yCave, 'the cave visitor froze for the dungeon intro');

    await mashStory(game, 1);
    const afterStory = await game.state();
    assert.equal(afterStory.talking, 0);
    assert.equal(afterStory.dialogue, true, 'finishing the dungeon intro closed the old man');
    await game.close();
  });

  test('player two\'s old man speaks while player one is still reading the cave', async () => {
    // One shared box used to swallow the labyrinth NPC: player one's sword
    // cave kept textBox.active, so tryOpenPersonDialogue returned before
    // player two's old man in $41 could talk.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await game.step(2);
    assert.equal((await game.state()).heroes[0].dialogue, true, 'the cave old man should have spoken');

    await game.enterLevel(1, 1);
    await mashStory(game, 1);
    await ignoreHits(game);
    await game.goRoom(0x41, 0x08, 1);
    await pose(game, 1, 0x78, 0x8d, 0x08);
    await game.step(8);

    const st = await game.state();
    assert.equal(st.heroes[0].world, `cave:${SWORD_CAVE}`);
    assert.equal(st.heroes[0].dialogue, true, 'the cave speech must keep crawling');
    assert.equal(st.heroes[1].world, 'dungeon:1');
    assert.equal(st.heroes[1].linkRoom, 0x41, 'player two must be in the old-man cell');
    assert.equal(st.heroes[1].dialogue, true, 'the labyrinth old man should have spoken');
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.ok(views[0].dialogueText.length > 0, 'player one must still see the cave speech');
    assert.ok(views[1].dialogueText.length > 0, 'player two must see the old man');
    assert.notEqual(
      views[0].dialogueText,
      views[1].dialogueText,
      'player one painted player two\'s old-man line',
    );
    await game.close();
  });

  test('player two entering a labyrinth does not restart player one\'s overworld song', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    await ignoreHits(game);
    assert.equal((await game.state()).music, 'overworld');

    await game.enterLevel(1, 1);
    await game.step(5);
    const st = await game.state();
    assert.equal(st.heroes[0].world, 'overworld');
    assert.equal(st.heroes[1].world, 'dungeon:1');
    assert.equal(st.music, 'overworld', 'an ally underground must not cut the overworld playlist');
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

    await game.press(['ArrowRight'], 4);
    await game.press(['KeyL'], 4);
    const after = await game.state();
    assert.equal(after.heroes[0].selectedB, 'bomb', 'player one did not step right');
    assert.equal(after.heroes[1].selectedB, 'bow', 'player two did not step right');
    await game.close();
  });

  test('select cycles B without opening the submenu', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => {
      window.zeldaDebug.selectB(0, 'boomerang');
      window.zeldaDebug.selectB(1, 'bomb');
    });
    await game.press([KEYS[0].select], 4);
    await game.press([KEYS[1].select], 4);
    const after = await game.state();
    assert.equal(after.heroes[0].menu, false, 'select opened the submenu');
    assert.equal(after.heroes[1].menu, false, 'select opened player two\'s submenu');
    assert.equal(after.heroes[0].selectedB, 'bomb', 'player one did not cycle');
    assert.equal(after.heroes[1].selectedB, 'bow', 'player two did not cycle');
    await game.close();
  });

  test('a triforce briefing is only in the finder\'s quadrant', async () => {
    // An ally standing in another room of the same labyrinth used to get
    // "THE SHARD IS WARM IN YOUR HAND" — and freeze — for a pickup they
    // did not make.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x08);
    await pose(game, 1, 0x80, 0x8d, 0x08);
    await game.page.evaluate(() => window.zeldaDebug.briefing(1, 1));
    await game.step(24);
    const opened = await game.state();
    assert.equal(opened.dialogue, true, 'the briefing should have opened');
    assert.equal(opened.heroes[1].dialogue, true, 'the finder should be reading');
    assert.equal(opened.heroes[0].dialogue, false, 'player one got the finder\'s briefing');
    assert.ok(!opened.story?.holding, 'the shard briefing is not a party beat');

    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[0].dialogueText, '', 'player one painted player two\'s briefing');
    assert.equal(views[0].dialogueKind, null);
    assert.match(
      views[1].dialogueText,
      /SHARD|HAND|1 OF 8/,
      `player two should be reading the shard briefing, got ${JSON.stringify(views[1].dialogueText)}`,
    );
    assert.equal(views[1].dialogueKind, 'briefing');

    const before = opened.heroes;
    await game.press(['ArrowUp'], 20);
    const walked = (await game.state()).heroes;
    assert.notEqual(walked[0].y, before[0].y, 'player one froze for player two\'s briefing');
    assert.equal(walked[1].y, before[1].y, 'the finder walked during the briefing');

    await mashDialogue(game, 1);
    await game.step(40);
    const done = await game.state();
    assert.equal(done.dialogue, false);
    assert.equal(done.heroes[1].world, 'overworld', 'the briefing walks the finder out');
    assert.equal(done.heroes[0].world, 'dungeon:1', 'the ally was dragged out of the labyrinth');
    await game.close();
  });

  test('picking up a triforce piece does not open the briefing for the ally', async () => {
    // The ceremony path (pendingBriefingLevel → openLevelBriefing) is what
    // a real shard pickup uses. Debug.briefing covers the box routing; this
    // covers the fanfare finishing and talking only to the finder.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x1b));

    let opened = null;
    for (let i = 0; i < 80; i += 1) {
      await game.step(8);
      const st = await game.state();
      if (st.heroes[1].dialogueKind === 'briefing') {
        opened = st;
        break;
      }
    }
    assert.ok(opened, 'player two never got the shard briefing after picking it up');
    await game.step(24);
    opened = await game.state();
    assert.equal(opened.heroes[0].dialogue, false, 'player one got the finder\'s triforce text');
    assert.equal(opened.heroes[0].dialogueKind, null);
    assert.equal(opened.heroes[1].dialogue, true);
    assert.ok(!opened.story?.holding, 'the shard pickup must not start a party beat');

    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[0].dialogueText, '', 'player one painted the finder\'s triforce text');
    assert.equal(views[0].dialogueKind, null);
    assert.match(
      views[1].dialogueText,
      /SHARD|HAND|1 OF 8/,
      `player two should be reading the shard briefing, got ${JSON.stringify(views[1].dialogueText)}`,
    );

    const free = opened.heroes[0];
    await game.press(['ArrowRight'], 20);
    const walked = await hero(game, 0);
    assert.ok(walked.x > free.x, 'player one froze while player two held the shard');
    assert.equal(walked.world, 'dungeon:1');
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

  test("an ally's submenu does not redraw leftover foes from the wrong labyrinth bank", async () => {
    // Goriya tiles $B8 sit on uw127 in L2 and on the Darknut bank in L3. One
    // global sprite bank made player two's leftover L2 room look like L3
    // the moment player one opened the submenu (that capture bound L3 first).
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(2, 1);
    await game.dismissDialogue();
    await game.enterLevel(3, 0);
    await game.dismissDialogue();
    const split = await game.state();
    assert.equal(split.heroes[0].world, 'dungeon:3');
    assert.equal(split.heroes[1].world, 'dungeon:2');

    await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x05, x: 0x80, y: 0x8d }),
    );
    const before = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    assert.ok(
      before.some((e) => e.objType === 0x05),
      'the planted Goriya should be in player two\'s labyrinth',
    );

    await game.press(['Enter'], 20);
    await game.step(70);
    const opened = await game.state();
    assert.equal(opened.heroes[0].menu, true, 'player one opened the submenu');
    assert.equal(opened.heroes[1].menu, false, 'player two must keep playing');

    await game.page.evaluate(() => window.zeldaDebug.present());
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    const foes = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    const goriya = foes.find((e) => e.objType === 0x05);
    assert.ok(goriya, 'opening the submenu must not rewrite the Goriya\'s type');
    assert.equal(goriya.sheet, 'uw127', 'L2 Goriya CHR is the 1/2/7 bank, not L3 Darknuts');
    assert.equal(views[0].enemyLevel, 3, 'player one\'s capture is still L3');
    assert.equal(views[1].enemyLevel, 2, 'player two must not inherit the opener\'s bank');
    await game.close();
  });

  test("a leftover overworld keeps its sprite palette when an ally is in a labyrinth", async () => {
    // LevelInfo sprite palettes used to be one global swap. Entering L8
    // (grey stone) recoloured player one's beach Octorok to the dungeon row.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.enterLevel(8, 1);
    await game.dismissDialogue();
    const split = await game.state();
    assert.equal(split.heroes[0].world, 'overworld');
    assert.equal(split.heroes[1].world, 'dungeon:8');

    await game.page.evaluate(() =>
      window.zeldaDebug.plantFoe({ player: 0, objType: 0x07, x: 0x80, y: 0x8d }),
    );
    await game.page.evaluate(() => window.zeldaDebug.present());
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    const foes = await game.page.evaluate(() => window.zeldaDebug.foes(0));
    const octorok = foes.find((e) => e.objType === 0x07);
    assert.ok(octorok, 'the planted Octorok should be on player one\'s overworld');
    assert.equal(views[0].spritePalette, 'overworld', 'player one\'s capture stays on the OW row');
    assert.equal(views[1].spritePalette, 'level_8', 'player two must bind L8 without stealing the beach');
    assert.equal(
      octorok.spritePalette,
      'overworld',
      'the beach Octorok must not inherit the labyrinth palette',
    );
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

  test('dying onto a leftover ally rebases the overworld so they can keep walking east', async () => {
    // Player two lives in leftover $78 while player one holds $77. Copying
    // x,y on death used to leave both past the seam lip, so nobody could
    // claim the stream and $79 never loaded — look-ahead into a missing
    // grid is solid, which pins them on the right of $78.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x77, { x: 0x40, y: 0x8d, dir: 0x01 }, 0);
    await pose(game, 0, 0x40, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0xe0, 0x8d, 0x01, 0x78);
    await game.step(4);
    const split = await game.state();
    assert.equal(split.heroes[0].linkRoom, 0x77);
    assert.equal(split.heroes[1].linkRoom, 0x78);
    assert.equal(split.heroes[0].worldRoomId, 0x77, 'player one still holds the stream');

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    const after = await waitUntilAlive(game, 0);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].linkRoom, 0x78);
    assert.equal(after.heroes[1].linkRoom, 0x78);
    assert.equal(
      after.heroes[1].worldRoomId,
      0x78,
      'regroup must make $78 the stream so the east seam is real',
    );

    // Must actually change rooms. Walking 8px toward the lip used to pass
    // while leftover $78's east seam stayed solid until a knockback.
    await walkIntoRoom(game, 1, KEYS[1].right, 0x79);
    await game.close();
  });

  test('dying beside an ally on the overworld does not pin either hero', async () => {
    // Copying the living hero's tile and zeroing gridOffset used to leave
    // both mid-cell, where stepLink will not start a stride. A foe bump
    // snapped them onto the lattice and looked like it "unstuck" them.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x80, 0x8d, 0x04, 0x77);
    await pose(game, 1, 0x90, 0x8d, 0x04, 0x77);
    await game.step(4);

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    const after = await waitUntilAlive(game, 0);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].dead, false);
    assert.equal(after.heroes[0].world, 'overworld');
    assert.equal(after.heroes[1].world, 'overworld');

    const y0 = after.heroes[0].y;
    const y1 = after.heroes[1].y;
    await game.press(['ArrowDown', 'KeyK'], 24);
    const walked = (await game.state()).heroes;
    assert.ok(walked[0].y > y0 + 4, `player one stayed at y=$${y0.toString(16)}`);
    assert.ok(walked[1].y > y1 + 4, `player two stayed at y=$${y1.toString(16)}`);
    await game.close();
  });

  test('after a death warp the living player can still walk off the start screen', async () => {
    // Same-cell regroup used to leave the ally able to walk around $77 but
    // not across a seam until a $20 hit skipped the missing-grid wall.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0xe0, 0x8d, 0x01, 0x77);
    await game.step(4);

    const after = await killAndRegroup(game, 0);
    assert.equal(after.heroes[0].world, 'overworld');
    assert.equal(after.heroes[1].world, 'overworld');
    assert.equal(after.heroes[1].linkRoom, 0x77, 'the living stay on $77');

    await walkIntoRoom(game, 1, KEYS[1].right, 0x78);
    await game.close();
  });

  test('after a death warp onto player one they can still walk off the start screen', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0xe0, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0x70, 0x8d, 0x01, 0x77);
    await game.step(4);

    await killAndRegroup(game, 1);
    await walkIntoRoom(game, 0, KEYS[0].right, 0x78);
    await game.close();
  });

  test('a leftover death warp onto the host does not pin them at the next seam', async () => {
    // Player two dies in leftover $78 and copies onto player one in $77.
    // The host must still be able to leave $77 without a knockback.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x77, { x: 0xe0, y: 0x8d, dir: 0x01 }, 0);
    await pose(game, 0, 0xe0, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0x40, 0x8d, 0x02, 0x78);
    await game.step(4);
    const split = await game.state();
    assert.equal(split.heroes[0].linkRoom, 0x77);
    assert.equal(split.heroes[1].linkRoom, 0x78);

    await killAndRegroup(game, 1);
    const after = await game.state();
    assert.equal(after.heroes[0].linkRoom, 0x77);
    assert.equal(after.heroes[1].linkRoom, 0x77, 'they regrouped on the host');

    await walkIntoRoom(game, 0, KEYS[0].right, 0x78);
    await game.close();
  });

  test('the respawned hero can walk off the screen they warped onto', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0xe0, 0x8d, 0x01, 0x77);
    await game.step(4);

    await killAndRegroup(game, 0);
    await walkIntoRoom(game, 0, KEYS[0].right, 0x78);
    await game.close();
  });

  test('after a death warp the living player can walk a full screen and cross the seam', async () => {
    // Don't pose at the lip. A real regroup lands in the middle of a cell,
    // and the original player then walks to a boundary — that is the report.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x04, 0x77);
    await pose(game, 1, 0x80, 0x8d, 0x01, 0x77);
    await game.step(4);

    await killAndRegroup(game, 0);
    await walkIntoRoom(game, 1, KEYS[1].right, 0x78);
    await game.close();
  });

  test('the living player can keep crossing screens while an ally death-spins', async () => {
    // Hold right through the ~80-frame spin on leftover $78's east path.
    // The living hero will take (or sit on) the $78→$79 seam on the same
    // frames the corpse warps onto them. That used to leave the original
    // player on a leftover lip whose next grid never loaded until a
    // knockback skipped it.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x77, { x: 0x40, y: 0x8d, dir: 0x01 }, 0);
    await pose(game, 0, 0x40, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0xe0, 0x8d, 0x01, 0x78);
    await game.step(4);
    const split = await game.state();
    assert.equal(split.heroes[0].linkRoom, 0x77);
    assert.equal(split.heroes[1].linkRoom, 0x78);

    await game.hold(KEYS[1].right);
    await killAndRegroup(game, 0);
    const living = await hero(game, 1);
    if (living.linkRoom !== 0x79) {
      await walkIntoRoom(game, 1, KEYS[1].right, 0x79);
    }
    await game.release(KEYS[1].right);
    assert.equal((await hero(game, 1)).linkRoom, 0x79);
    await game.close();
  });

  test('an idle leftover on the south lip does not pin the ally\'s up/down', async () => {
    // $67's south sand gap meets $77's north gap. Player two idle 13px into
    // $77 is still on the 56px claim lip. They used to rebase south every
    // frame; player one walking up then crossed back and snapOwWalkY glued
    // both to y=$ED — left/right still worked, up/down did not, until a
    // knockback shoved someone off the lip.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x67, { x: 0x78, y: 0xed, dir: 0x08 }, 0);
    await pose(game, 0, 0x78, 0xed, 0x08, 0x67);
    await pose(game, 1, 0x78, 0x4d, 0x04, 0x77);
    await game.step(4);
    const split = await game.state();
    assert.equal(split.heroes[0].linkRoom, 0x67);
    assert.equal(split.heroes[1].linkRoom, 0x77);
    assert.equal(split.heroes[0].worldRoomId, 0x67, 'player two must not steal the stream');

    const y0 = split.heroes[0].y;
    await game.press(['ArrowUp'], 24);
    const walked = (await game.state()).heroes[0];
    assert.ok(
      walked.y < y0 - 8,
      `player one stayed glued at y=$${y0.toString(16)} (now $${walked.y.toString(16)})`,
    );
    await game.close();
  });

  test('a death warp onto the south lip still lets both heroes walk up', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x67, { x: 0x78, y: 0xed, dir: 0x08 }, 0);
    await pose(game, 0, 0x40, 0x8d, 0x04, 0x67);
    await pose(game, 1, 0x78, 0xed, 0x08, 0x67);
    await game.step(4);

    await killAndRegroup(game, 0);
    const after = await game.state();
    assert.equal(after.heroes[0].dead, false);
    assert.equal(after.heroes[1].world, 'overworld');
    const y0 = after.heroes[0].y;
    const y1 = after.heroes[1].y;
    await game.press(['ArrowUp', 'KeyI'], 24);
    const walked = (await game.state()).heroes;
    assert.ok(
      walked[0].y < y0 - 8,
      `player one stayed at y=$${y0.toString(16)}`,
    );
    assert.ok(
      walked[1].y < y1 - 8,
      `player two stayed at y=$${y1.toString(16)}`,
    );
    await game.close();
  });

  test('dying in a dungeon restarts there when the ally is on the overworld', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0xdd, 0x04);
    await pose(game, 1, 0x40, 0x8d, 0x08);
    await game.press(['ArrowDown'], 20);
    await game.step(10);
    const split = await game.state();
    assert.equal(split.heroes[0].world, 'overworld', 'player one should be outside');
    assert.equal(split.heroes[1].world, 'dungeon:1');

    await game.goRoom(0x74, 0x01, 1);
    assert.equal((await hero(game, 1)).linkRoom, 0x74);

    await game.page.evaluate(() => window.zeldaDebug.kill(1));
    const after = await waitUntilAlive(game, 1);
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].world, 'overworld', 'player one must stay on the map');
    assert.equal(after.heroes[1].world, 'dungeon:1');
    assert.equal(after.heroes[1].dead, false);
    assert.equal(after.heroes[1].halfHearts, 6, 'three hearts, as continue does');
    assert.equal(after.heroes[1].linkRoom, 0x73, 'ROM continue is the labyrinth door');
    await game.close();
  });

  test('dying on the overworld restarts at start when the ally is in a dungeon', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0xdd, 0x04);
    await pose(game, 1, 0x40, 0x8d, 0x08);
    await game.press(['ArrowDown'], 20);
    await game.step(10);
    const split = await game.state();
    assert.equal(split.heroes[0].world, 'overworld', 'player one should be outside');
    assert.equal(split.heroes[1].world, 'dungeon:1');

    await game.returnToOverworld(0x78, { x: 0x40, y: 0x8d, dir: 0x01 }, 0);
    const away = await game.state();
    assert.equal(away.heroes[0].linkRoom, 0x78, 'must die off the start screen');
    assert.equal(away.heroes[1].world, 'dungeon:1');

    await game.page.evaluate(() => window.zeldaDebug.kill(0));
    await waitUntilAlive(game, 0);
    await game.page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      let quiet = 0;
      for (let spins = 0; quiet < 10 && spins < 4000; spins += 1) {
        quiet = window.zeldaDebug.pendingLoads() > 0 ? 0 : quiet + 1;
        await tick();
      }
    });
    const after = await game.state();
    assert.equal(after.deadMenu, false, 'someone is still standing');
    assert.equal(after.heroes[0].world, 'overworld');
    assert.equal(after.heroes[0].dead, false);
    assert.equal(after.heroes[0].halfHearts, 6, 'three hearts, as continue does');
    assert.equal(after.heroes[0].linkRoom, 0x77, 'ROM continue is the start screen');
    assert.equal(after.heroes[0].x, 0x78);
    assert.equal(after.heroes[1].world, 'dungeon:1', 'the living stay in the labyrinth');

    await walkIntoRoom(game, 0, KEYS[0].right, 0x78);
    await game.close();
  });

  test('a dungeon foe does not follow a death regroup into a cave', async () => {
    // P2 died on a Stalfos in L1 while P1 was in a cave. They used to
    // teleport into the cave and leave the sprite on the shared playfield.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x2a, x: p.x, y: p.y });
    });
    await game.step(2);
    const planted = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    assert.ok(
      planted.some((e) => e.objType === 0x2a),
      'the Stalfos was never planted in the labyrinth',
    );

    await game.page.evaluate(() => window.zeldaDebug.kill(1));
    const after = await waitUntilAlive(game, 1);
    assert.equal(after.heroes[0].world, `cave:${SWORD_CAVE}`);
    assert.equal(after.heroes[1].world, 'dungeon:1', 'a dungeon death stays in that labyrinth');
    assert.equal(after.heroes[1].linkRoom, 0x73, 'ROM continue is the entrance');
    assert.equal(after.heroes[1].dead, false);
    const worlds = await game.page.evaluate(() => window.zeldaDebug.worlds());
    assert.ok(worlds.live.includes('dungeon:1'), 'the labyrinth they died in stayed loaded');
    const caveFoes = await game.page.evaluate(() => window.zeldaDebug.foes(0));
    assert.equal(
      caveFoes.some((e) => e.objType === 0x2a),
      false,
      'the Stalfos followed player two into the cave',
    );
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
    assert.equal(st.canvasH, 240);
    const wide = await game.page.evaluate(() => document.querySelector('canvas')?.width ?? 0);
    assert.ok(wide <= 256, `the canvas should fold to 256, got ${wide}`);
    const picture = await game.page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, innerW: window.innerWidth, innerH: window.innerHeight };
    });
    assert.ok(
      Math.abs(picture.w / picture.h - 256 / 240) < 0.05,
      `picture should be 256:240, got ${picture.w}×${picture.h}`,
    );
    assert.ok(
      picture.h <= picture.innerH,
      `picture clipped to the viewport: ${picture.h} > ${picture.innerH}`,
    );
    assert.ok(
      picture.w <= picture.innerW,
      `picture wider than the window: ${picture.w} > ${picture.innerW}`,
    );

    // The screenshot bug: a short window used to keep the co-op CSS height
    // and clip the vine frame off the top and bottom.
    await game.page.setViewportSize({ width: 1024, height: 360 });
    await game.page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await game.step(2);
    const short = await game.page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, innerW: window.innerWidth, innerH: window.innerHeight };
    });
    assert.ok(
      Math.abs(short.w / short.h - 256 / 240) < 0.05,
      `short window should stay 256:240, got ${short.w}×${short.h}`,
    );
    assert.ok(
      short.h <= short.innerH,
      `short window clipped the picture: ${short.h} > ${short.innerH}`,
    );
    await game.close();
  });

  test('the ending closes leftover cave speech', async () => {
    // Player two saving Zelda used to keep player one's old-man box on the
    // shared cinematic frame, so "THE SWORD IS YOURS" sat over the peace line.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await game.step(2);
    const before = await game.state();
    assert.equal(before.heroes[0].dialogue, true, 'the old man should have spoken');
    assert.equal(before.dialogue, true);

    await game.page.evaluate(() => window.zeldaDebug.ending());
    await game.step(2);
    const st = await game.state();
    assert.equal(st.ending, true);
    assert.equal(st.cinematic, true);
    assert.equal(st.dialogue, false, 'cave speech must not sit over the ending');
    assert.equal(st.heroes[0].dialogue, false);
    assert.equal(st.heroes[1].dialogue, false);
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

  test("a joiner copies player one's B slot", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=1' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.selectB(0, 'bomb'));
    const host = await game.state();
    assert.equal(host.heroes[0].selectedB, 'bomb');

    await game.page.evaluate(() => window.zeldaDebug.join(1));
    await game.step(2);
    const joined = await game.state();
    assert.equal(joined.heroes.filter((h) => h.active).length, 2);
    assert.equal(joined.heroes[1].selectedB, 'bomb', 'player two sat down with an empty B');
    assert.equal(joined.heroes[0].selectedB, 'bomb');
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

  test('a briefing does not land in the ally\'s overworld view', async () => {
    // Player two claiming a shard used to open "THE SHARD IS WARM IN YOUR
    // HAND" in every non-cave quadrant, so player one read it — and froze —
    // while still standing on the beach.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);

    await game.enterLevel(1, 1);
    await game.dismissDialogue();
    await ignoreHits(game);

    await game.page.evaluate(() => window.zeldaDebug.briefing(1, 1));
    await game.step(24);
    const opened = await game.state();
    assert.equal(opened.dialogue, true, 'the briefing should have opened');
    assert.equal(opened.heroes[1].dialogue, true, 'the finder should be reading');
    assert.equal(opened.heroes[0].dialogue, false, 'player one got the finder\'s briefing');
    assert.ok(!opened.story?.holding, 'the shard briefing is not a party beat');
    assert.equal(opened.heroes[1].world, 'dungeon:1');
    assert.equal(opened.heroes[0].world, 'overworld');

    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[0].dialogueText, '', 'player one painted player two\'s briefing');
    assert.equal(views[0].dialogueKind, null);
    assert.match(
      views[1].dialogueText,
      /SHARD|HAND|1 OF 8/,
      `player two should be reading the shard briefing, got ${JSON.stringify(views[1].dialogueText)}`,
    );
    assert.equal(views[1].dialogueKind, 'briefing');

    await pose(game, 0, 0x40, 0x8d, 0x01);
    const free = await hero(game, 0);
    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > free.x, 'player one froze for player two\'s briefing');
    assert.equal((await hero(game, 0)).world, 'overworld');
    await game.close();
  });

  test('a labyrinth-entry beat does not land in the ally\'s overworld view', async () => {
    // Player two walking into L1 used to open the Eagle dossier in every
    // non-cave quadrant, so player one read "THE AIR CHANGES ON THE FIRST
    // STAIR" — and the dungeon stub line — while still standing on the beach.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x70, 0x8d, 0x01);
    const parked = await hero(game, 0);

    await game.enterLevel(1, 1);
    await game.step(4);
    await game.press([KEYS[1].a], 4);
    await game.press([KEYS[1].a], 4);
    await game.step(2);
    const opened = await game.state();
    assert.equal(opened.dialogue, true, 'the entry speech should have opened');
    assert.equal(opened.story?.holding, true);
    assert.equal(opened.heroes[1].world, 'dungeon:1');
    assert.equal(opened.heroes[0].world, 'overworld');
    assert.equal(opened.story?.finished?.[0], true, 'player one is not a story reader');
    assert.equal(opened.story?.finished?.[1], false);

    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    assert.equal(views[0].dialogueText, '', 'player one painted player two\'s labyrinth speech');
    assert.equal(views[0].dialogueKind, null);
    assert.equal(views[0].stubText, '', 'the dungeon stub leaked into the overworld view');
    assert.match(
      views[1].dialogueText,
      /LABYRINTH|EAGLE|STAIR|SHALLOW/,
      `player two should be reading the Eagle dossier, got ${JSON.stringify(views[1].dialogueText)}`,
    );
    assert.equal(views[1].dialogueKind, 'levelEntry');
    assert.match(views[1].stubText, /^L1/, `dungeon stub missing, got ${JSON.stringify(views[1].stubText)}`);

    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > parked.x, 'player one froze for player two\'s entry speech');

    await mashStory(game, 1);
    await game.step(5);
    const done = await game.state();
    assert.equal(done.dialogue, false);
    assert.ok(!done.story?.holding, 'the entry speech should have closed');
    assert.equal(done.heroes[0].world, 'overworld');
    assert.equal(done.heroes[1].world, 'dungeon:1');
    const x = (await hero(game, 0)).x;
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
    await pose(game, 3, 0x30, 0x5d, 0x04);
    await game.step(8);
    // Player four's own box can now open on the cellar bow; one shared panel
    // used to queue that speech behind the shop and leave them free to walk.
    await game.dismissDialogue();
    const before = (await game.state()).heroes;

    await game.press(['ArrowRight'], 20);
    assert.ok((await hero(game, 0)).x > before[0].x, 'player one could not walk the overworld');
    await game.press(['KeyI'], 20);
    assert.ok((await hero(game, 1)).y < before[1].y, 'player two could not walk the shop');
    await game.press(['Numpad8'], 20);
    assert.ok((await hero(game, 2)).y < before[2].y, 'player three could not walk the labyrinth');
    await game.press(['Semicolon'], 20);
    assert.ok((await hero(game, 3)).y > before[3].y, 'player four could not walk the cellar');

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

  test('player two can raft south from the island while player one is in the sword cave', async () => {
    // Screenshot: P1 reading the sword-cave box, P2 on `$45`'s south dock.
    // Taking the raft south froze both — leftover planning used the stream
    // anchor, and `$55` loads finished as the cave.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await game.returnToOverworld(0x45, { x: 0x80, y: 0xcd, dir: 0x04 }, 1);
    await pose(game, 1, 0x80, 0xcd, 0x04);
    assert.ok((await hero(game, 0)).world?.startsWith('cave:'));
    assert.equal((await hero(game, 1)).world, 'overworld');

    let boarded = null;
    for (let i = 0; i < 48 && !boarded; i += 1) {
      await game.press([KEYS[1].down], 1);
      const st = await game.state();
      if (st.heroes[1].rafting) boarded = st;
    }
    const last = boarded ?? (await game.state());
    assert.ok(
      boarded,
      `player two should have boarded the raft south (room=$${last.heroes[1].linkRoom?.toString(16)} x=${last.heroes[1].x} y=${last.heroes[1].y} rafting=${last.heroes[1].rafting})`,
    );
    const y0 = boarded.heroes[1].y;
    await game.step(16);
    const after = await game.state();
    assert.ok(
      after.heroes[1].rafting || after.heroes[1].y !== y0,
      'the southbound ride froze after boarding',
    );
    assert.ok((await hero(game, 0)).world?.startsWith('cave:'), 'player one was pulled out of the cave');
    await game.close();
  });

  test('player two can board the dock raft while player one holds the overworld stream', async () => {
    // Screenshot: P1's submenu open, P2 standing on `$55`'s pier. The stream
    // stayed on `$77`, north-approach planning saw a dock room and bailed,
    // and tryStartRaftRide never ran against `$55`. Dying and regrouping
    // onto P2 adopted their cell — that rebase belongs on the dock trigger.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    await game.press(['Enter'], 20);
    assert.equal((await game.state()).heroes[0].menu, true, 'player one opened the submenu');
    await pose(game, 1, 0x80, 0x7d, 0x08, 0x55);
    let boarded = null;
    for (let i = 0; i < 48 && !boarded; i += 1) {
      await game.step(1);
      const st = await game.state();
      if (st.heroes[1].rafting) boarded = st;
    }
    const last = boarded ?? (await game.state());
    assert.ok(
      boarded,
      `player two should have boarded the raft (room=$${last.heroes[1].linkRoom?.toString(16)} x=${last.heroes[1].x} y=${last.heroes[1].y} rafting=${last.heroes[1].rafting} anchor=$${last.roomId?.toString(16)})`,
    );
    assert.equal(boarded.raft?.owner, 1);
    assert.equal(boarded.heroes[0].rafting, false);
    assert.equal(boarded.heroes[0].menu, true, 'player one must still be in the submenu');
    await game.close();
  });

  test('player two can raft south from the island while player one stays on the overworld', async () => {
    // Screenshot: P1 in a forest cell, P2 on `$45`'s south dock. The raft
    // SFX fired then the ride halted — leftover rebase put the stream on
    // `$55` while P1 still lived in another cell, and the dock scroll
    // either waited forever for `$45` or ran against the forest roomId.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    await pose(game, 1, 0x80, 0xcd, 0x04, 0x45);
    let boarded = null;
    for (let i = 0; i < 48 && !boarded; i += 1) {
      await game.press([KEYS[1].down], 1);
      const st = await game.state();
      if (st.heroes[1].rafting) boarded = st;
    }
    const last = boarded ?? (await game.state());
    assert.ok(
      boarded,
      `player two should have boarded south (room=$${last.heroes[1].linkRoom?.toString(16)} x=${last.heroes[1].x} y=${last.heroes[1].y} rafting=${last.heroes[1].rafting})`,
    );
    const y0 = boarded.heroes[1].y;
    await game.step(24);
    const after = await game.state();
    assert.ok(
      after.heroes[1].rafting || after.heroes[1].y !== y0,
      `the southbound ride froze after boarding (y0=${y0} y=${after.heroes[1].y} rafting=${after.heroes[1].rafting})`,
    );
    assert.equal((await hero(game, 0)).world, 'overworld', 'player one was pulled off the overworld');
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

  test('overworld foes can chase across a split-screen seam', async () => {
    // Chase bounds used to be player one's camera pad. A foe on the east
    // screen then treated the seam as a wall and never walked west to an
    // ally standing in the next quadrant.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());

    // Keep both cameras overlapping (so the pads connect) while making
    // player two the nearer chase: they stand on $77's east dirt, player
    // one a bit east of $78's center, foe on $78's west lip.
    await pose(game, 1, 0xc0, 0x8d, 0x02, 0x77);
    await pose(game, 0, 0x90, 0x8d, 0x01, 0x78);
    await game.step(8);

    const p1 = await hero(game, 0);
    const p2 = await hero(game, 1);
    assert.equal(p1.linkRoom, 0x78, 'player one should be looking at $78');
    assert.equal(p2.linkRoom, 0x77, 'player two should be looking at $77');

    const planted = await game.page.evaluate(
      ({ x, y }) => window.zeldaDebug.plantFoe({ objType: 0x08, x, y, home: 0x78 }),
      { x: p1.x + (0x18 - p1.localX), y: 0x8d },
    );
    assert.ok(planted?.id != null);
    const startX = planted.x;
    assert.ok(startX >= 256, `foe should start on $78, x=${startX}`);
    const dist2 = Math.abs(startX - p2.x);
    const dist1 = Math.abs(startX - p1.x);
    assert.ok(dist2 < dist1, `precondition: p2 should be nearer (p2=${dist2} p1=${dist1})`);

    await game.step(360);
    const after = (await game.page.evaluate(() => window.zeldaDebug.foes(0))).find(
      (e) => e.id === planted.id,
    );
    assert.ok(after, 'the octorok must still be alive');
    assert.ok(
      after.x < 256,
      `could not cross west into $77: start=${startX} now=${after.x} (p2=${p2.x})`,
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

  test("a leftover fountain ring stays with the fairy, not around player one", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0x78 + 256, 0xad, 0x04);
    await game.step(4);
    const split = (await game.state()).heroes;
    assert.notEqual(split[1].linkRoom, split[0].linkRoom, 'player two should be in the east screen');

    await game.page.evaluate((home) => {
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x2f, home, x: 0x78, y: 0x7d });
    }, split[1].linkRoom);
    await game.step(8);
    await game.page.evaluate(() => window.zeldaDebug.present());

    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    const foes = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    const fairy = foes.find((e) => e.objType === 0x2f);
    const ow = gfx.find((g) => g.id === 'overworld');
    assert.ok(fairy, 'the fountain fairy should still be in player two\'s world');
    assert.ok(ow?.pondHearts > 0, 'the fountain should have grown orbit hearts');
    for (const h of ow.pondHeartPos ?? []) {
      assert.ok(
        Math.abs(h.x - fairy.x) < 0x40 && Math.abs(h.y - fairy.y) < 0x40,
        `heart at ${h.x},${h.y} left the fairy at ${fairy.x},${fairy.y}`,
      );
    }
    const p1 = await hero(game, 0);
    assert.ok(
      Math.abs((ow.pondHeartPos?.[0]?.x ?? 0) - p1.x) > 0x20
        || Math.abs((ow.pondHeartPos?.[0]?.y ?? 0) - p1.y) > 0x20,
      'the ring sat on player one instead of the fairy',
    );
    assert.equal(views[0].pondVisible, false, 'player one must not wear the fountain ring');
    assert.equal(views[1].pondVisible, true, 'player two must see the orbit');
    await game.close();
  });

  test('a cave camera does not wear player two\'s fountain ring', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    await pose(game, 1, 0x78 + 256, 0xad, 0x04);
    await game.step(4);
    const split = (await game.state()).heroes;
    assert.ok(split[0].world?.startsWith('cave:'), 'player one should be in the cave');

    await game.page.evaluate((home) => {
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x2f, home, x: 0x78, y: 0x7d });
    }, split[1].linkRoom);
    await game.step(8);
    await game.page.evaluate(() => window.zeldaDebug.present());

    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const cave = gfx.find((g) => String(g.id).startsWith('cave:'));
    assert.equal(views[0].pondVisible, false, 'the cave camera wore the fountain ring');
    assert.equal(views[1].pondVisible, true, 'player two must see the orbit');
    assert.equal(cave?.pondVisible ?? 0, 0, 'cave item sprites must not hold the ring');
    await game.close();
  });

  test('a fountain visitor cannot be hit, and only that room freezes', async () => {
    // Knockback off Y=$AD used to interrupt the heal and leave the orbit
    // hearts stranded. Halt the visitor and freeze fountain-room foes so an
    // ally fighting elsewhere is still hittable.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0x78 + 256, 0xad, 0x04);
    await game.step(4);
    const split = (await game.state()).heroes;
    assert.notEqual(split[1].linkRoom, split[0].linkRoom, 'player two should be in the east screen');

    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await game.page.evaluate(() => {
      window.zeldaDebug.setHearts(0, 12, 12);
      window.zeldaDebug.setHearts(1, 4, 12);
    });
    const planted = await game.page.evaluate((rooms) => {
      const p1 = window.zeldaDebug.state().heroes[0];
      const p2 = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x2f, home: rooms.fountain, x: 0x78, y: 0x7d });
      const onVisitor = window.zeldaDebug.plantFoe({
        player: 1,
        objType: 0x07,
        home: rooms.fountain,
        x: p2.x,
        y: p2.y,
      });
      const walker = window.zeldaDebug.plantFoe({
        player: 1,
        objType: 0x07,
        home: rooms.fountain,
        x: p2.x + 0x28,
        y: 0x8d,
      });
      window.zeldaDebug.plantShot({
        player: 0,
        x: p1.x,
        y: p1.y,
        kind: 0x53,
        dir: 0x01,
        speed: 0,
      });
      return { onVisitor, walker };
    }, { fountain: split[1].linkRoom, ally: split[0].linkRoom });

    const before = await game.state();
    const p1Before = before.heroes[0].halfHearts;

    await game.step(12);
    await game.page.evaluate(() => window.zeldaDebug.present());

    const after = await game.state();
    const foes = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    const gfx = await game.page.evaluate(() => window.zeldaDebug.itemGfx());
    const views = await game.page.evaluate(() => window.zeldaDebug.viewGfx());
    const ow = gfx.find((g) => g.id === 'overworld');
    const walker = foes.find((e) => e.id === planted.walker.id);

    assert.ok(
      after.heroes[1].halfHearts > 4,
      'player two should keep filling instead of taking a hit',
    );
    assert.equal(
      after.heroes[1].y & 0xff,
      0xad,
      'knockback shoved player two off the pond edge',
    );
    assert.equal(walker?.x, planted.walker.x, 'the fountain-room octorok kept walking');
    assert.ok(ow?.pondHearts > 0, 'the orbit hearts vanished after the hit');
    assert.equal(views[1].pondVisible, true, 'player two must still see the orbit');
    assert.ok(
      after.heroes[0].halfHearts < p1Before,
      'player one fighting elsewhere must still be hittable',
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

  test("player two's wood shield parries an arrow", async () => {
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
        kind: 0x5b,
        dir: 0x02,
        speed: 0,
      }),
    );
    await game.step(4);
    const after = await game.state();
    assert.equal(after.heroes[1].halfHearts, before, 'player two took an arrow they were facing');
    const shot = (after.projectiles ?? []).find((p) => p.kind === 0x5b);
    assert.ok(shot?.bouncing, 'the arrow should have bounced off player two');
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

  test('a leftover overworld clock expires when that player leaves the screen', async () => {
    // InvClock used to be world-scoped. A leftover picker walking off $78
    // kept invuln across the map until an ally on $77 took a hit.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(0x77, { x: 0x40, y: 0x8d, dir: 0x01 }, 0);
    await pose(game, 0, 0x40, 0x8d, 0x01, 0x77);
    await pose(game, 1, 0x70, 0x8d, 0x01, 0x78);
    await game.step(4);
    assert.equal((await hero(game, 0)).linkRoom, 0x77);
    assert.equal((await hero(game, 1)).linkRoom, 0x78);
    assert.equal((await hero(game, 0)).worldRoomId, 0x77, 'player one still holds the stream');

    const p2 = await hero(game, 1);
    await game.page.evaluate(({ x, y, home }) => {
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x07, x: x + 0x30, y, home });
      window.zeldaDebug.plantDrop({ player: 1, x, y, itemId: 0x21, lifetime: 0xee });
    }, { x: p2.x, y: p2.y, home: 0x78 });
    await game.step(4);
    const held = await game.state();
    assert.equal(held.clock, true, 'player two did not keep the clock');
    assert.ok((held.heroes[1].invuln ?? 0) >= 7, 'the picker should be clock-invulnerable');
    const frozen = await game.page.evaluate(() => window.zeldaDebug.foes(1));
    assert.ok(
      frozen.some((e) => e.clockFrozen),
      'the leftover screen foes should be clock-frozen',
    );

    await game.page.evaluate(() => {
      window.zeldaDebug.cheats.invincible = false;
    });
    const p1 = await hero(game, 0);
    const heartsBefore = p1.halfHearts;
    await game.page.evaluate(({ x, y }) => {
      window.zeldaDebug.plantFoe({ player: 0, objType: 0x07, x, y, home: 0x77 });
    }, { x: p1.x, y: p1.y });
    let hurt = null;
    for (let i = 0; i < 16 && !hurt; i += 1) {
      await game.step(1);
      const st = await game.state();
      if (st.heroes[0].halfHearts < heartsBefore) hurt = st;
    }
    assert.ok(hurt, 'player one should be able to take a hit on the other screen');
    assert.equal(hurt.clock, true, 'hurting player one expired the leftover clock');
    assert.ok(
      (hurt.heroes[1].invuln ?? 0) >= 7,
      'player two should still be clock-invulnerable on the pickup screen',
    );

    await pose(game, 1, 0x70, 0x8d, 0x01, 0x79);
    await game.step(4);
    const left = await game.state();
    assert.equal(left.heroes[1].linkRoom, 0x79);
    assert.equal(left.clock, false, 'leaving the pickup screen should expire the clock');
    await game.step(10);
    assert.equal((await hero(game, 1)).invuln, 0, 'clock invuln must not follow them to the next screen');
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

  test('player two can pick up a fresh drop without the NES wait', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() =>
      window.zeldaDebug.plantDrop({
        player: 1,
        x: 0xc0,
        y: 0x8d,
        itemId: 0x0f,
      }),
    );
    const before = (await game.state()).rupees;
    await game.step(8);
    assert.ok(
      (await game.state()).rupees > before,
      'player two had to wait out the solo pickup delay',
    );
    await game.close();
  });

  test("player two's leftover fairy is not yanked onto player one's screen", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 256 + 0xf0, 0x8d, 0x01);
    await game.step(2);
    assert.ok((await hero(game, 1)).x > 255, 'player two should be leftover east');
    await game.page.evaluate(() => {
      window.zeldaDebug.setHearts(1, 4, 16);
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantDrop({
        player: 1,
        x: p.x,
        y: p.y,
        itemId: 0x23,
        lifetime: 0xee,
      });
    });
    await game.step(8);
    assert.ok(
      (await hero(game, 1)).halfHearts > 4,
      'the leftover fairy flew onto player one\'s camera instead of staying with player two',
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

  test('player two can play the recorder while player one is in a cave', async () => {
    // Debug kit already owns the triforce. Playing the recorder used the
    // stream-anchor room (the cave mouth) and then kept stepping cave
    // warps / seam crosses while the tornado flew, which froze the ticker
    // when getImageData or enterLevel threw.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await game.openCave(TAKE_ANY_CAVE, 0);
    await pose(game, 1, 0x70, 0x8d, 0x01);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.flute = 1;
      window.zeldaDebug.selectB(1, 'flute');
    });
    const before = await game.page.evaluate(() => window.zeldaDebug.probe().frame);
    await game.press([KEYS[1].b], 2);
    await game.step(8);
    assert.equal(game.pageErrors.length, 0, game.pageErrors.join('\n'));
    const mid = await game.state();
    assert.equal(mid.heroes[0].world, `cave:${TAKE_ANY_CAVE}`);
    assert.equal(mid.heroes[1].world, 'overworld', 'the recorder swallowed player two');
    const y = mid.heroes[0].y;
    await game.press(['ArrowUp'], 16);
    assert.notEqual((await hero(game, 0)).y, y, 'player one froze in the cave');
    await game.step(130);
    assert.equal(game.pageErrors.length, 0, game.pageErrors.join('\n'));
    const after = await game.state();
    assert.equal(after.heroes[0].world, `cave:${TAKE_ANY_CAVE}`);
    assert.equal(
      after.heroes[1].world,
      'dungeon:1',
      `player two should have ridden the whirlwind (world=${after.heroes[1].world})`,
    );
    const later = await game.page.evaluate(() => window.zeldaDebug.probe().frame);
    assert.ok(later > before + 8, 'the sim stopped advancing');
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

  test("player two's wood shield still works if they turn onto a rock this frame", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await pose(game, 0, 0x30, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x02);
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
    await game.press([KEYS[1].right], 4);
    const after = await game.state();
    assert.equal(
      after.heroes[1].halfHearts,
      before,
      'player two took a rock they turned to face this frame',
    );
    const shot = (after.projectiles ?? []).find((p) => p.kind === 0x53);
    assert.ok(shot?.bouncing, 'the rock should bounce after player two turns into it');
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

  test("player two's leftover candle burns $47's tree", async () => {
    // Screenshot: player one on another OW cell, player two on the $47
    // beach lighting the orange bush. Reveal used the stream anchor's
    // secret list, so leftover fire never opened the stairs.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01, 0x77);
    // Sand just north of square (7,11), facing down into the bush.
    await pose(game, 1, 11 * 16, 0x40 + 6 * 16 + 13, 0x04, 0x47);
    await game.step(12);
    const posed = await game.state();
    assert.equal(posed.heroes[0].linkRoom, 0x77, 'player one should hold start $77 as the anchor');
    assert.equal(posed.heroes[1].linkRoom, 0x47, 'player two must occupy leftover $47');
    const ready = await game.page.evaluate(() => window.zeldaDebug.squares(0x47));
    assert.ok(ready, '$47 never streamed in under player two');

    await game.page.evaluate(() => window.zeldaDebug.selectB(1, 'candle'));
    await game.press([KEYS[1].b], 2);
    await game.step(24);
    const revealed = await game.page.evaluate(() => window.zeldaDebug.revealed());
    const probe = await game.page.evaluate(() => {
      const h = window.zeldaDebug.state().heroes[1];
      return window.zeldaDebug.owSecretProbe(h.x, h.y);
    });
    assert.ok(
      revealed.includes('71:7:11'),
      `leftover $47 burn did not reveal stairs (revealed=${JSON.stringify(revealed)} probe=${JSON.stringify(probe)})`,
    );
    const squares = await game.page.evaluate(() => window.zeldaDebug.squares(0x47));
    const row7 = squares?.[7]?.split(' ') ?? [];
    assert.equal(row7[11], '70', `$47 col 11 should be stairs, got ${row7[11]}`);
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

  test("player two defeating a leftover boss opens that room's shutter", async () => {
    // Room-clear used the streaming anchor. Player two killing Aquamentus
    // in leftover L1 `$35` left the east triforce shutter shut and hid the
    // heart container.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1], 1);
    await ignoreHits(game);
    await game.goRoom(0x45);
    await pose(game, 0, 0x78, 0x8d, 0x08);
    await pose(game, 1, 0x78, 0x8d - 176, 0x08);
    await game.step(4);
    const posed = await game.state();
    assert.equal(posed.heroes[0].linkRoom, 0x45, 'player one should hold south $45 as the anchor');
    assert.equal(posed.heroes[1].linkRoom, 0x35, 'player two must occupy leftover $35');
    assert.equal(
      (posed.doors ?? []).includes('53:east'),
      false,
      'the east shutter must start shut',
    );

    await game.page.evaluate(() => {
      const p = window.zeldaDebug.state().heroes[1];
      window.zeldaDebug.plantFoe({ player: 1, objType: 0x07, x: p.x, y: p.y, home: 0x35 });
    });
    await game.step(2);
    const blocked = await game.state();
    const leftoverFoes = await game.page.evaluate(() =>
      window.zeldaDebug.foes(1).filter((e) => e.home === 0x35),
    );
    assert.ok(leftoverFoes.length >= 1, 'the leftover foe was never planted');
    assert.equal(
      (blocked.doors ?? []).includes('53:east'),
      false,
      'the east shutter opened before the leftover foe died',
    );

    await game.page.evaluate(() => window.zeldaDebug.killScreen());
    await game.step(1);
    const sliding = await game.state();
    assert.equal(
      (sliding.doors ?? []).includes('53:east'),
      false,
      'the east shutter must stay solid while it slides',
    );
    assert.ok(
      (sliding.shutterAnims ?? []).some(
        (a) => a.roomId === 0x35 && a.side === 'east' && a.kind === 'open',
      ),
      `shutter slide never started (${JSON.stringify(sliding.shutterAnims)})`,
    );

    await game.step(10);
    const after = await game.state();
    assert.ok(
      after.doors.includes('53:east'),
      `leftover $35 east shutter stayed shut (open=${(after.doors ?? []).join(',')})`,
    );
    assert.equal((after.shutterAnims ?? []).length, 0, 'the slide should have finished');
    assert.ok(
      (after.clearedRooms ?? []).includes(0x35),
      'leftover $35 was not marked cleared',
    );
    assert.ok(
      (after.floorItems ?? []).some((it) => it.roomId === 0x35 && it.type === 0x1a),
      'the leftover heart container never appeared',
    );
    await game.close();
  });

  test("player two collecting a leftover key flags the room taken", async () => {
    // Same path as map / compass / bow / heart container: the floor item
    // belongs to the leftover cell. Taking it used to grant the bag without
    // hiding the sprite or recording takenItems, so keys kept incrementing.
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0x40 + 256, 0x8d, 0x01);
    await game.step(4);
    const posed = await game.state();
    assert.equal(posed.heroes[0].linkRoom, 0x73, 'player one should hold the $73 anchor');
    assert.equal(posed.heroes[1].linkRoom, 0x74, 'player two must occupy leftover $74');

    const before = posed.keys;
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x19));
    await game.step(8);
    const taken = await game.state();
    assert.equal(taken.keys, before + 1, `keys ${before} → ${taken.keys}`);
    assert.equal(
      (taken.heroes[1].floorItems ?? []).some((it) => it.type === 0x19),
      false,
      'leftover $74 still shows the key',
    );
    assert.ok(
      (taken.heroes[1].takenRooms ?? []).includes(0x74),
      `takenRooms=${(taken.heroes[1].takenRooms ?? []).join(',')}`,
    );
    await game.step(16);
    assert.equal((await game.state()).keys, before + 1, 'a second touch granted another key');
    await game.close();
  });

  test("player two's dungeon key stays taken while player one is in a cave", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await game.openCave(SWORD_CAVE, 0);
    // Stay in the entrance — $74's ROM key sits at $C0 and would race the
    // placed item for takenItems. Left-side tile is empty.
    await pose(game, 1, 0x40, 0x8d, 0x01);

    const before = (await game.state()).keys;
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x19));
    await game.step(8);
    const taken = await game.state();
    assert.equal(taken.heroes[0].world, `cave:${SWORD_CAVE}`);
    assert.equal(taken.heroes[1].linkRoom, 0x73);
    assert.equal(taken.keys, before + 1, `keys ${before} → ${taken.keys}`);
    assert.equal(
      (taken.heroes[1].floorItems ?? []).some((it) => it.type === 0x19),
      false,
      'player two still sees the key from their dungeon world',
    );
    assert.ok(
      (taken.heroes[1].takenRooms ?? []).includes(0x73),
      `takenRooms=${(taken.heroes[1].takenRooms ?? []).join(',')}`,
    );

    // Hard-load wipes the live roomItems map. takenItems must hide the
    // replacement, or walking out and back (or goRoom) respawns the key.
    await game.goRoom(0x73, 0x08, 1);
    await pose(game, 1, 0x40, 0x8d, 0x01);
    await game.step(8);
    const back = await game.state();
    assert.equal(back.keys, before + 1, 'reloading $73 granted the key again');
    assert.equal(
      (back.heroes[1].floorItems ?? []).some((it) => it.type === 0x19),
      false,
      'the floor key came back after a hard room load',
    );
    await game.close();
  });

  test('player two collecting a leftover compass hides it for good', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0x40 + 256, 0x8d, 0x01);
    await game.step(4);
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x16));
    await game.step(8);
    const after = await game.state();
    assert.equal(
      (after.heroes[1].floorItems ?? []).some((it) => it.type === 0x16),
      false,
      'the leftover compass sprite stayed on the floor',
    );
    assert.ok((after.heroes[1].takenRooms ?? []).includes(0x74));
    await game.step(16);
    assert.equal(
      ((await game.state()).heroes[1].floorItems ?? []).some((it) => it.type === 0x16),
      false,
      'the compass reappeared under player two',
    );
    await game.close();
  });

  test('player two dying does not restart the song while player one is alive', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(10);
    const before = await game.state();
    assert.equal(before.music, 'overworld');
    const gen = before.musicGen;
    await game.page.evaluate(() => window.zeldaDebug.kill(1));
    await game.step(8);
    const dying = await game.state();
    assert.equal(dying.heroes[1].dead, true);
    assert.equal(dying.heroes[1].spinning, true, 'they spin before regrouping');
    assert.equal(dying.deadMenu, false);
    assert.equal(dying.music, 'overworld', 'the dying tune cut the song');
    assert.equal(dying.musicGen, gen, 'the dying tune restarted the song');
    const after = await waitUntilAlive(game, 1);
    assert.equal(after.music, 'overworld');
    assert.equal(after.musicGen, gen, 'respawn restarted the song');
    await game.close();
  });

  test('collecting a compass does not restart dungeon music', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.step(8);
    const before = await game.state();
    assert.equal(before.music, 'underworld');
    const gen = before.musicGen;
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x16));
    await game.step(8);
    const after = await game.state();
    assert.equal(
      (after.heroes[1].floorItems ?? []).some((it) => it.type === 0x16),
      false,
      'player two should have picked up the compass',
    );
    assert.equal(after.music, 'underworld', 'the compass cut the dungeon song');
    assert.equal(after.musicGen, gen, 'the compass restarted the dungeon song');
    await game.close();
  });

  test("player two's triforce piece refills player two", async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, 0x01);
    await pose(game, 1, 0xc0, 0x8d, 0x01);
    await game.page.evaluate(() => {
      window.zeldaDebug.setHearts(0, 3, 6);
      window.zeldaDebug.setHearts(1, 2, 6);
    });
    await game.page.evaluate(() => window.zeldaDebug.placeRoomItem(1, 0x1b));
    await game.step(8);
    assert.equal((await hero(game, 1)).halfHearts, 2, 'the shard healed before the ceremony');
    await game.step(400);
    const after = await game.state();
    assert.equal(after.heroes[1].halfHearts, 6, 'player two was not refilled');
    assert.equal(after.heroes[0].halfHearts, 3, 'player one was filled instead of the finder');
    await game.close();
  });
});
