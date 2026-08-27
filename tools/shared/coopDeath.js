/**
 * Who dies, who keeps playing, and where the dead come back.
 *
 * Solo is the ROM: the continue menu, three hearts, the dungeon door. Co-op
 * is the phase-23 read of that: a potion in the shared bag is drunk for
 * whoever just dropped, and if someone is still standing you regroup on
 * them — but only when you already share a place. A dungeon death with
 * the living on the overworld (or in another level) continues at that
 * labyrinth's door, the way the ROM would, rather than yanking you out.
 */

import { occupyingRoom } from './continuousCamera.js';
import { CONTINUE_HALF_HEARTS } from './continueMenu.js';
import { drinkPotion } from './inventory.js';
import { activePlayers } from './player.js';
import { cancelSword } from './sword.js';
import { dungeonWorldId, isCellarWorldId, parseCellarWorldId } from './worldRegistry.js';

/**
 * Active players who still have a heart.
 * @param {readonly object[]} players
 */
export function livingPlayers(players) {
  return activePlayers(players).filter((p) => p?.inv && !p.inv.dead);
}

/**
 * True when every joined hero is down — the only time the continue menu
 * should appear.
 * @param {readonly object[]} players
 */
export function allActiveDead(players) {
  const joined = activePlayers(players);
  return joined.length > 0 && joined.every((p) => p?.inv?.dead);
}

/**
 * Drink a shared potion for this hero instead of letting them die.
 *
 * `potion` lives on the shared bag; hearts live on the view. Drinking
 * consumes the bottle for the group and fills this hero.
 *
 * @param {object} inv an inventory view
 * @returns {boolean} true when they are standing again
 */
export function tryAutoRevive(inv) {
  if (!inv?.dead) return false;
  if ((inv.potion ?? 0) <= 0) return false;
  inv.dead = false;
  drinkPotion(inv);
  inv.invuln = 48;
  inv.shovePixels = 0;
  return true;
}

/**
 * What a death becomes, once a potion has had its chance.
 *
 * @param {readonly object[]} players
 * @param {object} dead the player who just dropped
 * @returns {'continueMenu' | 'respawn'}
 */
export function deathOutcome(players, dead) {
  const living = livingPlayers(players).filter((p) => p !== dead);
  return living.length ? 'respawn' : 'continueMenu';
}

/**
 * Tune1 `$80` (`link_dying`) silences the song before it plays. A wipe
 * still wants that — the continue sequence owns the speakers. A co-op
 * spin with someone still standing must not, or the living player's
 * track is cut and `syncSessionMusic` restarts it from the top.
 *
 * @param {readonly object[]} players
 * @param {object} dead
 */
export function coopDeathPlaysDyingTune(players, dead) {
  return deathOutcome(players, dead) !== 'respawn';
}

/**
 * The ally a downed hero should stand next to: the lowest-numbered living
 * player, not counting themselves.
 * @param {readonly object[]} players
 * @param {object} dead
 */
export function respawnAlly(players, dead) {
  return livingPlayers(players).find((p) => p !== dead) ?? null;
}

/**
 * Labyrinth number for a dungeon or cellar world, or null.
 * @param {string | null | undefined} id
 * @returns {number | null}
 */
export function dungeonLevelOfWorldId(id) {
  const cellar = parseCellarWorldId(id);
  if (cellar) return cellar.level;
  const m = /^dungeon:(\d+)$/.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Same place for a co-op regroup: one world, or the same labyrinth
 * (a cellar is still that level, just a hard cut of it).
 *
 * @param {object | null | undefined} dead
 * @param {object | null | undefined} ally
 */
export function sameRespawnArea(dead, ally) {
  if (!dead?.world || !ally?.world) return false;
  if (dead.world === ally.world) return true;
  if (dead.world.id === ally.world.id) return true;
  const deadLevel = dungeonLevelOfWorldId(dead.world.id);
  const allyLevel = dungeonLevelOfWorldId(ally.world.id);
  return deadLevel != null && deadLevel === allyLevel;
}

/**
 * Follow the living only when you already share a place. A cellar is a
 * hard cut inside a level, not a streamed neighbour: dying upstairs must
 * not dump you on their ladder.
 *
 * @param {object} dead
 * @param {object | null} ally
 */
export function shouldFollowAllyWorld(dead, ally) {
  if (!dead || !ally?.world) return false;
  if (!sameRespawnArea(dead, ally)) return false;
  if (dead.world === ally.world || dead.world?.id === ally.world.id) return false;
  if (isCellarWorldId(ally.world.id) && !isCellarWorldId(dead.world?.id)) {
    return false;
  }
  return true;
}

/**
 * Died in a labyrinth the living are not standing in — continue at that
 * level's door rather than teleporting to them.
 *
 * @param {object} dead
 * @param {object | null} ally
 */
export function shouldRestartInOwnDungeon(dead, ally) {
  if (dungeonLevelOfWorldId(dead?.world?.id) == null) return false;
  return !sameRespawnArea(dead, ally);
}

/**
 * Labyrinth to stand in when the living are in a cellar you were not.
 * @param {object | null} ally
 */
export function labyrinthForCellarAlly(ally) {
  return labyrinthWorldIdFor(ally?.world);
}

/**
 * Top-down map for this dungeon or cellar world.
 * @param {object | null | undefined} world
 */
export function labyrinthWorldIdFor(world) {
  const level = dungeonLevelOfWorldId(world?.id);
  return level != null ? dungeonWorldId(level) : null;
}

/**
 * Three hearts, on their feet, where they already are.
 * @param {object} dead
 */
export function standUpAfterDeath(dead) {
  const inv = dead.inv;
  if (inv) {
    inv.dead = false;
    inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
    inv.invuln = 48;
    inv.shovePixels = 0;
    inv.shoveDir = 0;
    inv.itemLiftTimer = 0;
  }
  // Caves never run stepCombat. A swing still armed when you drop (or when
  // you are dumped into an ally's cave) never finishes, and stepCave will
  // not walk while the blade is out.
  if (dead.sword) cancelSword(dead.sword);
  if (dead.link) {
    dead.link.posFrac = 0;
    dead.link.gridOffset = 0;
    dead.link.moving = false;
  }
  return dead;
}

/**
 * Three hearts, on their feet, beside the ally.
 * @param {object} dead
 * @param {object} ally
 */
export function respawnBeside(dead, ally) {
  standUpAfterDeath(dead);
  if (ally?.link && dead.link) {
    dead.link.x = ally.link.x;
    dead.link.y = ally.link.y;
    dead.link.dir = ally.link.dir;
    dead.link.posFrac = 0;
    dead.link.gridOffset = 0;
    dead.link.moving = false;
  }
  // Same-world leftover coords only mean the ally's cell if the latch
  // follows them. Join uses snapToHost for this; death has to match.
  dead.uwOccRoomId = ally?.uwOccRoomId ?? null;
  dead.uwDoorwayBlockSide = ally?.uwDoorwayBlockSide ?? null;
  return dead;
}

/**
 * Streaming-anchor room a co-op regroup should move to, or null when the
 * ally is already in that cell.
 *
 * Copying x,y onto a leftover ally leaves both heroes past `canClaimAnchorCross`.
 * Nobody can then rebase, the east neighbour of their cell never streams, and
 * look-ahead into a missing grid is solid — "can't walk off the right of this
 * leftover screen".
 *
 * @param {number} anchorRoomId
 * @param {object | null | undefined} ally
 * @returns {number | null}
 */
export function regroupAnchorRoomId(anchorRoomId, ally) {
  if (!ally?.link || anchorRoomId == null) return null;
  const occ = occupyingRoom(anchorRoomId, ally.link.x, ally.link.y).roomId & 0xff;
  if (occ === (anchorRoomId & 0xff)) return null;
  return occ;
}

/**
 * Links enemies should chase: the living, or everyone if nobody is, so a
 * solo death mid-raft still has a target and does not change that frame.
 *
 * `world` is the place the foes are standing. A hero in a labyrinth must
 * not look like a cave mouth on the overworld — their x,y is in a different
 * space, and chasing it walks Moblins through trees onto the start-screen
 * stairs.
 *
 * @param {readonly object[]} players
 * @param {object | null} [world] the foes' world; omit to include every seat
 */
export function targetableLinks(players, world) {
  const joined = activePlayers(players).filter(
    (p) => world == null || p.world === world,
  );
  const living = joined.filter((p) => p?.inv && !p.inv.dead);
  return (living.length ? living : joined).map((p) => p.link);
}
