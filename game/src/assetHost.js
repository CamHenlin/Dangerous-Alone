/**
 * Serve an in-memory extract pack through `fetch` / Pixi `Assets.load`.
 *
 * Paths match the old Vite publicDir layout (`/play/world_index.json`, …).
 */

import { materializePackFile } from '../../tools/extract/pack.js';
import { copyRgbaPixels } from '../../tools/shared/rgbaImage.js';

/** @type {Map<string, object> | null} */
let packFiles = null;
/** @type {((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null} */
let nativeFetch = null;
const pngBlobCache = new Map();

/**
 * @param {string | URL | Request} input
 */
function packPath(input) {
  let raw;
  if (typeof input === 'string') raw = input;
  else if (input instanceof URL) raw = input.href;
  else if (input && typeof input === 'object' && 'url' in input) raw = input.url;
  else raw = String(input);
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0].split('#')[0];
  return decodeURIComponent(path.replace(/^\//, ''));
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba
 * @returns {Promise<Blob>}
 */
function rgbaToPngBlob(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2d context unavailable'));
  ctx.putImageData(new ImageData(copyRgbaPixels(width, height, rgba).data, width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('PNG encode failed'));
      else resolve(blob);
    }, 'image/png');
  });
}

/**
 * Raster a pack image without encoding PNG. Play uses this for OW screens so
 * a seam cross does not wait on compress-then-decode of pixels we already have.
 *
 * @param {string | URL | Request} input
 * @returns {{ path: string, width: number, height: number, rgba: Uint8Array } | null}
 */
export function peekPackRgba(input) {
  if (!packFiles) return null;
  const path = packPath(input);
  const file = materializePackFile(packFiles, path);
  if (!file || file.kind !== 'rgba') return null;
  return { path, width: file.width, height: file.height, rgba: file.rgba };
}

/**
 * @param {object} file
 * @param {string} path
 */
async function fileToResponse(file, path) {
  if (file.kind === 'json') {
    return new Response(JSON.stringify(file.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (file.kind === 'bytes') {
    const copy = file.data.buffer.slice(
      file.data.byteOffset,
      file.data.byteOffset + file.data.byteLength,
    );
    return new Response(copy, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }
  if (file.kind === 'rgba') {
    let blob = pngBlobCache.get(path);
    if (!blob) {
      blob = await rgbaToPngBlob(file.width, file.height, file.rgba);
      pngBlobCache.set(path, blob);
    }
    return new Response(blob, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  }
  return new Response('unknown pack entry', { status: 500 });
}

/**
 * @param {{ files: Map<string, object> }} pack
 */
export function installAssetPack(pack) {
  packFiles = pack.files;
  pngBlobCache.clear();
  if (nativeFetch) return;
  nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = packPath(input);
    const file = packFiles ? materializePackFile(packFiles, path) : null;
    if (file) return fileToResponse(file, path);
    return nativeFetch(input, init);
  };
}

export function uninstallAssetPack() {
  if (nativeFetch) {
    window.fetch = nativeFetch;
    nativeFetch = null;
  }
  packFiles = null;
  pngBlobCache.clear();
}

export function hasAssetPack() {
  return packFiles != null;
}
