import { Application, Assets, Container, Graphics, Sprite } from 'pixi.js';

const stageEl = document.getElementById('stage');
const statusEl = document.getElementById('status');
const infoPre = document.getElementById('infoPre');
const screenInput = document.getElementById('screenInput');
const gotoStart = document.getElementById('gotoStart');
const gotoL1 = document.getElementById('gotoL1');

const SCALE = 1;
const HIGHLIGHT_COLORS = [0x6bcf7f, 0xff3b3b]; // green, red
const HIGHLIGHT_INTERVAL_MS = 400;

/** @type {import('pixi.js').Application | null} */
let app = null;
/** @type {Container | null} */
let world = null;
/** @type {Graphics | null} */
let highlight = null;
let index = null;
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

function screenByIndex(mapIndex) {
  return index.screens.find((s) => s.mapIndex === mapIndex);
}

function formatInfo(screen) {
  if (!screen) {
    return '—';
  }
  const a = screen.attrs;
  const cave =
    a.caveId === 0
      ? 'none'
      : a.caveId >= 1 && a.caveId <= 9
        ? `Level ${a.caveId}`
        : `cave/type $${a.caveId.toString(16)}`;
  return [
    `mapIndex: $${screen.mapIndex.toString(16).padStart(2, '0')}  (row ${screen.row}, col ${screen.col})`,
    `layoutId: ${screen.layoutId}`,
    `monsterGroups: ${screen.useMonsterGroups}`,
    '',
    `outerPalette: ${a.outerPalette}`,
    `innerPalette: ${a.innerPalette}`,
    `cave/underground: ${cave}`,
    `zora: ${a.zora}  wave: ${a.wave}`,
    `exitX nibble: ${a.exitX}  exitY: ${a.exitY}`,
    `monsterId: $${a.monsterId.toString(16)}  countIdx: ${a.monsterCountIndex}`,
    `stairPos: ${a.stairPositionIndex}`,
    `ignoreSecret Q1/Q2: ${a.ignoreSecretQ1}/${a.ignoreSecretQ2}`,
    '',
    'Click another screen on the map to inspect.',
  ].join('\n');
}

function drawHighlight(color) {
  const screen = screenByIndex(selected);
  if (!screen || !highlight) {
    return;
  }
  const { widthPixels, heightPixels } = index.screen;
  highlight.clear();
  highlight.rect(screen.col * widthPixels, screen.row * heightPixels, widthPixels, heightPixels);
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

function selectScreen(mapIndex) {
  const screen = screenByIndex(mapIndex);
  if (!screen || !highlight) {
    return;
  }
  selected = mapIndex;
  screenInput.value = mapIndex.toString(16).padStart(2, '0');
  infoPre.textContent = formatInfo(screen);
  startHighlightPulse();
  setStatus(
    `$${mapIndex.toString(16).padStart(2, '0')} · layout ${screen.layoutId} · ${
      screen.attrs.caveId >= 1 && screen.attrs.caveId <= 9
        ? `Level ${screen.attrs.caveId}`
        : 'overworld'
    }`,
  );
}

async function init() {
  try {
    index = await fetchJson('/overworld/overworld_index.json');

    app = new Application();
    const worldW = index.map.widthScreens * index.screen.widthPixels;
    const worldH = index.map.heightScreens * index.screen.heightPixels;
    await app.init({
      background: '#000000',
      width: worldW * SCALE,
      height: worldH * SCALE,
      antialias: false,
      resolution: 1,
      autoDensity: true,
      preference: 'webgl',
    });
    stageEl.appendChild(app.canvas);

    world = new Container();
    world.scale.set(SCALE);
    app.stage.addChild(world);

    setStatus('Loading map texture…');
    const texture = await Assets.load('/overworld/overworld_stitched.png');
    if (!texture?.width) {
      throw new Error('Map texture loaded empty — try hard-refreshing');
    }
    texture.source.scaleMode = 'nearest';
    const mapSprite = new Sprite(texture);
    world.addChild(mapSprite);

    highlight = new Graphics();
    world.addChild(highlight);

    app.canvas.addEventListener('click', (event) => {
      const rect = app.canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * worldW;
      const y = ((event.clientY - rect.top) / rect.height) * worldH;
      const col = Math.min(
        index.map.widthScreens - 1,
        Math.max(0, Math.floor(x / index.screen.widthPixels)),
      );
      const row = Math.min(
        index.map.heightScreens - 1,
        Math.max(0, Math.floor(y / index.screen.heightPixels)),
      );
      selectScreen((row << 4) | col);
    });

    screenInput.addEventListener('change', () => {
      const value = Number.parseInt(screenInput.value, 16);
      if (Number.isInteger(value) && value >= 0 && value < 128) {
        selectScreen(value);
      }
    });

    gotoStart.addEventListener('click', () => selectScreen(index.startScreen));
    gotoL1.addEventListener('click', () => {
      const level1 = index.screens.find((s) => s.attrs.caveId === 1);
      if (level1) {
        selectScreen(level1.mapIndex);
      }
    });

    selectScreen(index.startScreen);
  } catch (err) {
    setStatus(err.message || 'Failed to load map viewer');
    console.error(err);
  }
}

void init();
