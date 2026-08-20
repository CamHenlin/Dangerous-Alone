/**
 * One hero, as a record.
 *
 * The game has always had exactly one, spelled as three closure locals in
 * `game/src/play/main.js` — `link`, `sword` and `inv` — and read directly by
 * roughly 1300 call sites. Phase 23 needs four of them, and rewriting 1300
 * references in one change is not something a golden hash can protect.
 *
 * So the record comes first and holds the *same objects* the closure locals
 * already point at. `link` and `sword` are never reassigned, only mutated, so
 * `players[0].link === link` and every existing reference keeps working
 * unchanged while the plural structure goes in around it. The references move
 * onto the record afterwards, a subsystem at a time, with the goldens green
 * throughout.
 */

import { createCamera } from './continuousCamera.js';
import { createInventory, ratchetRupeeCap } from './inventory.js';
import { createRaftRide } from './raft.js';

/**
 * @typedef {object} Player
 * @property {number} index 0-based; player 1 is index 0
 * @property {boolean} active joined and playing
 * @property {object} link position, facing and walk animation
 * @property {object} sword swing state
 * @property {object} [inv] this hero's view of the inventory
 * @property {object} cam where this hero is looking
 * @property {object | null} world the place they are in, from the world registry
 * @property {boolean} rally they followed someone into this world and still
 *   need to be put down somewhere in it
 * @property {number | null} uwOccRoomId dungeon cell they last walked in
 *   (the world's `roomId` is the streaming anchor, which may be a friend's)
 * @property {string | null} uwDoorwayBlockSide entry door this hero is still
 *   walking out of (NES DoorwayDir). Per-player so an ally in the room cannot
 *   clear someone else's latch and freeze them on solid door tiles.
 * @property {string | false} caveInteractLatch last ware/npc key this hero
 *   was standing on (Mode B). Shared, it would skip an ally's first touch.
 * @property {boolean} caveExitLatch ignore the mouth until this hero walks
 *   further in. Shared, walking in one cave would drop a friend out of another.
 * @property {object} raftRide the dock object this hero is riding, or idle.
 *   The raft is physical state on one Link, not on the world — an ally
 *   standing on the pier must not freeze because you boarded.
 * @property {object | null} deathSeq co-op spin; null when they are standing
 *   or the whole party is in the continue menu
 */

/**
 * @param {object} opts
 * @param {number} [opts.index]
 * @param {object} opts.link
 * @param {object} opts.sword
 * @param {object} [opts.inv]
 * @param {object} [opts.cam]
 * @param {object} [opts.world]
 * @param {boolean} [opts.active]
 * @returns {Player}
 */
export function createPlayer({
  index = 0,
  link,
  sword,
  inv,
  cam = createCamera(),
  world = null,
  active = true,
  raftRide = createRaftRide(),
}) {
  return {
    index,
    active,
    link,
    sword,
    inv,
    cam,
    world,
    rally: false,
    uwOccRoomId: null,
    uwDoorwayBlockSide: null,
    caveInteractLatch: /** @type {string | false} */ (false),
    caveExitLatch: false,
    raftRide,
    deathSeq: null,
  };
}

/**
 * Players who are in the game right now.
 * @param {readonly Player[]} players
 */
export function activePlayers(players) {
  return (players ?? []).filter((p) => p?.active);
}

/**
 * The `link` objects of every active player, in player order — the shape
 * `enemyTarget()` and the camera solver want.
 *
 * These are the live records, not copies: a Wallmaster capture writes through
 * one to drag its player along.
 *
 * @param {readonly Player[]} players
 */
export function activeLinks(players) {
  return activePlayers(players).map((p) => p.link);
}

/**
 * How the inventory divides once there is more than one hero.
 *
 * Written down here, as data, because the division is a design decision
 * (see the phase doc) rather than something the field names imply, and
 * because the migration wants to be checkable rather than remembered:
 * `createInventory()` should hold every shared key and no per-player one by
 * the time the split is finished.
 *
 * Shared, because co-op means one adventure: the bag, the purse, quest
 * progress, and the clock — which freezes enemies, and the enemies are global.
 *
 * Per-player, because they are what it means to be a distinct hero on screen:
 * your hearts, your knockback, your death, and which item you have on B. Four
 * players draw from one bag and each carries what they like.
 */
export const PER_PLAYER_INVENTORY_KEYS = Object.freeze([
  'selectedB',
  'halfHearts',
  'maxHalfHearts',
  'invuln',
  'shoveDir',
  'shovePixels',
  'dead',
  'paralyzed',
  'swordBlocked',
  'swordBlockedTimer',
  'itemLiftTimer',
]);

/**
 * Everything else in `createInventory()`: owned items, quest flags, the purse
 * and the clock.
 * @param {object} inv
 */
export function sharedInventoryKeys(inv) {
  const perPlayer = new Set(PER_PLAYER_INVENTORY_KEYS);
  return Object.keys(inv).filter((k) => !perPlayer.has(k));
}

/**
 * One hero's own inventory fields, defaulted from a fresh inventory.
 * @param {object} [defaults]
 */
export function createPlayerStatus(defaults = createInventory()) {
  /** @type {Record<string, unknown>} */
  const status = {};
  for (const key of PER_PLAYER_INVENTORY_KEYS) status[key] = defaults[key];
  return status;
}

/**
 * A player's view of the inventory: their own hearts, everyone's bag.
 *
 * Reads and writes route by key — the eleven per-player fields to `status`,
 * the other twenty-eight to `shared` — so four views over one `shared` give
 * four heroes who each have their own hearts, knockback and B slot while
 * spending from one purse. Taking a rupee through any of them is taking it
 * for the group, which is the whole point of co-op.
 *
 * It is a facade rather than a signature change because the alternative is
 * rewriting ~200 call sites and their tests to thread two objects where they
 * used to take one — and `harmLink()` alone needs the per-player `halfHearts`
 * and the shared `ring` in the same breath. Every existing caller keeps
 * working, and the division stays explicit in
 * `PER_PLAYER_INVENTORY_KEYS` rather than being implied by a parameter list.
 *
 * @param {object} shared the group's inventory
 * @param {object} [status] this player's own fields
 */
export function createInventoryView(shared, status = createPlayerStatus()) {
  const view = {};
  const define = (key, target) => {
    Object.defineProperty(view, key, {
      get: () => target[key],
      set: (value) => {
        const prev = target[key];
        target[key] = value;
        if (key === 'rupees' && (value | 0) < (prev | 0)) ratchetRupeeCap(target);
      },
      enumerable: true,
      configurable: true,
    });
  };
  for (const key of PER_PLAYER_INVENTORY_KEYS) {
    define(key, status);
    // A hero's own fields have no business on the group's inventory; leaving
    // stale copies there is a debugging trap ("why does inv.halfHearts say 6
    // when the player has one heart left?").
    delete shared[key];
  }
  // Enumerated from a fresh inventory rather than from `shared`, so the view
  // covers the canonical shape even if it is handed a partially built object.
  for (const key of sharedInventoryKeys(createInventory())) define(key, shared);
  return view;
}
