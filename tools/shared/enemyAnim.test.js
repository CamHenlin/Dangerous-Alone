import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIR } from './collision.js';
import {
  bossSheetForLevel,
  enemyDrawFlags,
  enemyFlipH,
  enemyFrameIndex,
  enemyFrameTile,
  hasEnemySprite,
  sheetForPpuTile,
  uwSpecialSheetForLevel,
  wallmasterRightTile,
} from './enemyAnim.js';

test('OW octorok tiles map into overworld sheet', () => {
  const { sheet, index } = sheetForPpuTile(0xb4, 'overworld');
  assert.equal(sheet, 'overworld');
  assert.equal(index, 0xb4 - 0x8e);
});

test('boss aquamentus tiles map into level boss sheet', () => {
  const { sheet, index } = sheetForPpuTile(0xc4, 'dungeon', 1);
  assert.equal(sheet, 'boss1257');
  assert.equal(index, 0x04);
  assert.equal(sheetForPpuTile(0xc4, 'dungeon', 4).sheet, 'boss3468');
  assert.equal(sheetForPpuTile(0xc4, 'dungeon', 9).sheet, 'boss9');
});

test('UW special sheet follows LevelPatternBlockSrcAddrs', () => {
  assert.equal(uwSpecialSheetForLevel(1), 'uw127');
  assert.equal(uwSpecialSheetForLevel(3), 'uw358');
  assert.equal(uwSpecialSheetForLevel(4), 'uw469');
  assert.equal(uwSpecialSheetForLevel(7), 'uw127');
  assert.equal(bossSheetForLevel(7), 'boss1257');
  assert.equal(bossSheetForLevel(4), 'boss3468');
  // L4 Vire ($AC) must use 469 — 127 tiles look like split bats when mirrored.
  assert.equal(sheetForPpuTile(0xac, 'dungeon', 4).sheet, 'uw469');
  assert.equal(sheetForPpuTile(0xac, 'dungeon', 1).sheet, 'uw127');
});

test('octorok facing down uses frame offset 2', () => {
  assert.equal(enemyFrameIndex(0x07, DIR.DOWN, 0), 2);
  assert.equal(enemyFrameTile(0x07, 2), 0xb0);
});

test('octorok facing right flips', () => {
  assert.equal(enemyFlipH(0x07, DIR.RIGHT), true);
  assert.equal(enemyFlipH(0x07, DIR.LEFT), false);
});

test('octorok vertical facing uses mirrored draw + up V-flip', () => {
  const up = enemyDrawFlags(0x07, DIR.UP, 1);
  assert.equal(up.mirror, true);
  assert.equal(up.flipH, false);
  assert.equal(up.flipV, true);

  const down = enemyDrawFlags(0x07, DIR.DOWN, 2);
  assert.equal(down.mirror, true);
  assert.equal(down.flipV, false);

  const side = enemyDrawFlags(0x07, DIR.LEFT, 0);
  assert.equal(side.mirror, false);
  assert.equal(side.flipH, false);
});

test('tektite always mirrors', () => {
  assert.equal(enemyDrawFlags(0x0e, DIR.LEFT, 0).mirror, true);
  assert.equal(enemyDrawFlags(0x0e, DIR.UP, 0).mirror, true);
});

test('leever active frames use ObjAnimFrameHeap $C2/$C4', () => {
  assert.equal(enemyFrameIndex(0x10, DIR.LEFT, 0, { leeverPhase: 2 }), 4);
  assert.equal(enemyFrameTile(0x10, 4), 0xc2);
  assert.equal(enemyFrameTile(0x10, 5), 0xc4);
  assert.equal(enemyDrawFlags(0x10, DIR.LEFT, 4).mirror, true);
});

test('peahat uses ObjAnimFrameHeap $C6/$C8 mirrored on OW sheet', () => {
  assert.equal(enemyFrameTile(0x1a, 0), 0xc6);
  assert.equal(enemyFrameTile(0x1a, 1), 0xc8);
  assert.equal(enemyFrameIndex(0x1a, DIR.UP, 0), 0);
  assert.equal(enemyFrameIndex(0x1a, DIR.UP, 0x08), 1);
  assert.equal(enemyDrawFlags(0x1a, DIR.LEFT, 0).mirror, true);
  const { sheet, index } = sheetForPpuTile(0xc6, 'overworld');
  assert.equal(sheet, 'overworld');
  assert.equal(index, 0xc6 - 0x8e);
});

test('walker lynel/moblin use facing frames 0–3', () => {
  assert.equal(enemyFrameIndex(0x01, DIR.RIGHT, 0), 0);
  assert.equal(enemyFrameIndex(0x01, DIR.RIGHT, 0x08), 1);
  assert.equal(enemyFrameIndex(0x01, DIR.DOWN, 0), 2);
  assert.equal(enemyFrameIndex(0x01, DIR.UP, 0), 3);
  assert.equal(enemyFrameTile(0x01, 0), 0xce);
  assert.equal(enemyFrameTile(0x03, 0), 0xf0);
  assert.equal(enemyDrawFlags(0x03, DIR.RIGHT, 0).flipH, true);
  assert.equal(enemyDrawFlags(0x03, DIR.RIGHT, 0).mirror, false);
});

test('goriya shares darknut side CHR facing (H-flip on LEFT)', () => {
  // UW $B8/$BC face right; Darknut and Goriya both flip when facing left.
  assert.equal(enemyFrameTile(0x05, 0), 0xb8);
  assert.equal(enemyFrameTile(0x06, 0), 0xb8);
  assert.equal(enemyDrawFlags(0x05, DIR.LEFT, 0).flipH, true);
  assert.equal(enemyDrawFlags(0x05, DIR.RIGHT, 0).flipH, false);
  assert.equal(enemyDrawFlags(0x06, DIR.LEFT, 0).flipH, true);
  assert.equal(enemyDrawFlags(0x06, DIR.RIGHT, 0).flipH, false);
  assert.equal(enemyDrawFlags(0x05, DIR.LEFT, 0).mirror, false);
});

test('rope / gibdo / bubble CHR from UW heaps', () => {
  assert.equal(enemyFrameTile(0x28, 0), 0xa0);
  assert.equal(enemyFrameTile(0x28, 1), 0xa4);
  assert.equal(enemyFrameTile(0x30, 0), 0xa4);
  assert.equal(enemyFrameTile(0x2b, 0), 0x8e);
  assert.equal(hasEnemySprite(0x4a), true);
});

test('red and blue darknuts share ObjAnimFrameHeap H/D/U strips', () => {
  // ObjAnimations: $0B→$64, $0C→$6A — both decode to the same six left-tiles.
  const expected = [0xb8, 0xac, 0xb4, 0xbc, 0xb0, 0xb4];
  for (const t of [0x0b, 0x0c]) {
    for (let i = 0; i < expected.length; i += 1) {
      assert.equal(enemyFrameTile(t, i), expected[i], `type $${t.toString(16)} frame ${i}`);
    }
  }
  assert.equal(enemyFrameIndex(0x0b, DIR.DOWN, 0), 1);
  assert.equal(enemyDrawFlags(0x0b, DIR.LEFT, 0).flipH, true);
  assert.equal(enemyDrawFlags(0x0b, DIR.DOWN, 0).mirror, false);
});

test('underworld persons use Old Man tile $98 mirrored', () => {
  for (let t = 0x4b; t <= 0x52; t += 1) {
    assert.equal(hasEnemySprite(t), true, `$${t.toString(16)}`);
    assert.equal(enemyFrameTile(t, 0), 0x98);
    assert.equal(enemyDrawFlags(t, DIR.DOWN, 0).mirror, true);
  }
  const { sheet, index } = sheetForPpuTile(0x98, 'dungeon');
  assert.equal(sheet, 'uwCommon');
  assert.equal(index, 0x98 - 0x8e);
});

test('wallmaster uses NotMirrored open/closed hand columns', () => {
  // Mirroring $AC made Digdogger-like blobs; NES DrawObjectNotMirrored + patch.
  assert.equal(enemyFrameTile(0x27, 0), 0xac);
  assert.equal(enemyFrameTile(0x27, 1), 0x9c);
  assert.equal(wallmasterRightTile(0), 0xae);
  assert.equal(wallmasterRightTile(1), 0x9e);
  assert.equal(enemyDrawFlags(0x27, DIR.RIGHT, 0).mirror, false);
  assert.equal(enemyDrawFlags(0x27, DIR.LEFT, 0).flipH, true);
  assert.equal(sheetForPpuTile(0xac, 'dungeon', 7).sheet, 'uw127');
  assert.equal(sheetForPpuTile(0x9e, 'dungeon', 7).sheet, 'uw127');
});

test('stalfos always uses tile $A8; walk cycle is mirrored H-flip', () => {
  // Second quest / wrong frame used to pull Rope $A4 and flicker snake/skeleton.
  assert.equal(enemyFrameTile(0x2a, 0), 0xa8);
  assert.equal(enemyFrameTile(0x2a, 1), 0xa8);
  assert.equal(enemyFrameIndex(0x2a, DIR.LEFT, 0), 0);
  assert.equal(enemyFrameIndex(0x2a, DIR.RIGHT, 0x08), 1);
  // UW CHR column is mirrored; tile+2 pairing splits the body.
  assert.equal(enemyDrawFlags(0x2a, DIR.LEFT, 0).mirror, true);
  assert.equal(enemyDrawFlags(0x2a, DIR.LEFT, 0).flipH, false);
  assert.equal(enemyDrawFlags(0x2a, DIR.LEFT, 1).flipH, true);
  assert.equal(enemyDrawFlags(0x2a, DIR.RIGHT, 0).flipH, false);
  const { sheet, index } = sheetForPpuTile(0xa8, 'dungeon', 1);
  assert.equal(sheet, 'uw127');
  assert.equal(index, 0xa8 - 0x9e);
  assert.equal(sheetForPpuTile(0xa8, 'dungeon', 4).sheet, 'uw469');
});
