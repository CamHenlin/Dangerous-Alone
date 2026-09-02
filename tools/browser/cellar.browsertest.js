/**
 * Cellar walk play tests. NES mode 9 uses UW first-unwalkable `$78`, so blank
 * `$F3` is solid void. Link only walks the ladder (`$6F`) and the `$24` floor
 * lip — not the black ceiling or the black above the floor strip.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { DIR } from '../shared/collision.js';
import {
  CELLAR_FLOOR_Y,
  CELLAR_INNER_STAIRS_X,
  CELLAR_LADDER_XS,
  CELLAR_STAND_Y,
} from '../shared/dungeonCellar.js';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { quietOccupyingRoom, quietWorld } from './collisionHarness.js';
import { KEYS, hero, pose, walkUntilStopped } from './movementHarness.js';

const L1_TREASURE = 0x7f;
const L5_TUNNEL = 0x07;

describe('cellar walk play', { concurrency: false }, () => {
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
   * @param {Awaited<ReturnType<typeof openGame>>} game
   * @param {number} level
   * @param {number} room
   */
  async function enterCellar(game, level, room) {
    await game.step(10);
    await quietWorld(game);
    await game.enterLevel(level);
    await game.dismissDialogue();
    await game.goRoom(room);
    await quietOccupyingRoom(game);
    await game.step(5);
  }

  test('L1 $7F: stairs only at the top; floor lip is the only hallway', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterCellar(game, 1, L1_TREASURE);

    const left = CELLAR_LADDER_XS[0];
    await pose(game, 0, left, CELLAR_STAND_Y, DIR.LEFT);
    const leftStop = await walkUntilStopped(game, 0, KEYS[0].left, 40);
    assert.equal(
      leftStop.at(-1)?.x,
      left,
      `void west of the mouth must stay solid (x=$${leftStop.at(-1)?.x.toString(16)})`,
    );

    await pose(game, 0, left, CELLAR_STAND_Y, DIR.RIGHT);
    const rightStop = await walkUntilStopped(game, 0, KEYS[0].right, 40);
    assert.equal(
      rightStop.at(-1)?.x,
      left,
      `brick east of the shaft must stay solid (x=$${rightStop.at(-1)?.x.toString(16)})`,
    );

    await pose(game, 0, left, CELLAR_STAND_Y, DIR.DOWN);
    await game.step(2);
    await walkUntilStopped(game, 0, KEYS[0].down, 250);
    const onFloor = await hero(game, 0);
    assert.equal(
      onFloor.y,
      CELLAR_FLOOR_Y,
      `stairs should land on the floor lip (y=$${onFloor.y.toString(16)})`,
    );

    // Hallway X away from both shafts so Up cannot sneak onto stairs.
    await pose(game, 0, 0x50, CELLAR_FLOOR_Y, DIR.UP);
    await game.step(2);
    await walkUntilStopped(game, 0, KEYS[0].up, 40);
    const upVoid = await hero(game, 0);
    assert.equal(
      upVoid.y,
      CELLAR_FLOOR_Y,
      `$F3 above the floor lip must stay solid (y=$${upVoid.y.toString(16)})`,
    );

    await pose(game, 0, left, CELLAR_FLOOR_Y, DIR.RIGHT);
    await game.step(2);
    await walkUntilStopped(game, 0, KEYS[0].right, 250);
    const hall = await hero(game, 0);
    assert.ok(
      hall.x >= CELLAR_INNER_STAIRS_X,
      `floor lip should reach the inner stairs (x=$${hall.x.toString(16)})`,
    );

    await pose(game, 0, CELLAR_INNER_STAIRS_X, CELLAR_FLOOR_Y, DIR.UP);
    await game.step(2);
    await walkUntilStopped(game, 0, KEYS[0].up, 160);
    const alcove = await hero(game, 0);
    assert.ok(
      alcove.y <= 0x9d,
      `inner stairs should reach the treasure lip (y=$${alcove.y.toString(16)})`,
    );
    assert.equal((await hero(game, 0)).world?.startsWith('cellar:'), true);
    await game.close();
  });

  test('L5 $07 tunnel: both ladders meet on the floor; top void is solid', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterCellar(game, 5, L5_TUNNEL);

    const left = CELLAR_LADDER_XS[0];
    const right = CELLAR_LADDER_XS[1];
    await pose(game, 0, left, CELLAR_FLOOR_Y, DIR.RIGHT);
    const across = await walkUntilStopped(game, 0, KEYS[0].right, 250);
    assert.ok(
      (across.at(-1)?.x ?? 0) >= right,
      `tunnel floor should reach the right ladder (x=$${(across.at(-1)?.x ?? 0).toString(16)})`,
    );

    await pose(game, 0, right, CELLAR_STAND_Y, DIR.LEFT);
    const top = await walkUntilStopped(game, 0, KEYS[0].left, 40);
    assert.equal(
      top.at(-1)?.x,
      right,
      `void between the two mouths must stay solid (x=$${top.at(-1)?.x.toString(16)})`,
    );

    await pose(game, 0, right, CELLAR_STAND_Y, DIR.DOWN);
    const down = await walkUntilStopped(game, 0, KEYS[0].down, 250);
    assert.equal(down.at(-1)?.y, CELLAR_FLOOR_Y);
    await game.close();
  });
});
