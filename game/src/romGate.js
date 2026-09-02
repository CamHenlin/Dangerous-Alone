/**
 * Gate every game page on a Zelda ROM: stored in localStorage, or dropped here.
 */

import { extractAssetPack } from '../../tools/extract/pack.js';
import { installAssetPack } from './assetHost.js';
import { clearStoredRom, loadStoredRom, saveStoredRom } from './romStore.js';
import patternBlocks from '../../assets/schema/pattern_blocks.json';
import overworld from '../../assets/schema/overworld.json';
import dungeons from '../../assets/schema/dungeons.json';
import caves from '../../assets/schema/caves.json';
import audio from '../../assets/schema/audio.json';
import ending from '../../assets/schema/ending.json';
import demo from '../../assets/schema/demo.json';

const SCHEMAS = {
  patternBlocks,
  overworld,
  dungeons,
  caves,
  audio,
  ending,
  demo,
};

const GATE_ID = 'rom-gate';

function ensureGateEl() {
  let el = document.getElementById(GATE_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = GATE_ID;
  el.className = 'rom-gate';
  el.innerHTML = `
    <div class="rom-drop" role="button" tabindex="0">
      <input class="rom-file" type="file" accept=".nes,application/octet-stream" hidden />
      <h2>Drop a Zelda NES ROM</h2>
      <p>USA cartridge dump, iNES format (<code>.nes</code>). Graphics, maps, and audio
      are extracted in this browser and the ROM is saved in localStorage so you
      only do this once.</p>
      <p class="rom-hint">You need a copy of the game you own. Nothing is uploaded.</p>
      <p class="rom-status"></p>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function hideGate() {
  const el = document.getElementById(GATE_ID);
  if (el) el.hidden = true;
}

function setGateStatus(text, isError = false) {
  const status = document.querySelector('#rom-gate .rom-status');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('error', isError);
}

/**
 * @param {File} file
 * @returns {Promise<Uint8Array>}
 */
async function readRomFile(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function extractAndInstall(bytes, onProgress) {
  const pack = await extractAssetPack(bytes, SCHEMAS, { onProgress });
  installAssetPack(pack);
  return pack;
}

/**
 * @param {{ onStatus?: (msg: string) => void }} [opts]
 */
export async function bootRomAssets(opts = {}) {
  const note = opts.onStatus ?? (() => {});
  const params = new URLSearchParams(window.location.search);
  if (params.has('resetRom')) {
    clearStoredRom();
  }

  const stored = loadStoredRom();
  if (stored) {
    note('Extracting assets from stored ROM…');
    setGateStatus('Extracting assets from stored ROM…');
    try {
      const pack = await extractAndInstall(stored, (msg) => {
        note(msg);
        setGateStatus(msg);
      });
      hideGate();
      return pack;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(err);
      clearStoredRom();
      ensureGateEl();
      setGateStatus(`Stored ROM failed (${msg}). Drop a ROM to continue.`, true);
      return waitForRomDrop(note, { keepStatus: true });
    }
  }

  return waitForRomDrop(note);
}

/**
 * @param {(msg: string) => void} note
 * @param {{ keepStatus?: boolean }} [opts]
 */
function waitForRomDrop(note, opts = {}) {
  const gate = ensureGateEl();
  gate.hidden = false;
  const drop = gate.querySelector('.rom-drop');
  const input = gate.querySelector('.rom-file');

  return new Promise((resolve) => {
    let busy = false;

    const handleBytes = async (bytes, label) => {
      if (busy) return;
      busy = true;
      try {
        note(`Reading ${label}…`);
        setGateStatus(`Reading ${label}…`);
        const pack = await extractAndInstall(bytes, (msg) => {
          note(msg);
          setGateStatus(msg);
        });
        saveStoredRom(bytes);
        hideGate();
        resolve(pack);
      } catch (err) {
        busy = false;
        const msg = err instanceof Error ? err.message : String(err);
        setGateStatus(msg, true);
        note(msg);
      }
    };

    const fromFile = (file) => {
      if (!file) return;
      readRomFile(file)
        .then((bytes) => handleBytes(bytes, file.name))
        .catch((err) => {
          setGateStatus(err.message || String(err), true);
        });
    };

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      fromFile(input.files?.[0]);
    });

    const onDrag = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      drop.classList.add('dragover');
    };
    const onDragLeave = () => drop.classList.remove('dragover');
    const onDrop = (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      fromFile(file);
    };

    drop.addEventListener('dragenter', onDrag);
    drop.addEventListener('dragover', onDrag);
    drop.addEventListener('dragleave', onDragLeave);
    drop.addEventListener('drop', onDrop);
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', onDrop);

    if (!opts.keepStatus) setGateStatus('Waiting for a .nes file…');
  });
}
