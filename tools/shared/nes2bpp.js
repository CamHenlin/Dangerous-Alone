/**
 * Decode a single NES 8×8 2bpp pattern tile (16 bytes) to 64 palette indices (0–3).
 * @param {Buffer|Uint8Array} tileBytes
 * @returns {Uint8Array}
 */
export function decodeTileIndices(tileBytes) {
  if (tileBytes.length < 16) {
    throw new Error(`Tile needs 16 bytes, got ${tileBytes.length}`);
  }
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y += 1) {
    const plane0 = tileBytes[y];
    const plane1 = tileBytes[y + 8];
    for (let x = 0; x < 8; x += 1) {
      const bit = 7 - x;
      const lo = (plane0 >> bit) & 1;
      const hi = (plane1 >> bit) & 1;
      out[y * 8 + x] = (hi << 1) | lo;
    }
  }
  return out;
}

/**
 * Decode a contiguous pattern block into tile index grids.
 * @param {Buffer|Uint8Array} patternBytes
 * @returns {Uint8Array[]} one 64-length index array per tile
 */
export function decodePatternBlock(patternBytes) {
  if (patternBytes.length % 16 !== 0) {
    throw new Error(`Pattern block length ${patternBytes.length} is not a multiple of 16`);
  }
  const tiles = [];
  for (let i = 0; i < patternBytes.length; i += 16) {
    tiles.push(decodeTileIndices(patternBytes.subarray(i, i + 16)));
  }
  return tiles;
}

/**
 * Render tiles into RGBA pixels (row-major), 16 tiles per row by default.
 * @param {Uint8Array[]} tiles
 * @param {{ r: number, g: number, b: number, a: number }[]} palette length 4
 * @param {number} [tilesPerRow=16]
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function renderTilesRgba(tiles, palette, tilesPerRow = 16) {
  if (palette.length < 4) {
    throw new Error('Palette needs 4 colors');
  }
  const cols = Math.min(tilesPerRow, Math.max(tiles.length, 1));
  const rows = Math.ceil(tiles.length / cols) || 1;
  const width = cols * 8;
  const height = rows * 8;
  const rgba = new Uint8Array(width * height * 4);

  tiles.forEach((tile, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const baseX = col * 8;
    const baseY = row * 8;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const colorIndex = tile[y * 8 + x] & 0x03;
        const color = palette[colorIndex];
        const px = ((baseY + y) * width + (baseX + x)) * 4;
        rgba[px] = color.r;
        rgba[px + 1] = color.g;
        rgba[px + 2] = color.b;
        rgba[px + 3] = color.a;
      }
    }
  });

  return { width, height, rgba };
}

/**
 * Parse LevelInfo-style palette transfer buf: `3F 00 20` + 32 colors + `FF`.
 * Returns 8 rows of 4 NES color indices.
 * @param {Buffer|Uint8Array} levelInfo
 */
export function parseLevelInfoPalettes(levelInfo) {
  if (levelInfo.length < 36) {
    throw new Error('LevelInfo too short for palette transfer buf');
  }
  if (levelInfo[0] !== 0x3f || levelInfo[1] !== 0x00 || levelInfo[2] !== 0x20) {
    throw new Error(
      `Unexpected LevelInfo palette header: ${[...levelInfo.subarray(0, 3)].map((b) => b.toString(16)).join(' ')}`,
    );
  }
  const colors = [...levelInfo.subarray(3, 35)];
  const rows = [];
  for (let i = 0; i < 8; i += 1) {
    rows.push(colors.slice(i * 4, i * 4 + 4));
  }
  return { rows, raw: colors };
}

/**
 * `LevelInfo_DeathPaletteSeries` — the four half-palettes the death fade walks
 * through (`AnimateWorldFading` @ `Z_01.asm:4743`, starting at `FadeCycle = $60`).
 * Each step is 8 bytes: BG palette rows 2 and 3, written to PPU `$3F08`.
 *
 * The series sits at offset `$DC` in the LevelInfo block, derived from
 * `LevelInfo_DeathPaletteSeries` (`$6C5A`) minus the block base `$6B7E`.
 * @param {Uint8Array} levelInfo
 * @returns {number[][]} 4 steps × 8 NES colour indices
 */
export const DEATH_PALETTE_SERIES_OFFSET = 0xdc;
export const DEATH_PALETTE_SERIES_STEPS = 4;

export function parseDeathPaletteSeries(levelInfo) {
  const start = DEATH_PALETTE_SERIES_OFFSET;
  const end = start + DEATH_PALETTE_SERIES_STEPS * 8;
  if (levelInfo.length < end) {
    throw new Error('LevelInfo too short for death palette series');
  }
  const steps = [];
  for (let i = 0; i < DEATH_PALETTE_SERIES_STEPS; i += 1) {
    steps.push([...levelInfo.subarray(start + i * 8, start + i * 8 + 8)]);
  }
  return steps;
}
