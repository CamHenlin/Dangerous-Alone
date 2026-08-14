"""
Compose a whole sprite, and cut it back into CHR tiles afterwards.

Sprites were generated one 16x16 square at a time. For a normal enemy that is a
complete frame, but Manhandla is 48x48 built from five parts and Gohma is 48x16
built from three — generated separately, they came back as pieces that do not
agree with each other. The frame manifest from `dumpSpriteFrames.js` says which
CHR tiles make up each frame and where they sit, so the whole character can go
to the model in one image.

Extraction has to undo whatever the layout did. A part drawn H-flipped is stored
un-flipped, because the sheet holds the tile the way the ROM holds it and the
renderer re-applies the flip at draw time. Getting that backwards would look
correct in the composite and wrong in the game.
"""

import json
from pathlib import Path

import numpy as np

TILE = 8  # CHR tile edge, in NES pixels


def load_frames(path):
    p = Path(path)
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("frames", [])


def compose_frame(frame, banks):
    """Build a frame's slot grid at NES resolution from its parts."""
    grid = np.zeros((frame["height"], frame["width"]), dtype=np.uint8)
    for part in frame["parts"]:
        bank = banks.get(part["sheet"])
        if not bank or part["index"] >= len(bank["tiles"]):
            continue
        t = bank["tiles"][part["index"]]
        if part.get("flipH"):
            t = t[:, ::-1]
        if part.get("flipV"):
            t = t[::-1, :]
        y, x = part["y"], part["x"]
        grid[y:y + TILE, x:x + TILE] = t
    return grid


def extract_parts(plane, frame, scale=2):
    """Cut a generated frame back into per-tile planes.

    `plane` is the frame at `scale` x NES resolution — either a 2D (slot, shade)
    plane or an RGB image, so only the spatial dimensions are checked. Returns
    {(sheet, index): tile_plane}, each `TILE * scale` square and stored in the
    sheet's own orientation.
    """
    out = {}
    step = TILE * scale
    for part in frame["parts"]:
        y = part["y"] * scale
        x = part["x"] * scale
        sub = plane[y:y + step, x:x + step]
        if sub.shape[:2] != (step, step):
            continue
        # Undo the layout's flips: the sheet stores the unflipped tile.
        if part.get("flipH"):
            sub = sub[:, ::-1]
        if part.get("flipV"):
            sub = sub[::-1, :]
        key = (part["sheet"], part["index"])
        # First writer wins. Frames are ordered most-complete first, so a tile
        # is taken from the richest context it appears in.
        out.setdefault(key, np.ascontiguousarray(sub))
    return out


def frame_render_size(frame, target_max=512):
    """Pixel size to render a frame at, keeping its aspect and a whole-number
    scale so every NES pixel maps to an exact block."""
    longest = max(frame["width"], frame["height"])
    factor = max(1, target_max // longest)
    return frame["width"] * factor, frame["height"] * factor
