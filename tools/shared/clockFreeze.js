/**
 * Clock drop: freeze only enemies visible at pickup (not forever / not new
 * spawns), and only while someone still occupies the screen it was taken on.
 *
 * InvClock is a world flag because it freezes that place's foes, but the NES
 * clears it on room change. Continuous overworld / leftover co-op has no
 * scroll, so occupancy of the pickup cell is the room change.
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
 * True when this occupancy is the screen InvClock is covering.
 *
 * A friend on another overworld cell must not keep the picker's invuln, and
 * getting hurt there must not expire a clock the picker is still standing in.
 *
 * @param {unknown} clockWorldId
 * @param {number | null | undefined} clockRoomId
 * @param {unknown} worldId
 * @param {number | null | undefined} occupyingRoomId
 */
export function clockCoversOccupancy(clockWorldId, clockRoomId, worldId, occupyingRoomId) {
  if (!clockWorldId || clockWorldId !== worldId) return false;
  if (clockRoomId == null || occupyingRoomId == null) return false;
  return (occupyingRoomId & 0xff) === (clockRoomId & 0xff);
}

/**
 * InvClock is shared, but the freeze tags live on one world's foes and one
 * screen. A friend walking a cellar must not clear an overworld clock just
 * because that cellar has no tagged monsters, and a leftover walk onto the
 * next cell must expire it even if the tagged foes are still on another
 * camera.
 *
 * @param {unknown} clockWorldId
 * @param {unknown} worldId
 * @param {Iterable<object>} enemies
 * @param {number | null | undefined} [clockRoomId]
 * @param {Iterable<number> | null | undefined} [occupyingRoomIds] rooms occupied
 *   by players in `worldId`. Omit to skip the vacancy test.
 */
export function shouldClearClock(clockWorldId, worldId, enemies, clockRoomId, occupyingRoomIds) {
  if (!clockWorldId || clockWorldId !== worldId) return false;
  if (!clockFreezeActive(enemies)) return true;
  if (clockRoomId == null || occupyingRoomIds == null) return false;
  const want = clockRoomId & 0xff;
  for (const id of occupyingRoomIds) {
    if ((id & 0xff) === want) return false;
  }
  return true;
}
