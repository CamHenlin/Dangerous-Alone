"""Find things the model drew that are not in the game.

The layout-separation score is a good guard against gross failure but a poor
detector here: on a screen that is mostly open sand there are few solid tiles,
so a ratio of standard deviations goes unstable and reports a perfectly good
screen as broken. Regenerating on that signal would degrade good art to satisfy
a statistic.

The real defect is narrow. Where the original tile is a flat fill the model
sometimes invents an object — on screen 06 it added two stumps and a small dark
square in an empty clearing, which in this game reads as a cave entrance.

Texture alone cannot be the signal: the whole point is that sand now has some.
Nor can a *relative* one — the median flat tile scores about 0.28, so dividing
by it makes every faintly textured tile a hundredfold outlier, and the first
version of this flagged 120 tiles on a screen that is perfectly fine.

The absolute contrast does separate them. Measured on flat-in-the-original
tiles, screens that look correct top out around 28 (a flat tile touching trees
picks up a real edge), while screen 06's invented stumps and false cave mouth
reach 100. So the test is an absolute level, calibrated from that gap.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402
from proveScreen import screen_slot_grid  # noqa: E402

PLAY = ai.EXTRACTED_DIR_PLAY
OW = PLAY.parent / "overworld"
# Absolute luminance-std a flat-in-the-original tile must exceed to count as an
# invention. Good screens peak near 28 where flat ground meets trees; the known
# inventions on screen 06 reach 76-100. 45 sits in the gap.
INVENTION_CONTRAST = 45.0
MIN_FLAT_TILES = 8       # below this there is no population to be an outlier in


def tile_contrast(img_arr, r, c, px):
    t = img_arr[r * px:(r + 1) * px, c * px:(c + 1) * px]
    return float(t.std())


def inventions(orig, gen, grid, tile_px=8):
    """Tiles that are flat in the original but carry an outlier blob now."""
    rows, cols = grid.shape[0] // tile_px, grid.shape[1] // tile_px
    a = np.asarray(gen.resize((cols * 16, rows * 16), Image.BOX), dtype=np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

    flat = []
    for r in range(rows):
        for c in range(cols):
            src = grid[r * tile_px:(r + 1) * tile_px, c * tile_px:(c + 1) * tile_px]
            if len(np.unique(src)) == 1:      # a flat fill in the original
                flat.append((r, c, tile_contrast(lum, r, c, 16)))
    if len(flat) < MIN_FLAT_TILES:
        return [], 0.0
    typical = float(np.median([f[2] for f in flat]))
    return [(r, c, v) for r, c, v in flat if v > INVENTION_CONTRAST], typical


def main():
    names = sys.argv[1:] or ["06", "2b", "3a", "29", "77", "3c"]
    walkable = json.load(open(PLAY / "walkable.json"))  # noqa: F841 (kept for parity)
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}
    import os
    nud = Path(os.environ.get("SCRATCH", "/tmp")) / "nudged"

    total = 0
    for name in names:
        screen = json.load(open(PLAY / "screens" / f"{name}.json"))
        mi = screen["mapIndex"]
        p = nud / f"screen_{mi:02x}.png"
        if not p.exists():
            continue
        grid = screen_slot_grid(screen, banks)
        orig = Image.open(OW / "screens" / f"screen_{mi:02x}.png").convert("RGB")
        found, typical = inventions(orig, Image.open(p).convert("RGB"), grid)
        total += len(found)
        worst = max((f[2] for f in found), default=0)
        flag = "  <-- check" if found else ""
        print(f"  {name}: {len(found):2d} invented tile(s)   worst contrast "
              f"{worst:5.1f} (threshold {INVENTION_CONTRAST:.0f}){flag}")
    print(f"\n{total} invented tiles across {len(names)} screens")


if __name__ == "__main__":
    main()
