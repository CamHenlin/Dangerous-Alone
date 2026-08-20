import { bindsForPlayer, codeLabel, saveOptions } from '@shared/options.js';

const ACTIONS = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'a', label: 'A (sword)' },
  { id: 'b', label: 'B (item)' },
  { id: 'start', label: 'Start (inv)' },
  { id: 'select', label: 'Select (continue menu)' },
];

/**
 * HTML options panel: scale, fullscreen, filter, per-seat keys and pads.
 * @param {object} api
 * @param {() => object} api.getOptions
 * @param {(opts: object) => void} api.setOptions
 * @param {() => void} [api.onClose]
 */
export function createOptionsUi(api) {
  const el = document.getElementById('options-panel');
  if (!el) {
    return {
      open() {},
      close() {},
      get visible() {
        return false;
      },
    };
  }

  /** @type {string | null} */
  let rebindAction = null;
  let selectedPlayer = 0;

  function currentBinds(opts) {
    return bindsForPlayer(opts, selectedPlayer);
  }

  function padSelectValue(opts) {
    const slot = opts.padSlots?.[selectedPlayer];
    if (slot === -1) return 'none';
    if (slot == null) return 'all';
    return String(slot);
  }

  function render() {
    const opts = api.getOptions();
    const scaleSel = el.querySelector('#opt-scale');
    const filterSel = el.querySelector('#opt-filter');
    const playerSel = el.querySelector('#opt-player');
    const padSel = el.querySelector('#opt-pad');
    if (scaleSel instanceof HTMLSelectElement) {
      scaleSel.value = String(opts.scale);
    }
    if (filterSel instanceof HTMLSelectElement) {
      filterSel.value = opts.filter;
    }
    if (playerSel instanceof HTMLSelectElement) {
      playerSel.value = String(selectedPlayer);
    }
    if (padSel instanceof HTMLSelectElement) {
      padSel.value = padSelectValue(opts);
    }
    const bindsBox = el.querySelector('#opt-binds');
    if (bindsBox) {
      bindsBox.innerHTML = '';
      const binds = currentBinds(opts);
      for (const action of ACTIONS) {
        const row = document.createElement('div');
        row.className = 'opt-bind-row';
        const labels = (binds[action.id] ?? []).map(codeLabel).join(' / ');
        row.innerHTML = `<span>${action.label}</span><button type="button" data-action="${action.id}">${
          rebindAction === action.id ? 'Press key…' : labels
        }</button>`;
        bindsBox.appendChild(row);
      }
    }
  }

  el.querySelector('#opt-scale')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    const v = t.value === 'auto' ? 'auto' : Number(t.value);
    const opts = { ...api.getOptions(), scale: v };
    api.setOptions(saveOptions(opts));
  });

  el.querySelector('#opt-filter')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    const opts = { ...api.getOptions(), filter: t.value };
    api.setOptions(saveOptions(opts));
  });

  el.querySelector('#opt-player')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    selectedPlayer = Number(t.value) || 0;
    rebindAction = null;
    render();
  });

  el.querySelector('#opt-pad')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    const opts = api.getOptions();
    const padSlots = [...(opts.padSlots ?? [null, 1, 2, 3])];
    if (t.value === 'all') padSlots[selectedPlayer] = null;
    else if (t.value === 'none') padSlots[selectedPlayer] = -1;
    else padSlots[selectedPlayer] = Number(t.value);
    api.setOptions(saveOptions({ ...opts, padSlots }));
    render();
  });

  el.querySelector('#opt-fullscreen')?.addEventListener('click', async () => {
    // Fullscreen requires a user gesture and is not restored on load.
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* denied */
    }
  });

  el.querySelector('#opt-close')?.addEventListener('click', () => {
    rebindAction = null;
    el.hidden = true;
    api.onClose?.();
  });

  el.querySelector('#opt-binds')?.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-action]');
    if (!btn) return;
    rebindAction = btn.getAttribute('data-action');
    render();
  });

  const onKey = (e) => {
    if (el.hidden || !rebindAction) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      rebindAction = null;
      render();
      return;
    }
    const opts = api.getOptions();
    const playerBinds = (opts.playerBinds ?? []).map((b) => ({ ...b }));
    while (playerBinds.length < 4) playerBinds.push({});
    const next = { ...(playerBinds[selectedPlayer] ?? {}) };
    next[rebindAction] = [e.code];
    playerBinds[selectedPlayer] = next;
    const patch = { ...opts, playerBinds };
    if (selectedPlayer === 0) {
      patch.binds = { ...opts.binds, [rebindAction]: [e.code] };
    }
    api.setOptions(saveOptions(patch));
    rebindAction = null;
    render();
  };
  window.addEventListener('keydown', onKey, true);

  return {
    open() {
      el.hidden = false;
      rebindAction = null;
      render();
    },
    close() {
      el.hidden = true;
      rebindAction = null;
    },
    get visible() {
      return !el.hidden;
    },
    refresh: render,
  };
}
