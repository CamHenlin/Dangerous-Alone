/**
 * Status-bar rupee counter roll (`World_ChangeRupees` @ `Z_01.asm:2837`).
 *
 * The ROM posts `RupeesToAdd` / `RupeesToSubtract` and drains one unit every
 * second frame, playing the heart-taken tune (`Tune0Request = $10`) on each
 * step, so the counter visibly spins up or down after a pickup or purchase.
 *
 * Deviation: we roll the *displayed* total toward the already-applied
 * `inv.rupees` rather than deferring the balance itself. That keeps every
 * affordability check (shops, the arrow toll, door repair) instantaneous, as
 * the rest of the codebase and its tests expect, while reproducing the
 * animation and its audio cadence.
 */

/** Counter moves one step every other frame. */
export const RUPEE_ROLL_PERIOD = 2;

/** @returns {{ shown: number, frame: number }} */
export function createRupeeRoll(initial = 0) {
  return { shown: Math.max(0, initial | 0), frame: 0 };
}

/** Snap the display to a value (room loads, save restore). */
export function resetRupeeRoll(roll, value) {
  roll.shown = Math.max(0, value | 0);
  roll.frame = 0;
  return roll;
}

/**
 * Advance the roll one frame toward `target`.
 * @param {{ shown: number, frame: number }} roll mutated
 * @param {number} target authoritative rupee total
 * @returns {{ changed: boolean, playTune: boolean }}
 */
export function stepRupeeRoll(roll, target) {
  // The ROM's counter is a byte. Co-op multiplies the purse by who is sitting
  // down (255 × N), so the roll has to chase the real total, not $FF.
  const goal = Math.max(0, target | 0);
  if (roll.shown === goal) {
    roll.frame = 0;
    return { changed: false, playTune: false };
  }
  roll.frame = (roll.frame + 1) % RUPEE_ROLL_PERIOD;
  if (roll.frame !== 0) {
    return { changed: false, playTune: false };
  }
  roll.shown += roll.shown < goal ? 1 : -1;
  return { changed: true, playTune: true };
}
