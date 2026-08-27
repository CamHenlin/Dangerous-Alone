import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DROP_CHR,
  DROP_DAMAGE_BOMB,
  DROP_ITEM,
  DROP_RATES,
  DROP_TABLE,
  advanceKillCycle,
  createDropCounters,
  createDroppedItem,
  dropChrTile,
  dropPickupReady,
  dropPickupSfx,
  dropTableRow,
  dropTouchesTaker,
  grantDroppedItem,
  noteMonsterDied,
  resetDropStreak,
  resolveDroppedItem,
  stepDroppedItemLifetime,
  stepFairy,
  tryCreateDropFromKill,
} from './enemyDrops.js';
import { DIR } from './collision.js';
import { FAIRY_SCREEN_BOUNDS_OW } from './enemyBounds.js';
import {
  FAIRY_FLYING_MAX_SPEED_FRAC,
  FAIRY_INIT_SPEED,
  FLYER_STATE,
  flyerSpeedToPxPerFrame,
} from './flyerMove.js';
import { createInventory } from './inventory.js';

test('drop CHR matches Anim_ItemFrameTiles', () => {
  assert.equal(dropChrTile(DROP_ITEM.BOMB), 0x34);
  assert.equal(dropChrTile(DROP_ITEM.RUPEE1), 0x32);
  assert.equal(dropChrTile(DROP_ITEM.RUPEE5), 0x32);
  assert.equal(dropChrTile(DROP_ITEM.CLOCK), 0x66);
  assert.equal(dropChrTile(DROP_ITEM.HEART), 0xf3);
  assert.equal(dropChrTile(DROP_ITEM.FAIRY), 0x50);
  assert.equal(DROP_CHR[DROP_ITEM.HEART], 0xf3);
});

test('dropPickupSfx matches TakeItem / PlayKeyTakenTune', () => {
  assert.equal(dropPickupSfx(DROP_ITEM.RUPEE1), 'rupee');
  assert.equal(dropPickupSfx(DROP_ITEM.RUPEE5), 'rupee');
  assert.equal(dropPickupSfx(DROP_ITEM.HEART), 'key');
  assert.equal(dropPickupSfx(DROP_ITEM.BOMB), 'key');
  assert.equal(dropPickupSfx(DROP_ITEM.CLOCK), 'key');
  assert.equal(dropPickupSfx(DROP_ITEM.FAIRY), null);
});

test('drop table rows match NES monster groups', () => {
  assert.equal(dropTableRow(0x07), 0); // red octorok
  assert.equal(dropTableRow(0x2a), 1); // stalfos
  assert.equal(dropTableRow(0x09), 2); // blue octorok
  assert.equal(dropTableRow(0x2e), 3); // like like? not in lists → row 3; use 0x2e moldorm-ish
  assert.equal(dropTableRow(0x1b), -1); // blue keese — no drop
  assert.equal(dropTableRow(0x17), -1); // like-like
});

test('WorldKillCycle advances then indexes the table', () => {
  const c = createDropCounters();
  assert.equal(c.worldKillCycle, 0);
  advanceKillCycle(c, 0x07);
  assert.equal(c.worldKillCycle, 1);
  // After first advance, column 1 of row 0 is $18 (1 rupee).
  assert.equal(DROP_TABLE[0 * 10 + c.worldKillCycle], DROP_ITEM.RUPEE1);
  for (let i = 0; i < 9; i += 1) advanceKillCycle(c, 0x07);
  assert.equal(c.worldKillCycle, 0);
});

test('red keese does not advance kill cycle', () => {
  const c = createDropCounters();
  advanceKillCycle(c, 0x1c);
  assert.equal(c.worldKillCycle, 0);
});

test('random cancel uses DropItemRates', () => {
  const c = createDropCounters();
  advanceKillCycle(c, 0x07); // cycle → 1
  const alwaysCancel = () => 0xff;
  assert.equal(
    resolveDroppedItem({ objType: 0x07, counters: c, randomByte: alwaysCancel }),
    null,
  );
  assert.ok(0xff >= DROP_RATES[0]);

  const alwaysDrop = () => 0x00;
  assert.equal(
    resolveDroppedItem({ objType: 0x07, counters: c, randomByte: alwaysDrop }),
    DROP_ITEM.RUPEE1,
  );
});

test('forceDrop bypasses rate cancel and no-drop types', () => {
  const c = createDropCounters();
  assert.ok(
    resolveDroppedItem({
      objType: 0x07,
      counters: c,
      randomByte: () => 0xff,
      forceDrop: true,
    }),
  );
  assert.equal(
    resolveDroppedItem({
      objType: 0x5d,
      counters: createDropCounters(),
      randomByte: () => 0,
      forceDrop: true,
    }),
    DROP_ITEM.HEART,
  );
});

test('help drop at 10 kills forces 5 rupees or bomb', () => {
  const c = createDropCounters();
  for (let i = 0; i < 10; i += 1) noteMonsterDied(c, 0);
  assert.equal(c.helpDropCount, 0x0a);
  assert.equal(c.helpDropValue, 0);
  advanceKillCycle(c, 0x07);
  assert.equal(
    resolveDroppedItem({ objType: 0x07, counters: c, randomByte: () => 0xff }),
    DROP_ITEM.RUPEE5,
  );
  assert.equal(c.helpDropCount, 0);

  const c2 = createDropCounters();
  for (let i = 0; i < 9; i += 1) noteMonsterDied(c2, 0);
  noteMonsterDied(c2, DROP_DAMAGE_BOMB);
  assert.equal(c2.helpDropValue, 1);
  advanceKillCycle(c2, 0x07);
  assert.equal(
    resolveDroppedItem({ objType: 0x07, counters: c2, randomByte: () => 0xff }),
    DROP_ITEM.BOMB,
  );
});

test('16th consecutive kill forces fairy on drop-capable foe', () => {
  const c = createDropCounters();
  for (let i = 0; i < 16; i += 1) noteMonsterDied(c, 0);
  assert.equal(c.worldKillCount, 0x10);
  advanceKillCycle(c, 0x07);
  assert.equal(
    resolveDroppedItem({ objType: 0x07, counters: c, randomByte: () => 0xff }),
    DROP_ITEM.FAIRY,
  );
});

test('keese kill increments streak but drops nothing', () => {
  const c = createDropCounters();
  const drop = tryCreateDropFromKill({
    objType: 0x1b,
    counters: c,
    randomByte: () => 0x00,
    x: 0x80,
    y: 0x80,
  });
  assert.equal(drop, null);
  assert.equal(c.worldKillCount, 1);
  assert.equal(c.worldKillCycle, 1); // blue keese advances cycle
});

test('harm resets streak counters', () => {
  const c = createDropCounters();
  c.worldKillCount = 5;
  c.helpDropCount = 5;
  c.helpDropValue = 1;
  resetDropStreak(c);
  assert.equal(c.worldKillCount, 0);
  assert.equal(c.helpDropCount, 0);
  assert.equal(c.helpDropValue, 0);
});

test('grantDroppedItem amounts match TakeItem', () => {
  const inv = createInventory();
  inv.halfHearts = 2;
  inv.maxHalfHearts = 12;
  grantDroppedItem(inv, DROP_ITEM.HEART);
  assert.equal(inv.halfHearts, 4);
  grantDroppedItem(inv, DROP_ITEM.FAIRY);
  assert.equal(inv.halfHearts, 10);
  grantDroppedItem(inv, DROP_ITEM.RUPEE5);
  assert.equal(inv.rupees, 5);
  grantDroppedItem(inv, DROP_ITEM.BOMB);
  assert.equal(inv.bombs, 4);
  grantDroppedItem(inv, DROP_ITEM.CLOCK);
  assert.equal(inv.clock, 1);
});

test('pickup delay and proximity', () => {
  const item = createDroppedItem(0x80, 0x80, DROP_ITEM.HEART);
  assert.equal(dropPickupReady(item), false);
  assert.equal(dropTouchesTaker(item, 0x80, 0x80), false);
  // Lifetime starts $FF; every other frame decrements → need 16 decrements to reach $EF.
  for (let f = 0; f < 32; f += 1) stepDroppedItemLifetime(item, f);
  assert.ok(item.lifetime < 0xf0);
  assert.equal(dropTouchesTaker(item, 0x80, 0x80), true);
  assert.equal(dropTouchesTaker(item, 0x90, 0x80), false);
});

test('Link standing on a rupee still collects it from the right foot', () => {
  const item = createDroppedItem(0x80, 0x8d, DROP_ITEM.RUPEE5);
  item.lifetime = 0xee;
  // NES |dx|<9 misses this; the sprites still overlap.
  assert.equal(dropTouchesTaker(item, 0x80 - 12, 0x8d, 'link'), true);
  assert.equal(dropTouchesTaker(item, 0x80 - 12, 0x8d, 'sword'), false);
  assert.equal(dropTouchesTaker(item, 0x80 - 16, 0x8d, 'link'), false);
});

test('SetUpFairyObject stamps ROM flyer speed, not whole pixels', () => {
  const item = createDroppedItem(0x80, 0x8d, DROP_ITEM.FAIRY);
  stepFairy(item, FAIRY_SCREEN_BOUNDS_OW);
  assert.equal(item.flyerSpeed, FAIRY_INIT_SPEED + 1);
  assert.equal(item.flyingMaxSpeedFrac, FAIRY_FLYING_MAX_SPEED_FRAC);
  assert.equal(item.dir, DIR.UP);
  assert.equal(item.flyerState, FLYER_STATE.SPEED_UP);
});

test('a dropped fairy never chases and stays inside BoundFlyer', () => {
  const item = createDroppedItem(0x80, 0x8d, DROP_ITEM.FAIRY);
  const start = { x: item.x, y: item.y };
  for (let i = 0; i < 400; i += 1) {
    stepDroppedItemLifetime(item, i);
    stepFairy(item, FAIRY_SCREEN_BOUNDS_OW);
  }
  assert.ok(item.flyerState === FLYER_STATE.WANDER || item.flyerState === FLYER_STATE.DECIDE
    || item.flyerState === FLYER_STATE.SPEED_UP);
  assert.notEqual(item.flyerState, FLYER_STATE.CHASE);
  assert.ok(item.flyerSpeed <= FAIRY_FLYING_MAX_SPEED_FRAC);
  assert.ok(item.x >= FAIRY_SCREEN_BOUNDS_OW.minX);
  assert.ok(item.x <= FAIRY_SCREEN_BOUNDS_OW.maxX);
  assert.ok(item.y >= FAIRY_SCREEN_BOUNDS_OW.minY);
  assert.ok(item.y <= FAIRY_SCREEN_BOUNDS_OW.maxY);
  const travel = Math.abs(item.x - start.x) + Math.abs(item.y - start.y);
  // Old 1–2 px/frame movers covered hundreds of pixels and sat on the lip.
  // ROM max $A0 is 0.625 px/f; with wander turns they should not bolt off-screen.
  assert.ok(travel < 280, `expected subdued wander, got manhattan=${travel}`);
});

test('fairy cruise speed matches FlyingMaxSpeedFrac $A0', () => {
  assert.equal(flyerSpeedToPxPerFrame(FAIRY_FLYING_MAX_SPEED_FRAC), 0.625);
});
