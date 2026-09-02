import { DIR, HUD_HEIGHT, LINK_HOTSPOT_Y, UW_BOUNDS } from './collision.js';
import { bombHits } from './bomb.js';
import { PLAY_H, PLAY_W } from './continuousCamera.js';
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
 * E/W DoorwayDir + exit: cover the whole open-door cavity (`$90–$9F`), not
 * only NES `$8D`. `$9D` is the usual walk row; `$9E`/`$9F` are still cavity
 * tiles, and a one-pixel shove off `$9D` used to drop DoorwayDir and yank
 * Link back to the BoundByRoom lip (`X≥$D0`) mid-door.
 *
 * Detection stays this wide so those lanes still engage the corridor. Once
 * Link is past BoundByRoom, {@link clampUwDoorwayPath} uses
 * {@link DOORWAY_CORRIDOR_AXIS_SLACK} so skipped tile collision cannot walk
 * him into the jamb.
 */
export const DOORWAY_EW_AXIS_SLACK = 0x14;

/**
 * Perpendicular width of a door opening while DoorwayDir skips tiles.
 * NES is exact (`X=$78` / `Y=$8D`); ±8 keeps the neighboring walk lane and
 * a 16px sprite inside the 32px face.
 */
export const DOORWAY_CORRIDOR_AXIS_SLACK = 8;

/**
 * N/S room exits allow a neighboring walk lane (±8). Door openings are 16px and
 * UW hotspots often sit one column off the exact `$78` center.
 */
export const DOORWAY_EXIT_AXIS_SLACK = 8;

/**
 * NES overflow doorway depth (`DoorwayBoundsMinOver` / `MaxOver`), extended so
 * passable doors can be walked through to the geometric room seam (Phase-18
 * continuous UW). Max is exclusive. West still stops short of floor statues
 * at X=`$30` on the room-interior side; negative X is allowed past the lip.
 *
 * North includes the BoundByRoom lip through the first unique-floor row
 * (`Y<$68`, same band as the key-door bump). Link's hotspot is ObjY+$0B, so
 * standing on the door lip and walking left otherwise samples a maze block
 * one square south and freezes — L3 `$6b` at the north door.
 */
export const DOORWAY_DEPTH = Object.freeze({
  north: Object.freeze({ min: HUD_HEIGHT - PLAY_H, max: 0x68 }),
  south: Object.freeze({ min: 0xbd, max: HUD_HEIGHT + PLAY_H + 1 }),
  west: Object.freeze({ min: -PLAY_W, max: 0x21 }),
  east: Object.freeze({ min: 0xcf, max: PLAY_W + 1 }),
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
 * How far past a NES `PlayerScreenEdge` lip still counts as "in that door".
 *
 * A leftover hero at `x=$-13` / `$-19` is still visually in the opening.
 * An ally two tiles into the previous room is not — treating them as this
 * room's south/east corridor is what clamped them onto the doorway.
 */
export const DOORWAY_LIP_OVERSHOOT = 0x20;

/**
 * True when Link has already stepped past that side's NES `PlayerScreenEdge`
 * lip. `nearDoorway` can flicker off-axis for a frame while they are still
 * visually in the opening; the clamp and corridor tests treat this as "still
 * in the door" so they are not yanked back to `$F0` / `$DD`.
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function pastUwDoorLip(link, side) {
  if (side === 'north') return link.y < SCREEN_EDGE.up;
  if (side === 'south') return link.y > SCREEN_EDGE.down;
  if (side === 'west') return link.x < SCREEN_EDGE.left;
  if (side === 'east') return link.x > SCREEN_EDGE.right;
  return false;
}

/**
 * `pastUwDoorLip` with a bound: the leftover-at-lip overshoot, not a whole
 * neighbouring cell on the door column.
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function inUwDoorLipOvershoot(link, side) {
  if (!pastUwDoorLip(link, side)) return false;
  if (side === 'north') return link.y >= SCREEN_EDGE.up - DOORWAY_LIP_OVERSHOOT;
  if (side === 'south') return link.y <= SCREEN_EDGE.down + DOORWAY_LIP_OVERSHOOT;
  if (side === 'west') return link.x >= SCREEN_EDGE.left - DOORWAY_LIP_OVERSHOOT;
  if (side === 'east') return link.x <= SCREEN_EDGE.right + DOORWAY_LIP_OVERSHOOT;
  return false;
}

function doorwayAxisOk(link, side) {
  if (side === 'north' || side === 'south') {
    return Math.abs(link.x - DOORWAY_CENTER_X) <= DOORWAY_NS_AXIS_SLACK;
  }
  return Math.abs(link.y - DOORWAY_CENTER_Y) <= DOORWAY_EW_AXIS_SLACK;
}

/**
 * NES skips tile collision while DoorwayDir ≠ 0. Continuous-camera QoL: only
 * passable doors (open / already unlocked) are corridors. Locked key, shutter,
 * and bombable faces stay under normal tile collision so they act as blocks.
 * The latched entry side still skips collision while Link finishes walking in.
 *
 * @param {{ x: number, y: number }} link
 * @param {{ roomId?: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {{ doorwayBlockSide?: string | null, doorState?: DoorState | null }} [opts]
 */
export function linkInDoorwayCorridor(link, room, opts = {}) {
  const block = opts.doorwayBlockSide ?? null;
  if (block && (nearDoorway(link, block) || inUwDoorLipOvershoot(link, block))) return true;
  if (!room?.doors) return false;
  const state = opts.doorState ?? null;
  const roomId = room.roomId ?? 0;
  for (const side of ['north', 'south', 'west', 'east']) {
    const inCavity =
      nearDoorway(link, side)
      || (inUwDoorLipOvershoot(link, side) && doorwayAxisOk(link, side));
    if (!inCavity) continue;
    const door = room.doors[side];
    const t = door?.type;
    if (!t || t === 'wall') continue;
    if (t === 'open' || t === 'passage' || t === 'wall_or_pass') return true;
    if (state && doorPassable(door, state, roomId, side)) return true;
  }
  return false;
}

/**
 * Legacy lip snap after soft-enter. Kept for tests; live UW door crosses keep
 * rebased seam coords so the path stays world-continuous (no 16px skip).
 * @param {{ x: number, y: number }} link
 * @param {string | null | undefined} entrySide
 */
export function clampDoorwayOvershoot(link, entrySide) {
  if (!entrySide) return;
  if (entrySide === 'south' && link.y > SCREEN_EDGE.down) link.y = SCREEN_EDGE.down;
  if (entrySide === 'north' && link.y < SCREEN_EDGE.up) link.y = SCREEN_EDGE.up;
  if (entrySide === 'east' && link.x > SCREEN_EDGE.right) link.x = SCREEN_EDGE.right;
  if (entrySide === 'west' && link.x < SCREEN_EDGE.left) link.x = SCREEN_EDGE.left;
}

/**
 * True when `side` is a passable door into a real neighbor room.
 * @param {{ roomId?: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {DoorState | null | undefined} state
 * @param {string} side
 * @param {Set<number> | null | undefined} roomIds
 */
export function doorSideAllowsCross(room, state, side, roomIds = null) {
  if (!room?.doors) return false;
  const door = room.doors[side];
  if (!doorPassable(door, state ?? createDoorState(), room.roomId ?? 0, side)) {
    return false;
  }
  const next = dungeonNeighbor(room.roomId ?? 0, dirForSide(side));
  if (next == null) return false;
  if (roomIds && !roomIds.has(next)) return false;
  return true;
}

/**
 * Doorway motion clamp: NES lips stay closed on locked/missing sides; passable
 * doors open through to the geometric seam so Link can walk into the next room.
 * @param {{ x: number, y: number }} link
 * @param {{ roomId?: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {{ doorState?: DoorState | null, roomIds?: Set<number> | null }} [opts]
 */
export function clampUwDoorwayPath(link, room, opts = {}) {
  const state = opts.doorState ?? null;
  const roomIds = opts.roomIds ?? null;
  const onNs = Math.abs(link.x - DOORWAY_CENTER_X) <= DOORWAY_NS_AXIS_SLACK;
  const onEw = Math.abs(link.y - DOORWAY_CENTER_Y) <= DOORWAY_EW_AXIS_SLACK;
  // Already past a NES lip: keep that seam open even if the axis slack
  // flickers for a frame. Yanking back to $F0 / $DD is what left a hero
  // visually inside the door with nowhere to go.
  const pastNorth = link.y < SCREEN_EDGE.up;
  const pastSouth = link.y > SCREEN_EDGE.down;
  const pastWest = link.x < SCREEN_EDGE.left;
  const pastEast = link.x > SCREEN_EDGE.right;

  let minX = SCREEN_EDGE.left;
  let maxX = SCREEN_EDGE.right;
  let minY = SCREEN_EDGE.up;
  let maxY = SCREEN_EDGE.down;

  if ((onNs || pastNorth) && doorSideAllowsCross(room, state, 'north', roomIds)) {
    minY = HUD_HEIGHT - PLAY_H;
  }
  if ((onNs || pastSouth) && doorSideAllowsCross(room, state, 'south', roomIds)) {
    maxY = HUD_HEIGHT + PLAY_H;
  }
  if ((onEw || pastWest) && doorSideAllowsCross(room, state, 'west', roomIds)) {
    minX = -PLAY_W;
  }
  if ((onEw || pastEast) && doorSideAllowsCross(room, state, 'east', roomIds)) {
    maxX = PLAY_W;
  }

  link.x = Math.max(minX, Math.min(maxX, link.x));
  link.y = Math.max(minY, Math.min(maxY, link.y));

  clampUwDoorwayCorridorAxis(link, room, { doorState: state, roomIds });
}

/**
 * True when Link is past BoundByRoom into a door hole. At the floor lip,
 * walking along the wall must not magnetize onto the opening.
 *
 * Right/down NES bounds use `>=`, so `$D0`/`$BD` are still the room edge;
 * the face starts on the next pixel.
 *
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function inUwDoorOverflow(link, side) {
  if (side === 'west') return link.x < UW_BOUNDS.left;
  if (side === 'east') return link.x > UW_BOUNDS.right;
  if (side === 'north') return link.y < UW_BOUNDS.top;
  if (side === 'south') return link.y > UW_BOUNDS.bottom;
  return false;
}

/**
 * Past the inner floor lip into the door hole. BoundByRoom overflow is one
 * pixel (`X<$21` / `Y<$5E` / `X>$D0`), which includes the 8-aligned floor
 * cells `$20` and `$5D`. Those are still room floor — walking north along
 * the west wall of L1 `$73`, or right along L9 `$23`'s north strip after a
 * 1px knockback, must not magnetize onto the opening.
 *
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function inUwDoorCavity(link, side) {
  if (side === 'west') return link.x < 0x20;
  if (side === 'east') return link.x >= 0xe0;
  // Walk-grid north lip `$5D` is 1px into BoundByRoom (`Y<$5E`) — still floor.
  if (side === 'north') return link.y < 0x5d;
  // South unique-floor row 17 is pixels `$C8–$CF`. Hotspot is ObjY+$0B, so
  // ObjY `$BD–$C4` still samples that floor — BoundByRoom `$BD` is not the
  // hole. X-clamping there stole Left/Right on the door-adjacent floor.
  if (side === 'south') return link.y >= 0xd0 - LINK_HOTSPOT_Y;
  return false;
}

/**
 * Keep a corridor walker inside the 32px door face. Tile collision is off
 * for DoorwayDir, so without this, holding the perpendicular axis walks
 * into the jamb (west door at X≈`$18`, off `$8D`).
 *
 * @param {{ x: number, y: number, dir?: number, gridOffset?: number, posFrac?: number }} link
 * @param {{ roomId?: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {{ doorState?: DoorState | null, roomIds?: Set<number> | null }} [opts]
 */
function clampUwDoorwayCorridorAxis(link, room, opts = {}) {
  const state = opts.doorState ?? null;
  const roomIds = opts.roomIds ?? null;
  const inWest = inUwDoorCavity(link, 'west') && doorSideAllowsCross(room, state, 'west', roomIds);
  const inEast = inUwDoorCavity(link, 'east') && doorSideAllowsCross(room, state, 'east', roomIds);
  const inNorth = inUwDoorCavity(link, 'north') && doorSideAllowsCross(room, state, 'north', roomIds);
  const inSouth = inUwDoorCavity(link, 'south') && doorSideAllowsCross(room, state, 'south', roomIds);

  if (inWest || inEast) {
    const lo = DOORWAY_CENTER_Y - DOORWAY_CORRIDOR_AXIS_SLACK;
    const hi = DOORWAY_CENTER_Y + DOORWAY_CORRIDOR_AXIS_SLACK;
    const y0 = link.y;
    link.y = Math.max(lo, Math.min(hi, link.y));
    if (link.y !== y0) rewindDoorwayPerpStep(link, 'y');
  }
  if (inNorth || inSouth) {
    const lo = DOORWAY_CENTER_X - DOORWAY_CORRIDOR_AXIS_SLACK;
    const hi = DOORWAY_CENTER_X + DOORWAY_CORRIDOR_AXIS_SLACK;
    const x0 = link.x;
    link.x = Math.max(lo, Math.min(hi, link.x));
    if (link.x !== x0) rewindDoorwayPerpStep(link, 'x');
  }
}

/**
 * A mid-cell stride on the clamped axis would otherwise keep gridOffset
 * growing against a wall that DoorwayDir is not allowed to enter.
 *
 * @param {{ dir?: number, gridOffset?: number, posFrac?: number }} link
 * @param {'x' | 'y'} axis
 */
function rewindDoorwayPerpStep(link, axis) {
  const horizontal = Boolean(link.dir & (DIR.LEFT | DIR.RIGHT));
  const vertical = Boolean(link.dir & (DIR.UP | DIR.DOWN));
  const sameAxis = (axis === 'x' && horizontal) || (axis === 'y' && vertical);
  if (!sameAxis) return;
  if (link.gridOffset != null) link.gridOffset = 0;
  if (link.posFrac != null) link.posFrac = 0;
}

/**
 * Floor-lip through cavity: bumping a locked key door here with a key unlocks it.
 * @param {{ x: number, y: number }} link
 * @param {string} side
 */
export function inKeyDoorBumpZone(link, side) {
  if (side === 'north') {
    if (Math.abs(link.x - DOORWAY_CENTER_X) > DOORWAY_NS_AXIS_SLACK) return false;
    // Door cavity through BoundByRoom lip ($5E) — not the whole northern floor.
    return link.y >= DOORWAY_DEPTH.north.min && link.y < 0x68;
  }
  if (side === 'south') {
    if (Math.abs(link.x - DOORWAY_CENTER_X) > DOORWAY_NS_AXIS_SLACK) return false;
    return link.y >= 0xb8 && link.y < DOORWAY_DEPTH.south.max;
  }
  if (side === 'west') {
    if (Math.abs(link.y - DOORWAY_CENTER_Y) > DOORWAY_EW_AXIS_SLACK) return false;
    return link.x >= DOORWAY_DEPTH.west.min && link.x < 0x28;
  }
  if (side === 'east') {
    if (Math.abs(link.y - DOORWAY_CENTER_Y) > DOORWAY_EW_AXIS_SLACK) return false;
    // Locked key faces + ObjectRoomBoundsUW freeze at X≥$D0, so Link never
    // reaches the old $D8 lip. Count the BoundByRoom edge as a bump.
    return link.x >= 0xd0 && link.x < DOORWAY_DEPTH.east.max;
  }
  return false;
}

/**
 * If Link is facing a locked key door in bump range and has a key, unlock it.
 * @param {{ x: number, y: number, dir: number }} link
 * @param {{ roomId: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {DoorState} state
 * @param {{ keys?: number, magicKey?: number }} inv
 * @returns {string | null} unlocked side, or null
 */
export function tryUnlockFacingKeyDoor(link, room, state, inv) {
  if (!room?.doors || !link) return null;
  const side = doorKeyForDir(link.dir);
  if (!side || !inKeyDoorBumpZone(link, side)) return null;
  const door = room.doors[side];
  if (door?.type !== 'key') return null;
  if (doorPassable(door, state, room.roomId, side)) return null;
  if (!tryUnlockKeyDoor(door, state, room.roomId, side, inv)) return null;
  return side;
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
 * Seal only the Zelda-side LAST_BOSS shutter until Ganon is defeated.
 * Approach shutters (south/west entry) stay open when those rooms are cleared
 * — that is how Link walks into the fight. The Zelda-side pair must not stay
 * open from a prior kill, or the princess room is reachable without the fight.
 *
 * @param {DoorState} state
 * @param {{ level?: number, levelNumber?: number, bossRoom?: number, triforceRoom?: number, rooms?: { roomId: number, doors?: Record<string, { type?: string }> }[] }} level
 * @param {boolean} lastBossDefeated
 */
export function sealLastBossShutters(state, level, lastBossDefeated) {
  if (lastBossDefeated || !level) return;
  const levelNum = level.levelNumber ?? level.level;
  if (levelNum !== 9) return;
  const boss = level.bossRoom;
  const zelda = level.triforceRoom;
  if (boss == null || zelda == null) return;
  const bossId = boss & 0xff;
  const zeldaId = zelda & 0xff;
  const room = level.rooms?.find((r) => r.roomId === bossId);
  if (!room?.doors) return;
  for (const side of ['north', 'south', 'west', 'east']) {
    if (room.doors[side]?.type !== 'shutter') continue;
    const next = dungeonNeighbor(bossId, dirForSide(side));
    if (next !== zeldaId) continue;
    closeDoorPair(state, bossId, side);
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
 * Live play uses {@link detectUwDoorCross} (geometric seam) instead so unlocked
 * doors feel like a continuous path; this remains for tests / NES comparisons.
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

/**
 * OW-style seam cross through a passable UW door. No Y snap — world position
 * stays continuous across the 256×176 room tiling.
 *
 * @param {{ x: number, y: number, dir?: number, gridOffset?: number }} link
 * @param {{ roomId: number, doors?: Record<string, { type?: string }> } | null | undefined} room
 * @param {{ doorState?: DoorState | null, rooms?: { roomId: number }[], roomIds?: Set<number> }} [ctx]
 * @returns {{ nextRoomId: number, dir: number, side: string, x: number, y: number } | null}
 */
export function detectUwDoorCross(link, room, ctx = {}) {
  if (!room?.doors) return null;
  if ((link.gridOffset ?? 0) !== 0) return null;

  /** @type {Set<number> | null} */
  const roomIds =
    ctx.roomIds instanceof Set
      ? ctx.roomIds
      : Array.isArray(ctx.rooms)
        ? new Set(ctx.rooms.map((r) => r.roomId))
        : null;
  const state = ctx.doorState ?? null;

  const playY = link.y - HUD_HEIGHT;
  /** @type {{ dir: number, side: string, nextRoomId: number, x: number, y: number } | null} */
  let cross = null;
  if (link.x < 0) {
    const next = dungeonNeighbor(room.roomId, DIR.LEFT);
    if (next != null) {
      cross = { dir: DIR.LEFT, side: 'west', nextRoomId: next, x: link.x + PLAY_W, y: link.y };
    }
  } else if (link.x >= PLAY_W) {
    const next = dungeonNeighbor(room.roomId, DIR.RIGHT);
    if (next != null) {
      cross = { dir: DIR.RIGHT, side: 'east', nextRoomId: next, x: link.x - PLAY_W, y: link.y };
    }
  } else if (playY < 0) {
    const next = dungeonNeighbor(room.roomId, DIR.UP);
    if (next != null) {
      cross = { dir: DIR.UP, side: 'north', nextRoomId: next, x: link.x, y: link.y + PLAY_H };
    }
  } else if (playY >= PLAY_H) {
    const next = dungeonNeighbor(room.roomId, DIR.DOWN);
    if (next != null) {
      cross = { dir: DIR.DOWN, side: 'south', nextRoomId: next, x: link.x, y: link.y - PLAY_H };
    }
  }
  if (!cross) return null;
  if (!doorSideAllowsCross(room, state, cross.side, roomIds)) return null;
  // Still in the door corridor (axis + extended depth) at the seam.
  if (!nearDoorway(link, cross.side)) return null;
  return cross;
}
