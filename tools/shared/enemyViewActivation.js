/**
 * Continuous camera: foes may stream in before their sprites enter the view.
 * Hold AI / draw until the first frame they intersect the camera.
 */

import { isRupeeStash } from './rupeeStash.js';

/**
 * Mark freshly spawned (or streamed) foes as waiting for first camera contact.
 * Edge-pending foes stay gated by edge spawn; NPCs still wait for view so a
 * fairy on a clipped neighbor room does not run off-screen.
 * @param {Iterable<object>} enemies
 */
export function markEnemiesAwaitingView(enemies) {
  for (const e of enemies) {
    if (!e) continue;
    if (e.viewActivated == null) e.viewActivated = false;
  }
}

/**
 * True when this object should skip the monster spawn-cloud (items / NPCs).
 * @param {object | null | undefined} e
 */
export function skipsSpawnCloud(e) {
  return Boolean(e?.npc || isRupeeStash(e?.objType));
}

/**
 * Activate any living foe whose sprite intersects the camera.
 * Starts the spawn-cloud on first reveal (unless already edge-pending).
 * @param {Iterable<object>} enemies
 * @param {(e: object) => boolean} isVisible
 * @returns {object[]} newly activated foes
 */
export function activateEnemiesInView(enemies, isVisible) {
  /** @type {object[]} */
  const newly = [];
  for (const e of enemies) {
    if (!e?.alive || e.viewActivated || e.edgePending) continue;
    if (!isVisible(e)) continue;
    e.viewActivated = true;
    if (!skipsSpawnCloud(e) && (e.spawnCloud ?? 0) <= 0) e.spawnCloud = 0x10;
    newly.push(e);
  }
  return newly;
}

/**
 * True when a foe exists but must not move / collide / draw yet.
 * @param {object | null | undefined} e
 */
export function enemyAwaitingView(e) {
  return Boolean(e?.alive && !e.viewActivated && !e.edgePending);
}

/**
 * True when combat AI may run (not awaiting view, not edge-pending).
 * @param {object | null | undefined} e
 */
export function enemyCombatActive(e) {
  return Boolean(e?.alive && e.viewActivated && !e.edgePending);
}
