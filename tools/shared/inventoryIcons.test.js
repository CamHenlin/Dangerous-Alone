import assert from 'node:assert/strict';
import { test } from 'node:test';
import { B_ITEM, SWORD, createInventory } from './inventory.js';
import {
  BOX_INVENTORY,
  BOX_SELECT,
  NES_B_ROW0_Y,
  NES_PASSIVE_Y,
  SUBMENU_B_SLOTS,
  bItemIcon,
  bSlotPos,
  passiveIcons,
  submenuY,
  swordIcon,
  swordSpritePalette,
} from './inventoryIcons.js';
import {
  buildOwnedTriforceRows,
  submenuDungeonMapLayout,
} from './submenuLayout.js';

test('swordSpritePalette matches NES Items[0]-1', () => {
  assert.equal(swordSpritePalette(SWORD.WOOD), 0);
  assert.equal(swordSpritePalette(SWORD.WHITE), 1);
  assert.equal(swordSpritePalette(SWORD.MAGIC), 2);
});

test('swordIcon uses master-sword tile for magic', () => {
  assert.equal(swordIcon(0), null);
  assert.deepEqual(swordIcon(SWORD.WOOD), { tile: 0x20, pal: 0 });
  assert.deepEqual(swordIcon(SWORD.WHITE), { tile: 0x20, pal: 1 });
  assert.deepEqual(swordIcon(SWORD.MAGIC), { tile: 0x48, pal: 2 });
});

test('bItemIcon reflects owned gear and tiers', () => {
  const inv = createInventory();
  assert.equal(bItemIcon(inv, B_ITEM.BOOMERANG), null);
  inv.boomerang = 1;
  assert.deepEqual(bItemIcon(inv, B_ITEM.BOOMERANG), { tile: 0x36, pal: 0 });
  inv.magicBoomerang = 1;
  assert.deepEqual(bItemIcon(inv, B_ITEM.BOOMERANG), { tile: 0x36, pal: 2 });
  inv.bow = 1;
  inv.arrow = 2;
  assert.deepEqual(bItemIcon(inv, B_ITEM.BOW), { tile: 0x28, pal: 2 });
  inv.letter = 1;
  assert.deepEqual(bItemIcon(inv, B_ITEM.POTION), { tile: 0x4c, pal: 0 });
  inv.potion = 2;
  assert.deepEqual(bItemIcon(inv, B_ITEM.POTION), { tile: 0x40, pal: 2 });
});

test('passiveIcons lists owned equipment keys', () => {
  const inv = createInventory();
  inv.raft = 1;
  inv.ladder = 1;
  inv.ring = 2;
  const icons = passiveIcons(inv);
  assert.ok(icons.some((i) => i.key === 'raft' && i.tile === 0x6c && i.x === 0x80));
  assert.ok(icons.some((i) => i.key === 'ladder' && i.tile === 0x76 && i.x === 0xb0));
  assert.ok(icons.some((i) => i.key === 'ring' && i.pal === 2 && i.x === 0xa0));
});

test('bSlotPos uses NES SubmenuItemXs / sprite Y', () => {
  // HUD docks bottom while menu is open — submenuY is NES absolute.
  assert.equal(submenuY(NES_PASSIVE_Y), NES_PASSIVE_Y);
  const boom = bSlotPos(SUBMENU_B_SLOTS[0]);
  assert.equal(boom.x, 0x80);
  assert.equal(boom.y, submenuY(NES_B_ROW0_Y));
  const bow = bSlotPos(SUBMENU_B_SLOTS.find((s) => s.id === B_ITEM.BOW));
  assert.equal(bow.x, 0xac);
  assert.equal(bow.bowX, 0xb4);
  assert.equal(bow.cursorX, 0xb0);
  const candle = bSlotPos(SUBMENU_B_SLOTS.find((s) => s.id === B_ITEM.CANDLE));
  assert.equal(candle.x, 0xc8);
  assert.equal(BOX_SELECT.w, 0x20);
  assert.equal(BOX_INVENTORY.w, 0x68);
  assert.ok(BOX_INVENTORY.x + BOX_INVENTORY.w <= 0xe0);
  assert.ok(submenuY(NES_PASSIVE_Y) + 16 <= BOX_INVENTORY.y());
});

test('buildOwnedTriforceRows fills tip for L1 bit', () => {
  const empty = buildOwnedTriforceRows(0);
  assert.equal(empty[1].tiles[1], 0xe9);
  const l1 = buildOwnedTriforceRows(0x01);
  assert.equal(l1[1].tiles[1], 0xe7);
  assert.equal(l1[2].tiles[1], 0xe7);
  assert.equal(l1[2].tiles[2], 0xf5);
});

test('UW submenu map/compass match DrawSubmenuItems and fit the 176px mask', () => {
  // ROM: map Y=$76, compass Y=$9E, both X=$2C. Sheet map 16×8×8px tiles.
  const uw = submenuDungeonMapLayout();
  assert.equal(uw.mapIcon.x, 0x2c);
  assert.equal(uw.mapIcon.y, 0x76);
  assert.equal(uw.compassIcon.x, 0x2c);
  assert.equal(uw.compassIcon.y, 0x9e);
  assert.equal(uw.compassIcon.y - uw.mapIcon.y, 0x28);
  assert.equal(uw.sheet.x, 0x60);
  assert.equal(uw.sheet.cellW, 8);
  assert.equal(uw.sheet.cellH, 8);
  // Icons overlay the sheet's left edge (not stacked below it).
  assert.ok(uw.mapIcon.y >= uw.sheet.y);
  assert.ok(uw.compassIcon.y < uw.sheet.y + 8 * uw.sheet.cellH);
  const sheetBottom = uw.sheet.y + 8 * uw.sheet.cellH + 2;
  const compassBottom = uw.compassIcon.y + 16;
  assert.ok(sheetBottom <= 176, `sheet bottom ${sheetBottom}`);
  assert.ok(compassBottom <= 176, `compass bottom ${compassBottom}`);
});
