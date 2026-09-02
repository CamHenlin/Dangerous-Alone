/**
 * Drive the real game in a headless browser, one frame at a time.
 *
 * The Node golden harness (`tools/shared/goldenSession.js`) can only reach the
 * shared layer; everything in `game/src/play/main.js` — the mode machine, room
 * loading, drops, projectiles, dialogue — lives inside a Pixi closure that
 * cannot be stepped from Node. This drives that closure directly through the
 * `window.zeldaDebug` hooks, so the half of the hero references the Node
 * harness cannot see still has a golden.
 *
 * Determinism rests on three things: the game's RNG is a fixed seed, the page
 * is loaded with `pause=1` so the loop never advances on wall-clock time, and
 * every frame is advanced explicitly by `step()`.
 */

import { EMPTY_TRACE, foldTrace, probeDigest, probeViolations } from './probeHash.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../shared/paths.js';

const ROM_PATH = join(ROOT, 'zelda.nes');

/** Long enough for a cold Vite transform of the whole play bundle. */
const BOOT_TIMEOUT_MS = 120000;

/**
 * Open the game, paused and ready to step.
 *
 * @param {import('playwright').Browser} browser
 * @param {object} opts
 * @param {string} opts.url dev server root
 * @param {string} [opts.query] extra query string, e.g. 'slot=1'
 */
export async function openGame(browser, { url, query = '' }) {
  const page = await browser.newPage();
  /** @type {string[]} */
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  if (existsSync(ROM_PATH)) {
    const b64 = readFileSync(ROM_PATH).toString('base64');
    await page.addInitScript((payload) => {
      localStorage.setItem('zelda_rom_v1', payload);
    }, JSON.stringify({ v: 1, b64 }));
  }

  const suffix = query ? `&${query}` : '';
  await page.goto(`${url}play.html?debug=1&pause=1${suffix}`, {
    waitUntil: 'domcontentloaded',
    timeout: BOOT_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => {
      const s = window.zeldaDebug?.state?.();
      return Boolean(s?.playing && s.hasScreen);
    },
    null,
    { timeout: BOOT_TIMEOUT_MS },
  );

  const held = new Set();
  let trace = EMPTY_TRACE;
  /** @type {string[]} */
  const violations = [];

  /** Current probe, without advancing anything. */
  const probe = () => page.evaluate(() => window.zeldaDebug.probe());
  const state = () => page.evaluate(() => window.zeldaDebug.state());

  /**
   * Advance `frames` frames, folding each into the trace and collecting any
   * broken invariant.
   *
   * Each frame yields to the event loop and then waits for every in-flight
   * room load to finish before the next one. Both halves matter: `step()` is
   * synchronous, so an unbroken batch starves every pending screen load and
   * `enterLevel`; and without the drain, which frame a room's tiles land on
   * follows I/O timing rather than the simulation, which makes the same walk
   * hash differently on a slower disk.
   *
   * @param {number} frames
   */
  async function step(frames = 1) {
    const probes = await page.evaluate(async (n) => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      const out = [];
      for (let i = 0; i < n; i += 1) {
        window.zeldaDebug.step(1);
        await tick();
        // Bounded so a genuinely stuck load fails the test instead of hanging.
        for (let spins = 0; window.zeldaDebug.pendingLoads() > 0 && spins < 2000; spins += 1) {
          await tick();
        }
        out.push(window.zeldaDebug.probe());
      }
      return out;
    }, frames);
    for (const p of probes) {
      trace = foldTrace(trace, probeDigest(p));
      for (const v of probeViolations(p)) violations.push(`frame ${p.frame}: ${v}`);
    }
    return probes;
  }

  /**
   * Hold buttons down across subsequent `step()` calls, the way a player does.
   * @param {...string} codes KeyboardEvent.code values
   */
  async function hold(...codes) {
    for (const code of codes) {
      if (held.has(code)) continue;
      await page.keyboard.down(code);
      held.add(code);
    }
  }

  /** @param {...string} codes */
  async function release(...codes) {
    const list = codes.length ? codes : [...held];
    for (const code of list) {
      if (!held.has(code)) continue;
      await page.keyboard.up(code);
      held.delete(code);
    }
  }

  /**
   * Hold `codes` for `frames` frames, then let go and let one frame see that.
   *
   * The trailing frame is not a nicety. The game edge-detects its buttons by
   * comparing each frame to the last, so a release that no frame observes
   * leaves the button looking held forever and every later press of it does
   * nothing. Without this, a scenario could press A ten times and swing once.
   *
   * @param {string[]} codes
   * @param {number} frames
   */
  async function press(codes, frames) {
    await hold(...codes);
    const probes = await step(frames);
    await release(...codes);
    probes.push(...(await step(1)));
    return probes;
  }

  /**
   * Wait for a transition to stop loading things.
   *
   * A transition is several fetches deep — a level's data, then its first
   * room's tiles, then that room's neighbours — and the later ones are only
   * requested once the earlier ones land, so `pendingLoads()` dips to zero
   * between them. Waiting for zero *sustained* across several turns of the
   * event loop is what stops the next frame from being the one where the tiles
   * happen to arrive, which would hash differently on a slower disk.
   */
  async function settle() {
    await page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      let quiet = 0;
      for (let spins = 0; quiet < 10 && spins < 4000; spins += 1) {
        quiet = window.zeldaDebug.pendingLoads() > 0 ? 0 : quiet + 1;
        await tick();
      }
    });
  }

  /**
   * The return value is deliberately dropped. These resolve to loaded room
   * records holding textures, and asking Playwright to serialise one back
   * across the wire takes the page's execution context down with it.
   * @param {number} level
   */
  async function enterLevel(level, index) {
    await page.evaluate(async ({ n, i }) => {
      await window.zeldaDebug.enterLevel(n, i);
    }, { n: level, i: index });
    await settle();
  }

  /**
   * Warp out to an overworld screen, the way leaving a labyrinth does.
   * @param {number} roomId an overworld screen, not the dungeon room you are in
   * @param {{ x?: number, y?: number, dir?: number }} [spawn]
   */
  async function returnToOverworld(roomId, spawn, index) {
    await page.evaluate(async ({ id, x, y, dir, i }) => {
      await window.zeldaDebug.goOw(id, x, y, dir, i);
    }, { id: roomId, x: spawn?.x, y: spawn?.y, dir: spawn?.dir, i: index });
    await settle();
  }

  /**
   * Soft-load a dungeon room (hard cut). Used by play tests that need a
   * known cell rather than walking there from the entrance.
   * @param {number} roomId
   * @param {number} [dir]
   * @param {number} [index] which hero; default is whoever holds the focus
   */
  async function goRoom(roomId, dir, index) {
    await page.evaluate(async ({ id, d, i }) => {
      await window.zeldaDebug.goRoom(id, d, i);
    }, { id: roomId, d: dir, i: index });
    await settle();
  }

  /**
   * Drop a hero into a cave without walking a warp. Same settle as enterLevel.
   * @param {number} caveId
   * @param {number} [index]
   */
  async function openCave(caveId, index) {
    await page.evaluate(({ id, i }) => {
      window.zeldaDebug.openCave(id, i);
    }, { id: caveId, i: index });
    await settle();
  }

  /**
   * Climb out of a cave. `leaveCave` is async (it may rebuild the overworld).
   * @param {number} [index]
   */
  async function leaveCave(index) {
    await page.evaluate(async (i) => {
      await window.zeldaDebug.leaveCave(i);
    }, index);
    await settle();
  }

  /** Write the live party to the current file slot. */
  async function persistSlot() {
    return page.evaluate(() => window.zeldaDebug.persistSlot());
  }

  /**
   * Reload the current (or given) file slot the way Continue does.
   * @param {number} [slot]
   */
  async function continuePlay(slot) {
    await page.evaluate(async (s) => {
      await window.zeldaDebug.continuePlay(s);
    }, slot);
    await settle();
  }

  /**
   * Talk through whatever is being said, the way a player mashes A.
   *
   * A speech holds the whole world still, so a scenario that walks into one
   * and keeps pressing buttons is hashing a frozen game — stable, green and
   * testing nothing. Two presses per page: one to skip the crawl, one to turn.
   *
   * @param {number} [maxPresses] a bound, so a box that will not close fails
   */
  async function dismissDialogue(maxPresses = 40) {
    const aKeys = ['KeyZ', 'KeyF', 'Numpad0', 'KeyN'];
    for (let i = 0; i < maxPresses; i += 1) {
      const st = await state();
      if (!st.dialogue) return;
      // A story beat has a copy in every quadrant; mashing only player
      // one's A leaves the others still reading and the world frozen.
      const seated = Math.max(1, (st.heroes ?? []).filter((h) => h.active).length);
      await press(aKeys.slice(0, seated), 4);
    }
    throw new Error('dialogue would not close');
  }

  return {
    page,
    probe,
    state,
    step,
    hold,
    release,
    press,
    dismissDialogue,
    enterLevel,
    goRoom,
    returnToOverworld,
    openCave,
    leaveCave,
    persistSlot,
    continuePlay,
    get trace() {
      return trace;
    },
    get violations() {
      return violations;
    },
    get pageErrors() {
      return pageErrors;
    },
    close: () => page.close(),
  };
}
