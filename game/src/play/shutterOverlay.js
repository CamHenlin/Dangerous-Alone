/**
 * Pixi helpers: sliding shutter-face halves on streamed room roots.
 */

import { Sprite } from 'pixi.js';

const LABEL_PREFIX = 'shutterHalf:';

/**
 * @param {string} key
 */
function halfLabel(key) {
  return `${LABEL_PREFIX}${key}`;
}

/**
 * @param {import('pixi.js').Container} child
 * @returns {string | null}
 */
function halfKeyOf(child) {
  const label = child.label ?? '';
  if (!label.startsWith(LABEL_PREFIX)) return null;
  return label.slice(LABEL_PREFIX.length);
}

/**
 * Replace shutter-half sprites on a stream room root to match `placements`.
 * Sprites sit above the BG sprite and under any fog child.
 *
 * @param {import('./streamView.js').StreamRoom | null | undefined} entry
 * @param {{ key: string, x: number, y: number, texture: import('pixi.js').Texture }[]} placements
 * @param {{ visible?: boolean }} [opts]
 */
export function syncShutterSprites(entry, placements, opts = {}) {
  if (!entry?.root) return;
  const visible = opts.visible !== false;

  /** @type {Map<string, import('pixi.js').Sprite>} */
  const existing = new Map();
  for (const child of [...entry.root.children]) {
    const key = halfKeyOf(child);
    if (key == null) continue;
    existing.set(key, /** @type {import('pixi.js').Sprite} */ (child));
  }

  const keep = new Set(placements.map((p) => p.key));
  for (const [key, spr] of existing) {
    if (keep.has(key)) continue;
    entry.root.removeChild(spr);
    spr.destroy({ texture: false, textureSource: false });
    existing.delete(key);
  }

  let fogIndex = -1;
  for (let i = 0; i < entry.root.children.length; i += 1) {
    if (entry.root.children[i] === entry.fog) {
      fogIndex = i;
      break;
    }
  }

  for (const p of placements) {
    if (!p.texture) continue;
    let spr = existing.get(p.key);
    if (!spr) {
      spr = new Sprite(p.texture);
      spr.label = halfLabel(p.key);
      if (fogIndex >= 0) {
        entry.root.addChildAt(spr, fogIndex);
        fogIndex += 1;
      } else {
        entry.root.addChild(spr);
      }
    }
    spr.texture = p.texture;
    spr.x = p.x;
    spr.y = p.y;
    spr.visible = visible;
  }
}
