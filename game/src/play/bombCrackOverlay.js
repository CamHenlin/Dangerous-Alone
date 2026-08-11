/**
 * Pixi helpers: load the crack texture and sync sprites onto streamed room roots.
 */

import { Assets, Sprite } from 'pixi.js';
import { BOMB_CRACK_URL } from '@shared/bombCrack.js';

const LABEL_PREFIX = 'bombCrack:';

/**
 * @param {string} key
 */
function crackLabel(key) {
  return `${LABEL_PREFIX}${key}`;
}

/**
 * @param {import('pixi.js').Container} child
 * @returns {string | null}
 */
function crackKeyOf(child) {
  const label = child.label ?? '';
  if (!label.startsWith(LABEL_PREFIX)) return null;
  return label.slice(LABEL_PREFIX.length);
}

/**
 * @returns {Promise<import('pixi.js').Texture>}
 */
export async function loadBombCrackTexture() {
  const tex = await Assets.load(BOMB_CRACK_URL);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/**
 * Replace crack sprites on a stream room root to match `placements`.
 * Sprites sit above the BG sprite and under any fog child.
 *
 * @param {import('./streamView.js').StreamRoom | null | undefined} entry
 * @param {import('pixi.js').Texture | null | undefined} texture
 * @param {{ key: string, x: number, y: number }[]} placements
 * @param {{ visible?: boolean }} [opts]
 */
export function syncBombCrackSprites(entry, texture, placements, opts = {}) {
  if (!entry?.root) return;
  const visible = opts.visible !== false;

  /** @type {Map<string, import('pixi.js').Sprite>} */
  const existing = new Map();
  for (const child of [...entry.root.children]) {
    const key = crackKeyOf(child);
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

  if (!texture) return;

  // Keep cracks under fog so unvisited UW neighbors stay black.
  let fogIndex = -1;
  for (let i = 0; i < entry.root.children.length; i += 1) {
    if (entry.root.children[i] === entry.fog) {
      fogIndex = i;
      break;
    }
  }

  for (const p of placements) {
    let spr = existing.get(p.key);
    if (!spr) {
      spr = new Sprite(texture);
      spr.label = crackLabel(p.key);
      if (fogIndex >= 0) {
        entry.root.addChildAt(spr, fogIndex);
        fogIndex += 1;
      } else {
        entry.root.addChild(spr);
      }
    }
    spr.texture = texture;
    spr.x = p.x;
    spr.y = p.y;
    spr.visible = visible;
  }
}

/**
 * Hide or show every crack sprite on a room root (e.g. fog toggle).
 * @param {import('./streamView.js').StreamRoom | null | undefined} entry
 * @param {boolean} visible
 */
export function setBombCrackVisible(entry, visible) {
  if (!entry?.root) return;
  for (const child of entry.root.children) {
    if (crackKeyOf(child) != null) child.visible = visible;
  }
}
