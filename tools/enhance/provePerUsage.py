"""Proof: bake one enhanced tile per (tile, palette-row) usage.

The pipeline so far stores every tile as (slot, shade). That representation
exists for exactly one reason: a CHR tile is drawn under several palette rows,
so the stored art has to survive being recoloured. The cost of that guarantee is
total — slot pinned means the silhouette can never change, and shade only slides
a pixel along its own colour's ramp, so the output is the original picture with
some pixels slightly lighter. Measured across the overworld: 0.6% mean per-pixel
difference.

The overworld draws 114 distinct tiles under 262 (tile, row) combinations — 2.3x.
Bake a variant per combination and the constraint is gone for 2.3x the tile data:
each variant is plain RGB and the model may use any colour it likes.

What replaces slot pinning is a *structural* constraint rather than a palette
one: the enhanced tile's luminance edges must line up with the original's. That
keeps the silhouette readable — the thing pinning was really protecting — while
allowing new colour and new interior detail, which pinning forbade.

Run:  python tools/enhance/provePerUsage.py
Out:  scratchpad/per_usage_proof.png
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402
from backends import make_backend  # noqa: E402

OUT = Path(os.environ.get("SCRATCH", "/tmp")) / "per_usage_proof.png"
N_TILES = 10
EDGE_TOLERANCE = 0.35   # max fraction of original edge pixels that may move


def edge_map(a):
    """Where luminance changes sharply — the structure a player actually reads."""
    g = a.astype(np.float32)
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1, :]))
    e = gx + gy
    return e > (e.mean() + e.std())


def structure_kept(orig_lum, new_lum):
    """Fraction of the original's edges that survive in the new tile."""
    a, b = edge_map(orig_lum), edge_map(new_lum)
    if not a.any():
        return 1.0
    # Allow an edge to shift by a pixel: dilate the new edge map before matching.
    d = b.copy()
    for sh in (1, -1):
        d |= np.roll(b, sh, 0) | np.roll(b, sh, 1)
    return float((a & d).sum() / a.sum())


def main():
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    pal = json.load(open(ai.GRAPHICS / "palettes.json"))
    ow = next(p for p in pal["paletteSets"] if p["id"] == "overworld")
    usage = json.load(open(ai.EXTRACTED_DIR_PLAY / "tile_palette_rows.json"))["byTile"]

    sheet = next(s for s in man["sheets"] if s["id"] == "overworld_bg")
    tiles = ai.decode_tiles((ai.GRAPHICS / sheet["bin"]).read_bytes())

    # Tiles that actually vary by row, and that have some structure to enhance.
    picks = []
    for key, rows in usage.items():
        if not key.startswith("overworldBg#") or len(rows) < 2:
            continue
        idx = int(key.split("#")[1])
        if idx >= len(tiles) or len(np.unique(tiles[idx])) < 3:
            continue
        picks.append((idx, rows))
    picks.sort(key=lambda p: -len(p[1]))
    picks = picks[:N_TILES]
    print(f"{len(picks)} tiles x their real rows = "
          f"{sum(len(r) for _, r in picks)} variants")

    backend = make_backend(ai.BACKEND, denoise=ai.SDXL_DENOISE, steps=ai.STEPS)
    cells, labels = [], []
    kept_scores = []

    for idx, rows in picks:
        grid = tiles[idx]
        row_cells = []
        for row in rows:
            palette16 = ai.expand_row(ow["rows"][row])
            ctx = ai.self_tiled_context(grid)
            desc = ai.DESCRIPTIONS.get("overworld_bg", {}).get(
                idx, ai.SHEET_DESCRIPTIONS.get("overworld_bg", ai.DEFAULT_DESCRIPTION))
            prompt = ai.build_prompt(palette16, "overworld_bg", idx,
                                     "background", description=desc)
            key = ai.cache_key(ctx.tobytes() + bytes([row]), prompt + "|perusage")
            cached = ai.CACHE_DIR / f"{key}.png"
            if not cached.exists():
                src = ai.CACHE_DIR / f"{key}_in.png"
                ai.tile_to_png(ctx, palette16, src, ai.GEN_PX)
                ai.crop_centre(
                    backend.generate(src, ai.GEN_PX, ai.GEN_PX, prompt, ai.SEED),
                    ai.CONTEXT).save(cached)
                print(f"  generated tile {idx} row {row}")

            # Absolute colour: whatever the model drew, at 16x16. No slots.
            out = Image.open(cached).convert("RGB").resize((16, 16), Image.BOX)
            new = np.asarray(out, dtype=np.uint8)

            base = np.zeros((16, 16, 3), np.uint8)
            up = np.repeat(np.repeat(grid, 2, 0), 2, 1)
            for s in range(4):
                base[up == s] = palette16[s * ai.SHADES + ai.BASE_SHADE]

            lum = lambda a: (0.299 * a[..., 0] + 0.587 * a[..., 1]  # noqa: E731
                             + 0.114 * a[..., 2])
            kept = structure_kept(lum(base), lum(new))
            kept_scores.append(kept)
            row_cells.append((base, new, row, kept))
        cells.append((idx, row_cells))

    Z = 6
    ncol = max(len(c) for _, c in cells)
    W = ncol * (16 * Z * 2 + 8)
    H = len(cells) * (16 * Z + 14)
    img = Image.new("RGB", (W, H), (24, 24, 30))
    for r, (idx, row_cells) in enumerate(cells):
        for c, (base, new, row, kept) in enumerate(row_cells):
            x = c * (16 * Z * 2 + 8)
            y = r * (16 * Z + 14)
            img.paste(Image.fromarray(base).resize((16 * Z, 16 * Z), Image.NEAREST), (x, y))
            img.paste(Image.fromarray(new).resize((16 * Z, 16 * Z), Image.NEAREST),
                      (x + 16 * Z, y))
    img.save(OUT)

    ks = np.array(kept_scores)
    print(f"structure kept: median {np.median(ks) * 100:.0f}%  worst {ks.min() * 100:.0f}%")
    print(f"variants below tolerance ({(1 - EDGE_TOLERANCE) * 100:.0f}%): "
          f"{int((ks < 1 - EDGE_TOLERANCE).sum())}/{len(ks)}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
