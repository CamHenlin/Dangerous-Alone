/**
 * A scripted, headless session over the shared simulation, for golden tests.
 *
 * Phase 22 pluralises the hero: `link`, `inv` and `sword` become
 * `players[]`, and ~900 references across `tools/shared/` change shape. The
 * unit tests pin each of those functions in isolation, which is exactly the
 * coverage a threading refactor slips through — every call still returns the
 * right answer, and the sequence they are called in quietly changes. This
 * module drives them as a sequence and hashes the result, so "behaves
 * identically" becomes an assertion instead of a hope.
 *
 * WHAT THIS COVERS: link motion, the sword swing and its hits, enemy
 * stepping and contact damage, the hurt / invulnerability / shove status
 * machine, and the inventory all of those read from. The one-frame step
 * lives in `playSim.js` so Node can drive it without Pixi; this file builds
 * the session and hashes the trajectory.
 *
 * WHAT THIS DOES NOT COVER: the orchestration in `game/src/play/main.js` —
 * mode transitions, room loading, drops, projectiles, bombs, dialogue and the
 * UI. Those live inside a Pixi closure and cannot be stepped from Node until
 * they are lifted out. The frame order below mirrors `stepOverworld()` and
 * `stepCombat()` for the subset it does cover, and each step names the call
 * site it stands in for; when that order changes there, it changes here.
 */

import { DIR } from './collision.js';
import { createEnemy } from './enemies.js';
import { createInventory } from './inventory.js';
import { createLinkState } from './linkMotion.js';
import { hashSession, stepSession } from './playSim.js';
import { openTileGrid } from './replay.js';
import { createIntRng } from './rng.js';
import { createSwordState } from './sword.js';

/**
 * @typedef {object} SessionFrame
 * @property {number} [mask] direction bits held this frame
 * @property {boolean} [a] A edge-pressed this frame (swing the sword)
 * @property {number[]} [masks] one mask per hero, when the session has a party
 * @property {boolean[]} [as] one A edge per hero
 */

/**
 * @typedef {object} SessionOpts
 * @property {number} [seed]
 * @property {number} [startX]
 * @property {number} [startY]
 * @property {number} [startDir]
 * @property {number[][]} [tileGrid]
 * @property {number | null} [roomId] room bounds for `stepLink`; null clamps
 * @property {object} [inv] fields laid over `createInventory()`
 * @property {{ objType: number, x: number, y: number }[]} [enemies]
 * @property {{ x0: number, y0: number, x1: number, y1: number }} [bounds]
 * @property {number} [heroes] seated heroes; 1 is the existing solo session
 */

/** Enemy wander box for a single-room scripted scene (playfield below the HUD). */
const DEFAULT_BOUNDS = Object.freeze({ x0: 0, y0: 0x40, x1: 0xff, y1: 0xdf });

/**
 * Build a session.
 *
 * Foes are spawned already view-activated and past their spawn cloud: the
 * harness has no camera to reveal them, and an inert foe would make every
 * combat scenario hash identically to an empty room.
 *
 * @param {SessionOpts} [opts]
 */
export function createSession(opts = {}) {
  const seed = opts.seed ?? 1;
  const inv = createInventory();
  Object.assign(inv, opts.inv ?? {});
  /** @type {object[]} */
  const enemies = [];
  for (const spawn of opts.enemies ?? []) {
    const e = createEnemy(spawn);
    if (!e) continue;
    e.viewActivated = true;
    e.spawnCloud = 0;
    enemies.push(e);
  }
  const rng = createIntRng(seed);
  const startX = opts.startX ?? 0x80;
  const startY = opts.startY ?? 0x8d;
  const startDir = opts.startDir ?? DIR.RIGHT;
  const link = createLinkState(startX, startY, startDir);
  const sword = createSwordState();
  const seated = Math.max(1, opts.heroes | 0);
  /** @type {{ link: object, inv: object, sword: object }[] | undefined} */
  let heroes;
  if (seated > 1) {
    heroes = [{ link, inv, sword }];
    for (let i = 1; i < seated; i += 1) {
      const extraInv = createInventory();
      Object.assign(extraInv, opts.inv ?? {});
      heroes.push({
        link: createLinkState(startX + i * 16, startY, startDir),
        inv: extraInv,
        sword: createSwordState(),
      });
    }
  }
  return {
    seed,
    frame: 0,
    /** Rolling hash of every frame so far; the golden contract. */
    trace: '00000000',
    rng,
    rngByte: () => rng(256),
    tileGrid: opts.tileGrid ?? openTileGrid(),
    roomId: opts.roomId ?? null,
    bounds: opts.bounds ?? DEFAULT_BOUNDS,
    link,
    inv,
    sword,
    enemies,
    heroes,
  };
}

/**
 * Run a scripted session to completion.
 *
 * `trace` is what a golden should assert (every frame); `hash` is the resting
 * state, which is the useful one to print when a trace has broken and you
 * want to know where it ended up.
 *
 * @param {SessionOpts & { frames: SessionFrame[] }} opts
 */
export function runSession(opts) {
  const state = createSession(opts);
  for (const frame of opts.frames) stepSession(state, frame);
  return { state, hash: hashSession(state), trace: state.trace };
}

/**
 * Hold a direction. `hold(DIR.RIGHT, 8)` reads as what the player did.
 * @param {number} dir
 * @param {number} count
 */
export function hold(dir, count) {
  return Array.from({ length: count }, () => ({ mask: dir }));
}

/**
 * Hold a direction per hero. Solo scripts keep using `hold()`.
 * @param {number[]} dirs
 * @param {number} count
 */
export function holdEach(dirs, count) {
  return Array.from({ length: count }, () => ({ masks: [...dirs] }));
}

/**
 * One A press followed by enough still frames for the swing to play out.
 * @param {number} count
 */
export function swing(count) {
  return Array.from({ length: count }, (_, i) => ({ mask: 0, a: i === 0 }));
}

/**
 * Stand still.
 * @param {number} count
 */
export function idle(count) {
  return Array.from({ length: count }, () => ({ mask: 0 }));
}

export { DIR, hashSession, stepSession };
