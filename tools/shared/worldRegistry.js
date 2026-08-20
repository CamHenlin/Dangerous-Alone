/**
 * The places currently loaded, and everything alive in each of them.
 *
 * Distinct from `world.js`, which is the overworld's fixed geometry — this is
 * about live state: the overworld is a world, each labyrinth level is a world,
 * each cave is a world, each cellar is a world, and several are live at once
 * when players split up.
 *
 * `main.js` has always had exactly one set of entity arrays, wiped by
 * `clearEnemies()` on every transition, because there was only ever one place
 * loaded (Phase 23).
 *
 * A world lives while at least one player is in it and is discarded when the
 * last one leaves. That rule is what preserves single-player behaviour: at one
 * player, walking into a labyrinth empties the overworld, so it is thrown away
 * and walking back out builds a fresh one — enemies respawn, exactly as the
 * ROM does. Nothing here is save state; a world is what is *happening*, not
 * what has been *earned*, so quest flags, the bag and dungeon progress stay
 * with the session.
 */

import { createCandleStore } from './candle.js';

/** Identifies a world so players can be asked whether they are in the same one. */
export function overworldWorldId() {
  return 'overworld';
}

/** @param {number} level */
export function dungeonWorldId(level) {
  return `dungeon:${level}`;
}

/** @param {number|string} caveId */
export function caveWorldId(caveId) {
  return `cave:${caveId}`;
}

/**
 * Mode-9 cellars are a hard cut, not a streamed neighbour of the top-down
 * map. They get a world of their own so a friend still walking the
 * labyrinth keeps that place's anchor, foes and camera.
 * @param {number} level
 * @param {number} cellarRoomId
 */
export function cellarWorldId(level, cellarRoomId) {
  return `cellar:${level}:${cellarRoomId & 0xff}`;
}

/** @param {string | null | undefined} id */
export function isCellarWorldId(id) {
  return String(id ?? '').startsWith('cellar:');
}

/**
 * @param {string | null | undefined} id
 * @returns {{ level: number, cellarRoomId: number } | null}
 */
export function parseCellarWorldId(id) {
  const m = /^cellar:(\d+):(\d+)$/.exec(String(id ?? ''));
  if (!m) return null;
  return { level: Number(m[1]), cellarRoomId: Number(m[2]) };
}

/**
 * The fields a world owns. `main.js` keeps these as closure variables and the
 * focus swaps them in and out, so this list is also the contract for what has
 * to be saved and restored when a player moves between worlds — a field
 * missing here is one that would leak from one place into another.
 */
export const WORLD_STATE_KEYS = Object.freeze([
  // Which place this is, and the labyrinth record when it is one.
  'mode',
  'dungeon',
  // Which room of this place is anchored, and that room's data.
  //
  // On the world rather than on a player because the streaming model has one
  // anchor: positions are anchor-local and the rooms around it are streamed
  // in, so everyone looking through one camera is in one room by definition.
  // These move onto the player when each player gets a view of their own.
  'roomId',
  'screen',
  'caveReturn',
  // Everything alive.
  'enemies',
  'projectiles',
  'drops',
  'bombs',
  'flames',
  'enemyBooms',
  'boomerangs',
  'bait',
  'whirlwind',
  'statueState',
  'ladderObj',
  'roomItem',
  // Where things have been put and what has been streamed in.
  'spawnedRooms',
  'spawnClaims',
  'pushBlock',
  'pushBlocks',
  'floorTiles',
  'dungeonTileGrid',
  'caveTileGrid',
  // Per-world Pixi: each occupied place has its own stream and sprite maps
  // so L1 `$73` and L4 `$73` do not paint over each other.
  'rooms',
  'stream',
  'enemyGfx',
  'projGfx',
  'dropGfx',
  'pondHeartGfx',
  // UW person pay-wares (bomb upgrade / money-or-life). Two labyrinths at
  // once must not share one sprite map, or L1's old man paints over L4.
  'personWareGfx',
  // Dark-room light is per stay in a *room* of this place. Lighting leftover
  // `$01` must not undarken a friend still standing in `$02`. A candle on
  // the overworld must not spend the blue use that belongs underground.
  'candleRoom',
  // Money-game roll lives on this visit, not the party.
  'gambleAmounts',
  'gambleResolved',
  // Digdogger's flute window is this labyrinth's, not the party's. Playing
  // the recorder in L5 must not split a Digdogger someone else is fighting
  // in L3.
  'flutePulse',
  // Old-man text is per stay in this place. Hearing L1 `$73` must not skip
  // the old man in L4 `$73`.
  'personDialogueForRoom',
]);

/**
 * @param {object} [opts]
 * @param {string} [opts.id]
 * @param {'overworld' | 'dungeon' | 'cave'} [opts.mode]
 * @param {object} [opts.dungeon] level state: doors, cleared rooms, items taken
 */
export function createWorld({
  id = overworldWorldId(),
  mode = 'overworld',
  dungeon = null,
  roomId = 0,
} = {}) {
  return {
    id,
    mode,
    dungeon,
    roomId,
    screen: null,
    caveReturn: null,
    enemies: [],
    projectiles: [],
    drops: [],
    bombs: [],
    flames: [],
    enemyBooms: [],
    boomerangs: [],
    bait: null,
    whirlwind: null,
    statueState: null,
    ladderObj: null,
    roomItem: null,
    spawnedRooms: new Set(),
    spawnClaims: new Set(),
    pushBlock: null,
    pushBlocks: new Map(),
    floorTiles: null,
    dungeonTileGrid: null,
    caveTileGrid: null,
    rooms: null,
    stream: null,
    enemyGfx: null,
    projGfx: null,
    dropGfx: null,
    pondHeartGfx: [],
    personWareGfx: new Map(),
    candleRoom: createCandleStore(),
    gambleAmounts: null,
    gambleResolved: false,
    flutePulse: 0,
    personDialogueForRoom: null,
  };
}

/**
 * Keyed by id so two players walking into the same labyrinth land in the same
 * world rather than two copies of it, and pruned by occupancy so the last
 * player out takes the lights with them.
 */
export function createWorldRegistry({ create = createWorld } = {}) {
  /** @type {Map<string, object>} */
  const worlds = new Map();

  return {
    get size() {
      return worlds.size;
    },

    /** @param {string} id */
    get(id) {
      return worlds.get(id) ?? null;
    },

    /** The ids of every live world, in the order they were entered. */
    ids() {
      return [...worlds.keys()];
    },

    /**
     * The world with this id, built if nobody is there yet.
     * @param {string} id
     * @param {object} [opts] passed to the factory on first entry
     */
    enter(id, opts = {}) {
      const existing = worlds.get(id);
      if (existing) return existing;
      const world = create({ ...opts, id });
      worlds.set(id, world);
      return world;
    },

    /**
     * Drop every world no player is standing in.
     * @param {Iterable<object>} players
     * @returns {object[]} the worlds discarded, for the caller to tear down
     */
    prune(players) {
      const occupied = new Set();
      for (const p of players) {
        if (p.world?.id) occupied.add(p.world.id);
      }
      const dropped = [];
      for (const [id, world] of worlds) {
        if (occupied.has(id)) continue;
        worlds.delete(id);
        dropped.push(world);
      }
      return dropped;
    },

    /**
     * The players in each live world, so a frame can step a place once however
     * many people are standing in it.
     * @param {Iterable<object>} players
     * @returns {Map<object, object[]>} world → its players
     */
    occupied(players) {
      /** @type {Map<object, object[]>} */
      const byWorld = new Map();
      for (const p of players) {
        if (!p.world) continue;
        const group = byWorld.get(p.world);
        if (group) group.push(p);
        else byWorld.set(p.world, [p]);
      }
      return byWorld;
    },
  };
}
