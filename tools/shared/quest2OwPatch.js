/**
 * Quest 2 overworld attribute / layout patches (Z_06 @PatchQ2Rooms).
 */

/** AttrsB replacements: room id → new AttrsB byte. */
export const Q2_ATTRS_B = Object.freeze({
  0x0e: 0x7b,
  0x0f: 0x83,
  0x22: 0x84,
  0x34: 0x0f,
  0x3c: 0x0b,
  0x45: 0x12,
  0x74: 0x7a,
  // NES writes AttrsB+$8B which overflows into monster table for room $0B.
  0x8b: 0x2f,
});

/** AttrsD (arrangement / layout) replacements — layoutId = byte & $7F. */
export const Q2_LAYOUT = Object.freeze({
  0x0b: 0x7b,
  0x3c: 0x7b,
  0x74: 0x5a,
});

/** AttrsA (exit X nibble in high 4 bits among other flags). */
export const Q2_ATTRS_A = Object.freeze({
  0x3c: 0x72,
  0x74: 0x72,
});

/** AttrsF / screenTable3 exitY low nibble (+ flags). */
export const Q2_ATTRS_F = Object.freeze({
  0x3c: 0x01,
  0x74: 0x00,
});

/** Rooms whose layout (tileGrid) must be rebuilt for Q2. */
export const Q2_LAYOUT_ROOMS = Object.freeze([0x0b, 0x3c, 0x74]);

/**
 * Mutate overworld table buffers for Quest 2 (in-place).
 * @param {import('./overworld.js').loadOverworldTables extends Function ? any : object} tables
 */
export function applyQuest2OverworldPatch(tables) {
  for (const [room, value] of Object.entries(Q2_ATTRS_B)) {
    const id = Number(room);
    if (id === 0x8b) {
      // Overflow into monster table at index $0B (Z_06).
      tables.monsterTable[0x0b] = value;
      continue;
    }
    tables.screenTable2[id] = value;
  }
  for (const [room, value] of Object.entries(Q2_LAYOUT)) {
    tables.arrangement[Number(room)] = value;
  }
  for (const [room, value] of Object.entries(Q2_ATTRS_A)) {
    tables.screenTable1[Number(room)] = value;
  }
  for (const [room, value] of Object.entries(Q2_ATTRS_F)) {
    const id = Number(room);
    // Preserve Q2 ignore-secret / stair bits from original high nibbles when possible;
    // NES replaces the whole AttrsF byte for these rooms.
    tables.screenTable3[id] = value;
  }
  return tables;
}

/**
 * Clone Buffer / Uint8Array fields so Q1 tables stay intact.
 * @param {object} tables
 */
export function cloneOverworldTables(tables) {
  const cloneBuf = (b) => (Buffer.isBuffer(b) ? Buffer.from(b) : Uint8Array.from(b));
  return {
    ...tables,
    roomLayouts: cloneBuf(tables.roomLayouts),
    columnHeap: cloneBuf(tables.columnHeap),
    screenTable1: cloneBuf(tables.screenTable1),
    screenTable2: cloneBuf(tables.screenTable2),
    screenTable3: cloneBuf(tables.screenTable3),
    monsterTable: cloneBuf(tables.monsterTable),
    arrangement: cloneBuf(tables.arrangement),
    columnTableOffsets: [...tables.columnTableOffsets],
    secretsTable: [...tables.secretsTable],
    primarySquares: [...tables.primarySquares],
  };
}

/**
 * Apply Q2 cave/attr remaps to an already-loaded play screen pack (no layout rebuild).
 * Layout rooms should use a prebuilt q2 overlay instead.
 * @param {object} pack play screen JSON
 * @returns {object} mutated pack
 */
export function applyQuest2AttrsToPack(pack) {
  const id = pack.mapIndex & 0xff;
  if (Q2_ATTRS_B[id] != null && id !== 0x8b) {
    const b = Q2_ATTRS_B[id];
    pack.attrs = {
      ...pack.attrs,
      table2: b,
      caveId: (b >> 2) & 0x3f,
      innerPalette: b & 0x03,
    };
  }
  if (id === 0x0b && Q2_ATTRS_B[0x8b] != null) {
    // Monster byte for room $0B comes from the $8B overflow write.
    pack.attrs = {
      ...pack.attrs,
      monsterId: Q2_ATTRS_B[0x8b] & 0x3f,
      monsterCountIndex: (Q2_ATTRS_B[0x8b] >> 6) & 0x03,
    };
  }
  if (Q2_ATTRS_A[id] != null) {
    const a = Q2_ATTRS_A[id];
    pack.attrs = {
      ...pack.attrs,
      table1: a,
      exitX: (a >> 4) & 0x0f,
      zora: Boolean(a & 0x08),
      wave: Boolean(a & 0x04),
      outerPalette: a & 0x03,
    };
  }
  if (Q2_ATTRS_F[id] != null) {
    const f = Q2_ATTRS_F[id];
    pack.attrs = {
      ...pack.attrs,
      table3: f,
      ignoreSecretQ1: Boolean(f & 0x80),
      ignoreSecretQ2: Boolean(f & 0x40),
      stairPositionIndex: (f >> 4) & 0x03,
      monsterEntry: Boolean(f & 0x08),
      exitY: f & 0x07,
    };
  }
  if (Q2_LAYOUT[id] != null) {
    pack.layoutId = Q2_LAYOUT[id] & 0x7f;
  }
  return pack;
}

/**
 * Whether this room needs a full Q2 tileGrid overlay (layout swap).
 * @param {number} mapIndex
 */
export function quest2NeedsLayoutOverlay(mapIndex) {
  return Q2_LAYOUT_ROOMS.includes(mapIndex & 0xff);
}
