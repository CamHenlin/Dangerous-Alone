/**
 * Give the browser a turn to paint between room rasters so a neighborhood
 * stream does not land as one long hitch.
 *
 * Uses `scheduler.yield` when the browser has it (it is allowed to paint),
 * otherwise a macrotask. Do not use rAF here: debug steppers and golden
 * drains pump `setTimeout(0)` / pendingLoads, not animation frames.
 */
export function yieldToPaint() {
  const scheduler = globalThis.scheduler;
  if (scheduler && typeof scheduler.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
