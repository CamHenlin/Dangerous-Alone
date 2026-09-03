import { Application, Sprite, Texture } from 'pixi.js';
import { decodePatternBlock, renderTilesRgba } from '@shared/nes2bpp.js';
import { GREY_PREVIEW, rgbaFromNesIndices } from '@shared/nesPalette.js';
import { initPixiApp } from '@shared/pixiBoot.js';

const sheetSelect = document.getElementById('sheetSelect');
const paletteSelect = document.getElementById('paletteSelect');
const rowSelect = document.getElementById('rowSelect');
const greyToggle = document.getElementById('greyToggle');
const statusEl = document.getElementById('status');
const stageEl = document.getElementById('stage');
const swatchesEl = document.getElementById('swatches');

const SCALE = 3;

/** @type {import('pixi.js').Application | null} */
let app = null;
/** @type {Sprite | null} */
let sprite = null;
let manifest = null;
let palettes = null;
/** @type {Map<string, Uint8Array>} */
const binCache = new Map();

function setStatus(text) {
  statusEl.textContent = text;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return res.json();
}

async function fetchBin(url) {
  if (binCache.has(url)) {
    return binCache.get(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  binCache.set(url, bytes);
  return bytes;
}

function fillSheetSelect() {
  sheetSelect.innerHTML = '';
  for (const sheet of manifest.sheets) {
    const opt = document.createElement('option');
    opt.value = sheet.id;
    opt.textContent = `${sheet.id} (${sheet.tileCount} tiles)`;
    sheetSelect.appendChild(opt);
  }
  const preferred = manifest.sheets.find((s) => s.id === 'overworld_bg')
    ?? manifest.sheets.find((s) => s.id === 'common_sprites')
    ?? manifest.sheets[0];
  if (preferred) {
    sheetSelect.value = preferred.id;
  }
}

function fillPaletteSelect() {
  paletteSelect.innerHTML = '';
  for (const set of palettes.paletteSets) {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = set.id;
    paletteSelect.appendChild(opt);
  }
  paletteSelect.value = 'overworld';
}

function fillRowSelect(kind) {
  rowSelect.innerHTML = '';
  for (let i = 0; i < 8; i += 1) {
    const opt = document.createElement('option');
    opt.value = String(i);
    const label = i < 4 ? `BG ${i}` : `Sprite ${i - 4}`;
    opt.textContent = `Row ${i} (${label})`;
    rowSelect.appendChild(opt);
  }
  rowSelect.value = kind === 'sprites' ? '4' : '1';
}

function currentSheet() {
  return manifest.sheets.find((s) => s.id === sheetSelect.value);
}

function currentPaletteSet() {
  return palettes.paletteSets.find((p) => p.id === paletteSelect.value);
}

function buildPalette(sheet, paletteSet, rowIndex, grey) {
  if (grey) {
    return GREY_PREVIEW.map(([r, g, b], i) => ({
      r,
      g,
      b,
      a: sheet.kind === 'background' && i === 0 ? 255 : i === 0 ? 0 : 255,
    }));
  }
  const row = paletteSet.rows[rowIndex] ?? [0x0f, 0x00, 0x10, 0x30];
  const colors = rgbaFromNesIndices(row);
  if (sheet.kind === 'background') {
    colors[0] = { r: 0, g: 0, b: 0, a: 255 };
  }
  return colors;
}

function renderSwatches(paletteSet, activeRow) {
  swatchesEl.innerHTML = '<h2>Palettes</h2>';
  paletteSet.rows.forEach((row, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'swatch-row';
    wrap.title = `Row ${index}`;
    row.forEach((nesIndex, colorIndex) => {
      const cell = document.createElement('div');
      cell.className = 'swatch';
      if (index === activeRow) {
        cell.classList.add('active-row');
      }
      const [r, g, b] = paletteSet.rowsRgb[index][colorIndex];
      cell.style.background = colorIndex === 0 && index >= 4
        ? `repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 8px 8px`
        : `rgb(${r}, ${g}, ${b})`;
      cell.title = `$${nesIndex.toString(16).padStart(2, '0')}`;
      wrap.appendChild(cell);
    });
    wrap.addEventListener('click', () => {
      rowSelect.value = String(index);
      void redraw();
    });
    swatchesEl.appendChild(wrap);
  });
}

function rgbaToTexture(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  return Texture.from(canvas);
}

async function redraw() {
  const sheet = currentSheet();
  const paletteSet = currentPaletteSet();
  if (!sheet || !paletteSet || !app) {
    return;
  }

  const rowIndex = Number(rowSelect.value);
  const bytes = await fetchBin(`/graphics/${sheet.bin}`);
  const tiles = decodePatternBlock(bytes);
  const palette = buildPalette(sheet, paletteSet, rowIndex, greyToggle.checked);
  const { width, height, rgba } = renderTilesRgba(tiles, palette, 16);
  const texture = rgbaToTexture(width, height, rgba);

  if (sprite) {
    sprite.destroy(true);
    sprite = null;
  }

  sprite = new Sprite(texture);
  sprite.scale.set(SCALE);
  app.renderer.resize(width * SCALE, height * SCALE);
  app.stage.addChild(sprite);
  renderSwatches(paletteSet, rowIndex);
  setStatus(`${sheet.id} · ${sheet.tileCount} tiles · ${paletteSet.id} row ${rowIndex}`);
}

async function init() {
  try {
    const { bootRomAssets } = await import('./romGate.js');
    await bootRomAssets({ onStatus: setStatus });
    manifest = await fetchJson('/graphics/graphics_manifest.json');
    palettes = await fetchJson('/graphics/palettes.json');
  } catch (err) {
    setStatus(err.message || 'Missing graphics — drop a NES Zelda ROM');
    console.error(err);
    return;
  }

  fillSheetSelect();
  fillPaletteSelect();
  fillRowSelect(currentSheet()?.kind ?? 'background');

  app = new Application();
  await initPixiApp(
    app,
    {
      background: '#000000',
      width: 128 * SCALE,
      height: 128 * SCALE,
      antialias: false,
      autoDensity: true,
      resolution: 1,
    },
    { host: stageEl },
  );
  if (app.canvas.parentNode !== stageEl) stageEl.appendChild(app.canvas);

  sheetSelect.addEventListener('change', () => {
    fillRowSelect(currentSheet()?.kind ?? 'background');
    void redraw();
  });
  paletteSelect.addEventListener('change', () => void redraw());
  rowSelect.addEventListener('change', () => void redraw());
  greyToggle.addEventListener('change', () => void redraw());

  await redraw();
}

void init();
