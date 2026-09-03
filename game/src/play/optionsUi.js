import {
  bindsForPlayer,
  codeLabel,
  padBindsForPlayer,
  padsForPlayer,
  resetPlayerControls,
  saveOptions,
} from '@shared/options.js';
import { activePadSources, formatGamepadSlots, formatPadProbe, hidDpadCodesFromDirs, isPadCode, newPadSource } from '@shared/padBinds.js';
import {
  grantHidDpad,
  hidDpadDebugLine,
  hidDpadDirs,
  hidDpadListening,
  padHasStrippedDpad,
} from '@shared/hidDpad.js';

const ACTIONS = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'a', label: 'A (sword)' },
  { id: 'b', label: 'B (item)' },
  { id: 'start', label: 'Start (inv)' },
  { id: 'select', label: 'Select (cycle item / continue)' },
];

/**
 * HTML options panel: scale, fullscreen, filter, per-seat keys and pads.
 * @param {object} api
 * @param {() => object} api.getOptions
 * @param {(opts: object) => void} api.setOptions
 * @param {() => void} [api.onClose]
 * @param {() => void} [api.toggleFullscreen]
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
  let loopRaf = 0;
  /** @type {Set<string> | null} */
  let rebindBaseline = null;

  function currentBinds(opts) {
    return bindsForPlayer(opts, selectedPlayer);
  }

  function currentPadBinds(opts) {
    return padBindsForPlayer(opts, selectedPlayer);
  }

  function padSelectValue(opts) {
    const slot = opts.padSlots?.[selectedPlayer];
    if (slot === -1) return 'none';
    if (slot == null) return 'all';
    return String(slot);
  }

  function bindLabels(opts, actionId) {
    const keys = (currentBinds(opts)[actionId] ?? []).map(codeLabel);
    const pads = (currentPadBinds(opts)[actionId] ?? []).map(codeLabel);
    return [...keys, ...pads].join(' / ');
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
      for (const action of ACTIONS) {
        const row = document.createElement('div');
        row.className = 'opt-bind-row';
        const labels = bindLabels(opts, action.id);
        row.innerHTML = `<span>${action.label}</span><button type="button" data-action="${action.id}">${
          rebindAction === action.id ? 'Press key or pad…' : labels
        }</button>`;
        bindsBox.appendChild(row);
      }
    }
  }

  function stopLoop() {
    if (loopRaf) cancelAnimationFrame(loopRaf);
    loopRaf = 0;
    rebindBaseline = null;
  }

  function updateProbe() {
    const probe = el.querySelector('#opt-pad-probe');
    const hidBtn = el.querySelector('#opt-hid-dpad');
    const hidHint = el.querySelector('#opt-hid-hint');
    if (!probe) return;
    const allPads = navigator.getGamepads?.() ?? [];
    const pads = padsToWatch(api.getOptions());
    const parts = [
      pads.length ? pads.map((p) => formatPadProbe(p)).join('\n\n') : formatPadProbe(null),
      formatGamepadSlots(allPads),
    ];
    const hidLine = hidDpadDebugLine();
    if (hidLine) parts.push(hidLine);
    probe.textContent = parts.join('\n');
    const listed = Array.from(allPads);
    const stripped = listed.some((p) => padHasStrippedDpad(p));
    const dragon = listed.some((p) => /Vendor:\s*0079/i.test(p?.id ?? ''));
    const canHid = Boolean(globalThis.navigator?.hid);
    if (hidBtn instanceof HTMLElement) hidBtn.hidden = !(canHid && (dragon || stripped));
    if (hidHint instanceof HTMLElement && hidHint.dataset.locked !== '1') {
      hidHint.hidden = !(canHid && (dragon || stripped) && !hidDpadListening());
    }
  }

  function startLoop() {
    if (loopRaf) return;
    const tick = () => {
      if (el.hidden) {
        loopRaf = 0;
        return;
      }
      updateProbe();
      if (rebindAction) {
        const pads = padsToWatch(api.getOptions());
        const hidCodes = hidDpadCodesFromDirs(hidDpadDirs());
        if (rebindBaseline == null) {
          rebindBaseline = new Set([...pads.flatMap((p) => activePadSources(p)), ...hidCodes]);
        } else {
          const source = newPadSource(pads, rebindBaseline, undefined, hidCodes);
          if (source) {
            applySource(rebindAction, source);
            rebindAction = null;
            rebindBaseline = null;
            render();
          }
        }
      }
      loopRaf = requestAnimationFrame(tick);
    };
    loopRaf = requestAnimationFrame(tick);
  }

  function padsToWatch(opts) {
    const list = navigator.getGamepads?.() ?? [];
    const slot = opts.padSlots?.[selectedPlayer];
    if (typeof slot === 'number' && slot >= 0) {
      const claimed = list[slot];
      if (claimed) return [claimed];
    }
    return padsForPlayer(list);
  }

  function applySource(action, source) {
    const opts = api.getOptions();
    if (isPadCode(source)) {
      const playerPadBinds = (opts.playerPadBinds ?? []).map((b) => ({ ...b }));
      while (playerPadBinds.length < 4) playerPadBinds.push({});
      const next = { ...(playerPadBinds[selectedPlayer] ?? {}) };
      next[action] = [source];
      playerPadBinds[selectedPlayer] = next;
      api.setOptions(saveOptions({ ...opts, playerPadBinds }));
      return;
    }
    const playerBinds = (opts.playerBinds ?? []).map((b) => ({ ...b }));
    while (playerBinds.length < 4) playerBinds.push({});
    const next = { ...(playerBinds[selectedPlayer] ?? {}) };
    next[action] = [source];
    playerBinds[selectedPlayer] = next;
    const patch = { ...opts, playerBinds };
    if (selectedPlayer === 0) {
      patch.binds = { ...opts.binds, [action]: [source] };
    }
    api.setOptions(saveOptions(patch));
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
    rebindBaseline = null;
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

  el.querySelector('#opt-fullscreen')?.addEventListener('click', () => {
    el.hidden = true;
    api.onClose?.();
    api.toggleFullscreen?.();
  });

  el.querySelector('#opt-hid-dpad')?.addEventListener('click', async () => {
    const status = el.querySelector('#opt-hid-status');
    const hint = el.querySelector('#opt-hid-hint');
    if (status instanceof HTMLElement) {
      status.hidden = false;
      status.textContent = 'Look at the top of the Chrome window and pick the USB Gamepad.';
    }
    const result = await grantHidDpad();
    if (status instanceof HTMLElement) {
      status.hidden = false;
      status.textContent = result.reason;
    }
    if (hint instanceof HTMLElement) {
      hint.dataset.locked = '1';
      hint.hidden = result.ok;
    }
    updateProbe();
  });

  el.querySelector('#opt-close')?.addEventListener('click', () => {
    rebindAction = null;
    stopLoop();
    el.hidden = true;
    api.onClose?.();
  });

  el.querySelector('#opt-reset-binds')?.addEventListener('click', () => {
    rebindAction = null;
    rebindBaseline = null;
    api.setOptions(saveOptions(resetPlayerControls(api.getOptions(), selectedPlayer)));
    render();
  });

  el.querySelector('#opt-binds')?.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-action]');
    if (!btn) return;
    rebindAction = btn.getAttribute('data-action');
    rebindBaseline = null;
    render();
  });

  const onKey = (e) => {
    if (el.hidden || !rebindAction) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      rebindAction = null;
      rebindBaseline = null;
      render();
      return;
    }
    applySource(rebindAction, e.code);
    rebindAction = null;
    rebindBaseline = null;
    render();
  };
  window.addEventListener('keydown', onKey, true);

  return {
    open() {
      el.hidden = false;
      rebindAction = null;
      rebindBaseline = null;
      render();
      startLoop();
    },
    close() {
      el.hidden = true;
      rebindAction = null;
      stopLoop();
    },
    get visible() {
      return !el.hidden;
    },
    refresh: render,
  };
}
