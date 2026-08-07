import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activateEnemiesInView,
  enemyAwaitingView,
  enemyCombatActive,
  markEnemiesAwaitingView,
  skipsSpawnCloud,
} from './enemyViewActivation.js';
import { RUPEE_STASH } from './rupeeStash.js';

test('markEnemiesAwaitingView leaves edgePending gated', () => {
  const foes = [{ alive: true }, { alive: true, edgePending: true }];
  markEnemiesAwaitingView(foes);
  assert.equal(foes[0].viewActivated, false);
  assert.equal(enemyAwaitingView(foes[0]), true);
  assert.equal(enemyCombatActive(foes[0]), false);
  assert.equal(enemyAwaitingView(foes[1]), false);
});

test('activateEnemiesInView only awakens visible non-edge foes', () => {
  const foes = [
    { alive: true, viewActivated: false, id: 1 },
    { alive: true, viewActivated: false, id: 2 },
    { alive: true, viewActivated: false, edgePending: true, id: 3 },
  ];
  const newly = activateEnemiesInView(foes, (e) => e.id === 1);
  assert.equal(newly.length, 1);
  assert.equal(newly[0].id, 1);
  assert.equal(foes[0].viewActivated, true);
  assert.equal(foes[0].spawnCloud, 0x10);
  assert.equal(foes[1].viewActivated, false);
  assert.equal(foes[2].viewActivated, false);
  assert.equal(enemyCombatActive(foes[0]), true);
});

test('rupee stash skips spawn cloud on reveal', () => {
  const foes = [{ alive: true, viewActivated: false, objType: RUPEE_STASH, id: 1 }];
  assert.equal(skipsSpawnCloud(foes[0]), true);
  activateEnemiesInView(foes, () => true);
  assert.equal(foes[0].viewActivated, true);
  assert.equal(foes[0].spawnCloud, undefined);
});

test('off-screen tektites stay still until they enter view', () => {
  const tektites = [
    { alive: true, viewActivated: false, x: -40, y: 0xad },
    { alive: true, viewActivated: false, x: -20, y: 0xad },
    { alive: true, viewActivated: false, x: 0x20, y: 0xad },
  ];
  markEnemiesAwaitingView(tektites);
  activateEnemiesInView(tektites, (e) => e.x >= 0);
  assert.equal(tektites[0].viewActivated, false);
  assert.equal(tektites[1].viewActivated, false);
  assert.equal(tektites[2].viewActivated, true);
});
