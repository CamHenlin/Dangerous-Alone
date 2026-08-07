import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLAME_DAMAGE,
  FLAME_MOVE_DIST,
  createOwFlame,
  flameHits,
  stepOwFlame,
} from './candle.js';
import { DIR } from './collision.js';
import {
  OBJ,
  createEnemy,
  spawnEnemiesFromAttrs,
  stepEnemy,
  tryBeamOrRodHitEnemy,
  tryFireHitEnemy,
} from './enemies.js';
import { tryFeedGrumble, stepGrumble, createGrumble, GRUMBLE } from './grumble.js';
import { heartsFull, createInventory, grantRoomItem, B_ITEM } from './inventory.js';
import {
  MOLDORM,
  WORM_SEGMENTS,
  damageWorm,
  expandWorm,
  isWormType,
} from './moldormLamnola.js';
import { shootMagicRod, shootSwordBeam, PROJ } from './projectiles.js';
import { createStatueState, statuePatternForLayout, stepStatues } from './statues.js';
import {
  TELEPORT_YS,
  canSummonWhirlwind,
  createWhirlwind,
  isFluteSecretRoom,
  nextWhirlwindLevel,
  stepWhirlwind,
} from './whirlwind.js';

test('moldorm expands to two 5-segment chains (InitMoldorm)', () => {
  const segs = expandWorm({ objType: MOLDORM, x: 0, y: 0 }, createEnemy);
  assert.equal(segs.length, WORM_SEGMENTS * 2);
  assert.equal(segs.filter((s) => s.wormHead).length, 2);
  const heads = segs.filter((s) => s.wormHead);
  assert.notEqual(heads[0].wormId, heads[1].wormId);
  assert.ok(segs.every((s) => isWormType(s.objType)));
});

test('worm damage shortens from the tail', () => {
  const segs = expandWorm({ objType: MOLDORM, x: 0, y: 0 }, createEnemy);
  const head = segs[0];
  assert.ok(damageWorm(head, segs, 0x20));
  // Only the struck chain shortens; the other chain stays at 5.
  assert.equal(segs.filter((s) => s.alive).length, WORM_SEGMENTS * 2 - 1);
  assert.equal(segs.find((s) => !s.alive)?.wormHead, false);
});

test('spawnEnemiesFromAttrs expands moldorm list id', () => {
  // List id $41 = groups bit + low id $01 (UW attrs encode id in low 6 bits).
  const list = spawnEnemiesFromAttrs(
    { monster: { id: 0x01, countIndex: 0 }, useMonsterGroups: true },
    { foeCounts: [1, 1, 1, 1] },
  );
  assert.equal(list.length, WORM_SEGMENTS * 2);
  assert.ok(list.every((e) => e.objType === MOLDORM));
});

test('whirlwind picks level from triforce bits', () => {
  assert.equal(nextWhirlwindLevel(0b0000_0001, 0), 1);
  assert.equal(nextWhirlwindLevel(0b0000_0101, 1), 3);
  assert.equal(nextWhirlwindLevel(0b0000_0101, 3), 1);
  assert.equal(TELEPORT_YS.length, 8);
  assert.ok(canSummonWhirlwind({ triforce: 0b10 }));
  assert.ok(isFluteSecretRoom(0x42));
});

test('whirlwind carries link and finishes at $F0', () => {
  const ww = createWhirlwind(0x80);
  const link = { x: 0x10, y: 0x80 };
  while (ww.alive) stepWhirlwind(ww, link);
  assert.equal(ww.done, true);
  assert.equal(ww.carrying, true);
  assert.ok(link.x >= 0xf0 - 2);
});

test('candle flame moves then stands and damages', () => {
  const flame = createOwFlame(0x80, 0x80, DIR.RIGHT);
  for (let i = 0; i < FLAME_MOVE_DIST; i += 1) stepOwFlame(flame);
  assert.equal(flame.phase, 'stand');
  const e = createEnemy({ objType: OBJ.STALFOS, x: flame.x, y: flame.y });
  assert.ok(e);
  const hp = e.hp;
  assert.ok(flameHits(flame, { x: e.x, y: e.y, w: 16, h: 16 }));
  assert.ok(tryFireHitEnemy(e, flame));
  assert.equal(e.hp, hp - FLAME_DAMAGE);
});

test('sword beam and rod hit enemies', () => {
  const e = createEnemy({ objType: OBJ.STALFOS, x: 0x40, y: 0x80 });
  assert.ok(e);
  const beam = shootSwordBeam(0x40, 0x80, DIR.RIGHT, 1);
  beam.x = e.x;
  beam.y = e.y;
  assert.equal(beam.kind, PROJ.SWORD_SHOT);
  assert.ok(tryBeamOrRodHitEnemy(e, beam));
  assert.equal(beam.alive, false);

  const e2 = createEnemy({ objType: OBJ.STALFOS, x: 0x50, y: 0x80 });
  const rod = shootMagicRod(0x50, 0x80, DIR.LEFT);
  rod.x = e2.x;
  rod.y = e2.y;
  assert.equal(rod.kind, PROJ.MAGIC_SHOT);
  assert.ok(tryBeamOrRodHitEnemy(e2, rod));
});

test('heartsFull gates sword beam', () => {
  const inv = createInventory();
  inv.halfHearts = inv.maxHalfHearts;
  assert.equal(heartsFull(inv), true);
  inv.halfHearts -= 1;
  assert.equal(heartsFull(inv), false);
});

test('grant rod and book', () => {
  const inv = createInventory();
  assert.equal(grantRoomItem(inv, 0x10), 'Magical rod');
  assert.equal(inv.rod, 1);
  assert.equal(inv.selectedB, B_ITEM.ROD);
  assert.equal(grantRoomItem(inv, 0x11), 'Book of Magic');
  assert.equal(inv.book, 1);
});

test('grumble feeds on bait then despawns', () => {
  const g = createGrumble(createEnemy);
  assert.ok(g);
  assert.equal(g.objType, GRUMBLE);
  const bait = { x: g.x, y: g.y, alive: true };
  assert.ok(tryFeedGrumble(g, bait));
  assert.equal(bait.alive, false);
  while (g.alive) stepGrumble(g);
  assert.equal(g.alive, false);
});

test('statue layouts $23/$24 shoot fireballs', () => {
  assert.equal(statuePatternForLayout(0x24), 0);
  assert.equal(statuePatternForLayout(0x23), 1);
  const state = createStatueState(0x23);
  assert.ok(state);
  state.timers.fill(1);
  const shots = stepStatues(state, { x: 0x10, y: 0x10 });
  assert.equal(shots.length, 2);
  assert.ok(shots.every((p) => p.kind === PROJ.FIREBALL));
});

test('worm steps via stepEnemy', () => {
  const segs = expandWorm({ objType: MOLDORM, x: 0, y: 0 }, createEnemy);
  const bounds = { minX: 0x20, maxX: 0xe0, minY: 0x4d, maxY: 0xcd };
  const hx = segs[0].x;
  for (let i = 0; i < 20; i += 1) {
    for (const e of segs) {
      stepEnemy(e, bounds, null, { chase: { x: 0xc0, y: 0x90 }, enemies: segs });
    }
  }
  assert.notEqual(segs[0].x, hx);
});
