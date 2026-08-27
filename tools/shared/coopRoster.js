/**
 * Who is in the game, who can sit down, and who can stand up.
 *
 * Joining and leaving are session rules, not world ones: a new hero appears
 * beside the host with a full glass of the hearts the party has earned, and
 * the last player still standing cannot leave, because that would be quitting
 * without going through the title.
 */

import { B_ITEM, ownedBItems } from './inventory.js';
import { activePlayers } from './player.js';

/**
 * The lowest-numbered player still in the game — the one a joiner stands
 * next to, and the one the continue menu still answers to.
 * @param {readonly object[]} players
 */
export function hostPlayer(players) {
  return activePlayers(players)[0] ?? null;
}

/**
 * The last hero cannot leave this way. Quitting is a title-screen action.
 * @param {readonly object[]} players
 * @param {object} [p]
 */
export function canLeave(players, p) {
  return Boolean(p?.active) && activePlayers(players).length > 1;
}

/**
 * First empty seat, or -1 when the session is full.
 * @param {readonly object[]} players
 * @param {number} [max]
 */
export function nextJoinIndex(players, max = 4) {
  for (let i = 0; i < max; i += 1) {
    const existing = players.find((p) => p.index === i);
    if (!existing || !existing.active) return i;
  }
  return -1;
}

/**
 * Give a joining hero a full glass at the host's current container count.
 *
 * `maxHalfHearts` is per-player, but a heart container raises everyone, so
 * the host's max is the party's max at the moment someone sits down.
 *
 * @param {object} joinerInv
 * @param {object} hostInv
 */
export function fillJoiningHearts(joinerInv, hostInv) {
  const max = hostInv?.maxHalfHearts ?? 6;
  joinerInv.maxHalfHearts = max;
  joinerInv.halfHearts = max;
  joinerInv.dead = false;
  joinerInv.invuln = 48;
  joinerInv.shovePixels = 0;
  joinerInv.paralyzed = 0;
  return joinerInv;
}

/**
 * Put something on a joiner's B so the HUD and the button agree.
 *
 * A new inventory view starts at `none`. B still drops a bomb from an empty
 * slot when the bag has some, so player two looked unarmed and threw one.
 * Mirror the host when that item is still in the bag; otherwise take the
 * first owned item so an empty host slot does not leave the joiner empty.
 *
 * @param {object} joinerInv
 * @param {object} hostInv
 */
export function copyJoiningBSlot(joinerInv, hostInv) {
  if (!joinerInv) return null;
  const owned = ownedBItems(joinerInv);
  const hostSlot = hostInv?.selectedB;
  if (hostSlot && hostSlot !== B_ITEM.NONE && owned.includes(hostSlot)) {
    joinerInv.selectedB = hostSlot;
  } else {
    joinerInv.selectedB = owned[0] ?? B_ITEM.NONE;
  }
  return joinerInv.selectedB;
}

/**
 * The first pad that is actually plugged in — player one's device when
 * their slot still says "every pad". Extra controllers are join devices,
 * not a second copy of player one.
 *
 * @param {ArrayLike<object|null|undefined>} [pads]
 */
export function hostPadIndex(pads) {
  const list = Array.from(pads ?? []);
  return list.findIndex(Boolean);
}

/**
 * Pads whose Start should sit someone down.
 *
 * An active seat's own pad is never a join. Player one's leftover-pads
 * claim (`null`) covers only the host pad, so a second controller can
 * join instead of opening the inventory.
 *
 * @param {ArrayLike<object|null|undefined>} pads
 * @param {{ padSlots?: readonly (number|null)[], activeIndexes?: readonly number[] }} [opts]
 */
export function joiningPads(pads, { padSlots = [], activeIndexes = [0] } = {}) {
  const host = hostPadIndex(pads);
  const owned = new Set();
  for (const i of activeIndexes) {
    const slot = padSlots[i];
    if (slot == null && i === 0) {
      if (host >= 0) owned.add(host);
    } else if (typeof slot === 'number' && slot >= 0) {
      owned.add(slot);
    }
  }
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < (pads?.length ?? 0); i += 1) {
    if (!pads[i] || owned.has(i)) continue;
    out.push(i);
  }
  return out;
}

/**
 * Which empty seat a Start press on this pad should sit down.
 * A seat that already claims the pad wins; otherwise the next empty one.
 *
 * @param {number} padIndex
 * @param {{ padSlots?: readonly (number|null)[], players?: readonly object[], max?: number }} [opts]
 */
export function seatForJoiningPad(padIndex, { padSlots = [], players = [], max = 4 } = {}) {
  for (let i = 0; i < max; i += 1) {
    if (padSlots[i] !== padIndex) continue;
    const p = players.find((q) => q.index === i);
    if (!p?.active) return i;
    return -1;
  }
  return nextJoinIndex(players, max);
}

/**
 * Rising edges on a set of pad Start buttons.
 * Holding Start must not fill every empty seat in one sitting.
 */
export function createPadStartEdges() {
  /** @type {Set<number>} */
  let prev = new Set();
  return {
    /**
     * @param {readonly number[]} padIndexes
     * @param {ArrayLike<{ buttons?: { pressed?: boolean }[] }|null|undefined>} pads
     * @param {number} [button]
     */
    rising(padIndexes, pads, button = 9) {
      const down = (padIndexes ?? []).filter((i) => pads?.[i]?.buttons?.[button]?.pressed);
      const edges = down.filter((i) => !prev.has(i));
      prev = new Set(down);
      return edges;
    },
  };
}

/**
 * Copy the host's pose so a joiner is not dropped in a wall two rooms away.
 *
 * Sit-down and death regroup only. Walking the stairs into a live dungeon
 * uses the mouth (`dungeonEntranceSpawn`), not this.
 * @param {object} joiner
 * @param {object} host
 */
export function snapToHost(joiner, host) {
  if (!joiner?.link || !host?.link) return joiner;
  joiner.link.x = host.link.x;
  joiner.link.y = host.link.y;
  joiner.link.dir = host.link.dir;
  joiner.link.posFrac = 0;
  joiner.link.gridOffset = 0;
  joiner.link.moving = false;
  joiner.world = host.world;
  joiner.uwOccRoomId = host.uwOccRoomId ?? null;
  joiner.uwDoorwayBlockSide = host.uwDoorwayBlockSide ?? null;
  // Per-hero cave latches. Copying the host's means a sit-down in a shop
  // does not immediately walk the joiner back out the mouth.
  joiner.caveExitLatch = Boolean(host.caveExitLatch);
  joiner.caveInteractLatch = host.caveInteractLatch ?? false;
  return joiner;
}
