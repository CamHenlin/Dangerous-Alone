/**
 * Safe Pixi Application boot.
 *
 * Two failure modes this guards against:
 *
 * 1. `preference: 'webgl'` still falls through to WebGPU. Chrome's
 *    `gpu.requestAdapter()` can hang until DevTools attaches.
 * 2. Creating a WebGL context on a canvas that is not yet in the document is
 *    flaky on some macOS Chrome / GPU setups — you get a black canvas until
 *    something (like opening DevTools) forces a layout. We mount the canvas
 *    first, then init the renderer against it.
 */

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * @param {import('pixi.js').Application} app
 * @param {Record<string, unknown>} [options] Pixi renderer options
 * @param {{ timeoutMs?: number, host?: HTMLElement | null }} [boot]
 * @returns {Promise<'webgl' | 'canvas'>}
 */
export async function initPixiApp(app, options = {}, boot = {}) {
  // Dynamic import keeps this module loadable under node:test (no `navigator`).
  const { Application, Assets, CanvasRenderer, Container, WebGLRenderer } = await import(
    'pixi.js'
  );
  // Pack images are served by a window.fetch interceptor. Pixi's default
  // texture worker has its own fetch and would 404 those URLs.
  Assets.setPreferences({ preferWorkers: false });

  const timeoutMs = boot.timeoutMs ?? 8000;
  const host = boot.host ?? null;

  /** @type {HTMLCanvasElement} */
  let canvas =
    /** @type {HTMLCanvasElement | undefined} */ (options.canvas)
    ?? document.createElement('canvas');
  if (host && canvas.parentNode !== host) {
    host.appendChild(canvas);
  }

  /** @type {Array<['webgl' | 'canvas', new () => import('pixi.js').Renderer]>} */
  const attempts = [
    ['webgl', WebGLRenderer],
    ['canvas', CanvasRenderer],
  ];

  /** @type {Error | null} */
  let lastError = null;

  for (const [name, RendererClass] of attempts) {
    try {
      // WebGL failure can leave the canvas unusable for 2D — fresh element.
      if (name === 'canvas' && canvas.parentNode) {
        const next = document.createElement('canvas');
        canvas.parentNode.replaceChild(next, canvas);
        canvas = next;
      }

      await withTimeout(
        (async () => {
          const renderer = new RendererClass();
          await renderer.init({
            ...options,
            canvas,
          });
          app.renderer = renderer;
          app.stage ||= new Container();
          // Application.init() normally runs these (ticker, resize, …).
          for (const plugin of Application._plugins) {
            plugin.init.call(app, options);
          }
          // First paint immediately — don't wait for a rAF that may be paused.
          app.render();
        })(),
        timeoutMs,
        `${name} renderer timed out`,
      );
      return name;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      try {
        app.renderer?.destroy?.(false);
      } catch {
        /* ignore */
      }
      app.renderer = /** @type {any} */ (undefined);
    }
  }

  throw (
    lastError
    ?? new Error(
      'Renderer init failed. Refresh the page; if it stays black, try another browser.',
    )
  );
}
