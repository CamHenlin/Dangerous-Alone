/**
 * Clock drop: freeze only enemies visible at pickup (not forever / not new spawns).
 */

/**
 * Tag living enemies that currently intersect the camera as clock-frozen.
 * @param {Iterable<object>} enemies
 * @param {(e: object) => boolean} isVisible
 */
export function tagVisibleEnemiesForClock(enemies, isVisible) {
  for (const e of enemies) {
    if (!e?.alive) continue;
    if (isVisible(e)) e.clockFrozen = true;
  }
}

/**
 * Clear InvClock and per-enemy freeze tags.
 * @param {object} inv
 * @param {Iterable<object> | null | undefined} [enemies]
 */
export function clearClockFreeze(inv, enemies = null) {
  inv.clock = 0;
  if (!enemies) return;
  for (const e of enemies) {
    if (e) e.clockFrozen = false;
  }
}

/**
 * True while at least one living foe still carries the freeze tag.
 * @param {Iterable<object>} enemies
 */
export function clockFreezeActive(enemies) {
  for (const e of enemies) {
    if (e?.alive && e.clockFrozen) return true;
  }
  return false;
}

/**
 * @param {object} e
 */
export function enemyIsClockFrozen(e) {
  return Boolean(e?.clockFrozen);
}

/**
 * InvClock is shared, but the freeze tags live on one world's foes.
 * A friend walking a cellar must not clear an overworld clock just because
 * that cellar has no tagged monsters.
 *
 * @param {unknown} clockWorldId
 * @param {unknown} worldId
 * @param {Iterable<object>} enemies
 */
export function shouldClearClock(clockWorldId, worldId, enemies) {
  if (!clockWorldId || clockWorldId !== worldId) return false;
  return !clockFreezeActive(enemies);
}
