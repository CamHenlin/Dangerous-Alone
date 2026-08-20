/**
 * Room data for the continuous streaming window (Phase 18), with no renderer
 * attached.
 *
 * `createStreamView` used to hold the collision grid and the room pack on the
 * same entry as the Pixi sprite, which meant every collision lookup went
 * through the scene graph. The store owns that data instead, so the simulation
 * can resolve tiles without a renderer and the view can be one of several
 * drawing the same rooms (Phase 23).
 */

/**
 * @typedef {object} RoomEntry
 * @property {number} roomId
 * @property {number[][] | null} tileGrid
 * @property {object | null} pack screen/room payload
 * @property {boolean} fogged
 */

/** @param {number} roomId */
const key = (roomId) => roomId & 0xff;

export function createRoomStore() {
  /** @type {Map<number, RoomEntry>} */
  const rooms = new Map();

  /**
   * Merge data into a room, creating it if new. Absent fields are left alone
   * so a caller refreshing only the fog does not blank the grid.
   * @param {number} roomId
   * @param {{ tileGrid?: number[][] | null, pack?: object | null, fogged?: boolean }} [meta]
   */
  function upsert(roomId, meta = {}) {
    const id = key(roomId);
    let entry = rooms.get(id);
    if (!entry) {
      entry = { roomId: id, tileGrid: null, pack: null, fogged: false };
      rooms.set(id, entry);
    }
    if (meta.tileGrid) entry.tileGrid = meta.tileGrid;
    if (meta.pack) entry.pack = meta.pack;
    if (meta.fogged !== undefined) entry.fogged = Boolean(meta.fogged);
    return entry;
  }

  /** @param {number} roomId @returns {RoomEntry | null} */
  function get(roomId) {
    return rooms.get(key(roomId)) ?? null;
  }

  /** @param {number} roomId */
  function has(roomId) {
    return rooms.has(key(roomId));
  }

  /** @param {number} roomId @returns {number[][] | null} */
  function tileGrid(roomId) {
    return rooms.get(key(roomId))?.tileGrid ?? null;
  }

  /** @param {number} roomId @returns {object | null} */
  function pack(roomId) {
    return rooms.get(key(roomId))?.pack ?? null;
  }

  /** @param {number} roomId @param {boolean} fogged */
  function setFog(roomId, fogged) {
    const entry = rooms.get(key(roomId));
    if (entry) entry.fogged = Boolean(fogged);
  }

  /** @param {number} roomId */
  function isFogged(roomId) {
    return Boolean(rooms.get(key(roomId))?.fogged);
  }

  /**
   * Collision grids for every loaded room, keyed by id — what multi-room
   * collision walks.
   * @returns {Map<number, number[][]>}
   */
  function gridMap() {
    /** @type {Map<number, number[][]>} */
    const map = new Map();
    for (const entry of rooms.values()) {
      if (entry.tileGrid) map.set(entry.roomId, entry.tileGrid);
    }
    return map;
  }

  /**
   * Drop every room outside the keep set.
   * @param {Iterable<number>} keepIds
   * @returns {number[]} ids dropped, so a view can tear down the same rooms
   */
  function pruneTo(keepIds) {
    const keep = new Set([...keepIds].map(key));
    /** @type {number[]} */
    const dropped = [];
    for (const id of [...rooms.keys()]) {
      if (keep.has(id)) continue;
      rooms.delete(id);
      dropped.push(id);
    }
    return dropped;
  }

  function clear() {
    rooms.clear();
  }

  return {
    rooms,
    upsert,
    get,
    has,
    tileGrid,
    pack,
    setFog,
    isFogged,
    gridMap,
    pruneTo,
    clear,
    get size() {
      return rooms.size;
    },
  };
}
