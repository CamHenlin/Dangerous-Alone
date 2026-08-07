import { DIR, HUD_HEIGHT, UW_FIRST_UNWALKABLE } from './collision.js';
import {
  DOORWAY_CENTER_X,
  DOORWAY_CENTER_Y,
} from './dungeonDoors.js';
import {
  FLOOR_ORIGIN,
  FLOOR_TILES_H,
  FLOOR_TILES_W,
  composeDungeonRoomTiles,
  openSidesForRoom,
} from './dungeonRoomLayout.js';

export {
  DOORWAY_CENTER_X,
  DOORWAY_CENTER_Y,
  atUwScreenEdge,
  checkDungeonRoomExit,
  clampDoorwayOvershoot,
  clampUwDoorwayPath,
  clampUwDoorwayPos,
  closeShutterBehind,
  createDoorState,
  detectUwDoorCross,
  dirForSide,
  doorKeyForDir,
  doorPassable,
  doorSideAllowsCross,
  doorwayLatchCleared,
  dungeonNeighbor,
  enteringRoomGridOffset,
  entrySideForFacing,
  inDoorway,
  inKeyDoorBumpZone,
  linkInDoorwayCorridor,
  nearDoorway,
  openRoomShutters,
  restoreClearedShutters,
  tryBombDoors,
  tryUnlockFacingKeyDoor,
  tryUnlockKeyDoor,
} from './dungeonDoors.js';

/** UW primary square CHR bases (schema / WriteSquareUW). */
export const UW_PRIMARY_SQUARES = Object.freeze([
  0xb0, 0x74, 0x94, 0xb4, 0x70, 0x68, 0xf4, 0x24,
]);

/** @deprecated solid filler; full rooms use UW_FILL_TILE / wall CHR instead. */
export const UW_SOLID_TILE = 0xf4;

/** Play-area top-left in screen pixels (full 256×176 room). */
export function dungeonPlayOrigin() {
  return { x: 0, y: HUD_HEIGHT };
}

/** Floor rectangle inside the play area (NES LayoutUWFloor origin). */
export function dungeonFloorRect(playOrigin = dungeonPlayOrigin()) {
  return {
    x: playOrigin.x + FLOOR_ORIGIN.col * 8,
    y: playOrigin.y + FLOOR_ORIGIN.row * 8,
    w: FLOOR_TILES_W * 8,
    h: FLOOR_TILES_H * 8,
  };
}

/**
 * Spawn inside the open door cavity after a room-to-room transition.
 * `fromDir` is the facing used when leaving the previous room (NES Method 2).
 * Coordinates are screen-absolute (Y includes HUD), placed on the walkable
 * $24 opening — not the outer border fill at X=$00/$F0 or Y=$40.
 */
export function dungeonRoomSpawn(_origin, _roomSize, fromDir) {
  if (fromDir & DIR.RIGHT) {
    return { x: 0x10, y: DOORWAY_CENTER_Y, dir: DIR.RIGHT };
  }
  if (fromDir & DIR.LEFT) {
    return { x: 0xe8, y: DOORWAY_CENTER_Y, dir: DIR.LEFT };
  }
  if (fromDir & DIR.DOWN) {
    return { x: DOORWAY_CENTER_X, y: 0x4d, dir: DIR.DOWN };
  }
  if (fromDir & DIR.UP) {
    return { x: DOORWAY_CENTER_X, y: 0xd8, dir: DIR.UP };
  }
  return { x: DOORWAY_CENTER_X, y: DOORWAY_CENTER_Y, dir: DIR.UP };
}

/**
 * Build a 22×32 play-area tile grid (walls + door faces + floor).
 * @param {object} room decoded room with squares + doors
 * @param {{ x: number, y: number }} [_origin] ignored (grid is full play area)
 * @param {readonly number[]} [primarySquares]
 * @param {object} [opts]
 * @param {{ open?: Set<string> } | null} [opts.doorState]
 * @param {Iterable<string>} [opts.openSides]
 */
export function buildDungeonPlayGrid(
  room,
  _origin,
  primarySquares = UW_PRIMARY_SQUARES,
  opts = {},
) {
  const openSides = opts.openSides ?? openSidesForRoom(room, opts.doorState ?? null);
  return composeDungeonRoomTiles(room, { primarySquares, openSides });
}

export function dungeonTileOpts(_inv = {}) {
  // Water `$F4` stays solid; the stepladder object grants a one-tile bypass.
  return { firstUnwalkable: UW_FIRST_UNWALKABLE, walkableRemap: /** @type {number[]} */ ([]) };
}
