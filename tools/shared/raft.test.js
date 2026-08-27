import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR, OW_BOUNDS } from './collision.js';
import { PLAY_H, localInRoom } from './continuousCamera.js';
import { TRANSITION_SPAWN } from './world.js';
import {
  RAFT_ALIGN_PX,
  createRaftRide,
  isRaftDockRoom,
  planRaftNorthApproach,
  planRaftNorthApproachFromAnchor,
  raftDockX,
  snapRaftNorthEntry,
  stepRaftRide,
  tryRaftCrossing,
  tryStartRaftRide,
} from './raft.js';

test('dock rooms recognized', () => {
  assert.equal(isRaftDockRoom(0x3f), true);
  assert.equal(isRaftDockRoom(0x55), true);
  assert.equal(isRaftDockRoom(0x77), false);
});

test('raft crossing requires raft and dock X', () => {
  assert.equal(tryRaftCrossing({ x: 0x60, y: 0x7d, dir: DIR.UP }, 0x3f, { raft: 0 }), null);
  const trip = tryRaftCrossing({ x: 0x60, y: 0x7d, dir: DIR.UP }, 0x3f, { raft: 1 });
  assert.ok(trip);
  assert.equal(trip.nextRoomId, 0x2f);
});

test('UP ride soft-crosses then lands on northern shore at $CD', () => {
  const ride = createRaftRide();
  const link = { x: raftDockX(0x3f), y: 0x7d, dir: DIR.UP };
  assert.equal(tryStartRaftRide(link, 0x3f, { raft: 1 }, ride), true);
  let cross = null;
  let room = 0x3f;
  for (let i = 0; i < 120 && ride.active; i += 1) {
    const r = stepRaftRide(link, ride, room);
    if (r?.cross) {
      cross = r.cross;
      // Simulate main.js soft rebase into the north room.
      link.x = cross.x;
      link.y = cross.y;
      room = cross.nextRoomId;
      ride.crossed = true;
    }
  }
  assert.ok(cross);
  assert.equal(cross.nextRoomId, 0x2f);
  assert.equal(cross.y, 0x3d + PLAY_H);
  assert.equal(ride.active, false);
  assert.equal(link.y, TRANSITION_SPAWN[DIR.UP].y);
  assert.equal(link.y & 0x0f, 0x0d);
});

test('dock lip soft-aligns Y within 2px and carries Link with raft', () => {
  const ride = createRaftRide();
  const link = {
    x: raftDockX(0x55) + 1,
    y: 0x7e,
    dir: DIR.UP,
    gridOffset: 3,
    posFrac: 10,
    moving: true,
  };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  assert.equal(link.x, 0x80);
  assert.equal(link.y, 0x7d);
  assert.equal(link.gridOffset, 0);
  assert.equal(ride.state, 2); // UP
  const before = link.y;
  stepRaftRide(link, ride, 0x55);
  assert.equal(link.y, before - 1);
  assert.equal(ride.y, link.y + 6);
});

test('$55 raft ride crosses to $45 then shores at $CD', () => {
  const ride = createRaftRide();
  const link = { x: 0x80, y: 0x7d, dir: DIR.UP };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  let cross = null;
  let room = 0x55;
  for (let i = 0; i < 120 && ride.active; i += 1) {
    const r = stepRaftRide(link, ride, room);
    if (r?.cross) {
      cross = r.cross;
      link.x = cross.x;
      link.y = cross.y;
      room = cross.nextRoomId;
      ride.crossed = true;
    }
  }
  assert.ok(cross);
  assert.equal(cross.nextRoomId, 0x45);
  assert.equal(room, 0x45);
  assert.equal(link.y, 0xcd);
  assert.equal(planRaftNorthApproach(link, room, { raft: 1 }), null);
});

test('UpdateDock does not require facing up at the dock lip', () => {
  const ride = createRaftRide();
  // Player often faces the water visually; NES never tests ObjDir here.
  const link = { x: 0x80, y: 0x7d, dir: DIR.DOWN };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  assert.equal(ride.state, 2); // UP
  assert.equal(link.dir, DIR.UP); // forced for the scroll
});

test('continuous southbound seam Y=$40 still catches the $3D dock trigger', () => {
  const ride = createRaftRide();
  // detectRoomCross into $55 from the north lands at HUD+0 = $40.
  const link = { x: 0x80, y: 0x40, dir: DIR.DOWN };
  assert.ok(Math.abs(0x40 - 0x3d) <= RAFT_ALIGN_PX);
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  assert.equal(link.y, 0x3d);
  assert.equal(ride.state, 1); // DOWN toward the dock
});

test('snapRaftNorthEntry aligns dock X/Y after a southbound cross', () => {
  const link = { x: 0x82, y: 0x40 };
  assert.equal(snapRaftNorthEntry(link, 0x55, DIR.DOWN), true);
  assert.equal(link.x, 0x80);
  assert.equal(link.y, 0x3d);
  assert.equal(snapRaftNorthEntry(link, 0x77, DIR.DOWN), false);
});

test('planRaftNorthApproach forces dock entry when water blocks the seam', () => {
  const link = { x: 0x80, y: OW_BOUNDS.bottom, dir: DIR.DOWN };
  const plan = planRaftNorthApproach(link, 0x45, { raft: 1 });
  assert.ok(plan);
  assert.equal(plan.nextRoomId, 0x55);
  assert.equal(plan.x, 0x80);
  assert.equal(plan.y, 0x3d);
  assert.equal(plan.dir, DIR.DOWN);
  // Without raft / wrong X / too far north — no plan.
  assert.equal(planRaftNorthApproach(link, 0x45, { raft: 0 }), null);
  assert.equal(
    planRaftNorthApproach({ x: 0x70, y: OW_BOUNDS.bottom, dir: DIR.DOWN }, 0x45, { raft: 1 }),
    null,
  );
  assert.equal(
    planRaftNorthApproach({ x: 0x80, y: 0x80, dir: DIR.DOWN }, 0x45, { raft: 1 }),
    null,
  );
  // Already in the dock room — ordinary UpdateDock triggers apply.
  assert.equal(planRaftNorthApproach(link, 0x55, { raft: 1 }), null);
  // Shore landing facing UP — must not bounce straight back.
  assert.equal(
    planRaftNorthApproach(
      { x: 0x80, y: OW_BOUNDS.bottom, dir: DIR.UP },
      0x45,
      { raft: 1 },
    ),
    null,
  );
});

test('dock lip soft-aligns $7E but not landing $7F or sand $85', () => {
  const ride = createRaftRide();
  assert.equal(
    tryStartRaftRide({ x: 0x80, y: 0x7e, dir: DIR.UP }, 0x55, { raft: 1 }, ride),
    true,
  );
  assert.equal(ride.state, 2);
  ride.active = false;
  ride.state = 0;
  assert.equal(
    tryStartRaftRide({ x: 0x80, y: 0x7f, dir: DIR.UP }, 0x55, { raft: 1 }, ride),
    false,
  );
  assert.equal(
    tryStartRaftRide({ x: 0x80, y: 0x85, dir: DIR.UP }, 0x55, { raft: 1 }, ride),
    false,
  );
});

test('failed dock trigger does not pin Link to dock X', () => {
  // Regression: tryStartRaftRide used to assign link.x=dockX before the Y
  // check, so every frame on `$55` within ±4px of `$80` snapped him back —
  // only UD worked until he left the dock room.
  const ride = createRaftRide();
  const link = { x: 0x81, y: 0x9d, dir: DIR.RIGHT, gridOffset: 0, posFrac: 0 };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), false);
  assert.equal(link.x, 0x81);
  assert.equal(link.y, 0x9d);
  assert.equal(ride.active, false);
});

test('DOWN landing finishes onto sand at $85 and does not restart UP', () => {
  const ride = createRaftRide();
  const link = { x: 0x80, y: 0x3d, dir: DIR.DOWN };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  let landed = false;
  for (let i = 0; i < 80 && ride.active; i += 1) {
    const r = stepRaftRide(link, ride, 0x55);
    if (r?.landed) landed = true;
  }
  assert.ok(landed);
  // Completed NES southbound cell ($7D+8): pier opens, LR free, no re-board.
  assert.equal(link.y, 0x85);
  assert.equal(link.gridOffset, 0);
  assert.equal(link.dir, DIR.DOWN);
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), false);
  link.y = 0x81;
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), false);
  // Walk north onto the lip — then UP is allowed.
  link.y = 0x7d;
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  assert.equal(ride.state, 2);
});

test('$2F south lip plans entry into dock room $3F', () => {
  const plan = planRaftNorthApproach(
    { x: 0x60, y: OW_BOUNDS.bottom, dir: DIR.DOWN },
    0x2f,
    { raft: 1 },
  );
  assert.ok(plan);
  assert.equal(plan.nextRoomId, 0x3f);
  assert.equal(plan.x, 0x60);
});

test('south-from-$45 plan targets dock mid-water so UpdateDock DOWN can start', () => {
  // Integration note (main.js): soft-entering this plan before room `$55` is
  // streamed used to null `screen` and freeze the ticker mid-black-playfield.
  // The play client must defer the cross until the dock room is ready, then
  // start the DOWN ride below.
  const plan = planRaftNorthApproach(
    { x: 0x80, y: OW_BOUNDS.bottom, dir: DIR.DOWN },
    0x45,
    { raft: 1 },
  );
  assert.ok(plan);
  assert.equal(plan.nextRoomId, 0x55);
  assert.equal(plan.y, 0x3d);
  const ride = createRaftRide();
  const link = { x: plan.x, y: plan.y, dir: plan.dir, gridOffset: 0, posFrac: 0, moving: false };
  assert.equal(tryStartRaftRide(link, plan.nextRoomId, { raft: 1 }, ride), true);
  assert.equal(ride.state, 1); // DOWN
  let landed = false;
  for (let i = 0; i < 80 && ride.active; i += 1) {
    if (stepRaftRide(link, ride, 0x55)?.landed) landed = true;
  }
  assert.ok(landed);
  assert.equal(link.y, 0x85);
  assert.equal(link.gridOffset, 0);
});

test('leftover island dock still plans the southbound raft against the occupying cell', () => {
  // Player two on `$45` while the stream sits on `$77` (ally in the sword
  // cave). Planning against the anchor never sees the dock and they freeze.
  const local = { x: 0x80, y: OW_BOUNDS.bottom, dir: DIR.DOWN };
  const leftover = localInRoom(0x45, 0x77, local.x, local.y);
  assert.equal(
    planRaftNorthApproach({ ...local, x: leftover.x, y: leftover.y }, 0x77, { raft: 1 }),
    null,
    'anchor-local leftover coords are not a `$77` dock',
  );
  const plan = planRaftNorthApproachFromAnchor(
    { ...local, x: leftover.x, y: leftover.y },
    0x77,
    { raft: 1 },
  );
  const expected = planRaftNorthApproach(local, 0x45, { raft: 1 });
  assert.ok(plan);
  assert.deepEqual(plan, expected);
  assert.equal(plan.nextRoomId, 0x55);
});
