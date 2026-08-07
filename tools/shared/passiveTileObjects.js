/**
 * NES CheckPassiveTileObjects (Z_01) — spawn Armos / Flying Ghini from
 * gravestone and Armos squares ($BC–$C3) when Link walks into them.
 */

import {
  DIR,
  HUD_HEIGHT,
  LINK_HOTSPOT_Y,
  getLinkCollidingTile,
  objectHotspotOffset,
} from './collision.js';

/** ObjType for tile wakes (avoid importing enemies.js). */
const ARMOS = 0x1e;
const FLYING_GHINI = 0x22;

/** Collided tile range for graves ($BC–$BF) and Armos ($C0–$C3). */
export const PASSIVE_TILE_MIN = 0xbc;
export const PASSIVE_TILE_MAX = 0xc3;

/** Fade-in frames (InitArmosOrFlyingGhini ObjTimer). */
export const PASSIVE_FADE_FRAMES = 0x3f;

/**
 * Sample pixel used by GetCollidingTileMoving for Link (for square snap).
 * @param {number} objX
 * @param {number} objY
 * @param {number} dir
 */
export function linkCollisionSample(objX, objY, dir) {
  const offset = objectHotspotOffset(dir, true);
  let sampleY = objY + LINK_HOTSPOT_Y;
  let sampleX = objX;
  const vertical = Boolean(dir & (DIR.UP | DIR.DOWN));
  const horizontal = Boolean(dir & (DIR.LEFT | DIR.RIGHT));
  if (vertical) {
    if ((dir & DIR.DOWN) === 0 || sampleY < 0xdd) sampleY += offset;
  } else if (horizontal) {
    if ((dir & DIR.RIGHT && sampleX < 0xf0) || (dir & DIR.LEFT && sampleX >= 0x10)) {
      sampleX += offset;
    }
  }
  sampleX &= 0xf8;
  return { x: sampleX, y: sampleY };
}

/**
 * 16×16 square top-left from a collision sample (Armos/grave grid).
 * @param {number} sampleX
 * @param {number} sampleY screen Y
 */
export function squareFromCollisionSample(sampleX, sampleY) {
  const col = Math.floor(sampleX / 16);
  const row = Math.floor((sampleY - HUD_HEIGHT) / 16);
  return {
    col,
    row,
    x: col * 16,
    y: HUD_HEIGHT + row * 16,
  };
}

/**
 * True when tile is an Armos or gravestone square CHR.
 * @param {number} tile
 */
export function isPassiveTile(tile) {
  const t = tile & 0xff;
  return t >= PASSIVE_TILE_MIN && t <= PASSIVE_TILE_MAX;
}

/**
 * @param {{ x: number, y: number, alive?: boolean, objType?: number }[]} enemies
 * @param {number} x
 * @param {number} y
 */
export function passiveObjectAt(enemies, x, y) {
  return enemies.some(
    (e) =>
      e.alive
      && e.x === x
      && e.y === y
      && (e.objType === ARMOS || e.objType === FLYING_GHINI),
  );
}

/**
 * Try to instantiate Armos / Flying Ghini from the tile Link is pushing into.
 * Call when gridOffset === 0 and input direction ≠ 0 (NES gates).
 *
 * @param {{ x: number, y: number, dir: number, gridOffset?: number }} link
 * @param {number[][]} tileGrid
 * @param {number} inputDir
 * @param {import('./enemies.js').Enemy[]} enemies
 * @param {(spawn: object) => import('./enemies.js').Enemy | null} createEnemy
 * @returns {import('./enemies.js').Enemy | null}
 */
export function trySpawnPassiveTileObject(link, tileGrid, inputDir, enemies, createEnemy) {
  if (!tileGrid || !inputDir) return null;
  if ((link.gridOffset ?? 0) !== 0) return null;

  const hit = getLinkCollidingTile(tileGrid, link.x, link.y, inputDir);
  if (!isPassiveTile(hit.tile)) return null;

  const sample = linkCollisionSample(link.x, link.y, inputDir);
  const square = squareFromCollisionSample(sample.x, sample.y);
  if (square.row < 0 || square.col < 0) return null;
  if (passiveObjectAt(enemies, square.x, square.y)) return null;

  const objType = hit.tile >= 0xc0 ? ARMOS : FLYING_GHINI;
  const e = createEnemy({ objType, x: square.x, y: square.y });
  if (!e) return null;

  if (objType === ARMOS) {
    // NES: fade in immediately (ObjTimer=$3F); secret patches when timer hits 0.
    e.armosStatue = false;
    e.armosFade = PASSIVE_FADE_FRAMES;
    e.gridOffset = 3; // InitArmosOrFlyingGhini grid align
  }
  return e;
}
