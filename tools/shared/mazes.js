/**
 * Overworld maze screens (`CheckMazes` @ `Z_01.asm:4837`).
 *
 * Two screens trap the player in a loop until a fixed sequence of exit
 * directions is walked. Leaving in the wrong direction repeats the room and
 * resets progress — except for one "free" direction per maze, which always
 * lets the player out without resetting the step counter.
 */

import { DIR } from './collision.js';

/** Lost Woods. */
export const FOREST_MAZE_ROOM = 0x61;
/** Lost Hills. */
export const MOUNTAIN_MAZE_ROOM = 0x1b;

/** `ForestMazeDirs` — Up, Left, Down, Left. */
export const FOREST_MAZE_DIRS = Object.freeze([DIR.UP, DIR.LEFT, DIR.DOWN, DIR.LEFT]);
/** `MountainMazeDirs` — Up ×4. */
export const MOUNTAIN_MAZE_DIRS = Object.freeze([DIR.UP, DIR.UP, DIR.UP, DIR.UP]);

const MAZES = Object.freeze({
  [FOREST_MAZE_ROOM]: { dirs: FOREST_MAZE_DIRS, freeDir: DIR.RIGHT },
  [MOUNTAIN_MAZE_ROOM]: { dirs: MOUNTAIN_MAZE_DIRS, freeDir: DIR.LEFT },
});

/**
 * @param {number} roomId
 */
export function isMazeRoom(roomId) {
  return Object.hasOwn(MAZES, roomId);
}

/** @returns {{ step: number }} */
export function createMazeState() {
  return { step: 0 };
}

/**
 * @typedef {object} MazeResult
 * @property {boolean} allowExit false → the screen repeats itself
 * @property {boolean} playSecretTune `Tune1Request = $04` on completion
 * @property {boolean} solved final step matched
 */

/**
 * Resolve a screen-exit attempt.
 *
 * @param {{ step: number }} state mutated
 * @param {number} roomId screen being left
 * @param {number} dir exit direction (a `DIR` bit)
 * @returns {MazeResult}
 */
export function checkMaze(state, roomId, dir) {
  const maze = MAZES[roomId];
  if (!maze) {
    // Not in a maze — CheckMazes resets the step and leaves the room alone.
    state.step = 0;
    return { allowExit: true, playSecretTune: false, solved: false };
  }

  if (dir === maze.dirs[state.step]) {
    if (state.step === maze.dirs.length - 1) {
      // Final step: secret tune, and the player walks out.
      return { allowExit: true, playSecretTune: true, solved: true };
    }
    state.step += 1;
    return { allowExit: false, playSecretTune: false, solved: false };
  }

  // The free direction leaves without resetting progress.
  if (dir === maze.freeDir) {
    return { allowExit: true, playSecretTune: false, solved: false };
  }

  state.step = 0;
  return { allowExit: false, playSecretTune: false, solved: false };
}
