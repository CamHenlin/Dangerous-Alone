/**
 * Phase 19 story resolver.
 *
 * Sits between the editable prose in `story/` and the play loop. Every lookup
 * falls back to the original ROM string, so deleting an entry from `story/`
 * restores the 1986 line rather than blanking the box.
 *
 * All of this is pure — the pages it returns are handed to
 * `textBoxModel.openTextBox`.
 */

import { STORY } from '../../story/index.js';
import { CLEAR_CONDITIONS } from './mapMarks.js';
import { ROOM_ITEM_NONE } from './roomSecrets.js';
import { textIdForUnderworldPerson } from './personText.js';

/** Triforce shard — never reported as "left behind" by the shard's own briefing. */
const TRIFORCE_ITEM = 0x1b;

/**
 * Coerce a `story/` entry into pages + marks.
 * @param {string[] | { pages?: string[], repeatPages?: string[], lockedPages?: string[], marks?: object[] } | null | undefined} entry
 * @param {{ repeat?: boolean, locked?: boolean }} [opts]
 * @returns {{ pages: string[], marks: object[] } | null}
 */
export function normalizeEntry(entry, opts = {}) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    return entry.length ? { pages: entry.filter(Boolean), marks: [] } : null;
  }
  const pages =
    opts.locked && Array.isArray(entry.lockedPages) && entry.lockedPages.length
      ? entry.lockedPages
      : opts.repeat && Array.isArray(entry.repeatPages) && entry.repeatPages.length
        ? entry.repeatPages
        : entry.pages;
  const clean = (pages ?? []).filter(Boolean);
  if (!clean.length) return null;
  return { pages: clean, marks: entry.marks ?? [] };
}

/**
 * Build the shelf-dependent shop pitch from visible wares.
 * @param {Iterable<{ item?: number, gone?: boolean }>} wares
 * @param {Record<number|string, string>} [blurbs]
 * @param {{ 1?: string, 2?: string, many?: string } | string} [closers]
 * @returns {string | null}
 */
export function buildShopPitch(wares, blurbs = {}, closers = {}) {
  const lines = [];
  for (const slot of wares ?? []) {
    if (!slot || slot.gone) continue;
    const blurb = blurbs[slot.item] ?? blurbs[String(slot.item)];
    if (blurb) lines.push(blurb.replace(/\.\s*$/, ''));
  }
  if (!lines.length) return null;
  let text = `${lines.join('. ')}.`;
  const table = typeof closers === 'string'
    ? { 1: closers, 2: closers, many: closers }
    : (closers ?? {});
  const n = lines.length;
  const tail = (n === 1 ? table[1] : n === 2 ? table[2] : table.many) ?? '';
  if (String(tail).trim()) text = `${text} ${String(tail).trim()}`;
  return text;
}

/**
 * Dialogue for an overworld cave dweller.
 *
 * Shop caves append a second page built from the wares still on the shelf, so
 * the pitch always matches what that merchant is actually selling.
 *
 * @param {{ caveId?: number, textId?: number, kind?: string, textLines?: string[], text?: string }} cave
 * @param {{ repeat?: boolean, locked?: boolean, story?: object, wares?: Iterable<{ item?: number, gone?: boolean }> }} [opts]
 * @returns {{ pages: string[], marks: object[] }}
 */
export function caveStory(cave, opts = {}) {
  const story = opts.story ?? STORY;
  const byCaveId = story.caves?.byCaveId ?? {};
  const byTextId = story.caves?.byTextId ?? {};
  const resolved =
    normalizeEntry(byCaveId[cave?.caveId], opts)
    ?? normalizeEntry(byTextId[cave?.textId], opts);

  let pages;
  let marks;
  if (resolved) {
    pages = resolved.pages;
    marks = resolved.marks;
  } else {
    // ROM fallback: the two pre-broken lines read fine as one page.
    const romLines = Array.isArray(cave?.textLines) && cave.textLines.length
      ? cave.textLines
      : [cave?.text ?? ''];
    const joined = romLines.filter(Boolean).join(' ').trim();
    pages = joined ? [joined] : [];
    marks = [];
  }

  if (cave?.kind === 'shop' && opts.wares && !opts.repeat) {
    const pitch = buildShopPitch(
      opts.wares,
      story.caves?.shopItemBlurbs ?? {},
      story.caves?.shopPitchClosers ?? {},
    );
    if (pitch) pages = [...pages, pitch];
  }

  return { pages, marks };
}

/**
 * When a person entry names `ifMissing`, append those pages/marks if the
 * player does not yet satisfy that `CLEAR_CONDITIONS` check.
 * @param {object | string[] | null | undefined} entry
 * @param {{ pages: string[], marks: object[] }} resolved
 * @param {object | null | undefined} inv
 * @param {number} [level]
 */
function applyMissingItemHint(entry, resolved, inv, level) {
  if (!entry || Array.isArray(entry) || !inv) return resolved;
  const key = entry.ifMissing;
  if (!key || typeof CLEAR_CONDITIONS[key] !== 'function') return resolved;
  if (CLEAR_CONDITIONS[key](inv)) return resolved;
  const byLevel = entry.missingPagesByLevel?.[level] ?? entry.missingPagesByLevel?.[String(level)];
  const extra = (Array.isArray(byLevel) ? byLevel : entry.missingPages ?? []).filter(Boolean);
  if (!extra.length) return resolved;
  return {
    pages: [...resolved.pages, ...extra],
    marks: [...resolved.marks, ...(entry.missingMarks ?? [])],
  };
}

/**
 * Dialogue for an underworld person (old man, bomb trader, money-or-life).
 *
 * @param {number} level
 * @param {number} objType
 * @param {{ romTextLines?: Record<string|number, string[]>, story?: object, inv?: object }} [opts]
 * @returns {{ pages: string[], marks: object[], textId: number | null }}
 */
export function personStory(level, objType, opts = {}) {
  const story = opts.story ?? STORY;
  const textId = textIdForUnderworldPerson(level, objType);
  if (textId == null) return { pages: [], marks: [], textId: null };

  const byLevel = story.persons?.byLevelAndTextId ?? {};
  const byTextId = story.persons?.byTextId ?? {};
  const entry = byLevel[`${level}:${textId}`] ?? byTextId[textId];
  const resolved = normalizeEntry(entry);
  if (resolved) {
    return { ...applyMissingItemHint(entry, resolved, opts.inv, level), textId };
  }

  const romLines = opts.romTextLines?.[textId] ?? opts.romTextLines?.[String(textId)] ?? [];
  const joined = (Array.isArray(romLines) ? romLines : []).filter(Boolean).join(' ').trim();
  return { pages: joined ? [joined] : [], marks: [], textId };
}

/**
 * Floor treasure the player walked past, most important first.
 *
 * Only item types that `story/levels.js` has advice for are reported — keys,
 * rupees and bomb refills are not worth a lecture — and the list is ordered by
 * `MISSED_PRIORITY` so a briefing leads with the thing that will actually
 * block progress.
 *
 * @param {{ rooms?: { roomId: number, floorItem?: { itemType?: number } }[] }} levelData
 * @param {Set<number> | Iterable<number>} takenRooms room ids whose item was picked up
 * @param {{ story?: object }} [opts]
 * @returns {{ roomId: number, itemType: number, advice: string }[]}
 */
export function missedTreasures(levelData, takenRooms, opts = {}) {
  const story = opts.story ?? STORY;
  const advice = story.itemAdvice ?? {};
  const priority = story.missedPriority ?? [];
  const taken = takenRooms instanceof Set ? takenRooms : new Set(takenRooms ?? []);
  /** @type {{ roomId: number, itemType: number, advice: string }[]} */
  const out = [];
  for (const room of levelData?.rooms ?? []) {
    const itemType = room?.floorItem?.itemType ?? ROOM_ITEM_NONE;
    if (itemType === ROOM_ITEM_NONE || itemType === TRIFORCE_ITEM) continue;
    if (taken.has(room.roomId)) continue;
    const line = advice[itemType];
    if (!line) continue;
    out.push({ roomId: room.roomId, itemType, advice: line });
  }
  const rank = (itemType) => {
    const at = priority.indexOf(itemType);
    return at < 0 ? priority.length : at;
  };
  return out.sort((a, b) => rank(a.itemType) - rank(b.itemType) || a.roomId - b.roomId);
}

/**
 * @param {number} level
 * @param {{ story?: object }} [opts]
 */
export function levelDossier(level, opts = {}) {
  const story = opts.story ?? STORY;
  return story.levels?.[level] ?? null;
}

/**
 * The briefing shown when the Triforce shard in `level` is claimed.
 *
 * Order: what this shard means → where the next labyrinth is → what was left
 * behind. The map marks come from the dossier of the level just finished.
 *
 * @param {number} level
 * @param {object} [opts]
 * @param {object} [opts.levelData] extracted level pack, for the missed-item pass
 * @param {Set<number>} [opts.takenRooms]
 * @param {object} [opts.story]
 * @returns {{ pages: string[], marks: object[], nextLevel: number | null, missed: object[] }}
 */
export function levelCompletionStory(level, opts = {}) {
  const story = opts.story ?? STORY;
  const dossier = levelDossier(level, { story });
  const next = levelDossier(level + 1, { story });

  /** @type {string[]} */
  const pages = [];
  pages.push(...(dossier?.onPiece ?? []));
  pages.push(...(next?.brief ?? []));

  const missed = opts.levelData
    ? missedTreasures(opts.levelData, opts.takenRooms ?? new Set(), { story })
    : [];
  if (missed.length) {
    pages.push(story.missedHeader ?? '');
    // Cap the nagging: a briefing should read as advice, not as an audit.
    const shown = missed.slice(0, story.missedMax ?? missed.length);
    for (const entry of shown) pages.push(entry.advice);
    pages.push(story.missedFooter ?? '');
  }

  const marks = [...(dossier?.marks ?? [])];
  return {
    pages: pages.filter(Boolean),
    marks,
    nextLevel: next ? next.level : null,
    missed,
  };
}
