/**
 * Adjacent-room boss rumble — NES `CheckBossSoundEffectUW` (Z_05.asm:4131).
 *
 * Floor-item bits 5–6 pick the DMC slot. The request is ORed with `$80`
 * (background / DAC `$7F`) and DriveSample retriggers it every `$A0` frames
 * (`SampleCounter`). Boss-room flags `$C0` (all killed) jump to SilenceSample,
 * so coming back after the boss is dead is quiet.
 */

import { bossNoiseSfx } from './bosses.js';

/** DriveSample `LDA #$A0` / `STA SampleCounter` after starting a roar. */
export const BOSS_NOISE_PERIOD = 0xa0;

/**
 * Which roar this visit should make, or null to stay silent.
 *
 * @param {{ floorItem?: { bossNoise?: number } } | null | undefined} room
 * @param {{ bossRoomCleared?: boolean }} [opts]
 * @returns {string | null}
 */
export function bossNoiseSfxForVisit(room, opts = {}) {
  if (opts.bossRoomCleared) return null;
  return bossNoiseSfx(room?.floorItem?.bossNoise);
}

/**
 * NES `GetRoomFlags` of `LevelInfo_BossRoomId` then `AND #$C0` / `CMP #$C0`.
 * `clearedRooms` is this port's all-killed latch.
 *
 * @param {{ levelData?: { bossRoom?: number }, clearedRooms?: Set<number> } | null | undefined} dungeon
 */
export function dungeonBossRoomCleared(dungeon) {
  const id = dungeon?.levelData?.bossRoom;
  if (id == null) return false;
  return Boolean(dungeon.clearedRooms?.has(id & 0xff));
}

/**
 * Advance the rumble timer. Returns the sfx to start this frame, or null.
 *
 * `state.bossNoiseWait` is the remaining frames until the next trigger
 * (DriveSample's SampleCounter). First occupancy plays immediately.
 *
 * @param {{ bossNoiseWait?: number }} state
 * @param {{ floorItem?: { bossNoise?: number } } | null | undefined} room
 * @param {{ bossRoomCleared?: boolean }} [opts]
 * @returns {string | null}
 */
export function stepBossNoise(state, room, opts = {}) {
  const sfx = bossNoiseSfxForVisit(room, opts);
  if (!sfx) {
    state.bossNoiseWait = 0;
    return null;
  }
  const wait = state.bossNoiseWait | 0;
  if (wait > 0) {
    state.bossNoiseWait = wait - 1;
    return null;
  }
  state.bossNoiseWait = BOSS_NOISE_PERIOD;
  return sfx;
}
