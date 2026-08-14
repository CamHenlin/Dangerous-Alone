"""Does giving each tile less image area force detail to the right scale?

At CONTEXT=3 in a 768px canvas each tile owns 256x256. Asked for a stone wall,
the model draws ~40 bricks, because that is the natural detail scale for a
256px picture — and downscaling 16:1 to a 16x16 tile turns it to mush. The
detail is at the wrong spatial frequency, not merely too fine.

SDXL cannot generate at 48x48 (it degrades below ~512px), so the canvas cannot
shrink. The same ratio comes from putting more tiles in it: at CONTEXT=16 a tile
owns 48x48 and the model has to say "stone wall" in 48 pixels, which is the
scale a 16x16 tile can actually hold.

Neighbourhoods are taken from real screens, so the surrounding tiles are what
the game actually places there.

Run:  python tools/enhance/proveTileScale.py
Out:  $SCRATCH/tile_scale_proof.png
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402
from proveControlNet import NEG, STYLE, boundary_map  # noqa: E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
GEN = 768
CONTEXTS = (3, 8, 16)      # tiles across the canvas -> 256, 96, 48 px per tile
COND_SCALE = 0.8
TARGET = 16                # what a tile is stored as, so judge detail at 16x16


def neighbourhood(grids, tile_at, cy, cx, k):
    """k x k slot grid centred on (cy, cx), clamped at the screen edges."""
    half = k // 2
    out = np.zeros((k * 8, k * 8), np.uint8)
    for dy in range(-half, -half + k):
        for dx in range(-half, -half + k):
            g = tile_at(cy + dy, cx + dx)
            if g is None:
                continue
            y, x = (dy + half) * 8, (dx + half) * 8
            out[y:y + 8, x:x + 8] = g
    return out


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetPipeline)
    from tileContext import OW_BG_RANGES, bg_lookup

    screen = json.load(open(sorted((ai.EXTRACTED_DIR_PLAY / "screens").glob("*.json"))[16]))
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}

    def tile_at(r, c):
        g = screen["tileGrid"]
        if r < 0 or c < 0 or r >= len(g) or c >= len(g[0]):
            return None
        sheet, idx = bg_lookup(g[r][c], OW_BG_RANGES)
        bank = banks.get(sheet)
        return bank[idx] if bank is not None and idx < len(bank) else None

    # Find a cell with real structure to judge.
    cy = cx = None
    for r in range(2, len(screen["tileGrid"]) - 2):
        for c in range(2, len(screen["tileGrid"][0]) - 2):
            g = tile_at(r, c)
            if g is not None and len(np.unique(g)) >= 3:
                cy, cx = r, c
                break
        if cy is not None:
            break
    print(f"centre tile at row {cy} col {cx}")

    controlnet = ControlNetModel.from_pretrained(
        "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
    pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        controlnet=controlnet, vae=vae, torch_dtype=torch.float16, variant="fp16")
    pipe.to("mps")
    pipe.set_progress_bar_config(disable=True)

    desc = "a grassy overworld path with rocks"
    cells = []
    for k in CONTEXTS:
        ctx = neighbourhood(None, tile_at, cy, cx, k)
        cond = boundary_map(ctx, GEN)
        key = ai.cache_key(ctx.tobytes(), f"scale|{desc}|{k}|{COND_SCALE}")
        cached = ai.CACHE_DIR / f"{key}.png"
        if not cached.exists():
            out = pipe(
                prompt=STYLE.format(d=desc), negative_prompt=NEG, image=cond,
                num_inference_steps=30, guidance_scale=7.0,
                controlnet_conditioning_scale=COND_SCALE,
                height=GEN, width=GEN,
                generator=torch.Generator("cpu").manual_seed(ai.SEED),
            ).images[0]
            out.save(cached)
            print(f"  context {k}x{k}: {GEN // k}px per tile")
        full = Image.open(cached).convert("RGB")
        per = GEN // k
        half = k // 2
        box = (half * per, half * per, (half + 1) * per, (half + 1) * per)
        centre = full.crop(box)
        cells.append((k, per, full.resize((256, 256), Image.LANCZOS),
                      centre.resize((256, 256), Image.NEAREST),
                      centre.resize((TARGET, TARGET), Image.BOX).resize(
                          (256, 256), Image.NEAREST)))

    img = Image.new("RGB", (3 * 264 + 8, len(cells) * 264 + 8), (24, 24, 30))
    for r, (k, per, full, centre, at16) in enumerate(cells):
        for c, im in enumerate((full, centre, at16)):
            img.paste(im, (8 + c * 264, 8 + r * 264))
    img.save(SCRATCH / "tile_scale_proof.png")
    print("rows: " + ", ".join(f"context {k} ({p}px/tile)" for k, p, *_ in cells))
    print("columns: whole render | centre tile | centre tile AT 16x16")
    print(f"wrote {SCRATCH / 'tile_scale_proof.png'}")


if __name__ == "__main__":
    main()
