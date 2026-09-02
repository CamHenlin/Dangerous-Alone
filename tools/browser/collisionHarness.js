/**
 * Record wall-stop poses so leftover / split-screen walking can be compared
 * to a solo walk in the same room, at the same local pixel.
 */

import assert from 'node:assert/strict';
import { DIR } from '../shared/collision.js';
import { KEYS, hero, pose, walkUntilStopped } from './movementHarness.js';

export const DIR_BIT = Object.freeze({
  left: DIR.LEFT,
  right: DIR.RIGHT,
  up: DIR.UP,
  down: DIR.DOWN,
});

export const AXIS = Object.freeze({
  left: 'x',
  right: 'x',
  up: 'y',
  down: 'y',
});

/**
 * Occupying-room local pose. `x`/`y` on the hero are still anchor-relative.
 * @param {object} h
 */
export function localPose(h) {
  return {
    x: h.localX,
    y: h.localY,
    room: h.linkRoom,
    worldRoomId: h.worldRoomId,
    ax: h.x,
    ay: h.y,
  };
}

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {{ x: number, y: number, room?: number }} spot
 * @param {'left'|'right'|'up'|'down'} dir
 * @param {number} [max]
 */
export async function stopAgainst(game, index, spot, dir, max) {
  await pose(game, index, spot.x, spot.y, DIR_BIT[dir], spot.room);
  await game.step(2);
  const start = localPose(await hero(game, index));
  const trace = await walkUntilStopped(game, index, KEYS[index][dir], max);
  const end = localPose(await hero(game, index));
  return {
    dir,
    start,
    end,
    frames: trace.length,
    moved: end[AXIS[dir]] - start[AXIS[dir]],
  };
}

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {readonly { x: number, y: number, room?: number }[]} spots
 * @param {readonly ('left'|'right'|'up'|'down')[]} [dirs]
 * @param {number} [max]
 */
export async function recordStops(game, index, spots, dirs = ['left', 'right'], max) {
  /** @type {{ spot: { x: number, y: number, room?: number }, stops: Record<string, Awaited<ReturnType<typeof stopAgainst>>> }[]} */
  const out = [];
  for (const spot of spots) {
    /** @type {Record<string, Awaited<ReturnType<typeof stopAgainst>>>} */
    const stops = {};
    for (const dir of dirs) {
      stops[dir] = await stopAgainst(game, index, spot, dir, max);
    }
    out.push({ spot, stops });
  }
  return out;
}

/**
 * @param {Awaited<ReturnType<recordStops>>} expected
 * @param {Awaited<ReturnType<recordStops>>} actual
 * @param {string} label
 * @param {number} [tol]
 */
export function assertStopsMatch(expected, actual, label, tol = 1) {
  assert.equal(actual.length, expected.length, `${label}: spot count`);
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i];
    const got = actual[i];
    for (const dir of Object.keys(exp.stops)) {
      const e = exp.stops[dir];
      const g = got.stops[dir];
      const dx = Math.abs(g.end.x - e.end.x);
      const dy = Math.abs(g.end.y - e.end.y);
      assert.ok(
        dx <= tol && dy <= tol,
        `${label} spot (${exp.spot.x},${exp.spot.y}) ${dir}: `
          + `solo stopped at local ${e.end.x},${e.end.y} room $${e.end.room?.toString(16)} `
          + `but got ${g.end.x},${g.end.y} room $${g.end.room?.toString(16)} `
          + `(anchor ${g.end.worldRoomId?.toString(16)} ax=${g.end.ax},${g.end.ay})`,
      );
    }
  }
}

/**
 * Keep only probes that never left the occupying cell. Use these for tree /
 * block walls; screen-exit walks belong in a leftover-cross test of their own.
 * @param {Awaited<ReturnType<recordStops>>} stops
 */
export function inRoomStops(stops) {
  return stops.filter((row) =>
    Object.values(row.stops).every((s) => s.end.room === s.start.room),
  );
}

/**
 * Hold a direction until this hero occupies `destRoom`.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {string} key
 * @param {number} destRoom
 * @param {number} [max]
 */
export async function walkIntoRoom(game, index, key, destRoom, max = 420) {
  await game.hold(key);
  let reached = false;
  for (let i = 0; i < max; i += 1) {
    await game.step(1);
    if ((await hero(game, index)).linkRoom === destRoom) {
      reached = true;
      break;
    }
  }
  await game.release(key);
  await game.step(8);
  assert.ok(
    reached,
    `player ${index + 1} never walked into $${destRoom.toString(16)} `
      + `(still $${((await hero(game, index)).linkRoom ?? 0).toString(16)})`,
  );
}

/**
 * Walk a leftover (or solo) hero through several rooms, holding each key
 * until that cell is occupied. Callers pose at a lip before the first leg.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {readonly { key: string, dest: number, max?: number }[]} legs
 */
export async function walkPath(game, index, legs) {
  for (const leg of legs) {
    await walkIntoRoom(game, index, leg.key, leg.dest, leg.max);
  }
  return localPose(await hero(game, index));
}

export const START_LIP = Object.freeze({
  right: { x: 0xe0, y: 0x8d, dir: DIR.RIGHT, key: 'right', host: 0x78 },
  left: { x: 0x11, y: 0x8d, dir: DIR.LEFT, key: 'left', host: 0x76 },
  up: { x: 0x78, y: 0x4d, dir: DIR.UP, key: 'up', host: 0x67 },
});

/**
 * Park player one on a screen lip so a short walk takes the anchor, leaving
 * player two leftover in the start cell.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {'left'|'right'|'up'|'down'} side
 */
export async function splitAnchor(game, side) {
  const lip = START_LIP[side];
  if (!lip) throw new Error(`splitAnchor: no lip for ${side}`);
  await pose(game, 0, lip.x, lip.y, lip.dir);
  await pose(game, 1, 0x78, 0x8d, 0x08);
  await game.press([KEYS[0][lip.key]], 120);
  const split = (await game.state()).heroes;
  assert.equal(
    split[0].linkRoom,
    lip.host,
    `player one should have crossed ${side} into $${lip.host.toString(16)}`,
  );
  assert.equal(split[1].linkRoom, 0x77, 'player two should have stayed leftover in $77');
  return split;
}

/**
 * After a one-screen split, walk the host one more screen the same way.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {'left'|'right'|'up'|'down'} side
 * @param {number} destRoom
 */
export async function hostContinues(game, side, destRoom) {
  const lip = START_LIP[side];
  const hostRoom = (await hero(game, 0)).linkRoom;
  await pose(game, 0, lip.x, lip.y, lip.dir, hostRoom);
  await game.press([KEYS[0][lip.key]], 140);
  const h = await hero(game, 0);
  assert.equal(
    h.linkRoom,
    destRoom,
    `host should have continued ${side} into $${destRoom.toString(16)} `
      + `(still $${(h.linkRoom ?? 0).toString(16)})`,
  );
}

/**
 * Reorder `actual` to follow `expected`'s spots.
 * @param {Awaited<ReturnType<recordStops>>} expected
 * @param {Awaited<ReturnType<recordStops>>} actual
 */
export function alignStops(expected, actual) {
  const keyed = new Map(actual.map((row) => [`${row.spot.x},${row.spot.y}`, row]));
  return expected.map((row) => keyed.get(`${row.spot.x},${row.spot.y}`)).filter(Boolean);
}

export async function splitEastFromStart(game) {
  return splitAnchor(game, 'right');
}

/**
 * Drop the party onto `hostRoom` and pose player two leftover in `leftoverRoom`.
 * Two-room leftover used to get yanked onto the neighbour seam on the next step.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} leftoverRoom
 * @param {number} hostRoom
 */
export async function parkLeftover(game, leftoverRoom, hostRoom) {
  await game.returnToOverworld(hostRoom, { x: 0x78, y: 0x8d, dir: 0x01 }, 0);
  await pose(game, 0, 0x78, 0x8d, 0x01, hostRoom);
  await pose(game, 1, 0x78, 0x8d, 0x08, leftoverRoom);
  await game.step(4);
  const host = await hero(game, 0);
  const leftover = await hero(game, 1);
  assert.equal(
    host.linkRoom,
    hostRoom,
    `host should occupy $${hostRoom.toString(16)}`,
  );
  assert.equal(
    leftover.linkRoom,
    leftoverRoom,
    `player two should occupy leftover $${leftoverRoom.toString(16)} `
      + `(still $${(leftover.linkRoom ?? 0).toString(16)} ax=${leftover.x})`,
  );
}

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 */
export async function quietWorld(game) {
  await game.page.evaluate(() => {
    window.zeldaDebug.cheats.invincible = true;
    window.zeldaDebug.killScreen();
  });
}

/**
 * Kill clear-counting foes in this hero's occupying cell, including ones
 * waiting off-camera (Wallmasters). `killScreen` will not unlatch those rooms.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 */
export async function quietOccupyingRoom(game) {
  await game.page.evaluate(() => {
    window.zeldaDebug.cheats.invincible = true;
    window.zeldaDebug.killRoomFoes();
  });
  await game.step(8);
}

/**
 * Occupying-room pose after a walk. `recordStops` spots use this shape.
 * @param {object} h
 */
export function arrivalSpot(h) {
  return { x: h.localX, y: h.localY, room: h.linkRoom };
}

/**
 * @param {{ x: number, y: number, room: number }} expected
 * @param {{ x: number, y: number, room: number }} actual
 * @param {string} label
 * @param {number} [tol]
 */
export function assertArrivalMatch(expected, actual, label, tol = 1) {
  assert.equal(
    actual.room,
    expected.room,
    `${label}: room $${actual.room?.toString(16)} vs $${expected.room?.toString(16)}`,
  );
  const dx = Math.abs(actual.x - expected.x);
  const dy = Math.abs(actual.y - expected.y);
  assert.ok(
    dx <= tol && dy <= tol,
    `${label}: arrived ${actual.x},${actual.y} but solo ${expected.x},${expected.y}`,
  );
}

/**
 * 16px north-wall stair well on OW `$11` (Death Mountain). The leftover
 * misalignment that looks like "can only climb while overlapping the right
 * rock" is a left-stop that never reaches this column.
 */
export const NORTH_STAIR = Object.freeze({
  room: 0x11,
  x: 0x78,
  y: 0x4d,
});

/** Mountain-stair mouth on OW `$3C`, climbed from `$4C` to the south. */
export const MOUNTAIN_STAIR = Object.freeze({
  room: 0x3c,
  fromRoom: 0x4c,
  x: 0x70,
  y: 0xcd,
});

/** Probes inside `$11`'s 16px stair gap. The sand at `$5D` opens west into `$10`. */
export const NORTH_STAIR_SPOTS = Object.freeze([
  { x: 0x78, y: 0x4d },
  { x: 0x70, y: 0x4d },
  { x: 0x80, y: 0x4d },
]);

/** Sand at the `$11` stair mouth. A left walk here crosses into `$10`. */
export const NORTH_STAIR_MOUTH = Object.freeze({ x: 0x78, y: 0x5d });

/** Probes along `$3C`'s south-edge mountain stairs. */
export const MOUNTAIN_STAIR_SPOTS = Object.freeze([
  { x: 0x70, y: 0xcd },
  { x: 0x78, y: 0xcd },
  { x: 0x68, y: 0xcd },
  { x: 0x70, y: 0xbd },
]);

/**
 * Dungeon 5 entrance (`$0B`): Armos court and a 16px south-wall stair well.
 * Knockback that sticks 4px off-grid walks through the statues and climbs
 * the stairs half on the rock.
 */
export const ARMOS_COURT = Object.freeze({
  room: 0x0b,
  fromRoom: 0x1b,
  x: 0x70,
  y: 0x4d,
});

/** West of the statues, open sand between the Armos rows, and the south stairs.
 * Avoid walking into Armos after `killScreen` — that clears the statue
 * objects and can open the tiles under them for solo but not leftover.
 */
export const ARMOS_SPOTS = Object.freeze([
  { x: 0x20, y: 0x8d },
  { x: 0x78, y: 0x8d },
  { x: 0xd0, y: 0x8d },
  { x: 0x70, y: 0xcd },
  { x: 0x78, y: 0xcd },
]);

/** 16px south-wall stair well on `$0B`, climbed from `$1B`. */
export const ARMOS_STAIR_SPOTS = Object.freeze([
  { x: 0x70, y: 0xcd },
  { x: 0x78, y: 0xcd },
  { x: 0x70, y: 0xbd },
]);

/** A shop cave (Mode B) — same "WALK TO ITEM SOUTH TO LEAVE" interior. */
export const SHOP_CAVE = 0x1d;

/** Open-floor probes inside a cave; left must reach the west lip, not freeze. */
export const CAVE_SPOTS = Object.freeze([
  { x: 0x78, y: 0x8d },
  { x: 0xa0, y: 0x8d },
  { x: 0x50, y: 0x8d },
  { x: 0xc0, y: 0xb8 },
]);

/**
 * L9 `$23`: water floor with a dry north BoundByRoom strip. A leftover hero
 * who took a hit at the north door used to freeze on Right — corridor clamp
 * treated walk-grid `$5D` as the door hole.
 */
export const L9_WATER_ROOM = 0x23;
export const L9_NORTH_OF_WATER = 0x13;
export const L9_WEST_OF_13 = 0x12;
export const L9_NORTH_LIP_SPOTS = Object.freeze([
  { x: 0x78, y: 0x5e },
  { x: 0x80, y: 0x5e },
  { x: 0x80, y: 0x5d },
  { x: 0x88, y: 0x5e },
]);

/**
 * Quest 2 HUD LEVEL-2 is dungeon pack 3 (start `$79`). `$69` is the room
 * north of the entrance; diamonds sit on the south-door column.
 */
export const Q2_L2_PACK = 3;
export const Q2_L2_START = 0x79;
export const Q2_L2_NORTH = 0x69;
export const Q2_L2_FAR_NORTH = 0x59;
export const Q2_L2_SOUTH_DOOR_SPOTS = Object.freeze([
  { x: 0x78, y: 0xb8 },
  { x: 0x70, y: 0xb8 },
  { x: 0x80, y: 0xb8 },
  { x: 0x78, y: 0xbd },
  { x: 0x78, y: 0xc0 },
]);

/**
 * Stay inside the entry doorway band so DoorwayDir / the corridor clamp stay
 * live. North `$5E–$67` is still `nearDoorway` (depth max `$68`); walking
 * deeper onto L9 `$23` water would need the stepladder.
 */
const ENTRY_LIP = Object.freeze({
  right: Object.freeze({ axis: 'x', lo: 0x21, hi: 0x2f }),
  left: Object.freeze({ axis: 'x', lo: 0xd0, hi: 0xde }),
  down: Object.freeze({ axis: 'y', lo: 0x5e, hi: 0x67 }),
  up: Object.freeze({ axis: 'y', lo: 0xbd, hi: 0xc6 }),
});

/**
 * Start a NES `$20` knockback and let it finish. Does not pose — leftover
 * keeps the walk-in door latch.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {'left'|'right'|'up'|'down'|number} dir
 * @param {number} [pixels]
 */
export async function shoveHero(game, index, dir, pixels = 0x20) {
  const bit = typeof dir === 'string' ? DIR_BIT[dir] : dir;
  await game.page.evaluate(({ i, d, n }) => window.zeldaDebug.shoveHero(i, d, n), {
    i: index,
    d: bit,
    n: pixels,
  });
  await game.step(24);
}

/**
 * Walk until stopped from the current pose. Unlike `stopAgainst`, this does
 * not `pose` first — `poseHero` clears `uwDoorwayBlockSide`.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {'left'|'right'|'up'|'down'} dir
 * @param {number} [max]
 */
export async function stopFromHere(game, index, dir, max) {
  const start = localPose(await hero(game, index));
  const trace = await walkUntilStopped(game, index, KEYS[index][dir], max);
  const end = localPose(await hero(game, index));
  return {
    dir,
    start,
    end,
    frames: trace.length,
    moved: end[AXIS[dir]] - start[AXIS[dir]],
  };
}

/**
 * After a door walk-in, keep walking until the feet sit on the inner floor
 * lip of that entry. Stops inside the doorway band so the corridor latch
 * is still armed the way a real hit at the door is.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {'left'|'right'|'up'|'down'} intoDir
 * @param {number} dest
 * @param {number} [max]
 */
export async function walkOntoEntryLip(game, index, intoDir, dest, max = 100) {
  const band = ENTRY_LIP[intoDir];
  if (!band) throw new Error(`walkOntoEntryLip: no band for ${intoDir}`);
  const local = (h) => (band.axis === 'x' ? h.localX : h.localY);
  const inBand = (h) =>
    h.linkRoom === dest && local(h) >= band.lo && local(h) <= band.hi;
  if (inBand(await hero(game, index))) return localPose(await hero(game, index));
  await game.hold(KEYS[index][intoDir]);
  let ok = false;
  for (let i = 0; i < max; i += 1) {
    await game.step(1);
    if (inBand(await hero(game, index))) {
      ok = true;
      break;
    }
  }
  await game.release(KEYS[index][intoDir]);
  await game.step(4);
  const h = await hero(game, index);
  assert.ok(
    ok || inBand(h),
    `player ${index + 1} never reached the ${intoDir} lip in $${dest.toString(16)} `
      + `(local ${h.localX},${h.localY} room $${(h.linkRoom ?? 0).toString(16)})`,
  );
  return localPose(h);
}

/**
 * Hold `dir` until `pred` is true. Fails instead of hanging.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {'left'|'right'|'up'|'down'} dir
 * @param {(h: object) => boolean} pred
 * @param {string} label
 * @param {number} [max]
 */
export async function holdUntil(game, index, dir, pred, label, max = 240) {
  await game.hold(KEYS[index][dir]);
  let ok = false;
  for (let i = 0; i < max; i += 1) {
    await game.step(1);
    if (pred(await hero(game, index))) {
      ok = true;
      break;
    }
  }
  await game.release(KEYS[index][dir]);
  await game.step(4);
  const h = await hero(game, index);
  assert.ok(
    ok,
    `${label} (local ${h.localX},${h.localY} room $${(h.linkRoom ?? 0).toString(16)})`,
  );
}

/**
 * Send player one to a cave without bringing leftover along. The screenshot
 * freeze was leftover in L9 while the host stood in the sword cave.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} [caveId]
 */
export async function parkHostInCave(game, caveId = 0x10) {
  await game.returnToOverworld(0x77, { x: 0x78, y: 0x8d, dir: 0x01 }, 0);
  await game.openCave(caveId, 0);
  await game.dismissDialogue();
  const host = await hero(game, 0);
  assert.ok(
    String(host.world).startsWith('cave:'),
    `host should occupy a cave (got ${host.world})`,
  );
}

/**
 * Walk through `dest`'s door from the neighbouring lip, step onto the floor
 * strip, take a knockback toward the door, then hold each perpendicular
 * without posing. That is the leftover freeze: live DoorwayDir + 1px overflow
 * + corridor clamp snapping the other axis onto the opening.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {{
 *   name: string,
 *   approach: { x: number, y: number, dir: number, room: number },
 *   walkKey: 'left'|'right'|'up'|'down',
 *   dest: number,
 *   intoDir: 'left'|'right'|'up'|'down',
 *   shoveDir: 'left'|'right'|'up'|'down',
 *   perps: readonly ('left'|'right'|'up'|'down')[],
 * }} leg
 */
export async function probeDoorArrival(game, index, leg) {
  const { approach } = leg;
  await pose(game, index, approach.x, approach.y, approach.dir, approach.room);
  await quietWorld(game);
  await walkIntoRoom(game, index, KEYS[index][leg.walkKey], leg.dest);
  await quietWorld(game);
  await walkOntoEntryLip(game, index, leg.intoDir, leg.dest);
  await shoveHero(game, index, leg.shoveDir);
  const afterShove = localPose(await hero(game, index));
  assert.equal(
    afterShove.room,
    leg.dest,
    `${leg.name}: shove left $${leg.dest.toString(16)} `
      + `(now $${(afterShove.room ?? 0).toString(16)} at ${afterShove.x},${afterShove.y})`,
  );
  /** @type {Awaited<ReturnType<typeof stopFromHere>>[]} */
  const probes = [];
  for (const dir of leg.perps) {
    probes.push(await stopFromHere(game, index, dir));
  }
  return { name: leg.name, dest: leg.dest, afterShove, probes };
}

/**
 * Open L1 doors covering the west-wall Y-clamp and the north-door X-clamp.
 * Pose only at each approach lip; the walk-in, shove, and perpendiculars
 * keep the live latch.
 */
export const L1_DOOR_LIP_TOUR = Object.freeze([
  {
    name: 'L1 $74 west door',
    approach: { x: 0xe0, y: 0x8d, dir: DIR.RIGHT, room: 0x73 },
    walkKey: 'right',
    dest: 0x74,
    intoDir: 'right',
    shoveDir: 'left',
    perps: Object.freeze(['up', 'down']),
  },
  {
    name: 'L1 $72 east door',
    approach: { x: 0x21, y: 0x8d, dir: DIR.LEFT, room: 0x73 },
    walkKey: 'left',
    dest: 0x72,
    intoDir: 'left',
    shoveDir: 'right',
    perps: Object.freeze(['up', 'down']),
  },
  {
    name: 'L1 $63 south door',
    approach: { x: 0x78, y: 0x4d, dir: DIR.UP, room: 0x73 },
    walkKey: 'up',
    dest: 0x63,
    intoDir: 'up',
    shoveDir: 'down',
    perps: Object.freeze(['right', 'left']),
  },
]);

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {readonly typeof L1_DOOR_LIP_TOUR[number][]} [legs]
 */
export async function runDoorLipTour(game, index, legs = L1_DOOR_LIP_TOUR) {
  const out = [];
  for (const leg of legs) {
    out.push(await probeDoorArrival(game, index, leg));
  }
  return out;
}

/**
 * Walk leftover (or solo) `$12 → $13 → $23`, step onto the north strip, take
 * a north knockback, then Right then Left without posing. Screenshot freeze.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 */
export async function runL9WaterRoomArrival(game, index) {
  await pose(game, index, 0xe0, 0x8d, DIR.RIGHT, L9_WEST_OF_13);
  await quietWorld(game);
  await walkIntoRoom(game, index, KEYS[index].right, L9_NORTH_OF_WATER);
  await quietWorld(game);
  // $13's unique floor is open, but the south key face is the cavity — pose
  // onto that lip so the $23 walk-in (not a mid-room wander) sets DoorwayDir.
  await pose(game, index, 0x78, 0xcd, DIR.DOWN, L9_NORTH_OF_WATER);
  await walkIntoRoom(game, index, KEYS[index].down, L9_WATER_ROOM, 520);
  await quietWorld(game);
  await walkOntoEntryLip(game, index, 'down', L9_WATER_ROOM);
  await shoveHero(game, index, 'up');
  const afterShove = localPose(await hero(game, index));
  assert.equal(
    afterShove.room,
    L9_WATER_ROOM,
    `L9 $23 shove left the water room (now $${(afterShove.room ?? 0).toString(16)} `
      + `at ${afterShove.x},${afterShove.y})`,
  );
  const right = await stopFromHere(game, index, 'right');
  const left = await stopFromHere(game, index, 'left');
  return { name: 'L9 $23 north door', dest: L9_WATER_ROOM, afterShove, probes: [right, left] };
}

/**
 * Walk `$79 → $69` through the south door, bump the diamond row, then Left
 * and Right without posing. Screenshot freeze: leftover could not leave the
 * door column to reach the key.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 */
export async function runQ2L2SouthDoorArrival(game, index) {
  await pose(game, index, 0x78, 0x4d, DIR.UP, Q2_L2_START);
  await quietWorld(game);
  await walkIntoRoom(game, index, KEYS[index].up, Q2_L2_NORTH, 420);
  await quietWorld(game);
  await walkUntilStopped(game, index, KEYS[index].up);
  const afterUp = localPose(await hero(game, index));
  assert.equal(
    afterUp.room,
    Q2_L2_NORTH,
    `Q2 L2 $69 up-walk left $${Q2_L2_NORTH.toString(16)} `
      + `(now $${(afterUp.room ?? 0).toString(16)} at ${afterUp.x},${afterUp.y})`,
  );
  const left = await stopFromHere(game, index, 'left');
  const right = await stopFromHere(game, index, 'right');
  return {
    name: 'Q2 L2 $69 south door',
    dest: Q2_L2_NORTH,
    afterUp,
    probes: [left, right],
  };
}

/**
 * The screenshot freeze: after the `$79 → $69` south-door land, walk onto
 * the unique-floor lip (`y<=$C4`) then Left. Do not remap Left to Up.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 */
export async function runQ2L2SouthDoorImmediateStrafe(game, index) {
  await pose(game, index, 0x78, 0x4d, DIR.UP, Q2_L2_START);
  await quietWorld(game);
  await walkIntoRoom(game, index, KEYS[index].up, Q2_L2_NORTH, 420);
  await quietWorld(game);
  await game.hold(KEYS[index].up);
  for (let i = 0; i < 80; i += 1) {
    const here = localPose(await hero(game, index));
    if (here.room === Q2_L2_NORTH && here.y <= 0xc4) break;
    await game.step(1);
  }
  await game.release(KEYS[index].up);
  await game.step(2);
  const arrived = localPose(await hero(game, index));
  assert.equal(
    arrived.room,
    Q2_L2_NORTH,
    `Q2 L2 $69 south-door land left $${Q2_L2_NORTH.toString(16)} `
      + `(now $${(arrived.room ?? 0).toString(16)} at ${arrived.x},${arrived.y})`,
  );
  assert.ok(
    arrived.y <= 0xc4,
    `Q2 L2 $69 never reached the south lip (y=$${arrived.y.toString(16)})`,
  );
  const left = await stopFromHere(game, index, 'left');
  assert.ok(
    left.end.y >= 0xbd,
    `Q2 L2 $69 Left walked north into the diamonds `
      + `(${left.start.x},${left.start.y} → ${left.end.x},${left.end.y})`,
  );
  assert.ok(
    left.end.x < 0x70,
    `Q2 L2 $69 Left froze in the south door `
      + `(${left.start.x},${left.start.y} → ${left.end.x},${left.end.y} `
      + `room $${(left.end.room ?? 0).toString(16)})`,
  );
  return { arrived, left };
}

/**
 * Walk `$79 → $69 → $59`. Occupancy used to flip to `$59` in the south door
 * hole before `$69`'s north seam was tested, so the world never rebased and
 * `$59` stayed fogged (black void with only the south doorway).
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 */
export async function runQ2L2WalkNorthTo59(game, index) {
  await pose(game, index, 0x78, 0x4d, DIR.UP, Q2_L2_START);
  await quietWorld(game);
  await walkIntoRoom(game, index, KEYS[index].up, Q2_L2_NORTH, 420);
  await quietWorld(game);
  // Diamonds block the south-door column; the bug is the $69 north seam.
  await pose(game, index, 0x78, 0x4d, DIR.UP, Q2_L2_NORTH);
  await walkIntoRoom(game, index, KEYS[index].up, Q2_L2_FAR_NORTH, 420);
  await quietWorld(game);
  const arrived = localPose(await hero(game, index));
  assert.equal(
    arrived.room,
    Q2_L2_FAR_NORTH,
    `Q2 L2 $59 occupancy became $${Q2_L2_FAR_NORTH.toString(16)} `
      + `(now $${(arrived.room ?? 0).toString(16)} at ${arrived.x},${arrived.y})`,
  );
  assert.equal(
    arrived.worldRoomId,
    Q2_L2_FAR_NORTH,
    `Q2 L2 $59 world never rebased `
      + `(occupying $${(arrived.room ?? 0).toString(16)} `
      + `world $${(arrived.worldRoomId ?? 0).toString(16)} `
      + `at ${arrived.x},${arrived.y})`,
  );
  return arrived;
}

/**
 * @param {{ name?: string, dest: number, afterShove: object, probes: Awaited<ReturnType<typeof stopFromHere>>[] }} expected
 * @param {{ name?: string, dest: number, afterShove: object, probes: Awaited<ReturnType<typeof stopFromHere>>[] }} actual
 * @param {string} label
 * @param {number} [tol]
 */
export function assertArrivalProbesMatch(expected, actual, label, tol = 1) {
  assert.equal(
    actual.dest,
    expected.dest,
    `${label}: room $${(actual.dest ?? 0).toString(16)} vs $${(expected.dest ?? 0).toString(16)}`,
  );
  assert.equal(actual.probes.length, expected.probes.length, `${label}: probe count`);
  for (let i = 0; i < expected.probes.length; i += 1) {
    const e = expected.probes[i];
    const g = actual.probes[i];
    assert.equal(g.dir, e.dir, `${label}: probe ${i} dir`);
    assert.ok(
      Math.abs(g.moved) >= 8,
      `${label} ${g.dir}: leftover froze `
        + `(${g.start.x},${g.start.y} → ${g.end.x},${g.end.y} `
        + `room $${(g.end.room ?? 0).toString(16)})`,
    );
    assert.equal(
      g.end.room,
      e.end.room,
      `${label} ${g.dir}: room $${(g.end.room ?? 0).toString(16)} `
        + `vs solo $${(e.end.room ?? 0).toString(16)}`,
    );
    const dx = Math.abs(g.end.x - e.end.x);
    const dy = Math.abs(g.end.y - e.end.y);
    assert.ok(
      dx <= tol && dy <= tol,
      `${label} ${g.dir}: leftover stopped at local ${g.end.x},${g.end.y} `
        + `room $${(g.end.room ?? 0).toString(16)} `
        + `but solo ${e.end.x},${e.end.y} room $${(e.end.room ?? 0).toString(16)}`,
    );
  }
}

/**
 * @param {Awaited<ReturnType<typeof runDoorLipTour>>} expected
 * @param {Awaited<ReturnType<typeof runDoorLipTour>>} actual
 * @param {string} label
 */
export function assertDoorLipTourMatch(expected, actual, label) {
  assert.equal(actual.length, expected.length, `${label}: leg count`);
  for (let i = 0; i < expected.length; i += 1) {
    const name = expected[i].name ?? `leg ${i}`;
    assertArrivalProbesMatch(expected[i], actual[i], `${label} ${name}`);
  }
}

/** Q1 L4 winding water/lava path (layout 23). Q2 L4 slot `$2c` is the same maze. */
export const L4_LAVA_MAZE = 0x31;
/** Q1 L4 symmetrical water maze (layout 22). */
export const L4_WATER_MAZE = 0x01;

const UW_WALKABLE = 0x78;

/**
 * Tile under Link and 8px to the right (the 16px sprite). `stairsProbe`
 * already samples those offsets on the occupying dungeon grid.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 */
export async function uwSpriteTiles(game) {
  return game.page.evaluate(() => {
    const p = window.zeldaDebug.stairsProbe();
    if (!p) return null;
    return {
      x: p.link.x,
      y: p.link.y,
      go: p.link.gridOffset,
      left: p.samples?.['0,0'] ?? null,
      right: p.samples?.['8,0'] ?? null,
      room: p.roomId,
    };
  });
}

/**
 * @param {number} tile
 */
function uwTileWalkable(tile) {
  return tile != null && (tile & 0xff) < UW_WALKABLE;
}

/**
 * Walk a lava/water maze the way the screenshot was produced: hold each
 * direction and the diagonals, reversing often. Underworld paths are 16px;
 * the right 8px must stay on the trail — not in `$F4`. Play loads `?debug=1`
 * (stepladder in the bag), which used to disable that extra foot.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {number} roomId
 * @param {string} label
 */
export async function runUwLavaPathTour(game, index, roomId, label) {
  const k = KEYS[index];
  const legs = [
    [k.up],
    [k.down],
    [k.left],
    [k.right],
    [k.up, k.left],
    [k.up, k.right],
    [k.down, k.left],
    [k.down, k.right],
    [k.up],
    [k.left],
    [k.down],
    [k.right],
    [k.down, k.right],
    [k.up, k.left],
    [k.down],
    [k.up, k.right],
  ];
  await pose(game, index, 0x78, 0x8d, DIR.DOWN, roomId);
  // `?debug=1` grants the stepladder. CheckLadder then treats every 16px
  // lava gap as a moat and the extra foot would hang into `$F4`. This tour
  // is about staying on the trail, not crossing it.
  await game.page.evaluate(() => window.zeldaDebug.patchInv({ ladder: 0 }));
  await game.step(2);
  /** @type {string[]} */
  const slips = [];
  for (const keys of legs) {
    await game.hold(...keys);
    for (let i = 0; i < 28; i += 1) {
      await game.step(1);
      const foot = await uwSpriteTiles(game);
      if (!foot || !uwTileWalkable(foot.left)) continue;
      if (!uwTileWalkable(foot.right)) {
        slips.push(
          `${label} $${foot.x.toString(16)},$${foot.y.toString(16)} `
            + `go=${foot.go} left=$${(foot.left ?? 0).toString(16)} `
            + `right=$${(foot.right ?? 0).toString(16)}`,
        );
      }
    }
    await game.release(...keys);
    await game.step(2);
  }
  assert.equal(slips.length, 0, slips.slice(0, 8).join('\n'));
}
