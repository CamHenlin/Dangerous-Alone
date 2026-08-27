/**
 * Which player the game's ambient world variables currently describe.
 *
 * `main.js` keeps `mode`, `roomId`, `screen`, `dungeon` and `caveReturn` as
 * closure variables that 600-odd references read directly. Multiplayer needs
 * one set per player, and the two ways to get there are to thread a player
 * argument through every one of those references, or to keep the variables and
 * say *whose* they are at any moment. This is the second.
 *
 * The variables are the live copy and `player.world` is where a player's
 * context waits while someone else is being simulated. Nothing is copied
 * unless the focus actually moves from one player to another, which is what
 * makes this safe: the game mutates its world context from plenty of places
 * that are not inside a frame — picking a save file, walking into a cave, a
 * room load that resolves two frames later — and all of those keep working,
 * because between frames the variables still belong to whoever last held them.
 *
 * The cost is that the answer to "whose room is `roomId`?" is ambient rather
 * than in a parameter list. Anything that resumes while a *different* player
 * holds the focus reads the wrong world; `current` exists for that case,
 * captured before you yield and handed back to `on()` when you resume.
 */

/**
 * @param {object} opts
 * @param {(player: object) => void} opts.load context record → live variables
 * @param {(player: object) => void} opts.save live variables → context record
 */
export function createPlayerFocus({ load, save }) {
  let current = null;

  return {
    /** The player whose context the live variables hold. */
    get current() {
      return current;
    },

    /**
     * Declare that the live variables already describe `player` — used once at
     * startup, where the game's opening position was set up before there was
     * any notion of whose it was. Loading here instead would overwrite a booted
     * world with an empty record.
     */
    adopt(player) {
      current = player;
      save(player);
      return player;
    },

    /**
     * Move the focus and run nothing.
     *
     * For handing it back after a frame has stepped each player in turn: the
     * work that follows — the camera, the status bar — belongs to whoever owns
     * the view, and would otherwise read the last hero simulated.
     */
    to(player) {
      if (current === player) return player;
      if (current) save(current);
      load(player);
      current = player;
      return player;
    },

    /**
     * Run `fn` with `player`'s world context live, then put the previous
     * player back. Saves used to `on(host)` from inside another hero's
     * step and never return, so a leftover ally's cave stole the dungeon
     * mid-bomb-upgrade and froze the ticker.
     *
     * Async `fn` keeps the inner player until the promise settles.
     */
    on(player, fn) {
      const prev = current;
      this.to(player);
      const restore = () => {
        if (prev != null && prev !== player) this.to(prev);
      };
      try {
        const result = fn();
        if (result && typeof result.then === 'function') {
          return Promise.resolve(result).finally(restore);
        }
        restore();
        return result;
      } catch (err) {
        restore();
        throw err;
      }
    },
  };
}
