import fs from 'node:fs';
import path from 'node:path';
import { loadValidatedRom } from './commands.js';
import {
  MAP_H,
  MAP_W,
  SQUARES_H,
  SQUARES_W,
  decodeAllScreens,
  decodeScreen,
  loadOverworldTables,
  paletteRowForSquare,
  screenToTileGrid,
  screenSecrets,
  squareToTiles,
} from '../shared/overworld.js';
import {
  Q2_LAYOUT_ROOMS,
  applyQuest2OverworldPatch,
  cloneOverworldTables,
} from '../shared/quest2OwPatch.js';
import {
  HUD_HEIGHT,
  OW_BOUNDS,
  OW_FIRST_UNWALKABLE,
  OW_WALKABLE_REMAP,
} from '../shared/collision.js';
import { decodeBgTile } from '../shared/tileChr.js';
import { nesColor, rgbaFromNesIndices } from '../shared/nesPalette.js';
import { encodePngRgba } from '../shared/png.js';
import { DEFAULT_ROM_PATH, EXTRACTED_DIR, ROOT } from '../shared/paths.js';
import { GRAPHICS_DIR } from './graphics.js';

export const OVERWORLD_SCHEMA_PATH = path.join(ROOT, 'assets', 'schema', 'overworld.json');
export const OVERWORLD_DIR = path.join(EXTRACTED_DIR, 'overworld');
export const PLAY_DIR = path.join(EXTRACTED_DIR, 'play');

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

function loadOverworldPalettes() {
  const palettesPath = path.join(GRAPHICS_DIR, 'palettes.json');
  if (!fs.existsSync(palettesPath)) {
    throw new Error('Missing palettes.json. Run: npm run extract -- graphics');
  }
  const data = JSON.parse(fs.readFileSync(palettesPath, 'utf8'));
  const ow = data.paletteSets.find((p) => p.id === 'overworld');
  if (!ow) {
    throw new Error('overworld palette set missing');
  }
  return ow;
}

function renderScreenRgba(screen, tables, patternBins, paletteSet) {
  const tileGrid = screenToTileGrid(screen, tables);
  const width = SQUARES_W * 2 * 8;
  const height = SQUARES_H * 2 * 8;
  const rgba = new Uint8Array(width * height * 4);

  for (let tr = 0; tr < SQUARES_H * 2; tr += 1) {
    for (let tc = 0; tc < SQUARES_W * 2; tc += 1) {
      const squareRow = Math.floor(tr / 2);
      const squareCol = Math.floor(tc / 2);
      const palRow = paletteRowForSquare(
        squareRow,
        squareCol,
        screen.attrs.outerPalette,
        screen.attrs.innerPalette,
      );
      const colors = rgbaFromNesIndices(paletteSet.rows[palRow]);
      const [br, bg, bb] = nesColor(paletteSet.rows[palRow][0]);
      colors[0] = { r: br, g: bg, b: bb, a: 255 };

      const indices = decodeBgTile(tileGrid[tr][tc], tables.tileSources, patternBins);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const c = colors[indices[y * 8 + x] & 3];
          const px = ((tr * 8 + y) * width + (tc * 8 + x)) * 4;
          rgba[px] = c.r;
          rgba[px + 1] = c.g;
          rgba[px + 2] = c.b;
          rgba[px + 3] = 255;
        }
      }
    }
  }

  return { width, height, rgba };
}

/**
 * @param {object} opts
 */
export function cmdOverworld({
  romPath = DEFAULT_ROM_PATH,
  schemaPath = OVERWORLD_SCHEMA_PATH,
  outDir = OVERWORLD_DIR,
} = {}) {
  const rom = loadValidatedRom(romPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = loadOverworldTables(rom.prg, schema);
  const screens = decodeAllScreens(tables);
  const patternBins = loadPatternBins();
  const paletteSet = loadOverworldPalettes();

  ensureDir(outDir);
  ensureDir(path.join(outDir, 'screens'));

  const screenSummaries = screens.map((screen) => ({
    mapIndex: screen.mapIndex,
    row: screen.row,
    col: screen.col,
    layoutId: screen.layoutId,
    useMonsterGroups: screen.useMonsterGroups,
    attrs: screen.attrs,
    squares: screen.squares,
  }));

  const overworldJson = {
    generatedAt: new Date().toISOString(),
    romPath,
    startScreen: tables.startScreen,
    startY: tables.startY,
    map: { widthScreens: MAP_W, heightScreens: MAP_H },
    screen: {
      widthSquares: SQUARES_W,
      heightSquares: SQUARES_H,
      widthTiles: SQUARES_W * 2,
      heightTiles: SQUARES_H * 2,
      widthPixels: SQUARES_W * 16,
      heightPixels: SQUARES_H * 16,
    },
    screens: screenSummaries,
  };

  const jsonPath = path.join(outDir, 'overworld.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(overworldJson)}\n`);

  // Per-screen PNGs + stitched world map
  const screenW = SQUARES_W * 16;
  const screenH = SQUARES_H * 16;
  const worldW = MAP_W * screenW;
  const worldH = MAP_H * screenH;
  const worldRgba = new Uint8Array(worldW * worldH * 4);

  for (const screen of screens) {
    const { width, height, rgba } = renderScreenRgba(
      screen,
      tables,
      patternBins,
      paletteSet,
    );
    const png = encodePngRgba(width, height, rgba);
    fs.writeFileSync(
      path.join(outDir, 'screens', `screen_${screen.mapIndex.toString(16).padStart(2, '0')}.png`),
      png,
    );

    const baseX = screen.col * screenW;
    const baseY = screen.row * screenH;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const src = (y * width + x) * 4;
        const dst = ((baseY + y) * worldW + (baseX + x)) * 4;
        worldRgba[dst] = rgba[src];
        worldRgba[dst + 1] = rgba[src + 1];
        worldRgba[dst + 2] = rgba[src + 2];
        worldRgba[dst + 3] = 255;
      }
    }
  }

  const stitchedPath = path.join(outDir, 'overworld_stitched.png');
  fs.writeFileSync(stitchedPath, encodePngRgba(worldW, worldH, worldRgba));

  // Compact index for the viewer (without full tile grids — those are large)
  const viewerIndex = {
    generatedAt: overworldJson.generatedAt,
    startScreen: tables.startScreen,
    startY: tables.startY,
    map: overworldJson.map,
    screen: overworldJson.screen,
    stitched: 'overworld_stitched.png',
    screens: screens.map((s) => ({
      mapIndex: s.mapIndex,
      row: s.row,
      col: s.col,
      layoutId: s.layoutId,
      useMonsterGroups: s.useMonsterGroups,
      attrs: s.attrs,
      squares: s.squares,
      image: `screens/screen_${s.mapIndex.toString(16).padStart(2, '0')}.png`,
    })),
  };
  fs.writeFileSync(
    path.join(outDir, 'overworld_index.json'),
    `${JSON.stringify(viewerIndex)}\n`,
  );

  const level1 = screens.find((s) => s.attrs.caveId === 1);
  const start = screens[tables.startScreen];
  console.log(
    `Overworld: ${screens.length} screens → ${outDir}`,
  );
  console.log(
    `  start screen $${tables.startScreen.toString(16)} layout=${start.layoutId} cave=${start.attrs.caveId}`,
  );
  if (level1) {
    console.log(
      `  Level 1 entrance screen $${level1.mapIndex.toString(16)} (r${level1.row},c${level1.col}) layout=${level1.layoutId}`,
    );
  }
  console.log(`  stitched ${worldW}×${worldH} → ${stitchedPath}`);

  // Sanity: ensure square→tile expansion works on start screen center
  const sample = squareToTiles(
    start.squares[5][7],
    tables.primarySquares,
    tables.secondarySquares,
    tables.secretsTable,
  );
  console.log(`  sample start center tiles: ${sample.map((t) => `$${t.toString(16)}`).join(', ')}`);

  writePlayWorld({ tables, screens, start, outDir });
  writeQuest2PlayOverlays({ tables, patternBins, paletteSet });

  return viewerIndex;
}

/**
 * Play packs: start screen + per-screen tile grids for world traversal.
 */
function writePlayWorld({ tables, screens, start, outDir }) {
  ensureDir(PLAY_DIR);
  const screensDir = path.join(PLAY_DIR, 'screens');
  ensureDir(screensDir);

  const startTileGrid = screenToTileGrid(start, tables);
  const startPack = {
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
    screenImage: `../overworld/screens/screen_${tables.startScreen.toString(16).padStart(2, '0')}.png`,
    spritesSheet: '../graphics/common_sprites.png',
    tileGrid: startTileGrid,
    squares: start.squares,
    secrets: screenSecrets(start, tables, 1),
    attrs: start.attrs,
    layoutId: start.layoutId,
  };
  fs.writeFileSync(path.join(PLAY_DIR, 'start_screen.json'), `${JSON.stringify(startPack)}\n`);

  const indexScreens = [];
  for (const screen of screens) {
    const tileGrid = screen.mapIndex === start.mapIndex
      ? startTileGrid
      : screenToTileGrid(screen, tables);
    const idHex = screen.mapIndex.toString(16).padStart(2, '0');
    const file = `screens/${idHex}.json`;
    fs.writeFileSync(
      path.join(PLAY_DIR, file),
      `${JSON.stringify({
        mapIndex: screen.mapIndex,
        row: screen.row,
        col: screen.col,
        layoutId: screen.layoutId,
        attrs: screen.attrs,
        tileGrid,
        secrets: screenSecrets(screen, tables, 1),
        image: `../overworld/screens/screen_${idHex}.png`,
      })}\n`,
    );
    indexScreens.push({
      mapIndex: screen.mapIndex,
      row: screen.row,
      col: screen.col,
      caveId: screen.attrs.caveId,
      // Which quests actually open this cave — the same cave id appears on
      // screens the current quest never reveals (level 5 claims $0B and $1B).
      // Phase 19 map marks need this to pick the reachable entrance.
      ignoreSecretQ1: screen.attrs.ignoreSecretQ1,
      ignoreSecretQ2: screen.attrs.ignoreSecretQ2,
      file,
      image: `../overworld/screens/screen_${idHex}.png`,
    });
  }

  const worldIndex = {
    generatedAt: new Date().toISOString(),
    startScreen: tables.startScreen,
    startX: 0x78,
    startY: tables.startY,
    startDir: 0x08,
    map: { widthScreens: MAP_W, heightScreens: MAP_H },
    level1Screen: 0x37,
    screens: indexScreens,
  };
  fs.writeFileSync(path.join(PLAY_DIR, 'world_index.json'), `${JSON.stringify(worldIndex)}\n`);
  console.log(`  play pack → ${PLAY_DIR} (${indexScreens.length} screens)`);
}

/**
 * Quest 2 layout-swapped screens ($0B/$3C/$74) as play overlays + PNG.
 * Cave remaps for other rooms are applied at runtime via quest2OwPatch.js.
 */
function writeQuest2PlayOverlays({ tables, patternBins, paletteSet }) {
  const q2Tables = applyQuest2OverworldPatch(cloneOverworldTables(tables));
  const q2Dir = path.join(PLAY_DIR, 'q2', 'screens');
  ensureDir(q2Dir);

  for (const mapIndex of Q2_LAYOUT_ROOMS) {
    const screen = decodeScreen(q2Tables, mapIndex);
    const tileGrid = screenToTileGrid(screen, q2Tables);
    const idHex = mapIndex.toString(16).padStart(2, '0');
    const pack = {
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
    };
    fs.writeFileSync(path.join(q2Dir, `${idHex}.json`), `${JSON.stringify(pack)}\n`);

    // Render a simple PNG for the play view (same path as Q1 screen art).
    try {
      const { width, height, rgba } = renderScreenRgba(screen, q2Tables, patternBins, paletteSet);
      fs.writeFileSync(path.join(q2Dir, `screen_${idHex}.png`), encodePngRgba(width, height, rgba));
    } catch (err) {
      console.warn(`  Q2 screen $${idHex} PNG skipped: ${err.message}`);
    }
  }
  console.log(`  Q2 OW overlays → ${q2Dir} (${Q2_LAYOUT_ROOMS.length} layout rooms)`);
}
