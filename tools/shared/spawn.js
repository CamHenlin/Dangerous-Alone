/**
 * ROM spawn resolution (CreateRoomObjects + AssignObjSpawnPositions).
 * FoeCounts / SpawnPosLists / ObjLists captured from USA PRG1.
 */

/** LevelInfo_FoeCounts for overworld (LevelInfoOW + $24). */
export const FOE_COUNTS_OW = Object.freeze([1, 4, 5, 6]);

/** LevelInfo_FoeCounts for Level 1. */
export const FOE_COUNTS_L1 = Object.freeze([3, 5, 6, 8]);

/**
 * SpawnPosList0–3 (dir bit order: right, left, down, up).
 * Each byte: low nibble → X<<4, high nibble → Y with |$0D.
 */
export const SPAWN_POS_LISTS = Object.freeze([
  Object.freeze([0x55, 0xb5, 0x78, 0x98, 0x7a, 0x9a, 0x6c, 0xac, 0x8d]), // RIGHT
  Object.freeze([0x82, 0x63, 0xa3, 0x75, 0x95, 0x77, 0x97, 0x5a, 0xba]), // LEFT
  Object.freeze([0xa3, 0x75, 0xb5, 0x96, 0x87, 0x99, 0x7a, 0xba, 0xac]), // DOWN
  Object.freeze([0x63, 0x55, 0x95, 0x76, 0x88, 0x79, 0x5a, 0x9a, 0x6c]), // UP
]);

/** ObjLists.dat (201 bytes) from PRG $14676. */
export const OBJ_LISTS_BLOB = Object.freeze([
  0x03, 0x03, 0x04, 0x03, 0x04, 0x03, 0x04, 0x03, 0x04, 0x1a, 0x1a, 0x02, 0x01, 0x02, 0x01, 0x01,
  0x02, 0x01, 0x02, 0x01, 0x0f, 0x02, 0x01, 0x10, 0x02, 0x0f, 0x1a, 0x10, 0x1a, 0x0f, 0x1a, 0x09,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x07, 0x08, 0x07, 0x08, 0x09, 0x08, 0x09, 0x08, 0x0a, 0x07, 0x0a,
  0x07, 0x07, 0x03, 0x0a, 0x04, 0x0a, 0x04, 0x04, 0x4a, 0x00, 0x00, 0x00, 0x13, 0x13, 0x00, 0x13,
  0x4a, 0x00, 0x00, 0x00, 0x1b, 0x1b, 0x1b, 0x1b, 0x2b, 0x2b, 0x2b, 0x13, 0x13, 0x1b, 0x1b, 0x1b,
  0x16, 0x30, 0x30, 0x1b, 0x1b, 0x16, 0x00, 0x00, 0x2b, 0x2b, 0x2b, 0x23, 0x23, 0x24, 0x23, 0x24,
  0x2b, 0x2b, 0x12, 0x12, 0x12, 0x00, 0x00, 0x00, 0x2b, 0x2b, 0x13, 0x13, 0x17, 0x17, 0x2b, 0x2b,
  0x0c, 0x0b, 0x0b, 0x30, 0x30, 0x30, 0x2b, 0x2b, 0x05, 0x05, 0x05, 0x1b, 0x1b, 0x1b, 0x4a, 0x00,
  0x00, 0x00, 0x17, 0x17, 0x17, 0x17, 0x4a, 0x00, 0x00, 0x00, 0x23, 0x24, 0x23, 0x24, 0x16, 0x0c,
  0x0b, 0x0c, 0x0b, 0x16, 0x2b, 0x2b, 0x2b, 0x27, 0x27, 0x27, 0x27, 0x27, 0x05, 0x06, 0x06, 0x05,
  0x06, 0x05, 0x00, 0x00, 0x23, 0x23, 0x24, 0x23, 0x24, 0x2b, 0x17, 0x23, 0x23, 0x17, 0x24, 0x17,
  0x24, 0x2d, 0x2d, 0x2d, 0x2c, 0x23, 0x24, 0x23, 0x24, 0x2d, 0x2d, 0x2d, 0x2c, 0x0c, 0x0b, 0x0c,
  0x0b, 0x2d, 0x2d, 0x2d, 0x2c, 0x27, 0x27, 0x27, 0x27,
]);

/** Start offsets into OBJ_LISTS_BLOB (from ObjListAddrs.inc). */
export const OBJ_LIST_OFFSETS = Object.freeze([
  0, 5, 9, 15, 19, 25, 31, 36, 40, 45, 50, 56, 64, 72, 80, 88, 96, 104, 110, 118, 126,
  134, 142, 148, 156, 164, 169, 177, 185, 193,
]);

/**
 * Decode a spawn-list byte to pixel coords (screen space, HUD included in Y).
 * @param {number} packed
 */
export function decodeSpawnByte(packed) {
  return {
    x: (packed & 0x0f) << 4,
    y: (packed & 0xf0) | 0x0d,
  };
}

/**
 * Full monster list ID from room attrs.
 * @param {{ monsterId?: number, useMonsterGroups?: boolean, monster?: { id: number }, }} attrs
 */
export function fullMonsterListId(attrs) {
  const id = attrs.monster?.id ?? attrs.monsterId ?? 0;
  const groups = attrs.monster
    ? Boolean(attrs.useMonsterGroups)
    : Boolean(attrs.useMonsterGroups);
  return (id & 0x3f) | (groups ? 0x40 : 0);
}

/**
 * Resolve object types to spawn (no positions yet).
 * @param {object} opts
 * @param {number} opts.monsterId
 * @param {number} opts.countIndex
 * @param {boolean} [opts.useMonsterGroups]
 * @param {readonly number[]} [opts.foeCounts]
 * @returns {number[]} objType per slot
 */
export function resolveObjTypes({
  monsterId,
  countIndex,
  useMonsterGroups = false,
  foeCounts = FOE_COUNTS_OW,
}) {
  let listId = (monsterId & 0x3f) | (useMonsterGroups ? 0x40 : 0);
  if (listId === 0) return [];

  let count = foeCounts[countIndex & 3] ?? 1;
  if (listId >= 0x32 && listId < 0x62) {
    count = 1;
  }
  if (count <= 0) return [];

  if (listId >= 0x62) {
    const listIndex = listId - 0x62;
    const start = OBJ_LIST_OFFSETS[listIndex];
    if (start == null) return [];
    /** @type {number[]} */
    const types = [];
    for (let i = 0; i < count; i += 1) {
      types.push(OBJ_LISTS_BLOB[start + i] ?? 0);
    }
    return types;
  }

  return Array.from({ length: count }, () => listId);
}

/**
 * Dir bit → spawn list index (NES: scan bits right→left→down→up).
 * @param {number} dirBit
 */
export function spawnListIndexForDir(dirBit) {
  if (dirBit & 0x01) return 0; // RIGHT
  if (dirBit & 0x02) return 1; // LEFT
  if (dirBit & 0x04) return 2; // DOWN
  return 3; // UP
}

/**
 * Assign spawn positions for obj types.
 * @param {number[]} objTypes
 * @param {object} [opts]
 * @param {number} [opts.linkDir]
 * @param {number} [opts.cycleStart]
 * @param {{ x: number, y: number }} [opts.origin] dungeon room origin offset
 * @returns {{ objType: number, x: number, y: number }[]}
 */
export function assignSpawnPositions(objTypes, opts = {}) {
  const linkDir = opts.linkDir ?? 0x08;
  const list = SPAWN_POS_LISTS[spawnListIndexForDir(linkDir)] ?? SPAWN_POS_LISTS[3];
  let cycle = (opts.cycleStart ?? 0) % list.length;
  const origin = opts.origin ?? { x: 0, y: 0 };
  /** @type {{ objType: number, x: number, y: number }[]} */
  const out = [];
  for (let i = 0; i < objTypes.length; i += 1) {
    const packed = list[cycle];
    cycle = (cycle + 1) % list.length;
    const pos = decodeSpawnByte(packed);
    out.push({
      objType: objTypes[i],
      x: pos.x + origin.x,
      y: pos.y + origin.y,
    });
  }
  return out;
}

/**
 * Full resolve from screen/room attrs.
 * @param {object} attrs
 * @param {object} [opts]
 */
export function resolveSpawns(attrs, opts = {}) {
  const monsterId = attrs.monster?.id ?? attrs.monsterId ?? 0;
  const countIndex = attrs.monster?.countIndex ?? attrs.monsterCountIndex ?? 0;
  const useMonsterGroups = Boolean(
    attrs.useMonsterGroups ?? attrs.monster?.useMonsterGroups,
  );
  const types = resolveObjTypes({
    monsterId,
    countIndex,
    useMonsterGroups,
    foeCounts: opts.foeCounts ?? FOE_COUNTS_OW,
  });
  // OW monsterEntry (attrs byte F bit3): spawn from screen edges and walk in.
  if (attrs.monsterEntry && opts.allowEdgeSpawn !== false) {
    return types.map((objType) => ({
      objType,
      x: 0,
      y: 0,
      edgePending: true,
    }));
  }
  return assignSpawnPositions(types, {
    linkDir: opts.linkDir,
    cycleStart: opts.cycleStart ?? monsterId,
    origin: opts.origin,
  });
}

/**
 * `FindEmptyMonsterSlot` (Z_07.asm) starts at $0C, pre-decrements, and gives up
 * once the index reaches 0 — so monsters live in object slots $01…$0B only.
 * Slot 0 is Link, and everything above $0B belongs to shots and the room item.
 */
export const FIRST_MONSTER_SLOT = 0x01;
export const LAST_MONSTER_SLOT = 0x0b;
export const MONSTER_SLOT_COUNT = LAST_MONSTER_SLOT - FIRST_MONSTER_SLOT + 1;

/**
 * Free object slots left. Our enemy list is dense, so occupancy is its length.
 * @param {readonly unknown[] | null | undefined} enemies
 */
export function monsterSlotsFree(enemies) {
  return Math.max(0, MONSTER_SLOT_COUNT - (enemies?.length ?? 0));
}

/**
 * @param {readonly unknown[] | null | undefined} enemies
 */
export function monsterSlotsFull(enemies) {
  return monsterSlotsFree(enemies) === 0;
}

/**
 * `FindEmptyMonsterSlot` — the highest free slot, or 0 when the table is full.
 * @param {readonly unknown[] | null | undefined} enemies
 */
export function findEmptyMonsterSlot(enemies) {
  const used = enemies?.length ?? 0;
  if (used >= MONSTER_SLOT_COUNT) return 0;
  return LAST_MONSTER_SLOT - used;
}

/**
 * Append a monster only when the object table has room, mirroring the ROM's
 * "return without spawning if there's no empty slot".
 * @template T
 * @param {T[]} enemies
 * @param {T | null | undefined} enemy
 * @returns {boolean} true when the monster was added
 */
export function tryAddMonster(enemies, enemy) {
  if (!enemy || !enemies || monsterSlotsFull(enemies)) return false;
  enemies.push(enemy);
  return true;
}

/**
 * Trim a freshly built spawn list to the object-slot budget.
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
export function capMonsterList(list) {
  if (!list || list.length <= MONSTER_SLOT_COUNT) return list;
  return list.slice(0, MONSTER_SLOT_COUNT);
}

/** Safe spawn distance from Link (IsDistanceSafeToSpawn). */
export const EDGE_SPAWN_MIN_DIST = 0x22;

/**
 * Place one edge-pending foe on a walkable border cell facing inward.
 * @param {{ objType: number, edgePending?: boolean }} spawn
 * @param {number[][]} tileGrid
 * @param {{ x: number, y: number }} link
 * @param {(max: number) => number} [rng] returns 0..max-1
 * @returns {{ objType: number, x: number, y: number, dir: number, edgePending: boolean } | null}
 */
export function tryEdgeSpawn(spawn, tileGrid, link, rng = (n) => Math.floor(Math.random() * n)) {
  if (!spawn?.edgePending || !tileGrid?.length) return null;
  /** @type {{ x: number, y: number, dir: number }[]} */
  const candidates = [];
  const rows = tileGrid.length;
  const cols = tileGrid[0].length;

  const pushIfOpen = (col, row, dir, x, y) => {
    const tile = tileGrid[row]?.[col] ?? 0xff;
    // FindNextEdgeSpawnCell uses tile < $84 on OW.
    if ((tile & 0xff) >= 0x84) return;
    if (Math.abs(x - link.x) < EDGE_SPAWN_MIN_DIST && Math.abs(y - link.y) < EDGE_SPAWN_MIN_DIST) {
      return;
    }
    candidates.push({ x, y, dir });
  };

  // Top / bottom edges (play Y includes HUD via spawn Y = row*8 + HUD).
  for (let c = 2; c < cols - 2; c += 2) {
    pushIfOpen(c, 1, 0x04 /* DOWN */, c * 8, 0x4d);
    pushIfOpen(c, rows - 2, 0x08 /* UP */, c * 8, 0xd0);
  }
  // Left / right edges.
  for (let r = 2; r < rows - 2; r += 2) {
    pushIfOpen(1, r, 0x01 /* RIGHT */, 0x20, r * 8 + 0x40);
    pushIfOpen(cols - 2, r, 0x02 /* LEFT */, 0xd0, r * 8 + 0x40);
  }

  if (candidates.length === 0) return null;
  const pick = candidates[rng(candidates.length)];
  return {
    objType: spawn.objType,
    x: pick.x,
    y: pick.y,
    dir: pick.dir,
    edgePending: false,
  };
}
