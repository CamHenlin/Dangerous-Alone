import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const overridesDir = path.join(repoRoot, 'assets', 'overrides');

/**
 * GitHub Pages runs Jekyll over the artifact unless this file exists, which
 * would skip Vite's underscored hashed chunks.
 * @returns {import('vite').Plugin}
 */
function noJekyllPlugin() {
  return {
    name: 'github-pages-nojekyll',
    closeBundle() {
      const dist = path.join(repoRoot, 'dist');
      fs.mkdirSync(dist, { recursive: true });
      fs.writeFileSync(path.join(dist, '.nojekyll'), '');
    },
  };
}

/**
 * The public Pages build is play-only. Strip the Tiles / Overworld / Dungeons /
 * Editor links from the toolbar; `npm run dev` keeps them.
 * @returns {import('vite').Plugin}
 */
function publicPlayNavPlugin() {
  return {
    name: 'public-play-nav',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return html.replace(/\n\s*<a class="nav dev-nav"[^>]*>[^<]*<\/a>/g, '');
    },
  };
}

/**
 * Serve assets/overrides/* over extracted assets (editor playtest without re-extract).
 * @returns {import('vite').Plugin}
 */
function overridesPlugin() {
  return {
    name: 'asset-overrides',
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
  // Relative URLs so the same dist works on GitHub project Pages (`/repo/…`)
  // and at the site root. Cartridge art is never copied into dist.
  base: './',
  publicDir: false,
  plugins: [overridesPlugin(), noJekyllPlugin(), publicPlayNavPlugin()],
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
      // Play-only artifact for GitHub Pages. Tile / map / dungeon / editor
      // viewers stay available under `npm run dev`.
      input: {
        main: path.join(root, 'index.html'),
        play: path.join(root, 'play.html'),
      },
    },
  },
});
