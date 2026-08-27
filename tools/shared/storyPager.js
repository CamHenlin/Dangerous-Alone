/**
 * One story box, many readers.
 *
 * Labyrinth-entry describes the place you just walked into, so only
 * people standing in a labyrinth read it — an ally still on the beach
 * must not get "THE AIR CHANGES ON THE FIRST STAIR". Briefings are the
 * plot for the whole party (except a cave visitor, who has their own
 * old man). Each reader turns their own pages; the world stays frozen
 * until the last one has closed their copy. Ordinary NPC talk does not
 * go through here.
 */

function worldId(p) {
  return String(p?.world?.id ?? p?.worldId ?? '');
}

function worldMode(p) {
  return p?.world?.mode ?? p?.mode ?? '';
}

function inCave(p) {
  return worldMode(p) === 'cave' || worldId(p).startsWith('cave:');
}

function inLabyrinth(p) {
  const id = worldId(p);
  const mode = worldMode(p);
  return (
    mode === 'dungeon'
    || mode === 'cellar'
    || id.startsWith('dungeon:')
    || id.startsWith('cellar:')
  );
}

/**
 * Who should receive a party story beat.
 *
 * @param {readonly object[]} players seated player records
 * @param {string} [kind] `levelEntry` or `briefing`
 */
export function storyReaders(players, kind = 'briefing') {
  const seated = (players ?? []).filter((p) => p && p.active !== false);
  if (kind === 'levelEntry') return seated.filter(inLabyrinth);
  return seated.filter((p) => !inCave(p));
}

/**
 * @param {readonly number[]} indexes seated players
 * @param {number} pageCount
 */
export function createStoryPager(indexes, pageCount) {
  const n = Math.max(1, pageCount | 0);
  const readers = new Map(
    (indexes ?? []).map((index) => [index, { page: 0, done: false }]),
  );

  function allDone() {
    if (readers.size === 0) return true;
    for (const r of readers.values()) {
      if (!r.done) return false;
    }
    return true;
  }

  return {
    pageCount: n,
    pageOf(index) {
      return readers.get(index)?.page ?? 0;
    },
    finished(index) {
      return readers.get(index)?.done ?? true;
    },
    holding() {
      return readers.size > 0 && !allDone();
    },
    allDone,
    /**
     * @param {number} index
     * @returns {{ turned: boolean, closed: boolean, allDone: boolean }}
     */
    advance(index) {
      const r = readers.get(index);
      if (!r || r.done) return { turned: false, closed: false, allDone: allDone() };
      if (r.page < n - 1) {
        r.page += 1;
        return { turned: true, closed: false, allDone: false };
      }
      r.done = true;
      return { turned: false, closed: true, allDone: allDone() };
    },
  };
}
