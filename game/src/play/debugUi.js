/**
 * HTML debug cheats panel (refills, kill screen, toggles).
 * @param {object} api
 * @param {() => { invincible: boolean, oneHitKills: boolean, insaneDrops: boolean }} api.getCheats
 * @param {(patch: Partial<{ invincible: boolean, oneHitKills: boolean, insaneDrops: boolean }>) => void} api.setCheats
 * @param {() => void} api.refillHearts
 * @param {() => void} api.refillBombs
 * @param {() => void} api.refillRupees
 * @param {() => void} api.killScreen
 * @param {() => void} api.killLink
 * @param {() => void} [api.onClose]
 */
export function createDebugUi(api) {
  const el = document.getElementById('debug-panel');
  if (!el) {
    return {
      open() {},
      close() {},
      get visible() {
        return false;
      },
      refresh() {},
    };
  }

  function render() {
    const cheats = api.getCheats();
    const inv = el.querySelector('#dbg-invincible');
    const ohk = el.querySelector('#dbg-one-hit');
    const drops = el.querySelector('#dbg-insane-drops');
    if (inv instanceof HTMLInputElement) inv.checked = cheats.invincible;
    if (ohk instanceof HTMLInputElement) ohk.checked = cheats.oneHitKills;
    if (drops instanceof HTMLInputElement) drops.checked = cheats.insaneDrops;
  }

  el.querySelector('#dbg-refill')?.addEventListener('click', () => {
    api.refillHearts();
  });
  el.querySelector('#dbg-refill-bombs')?.addEventListener('click', () => {
    api.refillBombs();
  });
  el.querySelector('#dbg-refill-rupees')?.addEventListener('click', () => {
    api.refillRupees();
  });
  el.querySelector('#dbg-kill')?.addEventListener('click', () => {
    api.killScreen();
  });
  el.querySelector('#dbg-kill-link')?.addEventListener('click', () => {
    api.killLink();
  });
  el.querySelector('#dbg-invincible')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    api.setCheats({ invincible: t.checked });
  });
  el.querySelector('#dbg-one-hit')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    api.setCheats({ oneHitKills: t.checked });
  });
  el.querySelector('#dbg-insane-drops')?.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    api.setCheats({ insaneDrops: t.checked });
  });
  el.querySelector('#dbg-close')?.addEventListener('click', () => {
    el.hidden = true;
    api.onClose?.();
  });

  return {
    open() {
      el.hidden = false;
      render();
    },
    close() {
      el.hidden = true;
    },
    get visible() {
      return !el.hidden;
    },
    refresh: render,
  };
}
