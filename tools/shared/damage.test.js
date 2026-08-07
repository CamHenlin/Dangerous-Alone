import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  damageByteToHalfHearts,
  damageHalfHeartsForType,
} from './damage.js';

test('damage byte $80 is half a heart', () => {
  assert.equal(damageByteToHalfHearts(0x80), 1);
});

test('damage byte $01 is one full heart', () => {
  assert.equal(damageByteToHalfHearts(0x01), 2);
});

test('damage byte $02 is two full hearts', () => {
  assert.equal(damageByteToHalfHearts(0x02), 4);
});

test('damage byte $04 is four full hearts (Ganon)', () => {
  assert.equal(damageByteToHalfHearts(0x04), 8);
});

test('damage byte $00 deals nothing (Bubble)', () => {
  assert.equal(damageByteToHalfHearts(0x00), 0);
});

test('octoroks and tektites deal half a heart', () => {
  assert.equal(damageHalfHeartsForType(0x07), 1); // red octorok
  assert.equal(damageHalfHeartsForType(0x0a), 1); // blue octorok fast
  assert.equal(damageHalfHeartsForType(0x0d), 1); // blue tektite
  assert.equal(damageHalfHeartsForType(0x0e), 1); // red tektite
});

test('blue leever deals a full heart; red leever half', () => {
  assert.equal(damageHalfHeartsForType(0x0f), 2);
  assert.equal(damageHalfHeartsForType(0x10), 1);
});

test('Aquamentus contact is one heart; Ganon is four', () => {
  assert.equal(damageHalfHeartsForType(0x3d), 2);
  assert.equal(damageHalfHeartsForType(0x3e), 8);
});

test('octorok rock and Aquamentus fireball are half a heart', () => {
  assert.equal(damageHalfHeartsForType(0x53), 1);
  assert.equal(damageHalfHeartsForType(0x55), 1);
});
