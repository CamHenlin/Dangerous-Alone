import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUDIO_BUS_METHODS, createAudioBus, createRecordingAudio } from './audioBus.js';

test('the bus forwards every method to the device', () => {
  /** @type {string[]} */
  const seen = [];
  const device = {};
  for (const m of AUDIO_BUS_METHODS) device[m] = (...args) => seen.push(`${m}:${args[0]}`);
  const bus = createAudioBus(() => device);
  for (const m of AUDIO_BUS_METHODS) bus[m]('x');
  assert.deepEqual(
    seen,
    AUDIO_BUS_METHODS.map((m) => `${m}:x`),
  );
});

test('a missing device is silent rather than a crash', () => {
  const bus = createAudioBus(() => null);
  assert.doesNotThrow(() => bus.playSfx('sword_shot'));
});

test('the device return value comes back, so unlock() can be awaited', async () => {
  const bus = createAudioBus(() => ({ unlock: async () => 'ready' }));
  assert.equal(await bus.unlock(), 'ready');
});

test('unlock() chains even with no device, so no call site needs a guard', async () => {
  const bus = createAudioBus(() => null);
  let ran = false;
  await bus.unlock().then(() => {
    ran = true;
  });
  assert.equal(ran, true);
});

test('unlock() chains on a device that has no unlock method', async () => {
  const bus = createAudioBus(() => ({ playSfx: () => {} }));
  await assert.doesNotReject(() => bus.unlock().then(() => {}));
});

test('the recording bus keeps unlock awaitable too', async () => {
  const bus = createRecordingAudio();
  await bus.unlock().then(() => {});
  assert.deepEqual(
    bus.calls.map((c) => c.method),
    ['unlock'],
  );
});

test('a device missing one method is silent for that method only', () => {
  let played = 0;
  const bus = createAudioBus(() => ({ playSfx: () => (played += 1) }));
  bus.playSfx('bomb_set');
  assert.doesNotThrow(() => bus.playFanfare('triforce'));
  assert.equal(played, 1);
});

test('the device is resolved per call, so it can arrive late', () => {
  /** @type {object | null} */
  let device = null;
  const heard = [];
  const bus = createAudioBus(() => device);
  bus.playSfx('too_early');
  device = { playSfx: (n) => heard.push(n) };
  bus.playSfx('now_audible');
  assert.deepEqual(heard, ['now_audible']);
});

test('the recording bus keeps order and reports names', () => {
  const bus = createRecordingAudio();
  bus.playSfx('sword_shot');
  bus.playSfx('shield');
  bus.playFanfare('triforce');
  assert.deepEqual(bus.names(), ['sword_shot', 'shield', 'triforce']);
  assert.deepEqual(bus.calls[2], { method: 'playFanfare', args: ['triforce'] });
});

test('draining the recording bus empties it and hands back what was there', () => {
  const bus = createRecordingAudio();
  bus.playSfx('rupee');
  const drained = bus.drain();
  assert.equal(drained.length, 1);
  assert.equal(bus.calls.length, 0);
  assert.deepEqual(bus.names(), []);
});
