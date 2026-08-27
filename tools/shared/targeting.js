/**
 * Who an enemy is coming for.
 *
 * Every hostile in the game reads one hero: `stepEnemy` takes a `chase` point
 * to walk toward and a `link` object to grab, trap or shoot at. With four
 * heroes on one map that choice stops being obvious, so it moves here — one
 * place that answers "nearest living player", instead of `link` spelled out
 * at each of the call sites in `enemies.js`, `bossAi.js` and `wandererAi.js`
 * (Phase 23).
 *
 * At one player every function here returns that player, so the answer is the
 * same one the game has always given.
 *
 * Dungeon foes only chase a hero (or bait) who still occupies their home
 * cell. Once you walk out the door they go back to wandering — otherwise
 * every Goriya faces the seam and piles up on that wall.
 */

import { inAnchorPlayArea, localInRoom, occupyingRoom } from './continuousCamera.js';

/**
 * True when `target` is standing in this foe's home room.
 * Untagged foes (caves, single-screen) treat the anchor as home.
 *
 * @param {{ x: number, y: number } | null | undefined} target
 * @param {{ homeRoomId?: number | null, x?: number, y?: number }} foe
 * @param {number | null | undefined} anchorRoomId
 */
export function targetInFoeHome(target, foe, anchorRoomId) {
  if (!target || anchorRoomId == null) return Boolean(target);
  const home = (foe?.homeRoomId ?? anchorRoomId) & 0xff;
  if (occupyingRoom(anchorRoomId, target.x, target.y).roomId === home) return true;
  // Door-lip / HUD rounding can land occupyingRoom on a neighbour while the
  // sprite is still on this cell's floor. Chase that hero; walking out of the
  // play rectangle still drops them.
  const local = localInRoom(anchorRoomId, home, target.x, target.y);
  return inAnchorPlayArea(local.x, local.y);
}

/**
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * Manhattan distance, which is the metric the NES's axis-oriented pursuit
 * already behaves as if it uses, and is cheaper than a hypotenuse per foe per
 * frame.
 * @param {Point} a
 * @param {number} x
 * @param {number} y
 */
function axialDistance(a, x, y) {
  return Math.abs(a.x - x) + Math.abs(a.y - y);
}

/**
 * Index of the closest of `targets` to a point, or -1 when there are none.
 *
 * Ties go to the earliest in the list. That is deliberate rather than
 * arbitrary: it makes the choice stable frame to frame (a foe equidistant
 * from two players does not jitter between them) and, once `targets` is the
 * player list, it settles ties in player-number order.
 *
 * @param {readonly (Point | null | undefined)[] | null | undefined} targets
 * @param {number} x
 * @param {number} y
 */
export function nearestTargetIndex(targets, x, y) {
  let best = -1;
  let bestDist = Infinity;
  const list = targets ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    if (!t) continue;
    const d = axialDistance(t, x, y);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/**
 * The closest of `targets` to a point, or null when there are none.
 * @template {Point} T
 * @param {readonly T[] | null | undefined} targets
 * @param {number} x
 * @param {number} y
 * @returns {T | null}
 */
export function nearestTarget(targets, x, y) {
  const i = nearestTargetIndex(targets, x, y);
  return i < 0 ? null : targets[i];
}

/**
 * Resolve one enemy's target for this frame.
 *
 * `chase` is a position to walk toward, and may be the bait — outranking
 * every hero is the whole point of dropping it. `index` says *which* hero was
 * chosen, rather than handing back the target itself, because the caller
 * holds two views of a player: a position snapshot taken before the enemy
 * loop, and the live record. Things that read the live one write through it
 * (a Wallmaster's capture drags the player by assigning to `link.x`), while
 * the pursuit maths has to use the snapshot or a mid-loop capture would
 * silently redirect every foe stepped after it in the same frame.
 *
 * @param {Point} e the enemy asking
 * @param {object} opts
 * @param {readonly (Point | null | undefined)[]} opts.targets hero positions, in player order
 * @param {{ alive?: boolean, x: number, y: number } | null} [opts.bait]
 * @param {number | null} [opts.anchorRoomId] current streaming anchor
 * @param {boolean} [opts.confineToHome] dungeon: ignore heroes in other cells
 * @returns {{ chase: Point | null, index: number }}
 */
export function enemyTarget(e, { targets, bait = null, anchorRoomId = null, confineToHome = false }) {
  const allowed = (t) => t && (!confineToHome || targetInFoeHome(t, e, anchorRoomId));
  const inRoom = (targets ?? []).map((t) => (allowed(t) ? t : null));
  const index = nearestTargetIndex(inRoom, e.x, e.y);
  if (bait?.alive && allowed(bait)) return { chase: { x: bait.x, y: bait.y }, index };
  const hero = index < 0 ? null : inRoom[index];
  return { chase: hero ? { x: hero.x, y: hero.y } : null, index };
}
