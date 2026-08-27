import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnemy, OBJ } from './enemies.js';
import { createInventory } from './inventory.js';
import {
  POND_EDGE_X_MAX,
  POND_EDGE_X_MIN,
  POND_EDGE_Y,
  POND_POST_FILL_TIMER,
  applyNesHeartsToInv,
  findPondFairy,
  linkAtPondEdge,
  nesHeartsFromInv,
  pondFairyFreezesEnemy,
  pondFairyProtectsVisitor,
  stepPondFairy,
  stepWorldFillHearts,
} from './pondFairy.js';

test('linkAtPondEdge matches ROM Y=$AD and X in [$70,$81)', () => {
  assert.equal(linkAtPondEdge({ x: 0x70, y: POND_EDGE_Y }), true);
  assert.equal(linkAtPondEdge({ x: 0x80, y: POND_EDGE_Y }), true);
  assert.equal(linkAtPondEdge({ x: POND_EDGE_X_MAX, y: POND_EDGE_Y }), false);
  assert.equal(linkAtPondEdge({ x: POND_EDGE_X_MIN - 1, y: POND_EDGE_Y }), false);
  assert.equal(linkAtPondEdge({ x: 0x78, y: POND_EDGE_Y - 1 }), false);
});

test('nes heart pack/unpack round-trips full and half hearts', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 12;
  inv.halfHearts = 12;
  let nes = nesHeartsFromInv(inv);
  assert.deepEqual(nes, { hearts: 6, partial: 0xff, containers: 6 });
  applyNesHeartsToInv(inv, nes.hearts, nes.partial);
  assert.equal(inv.halfHearts, 12);

  inv.halfHearts = 5;
  nes = nesHeartsFromInv(inv);
  assert.equal(nes.hearts, 3);
  assert.equal(nes.partial, 0x40);
  applyNesHeartsToInv(inv, nes.hearts, nes.partial);
  assert.equal(inv.halfHearts, 5);
});

test('World_FillHearts tops off from empty containers', () => {
  const nes = { hearts: 0, partial: 0, containers: 3 };
  let frames = 0;
  let filling = true;
  while (filling && frames < 500) {
    const r = stepWorldFillHearts(nes);
    filling = r.filling;
    frames += 1;
  }
  assert.equal(filling, false);
  assert.equal(nes.hearts, 3);
  assert.equal(nes.partial, 0xff);
  assert.ok(frames > 10);
});

test('approaching the pond halts Link and eventually restores full hearts', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0, y: 0 });
  assert.ok(fairy);
  assert.equal(fairy.x, 0x78);
  assert.equal(fairy.y, 0x7d);

  const inv = createInventory();
  inv.maxHalfHearts = 8;
  inv.halfHearts = 3;
  inv.swordBlocked = 1;

  const link = { x: 0x78, y: POND_EDGE_Y };
  let halted = false;
  let frames = 0;
  while (frames < 800) {
    const r = stepPondFairy(fairy, inv, link);
    halted = r.haltLink;
    frames += 1;
    if (fairy.pondState === 3) break;
  }
  assert.equal(fairy.pondState, 3);
  assert.equal(inv.halfHearts, 8);
  assert.equal(inv.swordBlocked, 0);
  assert.equal(halted, false);
  assert.ok(frames > POND_POST_FILL_TIMER);
});

test('full hearts still runs the orbit hold then unhalts', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  const inv = createInventory();
  inv.maxHalfHearts = 6;
  inv.halfHearts = 6;
  const link = { x: 0x78, y: POND_EDGE_Y };

  // Already full → World_FillHearts completes the same frame, advancing to state 2.
  const first = stepPondFairy(fairy, inv, link);
  assert.equal(first.haltLink, true);
  assert.equal(fairy.pondState, 2);

  let holdFrames = 0;
  for (let i = 0; i < 200; i += 1) {
    const r = stepPondFairy(fairy, inv, link);
    if (fairy.pondState === 2 && r.haltLink) holdFrames += 1;
    if (fairy.pondState === 3) break;
  }
  assert.equal(fairy.pondState, 3);
  assert.ok(holdFrames >= POND_POST_FILL_TIMER - 1);
  assert.equal(inv.halfHearts, 6);
});

test('orbit hearts appear while halted', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 2;
  const link = { x: 0x78, y: POND_EDGE_Y };

  let sawHeart = false;
  for (let i = 0; i < 40; i += 1) {
    const r = stepPondFairy(fairy, inv, link);
    if (r.hearts.length > 0) {
      sawHeart = true;
      assert.equal(r.showOrbitHearts, true);
      assert.equal(r.haltLink, true);
      break;
    }
  }
  assert.equal(sawHeart, true);
});

test('orbit hearts stay around a world-offset fairy', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  fairy.x = 0x178;
  fairy.y = 0x7d + 176;
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 2;
  const link = { x: 0x78, y: POND_EDGE_Y };

  let hearts = [];
  for (let i = 0; i < 40; i += 1) {
    const r = stepPondFairy(fairy, inv, link);
    if (r.hearts.length > 0) {
      hearts = r.hearts;
      break;
    }
  }
  assert.ok(hearts.length > 0, 'the ring never appeared');
  for (const h of hearts) {
    assert.ok(
      Math.abs(h.x - fairy.x) < 0x40 && Math.abs(h.y - fairy.y) < 0x40,
      `heart at ${h.x},${h.y} left the fairy at ${fairy.x},${fairy.y}`,
    );
    assert.ok(h.x > 0xff, '8-bit wrap parked the ring on the anchor screen');
  }
});

test('only the visiting hero is filled and halted', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  const visitor = createInventory();
  visitor.maxHalfHearts = 8;
  visitor.halfHearts = 2;
  const ally = createInventory();
  ally.maxHalfHearts = 8;
  ally.halfHearts = 2;
  const atPond = { x: 0x78, y: POND_EDGE_Y };
  const away = { x: 0x30, y: 0x8d };

  const start = stepPondFairy(fairy, visitor, atPond, { playerIndex: 1 });
  assert.equal(start.haltLink, true);
  const other = stepPondFairy(fairy, ally, away, { playerIndex: 0 });
  assert.equal(other.haltLink, false, 'an ally at the fountain must keep walking');
  assert.equal(ally.halfHearts, 2, 'an ally must not be filled');
  assert.equal(other.showOrbitHearts, true, 'the ring must stay in the fountain world');

  for (let i = 0; i < 800 && fairy.pondState !== 3; i += 1) {
    stepPondFairy(fairy, visitor, atPond, { playerIndex: 1 });
    stepPondFairy(fairy, ally, away, { playerIndex: 0 });
  }
  assert.equal(visitor.halfHearts, 8);
  assert.equal(ally.halfHearts, 2);
});

test('findPondFairy ignores streamed neighbor fountain rooms', () => {
  const home = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  const neighbor = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d + 176 });
  assert.ok(home && neighbor);
  home.homeRoomId = 0x39;
  neighbor.homeRoomId = 0x43;
  assert.equal(findPondFairy([neighbor, home], 0x39), home);
  assert.equal(findPondFairy([neighbor, home], 0x43), neighbor);
  assert.equal(findPondFairy([neighbor], 0x39), null);
});

test('the visitor is protected and fountain-room foes freeze', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  fairy.homeRoomId = 0x39;
  const inv = createInventory();
  inv.maxHalfHearts = 8;
  inv.halfHearts = 2;
  const link = { x: 0x78, y: POND_EDGE_Y };

  const start = stepPondFairy(fairy, inv, link, { playerIndex: 1, roomId: 0x39 });
  assert.equal(start.haltLink, true);
  assert.equal(pondFairyProtectsVisitor(fairy, 1), true);
  assert.equal(pondFairyProtectsVisitor(fairy, 0), false, 'an ally must still be hittable');

  const lynel = { objType: OBJ.RED_LYNEL, homeRoomId: 0x39 };
  const far = { objType: OBJ.RED_OCTOROK_SLOW, homeRoomId: 0x77 };
  assert.equal(pondFairyFreezesEnemy(fairy, lynel), true);
  assert.equal(pondFairyFreezesEnemy(fairy, far), false, 'a foe on another screen must keep walking');
  assert.equal(pondFairyFreezesEnemy(fairy, fairy), false, 'the fairy herself is not a frozen foe');
});

test('no protection or freeze before the ceremony starts', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  fairy.homeRoomId = 0x39;
  const lynel = { objType: OBJ.RED_LYNEL, homeRoomId: 0x39 };
  assert.equal(pondFairyProtectsVisitor(fairy, 0), false);
  assert.equal(pondFairyFreezesEnemy(fairy, lynel), false);
});

test('neighbor fairy does not burn when Link walks Y=$AD in another room', () => {
  const fairy = createEnemy({ objType: OBJ.POND_FAIRY, x: 0x78, y: 0x7d });
  assert.ok(fairy);
  fairy.homeRoomId = 0x39;
  const inv = createInventory();
  inv.maxHalfHearts = 10;
  inv.halfHearts = 2;
  // Same edge Y/X on a different OW screen (continuous camera).
  const link = { x: 0x78, y: POND_EDGE_Y };
  const r = stepPondFairy(fairy, inv, link, { roomId: 0x38 });
  assert.equal(r.haltLink, false);
  assert.equal(fairy.pondState, 0);
  assert.equal(inv.halfHearts, 2);
  // Same edge in the fairy's home room still starts the heal.
  const r2 = stepPondFairy(fairy, inv, link, { roomId: 0x39 });
  assert.equal(r2.haltLink, true);
  assert.equal(fairy.pondState, 1);
});
