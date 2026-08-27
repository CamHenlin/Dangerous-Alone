/**
 * Push-block play tests: sliding dungeon blocks (stairs / shutters) and
 * overworld graves that slide off a warp. Collision around the sprite must
 * stay flush — Link walking through the block was the "funny" overlap.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { DIR } from '../shared/collision.js';
import { GRAVE_PUSH_HOLD } from '../shared/owSecrets.js';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import {
  parkLeftover,
  quietOccupyingRoom,
  quietWorld,
  recordStops,
} from './collisionHarness.js';
import { KEYS, hero, pose } from './movementHarness.js';

/** Magic-sword grave (Q1). Square row 5 col 9 → ($90, $90); dest is one square north. */
const GRAVE_ROOM = 0x21;
const GRAVE_HOST = 0x22;
const GRAVE_ORIGIN = Object.freeze({ x: 0x90, y: 0x90 });
const GRAVE_DEST = Object.freeze({ x: 0x90, y: 0x80 });
/** Mountain bracelet-rock (Q1). Origin ($80,$90); shortcut stairs ($90,$90). */
const ROCK_ROOM = 0x79;
const ROCK_ORIGIN = Object.freeze({ x: 0x80, y: 0x90 });
const ROCK_SHOVE_Y = ROCK_ORIGIN.y + 5;
/**
 * Flush south of the grave without standing on it (hotspot y+$0B → $A0 sand).
 * $98 walks into the square during the hold; when it becomes stairs, the cave
 * swallows Link before dest collision can be probed.
 */
const GRAVE_SHOVE_Y = GRAVE_ORIGIN.y + 5;

/** Exact hold — one extra UP frame walks onto the new stairs. */
const GRAVE_SHOVE_FRAMES = GRAVE_PUSH_HOLD;

describe('push-block collision play', { concurrency: false }, () => {
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
   * @param {number} [level]
   * @param {number} [room]
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

  test('L1 $42: Link stays flush with the sliding block and dest is solid', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    await enterLabyrinth(game);
    await game.goRoom(0x42);
    await quietOccupyingRoom(game);
    await pose(game, 0, 0x60, 0x8d, DIR.RIGHT);

    await game.hold(KEYS[0].right);
    let overlapped = false;
    for (let i = 0; i < 50; i += 1) {
      await game.step(1);
      const st = await game.state();
      const block = (st.pushBlocks ?? []).find((b) => b.roomId === 0x42);
      const h = st.heroes[0];
      if (block && h.localX + 16 > block.x + 1) {
        overlapped = true;
        break;
      }
      if (block?.complete) break;
    }
    await game.release(KEYS[0].right);
    await game.step(8);

    const after = await game.state();
    const block = (after.pushBlocks ?? []).find((b) => b.roomId === 0x42);
    assert.ok(block, 'L1 $42 must keep a push block');
    assert.equal(block.complete, true);
    assert.equal(block.x, 0x80);
    assert.equal(overlapped, false, 'Link walked into the sliding block');

    const destStops = await recordStops(
      game,
      0,
      [
        { x: 0x60, y: 0x8d, room: 0x42 },
        { x: 0x90, y: 0x8d, room: 0x42 },
      ],
      ['right', 'left'],
    );
    await game.close();

    const fromWest = destStops[0].stops.right.end.x;
    const fromEast = destStops[1].stops.left.end.x;
    assert.equal(fromWest, 0x70, `dest left-stop x=$${fromWest.toString(16)}`);
    assert.equal(fromEast, 0x90, `dest right-stop x=$${fromEast.toString(16)}`);
  });

  test('L7 $0d: dest block and stairs stay on their own squares', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    await enterLabyrinth(game, [], 7);
    const entered = await game.state();
    assert.equal(entered.mode, 'dungeon', 'enterLevel(7) must drop into a labyrinth');
    await game.goRoom(0x0d);
    await game.step(8);
    const here = await game.state();
    assert.equal(
      here.roomId,
      0x0d,
      `wanted L7 $0d, still $${Number(here.roomId).toString(16)}`,
    );
    await quietOccupyingRoom(game);
    await pose(game, 0, 0xb0, 0x8d, DIR.RIGHT);
    await game.press([KEYS[0].right], 50);

    const after = await game.state();
    const block = (after.pushBlocks ?? []).find((b) => b.roomId === 0x0d);
    assert.ok(block?.complete, 'L7 $0d block must complete');
    assert.equal(block.x, 0xd0);

    const stops = await recordStops(
      game,
      0,
      [
        { x: 0xc0, y: 0x8d, room: 0x0d },
        { x: 0xc8, y: 0x9d, room: 0x0d },
      ],
      ['right', 'up'],
    );
    await game.close();

    assert.ok(
      stops[0].stops.right.end.x <= 0xc0,
      `walking right into dest overlapped (x=$${stops[0].stops.right.end.x.toString(16)})`,
    );
    assert.ok(
      stops[1].stops.up.end.y >= 0x90,
      `walking up beside dest clipped through (y=$${stops[1].stops.up.end.y.toString(16)})`,
    );
  });

  test('OW $21: pushed grave stays solid north of the warp', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    await game.returnToOverworld(GRAVE_ROOM, { x: 0x78, y: 0x8d, dir: DIR.UP });
    await quietWorld(game);
    await pose(game, 0, GRAVE_ORIGIN.x, GRAVE_SHOVE_Y, DIR.UP, GRAVE_ROOM);
    await game.press([KEYS[0].up], GRAVE_SHOVE_FRAMES);
    await game.step(4);

    const after = await game.state();
    assert.equal(after.mode, 'overworld', 'holding UP after the shove must not enter the cave');
    await quietWorld(game);

    const destStops = await recordStops(
      game,
      0,
      [
        { x: GRAVE_DEST.x - 0x20, y: 0x7d, room: GRAVE_ROOM },
        { x: GRAVE_DEST.x + 0x20, y: 0x7d, room: GRAVE_ROOM },
      ],
      ['right', 'left'],
    );
    await game.close();

    const fromWest = destStops[0].stops.right.end.x;
    const fromEast = destStops[1].stops.left.end.x;
    assert.equal(
      fromWest,
      GRAVE_DEST.x - 0x10,
      `grave dest left-stop x=$${fromWest.toString(16)}`,
    );
    assert.equal(
      fromEast,
      GRAVE_DEST.x + 0x10,
      `grave dest right-stop x=$${fromEast.toString(16)}`,
    );
  });

  test('OW $79: shoved rock leaves stairs in the shortcut gap', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    await game.page.evaluate(() => {
      window.zeldaDebug.inv.bracelet = 1;
    });
    await game.returnToOverworld(ROCK_ROOM, { x: 0x78, y: 0x8d, dir: DIR.UP });
    await quietWorld(game);
    await pose(game, 0, ROCK_ORIGIN.x, ROCK_SHOVE_Y, DIR.UP, ROCK_ROOM);
    await game.press([KEYS[0].up], GRAVE_SHOVE_FRAMES);
    await game.step(4);

    const after = await game.state();
    assert.equal(after.mode, 'overworld', 'shove must not swallow Link into the cave');
    const squares = await game.page.evaluate((id) => window.zeldaDebug.squares(id), ROCK_ROOM);
    await game.close();

    assert.ok(Array.isArray(squares), '$79 collision squares must be loaded');
    const row = String(squares[5] ?? '').split(' ');
    assert.equal(row[8], '26', 'origin must become sand, not stairs');
    assert.equal(row[9], '70', 'stairs belong in the $90,$90 gap east of the rock');
  });

  test('leftover $21 grave dest matches solo after a push', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await soloGame.returnToOverworld(GRAVE_ROOM, { x: 0x78, y: 0x8d, dir: DIR.UP });
    await quietWorld(soloGame);
    await pose(soloGame, 0, GRAVE_ORIGIN.x, GRAVE_SHOVE_Y, DIR.UP, GRAVE_ROOM);
    await soloGame.press([KEYS[0].up], GRAVE_SHOVE_FRAMES);
    await soloGame.step(4);
    assert.equal((await soloGame.state()).mode, 'overworld');
    await quietWorld(soloGame);
    const solo = await recordStops(
      soloGame,
      0,
      [{ x: GRAVE_DEST.x - 0x20, y: 0x7d, room: GRAVE_ROOM }],
      ['right'],
    );
    await soloGame.close();

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, GRAVE_ROOM, GRAVE_HOST);
    await pose(party, 1, GRAVE_ORIGIN.x, GRAVE_SHOVE_Y, DIR.UP, GRAVE_ROOM);
    await party.step(4);
    assert.equal((await hero(party, 1)).linkRoom, GRAVE_ROOM);
    // Player one's idle step used to `gravePushHold.clear()` and zero this shove.
    await party.press([KEYS[1].up], GRAVE_SHOVE_FRAMES);
    await party.step(4);
    assert.equal((await party.state()).mode, 'overworld');
    await quietWorld(party);
    const leftover = await recordStops(
      party,
      1,
      [{ x: GRAVE_DEST.x - 0x20, y: 0x7d, room: GRAVE_ROOM }],
      ['right'],
    );
    await party.close();

    const dx = Math.abs(leftover[0].stops.right.end.x - solo[0].stops.right.end.x);
    assert.ok(
      dx <= 1,
      `leftover dest stop x=$${leftover[0].stops.right.end.x.toString(16)} `
        + `vs solo $${solo[0].stops.right.end.x.toString(16)}`,
    );
  });
});
