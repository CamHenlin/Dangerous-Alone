/**
 * One story box, many readers.
 *
 * Labyrinth-entry and the between-level briefing are the plot, so they
 * open in every quadrant. Each player turns their own pages; the world
 * stays frozen until the last one has closed their copy. Ordinary NPC
 * talk does not go through here.
 */

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
