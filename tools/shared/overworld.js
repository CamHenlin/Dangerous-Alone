import { parseOffset } from './ranges.js';
import { collectScreenSecrets } from './owSecrets.js';

export const SQUARES_W = 16;
export const SQUARES_H = 11;
export const MAP_W = 16;
export const MAP_H = 8;

/**
 * @param {Buffer} prg
 * @param {object} schema from assets/schema/overworld.json
 */
export function loadOverworldTables(prg, schema) {
  const o = schema.offsets;
  const slice = (key) => {
    const start = parseOffset(o[key].prg);
    const length = o[key].length ?? parseOffset(o[key].endExclusive) - start;
    return Buffer.from(prg.subarray(start, start + length));
  };

  const columnDirectoryRaw = slice('columnDirectory');
  const columnHeapStart = parseOffset(o.columnHeap.prg);
  const columnHeapEnd = parseOffset(o.columnHeap.endExclusive);
  const columnHeap = Buffer.from(prg.subarray(columnHeapStart, columnHeapEnd));

  const bankBase = schema.columnDirectoryBank * 0x4000;
  const columnTableOffsets = [];
  for (let i = 0; i < 16; i += 1) {
    const cpu = columnDirectoryRaw[i * 2] | (columnDirectoryRaw[i * 2 + 1] << 8);
    columnTableOffsets.push(bankBase + (cpu - 0x8000));
  }

  return {
    roomLayouts: slice('roomLayouts'),
    columnHeap,
    columnHeapStart,
    columnTableOffsets,
    secretsTable: [...slice('secretsTable')],
    primarySquares: [...slice('primarySquares')],
    secondarySquares: slice('secondarySquares'),
    screenTable1: slice('screenTable1'),
    screenTable2: slice('screenTable2'),
    monsterTable: slice('monsterTable'),
    arrangement: slice('arrangement'),
    screenTable3: slice('screenTable3'),
    startScreen: prg[parseOffset(o.startScreen.prg)],
    startY: prg[parseOffset(o.startY.prg)],
    tileSources: schema.tileSources,
  };
}

/**
 * Decode one compressed overworld column into 11 square indices.
 * @param {Buffer} heap
 * @param {number} heapBasePrg
 * @param {number[]} tableOffsetsPrg length 16
 * @param {number} descriptor high nibble = table, low = column index
 */
export function decodeColumnSquares(heap, heapBasePrg, tableOffsetsPrg, descriptor) {
  const tableIndex = (descriptor >> 4) & 0x0f;
  const columnIndex = descriptor & 0x0f;
  const tableStart = tableOffsetsPrg[tableIndex] - heapBasePrg;
  const tableEnd =
    tableIndex === 15
      ? heap.length
      : tableOffsetsPrg[tableIndex + 1] - heapBasePrg;

  // Column starts are discovered within the table; decoding may read past the
  // table end into the heap (columns can overlap the next table's bytes).
  let seen = 0;
  let start = -1;
  for (let i = tableStart; i < tableEnd; i += 1) {
    if (heap[i] & 0x80) {
      if (seen === columnIndex) {
        start = i;
        break;
      }
      seen += 1;
    }
  }
  if (start < 0) {
    throw new Error(
      `Column ${columnIndex} not found in table ${tableIndex} (${seen} starts)`,
    );
  }

  const squares = [];
  let p = start;
  let repeatFlag = 0;
  while (squares.length < SQUARES_H) {
    if (p >= heap.length) {
      throw new Error(
        `Column ran past heap end (table ${tableIndex}, col ${columnIndex})`,
      );
    }
    const byte = heap[p];
    squares.push(byte & 0x3f);
    if (byte & 0x40) {
      repeatFlag ^= 0x40;
      if (repeatFlag === 0) {
        p += 1;
      }
    } else {
      p += 1;
    }
  }
  return squares;
}

/**
 * Expand a square index to 4 CHR tile indices: UL, LL, UR, LR.
 *
 * Matches WriteSquareOW: the *square index* (not the primary value) chooses
 * secondary (index < $10) vs consecutive primary tiles (index >= $10).
 *
 * @param {number} square
 * @param {number[]} primarySquares
 * @param {Buffer} secondarySquares
 * @param {number[]} secretsTable
 */
export function squareToTiles(square, primarySquares, secondarySquares, secretsTable) {
  // Type 3: square index < $10 → four tiles from the secondary table.
  if (square < 0x10) {
    const offset = square * 4;
    return [
      secondarySquares[offset],
      secondarySquares[offset + 1],
      secondarySquares[offset + 2],
      secondarySquares[offset + 3],
    ];
  }

  // Type 1: primary is the first CHR tile; next three are consecutive.
  let primary = primarySquares[square];
  if (primary == null) {
    return [0x24, 0x24, 0x24, 0x24];
  }

  // Secret markers $E5-$EA → visible unopened graphics from secrets table.
  if (primary >= 0xe5 && primary <= 0xea) {
    primary = secretsTable[primary - 0xe5] ?? primary;
  }

  return [primary, primary + 1, primary + 2, primary + 3];
}

/**
 * Decode one map cell (0–127) to an 11×16 square grid + attrs.
 */
export function decodeScreen(tables, mapIndex) {
  const arrangeByte = tables.arrangement[mapIndex];
  const layoutId = arrangeByte & 0x7f;
  const useMonsterGroups = Boolean(arrangeByte & 0x80);
  const layoutOffset = layoutId * SQUARES_W;
  const columnDescriptors = tables.roomLayouts.subarray(
    layoutOffset,
    layoutOffset + SQUARES_W,
  );

  /** @type {number[][]} */
  const squares = Array.from({ length: SQUARES_H }, () => Array(SQUARES_W).fill(0));
  for (let col = 0; col < SQUARES_W; col += 1) {
    const columnSquares = decodeColumnSquares(
      tables.columnHeap,
      tables.columnHeapStart,
      tables.columnTableOffsets,
      columnDescriptors[col],
    );
    for (let row = 0; row < SQUARES_H; row += 1) {
      squares[row][col] = columnSquares[row];
    }
  }

  const t1 = tables.screenTable1[mapIndex];
  const t2 = tables.screenTable2[mapIndex];
  const t3 = tables.screenTable3[mapIndex];
  const monsters = tables.monsterTable[mapIndex];

  return {
    mapIndex,
    row: mapIndex >> 4,
    col: mapIndex & 0x0f,
    layoutId,
    useMonsterGroups,
    columnDescriptors: [...columnDescriptors],
    squares,
    attrs: {
      table1: t1,
      table2: t2,
      table3: t3,
      exitX: (t1 >> 4) & 0x0f,
      zora: Boolean(t1 & 0x08),
      /** LevelBlockAttrsA bit $04 — ROM sea/shore ambient (`PlayEffect $20`). */
      wave: Boolean(t1 & 0x04),
      outerPalette: t1 & 0x03,
      caveId: (t2 >> 2) & 0x3f,
      innerPalette: t2 & 0x03,
      monsterCountIndex: (monsters >> 6) & 0x03,
      monsterId: monsters & 0x3f,
      useMonsterGroups,
      ignoreSecretQ1: Boolean(t3 & 0x80),
      ignoreSecretQ2: Boolean(t3 & 0x40),
      stairPositionIndex: (t3 >> 4) & 0x03,
      monsterEntry: Boolean(t3 & 0x08),
      exitY: t3 & 0x07,
    },
  };
}

export function decodeAllScreens(tables) {
  const screens = [];
  for (let i = 0; i < MAP_W * MAP_H; i += 1) {
    screens.push(decodeScreen(tables, i));
  }
  return screens;
}

/**
 * Expand squares → tile grid (22×32) for one screen.
 */
export function screenToTileGrid(screen, tables) {
  const tiles = Array.from({ length: SQUARES_H * 2 }, () =>
    Array(SQUARES_W * 2).fill(0),
  );
  for (let row = 0; row < SQUARES_H; row += 1) {
    for (let col = 0; col < SQUARES_W; col += 1) {
      const [ul, ll, ur, lr] = squareToTiles(
        screen.squares[row][col],
        tables.primarySquares,
        tables.secondarySquares,
        tables.secretsTable,
      );
      const tr = row * 2;
      const tc = col * 2;
      tiles[tr][tc] = ul;
      tiles[tr + 1][tc] = ll;
      tiles[tr][tc + 1] = ur;
      tiles[tr + 1][tc + 1] = lr;
    }
  }
  return tiles;
}

/**
 * Secret square markers still present after tile expand ($E5–$EA via sq $26–$2B).
 * @param {ReturnType<typeof decodeScreen>} screen
 * @param {ReturnType<typeof loadOverworldTables>} tables
 * @param {number} [quest=1]
 */
export function screenSecrets(screen, tables, quest = 1) {
  return collectScreenSecrets(screen.squares, tables.primarySquares, screen.attrs, quest);
}

/**
 * Which LevelInfo BG palette row to use for a square (outer vs inner).
 */
export function paletteRowForSquare(row, col, outerPalette, innerPalette) {
  const onEdge =
    row === 0 || row === SQUARES_H - 1 || col === 0 || col === SQUARES_W - 1;
  return onEdge ? outerPalette : innerPalette;
}
