"""Repair what the model invented, without throwing away what it got right.

Two defects, found by checking 128 generated screens against the game data:

  invented objects  On open ground the model adds rocks, plants and posts that
                    do not exist — 170 tiles over 28 screens. Screen 79 gained a
                    dozen rock formations in a clearing that has four.

  recoloured caves  A cave mouth is a solid black rectangle, and in this game
                    that shape is how the player recognises an enterable cave.
                    On screen 04 it came back dark green.

Regenerating the screen would risk the parts that are good, and lowering the
strength everywhere would flatten 128 screens to fix 28. Both defects are
per-tile and the layout is pinned, so both can be repaired in place:

  * an invented tile is replaced with a clean tile of the same original fill
    from elsewhere on the same screen — the ground texture is uniform, so this
    is seamless and keeps the enhancement
  * a tile that is solid black in the original is forced back to black

Deterministic, no GPU, and it cannot move anything the game depends on.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402
from findInventions import inventions  # noqa: E402
from proveScreen import screen_slot_grid  # noqa: E402

PLAY = ai.EXTRACTED_DIR_PLAY
OW = PLAY.parent / "overworld"
SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
# Slot 0 on an overworld background row is black. A tile that is entirely slot 0
# is a cave mouth or a doorway, never decoration.
BLACK_SLOT = 0


def tile_box(r, c, px):
    return (c * px, r * px, (c + 1) * px, (r + 1) * px)


def repair(orig, gen, grid, tile_px=8):
    """Returns (repaired image, n_inventions_fixed, n_black_tiles_restored)."""
    rows, cols = grid.shape[0] // tile_px, grid.shape[1] // tile_px
    px = gen.width // cols
    out = gen.copy()

    found, _ = inventions(orig, gen, grid)
    bad = {(r, c) for r, c, _ in found}

    # Group clean flat tiles by the fill they represent, so a replacement comes
    # from the same material rather than whatever happens to be nearby.
    clean = {}
    for r in range(rows):
        for c in range(cols):
            src = grid[r * tile_px:(r + 1) * tile_px, c * tile_px:(c + 1) * tile_px]
            u = np.unique(src)
            if len(u) == 1 and (r, c) not in bad:
                clean.setdefault(int(u[0]), []).append((r, c))

    fixed = 0
    for (r, c) in sorted(bad):
        src = grid[r * tile_px:(r + 1) * tile_px, c * tile_px:(c + 1) * tile_px]
        slot = int(np.unique(src)[0])
        donors = clean.get(slot)
        if not donors:
            continue
        # Nearest clean donor of the same fill keeps any lighting gradient.
        dr, dc = min(donors, key=lambda d: (d[0] - r) ** 2 + (d[1] - c) ** 2)
        out.paste(out.crop(tile_box(dr, dc, px)), tile_box(r, c, px)[:2])
        fixed += 1

    # Cave mouths and doorways: solid black in the original, solid black now.
    blacked = 0
    for r in range(rows):
        for c in range(cols):
            src = grid[r * tile_px:(r + 1) * tile_px, c * tile_px:(c + 1) * tile_px]
            u = np.unique(src)
            if len(u) == 1 and int(u[0]) == BLACK_SLOT:
                a = np.asarray(out.crop(tile_box(r, c, px)), dtype=np.float32)
                if a.mean() > 24:      # came back as something other than black
                    out.paste((0, 0, 0), tile_box(r, c, px))
                    blacked += 1
    return out, fixed, blacked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", action="store_true",
                    help="write into overworld/screens2x, which the game loads")
    args = ap.parse_args()

    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}
    src = SCRATCH / "nudged"
    dst = OW / "screens2x" if args.install else SCRATCH / "repaired"
    dst.mkdir(parents=True, exist_ok=True)

    tot_fixed = tot_black = touched = 0
    for f in sorted((PLAY / "screens").glob("*.json")):
        screen = json.load(open(f))
        mi = screen["mapIndex"]
        p = src / f"screen_{mi:02x}.png"
        if not p.exists():
            continue
        grid = screen_slot_grid(screen, banks)
        orig = Image.open(OW / "screens" / f"screen_{mi:02x}.png").convert("RGB")
        gen = Image.open(p).convert("RGB")
        out, fixed, blacked = repair(orig, gen, grid)
        out.save(dst / f"screen_{mi:02x}.png")
        if fixed or blacked:
            touched += 1
            print(f"  screen {f.stem}: {fixed} invented tile(s) replaced, "
                  f"{blacked} black tile(s) restored")
        tot_fixed += fixed
        tot_black += blacked
    print(f"\n{touched} screens repaired: {tot_fixed} invented tiles, "
          f"{tot_black} cave/doorway tiles restored")
    print(f"wrote to {dst}")


if __name__ == "__main__":
    main()
