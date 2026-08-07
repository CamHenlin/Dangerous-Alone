import { DIR } from './collision.js';
import { objectTouchesLink } from './objectCollision.js';
import { rectsOverlap, swordDamage, swordHitbox } from './sword.js';
import { bombHits } from './bomb.js';

/** Simple overworld combat dummy for Phase 7 (not full AI). */
export const DUMMY_HP = 0x10; // one wooden sword hit
export const DUMMY_CONTACT_HALF_HEARTS = 1; // half heart (octorok-class)

/**
 * @typedef {object} DummyEnemy
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} dir
 * @property {number} invuln
 * @property {boolean} alive
 * @property {number} roomId
 */

let nextId = 1;

/**
 * Spawn a few dummies on a screen (skip start screen).
 * @param {number} roomId
 * @returns {DummyEnemy[]}
 */
export function spawnDummiesForScreen(roomId) {
  if (roomId === 0x77) {
    return [];
  }
  // Deterministic positions from room id so reloads are stable.
  const seed = roomId * 17;
  const count = 1 + (roomId % 2);
  /** @type {DummyEnemy[]} */
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const x = 0x40 + ((seed + i * 37) % 0x80);
    const y = 0x60 + ((seed + i * 53) % 0x50);
    list.push({
      id: nextId++,
      x: x & 0xf8,
      y: (y & 0xf8) | 5,
      hp: DUMMY_HP,
      dir: i % 2 === 0 ? DIR.LEFT : DIR.RIGHT,
      invuln: 0,
      alive: true,
      roomId,
    });
  }
  return list;
}

/**
 * @param {DummyEnemy} e
 */
export function enemyRect(e) {
  return { x: e.x, y: e.y, w: 16, h: 16 };
}

/**
 * Slow horizontal pace; bounce on pretend bounds.
 * @param {DummyEnemy} e
 */
export function stepDummy(e) {
  if (!e.alive) return;
  if (e.invuln > 0) e.invuln -= 1;
  if (e.invuln > 0) return;
  if (e.dir & DIR.RIGHT) e.x += 1;
  else e.x -= 1;
  if (e.x < 0x30) {
    e.x = 0x30;
    e.dir = DIR.RIGHT;
  }
  if (e.x > 0xd0) {
    e.x = 0xd0;
    e.dir = DIR.LEFT;
  }
}

/**
 * @param {DummyEnemy} e
 * @param {object} sword
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} swordTier
 */
export function trySwordHitEnemy(e, sword, linkX, linkY, swordTier) {
  if (!e.alive || e.invuln > 0) return false;
  const box = swordHitbox(sword, linkX, linkY);
  if (!box) return false;
  if (!rectsOverlap(box, enemyRect(e))) return false;
  e.hp -= swordDamage(swordTier);
  e.invuln = 16;
  if (e.hp <= 0) {
    e.alive = false;
  }
  return true;
}

/**
 * @param {DummyEnemy} e
 * @param {import('./bomb.js').Bomb} bomb
 */
export function tryBombHitEnemy(e, bomb) {
  if (!e.alive || e.invuln > 0) return false;
  if (!bombHits(bomb, enemyRect(e))) return false;
  e.hp -= 0x40;
  e.invuln = 16;
  if (e.hp <= 0) e.alive = false;
  return true;
}

/**
 * @param {DummyEnemy} e
 * @param {number} linkX
 * @param {number} linkY
 */
export function enemyTouchesLink(e, linkX, linkY) {
  if (!e.alive || e.invuln > 0) return false;
  return objectTouchesLink(e.x, e.y, linkX, linkY);
}
