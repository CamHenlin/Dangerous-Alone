/**
 * Multi-room enemy / visit lifecycle for continuous camera (Phase 18).
 */

import { DIR } from './collision.js';
import {
  PLAY_H,
  PLAY_W,
  foggedRooms,
  rectFullyOffCamera,
  roomsForCamera,
} from './continuousCamera.js';
import { roomFullyOffCamera } from './multiRoomTiles.js';

export { foggedRooms, roomsForCamera, roomFullyOffCamera };

/**
 * Stable id for one ROM spawn slot inside a room (`roomId` high, `slotIndex` low).
 * Continuous OW can stream the same screen twice if the latch flaps; this key is
 * what keeps two living copies of the same spawn point from existing at once.
 * @param {number} roomId
 * @param {number} slotIndex
 */
export function spawnPointKey(roomId, slotIndex) {
  return ((roomId & 0xff) << 8) | (slotIndex & 0xff);
}

/**
 * Drop every claimed spawn point that belongs to `roomId`.
 * @param {Set<number>} claims
 * @param {number} roomId
 */
export function clearSpawnClaimsForRoom(claims, roomId) {
  if (!claims?.size) return;
  const id = roomId & 0xff;
  for (const key of [...claims]) {
    if ((key >> 8) === id) claims.delete(key);
  }
}

/**
 * Tag freshly spawned enemies with their home room and spawn-point key.
 * `slotIndex` comes from `spawnEnemiesFromAttrs` (ROM object-slot order). Zora,
 * Armos, and death-splits leave it unset on purpose so they never occupy a ROM
 * spawn point and block a later wave.
 * @param {object[]} enemies
 * @param {number} roomId
 */
export function tagEnemyHomeRoom(enemies, roomId) {
  const id = roomId & 0xff;
  for (const e of enemies) {
    if (!e) continue;
    if (e.homeRoomId == null) e.homeRoomId = id;
    if (e.spawnPointKey == null && e.slotIndex != null) {
      e.spawnPointKey = spawnPointKey(e.homeRoomId, e.slotIndex);
    }
  }
  return enemies;
}

/**
 * Spawn-point keys already held by living foes.
 * @param {Iterable<object>} enemies
 * @returns {Set<number>}
 */
export function livingSpawnPointKeys(enemies) {
  /** @type {Set<number>} */
  const keys = new Set();
  for (const e of enemies) {
    if (!e?.alive) continue;
    if (e.spawnPointKey != null) keys.add(e.spawnPointKey);
  }
  return keys;
}

/**
 * Record spawn points owned by living foes so a later wave cannot reuse them.
 * @param {Iterable<object>} enemies
 * @param {Set<number>} claims
 */
export function claimLivingSpawnPoints(enemies, claims) {
  for (const e of enemies) {
    if (!e?.alive || e.spawnPointKey == null) continue;
    claims.add(e.spawnPointKey);
  }
}

/**
 * Drop foes whose spawn point is already occupied or claimed this visit.
 * Within one wave, the first foe to claim a key wins; later copies are dropped.
 * The caller should `claimLivingSpawnPoints` only for foes that actually enter
 * the monster table (slot caps can reject the tail of a wave).
 *
 * @template {{ spawnPointKey?: number | null, alive?: boolean }} T
 * @param {T[]} spawned
 * @param {Iterable<object>} existing
 * @param {Set<number>} [claims] visit claims (read-only here)
 * @returns {T[]}
 */
export function filterUnoccupiedSpawnPoints(spawned, existing, claims = new Set()) {
  const occupied = livingSpawnPointKeys(existing);
  for (const key of claims) occupied.add(key);
  /** @type {T[]} */
  const out = [];
  for (const e of spawned) {
    if (!e) continue;
    const key = e.spawnPointKey;
    if (key != null && occupied.has(key)) continue;
    if (key != null) occupied.add(key);
    out.push(e);
  }
  return out;
}

/**
 * Shift every positioned object by (dx, dy) when the anchor room rebases.
 * @param {Iterable<{ x?: number, y?: number } | null | undefined>} objs
 * @param {number} dx
 * @param {number} dy
 */
export function shiftPositions(objs, dx, dy) {
  for (const o of objs) {
    if (!o) continue;
    if (typeof o.x === 'number') o.x += dx;
    if (typeof o.y === 'number') o.y += dy;
    // Blade traps keep home-room anchors (rush target / retract limit) in the
    // same coordinate space as x/y. Soft-enter rebase must shift those too or
    // a neighbour trap rushes toward the new room's $78/$90.
    if (typeof o.trapOriginX === 'number') o.trapOriginX += dx;
    if (typeof o.trapOriginY === 'number') o.trapOriginY += dy;
    if (typeof o.trapHome === 'number' && typeof o.dir === 'number') {
      if (o.dir & (DIR.LEFT | DIR.RIGHT)) o.trapHome += dx;
      else if (o.dir & (DIR.UP | DIR.DOWN)) o.trapHome += dy;
    }
  }
}

/**
 * Despawn enemies whose sprites are fully off-camera.
 * Living foes whose home room is still on-camera are kept even if their
 * sprite walked past the view edge — otherwise peek+chase empties a room
 * and a latch release would refill it mid-visit.
 *
 * @param {object[]} enemies
 * @param {number} camLocalX
 * @param {number} camLocalY
 * @param {number} [pad]
 * @param {{ worldCamX?: number, worldCamY?: number }} [opts]
 * @returns {{ kept: object[], emptiedRooms: Set<number> }}
 */
export function cullOffscreenEnemies(
  enemies,
  camLocalX,
  camLocalY,
  pad = 8,
  opts = {},
) {
  const worldCamX = opts.worldCamX ?? 0;
  const worldCamY = opts.worldCamY ?? 0;
  const keepFn = typeof opts.keep === 'function' ? opts.keep : null;
  /** @type {object[]} */
  const kept = [];
  /** @type {Set<number>} */
  const emptiedRooms = new Set();
  /** @type {Map<number, number>} */
  const liveByRoom = new Map();

  for (const e of enemies) {
    if (!e?.alive) continue;
    const home = e.homeRoomId ?? -1;
    liveByRoom.set(home, (liveByRoom.get(home) ?? 0) + 1);
  }

  for (const e of enemies) {
    if (!e) continue;
    if (!e.alive) {
      if (!rectFullyOffCamera(e, camLocalX, camLocalY, pad)) kept.push(e);
      continue;
    }
    // Callers can pin special states (Wallmaster capture slide) past the lip.
    if (keepFn?.(e)) {
      kept.push(e);
      continue;
    }
    const home = e.homeRoomId ?? -1;
    const homeStillVisible =
      home >= 0 && !roomFullyOffCamera(home, worldCamX, worldCamY, pad);
    if (rectFullyOffCamera(e, camLocalX, camLocalY, pad) && !homeStillVisible) {
      const left = (liveByRoom.get(home) ?? 1) - 1;
      liveByRoom.set(home, left);
      if (left <= 0 && home >= 0) emptiedRooms.add(home);
      e.alive = false;
      continue;
    }
    kept.push(e);
  }
  return { kept, emptiedRooms };
}

/**
 * Sprite-map ids with no living foe behind them.
 *
 * Dead foes linger in `enemies` until they leave the camera (their sprites are
 * already destroyed), so callers must not skip this sweep when
 * `spriteIds.length <= enemies.length` — that comparison hides orphans.
 *
 * @param {Iterable<{ id: number, alive?: boolean }>} enemies
 * @param {Iterable<number>} spriteIds
 * @returns {number[]}
 */
export function orphanedEnemySpriteIds(enemies, spriteIds) {
  const live = new Set();
  for (const e of enemies) {
    if (e?.alive) live.add(e.id);
  }
  /** @type {number[]} */
  const orphaned = [];
  for (const id of spriteIds) {
    if (!live.has(id)) orphaned.push(id);
  }
  return orphaned;
}

/**
 * Rooms that should (re)spawn enemies.
 *
 * @param {object} opts
 * @param {number[]} opts.candidateRooms
 * @param {number} opts.currentRoomId
 * @param {Set<number>} opts.visited
 * @param {Set<number>} opts.spawnedRooms
 * @param {Set<number>} opts.clearedRooms
 * @param {number} opts.worldCamX
 * @param {number} opts.worldCamY
 * @param {Set<number>} [opts.forceRespawn]
 */
export function roomsNeedingSpawn({
  candidateRooms,
  currentRoomId,
  visited,
  spawnedRooms,
  clearedRooms,
  worldCamX,
  worldCamY,
  forceRespawn = new Set(),
}) {
  /** @type {number[]} */
  const need = [];
  const cur = currentRoomId & 0xff;
  for (const id of candidateRooms) {
    const rid = id & 0xff;
    if (!visited.has(rid) && rid !== cur) continue;
    if (spawnedRooms.has(rid) && !forceRespawn.has(rid)) continue;
    if (
      rid !== cur
      && roomFullyOffCamera(rid, worldCamX, worldCamY, 0)
    ) {
      continue;
    }
    // Cleared rooms still get a spawn pass (filters keep persistents only).
    void clearedRooms;
    need.push(rid);
  }
  return need;
}

/**
 * Foes that call `roomId` home, in list order.
 *
 * Every room-scoped rule the NES wrote against its flat object table — "all
 * dead", ringleader slot 1, the key that rides slot 1, Zora's one-per-room
 * slot — has to be asked of this view instead of the whole streamed list, or a
 * neighbour's foes keep the room Link is standing in from ever clearing.
 * Untagged foes count as members: caves and single-screen modes never tag.
 *
 * @template {{ homeRoomId?: number | null }} T
 * @param {readonly T[] | null | undefined} enemies
 * @param {number} roomId
 * @returns {T[]}
 */
export function enemiesInRoom(enemies, roomId) {
  const id = roomId & 0xff;
  return (enemies ?? []).filter(
    (e) => ((e?.homeRoomId ?? id) & 0xff) === id,
  );
}

/**
 * True when no living foe claims `roomId` as home.
 * @param {Iterable<object>} enemies
 * @param {number} roomId
 */
export function roomHasLivingEnemies(enemies, roomId) {
  const id = roomId & 0xff;
  for (const e of enemies) {
    if (e?.alive && (e.homeRoomId ?? -1) === id) return true;
  }
  return false;
}

/**
 * After a room fully leaves the camera, allow regeneration on the next visit.
 * Keep the latch while any living home foes remain (they may have chased onto
 * the current screen) — otherwise walking a seam back and forth respawns
 * stacks of the same room's monsters.
 *
 * Spawn-point claims clear with the latch: a killed foe's point cannot refill
 * until its home room has gone fully off-camera (and any stragglers are gone).
 *
 * @param {Set<number>} spawnedRooms
 * @param {Iterable<number>} roomIds
 * @param {number} worldCamX
 * @param {number} worldCamY
 * @param {number} [_currentRoomId]
 * @param {{ enemies?: Iterable<object>, spawnClaims?: Set<number> }} [opts]
 */
export function releaseSpawnLatch(
  spawnedRooms,
  roomIds,
  worldCamX,
  worldCamY,
  _currentRoomId,
  opts = {},
) {
  const enemies = opts.enemies;
  const spawnClaims = opts.spawnClaims;
  for (const id of [...roomIds]) {
    const rid = id & 0xff;
    if (!roomFullyOffCamera(rid, worldCamX, worldCamY, 8)) continue;
    if (enemies && roomHasLivingEnemies(enemies, rid)) continue;
    spawnedRooms.delete(rid);
    if (spawnClaims) clearSpawnClaimsForRoom(spawnClaims, rid);
  }
}

/**
 * Expanded wander bounds so active enemies can chase across room seams while
 * remaining near the visible playfield (Y includes HUD_HEIGHT).
 * @param {number} camLocalX
 * @param {number} camLocalY
 */
export function chaseBoundsForCamera(camLocalX, camLocalY) {
  // Keep foes inside the camera view ± a small chase margin. The previous
  // PLAY_H-sized pad let them wander deep into off-screen solid forests.
  const pad = 24;
  return {
    minX: camLocalX - pad,
    maxX: camLocalX + PLAY_W + pad,
    minY: camLocalY + 0x40 - pad,
    maxY: camLocalY + 0x40 + PLAY_H + pad,
  };
}

/**
 * Maze wrap: place Link on the opposite edge of the same room (NES loop).
 * @param {{ x: number, y: number }} link
 * @param {number} dir exit direction that was denied
 */
export function mazeLoopSpawn(link, dir) {
  if (dir & DIR.LEFT) link.x = 0xe0;
  else if (dir & DIR.RIGHT) link.x = 0x10;
  else if (dir & DIR.UP) link.y = 0xcd;
  else if (dir & DIR.DOWN) link.y = 0x4d;
}
