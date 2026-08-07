/**
 * Food / bait item (WieldFood / UpdateBoomerangOrFood).
 * NES uses 3×$FF lifetime phases.
 */

export const BAIT_PHASE_LIFE = 0xff;
export const BAIT_PHASES = 3;

/**
 * @typedef {object} Bait
 * @property {number} x
 * @property {number} y
 * @property {number} life
 * @property {number} phase 0..2 active; ≥3 dead
 * @property {boolean} alive
 */

/**
 * @param {number} linkX
 * @param {number} linkY
 * @param {number} dir
 * @returns {Bait}
 */
export function placeBait(linkX, linkY, dir) {
  let x = linkX;
  let y = linkY;
  if (dir & 0x01) x += 16;
  if (dir & 0x02) x -= 16;
  if (dir & 0x04) y += 16;
  if (dir & 0x08) y -= 16;
  return { x, y, life: BAIT_PHASE_LIFE, phase: 0, alive: true };
}

/**
 * @param {Bait} bait
 */
export function stepBait(bait) {
  if (!bait.alive) return bait;
  bait.life -= 1;
  if (bait.life <= 0) {
    bait.phase = (bait.phase ?? 0) + 1;
    if (bait.phase >= BAIT_PHASES) {
      bait.alive = false;
      return bait;
    }
    bait.life = BAIT_PHASE_LIFE;
  }
  return bait;
}

/**
 * Types that chase food (NES room-template family — not Lynel).
 * Moblin–Octorok `$03–$0A`, Vire `$12`, blue/red Keese `$1B`/`$1C`.
 * @param {number} objType
 */
export function enemyChasesBait(objType) {
  return (
    (objType >= 0x03 && objType <= 0x0a)
    || objType === 0x12
    || objType === 0x1b
    || objType === 0x1c
  );
}
