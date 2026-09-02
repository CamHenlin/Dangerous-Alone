import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { initPixiApp } from '@shared/pixiBoot.js';
import { UW_TILE_SOURCES, renderDungeonRoomRgba } from '@shared/dungeonRoomRender.js';

const stageEl = document.getElementById('stage');
const statusEl = document.getElementById('status');
const infoPre = document.getElementById('infoPre');
const questSelect = document.getElementById('questSelect');
const levelSelect = document.getElementById('levelSelect');
const roomInput = document.getElementById('roomInput');
const gotoStart = document.getElementById('gotoStart');
const gotoBoss = document.getElementById('gotoBoss');
const gotoTriforce = document.getElementById('gotoTriforce');

const SCALE = 1;
const HIGHLIGHT_COLORS = [0x6bcf7f, 0xff3b3b];
const HIGHLIGHT_INTERVAL_MS = 400;

/** @type {import('pixi.js').Application | null} */
let app = null;
/** @type {Container | null} */
let world = null;
/** @type {Graphics | null} */
let highlight = null;
/** @type {Sprite | null} */
let mapSprite = null;
let index = null;
let level = null;
let selected = 0;
let highlightColorIndex = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let highlightTimer = null;

function setStatus(text) {
  statusEl.textContent = text;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: ${res.status}`);
  }
  return res.json();
}

function roomById(roomId) {
  return level?.rooms.find((r) => r.roomId === roomId) ?? null;
}

function formatInfo(room) {
  if (!room || !level) {
    return '—';
  }
  const d = room.doors;
  const role = [];
  if (room.roomId === level.startRoom) role.push('START');
  if (room.roomId === level.bossRoom) role.push('BOSS');
  if (room.roomId === level.triforceRoom) role.push('TRIFORCE');
  if (level.cellarRooms.includes(room.roomId)) role.push('CELLAR');
  return [
    `Q${level.quest} Level ${level.level}${role.length ? ` · ${role.join(' / ')}` : ''}`,
    `roomId: $${room.roomId.toString(16).padStart(2, '0')}  (row ${room.row}, col ${room.col})`,
    `layoutId: ${room.layoutId}`,
    `pushable: ${room.pushable}  monsterGroups: ${room.useMonsterGroups}`,
    '',
    `doors N:${d.north.type}(${d.north.code}) S:${d.south.type}(${d.south.code})`,
    `      W:${d.west.type}(${d.west.code}) E:${d.east.type}(${d.east.code})`,
    `outerPalette: ${d.outerPalette}  innerPalette: ${d.innerPalette}`,
    '',
    `monster id: $${room.monster.id.toString(16)}  countIdx: ${room.monster.countIndex}`,
    `floorItem: $${room.floorItem.itemType.toString(16)} dark=${room.floorItem.dark} bossNoise=${room.floorItem.bossNoise}`,
    `special: pos=${room.specialItem.positionIndex} effect=${room.specialItem.effectType}`,
    '',
    'Click another room on the map to inspect.',
  ].join('\n');
}

function drawHighlight(color) {
  const room = roomById(selected);
  if (!room || !highlight || !level) {
    return;
  }
  const { widthPixels, heightPixels } = level.room;
  highlight.clear();
  highlight.rect(room.col * widthPixels, room.row * heightPixels, widthPixels, heightPixels);
  highlight.stroke({ width: 3, color });
}

function startHighlightPulse() {
  if (highlightTimer) {
    clearInterval(highlightTimer);
  }
  highlightColorIndex = 0;
  drawHighlight(HIGHLIGHT_COLORS[highlightColorIndex]);
  highlightTimer = setInterval(() => {
    highlightColorIndex = (highlightColorIndex + 1) % HIGHLIGHT_COLORS.length;
    drawHighlight(HIGHLIGHT_COLORS[highlightColorIndex]);
  }, HIGHLIGHT_INTERVAL_MS);
}

function selectRoom(roomId) {
  const room = roomById(roomId);
  if (!room || !highlight) {
    return;
  }
  selected = roomId;
  roomInput.value = roomId.toString(16).padStart(2, '0');
  infoPre.textContent = formatInfo(room);
  startHighlightPulse();
  setStatus(`$${roomId.toString(16).padStart(2, '0')} · layout ${room.layoutId}`);
}

function fillLevelSelect() {
  const quest = Number(questSelect.value);
  const levels = index.levels.filter((l) => l.quest === quest);
  levelSelect.innerHTML = '';
  for (const entry of levels) {
    const opt = document.createElement('option');
    opt.value = String(entry.level);
    opt.textContent = String(entry.level);
    levelSelect.appendChild(opt);
  }
}

async function stitchLevelTexture(level) {
  const palettes = await fetchJson('/graphics/palettes.json');
  const paletteSet =
    palettes.paletteSets?.find((p) => p.id === `level_${level.level}`)
    ?? palettes.paletteSets?.find((p) => p.id === 'overworld');
  /** @type {Map<string, Uint8Array>} */
  const bins = new Map();
  for (const id of ['common_background', 'underworld_bg', 'common_misc']) {
    const res = await fetch(`/graphics/${id}.bin`);
    if (!res.ok) throw new Error(`Missing ${id}.bin`);
    bins.set(id, new Uint8Array(await res.arrayBuffer()));
  }
  const primary = index.primarySquares ?? [0xb0, 0x74, 0x94, 0xb4, 0x70, 0x68, 0xf4, 0x24];
  const tileSources = index.tileSources ?? UW_TILE_SOURCES;
  const roomW = level.room.widthPixels;
  const roomH = level.room.heightPixels;
  const canvas = document.createElement('canvas');
  canvas.width = level.map.widthRooms * roomW;
  canvas.height = level.map.heightRooms * roomH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  for (const room of level.rooms) {
    const { width, height, rgba } = renderDungeonRoomRgba(room, {
      paletteSet,
      tileSources,
      patternBins: bins,
      primarySquares: primary,
    });
    const img = new ImageData(
      new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
      width,
      height,
    );
    ctx.putImageData(img, room.col * roomW, room.row * roomH);
  }
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

async function loadLevel(quest, levelNumber) {
  setStatus(`Loading Q${quest} L${levelNumber}…`);
  const meta = index.levels.find((l) => l.quest === quest && l.level === levelNumber);
  if (!meta) {
    throw new Error(`Missing index entry Q${quest} L${levelNumber}`);
  }
  level = await fetchJson(`/dungeons/${meta.path}/level.json`);

  if (!app) {
    app = new Application();
    await initPixiApp(
      app,
      {
        background: '#000000',
        width: 16,
        height: 16,
        antialias: false,
        resolution: 1,
        autoDensity: true,
      },
      { host: stageEl },
    );
    if (app.canvas.parentNode !== stageEl) stageEl.appendChild(app.canvas);
    world = new Container();
    world.scale.set(SCALE);
    app.stage.addChild(world);
    highlight = new Graphics();
  }

  const worldW = level.map.widthRooms * level.room.widthPixels;
  const worldH = level.map.heightRooms * level.room.heightPixels;
  app.renderer.resize(worldW * SCALE, worldH * SCALE);

  if (mapSprite) {
    world.removeChild(mapSprite);
    mapSprite.destroy();
    mapSprite = null;
  }

  let texture;
  try {
    texture = await Assets.load(`/dungeons/${meta.path}/${level.stitched}`);
    if (!texture?.width) throw new Error('empty stitched png');
    texture.source.scaleMode = 'nearest';
  } catch {
    texture = await stitchLevelTexture(level);
  }
  mapSprite = new Sprite(texture);
  world.addChildAt(mapSprite, 0);
  world.addChild(highlight);

  app.canvas.onclick = (event) => {
    const rect = app.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * worldW;
    const y = ((event.clientY - rect.top) / rect.height) * worldH;
    const col = Math.min(
      level.map.widthRooms - 1,
      Math.max(0, Math.floor(x / level.room.widthPixels)),
    );
    const row = Math.min(
      level.map.heightRooms - 1,
      Math.max(0, Math.floor(y / level.room.heightPixels)),
    );
    const roomId = (row << 4) | col;
    if (roomById(roomId)) {
      selectRoom(roomId);
    }
  };

  selectRoom(level.startRoom);
}

async function init() {
  try {
    const { bootRomAssets } = await import('./romGate.js');
    await bootRomAssets({ onStatus: setStatus });
    index = await fetchJson('/dungeons/dungeons_index.json');
    fillLevelSelect();
    levelSelect.value = '1';

    questSelect.addEventListener('change', async () => {
      fillLevelSelect();
      await loadLevel(Number(questSelect.value), Number(levelSelect.value));
    });
    levelSelect.addEventListener('change', async () => {
      await loadLevel(Number(questSelect.value), Number(levelSelect.value));
    });
    roomInput.addEventListener('change', () => {
      const value = Number.parseInt(roomInput.value, 16);
      if (Number.isInteger(value) && roomById(value)) {
        selectRoom(value);
      }
    });
    gotoStart.addEventListener('click', () => selectRoom(level.startRoom));
    gotoBoss.addEventListener('click', () => selectRoom(level.bossRoom));
    gotoTriforce.addEventListener('click', () => selectRoom(level.triforceRoom));

    await loadLevel(1, 1);
  } catch (err) {
    setStatus(err.message || 'Failed to load dungeon viewer');
    console.error(err);
  }
}

void init();
