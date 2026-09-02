import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAY_W, occupyingRoom } from './continuousCamera.js';
import { OBJ, createEnemy, stepEnemy } from './enemies.js';
import { chaseBoundsForCameras, connectedChaseBounds, enemyMotionBounds, fairyFlightBounds, FAIRY_SCREEN_BOUNDS_OW, shotMotionBounds } from './enemyBounds.js';
import { DIR } from './collision.js';
import { stepProjectile, createProjectile, PROJ } from './projectiles.js';
import { chaseBoundsForCamera, uwEnemyBoundsForRoom } from './roomStream.js';

test('dungeon foes use their home room, not the camera chase pad', () => {
  const goriya = { homeRoomId: 0x76 };
  const home = enemyMotionBounds('dungeon', goriya, 0x76);
  assert.deepEqual(home, uwEnemyBoundsForRoom(0x76, 0x76));
  const afterEast = enemyMotionBounds('dungeon', goriya, 0x77);
  assert.deepEqual(afterEast, uwEnemyBoundsForRoom(0x76, 0x77));
  assert.equal(afterEast.maxX, home.maxX - PLAY_W);
  const chase = chaseBoundsForCamera(0, 0);
  assert.ok(home.maxX < chase.maxX, 'room box is tighter than the chase pad');
});

test('overworld foes still use the camera chase pad', () => {
  const cam = { camLocalX: 40, camLocalY: 10 };
  const b = enemyMotionBounds('overworld', { homeRoomId: 0x77 }, 0x77, cam);
  assert.deepEqual(b, chaseBoundsForCamera(40, 10));
});

test('adjacent split-screen cameras open the overworld seam', () => {
  const p1 = { camLocalX: 0, camLocalY: 0 };
  const p2 = { camLocalX: PLAY_W, camLocalY: 0 };
  const e = { x: PLAY_W + 0x80, y: 0x8d, homeRoomId: 0x78 };
  // Combat is stepped by whoever arrives first — usually the hero on this
  // screen. Their pad stops ~24px past the left lip, so a foe here cannot
  // walk onto the ally's leftover screen.
  const alone = enemyMotionBounds('overworld', e, 0x77, p2);
  const party = enemyMotionBounds('overworld', e, 0x77, p2, [p1, p2]);
  const chase = { x: 0x40, y: 0x8d };
  assert.ok(chase.x < alone.minX, 'precondition: the left hero is outside the right pad');
  assert.ok(party.minX < alone.minX, 'the left camera must open the seam');
  assert.ok(chase.x >= party.minX && chase.x < party.maxX, 'p2 is a valid chase inside the party pad');
});

test('overworld foes do not walk the forest between distant cameras', () => {
  const p1 = { camLocalX: 0, camLocalY: 0 };
  const far = { camLocalX: PLAY_W * 3, camLocalY: 0 };
  const e = { x: 0x80, y: 0x8d };
  const bounds = connectedChaseBounds([p1, far], e.x, e.y, p1);
  assert.deepEqual(bounds, chaseBoundsForCamera(0, 0));
});

test('an octorok can walk the seam when both cameras look at it', () => {
  const p1 = { camLocalX: 0, camLocalY: 0 };
  const p2 = { camLocalX: PLAY_W, camLocalY: 0 };
  const e = createEnemy({ objType: OBJ.RED_OCTOROK_FAST, x: PLAY_W + 0x20, y: 0x8d });
  e.dir = DIR.LEFT;
  e.viewActivated = true;
  const alone = enemyMotionBounds('overworld', e, 0x77, p2);
  const party = enemyMotionBounds('overworld', e, 0x77, p1, [p1, p2]);
  const chase = { x: 0x40, y: 0x8d };
  for (let i = 0; i < 400; i += 1) {
    stepEnemy(e, party, null, { chase, link: chase, rngByte: () => 0 });
  }
  assert.ok(
    e.x < alone.minX,
    `stuck on the right camera lip at x=${e.x} (lip=${alone.minX})`,
  );
});

test('a Goriya chasing through an east door stays in its home cell', () => {
  const e = createEnemy({ objType: OBJ.RED_GORIYA, x: 0xc0, y: 0x8d });
  e.homeRoomId = 0x76;
  e.viewActivated = true;
  const bounds = enemyMotionBounds('dungeon', e, 0x76);
  const chase = { x: PLAY_W + 0x40, y: 0x8d };
  for (let i = 0; i < 240; i += 1) {
    stepEnemy(e, bounds, null, { chase, link: chase });
  }
  assert.ok(e.x <= bounds.maxX, `followed through the door to x=${e.x}`);
  assert.equal(occupyingRoom(0x76, e.x, e.y).roomId, 0x76);
});

test('Goriyas left behind wander instead of piling on the west wall', () => {
  // After the player walks out west, chase used to stay on Link. Every
  // wanderer faced the seam and bounce() stacked them on BoundByRoom left.
  const xs = [0x40, 0x78, 0xc0];
  const foes = xs.map((x) => {
    const e = createEnemy({ objType: OBJ.RED_GORIYA, x, y: 0x8d });
    e.homeRoomId = 0x77;
    e.viewActivated = true;
    return e;
  });
  const bounds = enemyMotionBounds('dungeon', foes[0], 0x77);
  for (let i = 0; i < 180; i += 1) {
    for (const e of foes) {
      stepEnemy(e, bounds, null, { chase: null, link: null });
    }
  }
  const spread = foes.map((e) => e.x);
  const piled = spread.every((x) => x <= bounds.minX + 8);
  assert.equal(piled, false, `wandered onto the west lip: ${spread.join(',')}`);
  assert.ok(Math.max(...spread) - Math.min(...spread) >= 0x20, `spread ${spread.join(',')}`);
});

test('after an east rebase the same Goriya still cannot enter the new room', () => {
  const e = createEnemy({ objType: OBJ.RED_GORIYA, x: 0xc0 - PLAY_W, y: 0x8d });
  e.homeRoomId = 0x76;
  e.viewActivated = true;
  const bounds = enemyMotionBounds('dungeon', e, 0x77);
  const chase = { x: 0x40, y: 0x8d };
  for (let i = 0; i < 240; i += 1) {
    stepEnemy(e, bounds, null, { chase, link: chase });
  }
  const cell = occupyingRoom(0x77, e.x, e.y);
  assert.equal(cell.roomId, 0x76, `wandered into $${cell.roomId.toString(16)} at x=${e.x}`);
  assert.ok(e.x < 0, 'must remain in the previous cell');
});

test('a shot in the camera room keeps the solo chase pad', () => {
  const cam = { camLocalX: 0, camLocalY: 0 };
  const dungeon = shotMotionBounds('dungeon', 0x78, 0x8d, 0x73, cam);
  assert.deepEqual(dungeon, chaseBoundsForCamera(0, 0));
  const ow = shotMotionBounds('overworld', 0x78, 0x8d, 0x77, cam);
  assert.deepEqual(ow, chaseBoundsForCamera(0, 0));
});

test('leftover dungeon shots cannot fly into the camera room', () => {
  const cam = { camLocalX: 0, camLocalY: 0 };
  const x = PLAY_W + 0xa0;
  const y = 0x80;
  const b = shotMotionBounds('dungeon', x, y, 0x5c, cam);
  const camBox = chaseBoundsForCamera(0, 0);
  assert.ok(b.minX > camBox.maxX - 32, 'must not open a corridor into the left room');
  const p = createProjectile({
    kind: PROJ.FIREBALL,
    x,
    y,
    dir: DIR.LEFT,
    speed: 3,
    life: 200,
  });
  let crossed = false;
  for (let i = 0; i < 80 && p.alive; i += 1) {
    stepProjectile(p, b);
    if (p.x < PLAY_W) crossed = true;
  }
  assert.equal(crossed, false, `fireball entered the left room at x=${p.x}`);
});

test('a leftover dungeon shot is not clipped to the anchor camera', () => {
  const cam = { camLocalX: 0, camLocalY: 0 };
  const leftoverX = 0x78 - PLAY_W;
  const leftoverY = 0x8d;
  const camOnly = chaseBoundsForCamera(0, 0);
  assert.ok(
    leftoverX < camOnly.minX - 16,
    'precondition: leftover spawn is off the anchor camera',
  );
  const b = shotMotionBounds('dungeon', leftoverX, leftoverY, 0x74, cam);
  const p = createProjectile({
    kind: PROJ.SWORD_SHOT,
    x: leftoverX,
    y: leftoverY,
    dir: DIR.LEFT,
    speed: 3,
    life: 70,
    friendly: true,
  });
  stepProjectile(p, camOnly);
  assert.equal(p.alive, false, 'precondition: the old camera box kills it');
  p.alive = true;
  p.life = 70;
  p.x = leftoverX;
  p.y = leftoverY;
  stepProjectile(p, b);
  assert.equal(p.alive, true, 'occupying-cell bounds must keep the leftover beam');
  assert.ok(p.x < leftoverX, 'the beam must still travel');
});

test('fairy chase bounds cover every camera, not only player one', () => {
  const p1 = { camLocalX: 0, camLocalY: 0 };
  const leftover = { camLocalX: PLAY_W, camLocalY: 0 };
  const one = chaseBoundsForCamera(0, 0);
  const party = chaseBoundsForCameras([p1, leftover], p1);
  assert.ok(party.maxX > one.maxX, 'player two leftover east must widen the pad');
  assert.ok(party.maxX >= leftover.camLocalX + PLAY_W, 'the leftover camera must be inside');
});

test('a leftover fairy bounces in its own camera, not the chase-pad union', () => {
  const p1 = { camLocalX: 0, camLocalY: 0 };
  const leftover = { camLocalX: PLAY_W, camLocalY: 0 };
  const x = PLAY_W + 0x80;
  const y = 0x8d;
  const box = fairyFlightBounds([p1, leftover], x, y, p1);
  assert.equal(box.minX, PLAY_W + FAIRY_SCREEN_BOUNDS_OW.minX);
  assert.equal(box.maxX, PLAY_W + FAIRY_SCREEN_BOUNDS_OW.maxX);
  assert.ok(box.maxX < PLAY_W * 2, 'must not use the 24px chase pad past the screen');
  const home = fairyFlightBounds([p1, leftover], 0x80, 0x8d, p1);
  assert.deepEqual(home, FAIRY_SCREEN_BOUNDS_OW);
});
