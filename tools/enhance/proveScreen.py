"""Generate one whole overworld screen in SNES style, and check it is honest.

Cutting tiles out of a generated scene cannot work: the model does not align its
content to the tile grid, so an extracted tile is an arbitrary fragment, and the
same CHR tile lands on different content everywhere it appears. Whole screens
sidestep that — the overworld is 128 fixed screens and the build already writes
one PNG each, so nothing has to be reusable.

The risk is different, and worse if ignored: the picture has to agree with the
collision map. A path drawn where the game has a cliff is not a cosmetic bug,
it tells the player they can walk somewhere they cannot. So this measures how
separable walkable and solid tiles are in the generated image — if the model
respected the layout, the two should look clearly different.

Run:  python tools/enhance/proveScreen.py [screen_hex]
Out:  $SCRATCH/screen_proof.png
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402
from proveControlNet import NEG, boundary_map  # noqa: E402
from tileContext import OW_BG_RANGES, bg_lookup  # noqa: E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
# 16x11 tiles at 64px each. Keeps the screen's exact 16:11 aspect and lands
# every tile boundary on a whole pixel, so the collision check is meaningful.
GEN_W, GEN_H = 1024, 704
COND_SCALE = 0.9        # high: layout fidelity matters more than invention here
PROMPT = ("16-bit SNES action RPG overworld map, top-down view, grass, dirt "
          "paths, rocky cliffs, leafy tree canopies, water, detailed shading, "
          "clean outlines, crisp pixel art, no text, no characters")


def screen_slot_grid(screen, banks):
    rows = len(screen["tileGrid"])
    cols = len(screen["tileGrid"][0])
    out = np.zeros((rows * 8, cols * 8), np.uint8)
    for r in range(rows):
        for c in range(cols):
            sheet, idx = bg_lookup(screen["tileGrid"][r][c], OW_BG_RANGES)
            bank = banks.get(sheet)
            if bank is None or idx >= len(bank):
                continue
            out[r * 8:(r + 1) * 8, c * 8:(c + 1) * 8] = bank[idx]
    return out


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetPipeline)

    want = sys.argv[1] if len(sys.argv) > 1 else "77"
    path = ai.EXTRACTED_DIR_PLAY / "screens" / f"screen_{want}.json"
    if not path.exists():
        path = sorted((ai.EXTRACTED_DIR_PLAY / "screens").glob("*.json"))[0x77]
    screen = json.load(open(path))
    walk = json.load(open(ai.EXTRACTED_DIR_PLAY / "walkable.json"))[str(screen["mapIndex"])]
    walk = np.array(walk, dtype=bool)

    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}
    grid = screen_slot_grid(screen, banks)
    rows, cols = walk.shape
    print(f"screen {screen['mapIndex']:#04x}: {cols}x{rows} tiles, "
          f"{walk.sum()} walkable / {walk.size} tiles")

    cond = boundary_map(grid, GEN_W)   # square first, then fit to the screen
    cond = cond.resize((GEN_W, GEN_H), Image.NEAREST)

    key = ai.cache_key(grid.tobytes(), f"screen|{COND_SCALE}|{GEN_W}x{GEN_H}")
    cached = ai.CACHE_DIR / f"{key}.png"
    if not cached.exists():
        controlnet = ControlNetModel.from_pretrained(
            "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
        pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            controlnet=controlnet, vae=vae, torch_dtype=torch.float16, variant="fp16")
        pipe.to("mps")
        pipe.set_progress_bar_config(disable=True)
        print("generating...")
        pipe(prompt=PROMPT, negative_prompt=NEG, image=cond,
             num_inference_steps=30, guidance_scale=7.0,
             controlnet_conditioning_scale=COND_SCALE,
             height=GEN_H, width=GEN_W,
             generator=torch.Generator("cpu").manual_seed(ai.SEED),
             ).images[0].save(cached)
    gen = Image.open(cached).convert("RGB")

    # Does the picture agree with the collision map? Compare per-tile mean colour
    # of walkable vs solid tiles; if the layout was respected they separate.
    a = np.asarray(gen.resize((cols, rows), Image.BOX), dtype=np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    w, s = lum[walk], lum[~walk]
    pooled = np.sqrt((w.var() + s.var()) / 2) + 1e-6
    sep = abs(w.mean() - s.mean()) / pooled
    print(f"walkable vs solid separation: {sep:.2f} std "
          f"(>1.0 = clearly different; ~0 = the picture ignores the layout)")

    # Same measure on the original, as the benchmark to beat.
    orig = Image.open(ai.EXTRACTED_DIR_PLAY.parent / "overworld" / "screens" /
                      f"screen_{screen['mapIndex']:02x}.png").convert("RGB")
    b = np.asarray(orig.resize((cols, rows), Image.BOX), dtype=np.float32)
    ol = 0.299 * b[..., 0] + 0.587 * b[..., 1] + 0.114 * b[..., 2]
    ow_, os_ = ol[walk], ol[~walk]
    osep = abs(ow_.mean() - os_.mean()) / (np.sqrt((ow_.var() + os_.var()) / 2) + 1e-6)
    print(f"the original NES screen scores:  {osep:.2f} std")

    # Mark solid tiles so the disagreement is visible, not just numeric.
    marked = gen.copy().resize((cols * 32, rows * 32), Image.LANCZOS)
    m = np.asarray(marked).copy()
    for r in range(rows):
        for c in range(cols):
            if not walk[r, c]:
                m[r * 32:r * 32 + 2, c * 32:(c + 1) * 32] = (255, 0, 0)
                m[r * 32:(r + 1) * 32, c * 32:c * 32 + 2] = (255, 0, 0)
    W = cols * 32
    out = Image.new("RGB", (W, rows * 32 * 3 + 16), (24, 24, 30))
    out.paste(orig.resize((W, rows * 32), Image.NEAREST), (0, 0))
    out.paste(gen.resize((W, rows * 32), Image.LANCZOS), (0, rows * 32 + 8))
    out.paste(Image.fromarray(m), (0, rows * 32 * 2 + 16))
    out.save(SCRATCH / "screen_proof.png")
    print("rows: original NES | generated SNES | generated + solid tiles outlined red")
    print(f"wrote {SCRATCH / 'screen_proof.png'}")


if __name__ == "__main__":
    main()
