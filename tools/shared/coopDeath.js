/**
 * Who dies, who keeps playing, and where the dead come back.
 *
 * Solo is the ROM: the continue menu, three hearts, the dungeon door. Co-op
 * is the phase-23 read of that: a potion in the shared bag is drunk for
 * whoever just dropped, and if someone is still standing you regroup on
 * them rather than opening a game-over that the living did not earn.
 */

import { CONTINUE_HALF_HEARTS } from './continueMenu.js';
import { drinkPotion } from './inventory.js';
import { activePlayers } from './player.js';
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
 * The ally a downed hero should stand next to: the lowest-numbered living
 * player, not counting themselves.
 * @param {readonly object[]} players
 * @param {object} dead
 */
export function respawnAlly(players, dead) {
  return livingPlayers(players).find((p) => p !== dead) ?? null;
}

/**
 * Follow the living into a cave or labyrinth. A cellar is a hard cut
 * inside a level, not a streamed neighbour: dying upstairs must not
 * dump you on their ladder. ROM continue from a dungeon death is the
 * entrance.
 *
 * @param {object} dead
 * @param {object | null} ally
 */
export function shouldFollowAllyWorld(dead, ally) {
  if (!dead || !ally?.world) return false;
  if (dead.world === ally.world) return false;
  if (isCellarWorldId(ally.world.id) && !isCellarWorldId(dead.world?.id)) {
    return false;
  }
  return true;
}

/**
 * Labyrinth to stand in when the living are in a cellar you were not.
 * @param {object | null} ally
 */
export function labyrinthForCellarAlly(ally) {
  const parsed = parseCellarWorldId(ally?.world?.id);
  return parsed ? dungeonWorldId(parsed.level) : null;
}

/**
 * Three hearts, on their feet, beside the ally.
 * @param {object} dead
 * @param {object} ally
 */
export function respawnBeside(dead, ally) {
  const inv = dead.inv;
  inv.dead = false;
  inv.halfHearts = Math.min(CONTINUE_HALF_HEARTS, inv.maxHalfHearts ?? CONTINUE_HALF_HEARTS);
  inv.invuln = 48;
  inv.shovePixels = 0;
  inv.shoveDir = 0;
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
