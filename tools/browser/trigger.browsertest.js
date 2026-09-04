/**
 * Environment-trigger play tests: Armos / graves / Stalfos / traps.
 *
 * The live bug is "touch them and they don't move; leave the screen and come
 * back and they wake." Leftover rooms sampled the anchor's tile grid, and
 * streamed foes sitting on Link skipped contact while `viewActivated` was
 * still false.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { DIR } from '../shared/collision.js';
import { OBJ } from '../shared/enemies.js';
import { TRAP_STATE, TRAP_YS } from '../shared/trapAi.js';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { parkLeftover, walkIntoRoom } from './collisionHarness.js';
import { KEYS, hero, ignoreHits, pose } from './movementHarness.js';

const ARMOS_ROOM = 0x0b;
const ARMOS_HOST = 0x1b;
const ARMOS_STATUE = Object.freeze({ x: 0x30, y: 0x80 });
const GRAVE_ROOM = 0x20;
const GRAVE_HOST = 0x21;
const GRAVE_SPOT = Object.freeze({ x: 0x30, y: 0x70 });
const L1_STALFOS = 0x74;
const L1_ENTRANCE = 0x73;
const L1_TRAPS = 0x22;

describe('environment trigger play', { concurrency: false }, () => {
  /** @type {{ url: string, close: () => Promise<void> }} */
  let server;
  /** @type {import('playwright').Browser} */
  let browser;

  before(async () => {
    server = await startGameServer();
    browser = await chromium.launch();
    const warm = await openGame(browser, { url: server.url });
    await warm.close();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  /**
   * @param {number[]} extraIndexes
   * @param {number} [level]
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

  /**
   * @param {Awaited<ReturnType<typeof openGame>>} game
   * @param {number} [index]
   */
  async function foes(game, index) {
    return game.page.evaluate((i) => window.zeldaDebug.foes(i), index);
  }

  /**
   * @param {Awaited<ReturnType<typeof openGame>>} game
   * @param {object} opts
   */
  async function plant(game, opts) {
    return game.page.evaluate((o) => window.zeldaDebug.plantFoe(o), opts);
  }

  /**
   * @param {readonly { id: number, x: number, y: number }[]} before
   * @param {readonly { id: number, x: number, y: number }[]} after
   */
  function movedCount(before, after) {
    const start = new Map(before.map((e) => [e.id, e]));
    let n = 0;
    for (const e of after) {
      const s = start.get(e.id);
      if (!s) continue;
      if (Math.abs(e.x - s.x) >= 4 || Math.abs(e.y - s.y) >= 4) n += 1;
    }
    return n;
  }

  /**
   * Hold a direction long enough for a blocked stride to settle on gridOffset 0
   * so CheckPassiveTileObjects can fire.
   * @param {Awaited<ReturnType<typeof openGame>>} game
   * @param {number} index
   * @param {'left'|'right'|'up'|'down'} dir
   * @param {number} [frames]
   */
  async function bump(game, index, dir, frames = 36) {
    await game.hold(KEYS[index][dir]);
    await game.step(frames);
    await game.release(KEYS[index][dir]);
    await game.step(2);
  }

  test('a Stalfos waiting off-camera starts moving when Link overlaps it', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await ignoreHits(game);
    await pose(game, 0, 0x78, 0x8d, DIR.RIGHT);
    const planted = await plant(game, {
      objType: OBJ.STALFOS,
      x: 0x78,
      y: 0x8d,
      awaitView: true,
    });
    assert.equal(planted.view, false);
    await game.step(8);
    const after = (await foes(game, 0)).find((e) => e.id === planted.id);
    assert.ok(after, 'the Stalfos vanished');
    assert.equal(after.view, true, 'touching it must reveal it');
    // Step off so overlap does not keep shoving the newly-awake wanderer.
    await pose(game, 0, 0x40, 0x8d, DIR.LEFT);
    const start = { x: after.x, y: after.y };
    await game.step(90);
    const last = (await foes(game, 0)).find((e) => e.id === planted.id);
    assert.ok(last, 'the Stalfos died before it could walk');
    assert.ok(
      Math.abs(last.x - start.x) >= 4 || Math.abs(last.y - start.y) >= 4,
      `overlapped Stalfos never walked (x=${last.x} y=${last.y} from ${start.x},${start.y})`,
    );
    await game.close();
  });

  test('a leftover Stalfos waiting off-camera starts moving when the leftover hero overlaps it', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(game, [1]);
    await ignoreHits(game);
    await pose(game, 0, 0x40, 0x8d, DIR.LEFT);
    await pose(game, 1, 0x78, 0x8d, DIR.RIGHT, L1_STALFOS);
    const p2 = await hero(game, 1);
    assert.equal(p2.linkRoom, L1_STALFOS, 'player two should occupy leftover $74');
    const planted = await plant(game, {
      objType: OBJ.STALFOS,
      x: p2.x,
      y: p2.y,
      home: L1_STALFOS,
      awaitView: true,
    });
    assert.equal(planted.view, false);
    await game.step(8);
    const after = (await foes(game, 0)).find((e) => e.id === planted.id);
    assert.ok(after, 'the leftover Stalfos vanished');
    assert.equal(after.view, true, 'leftover contact must reveal it');
    await pose(game, 1, 0x40, 0x8d, DIR.LEFT, L1_STALFOS);
    const start = { x: after.x, y: after.y };
    await game.step(90);
    const last = (await foes(game, 0)).find((e) => e.id === planted.id);
    assert.ok(last);
    assert.ok(
      Math.abs(last.x - start.x) >= 4 || Math.abs(last.y - start.y) >= 4,
      `leftover Stalfos never walked (x=${last.x} y=${last.y} from ${start.x},${start.y})`,
    );
    await game.close();
  });

  test('L1 $74 Stalfos spawn and wander without leaving the room', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game);
    await ignoreHits(game);
    await game.goRoom(L1_STALFOS);
    await game.step(24);
    const first = (await foes(game, 0)).filter((e) => e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(first.length >= 3, `expected Stalfos in $74, got ${first.length}`);
    assert.ok(
      first.every((e) => e.view),
      `in-room Stalfos still waiting for view: ${first.map((e) => e.id).join(',')}`,
    );
    await game.step(90);
    const later = (await foes(game, 0)).filter((e) => e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(
      movedCount(first, later) >= 1,
      `L1 $74 Stalfos never wandered (${later.map((e) => `${e.id}@${e.x},${e.y}`).join('; ')})`,
    );
    await game.close();
  });

  test('L1 $74 Stalfos keep wandering after you walk west into $73', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game);
    await ignoreHits(game);
    await game.goRoom(L1_STALFOS);
    await game.step(24);
    await pose(game, 0, 0x30, 0x8d, DIR.LEFT);
    await game.hold(KEYS[0].left);
    for (let i = 0; i < 120; i += 1) {
      await game.step(1);
      if ((await hero(game, 0)).linkRoom === L1_ENTRANCE) break;
    }
    await game.release(KEYS[0].left);
    await game.step(8);
    assert.equal((await hero(game, 0)).linkRoom, L1_ENTRANCE, 'Link never left west');
    const first = (await foes(game, 0)).filter((e) => e.alive !== false && e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(first.length >= 1, 'walking out despawned the $74 Stalfos');
    await game.step(90);
    const later = (await foes(game, 0)).filter((e) => e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(
      movedCount(first, later) >= 1,
      `leftover $74 Stalfos froze after the door (${later.map((e) => `${e.id}@${e.x},${e.y}`).join('; ')})`,
    );
    await game.close();
  });

  test('walking back into L1 $74 still finds moving Stalfos', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game);
    await ignoreHits(game);
    await game.goRoom(L1_STALFOS);
    await game.step(16);
    await game.goRoom(L1_ENTRANCE);
    await game.step(8);
    await game.goRoom(L1_STALFOS);
    await game.step(24);
    const first = (await foes(game, 0)).filter((e) => e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(first.length >= 3, 'coming back into $74 spawned no Stalfos');
    await game.step(90);
    const later = (await foes(game, 0)).filter((e) => e.objType === OBJ.STALFOS && e.home === L1_STALFOS);
    assert.ok(
      movedCount(first, later) >= 1,
      'leave-and-return Stalfos still froze',
    );
    await game.close();
  });

  test('touching an $0B Armos statue wakes it', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(ARMOS_ROOM, { x: 0x20, y: ARMOS_STATUE.y, dir: DIR.RIGHT });
    await pose(game, 0, ARMOS_STATUE.x - 0x10, ARMOS_STATUE.y, DIR.RIGHT);
    const before = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    await bump(game, 0, 'right');
    const after = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    assert.ok(
      after.length > before.length,
      `walking into the $0B statue spawned no Armos (before=${before.length} after=${after.length})`,
    );
    const woken = after.find((e) => !e.armosStatue);
    assert.ok(woken, 'the Armos stayed a statue');
    await game.close();
  });

  test('a leftover $0B Armos statue still wakes when player two bumps it', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await parkLeftover(game, ARMOS_ROOM, ARMOS_HOST);
    await pose(game, 1, ARMOS_STATUE.x - 0x10, ARMOS_STATUE.y, DIR.RIGHT, ARMOS_ROOM);
    const before = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    await bump(game, 1, 'right');
    const after = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    assert.ok(
      after.length > before.length,
      `leftover Armos never woke (before=${before.length} after=${after.length}; p2=${JSON.stringify(await hero(game, 1))})`,
    );
    await game.close();
  });

  test('walking north from $1B onto $0B still lets you wake an Armos', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(ARMOS_HOST, { x: 0x70, y: 0x4d, dir: DIR.UP });
    await pose(game, 0, 0x70, 0x4d, DIR.UP);
    await walkIntoRoom(game, 0, KEYS[0].up, ARMOS_ROOM);
    await pose(game, 0, ARMOS_STATUE.x - 0x10, ARMOS_STATUE.y, DIR.RIGHT);
    const before = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    await bump(game, 0, 'right');
    const after = (await foes(game, 0)).filter((e) => e.objType === OBJ.ARMOS);
    assert.ok(
      after.length > before.length,
      `entered $0B from $1B but the statue never woke (before=${before.length} after=${after.length})`,
    );
    await game.close();
  });

  test('bumping a $20 grave spawns a Flying Ghini', async () => {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await ignoreHits(game);
    await game.returnToOverworld(GRAVE_ROOM, { x: GRAVE_SPOT.x - 0x10, y: GRAVE_SPOT.y, dir: DIR.RIGHT });
    await pose(game, 0, GRAVE_SPOT.x - 0x10, GRAVE_SPOT.y, DIR.RIGHT);
    const before = (await foes(game, 0)).filter((e) => e.objType === OBJ.FLYING_GHINI);
    await bump(game, 0, 'right');
    const after = (await foes(game, 0)).filter((e) => e.objType === OBJ.FLYING_GHINI);
    assert.ok(
      after.length > before.length,
      `grave spawned no Flying Ghini (before=${before.length} after=${after.length})`,
    );
    await game.close();
  });

  test('a leftover $20 grave still spawns a Flying Ghini', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    await parkLeftover(game, GRAVE_ROOM, GRAVE_HOST);
    await pose(game, 1, GRAVE_SPOT.x - 0x10, GRAVE_SPOT.y, DIR.RIGHT, GRAVE_ROOM);
    const before = (await foes(game, 0)).filter((e) => e.objType === OBJ.FLYING_GHINI);
    await bump(game, 1, 'right');
    const after = (await foes(game, 0)).filter((e) => e.objType === OBJ.FLYING_GHINI);
    assert.ok(
      after.length > before.length,
      `leftover grave spawned no Flying Ghini (before=${before.length} after=${after.length})`,
    );
    await game.close();
  });

  test('L1 $22 traps rush when Link lines up with them', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game);
    await ignoreHits(game);
    await game.goRoom(L1_TRAPS);
    await pose(game, 0, 0x78, TRAP_YS[0], DIR.LEFT);
    await game.step(40);
    const traps = (await foes(game, 0)).filter((e) => e.objType === OBJ.TRAP);
    assert.ok(traps.length >= 4, `expected traps in L1 $22, got ${traps.length}`);
    assert.ok(
      traps.some((e) => e.trapState === TRAP_STATE.RUSH || e.trapState === TRAP_STATE.RETRACT),
      `no trap rushed (states=${traps.map((e) => e.trapState).join(',')})`,
    );
    await game.close();
  });
});
