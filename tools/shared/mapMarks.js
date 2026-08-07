/**
 * Phase 19 overworld map markers.
 *
 * Two kinds of mark sit on the status-bar radar:
 *   `dungeon` — the labyrinth the player should be heading for right now,
 *               derived from which Triforce shards they already carry.
 *   `hint`    — a place an NPC has actually told them about. It disappears on
 *               its own once the thing it points at has been collected.
 *
 * Screens are looked up from the extracted overworld table rather than baked
 * in, so a re-extract keeps the marks honest. The quest's `ignoreSecret` flag
 * is what separates a real entrance from the same cave id on a screen the
 * current quest never opens (level 5 claims `$0B` and `$1B`; only `$0B` is
 * reachable in quest 1).
 */

import { stairsRoomsForCellar } from './dungeonCellar.js';
import { hasTriforce, triforceCount } from './inventory.js';

export const MARK_KIND = Object.freeze({
  DUNGEON: 'dungeon',
  HINT: 'hint',
});

/**
 * Conditions that retire a hint mark, by name. `story/` entries reference
 * these through their `clears` field.
 * @type {Record<string, (inv: object) => boolean>}
 */
export const CLEAR_CONDITIONS = Object.freeze({
  whiteSword: (inv) => (inv.sword ?? 0) >= 2,
  magicSword: (inv) => (inv.sword ?? 0) >= 3,
  /** Letter shown (potion unlocked) or a potion already in the bag. */
  potionShopOpen: (inv) => (inv.letter ?? 0) >= 2 || (inv.potion ?? 0) > 0,
  letter: (inv) => (inv.letter ?? 0) >= 1,
  bracelet: (inv) => Boolean(inv.bracelet),
  raft: (inv) => Boolean(inv.raft),
  ladder: (inv) => Boolean(inv.ladder),
  recorder: (inv) => Boolean(inv.flute),
  bow: (inv) => Boolean(inv.bow),
  redCandle: (inv) => (inv.candle ?? 0) >= 2,
  magicShield: (inv) => Boolean(inv.magicShield),
  blueRing: (inv) => (inv.ring ?? 0) >= 1,
  redRing: (inv) => (inv.ring ?? 0) >= 2,
});

/**
 * Screen attributes live under `attrs` in `overworld/overworld_index.json` and
 * flat on the entry in the lighter `play/world_index.json` the game loads.
 * @param {object} screen
 */
function screenAttrs(screen) {
  return screen?.attrs ?? screen ?? {};
}

/**
 * True when this screen's cave is reachable in the given quest.
 * @param {object} screen
 * @param {number} quest
 */
function openInQuest(screen, quest) {
  const attrs = screenAttrs(screen);
  return quest === 2 ? !attrs.ignoreSecretQ2 : !attrs.ignoreSecretQ1;
}

/**
 * Overworld screens holding a given cave id.
 * @param {Array<{ mapIndex: number }>} screens
 * @param {number} caveId
 * @param {number} [quest=1]
 * @returns {number[]} screen ids, ascending
 */
export function caveScreens(screens, caveId, quest = 1) {
  /** @type {number[]} */
  const out = [];
  for (const screen of screens ?? []) {
    if ((screenAttrs(screen).caveId ?? 0) !== caveId) continue;
    if (!openInQuest(screen, quest)) continue;
    out.push(screen.mapIndex);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Dungeon entrance screen per level (cave ids 1–9).
 * @param {Array<{ mapIndex: number, attrs?: object }>} screens
 * @param {number} [quest=1]
 * @returns {Map<number, number>} level → screen id
 */
export function levelEntranceScreens(screens, quest = 1) {
  /** @type {Map<number, number>} */
  const out = new Map();
  for (let level = 1; level <= 9; level += 1) {
    const found = caveScreens(screens, level, quest);
    if (found.length) out.set(level, found[0]);
  }
  return out;
}

/**
 * The labyrinth the player should be heading for: the lowest-numbered one
 * whose shard is still missing, or 9 once all eight are in hand.
 * @param {object} inv
 * @returns {number | null}
 */
export function nextDungeonLevel(inv) {
  for (let level = 1; level <= 8; level += 1) {
    if (!hasTriforce(inv, level)) return level;
  }
  return triforceCount(inv) >= 8 && !inv.triforceOfPower ? 9 : null;
}

/**
 * Serialize one overworld hint mark for the save file / dedupe set.
 * @param {number} roomId
 * @param {string} [clears]
 */
export function hintMarkKey(roomId, clears = '') {
  return `${roomId & 0xff}:${clears ?? ''}`;
}

/**
 * Serialize one underworld (dungeon map) hint mark.
 * Prefixed so it never collides with an overworld screen id.
 * @param {number} level
 * @param {number} roomId
 * @param {string} [clears]
 */
export function dungeonHintMarkKey(level, roomId, clears = '') {
  return `d:${level & 0xff}:${roomId & 0xff}:${clears ?? ''}`;
}

/**
 * @param {string} key
 * @returns {{ scope: 'overworld'|'dungeon', roomId: number, clears: string, level?: number } | null}
 */
export function parseHintMarkKey(key) {
  const s = String(key ?? '');
  if (s.startsWith('d:')) {
    const parts = s.split(':');
    if (parts.length < 3) return null;
    const level = Number.parseInt(parts[1], 10);
    const roomId = Number.parseInt(parts[2], 10);
    const clears = parts.slice(3).join(':');
    if (!Number.isFinite(level) || !Number.isFinite(roomId)) return null;
    return {
      scope: 'dungeon',
      level: level & 0xff,
      roomId: roomId & 0xff,
      clears,
    };
  }
  const [id, clears = ''] = s.split(':');
  const roomId = Number.parseInt(id, 10);
  if (!Number.isFinite(roomId)) return null;
  return { scope: 'overworld', roomId: roomId & 0xff, clears };
}

/**
 * Room holding a floor item type inside a level pack.
 * @param {{ rooms?: { roomId: number, floorItem?: { itemType?: number } }[] } | null | undefined} levelData
 * @param {number} itemType
 * @returns {number | null}
 */
export function floorItemRoomId(levelData, itemType) {
  const want = itemType & 0xff;
  for (const room of levelData?.rooms ?? []) {
    if ((room.floorItem?.itemType ?? -1) === want) return room.roomId & 0xff;
  }
  return null;
}

/**
 * Room id to paint on the dungeon minimap for a tip.
 * Cellars are off-map, so treasure stored there remaps to the stairs room.
 * @param {object | null | undefined} levelData
 * @param {number} roomId
 * @returns {number | null}
 */
export function dungeonMinimapRoomFor(levelData, roomId) {
  if (!Number.isFinite(roomId)) return null;
  const id = roomId & 0xff;
  const cellars = levelData?.cellarRooms ?? [];
  if (!cellars.some((c) => Number(c) === id)) return id;
  const stairs = stairsRoomsForCellar(levelData, id);
  return stairs[0] ?? null;
}

/**
 * Turn a `story/` mark descriptor into concrete screens / dungeon rooms.
 * @param {{ screen?: number, caveId?: number, level?: number, dungeonLevel?: number, roomId?: number, itemType?: number, clears?: string, label?: string }} mark
 * @param {{ screens?: Array<object>, quest?: number, entrances?: Map<number, number>, levelData?: object, levelDataByLevel?: Map<number, object> }} ctx
 * @returns {{ scope: 'overworld'|'dungeon', roomId: number, clears: string, label: string, level?: number }[]}
 */
export function resolveMark(mark, ctx = {}) {
  if (!mark) return [];
  const quest = ctx.quest ?? 1;
  const clears = mark.clears ?? '';
  const label = mark.label ?? '';

  if (Number.isFinite(mark.dungeonLevel)) {
    const level = Number(mark.dungeonLevel) & 0xff;
    const pack =
      ctx.levelDataByLevel?.get?.(level)
      ?? (
        Number(ctx.levelData?.level ?? ctx.levelData?.levelNumber) === level
          ? ctx.levelData
          : null
      );
    let roomId = Number.isFinite(mark.roomId) ? Number(mark.roomId) & 0xff : null;
    if (roomId == null && Number.isFinite(mark.itemType)) {
      roomId = floorItemRoomId(pack, Number(mark.itemType));
    }
    roomId = dungeonMinimapRoomFor(pack, roomId);
    if (roomId == null) return [];
    return [{ scope: 'dungeon', level, roomId, clears, label }];
  }

  /** @type {number[]} */
  let rooms = [];
  if (Number.isFinite(mark.screen)) {
    rooms = [Number(mark.screen) & 0xff];
  } else if (Number.isFinite(mark.caveId)) {
    rooms = caveScreens(ctx.screens ?? [], Number(mark.caveId), quest);
  } else if (Number.isFinite(mark.level)) {
    const entrances = ctx.entrances ?? levelEntranceScreens(ctx.screens ?? [], quest);
    const room = entrances.get(Number(mark.level));
    rooms = room == null ? [] : [room];
  }
  return rooms.map((roomId) => ({
    scope: 'overworld',
    roomId,
    clears,
    label,
  }));
}

/**
 * Add every screen a descriptor resolves to into `state`.
 * @param {Set<string>} state hint-mark keys
 * @param {Array<object> | undefined} marks
 * @param {{ screens?: Array<object>, quest?: number, entrances?: Map<number, number>, inv?: object, levelData?: object, levelDataByLevel?: Map<number, object> }} ctx
 * @returns {{ scope: string, roomId: number, clears: string, label: string, level?: number }[]} marks that were newly placed
 */
export function addHintMarks(state, marks, ctx = {}) {
  /** @type {{ scope: string, roomId: number, clears: string, label: string, level?: number }[]} */
  const added = [];
  for (const mark of marks ?? []) {
    for (const resolved of resolveMark(mark, ctx)) {
      // Already collected? Then the hint is stale before it is ever drawn.
      const done = resolved.clears && CLEAR_CONDITIONS[resolved.clears]?.(ctx.inv ?? {});
      if (done) continue;
      const key =
        resolved.scope === 'dungeon'
          ? dungeonHintMarkKey(resolved.level ?? 0, resolved.roomId, resolved.clears)
          : hintMarkKey(resolved.roomId, resolved.clears);
      if (state.has(key)) continue;
      state.add(key);
      added.push(resolved);
    }
  }
  return added;
}

/**
 * Drop hint marks whose item has since been collected.
 * @param {Set<string>} state
 * @param {object} inv
 * @returns {number} number of marks retired
 */
export function pruneHintMarks(state, inv) {
  let removed = 0;
  for (const key of [...state]) {
    const parsed = parseHintMarkKey(key);
    if (!parsed?.clears) continue;
    if (CLEAR_CONDITIONS[parsed.clears]?.(inv)) {
      state.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Everything the status-bar radar should draw.
 *
 * The dungeon mark wins when a hint sits on the same screen, so the player
 * never loses sight of where they are supposed to be going.
 *
 * @param {object} opts
 * @param {object} opts.inv
 * @param {Set<string>} [opts.hintMarks]
 * @param {Array<object>} [opts.screens]
 * @param {Map<number, number>} [opts.entrances]
 * @param {number} [opts.quest]
 * @returns {{ roomId: number, kind: string, level?: number }[]}
 */
export function activeMapMarks(opts) {
  const inv = opts.inv ?? {};
  const quest = opts.quest ?? inv.quest ?? 1;
  const entrances =
    opts.entrances ?? levelEntranceScreens(opts.screens ?? [], quest);

  /** @type {Map<number, { roomId: number, kind: string, level?: number }>} */
  const byRoom = new Map();

  for (const key of opts.hintMarks ?? []) {
    const parsed = parseHintMarkKey(key);
    if (!parsed || parsed.scope === 'dungeon') continue;
    if (parsed.clears && CLEAR_CONDITIONS[parsed.clears]?.(inv)) continue;
    byRoom.set(parsed.roomId, { roomId: parsed.roomId, kind: MARK_KIND.HINT });
  }

  const level = nextDungeonLevel(inv);
  const room = level == null ? null : entrances.get(level);
  if (room != null) {
    byRoom.set(room, { roomId: room, kind: MARK_KIND.DUNGEON, level });
  }

  return [...byRoom.values()].sort((a, b) => a.roomId - b.roomId);
}

/**
 * Hint marks for the underworld status-bar / submenu map of `level`.
 * @param {Iterable<string> | null | undefined} hintMarks
 * @param {number} level
 * @param {object} [inv]
 * @param {object | null} [levelData] when set, cellar room ids remap to stairs rooms
 * @returns {{ roomId: number, kind: string, clears: string }[]}
 */
export function activeDungeonHintMarks(hintMarks, level, inv = {}, levelData = null) {
  const want = level & 0xff;
  /** @type {Map<number, { roomId: number, kind: string, clears: string }>} */
  const byRoom = new Map();
  for (const key of hintMarks ?? []) {
    const parsed = parseHintMarkKey(key);
    if (!parsed || parsed.scope !== 'dungeon') continue;
    if ((parsed.level ?? -1) !== want) continue;
    if (parsed.clears && CLEAR_CONDITIONS[parsed.clears]?.(inv)) continue;
    const roomId = dungeonMinimapRoomFor(levelData, parsed.roomId) ?? parsed.roomId;
    byRoom.set(roomId, { roomId, kind: MARK_KIND.HINT, clears: parsed.clears });
  }
  return [...byRoom.values()].sort((a, b) => a.roomId - b.roomId);
}
