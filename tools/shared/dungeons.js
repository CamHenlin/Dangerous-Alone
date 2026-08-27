import { parseOffset } from './ranges.js';
import { applyQuest2LevelInfo } from './quest2LevelInfo.js';

export const UW_SQUARES_W = 12;
export const UW_SQUARES_H = 7;
export const UW_MAP_W = 16;
export const UW_MAP_H = 8;

const DOOR_NAMES = {
  0: 'open',
  1: 'wall',
  2: 'wall_or_pass',
  3: 'wall_or_pass',
  4: 'bombable',
  5: 'key',
  6: 'key',
  7: 'shutter',
};

/**
 * @param {Buffer} prg
 * @param {object} schema
 */
export function loadDungeonTables(prg, schema) {
  const o = schema.offsets;
  const roomLayouts = Buffer.from(
    prg.subarray(parseOffset(o.roomLayouts.prg), parseOffset(o.roomLayouts.prg) + o.roomLayouts.length),
  );

  const columnTables = o.columnHeaps.map((heap) => {
    const start = parseOffset(heap.prg);
    return {
      id: heap.id,
      start,
      bytes: Buffer.from(prg.subarray(start, start + heap.length)),
    };
  });

  const primarySquares = (o.primarySquares.values ?? []).map((v) => parseOffset(v));

  const levelBlocks = o.levelBlocks.map((block) => {
    const start = parseOffset(block.prg);
    const bytes = Buffer.from(prg.subarray(start, start + block.length));
    return {
      id: block.id,
      quest: block.quest,
      levels: block.levels,
      nsDoors: bytes.subarray(0x00, 0x80),
      ewDoors: bytes.subarray(0x80, 0x100),
      monsters: bytes.subarray(0x100, 0x180),
      roomTypes: bytes.subarray(0x180, 0x200),
      floorItems: bytes.subarray(0x200, 0x280),
      specialItems: bytes.subarray(0x280, 0x300),
    };
  });

  const fields = schema.levelInfoFields;
  const itemPos = fields.shortcutOrItemPosArray;
  const levelInfos = o.levelInfo.map((info) => {
    const start = parseOffset(info.prg);
    const bytes = Buffer.from(prg.subarray(start, start + info.length));
    const packed = itemPos
      ? [...bytes.subarray(itemPos.offset, itemPos.offset + itemPos.length)]
      : [];
    return {
      level: info.level,
      bytes,
      startY: bytes[fields.startY],
      submenuMapRotation: bytes[fields.submenuMapRotation],
      startRoom: bytes[fields.startRoom],
      triforceRoom: bytes[fields.triforceRoom],
      levelNumber: bytes[fields.levelNumber],
      bossRoom: bytes[fields.bossRoom],
      cellarRooms: [...bytes.subarray(fields.cellarRooms.offset, fields.cellarRooms.offset + fields.cellarRooms.length)],
      drawnMap: [...bytes.subarray(fields.drawnMap.offset, fields.drawnMap.offset + fields.drawnMap.length)],
      /** Packed ShortcutOrItemPosArray bytes (LevelInfo+$29). */
      itemPosPacked: packed,
    };
  });

  return {
    roomLayouts,
    columnTables,
    primarySquares,
    levelBlocks,
    levelInfos,
    doorCodes: schema.doorCodes ?? DOOR_NAMES,
    tileSources: schema.tileSources,
    layoutCount: roomLayouts.length / 12,
  };
}

/**
 * Decode one UW column into 7 square indices.
 * Descriptor bits: 0-2 square, 4-6 extra repeats, 7 column start.
 */
export function decodeUwColumn(tableBytes, columnIndex) {
  let seen = 0;
  let start = -1;
  for (let i = 0; i < tableBytes.length; i += 1) {
    if (tableBytes[i] & 0x80) {
      if (seen === columnIndex) {
        start = i;
        break;
      }
      seen += 1;
    }
  }
  if (start < 0) {
    throw new Error(`UW column ${columnIndex} not found (${seen} starts)`);
  }

  const squares = [];
  let p = start;
  let repeatCount = 0;
  while (squares.length < UW_SQUARES_H) {
    if (p >= tableBytes.length) {
      // Allow reading past end using last table bytes only — pad with floor.
      squares.push(7);
      continue;
    }
    const byte = tableBytes[p];
    const square = byte & 0x07;
    const extraRepeats = (byte >> 4) & 0x07;
    squares.push(square);
    if (repeatCount < extraRepeats) {
      repeatCount += 1;
    } else {
      repeatCount = 0;
      p += 1;
    }
  }
  return squares.slice(0, UW_SQUARES_H);
}

/**
 * Expand UW square index to 4 CHR tiles (UL, LL, UR, LR).
 */
export function uwSquareToTiles(square, primarySquares) {
  const primary = primarySquares[square & 0x07] ?? 0x24;
  // WriteSquareUW: type1 if >= $70 and < $F3; else solid tile.
  if (primary >= 0x70 && primary < 0xf3) {
    return [primary, primary + 1, primary + 2, primary + 3];
  }
  return [primary, primary, primary, primary];
}

export function decodeUwRoomLayout(tables, layoutId) {
  if (layoutId < 0 || layoutId >= tables.layoutCount) {
    throw new Error(`Invalid UW layout ${layoutId}`);
  }
  const descriptors = tables.roomLayouts.subarray(layoutId * 12, layoutId * 12 + 12);
  /** @type {number[][]} */
  const squares = Array.from({ length: UW_SQUARES_H }, () => Array(UW_SQUARES_W).fill(7));
  for (let col = 0; col < UW_SQUARES_W; col += 1) {
    const desc = descriptors[col];
    const tableIndex = (desc >> 4) & 0x0f;
    const columnIndex = desc & 0x0f;
    const table = tables.columnTables[tableIndex];
    if (!table) {
      throw new Error(`Missing UW column table ${tableIndex}`);
    }
    const columnSquares = decodeUwColumn(table.bytes, columnIndex);
    for (let row = 0; row < UW_SQUARES_H; row += 1) {
      squares[row][col] = columnSquares[row];
    }
  }
  return { layoutId, descriptors: [...descriptors], squares };
}

function parseDoors(nsByte, ewByte, doorCodes) {
  // AttrsA: %NNN SSS PP — AttrsB: %WWW EEE PP
  // Confirmed via FindDoorTypeByDoorBit (Z_05.asm): high nibble = N/W, mid = S/E.
  const north = (nsByte >> 5) & 0x07;
  const south = (nsByte >> 2) & 0x07;
  const west = (ewByte >> 5) & 0x07;
  const east = (ewByte >> 2) & 0x07;
  const name = (code) => doorCodes[String(code)] ?? `code_${code}`;
  return {
    north: { code: north, type: name(north) },
    south: { code: south, type: name(south) },
    west: { code: west, type: name(west) },
    east: { code: east, type: name(east) },
    outerPalette: nsByte & 0x03,
    innerPalette: ewByte & 0x03,
  };
}

/** Solid wall — no room connection. Other codes are passable (open/key/bomb/shutter/etc.). */
export function doorConnects(code) {
  return (code & 0x07) !== 1;
}

/**
 * Neighbor room id on the 16×8 dungeon map, or null at the edge.
 * @param {number} roomId
 * @param {'north'|'south'|'west'|'east'} side
 */
function neighborRoomId(roomId, side) {
  const row = roomId >> 4;
  const col = roomId & 0x0f;
  if (side === 'north') return row > 0 ? roomId - 0x10 : null;
  if (side === 'south') return row < 7 ? roomId + 0x10 : null;
  if (side === 'west') return col > 0 ? roomId - 1 : null;
  if (side === 'east') return col < 15 ? roomId + 1 : null;
  return null;
}

const OPPOSITE_SIDE = Object.freeze({
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
});

/**
 * DrawnMap omits some bomb-only secret rooms (e.g. Q1 L7 `$08`/`$1a`). Grow the
 * room set through bidirectional `doorConnects` so those slots stay playable.
 * @param {Set<number>} roomIds
 * @param {object} tables
 * @param {object} levelBlock
 */
export function discoverConnectedRooms(roomIds, tables, levelBlock) {
  /** @type {Map<number, ReturnType<typeof decodeUwRoom>>} */
  const decoded = new Map();
  const doorType = (id, side) => {
    let room = decoded.get(id);
    if (!room) {
      room = decodeUwRoom(tables, levelBlock, id);
      decoded.set(id, room);
    }
    return room.doors[side];
  };

  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...roomIds]) {
      for (const side of ['north', 'south', 'west', 'east']) {
        if (!doorConnects(doorType(id, side).code)) continue;
        const next = neighborRoomId(id, side);
        if (next == null || roomIds.has(next)) continue;
        const opp = OPPOSITE_SIDE[side];
        if (!doorConnects(doorType(next, opp).code)) continue;
        roomIds.add(next);
        grew = true;
      }
    }
  }
  return roomIds;
}

/**
 * Decode one room slot (0–127) from a level block.
 */
export function decodeUwRoom(tables, levelBlock, roomId) {
  const typeByte = levelBlock.roomTypes[roomId];
  const layoutId = typeByte & 0x3f;
  const pushable = Boolean(typeByte & 0x40);
  const useMonsterGroups = Boolean(typeByte & 0x80);
  const layout =
    layoutId < tables.layoutCount
      ? decodeUwRoomLayout(tables, layoutId)
      : { layoutId, descriptors: [], squares: null };

  const floorItem = levelBlock.floorItems[roomId];
  const special = levelBlock.specialItems[roomId];
  const monster = levelBlock.monsters[roomId];

  const attrsA = levelBlock.nsDoors[roomId];
  const attrsB = levelBlock.ewDoors[roomId];
  const attrsC = monster;
  const cellarLayout = layoutId === 0x3e || layoutId === 0x3f;
  // Cellar attrs A/B are exit room ids — not door/palette packing. Keep low
  // palette bits for rendering; mark all sides as walls (no LayOutDoors).
  const doors = cellarLayout
    ? {
        north: { code: 1, type: 'wall' },
        south: { code: 1, type: 'wall' },
        west: { code: 1, type: 'wall' },
        east: { code: 1, type: 'wall' },
        outerPalette: attrsA & 0x03,
        innerPalette: attrsB & 0x03,
      }
    : parseDoors(attrsA, attrsB, tables.doorCodes);
  return {
    roomId,
    row: roomId >> 4,
    col: roomId & 0x0f,
    layoutId,
    pushable,
    useMonsterGroups,
    squares: layout.squares,
    /** Raw LevelBlockAttrs A/B/C (doors or cellar destinations / return pos). */
    attrsA,
    attrsB,
    attrsC,
    doors,
    /** Present for cellar layouts — destination room ids (whole attrs bytes). */
    cellarExits: cellarLayout
      ? { left: attrsA & 0xff, right: attrsB & 0xff }
      : undefined,
    monster: {
      countIndex: (monster >> 6) & 0x03,
      id: monster & 0x3f,
    },
    floorItem: {
      dark: Boolean(floorItem & 0x80),
      // LevelBlock %DSSI IIII — bits 5–6 select the adjacent-room DMC roar
      // (0 none, 1 Aquamentus/Gleeok/Ganon, 2 Dodongo/Gohma, 3 Digdogger/
      // Manhandla/Patra). Data Crystal "boss noise"; Zeldit 20/40/60.
      bossNoise: (floorItem >> 5) & 0x03,
      // Bits vary; keep raw + common decode
      itemType: floorItem & 0x1f,
      raw: floorItem,
    },
    specialItem: {
      positionIndex: (special >> 4) & 0x03,
      effectType: special & 0x07,
      raw: special,
    },
  };
}

/**
 * Rooms shown on the submenu map for a level.
 * Mask is 16 column bytes (bit7 = top row). The game rotates the map
 * display right by `submenuMapRotation`, then applies the mask to display
 * columns — invert that to recover RoomIds.
 */
export function roomsFromDrawnMap(drawnMap, submenuMapRotation = 0) {
  const rooms = new Set();
  const rot = submenuMapRotation & 0x0f;
  for (let col = 0; col < 16; col += 1) {
    const displayCol = (col + rot) & 0x0f;
    const bits = drawnMap[displayCol] ?? 0;
    for (let row = 0; row < 8; row += 1) {
      if (bits & (0x80 >> row)) {
        rooms.add((row << 4) | col);
      }
    }
  }
  return rooms;
}

/**
 * Expand room squares to a 14×24 CHR tile grid (floor only; walls/doors separate).
 */
export function roomToTileGrid(room, primarySquares) {
  const tilesH = UW_SQUARES_H * 2;
  const tilesW = UW_SQUARES_W * 2;
  /** @type {number[][]} */
  const tiles = Array.from({ length: tilesH }, () => Array(tilesW).fill(0x24));
  if (!room.squares) {
    return tiles;
  }
  for (let sr = 0; sr < UW_SQUARES_H; sr += 1) {
    for (let sc = 0; sc < UW_SQUARES_W; sc += 1) {
      const [ul, ll, ur, lr] = uwSquareToTiles(room.squares[sr][sc], primarySquares);
      const tr = sr * 2;
      const tc = sc * 2;
      tiles[tr][tc] = ul;
      tiles[tr + 1][tc] = ll;
      tiles[tr][tc + 1] = ur;
      tiles[tr + 1][tc + 1] = lr;
    }
  }
  return tiles;
}

export function buildLevel(tables, levelNumber, quest = 1) {
  const info = tables.levelInfos.find((l) => l.level === levelNumber);
  if (!info) {
    throw new Error(`Missing LevelInfo for level ${levelNumber}`);
  }
  const block = tables.levelBlocks.find(
    (b) => b.quest === quest && b.levels.includes(levelNumber),
  );
  if (!block) {
    throw new Error(`Missing level block for Q${quest} level ${levelNumber}`);
  }

  /** Working LevelInfo fields (Q2 replacements applied before room selection). */
  const meta = {
    level: levelNumber,
    quest,
    startY: info.startY,
    /** LevelInfo's own encoded level number (drives the submenu "LEVEL-n"). */
    levelNumber: info.levelNumber,
    startRoom: info.startRoom,
    bossRoom: info.bossRoom,
    triforceRoom: info.triforceRoom,
    cellarRooms: info.cellarRooms.filter((r) => r !== 0xff),
    submenuMapRotation: info.submenuMapRotation,
    drawnMap: [...info.drawnMap],
    itemPositions: (info.itemPosPacked ?? []).map((b) => ({
      x: b & 0xf0,
      y: (b & 0x0f) << 4,
      packed: b,
    })),
  };
  if (quest === 2) applyQuest2LevelInfo(meta);

  const mapRooms = roomsFromDrawnMap(meta.drawnMap, meta.submenuMapRotation);
  mapRooms.add(meta.startRoom);
  mapRooms.add(meta.bossRoom);
  mapRooms.add(meta.triforceRoom);
  for (const cellar of meta.cellarRooms) {
    mapRooms.add(cellar);
  }

  // Orphan cellars: layout $3E/$3F whose attrs A/B point at an on-map room
  // (LevelInfo cellar list is incomplete for some levels, e.g. L3 raft).
  /** @type {number[]} */
  const discoveredCellars = [];
  for (let id = 0; id < 128; id += 1) {
    if (mapRooms.has(id)) continue;
    const layoutId = block.roomTypes[id] & 0x3f;
    if (layoutId !== 0x3e && layoutId !== 0x3f) continue;
    const left = block.nsDoors[id] & 0xff;
    const right = block.ewDoors[id] & 0xff;
    if (mapRooms.has(left) || mapRooms.has(right)) {
      mapRooms.add(id);
      discoveredCellars.push(id);
    }
  }

  // Secret rooms omitted from DrawnMap but linked by bombable/open doors.
  discoverConnectedRooms(mapRooms, tables, block);

  const rooms = [...mapRooms]
    .filter((id) => id >= 0 && id < 128)
    .sort((a, b) => a - b)
    .map((roomId) => decodeUwRoom(tables, block, roomId));

  const cellarRooms = [...new Set([...meta.cellarRooms, ...discoveredCellars])];

  return finalizeLevelMeta({
    ...meta,
    cellarRooms,
    rooms,
  });
}
/** Object types used to correct LevelInfo when quest blocks diverge (Q2 L9). */
const META_GANON = 0x3e;
const META_ZELDA = 0x37;

/**
 * Apply Q2 LevelInfo replacements (when needed) and fix L9 Ganon/Zelda anchors.
 * Mutates and returns `level`. Safe to call on already-extracted JSON at load time.
 * @param {object} level
 */
export function finalizeLevelMeta(level) {
  if (!level) return level;
  if (level.quest === 2) applyQuest2LevelInfo(level);
  if (!level.rooms?.length) return level;
  const ganon = level.rooms.find((r) => r.monster?.id === META_GANON);
  if (ganon) level.bossRoom = ganon.roomId;
  if (level.level === 9) {
    const zeldas = level.rooms
      .filter((r) => r.monster?.id === META_ZELDA)
      .sort((a, b) => a.roomId - b.roomId);
    if (zeldas.length) {
      const keep = zeldas.find((r) => r.roomId === level.triforceRoom);
      level.triforceRoom = (keep ?? zeldas[0]).roomId;
    }
  }
  return level;
}
