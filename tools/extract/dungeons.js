import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import {
  UW_MAP_H,
  UW_MAP_W,
  UW_SQUARES_H,
  UW_SQUARES_W,
  buildLevel,
  loadDungeonTables,
} from '../shared/dungeons.js';
import { PLAY_COLS, PLAY_ROWS } from '../shared/dungeonRoomLayout.js';
import { UW_TILE_SOURCES, renderDungeonRoomRgba } from '../shared/dungeonRoomRender.js';
import { encodePngRgba } from '../shared/png.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';
import { GRAPHICS_DIR } from './graphics.js';

export const DUNGEONS_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'dungeons.json');
export const DUNGEONS_DIR = path.join(EXTRACTED_DIR, 'dungeons');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadPatternBins() {
  const manifestPath = path.join(GRAPHICS_DIR, 'graphics_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Missing graphics extract. Run: npm run extract -- graphics');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  /** @type {Map<string, Buffer>} */
  const bins = new Map();
  for (const sheet of manifest.sheets) {
    bins.set(sheet.id, fs.readFileSync(path.join(GRAPHICS_DIR, sheet.bin)));
  }
  return bins;
}

function loadLevelPalette(levelNumber) {
  const palettesPath = path.join(GRAPHICS_DIR, 'palettes.json');
  if (!fs.existsSync(palettesPath)) {
    throw new Error('Missing palettes.json. Run: npm run extract -- graphics');
  }
  const data = JSON.parse(fs.readFileSync(palettesPath, 'utf8'));
  const set = data.paletteSets.find((p) => p.id === `level_${levelNumber}`);
  if (!set) {
    throw new Error(`Missing palette set level_${levelNumber}`);
  }
  return set;
}

function renderRoomRgba(room, tables, patternBins, paletteSet) {
  // Full play area with FillWalls + LayOutDoors + floor (open doors as open faces).
  return renderDungeonRoomRgba(room, {
    paletteSet,
    tileSources: tables.tileSources ?? UW_TILE_SOURCES,
    patternBins,
    primarySquares: tables.primarySquares,
  });
}

function roomSummary(room) {
  return {
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
  };
}

/**
 * @param {object} opts
 */
export function cmdDungeons({
  romPath = DEFAULT_ROM_PATH,
  schemaPath = DUNGEONS_SCHEMA_PATH,
  outDir = DUNGEONS_DIR,
} = {}) {
  const rom = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = loadDungeonTables(rom.prg, schema);
  const patternBins = loadPatternBins();

  ensureDir(outDir);

  const indexLevels = [];

  for (const quest of [1, 2]) {
    for (let levelNumber = 1; levelNumber <= 9; levelNumber += 1) {
      const level = buildLevel(tables, levelNumber, quest);
      const paletteSet = loadLevelPalette(levelNumber);
      const levelDir = path.join(outDir, `q${quest}`, `level_${levelNumber}`);
      ensureDir(levelDir);
      ensureDir(path.join(levelDir, 'rooms'));

      const roomW = PLAY_COLS * 8; // full play area incl. walls/doors
      const roomH = PLAY_ROWS * 8;
      const stitchW = UW_MAP_W * roomW;
      const stitchH = UW_MAP_H * roomH;
      const stitchRgba = new Uint8Array(stitchW * stitchH * 4);

      for (const room of level.rooms) {
        const { width, height, rgba } = renderRoomRgba(room, tables, patternBins, paletteSet);
        const name = `room_${room.roomId.toString(16).padStart(2, '0')}.png`;
        fs.writeFileSync(path.join(levelDir, 'rooms', name), encodePngRgba(width, height, rgba));

        const baseX = room.col * roomW;
        const baseY = room.row * roomH;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const src = (y * width + x) * 4;
            const dst = ((baseY + y) * stitchW + (baseX + x)) * 4;
            stitchRgba[dst] = rgba[src];
            stitchRgba[dst + 1] = rgba[src + 1];
            stitchRgba[dst + 2] = rgba[src + 2];
            stitchRgba[dst + 3] = 255;
          }
        }
      }

      const stitchedName = 'level_stitched.png';
      fs.writeFileSync(path.join(levelDir, stitchedName), encodePngRgba(stitchW, stitchH, stitchRgba));

      const levelJson = {
        generatedAt: new Date().toISOString(),
        romPath,
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
        stitched: stitchedName,
        rooms: level.rooms.map((room) => ({
          ...roomSummary(room),
          image: `rooms/room_${room.roomId.toString(16).padStart(2, '0')}.png`,
        })),
      };

      fs.writeFileSync(path.join(levelDir, 'level.json'), `${JSON.stringify(levelJson)}\n`);

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

      console.log(
        `  Q${quest} L${levelNumber}: ${level.rooms.length} rooms · start $${level.startRoom.toString(16)} · boss $${level.bossRoom.toString(16)} · triforce $${level.triforceRoom.toString(16)}`,
      );
    }
  }

  const index = {
    generatedAt: new Date().toISOString(),
    romPath,
    layoutCount: tables.layoutCount,
    levels: indexLevels,
  };
  fs.writeFileSync(path.join(outDir, 'dungeons_index.json'), `${JSON.stringify(index)}\n`);

  console.log(`Dungeons: ${indexLevels.length} level packs → ${outDir}`);
  return index;
}
