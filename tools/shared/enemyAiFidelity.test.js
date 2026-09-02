import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { BOSS } from './bosses.js';
import {
  GANON_BROWN_FLICKER_TIMER,
  GANON_HIT_VISIBLE_FRAMES,
  GANON_START_XS,
  ganonIsVisible,
  ganonSwordKoToBrown,
} from './bossAi.js';
import {
  OBJ,
  createEnemy,
  enemyIsHidden,
  enemyWeaponVulnerable,
  spawnDeathSplits,
  stepEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import {
  PROJ,
  stepProjectile,
  tryEnemyShoot,
} from './projectiles.js';
import {
  MONSTER_SLOT_COUNT,
  capMonsterList,
  findEmptyMonsterSlot,
  monsterSlotsFull,
  tryAddMonster,
} from './spawn.js';
import { isWandererType, turnRateForType } from './wandererAi.js';
import {
  RED_WIZZROBE_SHOOT_STATE,
  stepBlueWizzrobe,
} from './wizzrobeAi.js';
import { POLS_STATE } from './polsVoiceAi.js';
import { SWORD_PHASE, createSwordState } from './sword.js';
import { SWORD } from './inventory.js';

const BOUNDS = Object.freeze({ minX: 0x20, maxX: 0xd8, minY: 0x4d, maxY: 0xd0 });

function hitSword() {
  const sword = createSwordState();
  sword.phase = SWORD_PHASE.HIT;
  // Mid-arc (not windup tip): RIGHT swing faces forward so e.x-20 overlaps.
  sword.timer = 3;
  sword.dir = DIR.RIGHT;
  return sword;
}

// --- M8: red and blue Wizzrobes run different routines --------------------
// Z_04.asm UpdateRedWizzrobe / UpdateBlueWizzrobe.

test('red wizzrobe materialises on a square near Link (UpdateRedWizzrobe_3)', () => {
  const link = { x: 0x80, y: 0x7d };
  const e = createEnemy({ objType: OBJ.RED_WIZZROBE, x: 0x40, y: 0x8d });
  assert.equal(e.wizzState, 0);

  // First frame decrements ObjState to $FF, which picks the teleport square.
  stepEnemy(e, BOUNDS, null, { link, rngByte: () => 0x02 });
  assert.equal(e.wizzState, 0xff);
  // Random index 2 → X offset -$20 from Link, aligned to the square grid.
  assert.equal(e.x, 0x60);
  assert.equal(e.y, 0x7d);
  assert.equal(e.dir, DIR.RIGHT);
  assert.equal(enemyIsHidden(e), true);
  assert.equal(enemyWeaponVulnerable(e), false);
});

test('red wizzrobe never walks and shoots once at state $B0 (UpdateRedWizzrobe_2)', () => {
  const link = { x: 0x80, y: 0x7d };
  const e = createEnemy({ objType: OBJ.RED_WIZZROBE, x: 0x40, y: 0x8d });
  stepEnemy(e, BOUNDS, null, { link, rngByte: () => 0x02 });

  const spot = { x: e.x, y: e.y };
  /** @type {import('./projectiles.js').Projectile[]} */
  const shots = [];
  let fadeInDrawn = 0;
  for (let i = 0; i < 0x50; i += 1) {
    stepEnemy(e, BOUNDS, null, { link, rngByte: () => 0x02 });
    assert.deepEqual({ x: e.x, y: e.y }, spot, 'red wizzrobe holds its square');
    if (e.wizzState >= 0xc0 && !enemyIsHidden(e)) fadeInDrawn += 1;
    tryEnemyShoot(e, shots, undefined, { target: link });
  }

  assert.equal(e.wizzState, 0xff - 0x50);
  assert.ok(fadeInDrawn > 8, 'fade-in draws intermittently');
  assert.equal(shots.length, 1);
  assert.equal(shots[0].kind, PROJ.MAGIC_SHOT);
  assert.equal(RED_WIZZROBE_SHOOT_STATE, 0xb0);
});

test('red wizzrobe is solid and hittable through state group 2', () => {
  const link = { x: 0x80, y: 0x7d };
  const e = createEnemy({ objType: OBJ.RED_WIZZROBE, x: 0x40, y: 0x8d });
  while (e.wizzState !== 0xa0) stepEnemy(e, BOUNDS, null, { link, rngByte: () => 0x02 });
  assert.equal(enemyIsHidden(e), false);
  assert.equal(enemyWeaponVulnerable(e), true);

  while (e.wizzState !== 0x20) stepEnemy(e, BOUNDS, null, { link, rngByte: () => 0x02 });
  assert.equal(enemyIsHidden(e), true, 'state group 0 is not drawn at all');
});

test('blue wizzrobe walks the grid every other frame (BlueWizzrobe_Move)', () => {
  const e = createEnemy({ objType: OBJ.BLUE_WIZZROBE, x: 0x80, y: 0x8d });
  // BlueWizzrobe_AlignWithNearestSquareAndRandomizeTimer: Random | $70.
  assert.ok(e.wizzTimer >= 0x70);
  e.dir = DIR.LEFT;

  for (let i = 0; i < 10; i += 1) stepEnemy(e, BOUNDS, null, { link: null });
  assert.equal(e.x, 0x80 - 5, 'one pixel per even frame');
  assert.equal(e.y, 0x8d);
  assert.equal(enemyIsHidden(e), false, 'walking blue wizzrobe is always drawn');
});

test('blue wizzrobe fades through a block (BlueWizzrobe_MoveAndCheckTile)', () => {
  const e = {
    objType: OBJ.BLUE_WIZZROBE,
    id: 1,
    anim: 0,
    x: 0x80,
    y: 0x8d,
    dir: DIR.LEFT,
    wizzTimer: 0x70,
    wizzRemDistance: 0,
    wizzTurnCounter: 0,
  };
  const block = (x) => (x < 0x80 ? { tile: 0xb0, walkable: false } : { tile: 0x00, walkable: true });
  stepBlueWizzrobe(e, { link: null, probeTile: block, rngByte: () => 0 });
  assert.equal(e.wizzRemDistance, 0x20, 'BeginTeleporting sets $20 px of fade');
  assert.equal(e.wizzTimer, 0);
});

test('blue wizzrobe reverses off a plain wall instead of fading', () => {
  const e = {
    objType: OBJ.BLUE_WIZZROBE,
    id: 1,
    anim: 0,
    x: 0x80,
    y: 0x8d,
    dir: DIR.LEFT,
    wizzTimer: 0x70,
    wizzRemDistance: 0,
    wizzTurnCounter: 0,
  };
  const wall = (x) => (x < 0x80 ? { tile: 0x80, walkable: false } : { tile: 0x00, walkable: true });
  stepBlueWizzrobe(e, { link: null, probeTile: wall, rngByte: () => 0 });
  assert.equal(e.wizzRemDistance, 0);
  assert.equal(e.dir, DIR.RIGHT);
  assert.equal(e.x, 0x80, 'moved back out of the wall');
});

test('blue wizzrobe shoots along a shared square row (BlueWizzrobe_TryShooting)', () => {
  const e = createEnemy({ objType: OBJ.BLUE_WIZZROBE, x: 0x80, y: 0x8d });
  e.dir = DIR.LEFT;
  e.anim = 0x20; // FrameCounter & $1F == 0
  e.wizzRemDistance = 0;

  /** @type {import('./projectiles.js').Projectile[]} */
  const out = [];
  tryEnemyShoot(e, out, undefined, { target: { x: 0x40, y: 0x8d } });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, PROJ.MAGIC_SHOT);

  // Facing away from Link: no shot.
  const away = [];
  e.dir = DIR.RIGHT;
  tryEnemyShoot(e, away, undefined, { target: { x: 0x40, y: 0x8d } });
  assert.equal(away.length, 0);

  // Fading through an obstacle: no shot.
  const fading = [];
  e.dir = DIR.LEFT;
  e.wizzRemDistance = 4;
  tryEnemyShoot(e, fading, undefined, { target: { x: 0x40, y: 0x8d } });
  assert.equal(fading.length, 0);
});

test('the two wizzrobe colours no longer share one routine', () => {
  const link = { x: 0x80, y: 0x7d };
  const blue = createEnemy({ objType: OBJ.BLUE_WIZZROBE, x: 0x80, y: 0x8d });
  const red = createEnemy({ objType: OBJ.RED_WIZZROBE, x: 0x80, y: 0x8d });
  blue.dir = DIR.LEFT;
  for (let i = 0; i < 8; i += 1) {
    stepEnemy(blue, BOUNDS, null, { link, rngByte: () => 0x00 });
    stepEnemy(red, BOUNDS, null, { link, rngByte: () => 0x00 });
  }
  assert.notEqual(blue.x, 0x80, 'blue walks');
  assert.equal(red.wizzRemDistance, undefined, 'red has no teleport distance');
  assert.equal(blue.wizzState, undefined, 'blue has no fade state');
});

// --- M9: Pols Voice hop machine -------------------------------------------
// Z_04.asm UpdatePolsVoice / UpdatePolsVoiceState1_Jumping / PolsVoice_MoveX.

test('pols voice is out of the generic wanderer routing', () => {
  assert.equal(isWandererType(OBJ.POLS_VOICE), false);
});

test('pols voice only moves on even frames (UpdatePolsVoice)', () => {
  const e = createEnemy({ objType: OBJ.POLS_VOICE, x: 0x80, y: 0x8d });
  assert.equal(e.polsState, POLS_STATE.WALKING);
  e.dir = DIR.RIGHT;

  stepEnemy(e, BOUNDS, null, {});
  assert.equal(e.x, 0x80, 'odd screen frames only draw');
  assert.equal(e.polsState, POLS_STATE.WALKING);

  stepEnemy(e, BOUNDS, null, {});
  assert.equal(e.x, 0x81, 'PolsVoice_MoveX runs on the even frame');
  assert.equal(e.polsState, POLS_STATE.JUMPING, 'distance 0 launches a hop');
  assert.equal(e.polsSpeedWhole, -3, 'PolsVoiceInitialJumpSpeeds[0]');
  assert.equal(e.polsTargetY, 0x8d);
});

test('pols voice hop rises, lands square-aligned, then walks (UpdatePolsVoiceState1_Jumping)', () => {
  const e = createEnemy({ objType: OBJ.POLS_VOICE, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;

  let peak = e.y;
  let landed = false;
  for (let i = 0; i < 200 && !landed; i += 1) {
    stepEnemy(e, BOUNDS, null, { rngByte: () => 0x40 });
    peak = Math.min(peak, e.y);
    landed = e.polsState === POLS_STATE.WALKING && e.polsRemDistance > 0;
  }

  assert.equal(landed, true, 'the hop terminates');
  assert.ok(peak < 0x8d, 'the hop rises before falling');
  assert.equal(e.y & 0x0f, 0x0d, 'landing aligns Y to the usual $?D');
  assert.equal(e.x & 0x0f, 0x00, 'landing aligns X to a square');
  // `AND #$40; ADC #$30` runs with carry set, so the walk is $31 or $71.
  assert.equal(e.polsRemDistance, 0x71);
});

test('pols voice walks its rolled distance before hopping again', () => {
  const e = createEnemy({ objType: OBJ.POLS_VOICE, x: 0x80, y: 0x8d });
  e.dir = DIR.RIGHT;
  e.polsRemDistance = 4;

  for (let i = 0; i < 8; i += 1) stepEnemy(e, BOUNDS, null, {});
  assert.equal(e.polsState, POLS_STATE.WALKING);
  assert.equal(e.polsRemDistance, 0);
  assert.equal(e.x, 0x84, 'four even frames, one pixel each');
});

// --- M10: Ghini $21 is a common wanderer ----------------------------------
// Z_04.asm UpdateGhini (turn rate $FF "to turn as often as possible").

test('ghini $21 uses the common wanderer at turn rate $FF (UpdateGhini)', () => {
  assert.equal(isWandererType(OBJ.GHINI), true);
  assert.equal(turnRateForType(OBJ.GHINI), 0xff);
  const e = createEnemy({ objType: OBJ.GHINI, x: 0x80, y: 0x8d });
  assert.equal(e.turnRate, 0xff);
});

test('ghini turn rate $FF always wins the roll and locks onto Link', () => {
  const link = { x: 0x80, y: 0x5d };
  const e = createEnemy({ objType: OBJ.GHINI, x: 0x80, y: 0x8d });
  e.dir = DIR.LEFT;
  e.gridOffset = 0x0f; // one px shy of a square — reface after landing
  e.qSpeedFrac = 0x40;
  e.posFrac = 0;
  stepEnemy(e, BOUNDS, null, { chase: link, link, rngByte: () => 0x00 });
  // Moved in the old facing, then truncated + faced UP toward Link (dx < 9).
  assert.equal(e.x, 0x7f);
  assert.equal(e.gridOffset, 0);
  assert.equal(e.dir, DIR.UP);
});

test('flying ghini $22 keeps its own flyer routine', () => {
  assert.equal(isWandererType(OBJ.FLYING_GHINI), false);
  const e = createEnemy({ objType: OBJ.FLYING_GHINI, x: 0x80, y: 0x8d });
  // EndInitFlyer: state 0 (speed-up), max $A0, speed $1F, face down.
  assert.equal(e.flyerState, 0);
  assert.equal(e.flyerSpeed, 0x1f);
  assert.equal(e.flyingMaxSpeedFrac, 0xa0);
  assert.equal(e.dir, DIR.DOWN);
});

// --- M11: Ganon visibility ------------------------------------------------
// Z_04.asm Ganon_ScenePhase2 / Ganon_CheckCollisions / Ganon_UpdateBrownState.

test('blue ganon is invisible until a sword hit lands (Ganon_MoveAndShoot)', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0xa0 });
  assert.equal(e.ganonVisTimer, 0);
  assert.equal(ganonIsVisible(e), false);

  assert.equal(trySwordHitEnemy(e, hitSword(), e.x - 20, e.y, SWORD.MAGIC), true);
  assert.equal(e.ganonVisTimer, GANON_HIT_VISIBLE_FRAMES);
  assert.equal(ganonIsVisible(e), true);
});

test('visible blue ganon cannot be harmed again (Ganon_CheckCollisions)', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0xa0 });
  assert.equal(trySwordHitEnemy(e, hitSword(), e.x - 20, e.y, SWORD.MAGIC), true);
  e.invuln = 0;
  assert.equal(trySwordHitEnemy(e, hitSword(), e.x - 20, e.y, SWORD.MAGIC), false);
});

test('blue ganon relocates and vanishes when the hit window ends', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0xa0 });
  trySwordHitEnemy(e, hitSword(), e.x - 20, e.y, SWORD.MAGIC);
  for (let i = 0; i < GANON_HIT_VISIBLE_FRAMES; i += 1) stepEnemy(e, BOUNDS, null, {});
  assert.equal(e.ganonVisTimer, 0);
  assert.equal(ganonIsVisible(e), false);
  // Ganon_RandomizeLocation: Y = $A0, X from GanonStartXs.
  assert.equal(e.y, 0xa0);
  assert.ok(GANON_START_XS.includes(e.x));
});

test('brown ganon is opaque then flickers (Ganon_UpdateBrownState)', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0xa0 });
  e.hp = 0;
  assert.equal(ganonSwordKoToBrown(e), true);
  assert.ok(e.brownTimer >= GANON_BROWN_FLICKER_TIMER);
  e.anim = 0;
  assert.equal(ganonIsVisible(e), true);

  e.brownTimer = GANON_BROWN_FLICKER_TIMER - 1;
  e.anim = 0;
  assert.equal(ganonIsVisible(e), false);
  e.anim = 1;
  assert.equal(ganonIsVisible(e), true);
});

test('invisible ganon still contacts Link', () => {
  const e = createEnemy({ objType: BOSS.GANON, x: 0x80, y: 0xa0 });
  assert.equal(ganonIsVisible(e), false);
  assert.equal(enemyIsHidden(e), false, 'CheckLinkCollision runs regardless');
});

// --- N5: Aquamentus fireballs are aimed, then fan out ---------------------
// Z_04.asm Aquamentus_Shoot / ShootFireball / @SpreadOutFireballs.

test('aquamentus aims all three fireballs at Link (Aquamentus_Shoot)', () => {
  const e = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0xb0, y: 0x80 });
  e.shootTimer = 0;
  /** @type {import('./projectiles.js').Projectile[]} */
  const out = [];
  tryEnemyShoot(e, out, undefined, { target: { x: 0x40, y: 0x50 } });

  assert.equal(out.length, 3);
  for (const p of out) {
    assert.equal(p.kind, PROJ.FIREBALL);
    assert.equal(p.homing, true);
    assert.ok(p.dir & DIR.LEFT, 'aimed left toward Link');
    assert.ok(p.dir & DIR.UP, 'aimed up toward Link, not straight across');
  }
  // Aquamentus_ObjFireballOffset: middle 0, lower +1, upper -1.
  assert.deepEqual(out.map((p) => p.spreadDy), [0, 1, -1]);
});

test('aquamentus fireballs spread apart every other frame (@SpreadOutFireballs)', () => {
  const e = createEnemy({ objType: OBJ.AQUAMENTUS, x: 0xb0, y: 0x80 });
  e.shootTimer = 0;
  /** @type {import('./projectiles.js').Projectile[]} */
  const out = [];
  tryEnemyShoot(e, out, undefined, { target: { x: 0x40, y: 0x80 } });

  const startYs = out.map((p) => p.y);
  assert.equal(new Set(startYs).size, 1, 'all three leave the same spot');
  for (let i = 0; i < 8; i += 1) {
    for (const p of out) stepProjectile(p, BOUNDS);
  }
  const drift = out.map((p, i) => p.y - startYs[i]);
  assert.equal(drift[1] - drift[0], 4, 'lower fireball sinks 1 px per 2 frames');
  assert.equal(drift[2] - drift[0], -4, 'upper fireball rises 1 px per 2 frames');
});

// --- N4: NES object-slot cap ---------------------------------------------
// Z_07.asm FindEmptyMonsterSlot scans $0B…$01.

test('monster slots run $01–$0B (FindEmptyMonsterSlot)', () => {
  assert.equal(MONSTER_SLOT_COUNT, 11);
  assert.equal(findEmptyMonsterSlot([]), 0x0b);
  assert.equal(findEmptyMonsterSlot([1, 2]), 0x09);
  assert.equal(findEmptyMonsterSlot(new Array(MONSTER_SLOT_COUNT).fill(1)), 0);
});

test('spawns are refused once every object slot is taken', () => {
  /** @type {object[]} */
  const enemies = [];
  for (let i = 0; i < MONSTER_SLOT_COUNT; i += 1) {
    const added = tryAddMonster(enemies, createEnemy({ objType: OBJ.RED_KEESE, x: 0x80, y: 0x8d }));
    assert.equal(added, true, `slot ${i} accepted`);
  }
  assert.equal(monsterSlotsFull(enemies), true);
  const overflow = tryAddMonster(enemies, createEnemy({ objType: OBJ.RED_KEESE, x: 0x80, y: 0x8d }));
  assert.equal(overflow, false);
  assert.equal(enemies.length, MONSTER_SLOT_COUNT);
});

test('resolved spawn lists are trimmed to the slot budget', () => {
  assert.equal(capMonsterList(new Array(20).fill(1)).length, MONSTER_SLOT_COUNT);
  assert.equal(capMonsterList([1, 2, 3]).length, 3);
});

test('death splits only use slots that are actually free', () => {
  const vire = createEnemy({ objType: OBJ.VIRE, x: 0x80, y: 0x8d });
  assert.equal(spawnDeathSplits(vire, [vire]).length, 2);

  /** @type {object[]} */
  const full = [vire];
  while (full.length < MONSTER_SLOT_COUNT) {
    full.push(createEnemy({ objType: OBJ.GEL, x: 0x80, y: 0x8d }));
  }
  // Only the corpse's own slot is available, so one keese is dropped.
  assert.equal(spawnDeathSplits(vire, full).length, 1);
});
