/**
 * The dev server the browser harness loads the game from.
 *
 * Vite's dev server rather than a built bundle: no build step to forget, and
 * the run always reflects the working tree, which is what you want when the
 * harness exists to tell you whether the edit you just made changed the game.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/**
 * @param {object} [opts]
 * @param {number} [opts.port] 0 lets the OS pick, so parallel runs cannot collide
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startGameServer({ port = 0 } = {}) {
  const server = await createServer({
    configFile: path.join(repoRoot, 'game', 'vite.config.js'),
    logLevel: 'error',
    server: { port, strictPort: false, hmr: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) {
    await server.close();
    throw new Error('vite did not report a local URL');
  }
  return {
    url,
    close: () => server.close(),
  };
}
