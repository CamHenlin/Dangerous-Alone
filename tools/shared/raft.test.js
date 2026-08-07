import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  createRaftRide,
  isRaftDockRoom,
  raftDockX,
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

test('UpdateDock-style scroll leaves north from $3F', () => {
  const ride = createRaftRide();
  const link = { x: raftDockX(0x3f), y: 0x7d, dir: DIR.UP };
  assert.equal(tryStartRaftRide(link, 0x3f, { raft: 1 }, ride), true);
  let left = null;
  for (let i = 0; i < 80 && ride.active; i += 1) {
    const r = stepRaftRide(link, ride, 0x3f);
    if (r?.leave) left = r.leave;
  }
  assert.ok(left);
  assert.equal(left.nextRoomId, 0x2f);
  assert.equal(left.y, 0xcd);
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

test('$55 raft ride leaves to north screen $45 on walk grid', () => {
  const ride = createRaftRide();
  const link = { x: 0x80, y: 0x7d, dir: DIR.UP };
  assert.equal(tryStartRaftRide(link, 0x55, { raft: 1 }, ride), true);
  let left = null;
  for (let i = 0; i < 80 && ride.active; i += 1) {
    const r = stepRaftRide(link, ride, 0x55);
    if (r?.leave) left = r.leave;
  }
  assert.ok(left);
  assert.equal(left.nextRoomId, 0x45);
  assert.equal(link.y, 0x3d);
  assert.equal(left.y, 0xcd);
  assert.equal(left.y & 0x0f, 0x0d);
});
