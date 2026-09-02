/**
 * Collision play tests: leftover rooms, cave splits, stair wells after
 * several screen transitions, and dungeon door walks, compared to a solo
 * walk in the same occupying cell.
 *
 * These exist because leftover / split-screen walking has repeatedly looked
 * like "can't get close to the left trees, then clip into the right ones",
 * and the same 8px slip on a 16px stair / door corridor is "the only way
 * up is overlapping the right wall".
 * Dungeon leftover + a live DoorwayDir latch + knockback on the floor lip
 * is the same family: corridor clamp magnetizes onto the opening so Right
 * (north door) or Up (west door) does nothing.
 * The invariant is local: player two's occupying-room stop must match solo.
 *
 * Run with `npm run test:browser`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { KEYS, hero, pose } from './movementHarness.js';
import {
  ARMOS_COURT,
  ARMOS_STAIR_SPOTS,
  CAVE_SPOTS,
  L9_WATER_ROOM,
  MOUNTAIN_STAIR,
  MOUNTAIN_STAIR_SPOTS,
  NORTH_STAIR,
  NORTH_STAIR_MOUTH,
  NORTH_STAIR_SPOTS,
  Q2_L2_FAR_NORTH,
  Q2_L2_NORTH,
  Q2_L2_PACK,
  Q2_L2_SOUTH_DOOR_SPOTS,
  Q2_L2_START,
  SHOP_CAVE,
  L4_LAVA_MAZE,
  L4_WATER_MAZE,
  alignStops,
  arrivalSpot,
  assertArrivalMatch,
  assertArrivalProbesMatch,
  assertDoorLipTourMatch,
  assertStopsMatch,
  inRoomStops,
  parkHostInCave,
  parkLeftover,
  quietWorld,
  recordStops,
  runDoorLipTour,
  runL9WaterRoomArrival,
  runQ2L2SouthDoorArrival,
  runQ2L2SouthDoorImmediateStrafe,
  runQ2L2WalkNorthTo59,
  runUwLavaPathTour,
  splitAnchor,
  splitEastFromStart,
  walkIntoRoom,
  walkPath,
} from './collisionHarness.js';

const SWORD_CAVE = 0x10;

/** Start-screen sand, a few columns and rows so a one-tile shift cannot hide. */
const START_SPOTS = Object.freeze([
  { x: 0x78, y: 0x8d },
  { x: 0x60, y: 0x8d },
  { x: 0x90, y: 0x8d },
  { x: 0x78, y: 0x6d },
  { x: 0x78, y: 0xad },
]);

/** Off the west/east path so left/right hit trees instead of the next screen. */
const TREE_SPOTS = Object.freeze([
  { x: 0x78, y: 0x6d },
  { x: 0x90, y: 0x6d },
  { x: 0x60, y: 0x6d },
  { x: 0x78, y: 0xad },
  { x: 0x90, y: 0xad },
]);

const CARDINAL = Object.freeze(/** @type {const} */ (['left', 'right', 'up', 'down']));
const SIDES = Object.freeze(/** @type {const} */ (['left', 'right']));

describe('collision play', { concurrency: false }, () => {
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
   * @param {number} room
   * @param {readonly { x: number, y: number }[]} spots
   * @param {readonly ('left'|'right'|'up'|'down')[]} [dirs]
   */
  async function recordSoloOw(room, spots, dirs = SIDES, max) {
    const game = await openGame(browser, { url: server.url });
    await game.step(5);
    await quietWorld(game);
    if (room !== 0x77) {
      await game.returnToOverworld(room, { x: 0x78, y: 0x8d, dir: 0x08 });
    }
    const stops = await recordStops(
      game,
      0,
      spots.map((s) => ({ ...s, room })),
      dirs,
      max,
    );
    await game.close();
    return stops;
  }

  /**
   * @param {number} level
   * @param {number} room
   * @param {readonly { x: number, y: number }[]} spots
   * @param {readonly ('left'|'right'|'up'|'down')[]} [dirs]
   * @param {string} [query]
   */
  async function recordSoloUw(level, room, spots, dirs = SIDES, query = '') {
    const game = await openGame(browser, { url: server.url, query });
    await game.step(5);
    await quietWorld(game);
    await game.enterLevel(level);
    await game.dismissDialogue();
    await game.goRoom(room);
    const stops = await recordStops(
      game,
      0,
      spots.map((s) => ({ ...s, room })),
      dirs,
    );
    await game.close();
    return stops;
  }

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

  test('solo and a same-room ally stop on the same pixels at several spots', async () => {
    const solo = await recordSoloOw(0x77, START_SPOTS, CARDINAL);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x40, 0x8d, 0x01);
    const p2 = await recordStops(
      party,
      1,
      START_SPOTS.map((s) => ({ ...s, room: 0x77 })),
      CARDINAL,
    );
    await party.close();

    assertStopsMatch(solo, p2, 'same-room player two');
  });

  test('leftover after an east screen cross matches solo against the trees', async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitEastFromStart(party);
    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x77 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $77 after player one crossed east');
  });

  test('leftover can still walk west into the next screen', async () => {
    // Player one holds $78, so $77 is leftover and $76 is two rooms west of
    // the streaming anchor. Solo walks $77 → $76; leftover used to freeze at
    // local x=0 (anchor x=−256), the west seam of $77.
    const solo = await recordSoloOw(0x77, [{ x: 0x78, y: 0x8d }], ['left']);
    assert.equal(solo[0].stops.left.end.room, 0x76, 'solo west of start should enter $76');

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitEastFromStart(party);
    const p2 = await recordStops(party, 1, [{ x: 0x78, y: 0x8d, room: 0x77 }], ['left']);
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $77 walking west into $76');
  });

  test("leftover walking while player one is in a cave matches solo", async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitEastFromStart(party);
    await party.openCave(SWORD_CAVE, 0);
    await party.dismissDialogue();
    assert.equal((await hero(party, 0)).world, `cave:${SWORD_CAVE}`);
    assert.equal((await hero(party, 1)).world, 'overworld');
    assert.equal((await hero(party, 1)).linkRoom, 0x77);

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x77 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $77 with player one in the sword cave');
  });

  test('walking a screen north while the host is in a cave matches solo', async () => {
    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x40, 0x8d, 0x08);
    await pose(party, 1, 0x78, 0x8d, 0x08);
    await party.openCave(SWORD_CAVE, 0);
    await party.dismissDialogue();
    assert.equal((await hero(party, 1)).world, 'overworld');

    await walkIntoRoom(party, 1, KEYS[1].up, 0x67);
    const arrived = localArrival(await hero(party, 1));
    const spots = [
      arrived,
      { x: 0x70, y: 0x8d, room: 0x67 },
      { x: 0x90, y: 0x8d, room: 0x67 },
      { x: 0x78, y: 0x6d, room: 0x67 },
      { x: 0x78, y: 0xad, room: 0x67 },
    ];
    const p2All = await recordStops(party, 1, spots);
    await party.close();

    const soloAll = await recordSoloOw(0x67, spots);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 2, `need in-room probes in $67, got ${solo.length}`);
    const keyed = new Map(p2All.map((row) => [`${row.spot.x},${row.spot.y}`, row]));
    const p2 = solo.map((row) => keyed.get(`${row.spot.x},${row.spot.y}`)).filter(Boolean);
    assert.equal(p2.length, solo.length, 'player two skipped an in-room $67 probe');
    assertStopsMatch(solo, p2, 'after walking $77 → $67 with the host in a cave');
  });

  test('walking east of start and probing $78 matches solo', async () => {
    const spots78 = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x6d },
    ];
    const soloAll = await recordSoloOw(0x78, spots78);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 2, `need in-room probes in $78, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x40, 0x8d, 0x08);
    await pose(party, 1, 0x78, 0x8d, 0x01);
    await walkIntoRoom(party, 1, KEYS[1].right, 0x78);
    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x78 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'player two in $78 after walking east');
  });

  test('a leftover dungeon cell matches solo at several spots', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x70 },
    ];
    const soloAll = await recordSoloUw(1, 0x73, spots);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 2, `need in-room probes in L1 $73, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await pose(party, 0, 0xe0, 0x8d, 0x01);
    await pose(party, 1, 0x78, 0x8d, 0x08);
    await party.press([KEYS[0].right], 150);
    await quietWorld(party);
    const split = (await party.state()).heroes;
    assert.equal(split[0].linkRoom, 0x74, 'player one should have crossed east');
    assert.equal(split[1].linkRoom, 0x73, 'player two should have stayed leftover in $73');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x73 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover L1 $73');
  });

  test('a leftover L3 maze cell matches solo at several spots', async () => {
    const spots = [
      { x: 0x80, y: 0x8d },
      { x: 0x60, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x80, y: 0x70 },
      { x: 0x80, y: 0x65 },
    ];
    const solo = await recordSoloUw(3, 0x6b, spots);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1], 3);
    await quietWorld(party);
    await party.goRoom(0x6b);
    await pose(party, 0, 0x78, 0x8d, 0x01);
    await pose(party, 1, 0x80, 0x8d, 0x08, 0x6b);
    await party.goRoom(0x6c, 0x01, 0);
    await party.step(4);
    const split = (await party.state()).heroes;
    assert.equal(split[1].linkRoom, 0x6b, 'player two must occupy leftover $6b');

    const p2 = await recordStops(
      party,
      1,
      spots.map((s) => ({ ...s, room: 0x6b })),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover L3 $6b');
  });

  test('leftover can still walk east into the next screen', async () => {
    // Player one holds $76, so $77 is leftover-east and $78 is two rooms east
    // of the streaming anchor. Same freeze as the west case, other seam.
    const solo = await recordSoloOw(0x77, [{ x: 0x78, y: 0x8d }], ['right']);
    assert.equal(solo[0].stops.right.end.room, 0x78, 'solo east of start should enter $78');

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitAnchor(party, 'left');
    const p2 = await recordStops(party, 1, [{ x: 0x78, y: 0x8d, room: 0x77 }], ['right']);
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $77 walking east into $78');
  });

  test('leftover $57 two rooms north of the host matches solo', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x6d },
    ];
    const solo = inRoomStops(await recordSoloOw(0x57, spots, CARDINAL));
    assert.ok(solo.length >= 1, `need in-room probes in $57, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, 0x57, 0x77);
    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x57 })),
        CARDINAL,
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $57 with host two rooms south on $77');
  });

  test('leftover can still walk south two rooms from the host', async () => {
    // $67's only south opening feeds $77. Host on $57 puts that opening two
    // rooms south of the streaming anchor — leftover used to freeze on the
    // $67 south seam.
    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, 0x67, 0x57);
    await pose(party, 1, 0x78, 0xcd, 0x04, 0x67);
    await walkIntoRoom(party, 1, KEYS[1].down, 0x77, 280);
    const arrived = localArrival(await hero(party, 1));
    const spots = [
      arrived,
      { x: 0x70, y: 0x8d, room: 0x77 },
      { x: 0x78, y: 0x6d, room: 0x77 },
    ];
    const p2All = await recordStops(party, 1, spots);
    await party.close();

    const solo = inRoomStops(await recordSoloOw(0x77, spots));
    assert.ok(solo.length >= 1, 'need an in-room probe in $77');
    const p2 = alignStops(solo, p2All);
    assert.equal(p2.length, solo.length);
    assertStopsMatch(solo, p2, 'leftover $67 walking south into $77');
  });

  test('leftover $78 after the host continues east matches solo', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x6d },
    ];
    const solo = inRoomStops(await recordSoloOw(0x78, spots));
    assert.ok(solo.length >= 2, `need in-room probes in $78, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x78, 0x8d, 0x01);
    await pose(party, 1, 0x60, 0x8d, 0x01);
    await walkIntoRoom(party, 0, KEYS[0].right, 0x78);
    await walkIntoRoom(party, 1, KEYS[1].right, 0x78);
    await pose(party, 0, 0xe0, 0x8d, 0x01, 0x78);
    await pose(party, 1, 0x78, 0x8d, 0x08, 0x78);
    await party.press([KEYS[0].right], 120);
    assert.equal((await hero(party, 0)).linkRoom, 0x79, 'host should have continued into $79');
    assert.equal((await hero(party, 1)).linkRoom, 0x78, 'player two should stay leftover on $78');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x78 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $78 after host walked to $79');
  });

  test('leftover at a west seam can still walk north and south', async () => {
    const spots = [{ x: 0x11, y: 0x8d }];
    const solo = await recordSoloOw(0x77, spots, ['up', 'down']);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitEastFromStart(party);
    const p2 = await recordStops(party, 1, [{ x: 0x11, y: 0x8d, room: 0x77 }], ['up', 'down']);
    await party.close();

    assertStopsMatch(solo, p2, 'leftover $77 west-seam vertical walk');
  });

  test('four leftover allies match solo against the start-screen trees', async () => {
    const spots = TREE_SPOTS.slice(0, 3);
    const solo = inRoomStops(await recordSoloOw(0x77, spots));
    assert.ok(solo.length >= 2, `need in-room tree probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=4' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0xe0, 0x8d, 0x01);
    for (let i = 1; i < 4; i += 1) {
      await pose(party, i, 0x50 + i * 16, 0x8d, 0x08);
    }
    await party.press([KEYS[0].right], 120);
    assert.equal((await hero(party, 0)).linkRoom, 0x78);
    for (let i = 1; i < 4; i += 1) {
      assert.equal((await hero(party, i)).linkRoom, 0x77, `player ${i + 1} was yanked out of $77`);
      const p = inRoomStops(
        await recordStops(
          party,
          i,
          solo.map((row) => ({ ...row.spot, room: 0x77 })),
        ),
      );
      assertStopsMatch(solo, p, `leftover player ${i + 1} on $77`);
    }
    await party.close();
  });

  test('a leftover dungeon cell west of the host matches solo', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x70 },
    ];
    const solo = inRoomStops(await recordSoloUw(1, 0x74, spots));
    assert.ok(solo.length >= 2, `need in-room probes in L1 $74, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await party.goRoom(0x74);
    await pose(party, 0, 0x21, 0x8d, 0x02);
    await pose(party, 1, 0x78, 0x8d, 0x08, 0x74);
    await party.press([KEYS[0].left], 150);
    await quietWorld(party);
    const split = (await party.state()).heroes;
    assert.equal(split[0].linkRoom, 0x73, 'player one should have crossed west');
    assert.equal(split[1].linkRoom, 0x74, 'player two should have stayed leftover in $74');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x74 })),
      ),
    );
    await party.close();

    assertStopsMatch(solo, p2, 'leftover L1 $74');
  });

  test('leftover after west or north screen cross matches solo against the trees', async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS, CARDINAL);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    for (const side of /** @type {const} */ (['left', 'up'])) {
      const party = await openGame(browser, { url: server.url, query: 'players=2' });
      await party.step(5);
      await quietWorld(party);
      await splitAnchor(party, side);
      const p2 = inRoomStops(
        await recordStops(
          party,
          1,
          solo.map((row) => ({ ...row.spot, room: 0x77 })),
          CARDINAL,
        ),
      );
      await party.close();
      assertStopsMatch(solo, p2, `leftover $77 after ${side} split`);
    }
  });

  test('leftover along each seam still walks the perpendicular axis', async () => {
    const cases = [
      { split: 'right', spot: { x: 0xe0, y: 0x8d }, dirs: ['up', 'down'], label: 'east seam after east split' },
      { split: 'left', spot: { x: 0xe0, y: 0x8d }, dirs: ['up', 'down'], label: 'east seam after west split' },
      { split: 'up', spot: { x: 0x78, y: 0x4d }, dirs: ['left', 'right'], label: 'north seam after north split' },
      { split: 'right', spot: { x: 0x78, y: 0xcd }, dirs: ['left', 'right'], label: 'south map rim after east split' },
    ];
    for (const c of cases) {
      const solo = await recordSoloOw(0x77, [c.spot], c.dirs);
      const party = await openGame(browser, { url: server.url, query: 'players=2' });
      await party.step(5);
      await quietWorld(party);
      await splitAnchor(party, c.split);
      const p2 = await recordStops(party, 1, [{ ...c.spot, room: 0x77 }], c.dirs);
      await party.close();
      assertStopsMatch(solo, p2, `leftover $77 ${c.label}`);
    }
  });

  test('leftover $77 still matches solo after the host walks two rooms away', async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS, CARDINAL);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    const hosts = [0x79, 0x75, 0x57];
    for (const hostRoom of hosts) {
      const party = await openGame(browser, { url: server.url, query: 'players=2' });
      await party.step(5);
      await quietWorld(party);
      await parkLeftover(party, 0x77, hostRoom);
      const p2 = inRoomStops(
        await recordStops(
          party,
          1,
          solo.map((row) => ({ ...row.spot, room: 0x77 })),
          CARDINAL,
        ),
      );
      await party.close();
      assertStopsMatch(solo, p2, `leftover $77 with host two rooms away on $${hostRoom.toString(16)}`);
    }
  });

  test('leftover overworld trees while the host is in a dungeon match solo', async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS, CARDINAL);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x40, 0x8d, 0x08);
    await pose(party, 1, 0x78, 0x8d, 0x08);
    await party.enterLevel(1, 0);
    await party.dismissDialogue();
    assert.equal((await hero(party, 0)).world, 'dungeon:1');
    assert.equal((await hero(party, 1)).world, 'overworld');
    assert.equal((await hero(party, 1)).linkRoom, 0x77);

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x77 })),
        CARDINAL,
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'OW leftover $77 while host is in L1');
  });

  test('leftover after the host returns from a cave matches solo', async () => {
    const soloAll = await recordSoloOw(0x77, TREE_SPOTS);
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 3, `need in-room tree probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await splitEastFromStart(party);
    await party.openCave(SWORD_CAVE, 0);
    await party.dismissDialogue();
    await party.returnToOverworld(0x78, { x: 0x78, y: 0x8d, dir: 0x01 }, 0);
    await party.step(4);
    assert.equal((await hero(party, 0)).world, 'overworld');
    assert.equal((await hero(party, 0)).linkRoom, 0x78, 'host should have returned onto $78');
    assert.equal((await hero(party, 1)).linkRoom, 0x77, 'player two should stay leftover on $77');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x77 })),
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $77 after host returned from the sword cave');
  });

  test('leftover L1 $73 after the host cuts two rooms north matches solo', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x70 },
    ];
    const solo = inRoomStops(await recordSoloUw(1, 0x73, spots));
    assert.ok(solo.length >= 2, `need in-room probes in L1 $73, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await party.goRoom(0x53, 0x08, 0);
    await pose(party, 1, 0x78, 0x8d, 0x08, 0x73);
    await party.step(4);
    const split = (await party.state()).heroes;
    assert.equal(split[0].linkRoom, 0x53, 'player one should occupy $53');
    assert.equal(split[1].linkRoom, 0x73, 'player two must occupy leftover $73');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x73 })),
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover L1 $73 with host two rooms north');
  });

  test('leftover on the west map rim two rooms from the host matches solo', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x40, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x6d },
    ];
    const solo = inRoomStops(await recordSoloOw(0x40, spots));
    assert.ok(solo.length >= 1, `need in-room probes in $40, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, 0x40, 0x42);

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x40 })),
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $40 with host on $42');
  });

  test('leftover at $11 north-wall stairs can still center on the well', async () => {
    // Screenshot case: leftover at a 16px stair gap, blocked from walking
    // left onto the column, so the only climb is overlapping the right rock.
    const solo = await recordSoloOw(NORTH_STAIR.room, NORTH_STAIR_SPOTS, SIDES);
    assert.ok(solo.length >= 3, `need stair-well probes in $11, got ${solo.length}`);
    const leftInWell = solo.find(
      (row) => row.spot.x === 0x78 && row.spot.y === 0x4d,
    );
    assert.ok(leftInWell, 'solo $11 stair well probe missing');
    assert.ok(
      leftInWell.stops.left.end.x <= 0x70,
      `solo should center on $11 stairs (left-stop x=$${leftInWell.stops.left.end.x.toString(16)})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, NORTH_STAIR.room, 0x13);
    const p2 = await recordStops(
      party,
      1,
      NORTH_STAIR_SPOTS.map((s) => ({ ...s, room: NORTH_STAIR.room })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $11 stair well with host on $13');
    const leftoverWell = p2.find((row) => row.spot.x === 0x78 && row.spot.y === 0x4d);
    assert.ok(
      leftoverWell.stops.left.end.x <= 0x70,
      `leftover $11 could not walk left onto the stairs `
        + `(left-stop x=$${leftoverWell.stops.left.end.x.toString(16)})`,
    );
  });

  test('leftover walking west off the $11 stair mouth matches solo', async () => {
    // Open sand under the stairs feeds `$10`. Leftover used to freeze 16px
    // east of solo — the same "cannot walk further left" as the screenshot.
    const solo = await recordSoloOw(NORTH_STAIR.room, [NORTH_STAIR_MOUTH], ['left'], 500);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, NORTH_STAIR.room, 0x13);
    const p2 = await recordStops(
      party,
      1,
      [{ ...NORTH_STAIR_MOUTH, room: NORTH_STAIR.room }],
      ['left'],
      500,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $11 stair mouth walking west into $10');
  });

  test('leftover $11 stairs while the host is in a cave match solo', async () => {
    const solo = await recordSoloOw(NORTH_STAIR.room, NORTH_STAIR_SPOTS, SIDES);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, NORTH_STAIR.room, 0x13);
    await party.openCave(SWORD_CAVE, 0);
    await party.dismissDialogue();
    assert.equal((await hero(party, 0)).world, `cave:${SWORD_CAVE}`);
    assert.equal((await hero(party, 1)).world, 'overworld');
    assert.equal((await hero(party, 1)).linkRoom, NORTH_STAIR.room);

    const p2 = await recordStops(
      party,
      1,
      NORTH_STAIR_SPOTS.map((s) => ({ ...s, room: NORTH_STAIR.room })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $11 stairs with host in the sword cave');
  });

  test('leftover climbing $4C → $3C mountain stairs matches a solo climb', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await soloGame.returnToOverworld(MOUNTAIN_STAIR.fromRoom, {
      x: MOUNTAIN_STAIR.x,
      y: 0x8d,
      dir: 0x08,
    });
    await pose(soloGame, 0, MOUNTAIN_STAIR.x, 0x8d, 0x08, MOUNTAIN_STAIR.fromRoom);
    await walkIntoRoom(soloGame, 0, KEYS[0].up, MOUNTAIN_STAIR.room, 520);
    const soloArrival = arrivalSpot(await hero(soloGame, 0));
    const soloStops = inRoomStops(
      await recordStops(
        soloGame,
        0,
        MOUNTAIN_STAIR_SPOTS.map((s) => ({ ...s, room: MOUNTAIN_STAIR.room })),
        SIDES,
      ),
    );
    await soloGame.close();
    assert.ok(soloStops.length >= 1, `need in-room $3C stair probes, got ${soloStops.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, MOUNTAIN_STAIR.fromRoom, 0x4a);
    await pose(party, 1, MOUNTAIN_STAIR.x, 0x8d, 0x08, MOUNTAIN_STAIR.fromRoom);
    await walkIntoRoom(party, 1, KEYS[1].up, MOUNTAIN_STAIR.room, 520);
    const leftoverArrival = arrivalSpot(await hero(party, 1));
    assertArrivalMatch(soloArrival, leftoverArrival, 'leftover climbed $4C→$3C', 2);
    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        soloStops.map((row) => ({ ...row.spot, room: MOUNTAIN_STAIR.room })),
        SIDES,
      ),
    );
    await party.close();
    assertStopsMatch(soloStops, p2, 'leftover after walking $4C stairs into $3C');
  });

  test('leftover walking three screens east with the host in a cave matches solo', async () => {
    const dest = 0x79;
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x6d },
    ];
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await pose(soloGame, 0, 0xe0, 0x8d, 0x01);
    await walkIntoRoom(soloGame, 0, KEYS[0].right, 0x78);
    await pose(soloGame, 0, 0xe0, 0x8d, 0x01, 0x78);
    await walkIntoRoom(soloGame, 0, KEYS[0].right, dest);
    const soloArrival = arrivalSpot(await hero(soloGame, 0));
    const soloAll = await recordStops(soloGame, 0, spots.map((s) => ({ ...s, room: dest })));
    await soloGame.close();
    const solo = inRoomStops(soloAll);
    assert.ok(solo.length >= 1, `need in-room probes in $79 after a 3-screen walk, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await pose(party, 0, 0x40, 0x8d, 0x08);
    await pose(party, 1, 0xe0, 0x8d, 0x01);
    await party.openCave(SWORD_CAVE, 0);
    await party.dismissDialogue();
    await walkIntoRoom(party, 1, KEYS[1].right, 0x78);
    await pose(party, 1, 0xe0, 0x8d, 0x01, 0x78);
    await walkIntoRoom(party, 1, KEYS[1].right, dest);
    const leftoverArrival = arrivalSpot(await hero(party, 1));
    assertArrivalMatch(soloArrival, leftoverArrival, 'leftover 3-screen east');
    const p2All = await recordStops(party, 1, spots.map((s) => ({ ...s, room: dest })));
    await party.close();
    const p2 = alignStops(solo, p2All);
    assert.equal(p2.length, solo.length);
    assertStopsMatch(solo, p2, 'leftover after walking $77→$78→$79 with host in a cave');
  });

  test('leftover walking several L1 doors matches solo in $72', async () => {
    const spots = [
      { x: 0x78, y: 0x8d },
      { x: 0x50, y: 0x8d },
      { x: 0x78, y: 0x70 },
    ];
    const solo = inRoomStops(await recordSoloUw(1, 0x72, spots, ['left', 'up', 'down']));
    assert.ok(solo.length >= 2, `need in-room probes in L1 $72, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await quietWorld(party);
    await party.goRoom(0x53, 0x08, 0);
    await pose(party, 1, 0xe0, 0x8d, 0x01, 0x73);
    await walkPath(party, 1, [
      { key: KEYS[1].right, dest: 0x74, max: 280 },
    ]);
    await pose(party, 1, 0x21, 0x8d, 0x02, 0x74);
    await walkPath(party, 1, [
      { key: KEYS[1].left, dest: 0x73, max: 280 },
    ]);
    await pose(party, 1, 0x21, 0x8d, 0x02, 0x73);
    await walkPath(party, 1, [
      { key: KEYS[1].left, dest: 0x72, max: 280 },
    ]);
    const split = (await party.state()).heroes;
    assert.equal(split[0].linkRoom, 0x53, 'player one should occupy $53');
    assert.equal(split[1].linkRoom, 0x72, 'player two should occupy leftover $72 after three doors');

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x72 })),
        ['left', 'up', 'down'],
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover L1 $72 after walking 73→74→73→72');
  });

  test('leftover L1 east-door corridor after several room cuts matches solo', async () => {
    const spots = [
      { x: 0xc0, y: 0x8d },
      { x: 0xa0, y: 0x8d },
      { x: 0x78, y: 0x8d },
      { x: 0x78, y: 0x70 },
    ];
    const solo = inRoomStops(await recordSoloUw(1, 0x73, spots));
    assert.ok(solo.length >= 2, `need in-room probes in L1 $73, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await quietWorld(party);
    await party.goRoom(0x53, 0x08, 0);
    await party.goRoom(0x63, 0x08, 0);
    await party.goRoom(0x53, 0x08, 0);
    await pose(party, 1, 0x78, 0x8d, 0x08, 0x73);
    await party.step(4);
    assert.equal((await hero(party, 1)).linkRoom, 0x73);

    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        solo.map((row) => ({ ...row.spot, room: 0x73 })),
      ),
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover L1 $73 east-door corridor after host room cuts');
  });

  test('leftover $0B Armos court while the host is in L5 matches solo', async () => {
    const spots = [
      { x: 0x20, y: 0x8d },
      { x: 0x78, y: 0x8d },
      { x: 0x70, y: 0xcd },
      { x: 0x78, y: 0xcd },
    ];
    const solo = await recordSoloOw(ARMOS_COURT.room, spots, SIDES);
    assert.ok(solo.length >= 3, `need $0B probes, got ${solo.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, ARMOS_COURT.room, 0x0d);
    await party.enterLevel(5, 0);
    await party.dismissDialogue();
    assert.equal((await hero(party, 0)).world, 'dungeon:5');
    assert.equal((await hero(party, 1)).world, 'overworld');
    assert.equal((await hero(party, 1)).linkRoom, ARMOS_COURT.room);

    const p2 = await recordStops(
      party,
      1,
      spots.map((s) => ({ ...s, room: ARMOS_COURT.room })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $0B Armos with host in L5');
  });

  test('leftover climbing $1B → $0B stairs matches a solo climb', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await soloGame.returnToOverworld(ARMOS_COURT.fromRoom, {
      x: ARMOS_COURT.x,
      y: 0x8d,
      dir: 0x08,
    });
    await pose(soloGame, 0, ARMOS_COURT.x, 0x8d, 0x08, ARMOS_COURT.fromRoom);
    await walkIntoRoom(soloGame, 0, KEYS[0].up, ARMOS_COURT.room, 520);
    const soloArrival = arrivalSpot(await hero(soloGame, 0));
    const soloStops = inRoomStops(
      await recordStops(
        soloGame,
        0,
        ARMOS_STAIR_SPOTS.map((s) => ({ ...s, room: ARMOS_COURT.room })),
        SIDES,
      ),
    );
    await soloGame.close();
    assert.ok(soloStops.length >= 1, `need in-room $0B stair probes, got ${soloStops.length}`);

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, ARMOS_COURT.fromRoom, 0x1d);
    await pose(party, 1, ARMOS_COURT.x, 0x8d, 0x08, ARMOS_COURT.fromRoom);
    await walkIntoRoom(party, 1, KEYS[1].up, ARMOS_COURT.room, 520);
    const leftoverArrival = arrivalSpot(await hero(party, 1));
    assertArrivalMatch(soloArrival, leftoverArrival, 'leftover climbed $1B→$0B', 2);
    const p2 = inRoomStops(
      await recordStops(
        party,
        1,
        soloStops.map((row) => ({ ...row.spot, room: ARMOS_COURT.room })),
        SIDES,
      ),
    );
    await party.close();
    assertStopsMatch(soloStops, p2, 'leftover after walking $1B stairs into $0B');
  });

  test('leftover $0B stairs after several host room cuts match solo', async () => {
    const solo = await recordSoloOw(ARMOS_COURT.room, ARMOS_STAIR_SPOTS, SIDES);
    const well = solo.find((row) => row.spot.x === 0x70 && row.spot.y === 0xcd);
    assert.ok(well, 'solo $0B south-stair probe missing');
    assert.ok(
      well.stops.left.end.x <= 0x70,
      `solo should center on $0B stairs (left-stop x=$${well.stops.left.end.x.toString(16)})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, ARMOS_COURT.room, 0x0e);
    await party.enterLevel(5, 0);
    await party.dismissDialogue();
    await party.goRoom(0x22, 0x08, 0);
    await party.goRoom(0x23, 0x01, 0);
    await party.step(4);
    assert.equal((await hero(party, 1)).linkRoom, ARMOS_COURT.room);

    const p2 = await recordStops(
      party,
      1,
      ARMOS_STAIR_SPOTS.map((s) => ({ ...s, room: ARMOS_COURT.room })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $0B stairs after host cut several L5 rooms');
    const leftoverWell = p2.find((row) => row.spot.x === 0x70 && row.spot.y === 0xcd);
    assert.ok(
      leftoverWell.stops.left.end.x <= 0x70,
      `leftover $0B could not walk left onto the stairs `
        + `(left-stop x=$${leftoverWell.stops.left.end.x.toString(16)})`,
    );
  });

  test('an off-grid pose on $0B recovers to the same stops as solo', async () => {
    // 4px knockback remainder at the south stairs. Walking left must still
    // center on the 16px well instead of staying half on the rock.
    const spots = [
      { x: 0x74, y: 0xcd },
      { x: 0x7c, y: 0xcd },
    ];
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await soloGame.returnToOverworld(ARMOS_COURT.room, { x: 0x78, y: 0x8d, dir: 0x08 });
    const solo = await recordStops(
      soloGame,
      0,
      spots.map((s) => ({ ...s, room: ARMOS_COURT.room })),
      SIDES,
    );
    await soloGame.close();
    const well = solo.find((row) => row.spot.x === 0x74);
    assert.ok(well, 'solo off-grid stair probe missing');
    assert.ok(
      well.stops.left.end.x <= 0x70,
      `solo off-grid should still center on $0B stairs `
        + `(left-stop x=$${well.stops.left.end.x.toString(16)})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, ARMOS_COURT.room, 0x0d);
    const p2 = await recordStops(
      party,
      1,
      spots.map((s) => ({ ...s, room: ARMOS_COURT.room })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover $0B after a 4px off-grid pose');
  });

  test('leftover in a shop cave after several screens still walks left', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await soloGame.step(5);
    await quietWorld(soloGame);
    await soloGame.openCave(SHOP_CAVE, 0);
    await soloGame.dismissDialogue();
    const solo = await recordStops(soloGame, 0, CAVE_SPOTS, SIDES);
    const fromRight = solo.find((row) => row.spot.x === 0xc0);
    assert.ok(fromRight, 'solo cave right-side probe missing');
    assert.ok(
      fromRight.stops.left.end.x < 0x80,
      `solo cave should walk left from $C0 (stop x=$${fromRight.stops.left.end.x.toString(16)})`,
    );
    await soloGame.close();

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await party.step(5);
    await quietWorld(party);
    await parkLeftover(party, ARMOS_COURT.room, 0x0e);
    await party.openCave(SHOP_CAVE, 1);
    await party.dismissDialogue();
    assert.ok(
      String((await hero(party, 1)).world).startsWith('cave:'),
      'player two should occupy the shop cave',
    );
    const p2 = await recordStops(party, 1, CAVE_SPOTS, SIDES);
    await party.close();
    assertStopsMatch(solo, p2, 'leftover shop cave after parking on $0B');
  });

  test('leftover L1 door tour: walk-in, shove, perpendiculars match solo while host is in a cave', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await enterLabyrinth(soloGame);
    await quietWorld(soloGame);
    const solo = await runDoorLipTour(soloGame, 0);
    await soloGame.close();

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1]);
    await quietWorld(party);
    await party.goRoom(0x53, 0x08, 0);
    await party.goRoom(0x63, 0x08, 0);
    await party.goRoom(0x53, 0x08, 0);
    await pose(party, 1, 0xe0, 0x8d, 0x01, 0x73);
    await parkHostInCave(party, SWORD_CAVE);
    assert.ok(
      String((await hero(party, 1)).world).startsWith('dungeon:'),
      'player two should stay in the labyrinth after the host enters a cave',
    );

    const leftover = await runDoorLipTour(party, 1);
    const still = await hero(party, 1);
    await party.close();
    assert.ok(
      String(still.world).startsWith('dungeon:'),
      `player two left the labyrinth during the tour (${still.world})`,
    );
    assertDoorLipTourMatch(solo, leftover, 'leftover L1 door-lip tour');
  });

  test('leftover L9 $23: walk $12→$13→$23, north shove, Right while host is in a cave', async () => {
    const soloGame = await openGame(browser, { url: server.url });
    await enterLabyrinth(soloGame, [], 9);
    await quietWorld(soloGame);
    const solo = await runL9WaterRoomArrival(soloGame, 0);
    await soloGame.close();
    assert.ok(
      Math.abs(solo.probes[0].moved) >= 8,
      `solo Right along L9 $23 north strip froze `
        + `(${solo.probes[0].start.x},${solo.probes[0].start.y} `
        + `→ ${solo.probes[0].end.x},${solo.probes[0].end.y})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2' });
    await enterLabyrinth(party, [1], 9);
    await quietWorld(party);
    await party.goRoom(0x21, 0x08, 0);
    await party.goRoom(0x22, 0x01, 0);
    await party.goRoom(0x21, 0x08, 0);
    await pose(party, 1, 0xe0, 0x8d, 0x01, 0x12);
    await parkHostInCave(party, SWORD_CAVE);
    const parked = await hero(party, 1);
    assert.ok(
      String(parked.world).startsWith('dungeon:9'),
      `player two should stay in L9 (${parked.world})`,
    );
    assert.equal(parked.linkRoom, 0x12, 'player two should occupy leftover $12');

    const leftover = await runL9WaterRoomArrival(party, 1);
    const after = (await party.state()).heroes;
    await party.close();
    assert.ok(String(after[0].world).startsWith('cave:'), 'host should still occupy the cave');
    assert.ok(
      String(after[1].world).startsWith('dungeon:9'),
      `player two left L9 (${after[1].world})`,
    );
    assert.equal(after[1].linkRoom, L9_WATER_ROOM, 'player two should still occupy leftover $23');
    assertArrivalProbesMatch(solo, leftover, 'leftover L9 $23 after $12→$13→$23 and a north shove');
  });

  test('leftover Q2 L2 $69 south door after walking in from $79 matches solo', async () => {
    const soloGame = await openGame(browser, { url: server.url, query: 'quest=2' });
    await enterLabyrinth(soloGame, [], Q2_L2_PACK);
    await quietWorld(soloGame);
    const solo = await runQ2L2SouthDoorArrival(soloGame, 0);
    await soloGame.close();
    assert.ok(
      Math.abs(solo.probes[0].moved) >= 8,
      `solo Left around Q2 L2 $69 diamonds froze `
        + `(${solo.probes[0].start.x},${solo.probes[0].start.y} `
        + `→ ${solo.probes[0].end.x},${solo.probes[0].end.y})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2&quest=2' });
    await enterLabyrinth(party, [1], Q2_L2_PACK);
    await quietWorld(party);
    await party.goRoom(Q2_L2_START, 0x08, 0);
    await pose(party, 1, 0x78, 0x4d, 0x08, Q2_L2_START);
    await parkHostInCave(party, SWORD_CAVE);
    const parked = await hero(party, 1);
    assert.ok(
      String(parked.world).startsWith('dungeon:'),
      `player two should stay in the labyrinth (${parked.world})`,
    );
    assert.equal(parked.linkRoom, Q2_L2_START, 'player two should occupy leftover $79');

    const leftover = await runQ2L2SouthDoorArrival(party, 1);
    const after = (await party.state()).heroes;
    await party.close();
    assert.ok(String(after[0].world).startsWith('cave:'), 'host should still occupy the cave');
    assert.ok(
      String(after[1].world).startsWith('dungeon:'),
      `player two left the labyrinth (${after[1].world})`,
    );
    assert.equal(after[1].linkRoom, Q2_L2_NORTH, 'player two should occupy leftover $69');
    assertArrivalProbesMatch(solo, leftover, 'leftover Q2 L2 $69 after $79→$69');
  });

  test('Q2 L2 $69 south-door land: immediate Left leaves the cavity', async () => {
    const soloGame = await openGame(browser, { url: server.url, query: 'quest=2' });
    await enterLabyrinth(soloGame, [], Q2_L2_PACK);
    await quietWorld(soloGame);
    const solo = await runQ2L2SouthDoorImmediateStrafe(soloGame, 0);
    await soloGame.close();

    const party = await openGame(browser, { url: server.url, query: 'players=2&quest=2' });
    await enterLabyrinth(party, [1], Q2_L2_PACK);
    await quietWorld(party);
    await pose(party, 0, 0x78, 0x8d, 0x08, Q2_L2_START);
    const p2 = await runQ2L2SouthDoorImmediateStrafe(party, 1);
    await party.close();
    assert.ok(
      Math.abs(p2.left.end.x - solo.left.end.x) <= 1,
      `P2 immediate Left stopped at ${p2.left.end.x},${p2.left.end.y} `
        + `but solo ${solo.left.end.x},${solo.left.end.y}`,
    );
  });

  test('leftover Q2 L2 $69 south-door floor matches solo while host holds $79', async () => {
    const solo = await recordSoloUw(
      Q2_L2_PACK,
      Q2_L2_NORTH,
      Q2_L2_SOUTH_DOOR_SPOTS,
      SIDES,
      'quest=2',
    );
    const well = solo.find((row) => row.spot.x === 0x78 && row.spot.y === 0xb8);
    assert.ok(well, 'solo $69 diamond-row probe missing');
    assert.ok(
      well.stops.left.end.x < 0x70,
      `solo $69 should walk left around the diamonds `
        + `(left-stop x=$${well.stops.left.end.x.toString(16)})`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2&quest=2' });
    await enterLabyrinth(party, [1], Q2_L2_PACK);
    await quietWorld(party);
    await pose(party, 1, 0x78, 0xb8, 0x08, Q2_L2_NORTH);
    await party.goRoom(Q2_L2_START, 0x08, 0);
    await party.step(4);
    assert.equal((await hero(party, 1)).linkRoom, Q2_L2_NORTH);

    const p2 = await recordStops(
      party,
      1,
      Q2_L2_SOUTH_DOOR_SPOTS.map((s) => ({ ...s, room: Q2_L2_NORTH })),
      SIDES,
    );
    await party.close();
    assertStopsMatch(solo, p2, 'leftover Q2 L2 $69 with host on $79');
  });

  test('Q2 L2 walking $79→$69→$59 rebases so $59 is not fogged', async () => {
    const soloGame = await openGame(browser, { url: server.url, query: 'quest=2' });
    await enterLabyrinth(soloGame, [], Q2_L2_PACK);
    await quietWorld(soloGame);
    const solo = await runQ2L2WalkNorthTo59(soloGame, 0);
    const soloState = await soloGame.state();
    await soloGame.close();
    assert.equal(solo.worldRoomId, Q2_L2_FAR_NORTH);
    assert.ok(
      (soloState.uwStreamRooms ?? []).includes(Q2_L2_FAR_NORTH),
      `solo $59 missing from the stream, got ${JSON.stringify(soloState.uwStreamRooms)}`,
    );

    const party = await openGame(browser, { url: server.url, query: 'players=2&quest=2' });
    await enterLabyrinth(party, [1], Q2_L2_PACK);
    await quietWorld(party);
    await party.goRoom(Q2_L2_START, 0x08, 0);
    await pose(party, 1, 0x78, 0x4d, 0x08, Q2_L2_START);
    await parkHostInCave(party, SWORD_CAVE);
    const leftover = await runQ2L2WalkNorthTo59(party, 1);
    const after = await party.state();
    await party.close();
    assert.ok(String(after.heroes[0].world).startsWith('cave:'), 'host should still occupy the cave');
    assert.equal(
      after.heroes[1].linkRoom,
      Q2_L2_FAR_NORTH,
      'player two should occupy leftover $59',
    );
    assert.equal(
      leftover.worldRoomId,
      Q2_L2_FAR_NORTH,
      `leftover $59 world stayed $${(leftover.worldRoomId ?? 0).toString(16)}`,
    );
  });

  test('L4 $31 lava path: walking back and forth keeps both feet on tiles', async () => {
    // Screenshot: L4 overlay `$2c` / Q1 `$31` layout 23. Wiggling the 16px
    // trail used to finish a cell at x=$78 with the right 8px in `$F4`.
    // `?debug=1` grants the stepladder, which must not disable that extra foot.
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game, [], 4);
    await quietWorld(game);
    await game.goRoom(L4_LAVA_MAZE);
    await quietWorld(game);
    await runUwLavaPathTour(game, 0, L4_LAVA_MAZE, 'L4 $31');
    await game.close();
  });

  test('L4 $01 water maze: walking back and forth keeps both feet on tiles', async () => {
    const game = await openGame(browser, { url: server.url });
    await enterLabyrinth(game, [], 4);
    await quietWorld(game);
    await game.goRoom(L4_WATER_MAZE);
    await quietWorld(game);
    await runUwLavaPathTour(game, 0, L4_WATER_MAZE, 'L4 $01');
    await game.close();
  });
});

function localArrival(h) {
  return { x: h.localX, y: h.localY, room: h.linkRoom };
}
