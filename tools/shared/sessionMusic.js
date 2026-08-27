/**
 * Session BGM follows player one.
 *
 * `playMusic` cuts the current playlist when the name changes, so an ally
 * walking into a cave or labyrinth would restart the overworld song from
 * the top even if we switched back a frame later. Mode changes from anyone
 * but player one must not touch the track.
 */

/**
 * Who the session song answers to: always seat 0, even if they are dead.
 * @param {readonly { index?: number }[] | null | undefined} players
 */
export function sessionMusicPlayer(players) {
  return players?.[0] ?? null;
}

/**
 * @param {{ index?: number } | null | undefined} player
 */
export function sessionMusicApplies(player) {
  return (player?.index ?? -1) === 0;
}

/**
 * Playlist key for a hero's place, or null when that place has no world song.
 * @param {string | null | undefined} mode
 * @param {number | null | undefined} [levelId]
 */
export function sessionMusicName(mode, levelId) {
  if (mode === 'dungeon') return (levelId | 0) === 9 ? 'level9' : 'underworld';
  if (mode === 'overworld' || mode === 'cave') return 'overworld';
  return null;
}

/**
 * Floor pickups (compass, map, keys…) play Tune1 `item_taken` on top of the
 * song. Only the triforce shard replaces BGM; calling `playFanfare('item')`
 * for a compass cuts the dungeon music and restarts it from the top.
 * Cave TakeItem (sword gift, etc.) still uses the item fanfare on its own path.
 * @param {number | null | undefined} itemType
 */
export function roomItemPlaysFanfare(itemType) {
  return (itemType | 0) === 0x1b;
}
