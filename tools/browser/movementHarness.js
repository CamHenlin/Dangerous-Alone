/**
 * Drive and compare party movement from a paused debug session.
 *
 * The goldens hash position but not the walk cycle, so a hero who slides
 * without alternating feet still hashes green. These helpers record the
 * per-frame pose the goldens ignore.
 */

export const KEYS = Object.freeze([
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: 'KeyZ',
    b: 'KeyX',
  },
  {
    up: 'KeyI',
    down: 'KeyK',
    left: 'KeyJ',
    right: 'KeyL',
    a: 'KeyF',
    b: 'KeyG',
  },
  {
    up: 'Numpad8',
    down: 'Numpad5',
    left: 'Numpad4',
    right: 'Numpad6',
    a: 'Numpad0',
    b: 'NumpadDecimal',
  },
  {
    up: 'KeyP',
    down: 'Semicolon',
    left: 'Quote',
    right: 'Backslash',
    a: 'KeyN',
    b: 'Minus',
  },
]);

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} [index]
 */
export async function hero(game, index = 0) {
  return (await game.state()).heroes[index];
}

/**
 * Hold `code` for `frames` frames and snapshot that hero each frame.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {string} code
 * @param {number} frames
 */
export async function traceHold(game, index, code, frames) {
  await game.hold(code);
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    await game.step(1);
    const h = (await game.state()).heroes[index];
    out.push({
      x: h.x,
      y: h.y,
      dir: h.dir,
      animFrame: h.animFrame,
      animCounter: h.animCounter,
      moving: h.moving,
      gridOffset: h.gridOffset,
      linkRoom: h.linkRoom,
    });
  }
  await game.release(code);
  await game.step(8);
  return out;
}

/**
 * @param {readonly { moving: boolean, animFrame: number }[]} trace
 */
export function sawWalkCycle(trace) {
  const moving = trace.filter((t) => t.moving);
  if (moving.length < 12) return false;
  const frames = new Set(moving.map((t) => t.animFrame));
  return frames.has(0) && frames.has(1);
}

/**
 * @param {readonly { [k: string]: number }[]} trace
 * @param {'x' | 'y'} axis
 */
export function netDelta(trace, axis) {
  if (!trace.length) return 0;
  return trace[trace.length - 1][axis] - trace[0][axis];
}

/**
 * Hold `code` until this hero's tile stops changing, then a few more frames
 * so a bounce would show. Caps at `max` so a broken wall fails the test
 * instead of hanging.
 *
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {string} code
 * @param {number} [max]
 */
export async function walkUntilStopped(game, index, code, max = 200) {
  await game.hold(code);
  const out = [];
  let still = 0;
  for (let i = 0; i < max; i += 1) {
    await game.step(1);
    const h = (await game.state()).heroes[index];
    const snap = {
      x: h.x,
      y: h.y,
      dir: h.dir,
      animFrame: h.animFrame,
      animCounter: h.animCounter,
      moving: h.moving,
      gridOffset: h.gridOffset,
      linkRoom: h.linkRoom,
    };
    out.push(snap);
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      still = prev.x === snap.x && prev.y === snap.y ? still + 1 : 0;
    }
    if (still >= 12) break;
  }
  await game.release(code);
  await game.step(8);
  return out;
}

/**
 * @param {readonly number[]} values
 * @param {1 | -1} dir
 */
export function isMonotonic(values, dir) {
  for (let i = 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    if (d === 0) continue;
    if (dir > 0 && d < 0) return false;
    if (dir < 0 && d > 0) return false;
  }
  return true;
}

/**
 * @param {readonly number[]} values
 * @param {number} [n]
 */
export function tailIsConstant(values, n = 8) {
  const tail = values.slice(-n);
  return tail.length === n && tail.every((v) => v === tail[0]);
}

/**
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} index
 * @param {number} x
 * @param {number} y
 * @param {number} [dir]
 * @param {number} [room] occupying-room local pose; omit for anchor-local
 */
export async function pose(game, index, x, y, dir, room) {
  await game.page.evaluate(
    ({ i, px, py, d, r }) => window.zeldaDebug.poseHero(i, px, py, d, r),
    { i: index, px: x, py: y, d: dir, r: room },
  );
}

/**
 * Enemies still wander, but they cannot knock a walk-cycle test off its feet.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 */
export async function ignoreHits(game) {
  await game.page.evaluate(() => {
    window.zeldaDebug.cheats.invincible = true;
  });
}

/**
 * Co-op death spins for ~80 frames before regroup. Wait until they are back.
 * @param {Awaited<ReturnType<import('./gameDriver.js').openGame>>} game
 * @param {number} [index]
 * @param {number} [maxFrames]
 */
export async function waitUntilAlive(game, index = 0, maxFrames = 200) {
  for (let i = 0; i < maxFrames; i += 1) {
    const st = await game.state();
    if (!st.heroes[index]?.dead) return st;
    await game.step(1);
  }
  const st = await game.state();
  throw new Error(
    `player ${index + 1} was still dead after ${maxFrames} frames (spinning=${st.heroes[index]?.spinning})`,
  );
}
