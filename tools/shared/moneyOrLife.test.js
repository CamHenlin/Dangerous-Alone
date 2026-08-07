import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory } from './inventory.js';
import {
  MONEY_OR_LIFE_PERSON,
  dismissMoneyOrLifePerson,
  isPersonType,
  moneyOrLifeReady,
  tryPayMoneyOrLife,
} from './moneyOrLife.js';

test('person types $4B–$53', () => {
  assert.equal(isPersonType(0x4b), true);
  assert.equal(isPersonType(0x51), true);
  assert.equal(isPersonType(0x52), true);
  assert.equal(isPersonType(0x53), false); // flying rock
  assert.equal(isPersonType(0x2a), false);
});

test('money-or-life ready when person gone', () => {
  const foes = [{ alive: true, objType: MONEY_OR_LIFE_PERSON }];
  assert.equal(moneyOrLifeReady(foes), false);
  dismissMoneyOrLifePerson(foes);
  assert.equal(moneyOrLifeReady(foes), true);
});

test('pay 50 rupees on ware X=$98', () => {
  const inv = createInventory();
  inv.rupees = 60;
  assert.equal(tryPayMoneyOrLife(inv, 0x98, 0x98), 'rupees');
  assert.equal(inv.rupees, 10);
  assert.equal(tryPayMoneyOrLife(inv, 0x98, 0x98), null); // not enough
});

test('pay heart container on ware X=$58', () => {
  const inv = createInventory();
  inv.maxHalfHearts = 12; // 6 containers
  inv.halfHearts = 12;
  assert.equal(tryPayMoneyOrLife(inv, 0x58, 0x98), 'heart');
  assert.equal(inv.maxHalfHearts, 10);
});
