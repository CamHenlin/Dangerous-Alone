/**
 * Enumerate every sprite in the game as a *whole character*, one entry per
 * animation frame.
 *
 * Sprites were being regenerated 16x16 at a time, which is one frame of one
 * normal enemy but only a fifth of Manhandla and a third of Gohma — so a boss
 * came back as parts drawn independently that do not agree with each other.
 * This walks the same frame and layout tables the renderer uses and writes out,
 * for each frame, the full set of CHR tiles that compose it and where each one
 * sits. The generator can then hand FLUX the entire character and cut the parts
 * back out afterwards.
 *
 * Positions are in NES pixels relative to the frame's own top-left; flips are
 * recorded per part so the extractor can undo them and store the tile the way
 * the sheet expects it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXTRACTED_DIR } from '../shared/paths.js';
import { DIR } from '../shared/collision.js';
import { OBJ } from '../shared/enemies.js';
import {
  enemyDrawFlags,
  enemyFrameIndex,
  enemyFrameTile,
  hasEnemySprite,
  sheetForPpuTile,
  wallmasterRightTile,
} from '../shared/enemyAnim.js';
import {
  DIGDOGGER_BIG_PARTS,
  GOHMA_PARTS,
  MANHANDLA_PARTS,
  enemyHalfSprite,
  hasBossComposer,
} from '../shared/bossSpriteLayouts.js';
import { linkWalkSprite } from '../shared/linkMotion.js';
import { swordAttackBaseTile } from '../shared/sword.js';

const OUT_PATH = path.join(EXTRACTED_DIR, 'play', 'sprite_frames.json');

/**
 * `sheetForPpuTile` answers in the renderer's sheet *keys*; the graphics
 * manifest and every enhance tool speak sheet *ids*. Translate here so the
 * manifest this writes is directly usable.
 */
const SHEET_KEY_TO_ID = Object.freeze({
  common: 'common_sprites',
  misc: 'common_misc',
  overworld: 'overworld_sprites',
  uwCommon: 'underworld_sprites_common',
  uw127: 'underworld_sprites_127',
  uw358: 'underworld_sprites_358',
  uw469: 'underworld_sprites_469',
  boss1257: 'boss_sprites_1257',
  boss3468: 'boss_sprites_3468',
  boss9: 'boss_sprites_9',
  demoSprites: 'demo_sprites',
  commonBg: 'common_background',
  overworldBg: 'overworld_bg',
  demoBg: 'demo_background',
});

function sheetId(key) {
  return SHEET_KEY_TO_ID[key] ?? key;
}
const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
/** Every dungeon level, so every level-specific sprite sheet is reachable. */
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * One 16x16 sprite = four CHR tiles in UL, LL, UR, LR order.
 * @param {number} ppu top-left PPU tile id
 * @param {'overworld'|'dungeon'} mode
 * @param {number} level
 * @param {number} ox
 * @param {number} oy
 * @param {{ mirror?: boolean, flipH?: boolean, flipV?: boolean }} flags
 */
function quad(ppu, mode, level, ox, oy, flags = {}) {
  const parts = [];
  // A mirrored sprite draws its right half as an H-flip of its left, so only
  // two distinct tiles exist; recording it that way keeps the extractor from
  // inventing art for a tile the ROM never had.
  const rightBase = flags.mirror ? ppu : ppu + 2;
  const cells = [
    [ppu, 0, 0, false],
    [ppu + 1, 0, 8, false],
    [rightBase, 8, 0, Boolean(flags.mirror)],
    [rightBase + 1, 8, 8, Boolean(flags.mirror)],
  ];
  for (const [tile, dx, dy, mirroredHalf] of cells) {
    const loc = sheetForPpuTile(tile & 0xff, mode, level);
    if (!loc) continue;
    parts.push({
      sheet: sheetId(loc.sheet),
      index: loc.index,
      x: ox + dx,
      y: oy + dy,
      flipH: Boolean(flags.flipH) !== mirroredHalf,
      flipV: Boolean(flags.flipV),
    });
  }
  return parts;
}

/** An 8x16 sprite = two stacked tiles. */
function half(ppu, mode, level, ox, oy, flags = {}) {
  const parts = [];
  for (const [tile, dy] of [[ppu, 0], [ppu + 1, 8]]) {
    const loc = sheetForPpuTile(tile & 0xff, mode, level);
    if (!loc) continue;
    parts.push({
      sheet: sheetId(loc.sheet),
      index: loc.index,
      x: ox,
      y: oy + dy,
      flipH: Boolean(flags.flipH),
      flipV: Boolean(flags.flipV),
    });
  }
  return parts;
}

function bossFrames(objType, mode, level) {
  const frames = [];
  const layouts = {
    [OBJ.MANHANDLA]: MANHANDLA_PARTS,
    [OBJ.GOHMA]: GOHMA_PARTS,
    [OBJ.GOHMA_RED]: GOHMA_PARTS,
    [OBJ.DIGDOGGER]: DIGDOGGER_BIG_PARTS,
    [OBJ.DIGDOGGER_1]: DIGDOGGER_BIG_PARTS,
  };
  const layout = layouts[objType];
  if (!layout) return frames;
  const parts = [];
  for (const p of layout) {
    parts.push(...quad(p.tile, mode, level, p.x, p.y, {
      mirror: p.mirror, flipH: p.flipH, flipV: p.flipV,
    }));
  }
  if (parts.length) frames.push({ key: `boss:${objType}`, parts });
  return frames;
}

function linkFrames() {
  const frames = [];
  for (const dir of DIRS) {
    for (let anim = 0; anim < 2; anim += 1) {
      // Link is two 8x16 halves whose tiles are *not* consecutive — walking
      // down is 0x58/0x59 on the left and 0x0a/0x0b on the right. Building him
      // with quad(baseTile) assumed four consecutive tiles, which pulled in
      // 0x5a from the other animation frame, missed the real right half, and
      // swapped the halves on the side-facing frames. The result decomposed
      // into garbage that did not even read as a character.
      const s = linkWalkSprite(dir, anim);
      const parts = [
        ...half(s.leftTile, 'overworld', 1, 0, 0, { flipH: s.flipLeft }),
        ...half(s.rightTile, 'overworld', 1, 8, 0, { flipH: s.flipRight }),
      ];
      if (parts.length) frames.push({ key: `link:walk:${dir}:${anim}`, parts });
    }
    // The attack poses *are* four consecutive tiles (`swordAttackBaseTile`).
    const atk = swordAttackBaseTile(dir);
    const parts = quad(atk, 'overworld', 1, 0, 0, { flipH: Boolean(dir & DIR.LEFT) });
    if (parts.length) frames.push({ key: `link:attack:${dir}`, parts });
  }
  return frames;
}

/**
 * @param {{ quiet?: boolean }} [opts]
 */
export function dumpSpriteFrames({ quiet = false } = {}) {
  /** @type {object[]} */
  const frames = [...linkFrames()];

  for (const objType of new Set(Object.values(OBJ))) {
    if (typeof objType !== 'number') continue;
    // Every level, not just level 1. The sheet a PPU id resolves to depends on
    // the level, so enumerating only level 1 reached the level-1 sheets and
    // nothing else: boss_sprites_3468, boss_sprites_9, underworld_sprites_358
    // and underworld_sprites_469 were never generated at all. Frames whose
    // tiles are already covered get dropped by the dedup below, so the extra
    // levels cost nothing where the sheets are shared.
    for (const mode of ['overworld', 'dungeon']) {
      for (const level of LEVELS) {
        if (hasBossComposer(objType)) {
          // Bosses only ever appear underground, and the same PPU id resolves
          // to a different sheet in overworld mode — enumerating both would
          // generate art for unrelated tiles using a boss's layout.
          if (mode === 'dungeon') frames.push(...bossFrames(objType, mode, level));
          continue;
        }
        if (!hasEnemySprite(objType)) continue;
        for (const dir of DIRS) {
          for (let anim = 0; anim < 2; anim += 1) {
            const frameIndex = enemyFrameIndex(objType, dir, anim, {});
            const flags = enemyDrawFlags(objType, dir, frameIndex);
            let parts;
            if (objType === OBJ.WALLMASTER) {
              parts = [
                ...half(0xac, mode, level, 0, 0, flags),
                ...half(wallmasterRightTile(frameIndex), mode, level, 8, 0, flags),
              ];
            } else {
              const ppu = enemyFrameTile(objType, frameIndex);
              if (ppu == null) continue;
              parts = enemyHalfSprite(objType)
                ? half(ppu, mode, level, 0, 0, flags)
                : quad(ppu, mode, level, 0, 0, flags);
            }
            if (parts.length) {
              frames.push({ key: `obj:${objType}:${mode}:${level}:${dir}:${anim}`, parts });
            }
          }
        }
      }
    }
  }

  // Size each frame from the parts it actually contains.
  for (const f of frames) {
    f.width = Math.max(...f.parts.map((p) => p.x + 8));
    f.height = Math.max(...f.parts.map((p) => p.y + 8));
  }

  // Drop frames whose tile set is already covered by an earlier, larger frame:
  // every tile still gets generated, just in the most complete context we have.
  //
  // Link is exempt. Left and right are the same tiles H-flipped, so the dedup
  // dropped a facing entirely and the manifest held only three of his four
  // directions — fine for tile coverage, useless when what you want to look at
  // is the character assembled in every direction.
  const seen = new Set();
  const kept = [];
  for (const f of [...frames].sort((a, b) => b.parts.length - a.parts.length)) {
    const ids = f.parts.map((p) => `${p.sheet}#${p.index}`);
    if (!f.key.startsWith('link:') && ids.every((id) => seen.has(id))) continue;
    ids.forEach((id) => seen.add(id));
    kept.push(f);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ frames: kept }));
  if (!quiet) {
    console.log(`Wrote ${kept.length} sprite frames (${seen.size} distinct tiles) → ${path.relative(EXTRACTED_DIR, OUT_PATH)}`);
  }
  return kept.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dumpSpriteFrames();
}
