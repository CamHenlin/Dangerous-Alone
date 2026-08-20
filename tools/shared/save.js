/**
 * Battery-backed save slots (localStorage). Pure serialize/hydrate for tests.
 */

import { DIR } from './collision.js';
import { CONTINUE_HALF_HEARTS } from './continueMenu.js';
import {
  doorSlotKey,
  dungeonNeighbor,
  oppositeSide,
} from './dungeonDoors.js';
import { createInventory, triforceCount } from './inventory.js';

export const SAVE_VERSION = 2;
/** Files written before the party snapshot. Still loadable. */
export const LEGACY_SAVE_VERSION = 1;

/**
 * @param {unknown} version
 */
export function acceptedSaveVersion(version) {
  return version === SAVE_VERSION || version === LEGACY_SAVE_VERSION;
}
export const SLOT_COUNT = 3;
export const SLOT_KEY_PREFIX = 'zelda_slot_';

/** Inventory fields persisted across sessions (skip ephemeral combat state). */
export const PERSISTED_INV_KEYS = Object.freeze([
  'sword',
  'bombs',
  'maxBombs',
  'candle',
  'boomerang',
  'magicBoomerang',
  'magicShield',
  'food',
  'bow',
  'arrow',
  'raft',
  'ladder',
  'flute',
  'rod',
  'book',
  'bracelet',
  'map',
  'compass',
  'letter',
  'potion',
  'ring',
  'magicKey',
  'triforce',
  'triforceOfPower',
  'quest',
  'selectedB',
  'halfHearts',
  'maxHalfHearts',
  'rupees',
  'keys',
]);

/**
 * Registering this name starts the file on the second quest
 * (`@CompareToZelda` @ `Z_02.asm:1683`).
 */
export const SECOND_QUEST_NAME = 'ZELDA';

/**
 * @param {number} slot 0–2
 */
export function slotStorageKey(slot) {
  return `${SLOT_KEY_PREFIX}${slot}`;
}

/**
 * True when a freshly registered name unlocks the second quest.
 * The ROM compares exactly 5 characters, so trailing spaces still match.
 * @param {string} name
 */
export function nameUnlocksSecondQuest(name) {
  const padded = String(name ?? '').toUpperCase();
  return padded.slice(0, SECOND_QUEST_NAME.length) === SECOND_QUEST_NAME;
}

/**
 * `SwitchProfileToSecondQuest` @ `Z_02.asm:4037`: wipe world flags and items,
 * restore 3 hearts / 3 containers and 8 max bombs, and flag the quest.
 * @param {object} inv mutated
 */
export function resetProfileToSecondQuest(inv) {
  const fresh = createInventory();
  for (const key of PERSISTED_INV_KEYS) {
    inv[key] = fresh[key];
  }
  inv.quest = 2;
  // HeartValues $22 + HeartPartial $FF → 3 containers, all full.
  inv.maxHalfHearts = 6;
  inv.halfHearts = 6;
  inv.maxBombs = 8;
  return inv;
}

/**
 * @param {object} inv
 */
export function snapshotInventory(inv) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of PERSISTED_INV_KEYS) {
    out[key] = inv[key];
  }
  return out;
}

/**
 * @param {object} inv target (mutated)
 * @param {object} snap
 */
export function applyInventorySnapshot(inv, snap) {
  if (!snap || typeof snap !== 'object') return inv;
  for (const key of PERSISTED_INV_KEYS) {
    if (snap[key] !== undefined) inv[key] = snap[key];
  }
  inv.invuln = 0;
  inv.shoveDir = 0;
  inv.shovePixels = 0;
  inv.dead = false;
  return inv;
}

/**
 * @param {Iterable<number|string>} setLike
 */
function toSortedArray(setLike) {
  return [...setLike].map(String).sort();
}

/**
 * Dungeon progress map key — quest-scoped so Q1/Q2 don't collide.
 * @param {number} quest
 * @param {number} level
 */
export function dungeonProgressKey(quest, level) {
  return `${quest === 2 ? 2 : 1}:${level}`;
}

/**
 * @param {string | number} key
 * @returns {{ quest: number, level: number } | null}
 */
export function parseDungeonProgressKey(key) {
  const s = String(key);
  if (s.includes(':')) {
    const [q, l] = s.split(':').map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(l)) return null;
    return { quest: q, level: l };
  }
  const level = Number(s);
  if (!Number.isFinite(level)) return null;
  // Legacy Phase-12 saves: bare level number ⇒ Quest 1.
  return { quest: 1, level };
}

/**
 * @param {Map<string|number, object> | Record<string, object> | undefined} progress
 */
export function serializeDungeonProgress(progress) {
  /** @type {Record<string, object>} */
  const out = {};
  if (!progress) return out;
  const entries =
    progress instanceof Map ? progress.entries() : Object.entries(progress);
  for (const [key, data] of entries) {
    if (!data) continue;
    const parsed = parseDungeonProgressKey(key);
    const outKey = parsed ? dungeonProgressKey(parsed.quest, parsed.level) : String(key);
    out[outKey] = {
      cleared: toSortedArray(data.cleared ?? data.clearedRooms ?? []),
      taken: toSortedArray(data.taken ?? data.takenItems ?? []),
      visited: toSortedArray(data.visited ?? data.visitedRooms ?? []),
      pushed: toSortedArray(data.pushed ?? data.pushedRooms ?? []),
      doors: toSortedArray(data.doors ?? data.doorState?.open ?? []),
      lastBoss: Boolean(data.lastBoss ?? data.lastBossDefeated),
      map: Number(data.map ?? 0),
      compass: Number(data.compass ?? 0),
    };
  }
  return out;
}

/**
 * @param {Record<string, object> | undefined} snap
 * @returns {Map<string, object>}
 */
export function hydrateDungeonProgress(snap) {
  /** @type {Map<string, object>} */
  const map = new Map();
  if (!snap || typeof snap !== 'object') return map;
  for (const [key, data] of Object.entries(snap)) {
    const parsed = parseDungeonProgressKey(key);
    if (!parsed || !data) continue;
    map.set(dungeonProgressKey(parsed.quest, parsed.level), {
      cleared: new Set((data.cleared ?? []).map(Number)),
      taken: new Set((data.taken ?? []).map(Number)),
      visited: new Set((data.visited ?? []).map(Number)),
      pushed: new Set((data.pushed ?? []).map(Number)),
      doors: new Set(data.doors ?? []),
      lastBoss: Boolean(data.lastBoss),
      map: Number(data.map ?? 0),
      compass: Number(data.compass ?? 0),
    });
  }
  return map;
}

/**
 * Full runtime → JSON-ready payload.
 * @param {object} state
 */
export function serializeGameState(state) {
  const inv = state.inv ?? createInventory();
  return {
    version: SAVE_VERSION,
    name: String(state.name ?? 'LINK').slice(0, 8).toUpperCase(),
    savedAt: state.savedAt ?? Date.now(),
    /** Per-profile `DeathCounts`, capped at $FF like the ROM. */
    deaths: Math.min(0xff, Math.max(0, Number(state.deaths ?? 0) | 0)),
    inv: snapshotInventory(inv),
    position: {
      mode: state.mode ?? 'overworld',
      roomId: Number(state.roomId ?? 0),
      x: Number(state.x ?? 0x40),
      y: Number(state.y ?? 0x8d),
      dir: Number(state.dir ?? 1),
      caveReturn: state.caveReturn
        ? {
            roomId: Number(state.caveReturn.roomId),
            x: Number(state.caveReturn.x),
            y: Number(state.caveReturn.y),
            dir: Number(state.caveReturn.dir),
          }
        : null,
      dungeon: state.dungeon
        ? {
            level: Number(state.dungeon.level),
            fromRoomId: Number(state.dungeon.fromRoomId),
            roomId: Number(state.dungeon.roomId ?? state.roomId),
          }
        : null,
    },
    owSecretsRevealed: toSortedArray(state.owSecretsRevealed ?? []),
    caveTaken: toSortedArray(state.caveTaken ?? []),
    /** OW room-item flag (NES `$067F+`); currently the `$5F` dock heart. */
    owItemsTaken: toSortedArray(state.owItemsTaken ?? []),
    /** Phase 19: OW (`roomId:condition`) and UW (`d:level:roomId:condition`) tip marks. */
    hintMarks: toSortedArray(state.hintMarks ?? []),
    /** Phase 22: one-shot story beats already spoken (`item:10`, `level:3`). */
    toldStory: toSortedArray(state.toldStory ?? []),
    dungeons: serializeDungeonProgress(state.dungeonProgress),
    /**
     * Everyone who was sitting down. Player one's hearts and pose are
     * also on `inv` / `position`, so a reader that only knows version 1
     * still gets a complete single-hero file.
     */
    party: Array.isArray(state.party) ? state.party : [],
  };
}

/**
 * @param {object} payload
 */
export function slotSummary(payload) {
  if (!payload?.inv) return null;
  const inv = { ...createInventory(), ...payload.inv };
  return {
    name: payload.name ?? 'LINK',
    hearts: Math.ceil((inv.halfHearts ?? 0) / 2),
    maxHearts: Math.floor((inv.maxHalfHearts ?? 0) / 2),
    triforce: triforceCount(inv),
    quest: inv.quest ?? 1,
    deaths: payload.deaths ?? 0,
    savedAt: payload.savedAt ?? 0,
  };
}

/** `INC DeathCounts, X` with the ROM's $FF ceiling. */
export function incrementDeathCount(deaths) {
  const n = Number(deaths ?? 0) | 0;
  return n >= 0xff ? 0xff : n + 1;
}

/**
 * @param {Storage | { getItem(k:string): string|null, setItem(k:string,v:string): void, removeItem(k:string): void }} storage
 */
export function createSaveStore(storage = globalThis.localStorage) {
  function readRaw(slot) {
    try {
      const raw = storage.getItem(slotStorageKey(slot));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !acceptedSaveVersion(data.version)) return null;
      return data;
    } catch {
      return null;
    }
  }

  return {
    /**
     * @returns {Array<object | null>}
     */
    listSlots() {
      return Array.from({ length: SLOT_COUNT }, (_, i) => {
        const raw = readRaw(i);
        return raw ? slotSummary(raw) : null;
      });
    },
    /**
     * @param {number} slot
     */
    load(slot) {
      return readRaw(slot);
    },
    /**
     * @param {number} slot
     * @param {object} state runtime fields for serializeGameState
     */
    save(slot, state) {
      const payload = serializeGameState(state);
      storage.setItem(slotStorageKey(slot), JSON.stringify(payload));
      return payload;
    },
    /**
     * @param {number} slot
     */
    erase(slot) {
      storage.removeItem(slotStorageKey(slot));
    },
    /**
     * Update display name only (keeps progress).
     * @param {number} slot
     * @param {string} name
     */
    rename(slot, name) {
      const data = readRaw(slot);
      if (!data) return null;
      data.name = String(name ?? 'LINK').slice(0, 8).toUpperCase();
      storage.setItem(slotStorageKey(slot), JSON.stringify(data));
      return data;
    },
  };
}

/**
 * Apply a loaded payload onto mutable runtime bags.
 * @param {object} payload
 * @param {object} target
 * @param {object} target.inv
 * @param {Set<string>} target.owSecretsRevealed
 * @param {Set<string>} target.caveTaken
 * @param {Set<number>} [target.owItemsTaken]
 * @param {Set<string>} [target.hintMarks]
 * @param {Set<string>} [target.toldStory]
 * @param {Map<number, object>} target.dungeonProgress
 */
export function applyLoadedSave(payload, target) {
  applyInventorySnapshot(target.inv, payload.inv);
  target.owSecretsRevealed.clear();
  for (const k of payload.owSecretsRevealed ?? []) target.owSecretsRevealed.add(k);
  target.caveTaken.clear();
  for (const k of payload.caveTaken ?? []) target.caveTaken.add(k);
  // Pre-OW-heart saves omit this; empty set = heart still on the dock.
  target.owItemsTaken?.clear();
  for (const id of payload.owItemsTaken ?? []) {
    target.owItemsTaken?.add(Number(id) & 0xff);
  }
  // Saves written before Phase 19 have no marks; the radar just starts clean.
  target.hintMarks?.clear();
  for (const k of payload.hintMarks ?? []) target.hintMarks?.add(k);
  // Pre-Phase-22 saves have no record of what was said. An empty set means a
  // resumed run may hear one item introduced twice, which beats never hearing
  // any of them because the file predates the field.
  target.toldStory?.clear();
  for (const k of payload.toldStory ?? []) target.toldStory?.add(String(k));
  target.dungeonProgress.clear();
  for (const [level, data] of hydrateDungeonProgress(payload.dungeons)) {
    target.dungeonProgress.set(level, data);
  }
  return {
    name: payload.name ?? 'LINK',
    deaths: payload.deaths ?? 0,
    position: payload.position ?? {
      mode: 'overworld',
      roomId: 0x77,
      x: 0x40,
      y: 0x8d,
      dir: 1,
      caveReturn: null,
      dungeon: null,
    },
    party: Array.isArray(payload.party) ? payload.party : [],
  };
}

/** Quest-scoped L9 anchors for Ganon / Zelda (after `finalizeLevelMeta`). */
const L9_ENCOUNTER = Object.freeze({
  1: { bossRoom: 0x42, zeldaRoom: 0x32 },
  2: { bossRoom: 0x17, zeldaRoom: 0x07 },
});

/**
 * Drop door slots on the Zelda side of Ganon's room (not the fight entrance).
 * @param {Iterable<string> | undefined} doors
 * @param {number} bossRoom
 * @param {number} zeldaRoom
 * @returns {string[]}
 */
export function closeBossApproachDoors(doors, bossRoom, zeldaRoom) {
  const boss = bossRoom & 0xff;
  const zelda = zeldaRoom & 0xff;
  const blocked = new Set();
  for (const [side, dir] of [
    ['north', DIR.UP],
    ['south', DIR.DOWN],
    ['west', DIR.LEFT],
    ['east', DIR.RIGHT],
  ]) {
    const next = dungeonNeighbor(boss, dir);
    if (next !== zelda) continue;
    blocked.add(doorSlotKey(boss, side));
    blocked.add(doorSlotKey(next, oppositeSide(side)));
  }
  return [...(doors ?? [])].filter((k) => !blocked.has(String(k))).sort();
}

/**
 * Rewind a save so Ganon can be fought again and Zelda rescued again.
 * Clears Triforce of Power, L9 lastBoss, boss-room clear/taken, and approach
 * shutters. Does not touch other dungeon progress. Mutates `payload`.
 *
 * @param {object} payload serializeGameState-shaped save
 * @param {{ bossRoom?: number, zeldaRoom?: number, parkSouthOfBoss?: boolean }} [opts]
 * @returns {{ changed: boolean, bossRoom: number, zeldaRoom: number }}
 */
export function resetGanonEncounter(payload, opts = {}) {
  if (!payload?.inv || !payload.dungeons) {
    return { changed: false, bossRoom: 0, zeldaRoom: 0 };
  }
  const quest = payload.inv.quest === 2 ? 2 : 1;
  const anchors = L9_ENCOUNTER[quest];
  const bossRoom = (opts.bossRoom ?? anchors.bossRoom) & 0xff;
  const zeldaRoom = (opts.zeldaRoom ?? anchors.zeldaRoom) & 0xff;
  const key = dungeonProgressKey(quest, 9);
  const d9 = payload.dungeons[key];
  if (!d9 && !payload.inv.triforceOfPower) {
    return { changed: false, bossRoom, zeldaRoom };
  }
  const progress = d9 ?? {
    cleared: [],
    taken: [],
    visited: [],
    pushed: [],
    doors: [],
    lastBoss: false,
    map: 0,
    compass: 0,
  };
  payload.dungeons[key] = progress;

  const rewindRooms = new Set([bossRoom, zeldaRoom]);
  const hadTop = Boolean(payload.inv.triforceOfPower);
  const hadBoss = Boolean(progress.lastBoss);
  const hadCleared = (progress.cleared ?? []).some((x) =>
    rewindRooms.has(Number(x)),
  );
  const hadTaken = (progress.taken ?? []).some((x) => rewindRooms.has(Number(x)));

  payload.inv.triforceOfPower = 0;
  progress.lastBoss = false;
  // Un-clear Ganon and Zelda rooms so both re-spawn after the fight.
  progress.cleared = [...(progress.cleared ?? [])]
    .filter((x) => !rewindRooms.has(Number(x)))
    .map(String)
    .sort();
  progress.taken = [...(progress.taken ?? [])]
    .filter((x) => !rewindRooms.has(Number(x)))
    .map(String)
    .sort();
  const doorsBefore = [...(progress.doors ?? [])].map(String).sort().join(',');
  progress.doors = closeBossApproachDoors(progress.doors, bossRoom, zeldaRoom);
  const doorsAfter = progress.doors.join(',');

  // Park south of Ganon (Q1) / west approach (Q2) facing the boss room so a
  // Continue drops you ready to re-enter — never inside Zelda's cell.
  if (opts.parkSouthOfBoss !== false && payload.position?.dungeon?.level === 9) {
    const south = dungeonNeighbor(bossRoom, DIR.DOWN);
    const west = dungeonNeighbor(bossRoom, DIR.LEFT);
    const park = south ?? west;
    if (park != null) {
      payload.position.mode = 'dungeon';
      payload.position.roomId = park;
      payload.position.x = 0x78;
      payload.position.y = 0x8d;
      payload.position.dir = south != null ? DIR.UP : DIR.RIGHT;
      payload.position.dungeon = {
        level: 9,
        fromRoomId: Number(payload.position.dungeon.fromRoomId ?? 0),
        roomId: park,
      };
    }
  }

  payload.savedAt = Date.now();
  const changed =
    hadTop
    || hadBoss
    || hadCleared
    || hadTaken
    || doorsBefore !== doorsAfter;
  return { changed, bossRoom, zeldaRoom };
}

/**
 * Apply {@link resetGanonEncounter} to every occupied file slot (+ practice).
 * @param {Storage | { getItem(k:string): string|null, setItem(k:string,v:string): void }} [storage]
 * @returns {{ slots: number[], practice: boolean }}
 */
export function resetGanonEncounterInStorage(storage = globalThis.localStorage) {
  /** @type {number[]} */
  const slots = [];
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const key = slotStorageKey(slot);
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const payload = JSON.parse(raw);
      if (!acceptedSaveVersion(payload?.version)) continue;
      const { changed } = resetGanonEncounter(payload);
      if (!changed) continue;
      storage.setItem(key, JSON.stringify(payload));
      slots.push(slot);
    } catch {
      // skip corrupt slot
    }
  }
  let practice = false;
  try {
    const raw = storage.getItem('zelda_practice');
    if (raw) {
      const payload = JSON.parse(raw);
      const { changed } = resetGanonEncounter(payload);
      if (changed) {
        storage.setItem('zelda_practice', JSON.stringify(payload));
        practice = true;
      }
    }
  } catch {
    // ignore
  }
  return { slots, practice };
}

/**
 * NES-style continue when a save was written at 0 HP: full heal and relocate
 * to the dungeon entrance (mid-dungeon) or overworld start (OW / cave).
 *
 * @param {object} inv mutated
 * @param {object} position from save
 * @param {{ roomId: number, x: number, y: number, dir: number }} owStart
 * @returns {{ healed: boolean, position: object, atDungeonEntrance: boolean }}
 */
export function resolveZeroHeartContinue(inv, position, owStart) {
  if ((inv.halfHearts ?? 0) > 0) {
    return { healed: false, position, atDungeonEntrance: false };
  }
  // @HandleActivated (`Z_05.asm:2280`): `HeartValues & $F0 | $02` — you always
  // resume on three full hearts, however many containers you own.
  inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
  inv.dead = false;
  inv.invuln = 0;
  inv.shoveDir = 0;
  inv.shovePixels = 0;

  if (position?.mode === 'dungeon' && position.dungeon?.level != null) {
    return {
      healed: true,
      atDungeonEntrance: true,
      position: {
        mode: 'dungeon',
        roomId: position.dungeon.fromRoomId ?? owStart.roomId,
        x: owStart.x,
        y: owStart.y,
        dir: owStart.dir,
        caveReturn: null,
        dungeon: {
          level: Number(position.dungeon.level),
          fromRoomId: Number(position.dungeon.fromRoomId ?? 0),
          // No roomId → caller resumes at LevelInfo start room.
        },
      },
    };
  }

  return {
    healed: true,
    atDungeonEntrance: false,
    position: {
      mode: 'overworld',
      roomId: owStart.roomId,
      x: owStart.x,
      y: owStart.y,
      dir: owStart.dir,
      caveReturn: null,
      dungeon: null,
    },
  };
}
