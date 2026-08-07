/**
 * Pixi helpers for continuous multi-room backgrounds (Phase 18).
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { HUD_HEIGHT } from '@shared/collision.js';
import { PLAY_H, PLAY_W, roomPlayOrigin } from '@shared/continuousCamera.js';

/**
 * @typedef {object} StreamRoom
 * @property {number} roomId
 * @property {import('pixi.js').Container | import('pixi.js').Sprite} root
 * @property {import('pixi.js').Sprite | null} sprite
 * @property {import('pixi.js').Graphics | null} fog
 * @property {number[][] | null} tileGrid
 * @property {object | null} pack screen/room payload
 */

/**
 * Manage a set of room backgrounds positioned in anchor-local space.
 * @param {import('pixi.js').Container} parent
 */
export function createStreamView(parent) {
  const layer = new Container();
  parent.addChildAt(layer, 0);

  /** @type {Map<number, StreamRoom>} */
  const rooms = new Map();

  /**
   * @param {number} roomId
   * @param {import('pixi.js').Texture | null} texture
   * @param {{ tileGrid?: number[][] | null, pack?: object | null, fogged?: boolean }} [meta]
   */
  function upsert(roomId, texture, meta = {}) {
    const id = roomId & 0xff;
    let entry = rooms.get(id);
    if (!entry) {
      const root = new Container();
      layer.addChild(root);
      entry = {
        roomId: id,
        root,
        sprite: null,
        fog: null,
        tileGrid: null,
        pack: null,
      };
      rooms.set(id, entry);
    }
    if (texture) {
      if (!entry.sprite) {
        entry.sprite = new Sprite(texture);
        entry.root.addChildAt(entry.sprite, 0);
      } else {
        entry.sprite.texture = texture;
      }
      entry.sprite.visible = !meta.fogged;
    }
    if (meta.tileGrid) entry.tileGrid = meta.tileGrid;
    if (meta.pack) entry.pack = meta.pack;
    setFog(id, Boolean(meta.fogged));
    return entry;
  }

  /**
   * @param {number} roomId
   * @param {boolean} fogged
   */
  function setFog(roomId, fogged) {
    const entry = rooms.get(roomId & 0xff);
    if (!entry) return;
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
   * @param {number} anchorRoomId
   */
  function layout(anchorRoomId) {
    const anchor = roomPlayOrigin(anchorRoomId);
    for (const entry of rooms.values()) {
      const origin = roomPlayOrigin(entry.roomId);
      entry.root.x = origin.ox - anchor.ox;
      entry.root.y = HUD_HEIGHT + (origin.oy - anchor.oy);
    }
  }

  /**
   * @param {Iterable<number>} keepIds
   */
  function pruneTo(keepIds) {
    const keep = new Set([...keepIds].map((id) => id & 0xff));
    for (const [id, entry] of [...rooms.entries()]) {
      if (keep.has(id)) continue;
      layer.removeChild(entry.root);
      entry.root.destroy({ children: true, texture: false, textureSource: false });
      rooms.delete(id);
    }
  }

  function clear() {
    for (const entry of rooms.values()) {
      layer.removeChild(entry.root);
      entry.root.destroy({ children: true, texture: false, textureSource: false });
    }
    rooms.clear();
  }

  /** @returns {Map<number, number[][]>} */
  function gridMap() {
    /** @type {Map<number, number[][]>} */
    const map = new Map();
    for (const entry of rooms.values()) {
      if (entry.tileGrid) map.set(entry.roomId, entry.tileGrid);
    }
    return map;
  }

  /**
   * @param {number} roomId
   */
  function get(roomId) {
    return rooms.get(roomId & 0xff) ?? null;
  }

  return {
    layer,
    rooms,
    upsert,
    setFog,
    layout,
    pruneTo,
    clear,
    gridMap,
    get,
  };
}
