/**
 * Stepladder play tests. L5 `$26` is a one-square water moat whose east and
 * west banks sit on BoundByRoom / doorway lips — the same room that looked
 * like "the ladder just will not come out" in play.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { DIR } from '../shared/collision.js';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { quietWorld } from './collisionHarness.js';
import { KEYS, hero, pose } from './movementHarness.js';

const L5_MOAT = 0x26;

/**
 * @param {Awaited<ReturnType<typeof openGame>>} game
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {string} key
 * @param {(h: { x: number, y: number, gridOffset: number, linkRoom: number }) => boolean} arrived
 * @param {number} [max]
 */
async function walkHeld(game, x, y, dir, key, arrived, max = 160) {
  await pose(game, 0, x, y, dir);
  await game.step(2);
  await game.hold(key);
  let sawLadder = false;
  for (let i = 0; i < max; i += 1) {
    await game.step(1);
    const st = await game.state();
    if (st.ladder) sawLadder = true;
    const h = st.heroes[0];
    if (arrived(h) && h.gridOffset === 0) break;
  }
  await game.release(key);
  await game.step(2);
  const end = await hero(game, 0);
  return { end, sawLadder };
}

describe('stepladder play', { concurrency: false }, () => {
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
   * @param {(game: Awaited<ReturnType<typeof openGame>>) => Promise<void>} fn
   */
  async function inL5Moat(fn) {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    await game.enterLevel(5);
    await game.dismissDialogue();
    await game.goRoom(L5_MOAT);
    await quietWorld(game);
    await game.step(4);
    try {
      await fn(game);
    } finally {
      await game.close();
    }
  }

  test('L5 $26: ladder crosses the west moat onto the island', async () => {
    await inL5Moat(async (game) => {
      const { end, sawLadder } = await walkHeld(
        game,
        0x21,
        0x8d,
        DIR.RIGHT,
        KEYS[0].right,
        (h) => h.x >= 0x40 && h.x < 0xb0,
      );
      assert.equal(end.linkRoom, L5_MOAT);
      assert.ok(sawLadder, 'stepladder must deploy on the west water');
      assert.ok(
        end.x >= 0x40 && end.x < 0xb0,
        `expected the island, stopped at $${end.x.toString(16)},$${end.y.toString(16)} room=$${end.linkRoom.toString(16)}`,
      );
    });
  });

  test('L5 $26: ladder crosses the east moat off the island', async () => {
    await inL5Moat(async (game) => {
      const { end, sawLadder } = await walkHeld(
        game,
        0xb0,
        0x8d,
        DIR.RIGHT,
        KEYS[0].right,
        (h) => h.x >= 0xd0 && h.x < 0xe0,
      );
      assert.equal(end.linkRoom, L5_MOAT);
      assert.ok(sawLadder, 'stepladder must deploy on the east water');
      assert.ok(
        end.x >= 0xd0 && end.x < 0xe0,
        `expected the east bank, stopped at $${end.x.toString(16)},$${end.y.toString(16)} room=$${end.linkRoom.toString(16)}`,
      );
    });
  });

  test('L5 $26: ladder crosses back from the east door lip', async () => {
    await inL5Moat(async (game) => {
      const { end, sawLadder } = await walkHeld(
        game,
        0xd0,
        0x8d,
        DIR.LEFT,
        KEYS[0].left,
        (h) => h.x <= 0xb0 && h.x >= 0x40,
      );
      assert.equal(end.linkRoom, L5_MOAT);
      assert.ok(sawLadder, 'stepladder must deploy from the east BoundByRoom lip');
      assert.ok(
        end.x <= 0xb0 && end.x >= 0x40,
        `expected the island, stopped at $${end.x.toString(16)},$${end.y.toString(16)} room=$${end.linkRoom.toString(16)}`,
      );
    });
  });

  test('L5 $26: walking in from the west door still reaches the island', async () => {
    await inL5Moat(async (game) => {
      await game.goRoom(L5_MOAT, DIR.RIGHT);
      await quietWorld(game);
      await game.step(4);
      await game.hold(KEYS[0].right);
      for (let i = 0; i < 200; i += 1) {
        await game.step(1);
        const h = await hero(game, 0);
        if (h.x >= 0x40 && h.gridOffset === 0) break;
      }
      await game.release(KEYS[0].right);
      await game.step(4);
      const end = await hero(game, 0);
      assert.ok(
        end.x >= 0x40,
        `walking in from the west door should ladder onto the island, `
          + `stopped at $${end.x.toString(16)},$${end.y.toString(16)}`,
      );
    });
  });
});
