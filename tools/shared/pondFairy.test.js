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
  linkAtPondEdge,
  nesHeartsFromInv,
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
