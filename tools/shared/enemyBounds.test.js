import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAY_W, occupyingRoom } from './continuousCamera.js';
import { OBJ, createEnemy, stepEnemy } from './enemies.js';
import { enemyMotionBounds, shotMotionBounds } from './enemyBounds.js';
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
