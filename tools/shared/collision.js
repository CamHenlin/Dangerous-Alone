/** NES direction bits (Zelda). */
export const DIR = {
  RIGHT: 0x01,
  LEFT: 0x02,
  DOWN: 0x04,
  UP: 0x08,
};

/** Overworld tiles remapped to $26 before the unwalkable compare. */
export const OW_WALKABLE_REMAP = Object.freeze([
  0x8d, 0x91, 0x9c, 0xac, 0xad, 0xcc, 0xd2, 0xd5, 0xdf,
]);

/** Tiles that trigger OW underground entry while standing (HandleWarpOW). */
export const OW_WARP_TILES = Object.freeze([0x24, 0x88, 0x70, 0x71, 0x72, 0x73]);

/** OW: first unwalkable tile after remap (`ObjectRoomBoundsOW`). */
export const OW_FIRST_UNWALKABLE = 0x89;

/**
 * @param {number} tile
 */
export function isOwWarpTile(tile) {
  return OW_WARP_TILES.includes(tile & 0xff);
}

/**
 * NES vertical look-ahead keeps the higher of two column samples. Beside a
 * cave mouth that turns a 16px graphic into an 8px approach window (ornament
 * + $24 → solid). Prefer a warp tile when either column is one.
 * @param {number} tile
 * @param {number} tile2
 */
export function combineVerticalCollidingTiles(tile, tile2) {
  if (isOwWarpTile(tile)) return tile;
  if (isOwWarpTile(tile2)) return tile2;
  return tile2 >= tile ? tile2 : tile;
}

/** UW: first unwalkable tile (`ObjectRoomBoundsUW`) — no OW remap. */
export const UW_FIRST_UNWALKABLE = 0x78;

/**
 * UW object room bounds (`ObjectRoomBoundsUW`).
 * `BoundByRoom` uses these when `DoorwayDir = 0` — skipped inside a doorway
 * so Link can reach the door cavities at X≈`$10` / `$E8`.
 */
export const UW_BOUNDS = Object.freeze({
  left: 0x21,
  right: 0xd0,
  top: 0x5e,
  bottom: 0xbd,
});

/** HUD / status bar height in pixels. */
export const HUD_HEIGHT = 0x40;

/** Link collision hotspot: Y = ObjY + this. */
export const LINK_HOTSPOT_Y = 0x0b;

/**
 * Remap OW special tiles, then test walkability.
 * @param {number} tile
 * @param {number} [firstUnwalkable]
 * @param {readonly number[]} [walkableRemap]
 */
export function normalizeOwTile(
  tile,
  firstUnwalkable = OW_FIRST_UNWALKABLE,
  walkableRemap = OW_WALKABLE_REMAP,
) {
  let t = tile & 0xff;
  if (walkableRemap.includes(t)) {
    t = 0x26;
  }
  return { tile: t, walkable: t < firstUnwalkable };
}

export function isOwTileWalkable(tile, firstUnwalkable = OW_FIRST_UNWALKABLE) {
  return normalizeOwTile(tile, firstUnwalkable).walkable;
}

/**
 * Hotspot offset along movement direction (Link).
 * Up/left: -8; down: +8; right: +16; none: 0.
 * @param {number} dir
 */
export function linkHotspotOffset(dir) {
  return objectHotspotOffset(dir, true);
}

/**
 * GetCollidingTileMoving: Link uses ±8 / $10; other objects use ±$10 / $10.
 * @param {number} dir
 * @param {boolean} [isLink]
 */
export function objectHotspotOffset(dir, isLink = true) {
  const d = dir & 0x0f;
  const upLeft = isLink ? -8 : -16;
  if (d & DIR.UP) return upLeft;
  if (d & DIR.LEFT) return upLeft;
  if (d & DIR.DOWN) return 8;
  if (d & DIR.RIGHT) return 16;
  return 0;
}

/**
 * Sample play-area tile at pixel (x, y). Play origin is top-left of the
 * 256×176 area (below the HUD). Tile grid is 22 rows × 32 cols.
 * @param {number[][]} tileGrid
 * @param {number} x
 * @param {number} yPlay  Y relative to play area (screenY - HUD_HEIGHT)
 */
export function tileAtPlayPixel(tileGrid, x, yPlay) {
  const rows = tileGrid.length;
  const cols = tileGrid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) {
    return 0x26;
  }
  const col = Math.max(0, Math.min(cols - 1, Math.floor(x / 8)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(yPlay / 8)));
  return tileGrid[row][col] & 0xff;
}

/**
 * Get colliding tile for an object moving in `dir` (GetCollidingTileMoving).
 * @param {number[][]} tileGrid
 * @param {number} objX
 * @param {number} objY  absolute screen Y (includes HUD)
 * @param {number} dir
 * @param {{ isLink?: boolean, firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts]
 */
export function getObjectCollidingTile(tileGrid, objX, objY, dir, opts = {}) {
  const isLink = opts.isLink !== false;
  const firstUnwalkable = opts.firstUnwalkable ?? OW_FIRST_UNWALKABLE;
  const walkableRemap = opts.walkableRemap ?? (firstUnwalkable === UW_FIRST_UNWALKABLE ? [] : OW_WALKABLE_REMAP);
  const offset = objectHotspotOffset(dir, isLink);
  let sampleY = objY + LINK_HOTSPOT_Y;
  let sampleX = objX;

  const vertical = Boolean(dir & (DIR.UP | DIR.DOWN));
  const horizontal = Boolean(dir & (DIR.LEFT | DIR.RIGHT));

  if (vertical) {
    if ((dir & DIR.DOWN) === 0 || sampleY < 0xdd) {
      sampleY += offset;
    }
  } else if (horizontal) {
    if ((dir & DIR.RIGHT && sampleX < 0xf0) || (dir & DIR.LEFT && sampleX >= 0x10)) {
      sampleX += offset;
    }
  }

  sampleX &= 0xf8; // snap to 8px column
  const yPlay = sampleY - HUD_HEIGHT;
  let tile = tileAtPlayPixel(tileGrid, sampleX, yPlay);

  // Vertical moves also sample the next column (NES keeps the higher id).
  if (vertical) {
    const tile2 = tileAtPlayPixel(tileGrid, sampleX + 8, yPlay);
    tile = combineVerticalCollidingTiles(tile, tile2);
  }

  return normalizeOwTile(tile, firstUnwalkable, walkableRemap);
}

/**
 * Get colliding tile for Link moving in `dir`.
 * @param {number[][]} tileGrid
 * @param {number} objX
 * @param {number} objY  absolute screen Y (includes HUD)
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts]
 */
export function getLinkCollidingTile(tileGrid, objX, objY, dir, opts = {}) {
  return getObjectCollidingTile(tileGrid, objX, objY, dir, { isLink: true, ...opts });
}

/**
 * Monster / shot tile probe (up/left hotspot −$10).
 * @param {number[][]} tileGrid
 * @param {number} objX
 * @param {number} objY
 * @param {number} dir
 * @param {{ firstUnwalkable?: number, walkableRemap?: readonly number[] }} [opts]
 */
export function getMonsterCollidingTile(tileGrid, objX, objY, dir, opts = {}) {
  return getObjectCollidingTile(tileGrid, objX, objY, dir, { isLink: false, ...opts });
}

/** True when Link/shot directions are opposite on one axis (shield face-check). */
export function dirsAreOpposite(a, b) {
  const x = (a | b) & 0x03;
  const y = (a | b) & 0x0c;
  return x === 0x03 || y === 0x0c;
}

/**
 * OW object room bounds from ObjectRoomBoundsOW (Link position).
 *
 * ROM table top is $4E, but BoundDirectionVertically uses `Y < $4E` after the
 * pixel step — so standing Y=$4D (walk-grid / CheckWarps) is reachable and
 * required for northern-edge cave mouths (exitY=0 → spawn $4D).
 */
export const OW_BOUNDS = Object.freeze({
  left: 0x11,
  right: 0xe0,
  top: 0x4d,
  bottom: 0xcd,
});

/**
 * Clamp Link position inside the overworld room bounds.
 * @param {number} x
 * @param {number} y
 */
export function clampOwLinkPos(x, y) {
  return {
    x: Math.max(OW_BOUNDS.left, Math.min(OW_BOUNDS.right, x)),
    y: Math.max(OW_BOUNDS.top, Math.min(OW_BOUNDS.bottom, y)),
  };
}

/**
 * True if the next pixel in `dir` would leave the OW room bounds.
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 */
export function hitsOwBound(x, y, dir) {
  if (dir & DIR.UP) return y <= OW_BOUNDS.top;
  if (dir & DIR.DOWN) return y >= OW_BOUNDS.bottom;
  if (dir & DIR.LEFT) return x <= OW_BOUNDS.left;
  if (dir & DIR.RIGHT) return x >= OW_BOUNDS.right;
  return false;
}

/**
 * Clamp Link inside UW room bounds (`BoundByRoom` underworld set).
 * @param {number} x
 * @param {number} y
 */
export function clampUwLinkPos(x, y) {
  return {
    x: Math.max(UW_BOUNDS.left, Math.min(UW_BOUNDS.right, x)),
    y: Math.max(UW_BOUNDS.top, Math.min(UW_BOUNDS.bottom, y)),
  };
}

/**
 * True if the next pixel in `dir` would leave the UW room bounds.
 * Mirror of `BoundDirection*`: left/up use `< bound`, right/down use `>= bound`.
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 */
export function hitsUwBound(x, y, dir) {
  if (dir & DIR.UP) return y < UW_BOUNDS.top;
  if (dir & DIR.DOWN) return y >= UW_BOUNDS.bottom;
  if (dir & DIR.LEFT) return x < UW_BOUNDS.left;
  if (dir & DIR.RIGHT) return x >= UW_BOUNDS.right;
  return false;
}
