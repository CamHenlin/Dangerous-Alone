"""
What normally sits around a tile.

Generating a square on its own is why continuity keeps failing: FLUX never sees
where the square's edges have to meet, so two squares that sit side by side in
the world get drawn to disagree at the seam. Feeding it the 3x3 neighbourhood
and cropping the middle back out fixes that at the source — the model draws the
join itself, then we keep only the part we asked for.

Neighbours are read from the real map (the 128 extracted overworld screens)
rather than invented, so the context a square is drawn in is a context it
actually appears in. A square usually appears in many places with different
surroundings; we keep the most frequent one, which is the arrangement the player
sees most often.

Squares that never appear on the map — sprite frames, dungeon-only art — get no
map context and fall back to the caller's choice: repeat themselves (right for
tiling terrain) or sit on transparent space (right for sprites).
"""

import json
from collections import Counter
from pathlib import Path

import numpy as np

# PPU background tile id -> (sheet id, index within that sheet).
# Overworld mirrors OW_BG_SHEET_RANGES in tools/shared/owBgTiles.js; underworld
# mirrors UW_TILE_SOURCES in tools/shared/dungeonRoomRender.js. Same id ranges,
# different middle bank — which is exactly why dungeon rooms need their own
# mapping rather than being read through the overworld one.
OW_BG_RANGES = (
    (0, 111, "common_background"),
    (112, 241, "overworld_bg"),
    (242, 255, "common_misc"),
)

UW_BG_RANGES = (
    (0, 111, "common_background"),
    (112, 241, "underworld_bg"),
    (242, 255, "common_misc"),
)

SQUARE_TILES = 16  # a square is 16x16 slots (2x2 CHR tiles)


def bg_lookup(ppu_tile, ranges=OW_BG_RANGES):
    t = ppu_tile & 0xFF
    for start, end, sheet in ranges:
        if start <= t <= end:
            return sheet, t - start
    return None, 0


def _square_grid(tile_grid, banks, tr, tc, ranges=OW_BG_RANGES):
    """The 16x16 slot grid of the square whose upper-left tile is (tr, tc)."""
    out = np.zeros((SQUARE_TILES, SQUARE_TILES), dtype=np.uint8)
    # UL, LL, UR, LR — the order the renderer composes a square in.
    for dy, dx, oy, ox in ((0, 0, 0, 0), (1, 0, 8, 0), (0, 1, 0, 8), (1, 1, 8, 8)):
        row = tile_grid[tr + dy] if tr + dy < len(tile_grid) else None
        if row is None or tc + dx >= len(row):
            continue
        sheet, index = bg_lookup(row[tc + dx], ranges)
        bank = banks.get(sheet)
        if not bank or index >= len(bank["tiles"]):
            continue
        out[oy:oy + 8, ox:ox + 8] = bank["tiles"][index]
    return out


def _accumulate(counts, grid, banks, ranges):
    """Count every 3x3 square neighbourhood appearing in one tile grid."""
    if grid:
        rows = len(grid) // 2
        cols = len(grid[0]) // 2
        squares = [[_square_grid(grid, banks, r * 2, c * 2, ranges) for c in range(cols)]
                   for r in range(rows)]
        for r in range(rows):
            for c in range(cols):
                centre = squares[r][c]
                if not centre.any():
                    continue  # empty square; nothing to build context for
                block = np.zeros((SQUARE_TILES * 3, SQUARE_TILES * 3), dtype=np.uint8)
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        rr, cc = r + dr, c + dc
                        # Off the edge of a screen or room: repeat the centre
                        # rather than leaving a hole, so the model still sees a
                        # continuous surface to draw across.
                        nb = squares[rr][cc] if 0 <= rr < rows and 0 <= cc < cols else centre
                        y = (dr + 1) * SQUARE_TILES
                        x = (dc + 1) * SQUARE_TILES
                        block[y:y + SQUARE_TILES, x:x + SQUARE_TILES] = nb
                counts.setdefault(centre.tobytes(), Counter())[block.tobytes()] += 1


def build_context_index(screens_dir, banks, room_grids_path=None):
    """
    Map each distinct square to the 3x3 neighbourhood it most often appears in.

    Reads both worlds: overworld screens and, when available, the composed
    dungeon room grids dumped by `dumpRoomGrids.js`. Without the dungeon half,
    every underworld square falls back to being drawn surrounded by copies of
    itself, and the wall and floor joins suffer for it.

    Returns {square_bytes: 48x48 slot grid}, the centre third of which is the
    square itself.
    """
    counts = {}
    for path in sorted(Path(screens_dir).glob("*.json")):
        _accumulate(counts, json.loads(path.read_text()).get("tileGrid"), banks, OW_BG_RANGES)

    if room_grids_path and Path(room_grids_path).exists():
        doc = json.loads(Path(room_grids_path).read_text())
        for room in doc.get("rooms", []):
            _accumulate(counts, room.get("tileGrid"), banks, UW_BG_RANGES)

    index = {}
    for key, seen in counts.items():
        best, _ = seen.most_common(1)[0]
        index[key] = np.frombuffer(best, dtype=np.uint8).reshape(
            SQUARE_TILES * 3, SQUARE_TILES * 3
        )
    return index


def self_tiled_context(grid):
    """Fallback for art with no map context: the square repeated nine times.

    Right for terrain that tiles against itself, and harmless for anything else
    because only the centre is ever kept.
    """
    return np.tile(grid, (3, 3))


def transparent_context(grid):
    """Fallback for sprites: the frame alone, surrounded by empty space.

    Slot 0 is the transparent hole, so a zero border tells the model exactly
    where the sprite ends instead of inviting it to complete the figure.
    """
    n = grid.shape[0]
    out = np.zeros((n * 3, n * 3), dtype=np.uint8)
    out[n:n * 2, n:n * 2] = grid
    return out
