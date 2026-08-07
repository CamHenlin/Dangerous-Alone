import { DIR } from './collision.js';
import { bombHits } from './bomb.js';
import { SCREEN_EDGE } from './world.js';

/** @typedef {{ open: Set<string> }} DoorState */

/**
 * NES CheckDoorway geometry (screen pixels; Y includes $40 HUD).
 * ReverseDirections index order: up, down, left, right.
 *
 * ROM: `DoorwayRequiredCoord` / `DoorwayBounds{Min,Max}Over` @ `Z_05.asm:3698`.
 * Axis match is exact (`X=$78` for N/S, `Y=$8D` for E/W). Overflow depth is
 * one pixel outside the doorway cavity — not into the floor statue columns.
 */
export const DOORWAY_CENTER_X = 0x78;
export const DOORWAY_CENTER_Y = 0x8d;

/**
 * Legacy name — N/S DoorwayDir now uses `DOORWAY_NS_AXIS_SLACK`.
 * Kept at 0 so older tests/docs that mean "exact NES center" stay meaningful.
 */
export const DOORWAY_AXIS_SLACK = 0;

/**
 * N/S DoorwayDir: allow walk columns `$70`/`$80` (±8 of NES `$78`).
 * Without this, BoundByRoom (`Y<$5E`) freezes Link on the lip before he can
 * reach exit depth — the same trap E/W had on the `$9D` row.
 */
export const DOORWAY_NS_AXIS_SLACK = 8;

/**
 * E/W DoorwayDir + exit: allow the `$9D` walk row as well as NES `$8D`.
 * Open door cavities place walkable `$24` on rows `$90–$9F`; players usually
 * approach on `$9D` and would otherwise freeze on the UW BoundByRoom lip
 * (`X<$21` / `X≥$D0`) with DoorwayDir still clear.
 */
export const DOORWAY_EW_AXIS_SLACK = 0x10;

/**
 * N/S room exits allow a neighboring walk lane (±8). Door openings are 16px and
 * UW hotspots often sit one column off the exact `$78` center.
 */
export const DOORWAY_EXIT_AXIS_SLACK = 8;

/**
 * NES overflow doorway depth (`DoorwayBoundsMinOver` / `MaxOver`).
 * Max is exclusive (`BCC`). West stops at `$21` — the first floor statue in
 * rooms like L4 `$71` sits at X=`$30` and must keep tile collision.
 */
export const DOORWAY_DEPTH = Object.freeze({
  north: Object.freeze({ min: 0x3d, max: 0x5e }),
  south: Object.freeze({ min: 0xbd, max: 0xde }),
  west: Object.freeze({ min: 0x00, max: 0x21 }),
  east: Object.freeze({ min: 0xcf, max: 0xf1 }),
});

/**
 * Exit depth — must be inside the open door cavity ($24 tiles), not the
 * floor lip. Open E/W cavities sit at x≈$10 / $E8; N/S at y≈$4D / $D8.
 */
export const DOORWAY_EXIT_DEPTH = Object.freeze({
  north: Object.freeze({ min: 0x45, max: 0x54 }),
  south: Object.freeze({ min: 0xd4, max: 0xde }),
  west: Object.freeze({ min: 0x00, max: 0x14 }),
  east: Object.freeze({ min: 0xe8, max: 0xf1 }),
});

export function createDoorState() {
  return { open: new Set() };
}

/**
 * Door side Link just came through when facing `fromDir` in the new room.
 * @param {number} fromDir
 * @returns {'north'|'south'|'west'|'east'|null}
 */
export function entrySideForFacing(fromDir) {
  if (fromDir & DIR.RIGHT) return 'west';
  if (fromDir & DIR.LEFT) return 'east';
  if (fromDir & DIR.DOWN) return 'north';
  if (fromDir & DIR.UP) return 'south';
  return null;
}

/**
 * Start a short committed walk into the room (NES EnteringRoomRelativePositions /
 * ObjGridOffset). Remake strides are ±8px; nonzero offset blocks room exit
 * until the stride finishes (CheckScreenEdge).
 * @param {number} dir facing into the new room
 */
export function enteringRoomGridOffset(dir) {
  if (dir & (DIR.RIGHT | DIR.DOWN)) return 1;
  if (dir & (DIR.LEFT | DIR.UP)) return -1;
  return 0;
}

/**
 * True when Link is deep enough in the door to leave the room.
 * @param {{ x: number, y: number }} link
 * @param {string} side
 * @param {number} [tol] center-axis slack (defaults tighter than approach)
 */
export function inDoorway(link, side, tol = DOORWAY_EXIT_AXIS_SLACK) {
  const depth = DOORWAY_EXIT_DEPTH[side];
  if (!depth) return false;
  if (side === 'north' || side === 'south') {
    if (Math.abs(link.x - DOORWAY_CENTER_X) > tol) return false;
    return link.y >= depth.min && link.y < depth.max;
  }
  const yTol = Math.max(tol, DOORWAY_EW_AXIS_SLACK);
  if (Math.abs(link.y - DOORWAY_CENTER_Y) > yTol) return false;
  return link.x >= depth.min && link.x < depth.max;
}

/**
 * Clear NES DoorwayDir once Link leaves the entry doorway corridor
 * (underflow / approach bounds), not after walking deep into the room.
 * @param {{ x: number, y: number }} link
 * @param {string | null | undefined} blockSide
 */
export function doorwayLatchCleared(link, blockSide) {
  if (!blockSide) return true;
  return !nearDoorway(link, blockSide);
}

/**
 * True when Link is inside the NES overflow doorway for `side`
 * (`CheckDoorway` @ `Z_05.asm:3747`). Depth matches ROM; axis slack lets the
 * usual walk grid (`$70`/`$80`, `$9D`) engage DoorwayDir so BoundByRoom does
 * not trap players on the lip.
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function nearDoorway(link, side) {
  const depth = DOORWAY_DEPTH[side];
  if (!depth) return false;
  if (side === 'north' || side === 'south') {
    if (Math.abs(link.x - DOORWAY_CENTER_X) > DOORWAY_NS_AXIS_SLACK) return false;
    return link.y >= depth.min && link.y < depth.max;
  }
  if (Math.abs(link.y - DOORWAY_CENTER_Y) > DOORWAY_EW_AXIS_SLACK) return false;
  return link.x >= depth.min && link.x < depth.max;
}

/**
 * NES skips tile collision while DoorwayDir ≠ 0. Mirror that for any non-wall
 * doorway Link is currently inside (plus the latched entry side).
 * @param {{ x: number, y: number }} link
 * @param {{ doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {{ doorwayBlockSide?: string | null }} [opts]
 */
export function linkInDoorwayCorridor(link, room, opts = {}) {
  const block = opts.doorwayBlockSide ?? null;
  if (block && nearDoorway(link, block)) return true;
  if (!room?.doors) return false;
  for (const side of ['north', 'south', 'west', 'east']) {
    if (!nearDoorway(link, side)) continue;
    const t = room.doors[side]?.type;
    if (!t || t === 'wall') continue;
    return true;
  }
  return false;
}

/**
 * Neighbor room id on the 16×8 dungeon map.
 * @param {number} roomId
 * @param {number} dir
 */
export function dungeonNeighbor(roomId, dir) {
  const row = roomId >> 4;
  const col = roomId & 0x0f;
  if (dir & DIR.UP) return row > 0 ? roomId - 0x10 : null;
  if (dir & DIR.DOWN) return row < 7 ? roomId + 0x10 : null;
  if (dir & DIR.LEFT) return col > 0 ? roomId - 1 : null;
  if (dir & DIR.RIGHT) return col < 15 ? roomId + 1 : null;
  return null;
}

/**
 * Door key for a facing direction.
 * @param {number} dir
 */
export function doorKeyForDir(dir) {
  if (dir & DIR.UP) return 'north';
  if (dir & DIR.DOWN) return 'south';
  if (dir & DIR.LEFT) return 'west';
  if (dir & DIR.RIGHT) return 'east';
  return null;
}

/**
 * @param {number} roomId
 * @param {string} side
 */
export function doorSlotKey(roomId, side) {
  return `${roomId}:${side}`;
}

/**
 * @param {string} side
 */
export function oppositeSide(side) {
  switch (side) {
    case 'north':
      return 'south';
    case 'south':
      return 'north';
    case 'west':
      return 'east';
    case 'east':
      return 'west';
    default:
      return side;
  }
}

/**
 * @param {string} side
 */
export function dirForSide(side) {
  switch (side) {
    case 'north':
      return DIR.UP;
    case 'south':
      return DIR.DOWN;
    case 'west':
      return DIR.LEFT;
    case 'east':
      return DIR.RIGHT;
    default:
      return 0;
  }
}

/**
 * Mark a door open on both sides of the shared wall.
 * @param {DoorState} state
 * @param {number} roomId
 * @param {string} side
 */
export function openDoorPair(state, roomId, side) {
  state.open.add(doorSlotKey(roomId, side));
  const next = dungeonNeighbor(roomId, dirForSide(side));
  if (next != null) {
    state.open.add(doorSlotKey(next, oppositeSide(side)));
  }
}

/**
 * Mark a door closed on both sides of the shared wall.
 * @param {DoorState} state
 * @param {number} roomId
 * @param {string} side
 */
export function closeDoorPair(state, roomId, side) {
  state.open.delete(doorSlotKey(roomId, side));
  const next = dungeonNeighbor(roomId, dirForSide(side));
  if (next != null) {
    state.open.delete(doorSlotKey(next, oppositeSide(side)));
  }
}

/**
 * `TriggeredDoorCmd = $02` on room entry: the doorway Link walked through
 * shuts behind him. Only shutters (type 7) react — `UpdateDoors` explicitly
 * discards the close command for key doors and bombable walls.
 * @param {DoorState} state
 * @param {{ roomId: number, doors?: Record<string, { type?: string }> }} room
 * @param {string | null | undefined} side side Link entered through
 * @returns {boolean} true when a shutter was closed
 */
export function closeShutterBehind(state, room, side) {
  if (!side || !room?.doors) return false;
  if (room.doors[side]?.type !== 'shutter') return false;
  if (!isDoorMarkedOpen(state, room.roomId, side)) return false;
  closeDoorPair(state, room.roomId, side);
  return true;
}

/**
 * @param {DoorState} state
 * @param {number} roomId
 * @param {string} side
 */
export function isDoorMarkedOpen(state, roomId, side) {
  return state.open.has(doorSlotKey(roomId, side));
}

/**
 * Whether a door can be crossed given persistent open state (no key spend).
 * @param {{ type?: string } | null | undefined} door
 * @param {DoorState} state
 * @param {number} roomId
 * @param {string} side
 */
export function doorPassable(door, state, roomId, side) {
  if (!door) return false;
  const t = door.type;
  // open / false walls (codes 2–3) are always walkable.
  if (t === 'open' || t === 'passage' || t === 'wall_or_pass') return true;
  if (isDoorMarkedOpen(state, roomId, side)) return true;
  return false;
}

/**
 * Try to unlock a key door, consuming one key. Returns true if now passable.
 * @param {{ type?: string } | null | undefined} door
 * @param {DoorState} state
 * @param {number} roomId
 * @param {string} side
 * @param {{ keys: number }} inv
 */
export function tryUnlockKeyDoor(door, state, roomId, side, inv) {
  if (doorPassable(door, state, roomId, side)) return true;
  if (door?.type !== 'key') return false;
  // Magic key opens without consuming (NES FormatBombCount skips key count).
  if (inv.magicKey) {
    openDoorPair(state, roomId, side);
    return true;
  }
  if ((inv.keys ?? 0) <= 0) return false;
  inv.keys -= 1;
  openDoorPair(state, roomId, side);
  return true;
}

/**
 * Open all shutter sides in a cleared room.
 * @param {DoorState} state
 * @param {{ roomId: number, doors?: Record<string, { type?: string }> }} room
 * @returns {string[]} sides opened
 */
export function openRoomShutters(state, room) {
  /** @type {string[]} */
  const opened = [];
  if (!room?.doors) return opened;
  for (const side of ['north', 'south', 'west', 'east']) {
    const door = room.doors[side];
    if (door?.type !== 'shutter') continue;
    if (isDoorMarkedOpen(state, room.roomId, side)) continue;
    openDoorPair(state, room.roomId, side);
    opened.push(side);
  }
  return opened;
}

/**
 * Re-apply shutter opens for previously cleared rooms (re-enter).
 * @param {DoorState} state
 * @param {Iterable<number>} clearedRoomIds
 * @param {{ rooms: { roomId: number, doors?: object }[] }} level
 */
export function restoreClearedShutters(state, clearedRoomIds, level) {
  for (const id of clearedRoomIds) {
    const room = level.rooms.find((r) => r.roomId === id);
    if (room) openRoomShutters(state, room);
  }
}

/**
 * Axis-aligned probe rect at the center of a room doorway.
 * @param {{ x: number, y: number }} origin
 * @param {{ w: number, h: number }} roomSize
 * @param {string} side
 */
export function doorBlastRect(origin, roomSize, side) {
  const midX = origin.x + Math.floor(roomSize.w / 2) - 8;
  const midY = origin.y + Math.floor(roomSize.h / 2) - 8;
  switch (side) {
    case 'north':
      return { x: midX, y: origin.y - 4, w: 16, h: 20 };
    case 'south':
      return { x: midX, y: origin.y + roomSize.h - 16, w: 16, h: 20 };
    case 'west':
      return { x: origin.x - 4, y: midY, w: 20, h: 16 };
    case 'east':
      return { x: origin.x + roomSize.w - 16, y: midY, w: 20, h: 16 };
    default:
      return { x: midX, y: midY, w: 16, h: 16 };
  }
}

/**
 * If an exploding bomb is near a bombable wall, open it.
 * @param {DoorState} state
 * @param {object} room
 * @param {import('./bomb.js').Bomb} bomb
 * @param {{ x: number, y: number }} origin
 * @param {{ w: number, h: number }} roomSize
 * @returns {string[]} sides opened
 */
export function tryBombDoors(state, room, bomb, origin, roomSize) {
  /** @type {string[]} */
  const opened = [];
  if (!room?.doors || bomb.phase !== 'explode') return opened;
  for (const side of ['north', 'south', 'west', 'east']) {
    const door = room.doors[side];
    if (door?.type !== 'bombable') continue;
    if (isDoorMarkedOpen(state, room.roomId, side)) continue;
    if (!bombHits(bomb, doorBlastRect(origin, roomSize, side))) continue;
    openDoorPair(state, room.roomId, side);
    opened.push(side);
  }
  return opened;
}

/**
 * NES `PlayerScreenEdgeBounds` — hard limits inside DoorwayDir cavities so
 * Link cannot walk past X=$00 / Y=$3D and drop out of `nearDoorway`.
 * @param {{ x: number, y: number }} link
 */
export function clampUwDoorwayPos(link) {
  link.x = Math.max(SCREEN_EDGE.left, Math.min(SCREEN_EDGE.right, link.x));
  link.y = Math.max(SCREEN_EDGE.up, Math.min(SCREEN_EDGE.down, link.y));
}

/**
 * NES CheckScreenEdge: coordinate equals the edge bound for the facing dir.
 * @param {{ x: number, y: number, dir: number }} link
 * @param {string} side
 */
export function atUwScreenEdge(link, side) {
  if (side === 'north') return (link.dir & DIR.UP) !== 0 && link.y <= SCREEN_EDGE.up;
  if (side === 'south') return (link.dir & DIR.DOWN) !== 0 && link.y >= SCREEN_EDGE.down;
  if (side === 'west') return (link.dir & DIR.LEFT) !== 0 && link.x <= SCREEN_EDGE.left;
  if (side === 'east') return (link.dir & DIR.RIGHT) !== 0 && link.x >= SCREEN_EDGE.right;
  return false;
}

/**
 * Check doorway exit (NES CheckDoorway-style); may consume a key to unlock.
 * Link must stand in the door frame, facing out — or sit on the NES screen
 * edge (`CheckScreenEdge`) while still in that doorway corridor. While
 * `gridOffset ≠ 0` (entry walk / mid-stride), exit is suppressed.
 *
 * @returns {{ nextRoomId: number, dir: number, unlocked?: boolean, side: string } | null}
 */
export function checkDungeonRoomExit(link, room, _origin, _roomSize, ctx = {}) {
  if (!room?.doors) return null;
  // NES: ObjGridOffset <> 0 → cannot leave the room yet.
  if ((link.gridOffset ?? 0) !== 0) return null;
  const state = ctx.doorState ?? createDoorState();
  const inv = ctx.inv ?? { keys: 0 };
  /** @type {Set<number> | null} */
  const roomIds =
    ctx.roomIds instanceof Set
      ? ctx.roomIds
      : Array.isArray(ctx.rooms)
        ? new Set(ctx.rooms.map((r) => r.roomId))
        : null;

  /** @type {{ dir: number, side: string }[]} */
  const checks = [
    { dir: DIR.UP, side: 'north' },
    { dir: DIR.DOWN, side: 'south' },
    { dir: DIR.LEFT, side: 'west' },
    { dir: DIR.RIGHT, side: 'east' },
  ];

  for (const c of checks) {
    if (!(link.dir & c.dir)) continue;
    const inFrame = inDoorway(link, c.side);
    const atEdge = atUwScreenEdge(link, c.side) && nearDoorway(link, c.side);
    if (!inFrame && !atEdge) continue;
    const door = room.doors[c.side];
    let unlocked = false;
    if (!doorPassable(door, state, room.roomId, c.side)) {
      if (!tryUnlockKeyDoor(door, state, room.roomId, c.side, inv)) continue;
      unlocked = true;
    }
    const next = dungeonNeighbor(room.roomId, c.dir);
    if (next == null) continue;
    // Don't walk into a void / other-level slot.
    if (roomIds && !roomIds.has(next)) continue;
    return { nextRoomId: next, dir: c.dir, unlocked, side: c.side };
  }
  return null;
}
