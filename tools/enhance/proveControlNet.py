"""Proof: generate SNES-style tiles from text, with the NES art as structure only.

img2img is a dead end for this goal, and the reason is structural rather than a
setting: the input is an 8x8 tile blown up ~96x, so its latent is a nearly flat
colour field with no high-frequency content. The model reproduces flat regions
no matter how much denoise it is allowed — measured at denoise 0.95 with the
pixel-art LoRA fully off, the output was still flat NES blocks.

ControlNet inverts the relationship. The image is generated from noise out of
the *text* description, and the original contributes only a structure map that
the generation is forced to follow. That is what "redraw in SNES style, same
shapes" actually requires.

The conditioning image is drawn from exact slot boundaries, not Canny: NES art
has perfect edges by construction, so detecting them approximately would only
add error.

Run:  python tools/enhance/proveControlNet.py
Out:  $SCRATCH/controlnet_proof.png
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aiTiles as ai  # noqa: E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
GEN = 768                     # divides by 3 exactly, so the center crop is clean
COND_SCALES = (0.5, 0.8)      # how strictly the silhouette is enforced
STYLE = ("16-bit SNES action RPG tileset, top-down view, {d}, detailed shading, "
         "soft colour gradients, clean dark outlines, crisp pixel art, no text")
NEG = ("blurry, photo, 3d render, watermark, text, frame, border, isometric, "
       "perspective, character, ui")


def boundary_map(slot_grid, size):
    """White where the original changes palette slot; black elsewhere."""
    g = np.asarray(Image.fromarray(slot_grid.astype(np.uint8)).resize(
        (size, size), Image.NEAREST), dtype=np.int16)
    e = np.zeros(g.shape, bool)
    e[:, 1:] |= g[:, 1:] != g[:, :-1]
    e[1:, :] |= g[1:, :] != g[:-1, :]
    # A one-pixel line is too thin for ControlNet at this scale; thicken it.
    d = e.copy()
    for s in (1, -1):
        d |= np.roll(e, s, 0) | np.roll(e, s, 1)
    return Image.fromarray(np.where(d, 255, 0).astype(np.uint8)).convert("RGB")


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetPipeline)

    ow = next(p for p in json.load(open(ai.GRAPHICS / "palettes.json"))["paletteSets"]
              if p["id"] == "overworld")
    tiles = ai.decode_tiles((ai.GRAPHICS / "overworld_bg.bin").read_bytes())

    # Pick tiles with real structure, and describe them from what they are.
    subjects = []
    for idx, desc in ((96, "a rocky grey cliff wall"),
                      (4, "a leafy green tree canopy"),
                      (108, "flowing blue water with a bank")):
        if idx < len(tiles) and len(np.unique(tiles[idx])) >= 2:
            subjects.append((idx, desc))

    print("loading ControlNet + SDXL (first run downloads ~2.5GB)...")
    controlnet = ControlNetModel.from_pretrained(
        "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
    pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        controlnet=controlnet, vae=vae, torch_dtype=torch.float16, variant="fp16")
    pipe.to("mps")
    pipe.set_progress_bar_config(disable=True)

    cells = []
    for idx, desc in subjects:
        grid = tiles[idx]
        ctx = ai.self_tiled_context(grid)          # 3x3 so edges have neighbours
        p16 = ai.expand_row(ow["rows"][2])
        base = np.zeros((16, 16, 3), np.uint8)
        up = np.repeat(np.repeat(grid, 2, 0), 2, 1)
        for s in range(4):
            base[up == s] = p16[s * ai.SHADES + ai.BASE_SHADE]
        row = [Image.fromarray(base).resize((256, 256), Image.NEAREST)]

        cond = boundary_map(ctx, GEN)
        row.append(ai.crop_center(cond, ai.CONTEXT).resize((256, 256), Image.NEAREST))

        for cs in COND_SCALES:
            key = ai.cache_key(ctx.tobytes(), f"cn|{desc}|{cs}|{GEN}")
            cached = ai.CACHE_DIR / f"{key}.png"
            if not cached.exists():
                out = pipe(
                    prompt=STYLE.format(d=desc), negative_prompt=NEG,
                    image=cond, num_inference_steps=30, guidance_scale=7.0,
                    controlnet_conditioning_scale=cs,
                    height=GEN, width=GEN,
                    generator=torch.Generator("cpu").manual_seed(ai.SEED),
                ).images[0]
                ai.crop_center(out, ai.CONTEXT).save(cached)
                print(f"  {desc} @ conditioning {cs}")
            row.append(Image.open(cached).convert("RGB").resize((256, 256), Image.NEAREST))
        cells.append(row)

    ncol = len(cells[0])
    img = Image.new("RGB", (ncol * 264 + 8, len(cells) * 264 + 8), (24, 24, 30))
    for r, row in enumerate(cells):
        for c, im in enumerate(row):
            img.paste(im, (8 + c * 264, 8 + r * 264))
    img.save(SCRATCH / "controlnet_proof.png")
    print(f"columns: original | structure | " +
          " | ".join(f"controlnet {c}" for c in COND_SCALES))
    print(f"wrote {SCRATCH / 'controlnet_proof.png'}")


if __name__ == "__main__":
    main()
