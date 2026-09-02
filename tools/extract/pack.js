/**
 * Build the playable asset pack from a Zelda iNES ROM.
 *
 * Pure: no `fs`, no Node Buffer, no zlib. Images stay as RGBA until the
 * browser host turns them into PNG blob responses (or Pixi textures).
 */

import { assertZeldaShape, parseInes, prgIdentity } from '../shared/ines.js';
import { copyBytes } from '../shared/bytes.js';
import { parseOffset } from '../shared/ranges.js';
import { crc32Hex } from '../shared/hash.js';
import {
  decodePatternBlock,
  parseDeathPaletteSeries,
  parseLevelInfoPalettes,
  renderTilesRgba,
} from '../shared/nes2bpp.js';
import { GREY_PREVIEW, nesColor, rgbaFromNesIndices } from '../shared/nesPalette.js';
import {
  HUD_HEIGHT,
  OW_BOUNDS,
  OW_FIRST_UNWALKABLE,
  OW_WALKABLE_REMAP,
} from '../shared/collision.js';
import {
  MAP_H,
  MAP_W,
  SQUARES_H,
  SQUARES_W,
  decodeAllScreens,
  decodeScreen,
  loadOverworldTables,
  screenSecrets,
  screenToTileGrid,
} from '../shared/overworld.js';
import { renderOwTileGridRgba } from '../shared/owScreenRender.js';
import {
  Q2_LAYOUT_ROOMS,
  applyQuest2OverworldPatch,
  cloneOverworldTables,
} from '../shared/quest2OwPatch.js';
import { UW_MAP_H, UW_MAP_W, UW_SQUARES_H, UW_SQUARES_W, buildLevel, loadDungeonTables } from '../shared/dungeons.js';
import { PLAY_COLS, PLAY_ROWS } from '../shared/dungeonRoomLayout.js';
import { buildCaveTable } from '../shared/caves.js';
import { linesForTextId, stringForTextId } from '../shared/caveText.js';
import { buildAudioDoc } from './audioData.js';
import {
  creditsRowLayout,
  creditsScrollEnd,
  decodeCreditsLines,
  decodePeaceString,
  decodePeaceText,
  decodeThanksText,
  peaceLayout,
  thanksLayout,
} from '../shared/endingText.js';
import { decodeDemoTextLines } from '../shared/demoText.js';
import {
  STORY_BG_PALETTE_ROWS,
  STORY_TRANSFER_PRG,
  TITLE_TRANSFER_PRG,
  decodeStoryNametable,
  decodeTitleNametable,
  renderDemoNametableRgba,
  renderStoryNametableRgba,
  renderTitleNametableRgba,
} from '../shared/demoStory.js';
import { BODY_ROWS, composeStoryboard, paginatePanels } from '../shared/storyboard.js';
import { HIGHLIGHT, PARAGRAPHS, TITLE } from '../../story/prologue.js';
import { bombCrackRgba } from '../shared/bombCrack.js';

function yieldUi() {
  return new Promise((r) => setTimeout(r, 0));
}

function hexPad(n) {
  return n.toString(16).padStart(2, '0');
}

function putJson(files, path, data) {
  files.set(path, { kind: 'json', data });
}

function putBytes(files, path, data) {
  files.set(path, { kind: 'bytes', data });
}

function putRgba(files, path, width, height, rgba) {
  files.set(path, { kind: 'rgba', width, height, rgba });
}

function paletteToRgba(previewMode, levelPalettes, rowIndex) {
  if (previewMode === 'grey') {
    return GREY_PREVIEW.map(([r, g, b], i) => ({ r, g, b, a: i === 0 ? 0 : 255 }));
  }
  const rows = levelPalettes?.rows;
  if (!rows?.[rowIndex]) {
    return GREY_PREVIEW.map(([r, g, b], i) => ({ r, g, b, a: i === 0 ? 0 : 255 }));
  }
  return rgbaFromNesIndices(rows[rowIndex]);
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, object>} files
 */
async function extractGraphics(prg, schema, files) {
  /** @type {object[]} */
  const paletteSets = [];
  for (const entry of schema.level_info_palettes ?? []) {
    const blob = prg.subarray(entry.prg_offset, entry.prg_offset + entry.length);
    const parsed = parseLevelInfoPalettes(blob);
    const deathFade = parseDeathPaletteSeries(blob);
    paletteSets.push({
      id: entry.id,
      prgOffset: entry.prg_offset,
      prgOffsetHex: `0x${entry.prg_offset.toString(16).toUpperCase()}`,
      rows: parsed.rows,
      rowsRgb: parsed.rows.map((row) => row.map((idx) => nesColor(idx))),
      rawNesIndices: parsed.raw,
      deathFade,
      deathFadeRgb: deathFade.map((step) => step.map((idx) => nesColor(idx))),
    });
  }
  putJson(files, 'graphics/palettes.json', {
    generatedAt: new Date().toISOString(),
    paletteSets,
  });

  const overworld = paletteSets.find((p) => p.id === 'overworld');
  /** @type {object[]} */
  const sheets = [];
  /** @type {Map<string, Uint8Array>} */
  const bins = new Map();

  for (const block of schema.blocks) {
    const end = block.prg_offset + block.length;
    if (end > prg.length) {
      throw new Error(`Block ${block.id} exceeds PRG`);
    }
    const bytes = copyBytes(prg, block.prg_offset, end);
    putBytes(files, `graphics/${block.id}.bin`, bytes);
    bins.set(block.id, bytes);

    const tiles = decodePatternBlock(bytes);
    const rowIndex = block.kind === 'sprites' ? 4 : 1;
    const palette = paletteToRgba('level', overworld, rowIndex);
    if (block.kind === 'background') {
      palette[0] = { r: 0, g: 0, b: 0, a: 255 };
    }
    const { width, height, rgba } = renderTilesRgba(tiles, palette, 16);
    putRgba(files, `graphics/${block.sheet}`, width, height, rgba);

    const greyPalette = paletteToRgba('grey');
    if (block.kind === 'background') {
      greyPalette[0] = { r: 0, g: 0, b: 0, a: 255 };
    }
    const grey = renderTilesRgba(tiles, greyPalette, 16);
    const greyName = block.sheet.replace(/\.png$/, '_grey.png');
    putRgba(files, `graphics/${greyName}`, grey.width, grey.height, grey.rgba);

    sheets.push({
      id: block.id,
      description: block.description,
      kind: block.kind,
      sheet: block.sheet,
      greySheet: greyName,
      bin: `${block.id}.bin`,
      tileCount: tiles.length,
      width,
      height,
      prgOffset: block.prg_offset,
      prgOffsetHex: `0x${block.prg_offset.toString(16).toUpperCase()}`,
      length: block.length,
      crc32: crc32Hex(bytes),
      previewPaletteRow: rowIndex,
    });
    await yieldUi();
  }

  putJson(files, 'graphics/graphics_manifest.json', {
    generatedAt: new Date().toISOString(),
    palettes: 'graphics/palettes.json',
    sheets,
  });

  return { paletteSets, bins, sheets };
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, Uint8Array>} patternBins
 * @param {object[]} paletteSets
 * @param {Map<string, object>} files
 */
async function extractOverworld(prg, schema, files) {
  const tables = loadOverworldTables(prg, schema);
  const screens = decodeAllScreens(tables);

  const indexScreens = [];
  for (let i = 0; i < screens.length; i += 1) {
    const screen = screens[i];
    const idHex = hexPad(screen.mapIndex);
    const tileGrid = screenToTileGrid(screen, tables);
    putJson(files, `play/screens/${idHex}.json`, {
      mapIndex: screen.mapIndex,
      row: screen.row,
      col: screen.col,
      layoutId: screen.layoutId,
      attrs: screen.attrs,
      tileGrid,
      secrets: screenSecrets(screen, tables, 1),
      secretsQ2: screenSecrets(screen, tables, 2),
      image: `../overworld/screens/screen_${idHex}.png`,
    });
    indexScreens.push({
      mapIndex: screen.mapIndex,
      row: screen.row,
      col: screen.col,
      caveId: screen.attrs.caveId,
      ignoreSecretQ1: screen.attrs.ignoreSecretQ1,
      ignoreSecretQ2: screen.attrs.ignoreSecretQ2,
      file: `screens/${idHex}.json`,
      image: `../overworld/screens/screen_${idHex}.png`,
      layoutId: screen.layoutId,
      useMonsterGroups: screen.useMonsterGroups,
      attrs: screen.attrs,
      squares: screen.squares,
    });
    if ((i & 15) === 15) await yieldUi();
  }

  const start = screens[tables.startScreen];
  const startTileGrid = screenToTileGrid(start, tables);
  putJson(files, 'play/start_screen.json', {
    generatedAt: new Date().toISOString(),
    screenId: tables.startScreen,
    startX: 0x78,
    startY: tables.startY,
    startDir: 0x08,
    hudHeight: HUD_HEIGHT,
    internalWidth: 256,
    internalHeight: 240,
    playArea: {
      width: SQUARES_W * 16,
      height: SQUARES_H * 16,
      tileCols: SQUARES_W * 2,
      tileRows: SQUARES_H * 2,
    },
    bounds: OW_BOUNDS,
    firstUnwalkable: OW_FIRST_UNWALKABLE,
    walkableRemap: [...OW_WALKABLE_REMAP],
    screenImage: `../overworld/screens/screen_${hexPad(tables.startScreen)}.png`,
    spritesSheet: '../graphics/common_sprites.png',
    tileGrid: startTileGrid,
    squares: start.squares,
    secrets: screenSecrets(start, tables, 1),
    secretsQ2: screenSecrets(start, tables, 2),
    attrs: start.attrs,
    layoutId: start.layoutId,
  });

  const screenMeta = {
    widthSquares: SQUARES_W,
    heightSquares: SQUARES_H,
    widthTiles: SQUARES_W * 2,
    heightTiles: SQUARES_H * 2,
    widthPixels: SQUARES_W * 16,
    heightPixels: SQUARES_H * 16,
  };
  putJson(files, 'overworld/overworld_index.json', {
    generatedAt: new Date().toISOString(),
    startScreen: tables.startScreen,
    startY: tables.startY,
    map: { widthScreens: MAP_W, heightScreens: MAP_H },
    screen: screenMeta,
    stitched: 'overworld_stitched.png',
    tileSources: schema.tileSources,
    screens: indexScreens.map((s) => ({
      mapIndex: s.mapIndex,
      row: s.row,
      col: s.col,
      layoutId: s.layoutId,
      useMonsterGroups: s.useMonsterGroups,
      attrs: s.attrs,
      squares: s.squares,
      image: `screens/screen_${hexPad(s.mapIndex)}.png`,
    })),
  });
  putJson(files, 'play/world_index.json', {
    generatedAt: new Date().toISOString(),
    startScreen: tables.startScreen,
    startX: 0x78,
    startY: tables.startY,
    startDir: 0x08,
    map: { widthScreens: MAP_W, heightScreens: MAP_H },
    level1Screen: 0x37,
    screens: indexScreens.map((s) => ({
      mapIndex: s.mapIndex,
      row: s.row,
      col: s.col,
      caveId: s.caveId,
      ignoreSecretQ1: s.ignoreSecretQ1,
      ignoreSecretQ2: s.ignoreSecretQ2,
      file: s.file,
      image: s.image,
    })),
  });

  const q2Tables = applyQuest2OverworldPatch(cloneOverworldTables(tables));
  for (const mapIndex of Q2_LAYOUT_ROOMS) {
    const screen = decodeScreen(q2Tables, mapIndex);
    const tileGrid = screenToTileGrid(screen, q2Tables);
    const idHex = hexPad(mapIndex);
    putJson(files, `play/q2/screens/${idHex}.json`, {
      mapIndex,
      row: screen.row,
      col: screen.col,
      layoutId: screen.layoutId,
      attrs: screen.attrs,
      tileGrid,
      secrets: screenSecrets(screen, q2Tables, 2),
      squares: screen.squares,
      image: `screen_${idHex}.png`,
      quest: 2,
    });
  }
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, object>} files
 */
function extractDungeons(prg, schema, files) {
  const tables = loadDungeonTables(prg, schema);
  const primarySquares = (schema.offsets.primarySquares.values ?? []).map((v) => parseOffset(v));
  const indexLevels = [];

  for (const quest of [1, 2]) {
    for (let levelNumber = 1; levelNumber <= 9; levelNumber += 1) {
      const level = buildLevel(tables, levelNumber, quest);
      const roomW = PLAY_COLS * 8;
      const roomH = PLAY_ROWS * 8;
      const rooms = level.rooms.map((room) => ({
        roomId: room.roomId,
        row: room.row,
        col: room.col,
        layoutId: room.layoutId,
        pushable: room.pushable,
        useMonsterGroups: room.useMonsterGroups,
        attrsA: room.attrsA,
        attrsB: room.attrsB,
        attrsC: room.attrsC,
        cellarExits: room.cellarExits,
        doors: room.doors,
        monster: room.monster,
        floorItem: room.floorItem,
        specialItem: room.specialItem,
        squares: room.squares,
        image: `rooms/room_${hexPad(room.roomId)}.png`,
      }));
      const levelJson = {
        generatedAt: new Date().toISOString(),
        quest: level.quest,
        level: level.level,
        startRoom: level.startRoom,
        startY: level.startY,
        levelNumber: level.levelNumber,
        bossRoom: level.bossRoom,
        triforceRoom: level.triforceRoom,
        cellarRooms: level.cellarRooms,
        submenuMapRotation: level.submenuMapRotation,
        drawnMap: level.drawnMap,
        itemPositions: level.itemPositions,
        map: { widthRooms: UW_MAP_W, heightRooms: UW_MAP_H },
        room: {
          widthSquares: UW_SQUARES_W,
          heightSquares: UW_SQUARES_H,
          widthTiles: PLAY_COLS,
          heightTiles: PLAY_ROWS,
          widthPixels: roomW,
          heightPixels: roomH,
          floorOriginTiles: { col: 4, row: 4 },
          floorWidthTiles: UW_SQUARES_W * 2,
          floorHeightTiles: UW_SQUARES_H * 2,
        },
        stitched: 'level_stitched.png',
        rooms,
      };
      putJson(files, `dungeons/q${quest}/level_${levelNumber}/level.json`, levelJson);
      indexLevels.push({
        quest,
        level: levelNumber,
        startRoom: level.startRoom,
        bossRoom: level.bossRoom,
        triforceRoom: level.triforceRoom,
        cellarRooms: level.cellarRooms,
        roomCount: level.rooms.length,
        path: `q${quest}/level_${levelNumber}`,
      });
    }
  }

  putJson(files, 'dungeons/dungeons_index.json', {
    generatedAt: new Date().toISOString(),
    layoutCount: tables.layoutCount,
    tileSources: schema.tileSources,
    primarySquares,
    levels: indexLevels,
  });
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, object>} files
 */
function extractCaves(prg, schema, files) {
  const slice = (key) => {
    const start = parseOffset(schema.offsets[key].prg);
    const length = schema.offsets[key].length;
    return prg.subarray(start, start + length);
  };
  const bankBase = parseOffset(schema.textBankPrgBase);
  const textOpts = {
    textPointersPrg: parseOffset(schema.offsets.textPointers.prg),
    bankPrgBase: bankBase,
  };
  /** @type {Record<string, string>} */
  const texts = {};
  /** @type {Record<string, string[]>} */
  const textLines = {};
  for (let textId = 0; textId < 76; textId += 2) {
    const lines = linesForTextId(prg, textId, textOpts);
    textLines[textId] = lines;
    texts[textId] = lines.join(' ') || stringForTextId(prg, textId, textOpts);
  }
  const takeAnyRoad = [...slice('takeAnyRoad')];
  const caves = buildCaveTable(
    slice('items'),
    slice('prices'),
    slice('textFlags'),
    slice('dwellers'),
    texts,
    takeAnyRoad,
  );
  for (const cave of caves) {
    cave.textLines = textLines[cave.textId] ?? (cave.text ? [cave.text] : []);
  }
  putJson(files, 'tables/caves.json', {
    generatedAt: new Date().toISOString(),
    revision_target: schema.revision_target,
    shopPriceIndexDelta: schema.shopPriceIndexDelta,
    takeAnyRoad,
    texts,
    textLines,
    caves,
  });
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, object>} files
 */
function extractEnding(prg, schema, files) {
  const table = (name) => {
    const entry = schema.offsets[name];
    const start = parseOffset(entry.prg);
    return Array.from(prg.subarray(start, start + entry.length));
  };
  const thanks = decodeThanksText(prg, parseOffset(schema.offsets.thanksText.prg));
  const peaceOffset = parseOffset(schema.offsets.peaceText.prg);
  const peace = decodePeaceText(prg, peaceOffset);
  const credits = decodeCreditsLines(
    prg,
    parseOffset(schema.offsets.creditsTextLines.prg),
    schema.creditsLineOffsets,
  );
  const { rows, totalRows } = creditsRowLayout(table('creditsPagesTextMasks'));
  putJson(files, 'play/ending.json', {
    generatedAt: new Date().toISOString(),
    thanksText: thanks,
    thanksLines: thanksLayout(
      thanks,
      table('thanksLineAddrsLo'),
      undefined,
      parseOffset(schema.thanksVramHigh),
    ),
    peaceText: peace,
    peaceLines: peaceLayout(
      decodePeaceString(prg, peaceOffset),
      table('peaceCharAddrsLo'),
      parseOffset(schema.peaceVramHigh),
    ),
    creditsLines: credits.map((line, i) => ({ ...line, row: rows[i] ?? null })),
    creditsTotalRows: totalRows,
    creditsScrollEnd: creditsScrollEnd(
      table('creditsLastScreens'),
      table('creditsLastVscrolls'),
    ),
    creditsQuestGating: schema.creditsQuestGating,
    playerNameLineIndex: schema.playerNameLineIndex,
  });
}

/**
 * @param {Uint8Array} prg
 * @param {object} schema
 * @param {Map<string, Uint8Array>} bins
 * @param {Map<string, object>} files
 */
function extractDemo(prg, schema, bins, files) {
  const table = (name) => {
    const entry = schema.offsets[name];
    const start = parseOffset(entry.prg);
    return Array.from(prg.subarray(start, start + entry.length));
  };
  const textFieldsPrg = parseOffset(schema.offsets.textFields.prg);
  const textLines = decodeDemoTextLines(prg, textFieldsPrg, schema.lineTextOffsets);
  const storyEntry = schema.offsets.storyTileAttrTransferBuf;
  const storyPrg = storyEntry ? parseOffset(storyEntry.prg) : STORY_TRANSFER_PRG;
  const titleEntry = schema.offsets.gameTitleTransferBuf;
  const titlePrg = titleEntry ? parseOffset(titleEntry.prg) : TITLE_TRANSFER_PRG;

  const commonBg = bins.get('common_background');
  const demoBg = bins.get('demo_background');
  if (commonBg && demoBg) {
    const titleNt = decodeTitleNametable(prg);
    const titleImg = renderTitleNametableRgba(titleNt.tiles, titleNt.attrs, commonBg, demoBg);
    putRgba(files, 'play/title.png', titleImg.width, titleImg.height, titleImg.rgba);
    const storyNt = decodeStoryNametable(prg);
    const storyImg = renderStoryNametableRgba(storyNt.tiles, storyNt.attrs, commonBg, demoBg);
    putRgba(files, 'play/story.png', storyImg.width, storyImg.height, storyImg.rgba);

    const pages = paginatePanels(PARAGRAPHS, { rowsPerPanel: BODY_ROWS.length });
    const panels = pages.map((lines, i) => (i === 0 && TITLE ? { title: TITLE, lines } : { lines }));
    const board = composeStoryboard(panels, { highlight: HIGHLIGHT });
    const prologue = renderDemoNametableRgba(
      board.tiles,
      board.attrs,
      commonBg,
      demoBg,
      STORY_BG_PALETTE_ROWS,
      { rows: board.rows },
    );
    putRgba(files, 'play/prologue.png', prologue.width, prologue.height, prologue.rgba);
  }

  putJson(files, 'play/demo.json', {
    generatedAt: new Date().toISOString(),
    lineAttrs: table('lineAttrs'),
    leftItemIds: table('leftItemIds'),
    rightItemIds: table('rightItemIds'),
    fadeDelays: table('fadeDelays'),
    fadePalettes: table('fadePalettes'),
    textFields: table('textFields'),
    lineTextAddrs: table('lineTextAddrs'),
    textLines,
    demoSpriteTileBase: schema.demoSpriteTileBase ?? 0x70,
    titlePng: 'play/title.png',
    storyPng: 'play/story.png',
    titleTransferPrg: titlePrg,
    storyTransferPrg: storyPrg,
  });
}

/**
 * @typedef {object} ExtractSchemas
 * @property {object} patternBlocks
 * @property {object} overworld
 * @property {object} dungeons
 * @property {object} caves
 * @property {object} audio
 * @property {object} ending
 * @property {object} demo
 */

/**
 * @param {Uint8Array|ArrayBuffer} romBytes
 * @param {ExtractSchemas} schemas
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function extractAssetPack(romBytes, schemas, opts = {}) {
  const note = opts.onProgress ?? (() => {});
  const bytes = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes);
  note('Reading ROM…');
  const rom = parseInes(bytes);
  assertZeldaShape(rom);
  const identity = prgIdentity(rom.prg);
  /** @type {Map<string, object>} */
  const files = new Map();

  note('Extracting graphics…');
  await yieldUi();
  const { bins } = await extractGraphics(rom.prg, schemas.patternBlocks, files);

  note('Extracting overworld…');
  await yieldUi();
  await extractOverworld(rom.prg, schemas.overworld, files);

  note('Extracting dungeons…');
  await yieldUi();
  extractDungeons(rom.prg, schemas.dungeons, files);

  note('Extracting caves, audio, ending…');
  await yieldUi();
  extractCaves(rom.prg, schemas.caves, files);
  putJson(files, 'audio/audio.json', buildAudioDoc(rom.prg, schemas.audio));
  extractEnding(rom.prg, schemas.ending, files);

  note('Extracting title and story…');
  await yieldUi();
  extractDemo(rom.prg, schemas.demo, bins, files);
  const crack = bombCrackRgba();
  putRgba(files, 'play/bomb_crack.png', crack.width, crack.height, crack.rgba);

  note('Assets ready.');
  return { identity, files };
}

function packJson(files, path) {
  const file = files.get(path);
  return file?.kind === 'json' ? file.data : null;
}

function patternBinsFromPack(files) {
  const bins = new Map();
  for (const [path, file] of files) {
    if (file.kind !== 'bytes' || !path.startsWith('graphics/') || !path.endsWith('.bin')) {
      continue;
    }
    bins.set(path.slice('graphics/'.length, -'.bin'.length), file.data);
  }
  return bins;
}

function owPaletteFromPack(files) {
  const palettes = packJson(files, 'graphics/palettes.json');
  const set = palettes?.paletteSets?.find((p) => p.id === 'overworld');
  if (!set) throw new Error('overworld palette set missing');
  return set;
}

function owTileSourcesFromPack(files) {
  const index = packJson(files, 'overworld/overworld_index.json');
  if (!index?.tileSources) throw new Error('overworld tileSources missing');
  return index.tileSources;
}

function materializeOwScreen(files, idHex, quest) {
  const hex = idHex.toLowerCase();
  const jsonPath = quest === 2 ? `play/q2/screens/${hex}.json` : `play/screens/${hex}.json`;
  const screen = packJson(files, jsonPath);
  if (!screen?.tileGrid) return null;
  const { width, height, rgba } = renderOwTileGridRgba(
    screen.tileGrid,
    screen.attrs,
    screen.secrets ?? [],
    owTileSourcesFromPack(files),
    patternBinsFromPack(files),
    owPaletteFromPack(files),
  );
  const outPath =
    quest === 2 ? `play/q2/screens/screen_${hex}.png` : `overworld/screens/screen_${hex}.png`;
  putRgba(files, outPath, width, height, rgba);
  return files.get(outPath);
}

function materializeOwStitched(files) {
  const index = packJson(files, 'overworld/overworld_index.json');
  if (!index?.screens) return null;
  const screenW = index.screen.widthPixels;
  const screenH = index.screen.heightPixels;
  const worldW = index.map.widthScreens * screenW;
  const worldH = index.map.heightScreens * screenH;
  const worldRgba = new Uint8Array(worldW * worldH * 4);
  for (const s of index.screens) {
    const file = materializeOwScreen(files, hexPad(s.mapIndex), 1);
    if (!file) continue;
    const baseX = s.col * screenW;
    const baseY = s.row * screenH;
    for (let y = 0; y < file.height; y += 1) {
      for (let x = 0; x < file.width; x += 1) {
        const src = (y * file.width + x) * 4;
        const dst = ((baseY + y) * worldW + (baseX + x)) * 4;
        worldRgba[dst] = file.rgba[src];
        worldRgba[dst + 1] = file.rgba[src + 1];
        worldRgba[dst + 2] = file.rgba[src + 2];
        worldRgba[dst + 3] = 255;
      }
    }
  }
  putRgba(files, 'overworld/overworld_stitched.png', worldW, worldH, worldRgba);
  return files.get('overworld/overworld_stitched.png');
}

/**
 * Raster pack images that were deferred (OW screens, stitched map) on first
 * fetch. Returns the file, or null if this path is not in the pack.
 *
 * @param {Map<string, object>} files
 * @param {string} path
 */
export function materializePackFile(files, path) {
  const rel = path.replace(/^\//, '');
  const existing = files.get(rel);
  if (existing) return existing;

  const owScreen = /^overworld\/screens\/screen_([0-9a-f]{2})\.png$/i.exec(rel);
  if (owScreen) return materializeOwScreen(files, owScreen[1], 1);

  const q2Screen = /^play\/q2\/screens\/screen_([0-9a-f]{2})\.png$/i.exec(rel);
  if (q2Screen) return materializeOwScreen(files, q2Screen[1], 2);

  if (rel === 'overworld/overworld_stitched.png') return materializeOwStitched(files);

  return null;
}
