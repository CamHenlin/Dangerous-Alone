/**
 * Facing-polarity audit — locks H-flip vs side CHR for every dir-flipped actor.
 *
 * Method (2026-08-10): compose each side frame from extracted CHR and read
 * landmarks (nozzle anim diff, sword/spear/snout, shield, ghost face). Most
 * sheets face RIGHT → flip on LEFT (Link). Exceptions face LEFT → flip on RIGHT.
 *
 * Actors that always DrawObjectMirrored (Tektite, Leever, Zora, Vire, Zol, Gel,
 * Pols, LikeLike, Peahat, Keese, persons, …) have no horizontal facing and are
 * omitted. Stalfos/Gibdo/Bubble use anim H-flip as a walk cycle, not facing.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import { dodongoBloatedDraw, dodongoWalkDraw } from './bossSpriteLayouts.js';
import { enemyDrawFlags, sideFacingFlipH } from './enemyAnim.js';
import { linkWalkSprite } from './linkMotion.js';

/** @typedef {'LEFT' | 'RIGHT'} FlipOn */

/**
 * Expected H-flip polarity when facing horizontally.
 * flipOn = which facing direction applies flipH (the side opposite CHR art).
 * @type {ReadonlyArray<{ name: string, objType: number | null, flipOn: FlipOn, notes: string }>}
 */
const DIR_FLIPPED_ACTORS = Object.freeze([
  // Link is not an ObjType — checked via linkWalkSprite below.
  { name: 'Link', objType: null, flipOn: 'LEFT', notes: 'common $00/$04 side; tip/shield → faces RIGHT' },
  { name: 'Octorok red slow', objType: 0x07, flipOn: 'RIGHT', notes: 'OW $B4/$B8 nozzle anim on left column' },
  { name: 'Octorok red fast', objType: 0x08, flipOn: 'RIGHT', notes: 'same strip as slow' },
  { name: 'Octorok blue slow', objType: 0x09, flipOn: 'RIGHT', notes: 'same strip as slow' },
  { name: 'Octorok blue fast', objType: 0x0a, flipOn: 'RIGHT', notes: 'same strip as slow' },
  { name: 'Lynel red', objType: 0x01, flipOn: 'LEFT', notes: 'OW $CE side faces RIGHT' },
  { name: 'Lynel blue', objType: 0x02, flipOn: 'LEFT', notes: 'OW $CE side faces RIGHT' },
  { name: 'Moblin red', objType: 0x03, flipOn: 'LEFT', notes: 'OW $F0 side faces RIGHT' },
  { name: 'Moblin blue', objType: 0x04, flipOn: 'LEFT', notes: 'OW $F0 side faces RIGHT' },
  { name: 'Goriya red', objType: 0x05, flipOn: 'LEFT', notes: 'UW $B8 Darknut strip faces RIGHT' },
  { name: 'Goriya blue', objType: 0x06, flipOn: 'LEFT', notes: 'UW $B8 Darknut strip faces RIGHT' },
  { name: 'Darknut red', objType: 0x0b, flipOn: 'LEFT', notes: 'UW $B8 side faces RIGHT' },
  { name: 'Darknut blue', objType: 0x0c, flipOn: 'LEFT', notes: 'UW $B8 side faces RIGHT' },
  { name: 'Wizzrobe blue', objType: 0x23, flipOn: 'LEFT', notes: 'UW $B4 side faces RIGHT' },
  { name: 'Wizzrobe red', objType: 0x24, flipOn: 'LEFT', notes: 'UW $B4 side faces RIGHT' },
  { name: 'Rope', objType: 0x28, flipOn: 'LEFT', notes: 'UW $A0 head/tongue on right' },
  { name: 'Wallmaster', objType: 0x27, flipOn: 'LEFT', notes: 'UW open hand; approx facing flip' },
  { name: 'Armos', objType: 0x1e, flipOn: 'RIGHT', notes: 'OW front; shield forward on left' },
  { name: 'Ghini', objType: 0x21, flipOn: 'RIGHT', notes: 'OW $E0/$E4 face/hood on left' },
  { name: 'Flying Ghini', objType: 0x22, flipOn: 'RIGHT', notes: 'same Ghini strip' },
]);

test('sideFacingFlipH matches audited polarity for every dir-flipped enemy', () => {
  for (const actor of DIR_FLIPPED_ACTORS) {
    if (actor.objType == null) continue;
    const flipLeft = sideFacingFlipH(actor.objType, DIR.LEFT);
    const flipRight = sideFacingFlipH(actor.objType, DIR.RIGHT);
    if (actor.flipOn === 'LEFT') {
      assert.equal(flipLeft, true, `${actor.name}: expected flip on LEFT (${actor.notes})`);
      assert.equal(flipRight, false, `${actor.name}: must not flip on RIGHT`);
    } else {
      assert.equal(flipRight, true, `${actor.name}: expected flip on RIGHT (${actor.notes})`);
      assert.equal(flipLeft, false, `${actor.name}: must not flip on LEFT`);
    }
    // Draw flags must agree on horizontal facing (frame 0).
    const left = enemyDrawFlags(actor.objType, DIR.LEFT, 0);
    const right = enemyDrawFlags(actor.objType, DIR.RIGHT, 0);
    assert.equal(left.flipH, flipLeft, `${actor.name}: enemyDrawFlags LEFT`);
    assert.equal(right.flipH, flipRight, `${actor.name}: enemyDrawFlags RIGHT`);
  }
});

test('Link side walk flips on LEFT (CHR faces RIGHT)', () => {
  assert.equal(linkWalkSprite(DIR.LEFT, 0).flipH, true);
  assert.equal(linkWalkSprite(DIR.RIGHT, 0).flipH, false);
  assert.equal(linkWalkSprite(DIR.LEFT, 1).flipH, true);
  assert.equal(linkWalkSprite(DIR.RIGHT, 1).flipH, false);
});

test('Dodongo side walk / bloated flip on LEFT (head CHR faces RIGHT)', () => {
  const walkR = dodongoWalkDraw(DIR.RIGHT, 0);
  const walkL = dodongoWalkDraw(DIR.LEFT, 0);
  assert.equal(walkR.flipH, false);
  assert.equal(walkL.flipH, true);
  // LEFT also swaps 16×16 halves (NES side draw).
  assert.notEqual(walkL.leftTile, walkR.leftTile);

  const bloatedR = dodongoBloatedDraw(DIR.RIGHT);
  const bloatedL = dodongoBloatedDraw(DIR.LEFT);
  assert.equal(bloatedR.flipH, false);
  assert.equal(bloatedL.flipH, true);
});

test('mirrored-only enemies never dir-flip horizontally', () => {
  const mirrored = [
    0x0d, 0x0e, // tektite
    0x0f, 0x10, // leever
    0x11, // zora
    0x12, // vire
    0x13, 0x14, // zol / gel
    0x16, 0x17, // pols / like-like
    0x1a, // peahat
    0x1b, 0x1c, 0x1d, // keese
  ];
  for (const t of mirrored) {
    const L = enemyDrawFlags(t, DIR.LEFT, 0);
    const R = enemyDrawFlags(t, DIR.RIGHT, 0);
    assert.equal(L.mirror, true, `$${t.toString(16)} should mirror`);
    assert.equal(L.flipH, R.flipH, `$${t.toString(16)} flipH must not depend on LEFT/RIGHT`);
  }
});

test('stalfos / gibdo / bubble walk cycle is anim flip, not facing', () => {
  for (const t of [0x2a, 0x30, 0x2b]) {
    assert.equal(enemyDrawFlags(t, DIR.LEFT, 0).flipH, false);
    assert.equal(enemyDrawFlags(t, DIR.RIGHT, 0).flipH, false);
    assert.equal(enemyDrawFlags(t, DIR.LEFT, 1).flipH, true);
    assert.equal(enemyDrawFlags(t, DIR.RIGHT, 1).flipH, true);
  }
});
