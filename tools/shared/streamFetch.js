/**
 * In-flight tile streaming is per stream, not per session.
 *
 * `main.js` used one generation token for overworld and underworld fetches.
 * Walking a labyrinth then cancelled the overworld neighbour load (and the
 * other way around), so leftover cameras looked at black between rooms
 * until the next seam cross. Each stream owns one of these so two occupied
 * worlds can fetch at once.
 */

export function createStreamFetch() {
  let gen = 0;
  let busy = false;

  return {
    /**
     * Start a fetch, cancelling any in-flight one on this stream.
     * @returns {number} token to pass to `stale` / `end`
     */
    begin() {
      gen += 1;
      busy = true;
      return gen;
    },

    /** True when a later `begin` or `invalidate` has replaced `token`. */
    stale(token) {
      return token !== gen;
    },

    /** Drop the busy flag if this is still the live fetch. */
    end(token) {
      if (token === gen) busy = false;
    },

    /**
     * Drop an in-flight fetch without starting another — tearing the stream
     * down, or hiding it because nobody is looking any more.
     */
    invalidate() {
      gen += 1;
      busy = false;
    },

    get busy() {
      return busy;
    },

    get gen() {
      return gen;
    },
  };
}
