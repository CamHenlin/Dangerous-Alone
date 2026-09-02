import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOSS_NOISE_PERIOD,
  bossNoiseSfxForVisit,
  dungeonBossRoomCleared,
  stepBossNoise,
} from './bossNoise.js';

const roarRoom = { floorItem: { bossNoise: 1 } };
const quietRoom = { floorItem: { bossNoise: 0 } };

test('CheckBossSoundEffectUW is silent when the boss room is cleared', () => {
  assert.equal(bossNoiseSfxForVisit(roarRoom, { bossRoomCleared: true }), null);
  assert.equal(bossNoiseSfxForVisit(roarRoom, { bossRoomCleared: false }), 'boss_roar_1');
  assert.equal(bossNoiseSfxForVisit(quietRoom), null);
});

test('DriveSample retriggers every $A0 frames, not every sample end', () => {
  const state = {};
  assert.equal(stepBossNoise(state, roarRoom), 'boss_roar_1');
  assert.equal(state.bossNoiseWait, BOSS_NOISE_PERIOD);

  let plays = 0;
  for (let i = 0; i < BOSS_NOISE_PERIOD; i += 1) {
    if (stepBossNoise(state, roarRoom)) plays += 1;
  }
  assert.equal(plays, 0, 'must not roar again until SampleCounter elapses');
  assert.equal(stepBossNoise(state, roarRoom), 'boss_roar_1');
});

test('boss-room flags $C0 (clearedRooms) match GetRoomFlags of LevelInfo_BossRoomId', () => {
  assert.equal(
    dungeonBossRoomCleared({
      levelData: { bossRoom: 0x35 },
      clearedRooms: new Set(),
    }),
    false,
  );
  assert.equal(
    dungeonBossRoomCleared({
      levelData: { bossRoom: 0x35 },
      clearedRooms: new Set([0x35]),
    }),
    true,
  );
});

test('leaving a roar room or a defeated boss resets the wait', () => {
  const state = { bossNoiseWait: 40 };
  assert.equal(stepBossNoise(state, quietRoom), null);
  assert.equal(state.bossNoiseWait, 0);

  state.bossNoiseWait = 40;
  assert.equal(stepBossNoise(state, roarRoom, { bossRoomCleared: true }), null);
  assert.equal(state.bossNoiseWait, 0);
});
