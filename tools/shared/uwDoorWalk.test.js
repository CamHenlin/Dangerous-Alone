import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, HUD_HEIGHT } from './collision.js';
import {
  ANCHOR_SEAM_LIP,
  PLAY_H,
  PLAY_W,
  canClaimAnchorCross,
  rebaseDelta,
} from './continuousCamera.js';
import {
  DOORWAY_CENTER_X,
  DOORWAY_CENTER_Y,
  clampUwDoorwayPath,
  createDoorState,
  nearDoorway,
} from './dungeonDoors.js';
import { SCREEN_EDGE } from './world.js';
import { createLinkState } from './linkMotion.js';
import {
  applyUwDoorCross,
  detectOwnedUwDoorCross,
  stepUwDoorHero,
  uwDoorMotionMode,
  walkUntilUwDoorCross,
} from './uwDoorWalk.js';

function openRoom(roomId = 0x53) {
  return {
    roomId,
    doors: {
      north: { type: 'open' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'open' },
    },
  };
}

function plusCross(roomId) {
  return [
    { roomId },
    { roomId: roomId - 0x10 },
    { roomId: roomId + 0x10 },
    { roomId: roomId - 1 },
    { roomId: roomId + 1 },
  ];
}

function ctx(room) {
  return { rooms: plusCross(room.roomId), doorState: createDoorState() };
}

const EXITS = [
  {
    name: 'north',
    dir: DIR.UP,
    start: () => createLinkState(DOORWAY_CENTER_X, 0x6d, DIR.UP),
    next: (id) => id - 0x10,
  },
  {
    name: 'south',
    dir: DIR.DOWN,
    start: () => createLinkState(DOORWAY_CENTER_X, 0xad, DIR.DOWN),
    next: (id) => id + 0x10,
  },
  {
    name: 'west',
    dir: DIR.LEFT,
    start: () => createLinkState(0x30, DOORWAY_CENTER_Y, DIR.LEFT),
    next: (id) => id - 1,
  },
  {
    name: 'east',
    dir: DIR.RIGHT,
    start: () => createLinkState(0xc0, DOORWAY_CENTER_Y, DIR.RIGHT),
    next: (id) => id + 1,
  },
];

for (const exit of EXITS) {
  test(`an open ${exit.name} door walks through to the next room`, () => {
    const room = openRoom(0x53);
    const link = exit.start();
    const cross = walkUntilUwDoorCross(link, room, exit.dir, ctx(room));
    assert.ok(
      cross,
      `${exit.name} never crossed; stopped at $${link.x.toString(16)},$${link.y.toString(16)}`,
    );
    assert.equal(cross.side, exit.name);
    assert.equal(cross.nextRoomId, exit.next(room.roomId));
    const before = { x: link.x, y: link.y };
    applyUwDoorCross(link, cross);
    const { dx, dy } = rebaseDelta(cross.dir);
    assert.equal(link.x, before.x + dx, `${exit.name} X stays world-continuous`);
    assert.equal(link.y, before.y + dy, `${exit.name} Y stays world-continuous`);
  });
}

test('east door still exits from the $9D and $9F cavity rows', () => {
  const room = openRoom(0x53);
  for (const y of [0x8d, 0x9d, 0x9f]) {
    const link = createLinkState(0xc0, y, DIR.RIGHT);
    const cross = walkUntilUwDoorCross(link, room, DIR.RIGHT, ctx(room));
    assert.ok(cross, `east from Y=$${y.toString(16)} never crossed (x=$${link.x.toString(16)})`);
    assert.equal(cross.side, 'east');
  }
});

test('west door still exits from the $9D and $9F cavity rows', () => {
  const room = openRoom(0x53);
  for (const y of [0x8d, 0x9d, 0x9f]) {
    const link = createLinkState(0x30, y, DIR.LEFT);
    const cross = walkUntilUwDoorCross(link, room, DIR.LEFT, ctx(room));
    assert.ok(cross, `west from Y=$${y.toString(16)} never crossed (x=$${link.x.toString(16)})`);
    assert.equal(cross.side, 'west');
  }
});

test('north and south doors accept the $70 / $80 walk columns', () => {
  const room = openRoom(0x53);
  for (const x of [0x70, 0x78, 0x80]) {
    const north = createLinkState(x, 0x6d, DIR.UP);
    assert.ok(
      walkUntilUwDoorCross(north, room, DIR.UP, ctx(room)),
      `north from X=$${x.toString(16)}`,
    );
    const south = createLinkState(x, 0xad, DIR.DOWN);
    assert.ok(
      walkUntilUwDoorCross(south, room, DIR.DOWN, ctx(room)),
      `south from X=$${x.toString(16)}`,
    );
  }
});

test('a stride that lands on the seam still exits once gridOffset clears', () => {
  const room = openRoom(0x53);
  const cases = [
    { x: PLAY_W, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT, side: 'east' },
    { x: -1, y: DOORWAY_CENTER_Y, dir: DIR.LEFT, side: 'west' },
    { x: DOORWAY_CENTER_X, y: HUD_HEIGHT + PLAY_H, dir: DIR.DOWN, side: 'south' },
    { x: DOORWAY_CENTER_X, y: HUD_HEIGHT - 1, dir: DIR.UP, side: 'north' },
  ];
  for (const pos of cases) {
    const link = createLinkState(pos.x, pos.y, pos.dir);
    link.gridOffset = 4;
    assert.equal(
      detectOwnedUwDoorCross(link, room, ctx(room)),
      null,
      `${pos.side} mid-stride must wait`,
    );
    assert.equal(uwDoorMotionMode(link, room, ctx(room)), 'corridor');
    link.gridOffset = 0;
    const cross = detectOwnedUwDoorCross(link, room, ctx(room));
    assert.ok(cross, `${pos.side} seam pixel must be an owned exit`);
    assert.equal(cross.side, pos.side);
  }
});

test('an ally left in the previous room does not steal the south exit', () => {
  // Mid-map: $76 sits on the south rim (row 7) and has no dungeon neighbor.
  const room = openRoom(0x53);
  // After a south rebase the wanderer is in $53; the ally is still in $43
  // at negative play-Y, on the door column — the old reverse-cross trap.
  const ally = createLinkState(DOORWAY_CENTER_X, HUD_HEIGHT - PLAY_H + 80, DIR.DOWN);
  assert.equal(canClaimAnchorCross(ally.x, ally.y), false);
  assert.equal(uwDoorMotionMode(ally, room, ctx(room)), 'neighbor');
  assert.equal(detectOwnedUwDoorCross(ally, room, ctx(room)), null);

  const walker = createLinkState(DOORWAY_CENTER_X, HUD_HEIGHT + PLAY_H, DIR.DOWN);
  walker.gridOffset = 0;
  const cross = detectOwnedUwDoorCross(walker, room, ctx(room));
  assert.ok(cross);
  assert.equal(cross.side, 'south');
});

test('clamp does not yank a hero already past the east lip back to $F0', () => {
  const room = openRoom(0x53);
  const rooms = new Set(plusCross(0x53).map((r) => r.roomId));
  // Off the $8D axis by more than the old ±$10 slack, already in the door.
  const link = { x: SCREEN_EDGE.right + 8, y: DOORWAY_CENTER_Y + 0x12 };
  clampUwDoorwayPath(link, room, { roomIds: rooms });
  assert.equal(link.x, SCREEN_EDGE.right + 8, 'must not snap back to the NES lip');
  assert.ok(link.x < PLAY_W + 1);
});

test('clamp does not yank a hero already past the south lip back to $DD', () => {
  const room = openRoom(0x53);
  const rooms = new Set(plusCross(0x53).map((r) => r.roomId));
  const link = { x: DOORWAY_CENTER_X + 6, y: SCREEN_EDGE.down + 8 };
  clampUwDoorwayPath(link, room, { roomIds: rooms });
  assert.equal(link.y, SCREEN_EDGE.down + 8);
});

test('a locked east door still stops at the NES lip', () => {
  const room = {
    roomId: 0x53,
    doors: {
      north: { type: 'open' },
      south: { type: 'open' },
      west: { type: 'open' },
      east: { type: 'key' },
    },
  };
  const rooms = new Set(plusCross(0x53).map((r) => r.roomId));
  const link = { x: SCREEN_EDGE.right + 8, y: DOORWAY_CENTER_Y };
  clampUwDoorwayPath(link, room, { doorState: createDoorState(), roomIds: rooms });
  assert.equal(link.x, SCREEN_EDGE.right);
});

test('nearDoorway east covers the $9F cavity row', () => {
  assert.equal(nearDoorway({ x: 0xe8, y: 0x9f }, 'east'), true);
  assert.equal(nearDoorway({ x: 0xe8, y: 0x90 }, 'east'), true);
});

test('the seam lip covers the door cavity, not a whole room', () => {
  assert.equal(canClaimAnchorCross(PLAY_W, DOORWAY_CENTER_Y), true);
  assert.equal(canClaimAnchorCross(PLAY_W + ANCHOR_SEAM_LIP - 1, DOORWAY_CENTER_Y), true);
  assert.equal(canClaimAnchorCross(PLAY_W + ANCHOR_SEAM_LIP, DOORWAY_CENTER_Y), false);
  // x=$-13 is a hero who was at the NES $ED lip when an ally crossed east.
  assert.equal(canClaimAnchorCross(-0x13, DOORWAY_CENTER_Y), true);
  assert.equal(canClaimAnchorCross(-ANCHOR_SEAM_LIP, DOORWAY_CENTER_Y), true);
  assert.equal(canClaimAnchorCross(-ANCHOR_SEAM_LIP - 1, DOORWAY_CENTER_Y), false);
});

test('a hero at x=$-13 in the west door can walk right into the room', () => {
  // The live bug: debug overlay read `dungeon x=$-19` while Link was
  // visually in the opening and Right did nothing. Solid door tiles apply
  // unless this is still a corridor the hero is allowed to own.
  const room = openRoom(0x77);
  const link = createLinkState(-0x13, DOORWAY_CENTER_Y, DIR.RIGHT);
  assert.equal(uwDoorMotionMode(link, room, ctx(room)), 'corridor');
  const x0 = link.x;
  const stepped = stepUwDoorHero(link, room, DIR.RIGHT, ctx(room));
  assert.equal(stepped.mode, 'corridor');
  assert.ok(link.x > x0, `Right must move them, stayed at ${link.x}`);
  for (let i = 0; i < 24; i += 1) {
    stepUwDoorHero(link, room, DIR.RIGHT, ctx(room));
  }
  assert.ok(link.x >= 0, `should clear the west seam, at ${link.x}`);
});

test('after an ally crosses east, a hero left at the NES lip can follow', () => {
  const from = openRoom(0x76);
  const into = openRoom(0x77);
  const rooms = [
    { roomId: 0x66 },
    { roomId: 0x76 },
    { roomId: 0x86 },
    { roomId: 0x75 },
    { roomId: 0x77 },
  ];
  const ctxFrom = { rooms, doorState: createDoorState() };
  const ctxInto = { rooms, doorState: createDoorState() };
  const ally = createLinkState(SCREEN_EDGE.right - 3, DOORWAY_CENTER_Y, DIR.RIGHT);
  const walker = createLinkState(0xc0, DOORWAY_CENTER_Y, DIR.RIGHT);
  const cross = walkUntilUwDoorCross(walker, from, DIR.RIGHT, ctxFrom);
  assert.ok(cross);
  applyUwDoorCross(walker, cross);
  const { dx, dy } = rebaseDelta(cross.dir);
  ally.x += dx;
  ally.y += dy;
  assert.ok(ally.x < 0, `ally should sit in the west overflow, got ${ally.x}`);
  assert.equal(uwDoorMotionMode(ally, into, ctxInto), 'corridor');
  const x0 = ally.x;
  stepUwDoorHero(ally, into, DIR.RIGHT, ctxInto);
  assert.ok(ally.x > x0, 'the left-behind hero must be able to walk right');
  const back = walkUntilUwDoorCross(ally, into, DIR.LEFT, ctxInto);
  assert.ok(back, 'and they can still recross west');
  assert.equal(back.side, 'west');
  assert.equal(back.nextRoomId, 0x76);
});

test('a leftover hero can still leave through their own room\'s door', () => {
  // After someone else takes the world's anchor east, the ally still in
  // $73 must be able to walk north of *that* cell, not the new anchor.
  const from = openRoom(0x73);
  const rooms = plusCross(0x73);
  const ctxFrom = { rooms, doorState: createDoorState() };
  const walker = createLinkState(0xc0, DOORWAY_CENTER_Y, DIR.RIGHT);
  const ally = createLinkState(DOORWAY_CENTER_X, 0x6d, DIR.UP);
  const cross = walkUntilUwDoorCross(walker, from, DIR.RIGHT, ctxFrom);
  assert.ok(cross);
  const { dx, dy } = rebaseDelta(cross.dir);
  ally.x += dx;
  ally.y += dy;
  // Their $73-local coords — what `offsetToRoom($73)` produces after rebase.
  const local = { ...ally, x: ally.x - dx, y: ally.y - dy };
  const north = walkUntilUwDoorCross(local, from, DIR.UP, ctxFrom);
  assert.ok(north, 'must still be able to walk north of $73');
  assert.equal(north.nextRoomId, 0x63);
});

test('an idle ally is not dragged to the door when someone else walks north', () => {
  // Screenshot: P2 standing two tiles south of $76's north door, on the
  // column, while P1 walks north into $66. Corridor clamp used to yank
  // them to the seam (y=$F0 of the new room = the north doorway of $76).
  const from = openRoom(0x76);
  const into = openRoom(0x66);
  const rooms = plusCross(0x76);
  const ctxFrom = { rooms, doorState: createDoorState() };
  const ctxInto = { rooms, doorState: createDoorState() };
  const ally = createLinkState(DOORWAY_CENTER_X, HUD_HEIGHT + 48, DIR.UP);
  const walker = createLinkState(DOORWAY_CENTER_X, 0x6d, DIR.UP);
  const cross = walkUntilUwDoorCross(walker, from, DIR.UP, ctxFrom);
  assert.ok(cross, 'walker never crossed north');
  const { dx, dy } = rebaseDelta(cross.dir);
  ally.x += dx;
  ally.y += dy;
  const before = { x: ally.x, y: ally.y };
  assert.equal(uwDoorMotionMode(ally, into, ctxInto), 'neighbor');
  stepUwDoorHero(ally, into, 0, ctxInto);
  assert.equal(ally.x, before.x);
  assert.equal(ally.y, before.y);
  assert.ok(
    ally.y > HUD_HEIGHT + PLAY_H + 16,
    `must stay in $76, not the $66 south lip (y=${ally.y})`,
  );
});

test('an idle ally is not dragged to the door when someone else walks west', () => {
  const from = openRoom(0x77);
  const into = openRoom(0x76);
  const rooms = plusCross(0x77);
  const ctxFrom = { rooms, doorState: createDoorState() };
  const ctxInto = { rooms, doorState: createDoorState() };
  // Two tiles east of the west NES lip, on the door row. After a west
  // rebase they sit past $F0 of $76; east-corridor clamp used to yank
  // them onto that seam.
  const ally = createLinkState(SCREEN_EDGE.left + 32, DOORWAY_CENTER_Y, DIR.LEFT);
  const walker = createLinkState(0x30, DOORWAY_CENTER_Y, DIR.LEFT);
  const cross = walkUntilUwDoorCross(walker, from, DIR.LEFT, ctxFrom);
  assert.ok(cross, 'walker never crossed west');
  const { dx, dy } = rebaseDelta(cross.dir);
  ally.x += dx;
  ally.y += dy;
  const before = { x: ally.x, y: ally.y };
  assert.equal(uwDoorMotionMode(ally, into, ctxInto), 'neighbor');
  stepUwDoorHero(ally, into, 0, ctxInto);
  assert.equal(ally.x, before.x);
  assert.equal(ally.y, before.y);
});

test('a south-rim start room does not dungeon-cross south', () => {
  // $76 is row 7 — NES start rooms put the OW exit here. Walking south
  // must stop at the lip, not invent a $86 neighbor.
  const room = openRoom(0x76);
  const link = createLinkState(DOORWAY_CENTER_X, 0xad, DIR.DOWN);
  const cross = walkUntilUwDoorCross(link, room, DIR.DOWN, ctx(room), 64);
  assert.equal(cross, null);
  assert.equal(link.y, SCREEN_EDGE.down);
});

test('an open door with no neighbor room stops at the NES lip', () => {
  const room = openRoom(0x53);
  const rooms = [{ roomId: 0x53 }, { roomId: 0x43 }, { roomId: 0x63 }, { roomId: 0x52 }];
  const link = createLinkState(0xc0, DOORWAY_CENTER_Y, DIR.RIGHT);
  const cross = walkUntilUwDoorCross(link, room, DIR.RIGHT, { rooms, doorState: createDoorState() }, 64);
  assert.equal(cross, null, 'east has no $54 in the level');
  assert.equal(link.x, SCREEN_EDGE.right);
});

test('after an ally crosses each way, the leftover hero can still use that door', () => {
  const cases = [
    {
      fromId: 0x53,
      intoId: 0x54,
      dir: DIR.RIGHT,
      leftover: () => createLinkState(SCREEN_EDGE.right - 3, DOORWAY_CENTER_Y, DIR.RIGHT),
      follow: DIR.RIGHT,
    },
    {
      fromId: 0x53,
      intoId: 0x52,
      dir: DIR.LEFT,
      leftover: () => createLinkState(SCREEN_EDGE.left + 3, DOORWAY_CENTER_Y, DIR.LEFT),
      follow: DIR.LEFT,
    },
    {
      fromId: 0x53,
      intoId: 0x63,
      dir: DIR.DOWN,
      leftover: () => createLinkState(DOORWAY_CENTER_X, SCREEN_EDGE.down - 3, DIR.DOWN),
      follow: DIR.DOWN,
    },
    {
      fromId: 0x53,
      intoId: 0x43,
      dir: DIR.UP,
      leftover: () => createLinkState(DOORWAY_CENTER_X, SCREEN_EDGE.up + 3, DIR.UP),
      follow: DIR.UP,
    },
  ];
  for (const c of cases) {
    const from = openRoom(c.fromId);
    const into = openRoom(c.intoId);
    const rooms = plusCross(c.fromId);
    if (!rooms.some((r) => r.roomId === c.intoId)) rooms.push({ roomId: c.intoId });
    const ctxFrom = { rooms, doorState: createDoorState() };
    const ctxInto = { rooms, doorState: createDoorState() };
    const start = EXITS.find((e) => e.dir === c.dir).start();
    const walker = start;
    const ally = c.leftover();
    const cross = walkUntilUwDoorCross(walker, from, c.dir, ctxFrom);
    assert.ok(cross, `${c.dir} walker never crossed`);
    const { dx, dy } = rebaseDelta(cross.dir);
    ally.x += dx;
    ally.y += dy;
    assert.equal(
      uwDoorMotionMode(ally, into, ctxInto),
      'corridor',
      `leftover after dir=${c.dir} at ${ally.x},${ally.y} must stay in the door`,
    );
    const before = { x: ally.x, y: ally.y };
    stepUwDoorHero(ally, into, c.follow, ctxInto);
    assert.ok(
      ally.x !== before.x || ally.y !== before.y,
      `leftover after dir=${c.dir} could not take a step`,
    );
  }
});

test('stepUwDoorHero in a room does not walk through a wall door', () => {
  const room = {
    roomId: 0x53,
    doors: {
      north: { type: 'wall' },
      south: { type: 'wall' },
      west: { type: 'wall' },
      east: { type: 'wall' },
    },
  };
  const link = createLinkState(0xc0, DOORWAY_CENTER_Y, DIR.RIGHT);
  const cross = walkUntilUwDoorCross(link, room, DIR.RIGHT, ctx(room), 48);
  assert.equal(cross, null);
  assert.ok(link.x < PLAY_W, 'must not reach the east seam through a wall');
});
