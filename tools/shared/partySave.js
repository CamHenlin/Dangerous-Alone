/**
 * The extra heroes a save has to remember once there is more than one.
 *
 * Version 1 wrote one inventory and one pose. Version 2 keeps that as
 * player one (so an old file still loads) and tucks everyone else under
 * `party`. Loading a two-player file with one controller starts player
 * one; the others sit down through the ordinary join path.
 */

import { activePlayers } from './player.js';

/** Per-player fields that are not already on the shared bag. */
export const PARTY_SAVE_KEYS = Object.freeze([
  'index',
  'halfHearts',
  'maxHalfHearts',
  'selectedB',
  'x',
  'y',
  'dir',
  'worldId',
]);

/**
 * @param {readonly object[]} players
 */
export function snapshotParty(players) {
  return activePlayers(players).map((p) => ({
    index: p.index,
    halfHearts: p.inv?.halfHearts ?? 0,
    maxHalfHearts: p.inv?.maxHalfHearts ?? 6,
    selectedB: p.inv?.selectedB ?? 'none',
    x: p.link?.x ?? 0,
    y: p.link?.y ?? 0,
    dir: p.link?.dir ?? 0,
    worldId: p.world?.id ?? null,
  }));
}

/**
 * Write saved hearts and a pose onto the players who are already seated.
 * Seats that are empty stay empty — joining later uses the live host.
 *
 * `skipPose` is for player one after a continue: their place in the world
 * already came from `position`, and a zero-heart rewind must not be undone
 * by the pose this snapshot took at death.
 *
 * @param {readonly object[]} players
 * @param {readonly object[] | undefined} party
 * @param {{ skipPose?: readonly number[] }} [opts]
 */
export function applyPartySnapshot(players, party, opts = {}) {
  if (!Array.isArray(party)) return players;
  const skipPose = new Set(opts.skipPose ?? []);
  for (const snap of party) {
    const p = players.find((q) => q.index === snap.index);
    if (!p) continue;
    if (p.inv) {
      if (snap.halfHearts != null) p.inv.halfHearts = snap.halfHearts;
      if (snap.maxHalfHearts != null) p.inv.maxHalfHearts = snap.maxHalfHearts;
      if (snap.selectedB != null) p.inv.selectedB = snap.selectedB;
    }
    if (p.link && !skipPose.has(p.index)) {
      if (snap.x != null) p.link.x = snap.x;
      if (snap.y != null) p.link.y = snap.y;
      if (snap.dir != null) p.link.dir = snap.dir;
    }
  }
  return players;
}
