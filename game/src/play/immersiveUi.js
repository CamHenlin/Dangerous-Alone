/**
 * Play-only view: hide the toolbar and help, fill the window with the canvas,
 * and ask the browser for fullscreen when it will allow it.
 */

/**
 * @param {object} api
 * @param {HTMLElement | null} api.root `#app`
 * @param {(on: boolean) => void} [api.onChange]
 */
export function createImmersiveUi(api) {
  const root = api.root;
  const enterBtn = document.getElementById('btn-fullscreen');
  const exitBtn = document.getElementById('btn-exit-fullscreen');

  function isOn() {
    return Boolean(root?.classList.contains('immersive'));
  }

  function syncChrome(on) {
    root?.classList.toggle('immersive', on);
    if (exitBtn instanceof HTMLElement) exitBtn.hidden = !on;
    if (enterBtn instanceof HTMLElement) {
      enterBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      enterBtn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
    }
    api.onChange?.(on);
  }

  async function setOn(want) {
    const on = Boolean(want);
    syncChrome(on);
    try {
      if (on && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!on && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* denied — chrome-hide still applies */
    }
  }

  enterBtn?.addEventListener('click', () => {
    void setOn(!isOn());
  });
  exitBtn?.addEventListener('click', () => {
    void setOn(false);
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isOn()) syncChrome(false);
  });

  return {
    get active() {
      return isOn();
    },
    setOn,
    toggle() {
      return setOn(!isOn());
    },
  };
}
