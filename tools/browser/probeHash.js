/**
 * Hashing and invariant checks for `zeldaDebug.probe()` output.
 *
 * Pure: it takes a probe object and returns strings. That keeps the part of
 * the browser harness with actual logic in it unit-testable without a
 * browser, which is the only part worth unit-testing.
 */

import { crc32Hex } from '../shared/hash.js';

/**
 * One frame of simulation, as a stable string.
 *
 * Deliberately excludes `spriteIds`: sprites are the renderer's business, and
 * folding them in would make a legitimate drawing change look like a
 * simulation regression. They are checked as an invariant instead — see
 * `probeViolations`.
 *
 * @param {object} p probe output
 */
export function probeDigest(p) {
  const parts = [
    `f:${p.frame}`,
    `mode:${p.mode}`,
    `room:${p.roomId}`,
    `screen:${p.screenRoomId ?? -1}`,
    `cam:${p.camLocalX},${p.camLocalY}`,
    `world:${p.worldCamX},${p.worldCamY}`,
    `link:${p.link?.x},${p.link?.y},${p.link?.dir}`,
    `spawned:${[...(p.spawnedRooms ?? [])].join('.')}`,
    `claims:${[...(p.spawnClaims ?? [])].join('.')}`,
    `stream:${[...(p.streamRooms ?? [])].join('.')}`,
  ];
  for (const e of p.enemies ?? []) {
    const id = `e:${e.id}:${e.objType}:${e.home ?? -1}:${e.alive ? 1 : 0}:${e.view ? 1 : 0}:${e.edge ? 1 : 0}`;
    // Off-camera foes are hashed by identity but not by position. Neighbour
    // rooms stream in asynchronously and draw their spawn placement from one
    // shared RNG, so the order two rooms happen to load in decides where their
    // foes land. That is real engine nondeterminism, not harness noise (see
    // Notes / Spawn placement in the phase doc), and it settles the moment a
    // foe is on camera, which is when its position starts mattering.
    parts.push(e.off ? id : `${id}:${e.x}:${e.y}`);
  }
  return parts.join('|');
}

/** Starting value for a trace fold. */
export const EMPTY_TRACE = '00000000';

/**
 * Fold one frame into a rolling trajectory hash.
 *
 * Same reasoning as the Node harness: hashing only the final frame passes a
 * run that reached the same place by a different route, and a frame of drift
 * is exactly what rethreading the hero causes.
 *
 * @param {string} trace
 * @param {string} digest
 */
export function foldTrace(trace, digest) {
  return crc32Hex(Buffer.from(`${trace}|${digest}`, 'utf8'));
}

/**
 * Fold a whole run.
 * @param {object[]} probes
 * @param {string} [trace]
 */
export function traceProbes(probes, trace = EMPTY_TRACE) {
  let out = trace;
  for (const p of probes) out = foldTrace(out, probeDigest(p));
  return out;
}

/**
 * The streaming invariants `probe()` was built to answer, as a list of
 * human-readable violations (empty when the frame is sound).
 *
 * These are assertions rather than hash inputs because a hash tells you a
 * number changed, and these tell you the game is broken: a stale `screen`
 * breaks overworld collision and cave warps, and a leaked sprite is a monster
 * frozen in the world that can no longer take or deal damage.
 *
 * @param {object} p probe output
 * @returns {string[]}
 */
export function probeViolations(p) {
  /** @type {string[]} */
  const bad = [];
  if (p.mode === 'overworld' && p.screenRoomId !== p.roomId) {
    bad.push(`screen ${p.screenRoomId} does not track room ${p.roomId}`);
  }
  if (p.linkRoom !== p.roomId) {
    bad.push(`Link is in room ${p.linkRoom} but the anchor is ${p.roomId}`);
  }
  if (p.gridAliased === false) {
    bad.push('collision grid is not the array the tile probes read');
  }
  const known = new Set(p.enemyIds ?? []);
  for (const id of p.spriteIds ?? []) {
    if (!known.has(id)) bad.push(`sprite ${id} has no enemy behind it`);
  }
  return bad;
}
