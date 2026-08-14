/**
 * Overworld secret squares ($E5–$EA via square types $26–$2B).
 *
 * Tile object types (aldonunez Z_05 / Z_04):
 *   $E5 → $62 rock (push, bracelet)
 *   $E6 → $63 rock wall (bomb) → cave mouth
 *   $E7 → $64 tree (burn) → stairs
 *   $E8 → $65 gravestone (push, no bracelet)
 *   $E9 / $EA → recorder / special armos stairs
 */

import { DIR, HUD_HEIGHT } from './collision.js';

/** Secret marker → reveal action (TileObjectTypes $62–$67). */
export const SECRET_ACTION = Object.freeze({
  0xe5: 'push',
  0xe6: 'bomb',
  0xe7: 'burn',
  0xe8: 'push',
  0xe9: 'recorder',
  0xea: 'recorder',
});

/** Opened burn / push / recorder secret — OW stairs ($70–$73). */
export const SECRET_STAIRS_TILES = Object.freeze([0x70, 0x71, 0x72, 0x73]);

/**
 * Opened bomb-wall secret — secondary square $0C (MakeCave).
 * UL/LL/UR/LR = $F3,$24,$F3,$24 (both blank; $F3 lives on common_misc so
 * runtime BG patches must underlay opaque black — see `patchOwBgSquare`).
 */
export const SECRET_CAVE_TILES = Object.freeze([0xf3, 0x24, 0xf3, 0x24]);

/** Hold frames before a grave/rock slides (UpdateRockOrGravestone ≈ $10). */
export const GRAVE_PUSH_HOLD = 0x10;

/**
 * @param {number} marker secret primary $E5–$EA
 * @returns {readonly number[]}
 */
export function tilesForSecretMarker(marker) {
  // Rock wall → cave mouth; everything else that opens becomes stairs.
  if (marker === 0xe6) return SECRET_CAVE_TILES;
  return SECRET_STAIRS_TILES;
}

/**
 * Effective action for a secret (prefer ROM marker map over baked JSON).
 * @param {{ marker?: number, action?: string }} secret
 */
export function secretAction(secret) {
  const marker = secret?.marker;
  if (marker != null && SECRET_ACTION[marker] != null) {
    return SECRET_ACTION[marker];
  }
  return secret?.action ?? 'bomb';
}

/**
 * @param {number} square square index from column decode
 * @param {number[]} primarySquares
 * @returns {number | null} marker $E5–$EA or null
 */
export function secretMarkerForSquare(square, primarySquares) {
  if (square < 0x10) return null;
  const primary = primarySquares[square];
  if (primary >= 0xe5 && primary <= 0xea) return primary;
  return null;
}

/**
 * @param {number[][]} squares 11×16
 * @param {number[]} primarySquares
 * @param {{ ignoreSecretQ1?: boolean, ignoreSecretQ2?: boolean }} attrs
 * @param {number} [quest=1]
 */
export function collectScreenSecrets(squares, primarySquares, attrs = {}, quest = 1) {
  if (quest === 1 && attrs.ignoreSecretQ1) return [];
  if (quest === 2 && attrs.ignoreSecretQ2) return [];

  /** @type {{ row: number, col: number, marker: number, action: string, requiresBracelet: boolean }[]} */
  const out = [];
  for (let row = 0; row < squares.length; row += 1) {
    for (let col = 0; col < squares[row].length; col += 1) {
      const marker = secretMarkerForSquare(squares[row][col], primarySquares);
      if (marker == null) continue;
      out.push({
        row,
        col,
        marker,
        action: SECRET_ACTION[marker] ?? 'bomb',
        // $E5 rock needs bracelet; $E8 gravestone does not (UpdateRockOrGravestone).
        requiresBracelet: marker !== 0xe8,
      });
    }
  }
  return out;
}

/**
 * Paint revealed secret tiles into a 22×32 tile grid at square coords.
 * @param {number[][]} tileGrid
 * @param {number} row square row
 * @param {number} col square col
 * @param {number} [marker=0xe7] secret marker (default stairs)
 */
export function revealSecretTiles(tileGrid, row, col, marker = 0xe7) {
  const tr = row * 2;
  const tc = col * 2;
  const [ul, ll, ur, lr] = tilesForSecretMarker(marker);
  if (!tileGrid[tr] || tileGrid[tr][tc] == null) return false;
  tileGrid[tr][tc] = ul;
  tileGrid[tr + 1][tc] = ll;
  tileGrid[tr][tc + 1] = ur;
  tileGrid[tr + 1][tc + 1] = lr;
  return true;
}

/**
 * @param {{ row: number, col: number }} secret
 */
export function secretWorldRect(secret) {
  return {
    x: secret.col * 16,
    y: HUD_HEIGHT + secret.row * 16,
    w: 16,
    h: 16,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {number} [pad=12]
 */
export function pointNearRect(x, y, rect, pad = 12) {
  return (
    x + 8 >= rect.x - pad &&
    x + 8 <= rect.x + rect.w + pad &&
    y + 8 >= rect.y - pad &&
    y + 8 <= rect.y + rect.h + pad
  );
}

/**
 * @param {object[]} secrets
 * @param {Set<string>} revealed keys `${mapIndex}:${row}:${col}`
 * @param {number} mapIndex
 * @param {'bomb' | 'burn' | 'push' | 'recorder'} action
 * @param {number} x world x
 * @param {number} y world y
 * @param {number[][]} tileGrid
 */
export function tryRevealSecrets(secrets, revealed, mapIndex, action, x, y, tileGrid) {
  /** @type {object[]} */
  const opened = [];
  for (const secret of secrets ?? []) {
    if (secretAction(secret) !== action) continue;
    const key = `${mapIndex}:${secret.row}:${secret.col}`;
    if (revealed.has(key)) continue;
    const rect = secretWorldRect(secret);
    if (!pointNearRect(x, y, rect)) continue;
    if (revealSecretTiles(tileGrid, secret.row, secret.col, secret.marker)) {
      revealed.add(key);
      opened.push(secret);
    }
  }
  return opened;
}

/**
 * True when this push secret needs the power bracelet.
 * @param {{ marker?: number, requiresBracelet?: boolean }} secret
 */
function pushNeedsBracelet(secret) {
  if (secret.requiresBracelet != null) return secret.requiresBracelet !== false;
  return secret.marker !== 0xe8;
}

/**
 * While shoving a grave/rock face from below/above, ease Link onto the NES
 * exact-X axis one pixel per frame. The 16×16 metatile looks aligned at
 * x±8, but UpdateRockOrGravestone compares X equal — same gap dungeon push
 * blocks cover with nudgeLinkOntoPushAxis.
 *
 * @param {object[]} secrets
 * @param {Set<string>} revealed
 * @param {number} mapIndex
 * @param {{ x: number, y: number, gridOffset?: number }} link
 * @param {number} facingDir
 * @param {{ bracelet?: number }} [opts]
 * @returns {'left' | 'right' | null}
 */
export function nudgeLinkOntoGraveAxis(
  secrets,
  revealed,
  mapIndex,
  link,
  facingDir,
  opts = {},
) {
  if (!link || !facingDir) return null;
  const vertical = facingDir & (DIR.UP | DIR.DOWN);
  if (!vertical) return null;

  for (const secret of secrets ?? []) {
    if (secretAction(secret) !== 'push') continue;
    if (pushNeedsBracelet(secret) && !(opts.bracelet > 0)) continue;
    const key = `${mapIndex}:${secret.row}:${secret.col}`;
    if (revealed.has(key)) continue;
    const rect = secretWorldRect(secret);
    const linkY = link.y + 3;
    const dx = link.x - rect.x;
    const dy = linkY - rect.y;
    // Pressing into the face, within one walk-column on X and the NES dy window.
    if ((facingDir & DIR.UP) && !(dy >= 0 && dy < 0x11)) continue;
    if ((facingDir & DIR.DOWN) && !(dy <= 0 && dy > -0x11)) continue;
    if (dx === 0) return null;
    if (Math.abs(dx) > 0x10) continue;
    if (dx < 0) {
      link.x += 1;
      link.gridOffset = 0;
      return 'right';
    }
    link.x -= 1;
    link.gridOffset = 0;
    return 'left';
  }
  return null;
}

/**
 * Push grave/rock: exact X align, vertical face+hold $10 (UpdateRockOrGravestone).
 * Rocks (secret marker $E5) need InvBracelet; gravestones ($E8) do not.
 * @param {object[]} secrets
 * @param {Set<string>} revealed
 * @param {number} mapIndex
 * @param {{ x: number, y: number, dir: number }} link
 * @param {number[][]} tileGrid
 * @param {number} facingDir DIR bitmask
 * @param {Map<string, number>} [holdTimers] mutable hold counters keyed by secret
 * @param {{ bracelet?: number }} [opts]
 */
export function tryPushGraveSecret(
  secrets,
  revealed,
  mapIndex,
  link,
  tileGrid,
  facingDir,
  holdTimers = null,
  opts = {},
) {
  /** @type {object[]} */
  const opened = [];
  const vertical = facingDir & (DIR.UP | DIR.DOWN);
  if (!vertical) {
    holdTimers?.clear?.();
    return opened;
  }

  const activeKeys = new Set();
  for (const secret of secrets ?? []) {
    if (secretAction(secret) !== 'push') continue;
    // NES: rock ($62 / $E5) needs bracelet; gravestone ($65 / $E8) does not.
    if (pushNeedsBracelet(secret) && !(opts.bracelet > 0)) continue;
    const key = `${mapIndex}:${secret.row}:${secret.col}`;
    if (revealed.has(key)) continue;
    const rect = secretWorldRect(secret);
    // Exact X align with the grave square.
    if (link.x !== rect.x) continue;
    const linkY = link.y + 3;
    const dy = linkY - rect.y;
    if (Math.abs(dy) >= 0x11) continue;
    // Must face into the grave.
    if ((facingDir & DIR.UP) && dy < 0) continue;
    if ((facingDir & DIR.DOWN) && dy > 0) continue;

    activeKeys.add(key);
    if (holdTimers) {
      const held = (holdTimers.get(key) ?? 0) + 1;
      holdTimers.set(key, held);
      if (held < GRAVE_PUSH_HOLD) continue;
    }

    if (revealSecretTiles(tileGrid, secret.row, secret.col, secret.marker)) {
      revealed.add(key);
      holdTimers?.delete(key);
      opened.push(secret);
    }
  }

  // Decay timers for secrets no longer pushed.
  if (holdTimers) {
    for (const k of [...holdTimers.keys()]) {
      if (!activeKeys.has(k)) holdTimers.delete(k);
    }
  }
  return opened;
}
