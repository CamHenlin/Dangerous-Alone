import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  OBJ,
  VIRE_JUMP_OFFSETS,
  applyVireJump,
  createEnemy,
  darknutParries,
  enemyWeaponVulnerable,
  hpForType,
  spawnDeathSplits,
  wakeArmos,
} from './enemies.js';
import { createInventory, harmLink, applyBubbleSwordBlock, canSwingSword } from './inventory.js';
import { throwEnemyBoomerang, BOOM_PHASE, stepBoomerang } from './boomerang.js';
import { itemPositionsFromLevel, decodeItemPosByte, L1_ITEM_POS } from './roomSecrets.js';
import { tryCreateDropFromKill, createDropCounters } from './enemyDrops.js';

test('Gel HP pair nibble 0 is honored (no $10 clamp)', () => {
  assert.equal(hpForType(OBJ.GEL), 0);
  const g = createEnemy({ objType: OBJ.GEL, x: 40, y: 80 });
  assert.equal(g.hp, 0);
  assert.equal(g.alive, true);
});

test('Peahat weapons only in flyer state 5', () => {
  const e = createEnemy({ objType: OBJ.PEAHAT, x: 40, y: 80 });
  e.flyerState = 2;
  assert.equal(enemyWeaponVulnerable(e), false);
  e.flyerState = 5;
  assert.equal(enemyWeaponVulnerable(e), true);
});

test('Armos wake starts fade; weapons blocked while fading', () => {
  const e = createEnemy({ objType: OBJ.ARMOS, x: 0xb0, y: 0x80 });
  assert.equal(e.armosStatue, true);
  assert.equal(enemyWeaponVulnerable(e), false);
  wakeArmos(e);
  assert.equal(e.armosStatue, false);
  assert.ok((e.armosFade ?? 0) > 0);
  assert.equal(enemyWeaponVulnerable(e), false);
});

test('Darknut face-parry on opposing dirs', () => {
  assert.equal(darknutParries(DIR.RIGHT, DIR.LEFT), true);
  assert.equal(darknutParries(DIR.UP, DIR.DOWN), true);
  assert.equal(darknutParries(DIR.RIGHT, DIR.RIGHT), false);
  assert.equal(darknutParries(DIR.RIGHT, DIR.UP), false);
  assert.equal(darknutParries(DIR.DOWN, DIR.LEFT), false);
});

test('Bubble sword block + zero-damage harm', () => {
  const inv = createInventory();
  applyBubbleSwordBlock(inv, 0x2b);
  assert.equal(canSwingSword(inv), false);
  assert.equal(inv.swordBlocked, 0, 'flashing bubble is the long timer, not sticky');
  const r = harmLink(inv, 0);
  assert.equal(r.applied, false);
  assert.equal(inv.invuln, 0);
});

test('Vire death splits into 2 red keese', () => {
  const v = createEnemy({ objType: OBJ.VIRE, x: 80, y: 80 });
  v.alive = false;
  const born = spawnDeathSplits(v, []);
  assert.equal(born.length, 2);
  assert.ok(born.every((e) => e.objType === OBJ.RED_KEESE));
});

test('Vire hop offsets cancel over one tile', () => {
  assert.equal(
    VIRE_JUMP_OFFSETS.reduce((a, b) => a + b, 0),
    0,
  );
  const e = { dir: DIR.RIGHT, gridOffset: 0, y: 100 };
  const startY = e.y;
  for (let i = 0; i < 16; i += 1) {
    e.gridOffset = i;
    applyVireJump(e);
  }
  assert.equal(e.y, startY);
});

test('slot 1 suppresses drops for room-item carriers', () => {
  const drop = tryCreateDropFromKill({
    objType: OBJ.STALFOS,
    counters: createDropCounters(),
    randomByte: () => 0,
    damageType: 0,
    slotIndex: 1,
    x: 0,
    y: 0,
  });
  assert.equal(drop, null);
});

test('enemy boomerang returns to owner', () => {
  const boom = throwEnemyBoomerang(40, 80, DIR.RIGHT, 7);
  assert.equal(boom.hostile, true);
  assert.equal(boom.maxDist, 0x51);
  for (let i = 0; i < 40; i += 1) stepBoomerang(boom, 40, 80);
  assert.ok(boom.phase === BOOM_PHASE.RETURN || boom.phase === BOOM_PHASE.DONE);
});

test('itemPositionsFromLevel decodes packed LevelInfo bytes', () => {
  const pos = itemPositionsFromLevel([0xc9, 0xac, 0x89, 0x87]);
  assert.deepEqual(pos[0], decodeItemPosByte(0xc9));
  assert.deepEqual(itemPositionsFromLevel(null)[0], L1_ITEM_POS[0]);
});
