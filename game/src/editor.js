/**
 * Minimal level editor for our extracted JSON (OW screens + dungeon rooms).
 * Writes via download; optional playtest path: assets/overrides/...
 */

const statusEl = document.getElementById('status');
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('grid'));
const ctx = canvas.getContext('2d');
const metaEl = document.getElementById('meta');

/** @type {'ow' | 'uw'} */
let kind = 'ow';
/** @type {object | null} */
let doc = null;
/** @type {object | null} */
let room = null;
/** @type {string} */
let sourcePath = '';

function setStatus(t) {
  statusEl.textContent = t;
}

function hexByte(raw, fallback = 0) {
  const n = Number.parseInt(String(raw).replace(/^\$/, ''), 16);
  return Number.isFinite(n) ? n & 0xff : fallback;
}

function syncKindUi() {
  kind = /** @type {HTMLSelectElement} */ (document.getElementById('targetKind')).value === 'uw'
    ? 'uw'
    : 'ow';
  for (const el of document.querySelectorAll('.ow-only')) {
    el.hidden = kind !== 'ow';
  }
  for (const el of document.querySelectorAll('.uw-only')) {
    el.hidden = kind !== 'uw';
  }
}

/**
 * @param {number[][]} grid
 * @param {number} cell
 */
function paintGrid(grid, cell) {
  if (!ctx || !grid?.length) return;
  const rows = grid.length;
  const cols = grid[0].length;
  const cw = Math.floor(canvas.width / cols);
  const ch = Math.floor(canvas.height / rows);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = grid[r][c] & 0xff;
      const shade = 40 + (v % 32) * 6;
      ctx.fillStyle = `rgb(${shade},${shade + 10},${shade + 20})`;
      ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1);
      if (cell >= 12) {
        ctx.fillStyle = '#9aa3b5';
        ctx.font = '8px monospace';
        ctx.fillText(v.toString(16), c * cw + 1, r * ch + 8);
      }
    }
  }
}

function currentGrid() {
  if (kind === 'ow') return doc?.tileGrid ?? null;
  return room?.squares ?? null;
}

function redraw() {
  const grid = currentGrid();
  if (!grid) return;
  paintGrid(grid, kind === 'ow' ? 16 : 8);
  if (kind === 'ow') {
    metaEl.textContent = `${sourcePath}\nmapIndex $${(doc.mapIndex ?? 0).toString(16)}  secrets ${
      doc.secrets?.length ?? 0
    }\npaint hex tile into tileGrid`;
  } else {
    metaEl.textContent = `${sourcePath}\nroom $${room.roomId.toString(16)}  layout $${(
      room.layoutId ?? 0
    ).toString(16)}  monster $${(room.monster?.id ?? 0).toString(16)}\npaint square index 0–7 into squares[][]`;
  }
}

async function loadDoc() {
  syncKindUi();
  if (kind === 'ow') {
    const id = hexByte(/** @type {HTMLInputElement} */ (document.getElementById('owScreen')).value, 0x77);
    sourcePath = `play/screens/${id.toString(16).padStart(2, '0')}.json`;
    const res = await fetch(`/${sourcePath}`);
    if (!res.ok) throw new Error(`${sourcePath}: ${res.status}`);
    doc = await res.json();
    room = null;
    setStatus(`Loaded OW $${id.toString(16).padStart(2, '0')}`);
  } else {
    const quest = /** @type {HTMLSelectElement} */ (document.getElementById('uwQuest')).value;
    const level = /** @type {HTMLSelectElement} */ (document.getElementById('uwLevel')).value;
    const roomId = hexByte(/** @type {HTMLInputElement} */ (document.getElementById('uwRoom')).value, 0x73);
    sourcePath = `dungeons/q${quest}/level_${level}/level.json`;
    const res = await fetch(`/${sourcePath}`);
    if (!res.ok) throw new Error(`${sourcePath}: ${res.status}`);
    doc = await res.json();
    room = doc.rooms.find((r) => r.roomId === roomId);
    if (!room) throw new Error(`Room $${roomId.toString(16)} not in level`);
    /** @type {HTMLInputElement} */ (document.getElementById('monsterId')).value = (
      room.monster?.id ?? 0
    ).toString(16);
    setStatus(`Loaded Q${quest} L${level} room $${roomId.toString(16)}`);
  }
  redraw();
}

function paintAt(clientX, clientY) {
  const grid = currentGrid();
  if (!grid || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const cols = grid[0].length;
  const rows = grid.length;
  const c = Math.floor(((clientX - rect.left) / rect.width) * cols);
  const r = Math.floor(((clientY - rect.top) / rect.height) * rows);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return;
  const raw = /** @type {HTMLInputElement} */ (document.getElementById('paintValue')).value;
  let value;
  if (kind === 'ow') {
    value = hexByte(raw, 0x26);
  } else {
    value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(7, value));
  }
  grid[r][c] = value;
  redraw();
  setStatus(`Painted (${c},${r}) = ${kind === 'ow' ? '$' + value.toString(16) : value}`);
}

function downloadJson() {
  if (!doc) {
    setStatus('Nothing loaded');
    return;
  }
  if (kind === 'uw' && room) {
    const mid = hexByte(/** @type {HTMLInputElement} */ (document.getElementById('monsterId')).value, 0);
    if (!room.monster) room.monster = { countIndex: 0, id: mid };
    else room.monster.id = mid;
  }
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = sourcePath.split('/').pop() || 'level.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Downloaded — save as assets/overrides/${sourcePath}`);
}

document.getElementById('targetKind')?.addEventListener('change', syncKindUi);
document.getElementById('btnLoad')?.addEventListener('click', () => {
  loadDoc().catch((e) => setStatus(e.message || String(e)));
});
document.getElementById('btnDownload')?.addEventListener('click', downloadJson);
document.getElementById('btnApplyMonster')?.addEventListener('click', () => {
  if (!room) return;
  const mid = hexByte(/** @type {HTMLInputElement} */ (document.getElementById('monsterId')).value, 0);
  if (!room.monster) room.monster = { countIndex: 0, id: mid };
  else room.monster.id = mid;
  redraw();
  setStatus(`Monster id → $${mid.toString(16)}`);
});
canvas?.addEventListener('pointerdown', (e) => paintAt(e.clientX, e.clientY));
canvas?.addEventListener('pointermove', (e) => {
  if (e.buttons & 1) paintAt(e.clientX, e.clientY);
});

syncKindUi();
setStatus('Ready — load an OW screen or dungeon room');
