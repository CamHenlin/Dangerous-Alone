import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOMB_UPGRADE_PERSON, BOMB_UPGRADE_WARE } from './bombUpgrade.js';
import { MONEY_OR_LIFE_PERSON } from './moneyOrLife.js';
import {
  PERSON_WARE_HEART,
  PERSON_WARE_RUPEE,
  personOfferWares,
} from './personWares.js';

test('bomb-upgrade person offers rupee ware at ($78,$98) with -100', () => {
  const wares = personOfferWares([{ alive: true, objType: BOMB_UPGRADE_PERSON }]);
  assert.equal(wares.length, 1);
  assert.equal(wares[0].x, BOMB_UPGRADE_WARE.x);
  assert.equal(wares[0].y, BOMB_UPGRADE_WARE.y);
  assert.equal(wares[0].itemType, PERSON_WARE_RUPEE);
  assert.equal(wares[0].priceLabel, '-100');
});

test('bomb-upgrade ware hidden once room offer is taken', () => {
  const foes = [{ alive: true, objType: BOMB_UPGRADE_PERSON }];
  assert.equal(personOfferWares(foes, { bombTaken: true }).length, 0);
});

test('money-or-life offers heart and rupee wares', () => {
  const wares = personOfferWares([{ alive: true, objType: MONEY_OR_LIFE_PERSON }]);
  assert.equal(wares.length, 2);
  assert.deepEqual(
    wares.map((w) => [w.x, w.itemType, w.priceLabel]),
    [
      [0x58, PERSON_WARE_HEART, '-1'],
      [0x98, PERSON_WARE_RUPEE, '-50'],
    ],
  );
});

test('no wares without a living offer person', () => {
  assert.equal(personOfferWares([]).length, 0);
  assert.equal(
    personOfferWares([{ alive: false, objType: BOMB_UPGRADE_PERSON }]).length,
    0,
  );
});
