/**
 * Regression tests for the Phase THOROUGH-REVIEW fidelity fixes.
 * Each case cites the ROM label it is derived from.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory, swordBeamHealthOk } from './inventory.js';
import {
  SWORD_PHASE,
  createSwordState,
  stepSword,
  swordSpawnsShot,
  tryStartSword,
} from './sword.js';
import { SWORD } from './inventory.js';
import {
  LINK_QSPEED,
  LINK_QSPEED_STAIRS,
  createLinkState,
  overworldLinkQSpeed,
} from './linkMotion.js';
import { isWandererType, turnRateForType } from './wandererAi.js';
import {
  closeShutterBehind,
  createDoorState,
  dungeonNeighbor,
  isDoorMarkedOpen,
  openDoorPair,
} from './dungeonDoors.js';
import { DIR } from './collision.js';
import {
  FOREST_MAZE_DIRS,
  FOREST_MAZE_ROOM,
  MOUNTAIN_MAZE_DIRS,
  MOUNTAIN_MAZE_ROOM,
  checkMaze,
  createMazeState,
  isMazeRoom,
} from './mazes.js';
import {
  incrementDeathCount,
  nameUnlocksSecondQuest,
  resetProfileToSecondQuest,
  serializeGameState,
  slotSummary,
} from './save.js';
import {
  TRIFORCE_PHASE,
  createTriforceCeremony,
  startTriforceCeremony,
  stepTriforceCeremony,
  triforceCeremonyActive,
} from './triforceCeremony.js';

// --- M13: MakeSwordShot fires at sword state 3 (Z_07.asm CMP #$03) ---

test('sword shot spawns on entering RECOVER_A, not at swing end', () => {
  const sword = createSwordState();
  assert.equal(tryStartSword(sword, 1, SWORD.WOOD), true);

  let spawnFrames = 0;
  let framesUntilSpawn = 0;
  let frame = 0;
  while (sword.phase !== 0) {
    const prev = sword.phase;
    stepSword(sword);
    frame += 1;
    if (swordSpawnsShot(sword, prev)) {
      spawnFrames += 1;
      framesUntilSpawn = frame;
    }
  }

  assert.equal(spawnFrames, 1, 'shot must spawn exactly once per swing');
  // WINDUP 5 + HIT 8 = 13 frames elapse before state 3 begins.
  assert.equal(framesUntilSpawn, 13);
  // The swing runs 16 frames total, so the beam is no longer end-of-swing.
  assert.equal(frame, 16);
});

test('swordSpawnsShot is false while holding RECOVER_A', () => {
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.RECOVER_A;
  assert.equal(swordSpawnsShot(sword, SWORD_PHASE.RECOVER_A), false);
  assert.equal(swordSpawnsShot(sword, SWORD_PHASE.HIT), true);
});

// --- M13: HeartPartial >= $80 lets the beam fire half a heart down ---

test('sword beam fires at full health and half a heart down', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 6;

  inv.halfHearts = 6;
  assert.equal(swordBeamHealthOk(inv), true, 'full health fires');

  inv.halfHearts = 5;
  assert.equal(swordBeamHealthOk(inv), true, 'half heart missing still fires');

  inv.halfHearts = 4;
  assert.equal(swordBeamHealthOk(inv), false, 'a full heart down does not fire');
});

// --- N18: Link_SetSpeed drops to $30 on overworld mountain stairs ---

test('overworld stairs tiles slow Link to $30 and reset posFrac', () => {
  const link = createLinkState();
  link.x = 0x80;
  link.y = 0x80;
  const grid = Array.from({ length: 11 }, () => Array(16).fill(0x74));

  link.posFrac = 0x40;
  assert.equal(overworldLinkQSpeed(link, grid), LINK_QSPEED_STAIRS);
  assert.equal(link.posFrac, 0, 'entering stairs resets the position fraction');
});

test('non-stairs overworld tiles keep the default speed', () => {
  const link = createLinkState();
  link.x = 0x80;
  link.y = 0x80;
  const grid = Array.from({ length: 11 }, () => Array(16).fill(0x00));

  link.posFrac = 0x40;
  assert.equal(overworldLinkQSpeed(link, grid), LINK_QSPEED);
  assert.equal(link.posFrac, 0x40, 'unchanged speed must not clear the fraction');
});

test('holding on stairs does not repeatedly reset posFrac', () => {
  const link = createLinkState();
  link.x = 0x80;
  link.y = 0x80;
  const grid = Array.from({ length: 11 }, () => Array(16).fill(0x75));

  overworldLinkQSpeed(link, grid);
  link.posFrac = 0x20;
  overworldLinkQSpeed(link, grid);
  assert.equal(link.posFrac, 0x20, 'only the transition clears the fraction');
});

test('leftover standingTile wins over the host screen\'s stairs', () => {
  const link = createLinkState(0x80 - 256 * 3, 0x80, 0x02);
  const grid = Array.from({ length: 22 }, () => Array(32).fill(0x74));
  assert.equal(overworldLinkQSpeed(link, grid), LINK_QSPEED_STAIRS);
  assert.equal(
    overworldLinkQSpeed(link, grid, { standingTile: () => 0x26 }),
    LINK_QSPEED,
  );
});

// --- N1: UpdateBubble uses UpdateCommonWanderer with turn rate $40 ---

test('bubbles use the common wanderer at turn rate $40', () => {
  for (const type of [0x2b, 0x2c, 0x2d]) {
    assert.equal(isWandererType(type), true, `type $${type.toString(16)} wanders`);
    assert.equal(turnRateForType(type), 0x40);
  }
});

test('existing wanderer turn rates are unchanged', () => {
  assert.equal(turnRateForType(0x03), 0xa0, 'moblin');
  assert.equal(turnRateForType(0x07), 0x70, 'slow octorok');
  assert.equal(turnRateForType(0x2a), 0x80, 'stalfos');
});

// --- M4: TriggeredDoorCmd $02 shuts the shutter Link walked through ---

test('shutter closes behind Link on entry', () => {
  const state = createDoorState();
  const room = { roomId: 0x43, doors: { north: { type: 'shutter' } } };
  openDoorPair(state, room.roomId, 'north');
  assert.equal(isDoorMarkedOpen(state, room.roomId, 'north'), true);

  assert.equal(closeShutterBehind(state, room, 'north'), true);
  assert.equal(isDoorMarkedOpen(state, room.roomId, 'north'), false);
});

test('close clears the neighbour side of the shared wall', () => {
  const state = createDoorState();
  const room = { roomId: 0x43, doors: { north: { type: 'shutter' } } };
  openDoorPair(state, room.roomId, 'north');
  const neighbour = dungeonNeighbor(room.roomId, DIR.UP);
  assert.equal(isDoorMarkedOpen(state, neighbour, 'south'), true);

  closeShutterBehind(state, room, 'north');
  assert.equal(isDoorMarkedOpen(state, neighbour, 'south'), false);
});

test('key doors and bombable walls ignore the close command', () => {
  // UpdateDoors: "The command to close a key door or bombable wall does not
  // do anything" — only door type 7 reacts.
  for (const type of ['key', 'bombable']) {
    const state = createDoorState();
    const room = { roomId: 0x22, doors: { west: { type } } };
    openDoorPair(state, room.roomId, 'west');
    assert.equal(closeShutterBehind(state, room, 'west'), false, type);
    assert.equal(isDoorMarkedOpen(state, room.roomId, 'west'), true, type);
  }
});

test('closing an already-shut shutter is a no-op', () => {
  const state = createDoorState();
  const room = { roomId: 0x22, doors: { east: { type: 'shutter' } } };
  assert.equal(closeShutterBehind(state, room, 'east'), false);
});

// --- M6: GameMode $12 triforce ceremony ---

test('triforce ceremony flashes then fills hearts to full', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 6;
  inv.halfHearts = 1;

  const c = createTriforceCeremony();
  assert.equal(triforceCeremonyActive(c), false);
  startTriforceCeremony(c);
  assert.equal(triforceCeremonyActive(c), true);

  let sawFlash = false;
  let finished = false;
  for (let i = 0; i < 4000 && !finished; i += 1) {
    const step = stepTriforceCeremony(c, inv);
    if (c.whiteFlash) sawFlash = true;
    finished = step.finished;
  }

  assert.equal(finished, true, 'ceremony must terminate');
  assert.equal(sawFlash, true, 'palette must flash during the fanfare');
  assert.equal(inv.halfHearts, 6, 'hearts end full');
  assert.equal(triforceCeremonyActive(c), false);
});

test('triforce ceremony records the finder so co-op fills the right hero', () => {
  const c = createTriforceCeremony();
  startTriforceCeremony(c, 1);
  assert.equal(c.playerIndex, 1);
  const finder = createInventory();
  finder.maxHalfHearts = 6;
  finder.halfHearts = 1;
  const other = createInventory();
  other.maxHalfHearts = 6;
  other.halfHearts = 2;
  let finished = false;
  for (let i = 0; i < 4000 && !finished; i += 1) {
    finished = stepTriforceCeremony(c, finder).finished;
  }
  assert.equal(finder.halfHearts, 6, 'the finder must be topped up');
  assert.equal(other.halfHearts, 2, 'an ally must keep their own meter');
});

// --- B1/B2: CheckMazes ---

/** Walk a sequence of exit directions, returning the results. */
function walkMaze(room, dirs) {
  const state = createMazeState();
  return dirs.map((d) => checkMaze(state, room, d));
}

test('Lost Woods opens on Up, Left, Down, Left', () => {
  const results = walkMaze(FOREST_MAZE_ROOM, FOREST_MAZE_DIRS);
  assert.deepEqual(
    results.map((r) => r.allowExit),
    [false, false, false, true],
    'only the final step lets the player out',
  );
  assert.equal(results.at(-1).solved, true);
  assert.equal(results.at(-1).playSecretTune, true, 'Tune1Request $04');
});

test('Lost Hills opens on Up four times', () => {
  const results = walkMaze(MOUNTAIN_MAZE_ROOM, MOUNTAIN_MAZE_DIRS);
  assert.deepEqual(
    results.map((r) => r.allowExit),
    [false, false, false, true],
  );
  assert.equal(results.at(-1).playSecretTune, true);
});

test('a wrong direction resets maze progress', () => {
  const state = createMazeState();
  checkMaze(state, FOREST_MAZE_ROOM, DIR.UP);
  assert.equal(state.step, 1);
  // Down is wrong at step 1 (Left is expected) and is not the free exit.
  const r = checkMaze(state, FOREST_MAZE_ROOM, DIR.DOWN);
  assert.equal(r.allowExit, false);
  assert.equal(state.step, 0, 'progress is lost');
});

test('the free direction exits without resetting the step', () => {
  // Forest: Right always allows exit. Mountain: Left does.
  const forest = createMazeState();
  checkMaze(forest, FOREST_MAZE_ROOM, DIR.UP);
  const fr = checkMaze(forest, FOREST_MAZE_ROOM, DIR.RIGHT);
  assert.equal(fr.allowExit, true);
  assert.equal(forest.step, 1, 'free exit preserves progress');

  const hills = createMazeState();
  checkMaze(hills, MOUNTAIN_MAZE_ROOM, DIR.UP);
  const hr = checkMaze(hills, MOUNTAIN_MAZE_ROOM, DIR.LEFT);
  assert.equal(hr.allowExit, true);
  assert.equal(hills.step, 1);
});

test('the two mazes have different free directions', () => {
  // Right is free in the forest but resets in the hills.
  const hills = createMazeState();
  checkMaze(hills, MOUNTAIN_MAZE_ROOM, DIR.UP);
  const r = checkMaze(hills, MOUNTAIN_MAZE_ROOM, DIR.RIGHT);
  assert.equal(r.allowExit, false);
  assert.equal(hills.step, 0);
});

test('leaving a non-maze screen does not clear maze progress', () => {
  const state = createMazeState();
  checkMaze(state, FOREST_MAZE_ROOM, DIR.UP);
  assert.equal(state.step, 1);
  // Free-exit east, then leave the eastern neighbor — NES keeps MazeStep.
  checkMaze(state, FOREST_MAZE_ROOM, DIR.RIGHT);
  const r = checkMaze(state, 0x62, DIR.LEFT);
  assert.equal(r.allowExit, true, 'ordinary screens are unaffected');
  assert.equal(state.step, 1, 'progress survives the detour');
});

test('only $61 and $1B are maze screens', () => {
  assert.equal(isMazeRoom(FOREST_MAZE_ROOM), true);
  assert.equal(isMazeRoom(MOUNTAIN_MAZE_ROOM), true);
  assert.equal(isMazeRoom(0x77), false);
});

// --- B6: second-quest unlock paths ---

test('registering ZELDA unlocks the second quest', () => {
  assert.equal(nameUnlocksSecondQuest('ZELDA'), true);
  assert.equal(nameUnlocksSecondQuest('zelda'), true, 'names are upper-cased');
  // The ROM compares only the first 5 characters.
  assert.equal(nameUnlocksSecondQuest('ZELDAAA'), true);
});

test('other names stay on the first quest', () => {
  for (const name of ['LINK', 'ZELD', 'AZELDA', '']) {
    assert.equal(nameUnlocksSecondQuest(name), false, name);
  }
});

test('second-quest profile switch wipes items and restores 3 hearts', () => {
  const inv = createInventory();
  inv.sword = 3;
  inv.bombs = 8;
  inv.triforce = 0xff;
  inv.rupees = 200;
  inv.maxHalfHearts = 32;
  inv.halfHearts = 4;

  resetProfileToSecondQuest(inv);

  assert.equal(inv.quest, 2);
  assert.equal(inv.sword, 0, 'items are cleared');
  assert.equal(inv.triforce, 0);
  assert.equal(inv.rupees, 0);
  assert.equal(inv.maxHalfHearts, 6, '3 heart containers');
  assert.equal(inv.halfHearts, 6, 'all hearts full');
  assert.equal(inv.maxBombs, 8);
});

// --- B4: DeathCounts ---

test('death count increments and saturates at $FF', () => {
  assert.equal(incrementDeathCount(0), 1);
  assert.equal(incrementDeathCount(5), 6);
  assert.equal(incrementDeathCount(0xfe), 0xff);
  assert.equal(incrementDeathCount(0xff), 0xff, 'capped like INC DeathCounts');
});

test('death count survives a save round trip', () => {
  const payload = serializeGameState({ inv: createInventory(), deaths: 12 });
  assert.equal(payload.deaths, 12);
  assert.equal(slotSummary(payload).deaths, 12);
});

test('hearts do not fill during the fanfare phase', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 6;
  inv.halfHearts = 1;

  const c = createTriforceCeremony();
  startTriforceCeremony(c);
  stepTriforceCeremony(c, inv);
  assert.equal(inv.halfHearts, 1, 'fanfare runs before the refill');
  assert.equal(c.phase, TRIFORCE_PHASE.FANFARE);
});
