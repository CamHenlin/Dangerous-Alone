/**
 * Headless one-frame step of the shared combat sim.
 *
 * `goldenSession.js` builds a scripted session and hashes the trajectory;
 * this module is the physics those scripts drive. Lifting it out of that
 * file is the first cut of "the sim is not the Pixi closure": Node can step
 * link, sword, foes and hurt/shove with no `Container`. Mode transitions,
 * room loads, drops and projectiles still live in `game/src/play/main.js`
 * and are covered by the browser harness.
 *
 * Frame order mirrors `stepOverworld()` / `stepCombat()` for the subset it
 * covers. Changing the order here changes the committed golden hashes.
 */

import { DIR } from './collision.js';
import {
  contactHalfHearts,
  enemyTouchesLink,
  stepEnemy,
  trySwordHitEnemy,
} from './enemies.js';
import { activateEnemiesInView, enemyCombatActive } from './enemyViewActivation.js';
import { crc32Hex } from './hash.js';
import { canSwingSword, harmLink, stepLinkStatus } from './inventory.js';
import { oppositeDir, stepLink, stepShove } from './linkMotion.js';
import { isSwordActive, stepSword, tryStartSword } from './sword.js';

/**
 * Link's own frame: a swing starts, or he slides from a hit, or he walks.
 * `stepOverworld()` gates movement on exactly these flags, in this order.
 * @param {object} state
 * @param {{ mask?: number, a?: boolean }} frame
 */
export function stepHero(state, frame) {
  const { link, inv, sword } = state;
  if (frame.a && !inv.dead && canSwingSword(inv)) {
    tryStartSword(sword, link.dir, inv.sword);
  }
  if (inv.dead) return;
  if (inv.shovePixels > 0) {
    // Knockback outranks walking, and a blocked slide ends on the spot.
    const result = stepShove(link, state.tileGrid, inv.shoveDir, inv.shovePixels, {
      roomId: state.roomId,
    });
    inv.shovePixels = result.shovePixels;
    if (inv.shovePixels <= 0) {
      inv.shovePixels = 0;
      inv.shoveDir = 0;
    }
    return;
  }
  if (isSwordActive(sword)) return;
  stepLink(link, state.tileGrid, frame.mask ?? 0, undefined, state.roomId);
}

/**
 * The enemy half, in `stepCombat()` order: reveal, swing damage, enemy
 * movement, contact, then the status decay that closes the frame.
 * @param {object} state
 */
export function stepFoes(state) {
  const { link, inv, sword, enemies } = state;
  activateEnemiesInView(enemies, () => true);

  if (isSwordActive(sword)) {
    stepSword(sword);
    for (const e of enemies) {
      if (!enemyCombatActive(e)) continue;
      trySwordHitEnemy(e, sword, link.x, link.y, inv.sword, { enemies });
    }
  }

  for (const e of enemies) {
    if (!enemyCombatActive(e)) continue;
    stepEnemy(e, state.bounds, state.tileGrid, {
      chase: { x: link.x, y: link.y },
      link,
      enemies,
      rngByte: state.rngByte,
    });
  }

  if (!inv.dead) {
    for (const e of enemies) {
      if (!enemyCombatActive(e)) continue;
      if (!enemyTouchesLink(e, link.x, link.y)) continue;
      const result = harmLink(inv, contactHalfHearts(e.objType));
      if (!result.applied) continue;
      // main.js `hurtLinkFrom`: knocked away from the foe that landed the hit.
      inv.shoveDir = oppositeDir(e.dir) || oppositeDir(link.dir) || DIR.DOWN;
      inv.shovePixels = 0x20;
      break;
    }
  }

  stepLinkStatus(inv);
}

/**
 * Advance one 60Hz frame, folding the result into the trajectory hash.
 *
 * The fold is the point. Hashing only the final state passes a scenario that
 * reaches the same resting place by a different route — a swing landing a
 * frame late still ends with a dead Octorok — and those off-by-one-frame
 * shifts are precisely what rethreading the hero can cause. `state.trace`
 * pins every frame, so the route has to match too.
 *
 * @param {object} state
 * @param {object} [frame]
 */
export function stepSession(state, frame = {}) {
  if (state.heroes?.length > 1) {
    for (let i = 0; i < state.heroes.length; i += 1) {
      const hero = state.heroes[i];
      stepHero(
        { ...state, link: hero.link, inv: hero.inv, sword: hero.sword },
        {
          mask: frame.masks?.[i] ?? (i === 0 ? frame.mask : 0) ?? 0,
          a: frame.as?.[i] ?? (i === 0 && frame.a),
        },
      );
    }
  } else {
    stepHero(state, frame);
  }
  stepFoes(state);
  state.frame += 1;
  state.trace = crc32Hex(Buffer.from(`${state.trace}|${hashSession(state)}`, 'utf8'));
  return state;
}

/**
 * Stable CRC over everything the plural-hero refactor could disturb.
 *
 * The field order is fixed and every value is defaulted, so the hash moves
 * when the simulation moves and not when an unrelated field is added.
 * @param {object} state
 */
export function hashSession(state) {
  const { link, inv, sword } = state;
  const parts = [
    `f:${state.frame}`,
    `seed:${state.seed}`,
    `room:${state.roomId ?? -1}`,
    `lx:${link.x}`,
    `ly:${link.y}`,
    `ldir:${link.dir}`,
    `loff:${link.gridOffset ?? 0}`,
    `lanim:${link.animFrame ?? 0}`,
    `lmov:${link.moving ? 1 : 0}`,
    `sw:${sword.phase}:${sword.timer}:${sword.dir}`,
    `hh:${inv.halfHearts ?? 0}/${inv.maxHalfHearts ?? 0}`,
    `rup:${inv.rupees ?? 0}`,
    `key:${inv.keys ?? 0}`,
    `bomb:${inv.bombs ?? 0}`,
    `tier:${inv.sword ?? 0}`,
    `b:${inv.selectedB ?? 0}`,
    `inv:${inv.invuln ?? 0}`,
    `shove:${inv.shoveDir ?? 0}:${inv.shovePixels ?? 0}`,
    `par:${inv.paralyzed ?? 0}`,
    `dead:${inv.dead ? 1 : 0}`,
  ];
  if (state.heroes) {
    for (const hero of state.heroes.slice(1)) {
      parts.push(
        `p:${hero.link.x}:${hero.link.y}:${hero.link.dir}:${hero.inv.halfHearts ?? 0}`,
      );
    }
  }
  for (const e of state.enemies) {
    parts.push(
      `e:${e.objType}:${e.x}:${e.y}:${e.dir ?? 0}:${e.hp ?? 0}:${e.alive ? 1 : 0}:${e.invuln ?? 0}`,
    );
  }
  return crc32Hex(Buffer.from(parts.join('|'), 'utf8'));
}
