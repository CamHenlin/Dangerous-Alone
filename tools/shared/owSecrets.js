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

/** Grave CHR after a push (the square that slides off the warp). */
export const GRAVE_PUSH_TILES = Object.freeze([0xbc, 0xbd, 0xbe, 0xbf]);

/** Bracelet-rock CHR after a push. */
export const ROCK_PUSH_TILES = Object.freeze([0xc8, 0xc9, 0xca, 0xcb]);

/**
 * ChangeTileObjTiles($26) at the shove origin while the sprite slides —
 * OW sand / gray floor, not stairs.
 */
export const OW_FLOOR_TILES = Object.freeze([0x26, 0x26, 0x26, 0x26]);

/**
 * LevelInfoOW ShortcutOrItemPosArray (PRG $19329). Packed: X high nibble,
 * Y/16 low. UpdateRockOrGravestone writes $70 here, not under the rock.
 */
export const OW_SHORTCUT_POS_PACKED = Object.freeze([0x57, 0x49, 0x99, 0x69]);

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
  const tiles = tilesForSecretMarker(marker);
  return writePlaySquareTiles(tileGrid, row, col, tiles);
}

/**
 * @param {number[][]} tileGrid
 * @param {number} row
 * @param {number} col
 * @param {readonly number[]} tiles UL, LL, UR, LR
 */
export function writePlaySquareTiles(tileGrid, row, col, tiles) {
  const tr = row * 2;
  const tc = col * 2;
  const [ul, ll, ur, lr] = tiles;
  if (!tileGrid[tr] || tileGrid[tr][tc] == null || !tileGrid[tr + 1]) return false;
  tileGrid[tr][tc] = ul;
  tileGrid[tr + 1][tc] = ll;
  tileGrid[tr][tc + 1] = ur;
  tileGrid[tr + 1][tc + 1] = lr;
  return true;
}

/**
 * Square the grave/rock slides onto (one 16px step in the shove dir).
 * @param {{ row: number, col: number }} secret
 * @param {number} facingDir
 * @returns {{ row: number, col: number } | null}
 */
export function gravePushDestSquare(secret, facingDir) {
  let row = secret.row;
  let col = secret.col;
  if (facingDir & DIR.UP) row -= 1;
  else if (facingDir & DIR.DOWN) row += 1;
  else if (facingDir & DIR.LEFT) col -= 1;
  else if (facingDir & DIR.RIGHT) col += 1;
  else return null;
  if (row < 0 || col < 0 || row > 10 || col > 15) return null;
  return { row, col };
}

/**
 * CHR for the pushed grave/rock at dest (so collision matches the sprite).
 * @param {number} [marker]
 */
export function tilesForPushedBlock(marker) {
  if (marker === 0xe5) return ROCK_PUSH_TILES;
  return GRAVE_PUSH_TILES;
}

/**
 * Room shortcut / item XY from LevelBlockAttrsF bits 5–4.
 * @param {number} [stairPositionIndex]
 */
export function owShortcutStairsPos(stairPositionIndex) {
  const packed = OW_SHORTCUT_POS_PACKED[(stairPositionIndex ?? 0) & 3];
  const x = packed & 0xf0;
  const y = (packed & 0x0f) << 4;
  return {
    x,
    y,
    col: x >> 4,
    row: (y - HUD_HEIGHT) >> 4,
  };
}

/**
 * Persist key for the dest square a grave/rock slides onto.
 * @param {number} mapIndex
 * @param {{ row: number, col: number }} dest
 * @param {number} [marker]
 */
export function pushDestKey(mapIndex, dest, marker = 0xe8) {
  return `${mapIndex}:${dest.row}:${dest.col}:pushdest:${marker & 0xff}`;
}

/**
 * @param {string} key
 * @returns {{ mapIndex: number, row: number, col: number, marker: number } | null}
 */
export function parsePushDestKey(key) {
  const m = /^(\d+):(\d+):(\d+):pushdest:(\d+)$/.exec(String(key ?? ''));
  if (!m) return null;
  return {
    mapIndex: Number(m[1]),
    row: Number(m[2]),
    col: Number(m[3]),
    marker: Number(m[4]),
  };
}

/**
 * NES UpdateRockOrGravestone: origin → $26, dest → rock/grave CHR, stairs
 * at GetShortcutOrItemXYForRoom (may equal origin, e.g. the magic-sword grave).
 * @param {number[][]} tileGrid
 * @param {{ row: number, col: number, marker?: number }} secret
 * @param {number} facingDir
 * @param {{ stairPositionIndex?: number, stairs?: { row: number, col: number } }} [opts]
 */
export function applyGravePushTiles(tileGrid, secret, facingDir, opts = {}) {
  const dest = gravePushDestSquare(secret, facingDir);
  const destTiles = [...tilesForPushedBlock(secret.marker)];
  const originOk = writePlaySquareTiles(tileGrid, secret.row, secret.col, OW_FLOOR_TILES);
  let destWritten = false;
  if (originOk && dest) {
    destWritten = writePlaySquareTiles(tileGrid, dest.row, dest.col, destTiles);
  }
  const stairs =
    opts.stairs
    ?? (opts.stairPositionIndex != null
      ? owShortcutStairsPos(opts.stairPositionIndex)
      : { row: secret.row, col: secret.col });
  const stairsOk = writePlaySquareTiles(
    tileGrid,
    stairs.row,
    stairs.col,
    SECRET_STAIRS_TILES,
  );
  return {
    opened: originOk && stairsOk,
    dest: destWritten ? dest : null,
    destTiles: destWritten ? destTiles : null,
    stairs,
  };
}

/**
 * Re-apply dest block tiles after a screen reload.
 * @param {number[][]} tileGrid
 * @param {number} mapIndex
 * @param {Set<string>} revealed
 */
export function restorePushDests(tileGrid, mapIndex, revealed) {
  /** @type {{ col: number, row: number, tiles: readonly number[] }[]} */
  const patches = [];
  for (const key of revealed ?? []) {
    const dest = parsePushDestKey(key);
    if (!dest || dest.mapIndex !== (mapIndex & 0xff)) continue;
    const tiles = tilesForPushedBlock(dest.marker);
    if (writePlaySquareTiles(tileGrid, dest.row, dest.col, tiles)) {
      patches.push({ col: dest.col, row: dest.row, tiles });
    }
  }
  return patches;
}

/**
 * Origin sand for a revealed push secret (reload). Stairs go on after dest.
 * @param {number[][]} tileGrid
 * @param {{ row: number, col: number }} secret
 */
export function restorePushedOriginFloor(tileGrid, secret) {
  if (!writePlaySquareTiles(tileGrid, secret.row, secret.col, OW_FLOOR_TILES)) return null;
  return { col: secret.col, row: secret.row, tiles: OW_FLOOR_TILES };
}

/**
 * Shortcut-table stairs for a revealed push secret (reload).
 * @param {number[][]} tileGrid
 * @param {{ stairPositionIndex?: number }} [attrs]
 */
export function restorePushedStairs(tileGrid, attrs = {}) {
  const stairs = owShortcutStairsPos(attrs.stairPositionIndex);
  if (!writePlaySquareTiles(tileGrid, stairs.row, stairs.col, SECRET_STAIRS_TILES)) {
    return null;
  }
  return { col: stairs.col, row: stairs.row, tiles: SECRET_STAIRS_TILES };
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

    const applied = applyGravePushTiles(tileGrid, secret, facingDir, {
      stairPositionIndex: opts.stairPositionIndex,
      stairs: opts.stairs,
    });
    if (!applied.opened) continue;
    revealed.add(key);
    if (applied.dest) {
      revealed.add(pushDestKey(mapIndex, applied.dest, secret.marker ?? 0xe8));
    }
    holdTimers?.delete(key);
    opened.push({
      ...secret,
      dest: applied.dest,
      destTiles: applied.destTiles,
      stairs: applied.stairs,
    });
  }

  // Decay timers for secrets no longer pushed.
  if (holdTimers) {
    for (const k of [...holdTimers.keys()]) {
      if (!activeKeys.has(k)) holdTimers.delete(k);
    }
  }
  return opened;
}
