/**
 * Pixi helpers for continuous multi-room backgrounds (Phase 18).
 *
 * The view owns the scene graph only. Collision grids and room packs live in a
 * `roomStore`, so the simulation can read tiles without a renderer and several
 * views can draw the same rooms (Phase 23).
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { PLAY_H, PLAY_W, roomStreamOffset } from '@shared/continuousCamera.js';
import { createRoomStore } from '@shared/roomStore.js';
import { createStreamFetch } from '@shared/streamFetch.js';

/**
 * @typedef {object} StreamRoom
 * @property {number} roomId
 * @property {import('pixi.js').Container} root
 * @property {import('pixi.js').Sprite | null} sprite
 * @property {import('pixi.js').Graphics | null} fog
 */

/**
 * Manage a set of room backgrounds positioned in anchor-local space.
 * @param {import('pixi.js').Container} parent
 * @param {ReturnType<typeof createRoomStore>} [store] room data; a private one
 *   is made for views with no simulation behind them (door frames)
 */
export function createStreamView(parent, store = createRoomStore()) {
  const layer = new Container();
  parent.addChildAt(layer, 0);
  const load = createStreamFetch();

  /** @type {Map<number, StreamRoom>} */
  const views = new Map();
  /** Last `layout()` anchor; new rooms are placed against this immediately. */
  let layoutAnchor = /** @type {number | null} */ (null);

  /**
   * @param {StreamRoom} entry
   */
  function positionEntry(entry) {
    const pos = roomStreamOffset(entry.roomId, layoutAnchor ?? entry.roomId);
    entry.root.x = pos.x;
    entry.root.y = pos.y;
  }

  /** @param {number} id */
  function ensureView(id) {
    let entry = views.get(id);
    if (!entry) {
      const root = new Container();
      layer.addChild(root);
      entry = { roomId: id, root, sprite: null, fog: null };
      views.set(id, entry);
      if (layoutAnchor == null) layoutAnchor = id;
      positionEntry(entry);
    }
    return entry;
  }

  /**
   * @param {number} roomId
   * @param {import('pixi.js').Texture | null} texture
   * @param {{ tileGrid?: number[][] | null, pack?: object | null, fogged?: boolean }} [meta]
   */
  function upsert(roomId, texture, meta = {}) {
    const id = roomId & 0xff;
    const fogged = Boolean(meta.fogged);
    store.upsert(id, { tileGrid: meta.tileGrid, pack: meta.pack, fogged });
    const entry = ensureView(id);
    if (texture) {
      if (!entry.sprite) {
        entry.sprite = new Sprite(texture);
        entry.root.addChildAt(entry.sprite, 0);
      } else {
        entry.sprite.texture = texture;
      }
    }
    setFog(id, fogged);
    return entry;
  }

  /**
   * @param {number} roomId
   * @param {boolean} fogged
   */
  function setFog(roomId, fogged) {
    const id = roomId & 0xff;
    const entry = views.get(id);
    if (!entry) return;
    store.setFog(id, fogged);
    if (fogged) {
      if (!entry.fog) {
        entry.fog = new Graphics();
        entry.fog.rect(0, 0, PLAY_W, PLAY_H);
        entry.fog.fill({ color: 0x000000, alpha: 1 });
        entry.root.addChild(entry.fog);
      }
      entry.fog.visible = true;
      if (entry.sprite) entry.sprite.visible = false;
    } else {
      if (entry.fog) entry.fog.visible = false;
      if (entry.sprite) entry.sprite.visible = true;
    }
  }

  /**
   * Position every room relative to the anchor room (local play space).
   * Remembers the anchor so a later `upsert` does not spawn at (0, 0) for
   * a frame — that covered the current dungeon/OW screen during neighbor
   * streaming after `yieldToPaint`.
   * @param {number} anchorRoomId
   */
  function layout(anchorRoomId) {
    layoutAnchor = anchorRoomId & 0xff;
    for (const entry of views.values()) positionEntry(entry);
  }

  /** @param {StreamRoom} entry */
  function destroyView(entry) {
    layer.removeChild(entry.root);
    entry.root.destroy({ children: true, texture: false, textureSource: false });
  }

  /**
   * @param {Iterable<number>} keepIds
   */
  function pruneTo(keepIds) {
    const keep = new Set([...keepIds].map((id) => id & 0xff));
    for (const [id, entry] of [...views.entries()]) {
      if (keep.has(id)) continue;
      destroyView(entry);
      views.delete(id);
    }
    store.pruneTo(keep);
  }

  function clear() {
    load.invalidate();
    for (const entry of views.values()) destroyView(entry);
    views.clear();
    store.clear();
    layoutAnchor = null;
  }

  /**
   * @param {number} roomId
   * @returns {StreamRoom | null}
   */
  function get(roomId) {
    return views.get(roomId & 0xff) ?? null;
  }

  function destroy() {
    clear();
    layer.parent?.removeChild(layer);
    layer.destroy({ children: true });
  }

  return {
    layer,
    store,
    views,
    load,
    upsert,
    setFog,
    layout,
    pruneTo,
    clear,
    get,
    destroy,
  };
}
