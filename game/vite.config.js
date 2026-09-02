import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const overridesDir = path.join(repoRoot, 'assets', 'overrides');

/**
 * Serve assets/overrides/* over extracted assets (editor playtest without re-extract).
 * @returns {import('vite').Plugin}
 */
function overridesPlugin() {
  return {
    name: 'zelda-asset-overrides',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url || url.startsWith('/@') || url.startsWith('/src')) return next();
        const rel = decodeURIComponent(url.replace(/^\//, ''));
        if (!rel || rel.includes('..')) return next();
        const overridePath = path.join(overridesDir, rel);
        if (fs.existsSync(overridePath) && fs.statSync(overridePath).isFile()) {
          res.setHeader('Content-Type', contentType(overridePath));
          fs.createReadStream(overridePath).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

/**
 * @param {string} filePath
 */
function contentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.bin')) return 'application/octet-stream';
  return 'application/octet-stream';
}

export default defineConfig({
  root,
  // Nintendo art is never copied into dist or served from disk. The game
  // extracts it from a ROM dropped into the window and kept in localStorage.
  publicDir: false,
  plugins: [overridesPlugin()],
  resolve: {
    alias: {
      '@shared': path.join(repoRoot, 'tools', 'shared'),
    },
  },
  server: {
    port: 5173,
    open: false,
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(root, 'index.html'),
        play: path.join(root, 'play.html'),
        map: path.join(root, 'map.html'),
        dungeon: path.join(root, 'dungeon.html'),
        editor: path.join(root, 'editor.html'),
      },
    },
  },
});
