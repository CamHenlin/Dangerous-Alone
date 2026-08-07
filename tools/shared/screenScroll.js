/**
 * NES mode-7 screen / room scroll (ScrollWorld / ScrollWorldH @ Z_05.asm).
 *
 * Horizontal: every frame — OW 4 px, UW 2 px.
 * Vertical: 8 px steps — OW every 2 frames, UW every 4 frames.
 * Link is pushed opposite the camera so he enters the new screen.
 */

import { DIR, HUD_HEIGHT } from './collision.js';

export const PLAY_W = 256;
/** Play area under the 64px HUD (240 − HUD_HEIGHT). */
export const PLAY_H = 240 - HUD_HEIGHT;

const H_SPEED_OW = 4;
const H_SPEED_UW = 2;
const V_STEP = 8;
const V_PERIOD_OW = 2;
const V_PERIOD_UW = 4;

/**
 * @typedef {object} ScreenScrollState
 * @property {boolean} active
 * @property {number} dir DIR bit
 * @property {number} nextRoomId
 * @property {{ x?: number, y?: number, dir?: number } | null} spawn
 * @property {'overworld' | 'dungeon'} mode
 * @property {number} progress pixels scrolled so far
 * @property {number} total PLAY_W or PLAY_H
 * @property {number} frame frames elapsed while scrolling
 * @property {number} offsetX cumulative visual offset for bg pair
 * @property {number} offsetY
 */

/** @returns {ScreenScrollState} */
export function createScreenScroll() {
  return {
    active: false,
    dir: 0,
    nextRoomId: 0,
    spawn: null,
    mode: 'overworld',
    progress: 0,
    total: 0,
    frame: 0,
    offsetX: 0,
    offsetY: 0,
  };
}

/**
 * @param {ScreenScrollState} state
 * @param {{ dir: number, nextRoomId: number, spawn?: { x?: number, y?: number, dir?: number } | null, mode: 'overworld' | 'dungeon' }} opts
 */
export function beginScreenScroll(state, { dir, nextRoomId, spawn = null, mode }) {
  const horizontal = (dir & (DIR.LEFT | DIR.RIGHT)) !== 0;
  state.active = true;
  state.dir = dir;
  state.nextRoomId = nextRoomId & 0xff;
  state.spawn = spawn ?? null;
  state.mode = mode === 'dungeon' ? 'dungeon' : 'overworld';
  state.progress = 0;
  state.total = horizontal ? PLAY_W : PLAY_H;
  state.frame = 0;
  state.offsetX = 0;
  state.offsetY = 0;
}

/**
 * @param {ScreenScrollState} state
 */
export function isScrolling(state) {
  return Boolean(state?.active);
}

/**
 * Advance one frame of scroll.
 * @param {ScreenScrollState} state
 * @returns {{ done: boolean, offsetX: number, offsetY: number, linkDX: number, linkDY: number }}
 */
export function stepScreenScroll(state) {
  if (!state.active) {
    return { done: false, offsetX: 0, offsetY: 0, linkDX: 0, linkDY: 0 };
  }

  const ow = state.mode === 'overworld';
  let step = 0;
  let linkDX = 0;
  let linkDY = 0;

  if (state.dir & (DIR.LEFT | DIR.RIGHT)) {
    step = ow ? H_SPEED_OW : H_SPEED_UW;
    if (state.dir & DIR.RIGHT) {
      // Camera shows content to the right → bg shifts left; Link pushed left.
      state.offsetX -= step;
      linkDX = -step;
    } else {
      state.offsetX += step;
      linkDX = step;
    }
  } else {
    state.frame += 1;
    const period = ow ? V_PERIOD_OW : V_PERIOD_UW;
    if (state.frame % period === 0) {
      step = V_STEP;
      if (state.dir & DIR.DOWN) {
        state.offsetY -= step;
        linkDY = -step;
      } else if (state.dir & DIR.UP) {
        state.offsetY += step;
        linkDY = step;
      }
    }
  }

  state.progress += step;
  let done = false;
  if (state.progress >= state.total) {
    // Snap to exact end offsets.
    if (state.dir & DIR.RIGHT) state.offsetX = -state.total;
    else if (state.dir & DIR.LEFT) state.offsetX = state.total;
    else if (state.dir & DIR.DOWN) state.offsetY = -state.total;
    else if (state.dir & DIR.UP) state.offsetY = state.total;
    state.progress = state.total;
    state.active = false;
    done = true;
  }

  return {
    done,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    linkDX,
    linkDY,
  };
}
