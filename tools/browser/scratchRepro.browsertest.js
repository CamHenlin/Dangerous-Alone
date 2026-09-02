/** Scratch: fuzz co-op overworld death regroups looking for a pinned axis. */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { openGame } from './gameDriver.js';
import { startGameServer } from './gameServer.js';
import { KEYS, ignoreHits, waitUntilAlive } from './movementHarness.js';

const hex = (n) => `$${(n >>> 0).toString(16)}`;
const DIRS = ['up', 'down', 'left', 'right'];
const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const brief = (h) =>
  `x=${hex(h.x)} y=${hex(h.y)} g=${h.gridOffset} f=${h.posFrac} d=${h.dir} `
  + `r=${hex(h.linkRoom)} anchor=${hex(h.worldRoomId)}`;

const both = (st) => `p1[${brief(st.heroes[0])}] p2[${brief(st.heroes[1])}]`;

describe('scratch regroup fuzz', { concurrency: false }, () => {
  let server;
  let browser;

  before(async () => {
    server = await startGameServer();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  async function traceDir(game, index, dir, frames = 20) {
    await game.hold(KEYS[index][dir]);
    const out = [];
    for (let i = 0; i < frames; i += 1) {
      await game.step(1);
      const st = await game.state();
      out.push({ ...st.heroes[index], full: both(st) });
    }
    await game.release(KEYS[index][dir]);
    await game.step(1);
    return out;
  }

  async function tryDirs(game, index, log) {
    const out = {};
    for (const dir of DIRS) {
      const a = (await game.state()).heroes[index];
      const trace = await traceDir(game, index, dir);
      const b = trace[trace.length - 1];
      out[dir] = dir === 'up' || dir === 'down' ? b.y - a.y : b.x - a.x;
      if (Math.abs(out[dir]) < 4 && log) {
        log.push(
          `    ${dir}: start ${brief(a)}\n`
            + trace.map((t, i) => `      f${i} ${t.full}`).join('\n'),
        );
      }
      await traceDir(game, index, BACK[dir]);
    }
    return out;
  }

  async function run(game, { kill }) {
    const rng = makeRng(20260828);
    const failures = [];

    for (let trial = 0; trial < 24 && failures.length < 2; trial += 1) {
      for (let leg = 0; leg < 5; leg += 1) {
        const k0 = KEYS[0][DIRS[Math.floor(rng() * 4)]];
        const k1 = KEYS[1][DIRS[Math.floor(rng() * 4)]];
        await game.hold(k0, k1);
        await game.step(6 + Math.floor(rng() * 24));
        await game.release(k0, k1);
      }
      const before = await game.state();
      if (before.heroes.some((h) => h.world !== 'overworld')) {
        await game.returnToOverworld(0x77, { x: 0x78, y: 0x8d, dir: 0x08 }, 1);
        await game.returnToOverworld(0x77, { x: 0x78, y: 0x8d, dir: 0x08 }, 0);
        continue;
      }

      const victim = rng() < 0.5 ? 0 : 1;
      let after = before;
      if (kill) {
        await game.page.evaluate((i) => window.zeldaDebug.kill(i), victim);
        try {
          after = await waitUntilAlive(game, victim);
        } catch {
          failures.push(`trial ${trial}: victim ${victim} never revived`);
          continue;
        }
        if (after.heroes.some((h) => h.world !== 'overworld')) continue;
      }

      for (const index of [0, 1]) {
        const log = [];
        const moved = await tryDirs(game, index, log);
        const pinned = DIRS.filter((d) => Math.abs(moved[d]) < 4);
        if (!pinned.length) continue;
        const probe = await game.page.evaluate(
          (i) => window.zeldaDebug.moveProbe(i),
          index,
        );
        failures.push(
          `trial ${trial} victim=p${victim + 1} p${index + 1} pinned=[${pinned}]\n`
            + `    pre-kill  ${brief(before.heroes[index])}\n`
            + `    post-warp ${brief(after.heroes[index])}\n`
            + `    moved=${JSON.stringify(moved)} anchor=${hex(probe.anchorRoomId)} `
            + `standing=${hex(probe.standing)} look=${JSON.stringify(probe.lookAhead)}\n`
            + log.join('\n'),
        );
      }
    }
    return failures;
  }

  test('control: no deaths', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    const failures = await run(game, { kill: false });
    console.log(`CONTROL FAILURES (${failures.length}):`);
    for (const f of failures) console.log(f);
    await game.close();
    assert.equal(failures.length, 0, 'a hero pinned with no death at all');
  });

  test('with deaths', async () => {
    const game = await openGame(browser, { url: server.url, query: 'players=2' });
    await game.step(5);
    await ignoreHits(game);
    const failures = await run(game, { kill: true });
    console.log(`KILL FAILURES (${failures.length}):`);
    for (const f of failures) console.log(f);
    await game.close();
    assert.equal(failures.length, 0, 'a regroup pinned a hero');
  });
});
