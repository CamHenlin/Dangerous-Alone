"""Nudge a whole sprite sheet, and price what the runtime's recolouring costs.

The screen approach works because a screen is a fixed picture: absolute RGB is
fine when nothing ever recolours it. Sprites are not like that. Link's tunic
changes with the ring, damage flashes, death fades — and all of it works by
swapping the palette a pixel's *slot* points at. Absolute colour breaks it.

So a sprite can keep at most (slot, shade): the original slot, plus a shade
along that colour's own ramp. That is why the last pass barely moved sprites.

This measures the cost directly rather than assuming it. The sheet is nudged as
one image — sheet-level context, ControlNet pinning the silhouettes — and then
shown three ways:

  original        what ships today
  absolute RGB    everything the model produced
  (slot, shade)   what survives the constraint the runtime imposes

The gap between the last two is the price of runtime recolouring, in pixels.

Run:  python tools/enhance/proveSpriteNudge.py [sheet]
Out:  $SCRATCH/sprite_nudge.png
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

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
GEN = 1024
STRENGTH = 0.55        # lower than a screen: a sprite has far less to work with
COND_SCALE = 0.9
PROMPT = ("16-bit SNES action RPG character and monster sprites, top-down, "
          "detailed shading, clean dark outlines, crisp pixel art, "
          "plain magenta background, no text")


def sheet_slot_grid(tiles, cols):
    rows = (len(tiles) + cols - 1) // cols
    out = np.zeros((rows * 8, cols * 8), np.uint8)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        out[r * 8:(r + 1) * 8, c * 8:(c + 1) * 8] = t
    return out, rows


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetImg2ImgPipeline)

    sheet_id = sys.argv[1] if len(sys.argv) > 1 else "common_sprites"
    ow = next(p for p in json.load(open(ai.GRAPHICS / "palettes.json"))["paletteSets"]
              if p["id"] == "overworld")
    tiles = ai.decode_tiles((ai.GRAPHICS / f"{sheet_id}.bin").read_bytes())
    cols = 16
    grid, rows = sheet_slot_grid(tiles, cols)
    p16 = ai.expand_row(ow["rows"][4])       # sprites bake with SP0

    # Render the sheet as the model will see it, transparent areas keyed.
    src_png = SCRATCH / f"{sheet_id}_in.png"
    ai.tile_to_png(grid, p16, src_png, (cols * 8, rows * 8), transparent_slot0=True)
    base = Image.open(src_png).convert("RGB").resize((GEN, GEN), Image.NEAREST)
    cond = boundary_map(grid, GEN)

    key = ai.cache_key(grid.tobytes(), f"spritesheet|{sheet_id}|{STRENGTH}|{GEN}")
    cached = ai.CACHE_DIR / f"{key}.png"
    if not cached.exists():
        print("loading ControlNet img2img...")
        controlnet = ControlNetModel.from_pretrained(
            "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
        pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            controlnet=controlnet, vae=vae, torch_dtype=torch.float16, variant="fp16")
        pipe.to("mps")
        pipe.set_progress_bar_config(disable=True)
        print(f"nudging {sheet_id} ({len(tiles)} tiles as one sheet)...")
        pipe(prompt=PROMPT, negative_prompt=NEG, image=base, control_image=cond,
             strength=STRENGTH, num_inference_steps=30, guidance_scale=7.0,
             controlnet_conditioning_scale=COND_SCALE,
             generator=torch.Generator("cpu").manual_seed(ai.SEED),
             ).images[0].save(cached)

    gen = Image.open(cached).convert("RGB").resize((cols * 16, rows * 16), Image.BOX)
    slot_up = np.repeat(np.repeat(grid, 2, 0), 2, 1)

    # (slot, shade): keep the model's luminance, but only along each slot's ramp.
    shade = ai.shade_from_luminance(gen, slot_up, highpass=0,
                                    local_ref=ai.SPRITE_LOCAL_REF)
    collapsed = np.zeros((*slot_up.shape, 3), np.uint8)
    for s in range(4):
        m = slot_up == s
        for sh in np.unique(shade[m]) if m.any() else []:
            collapsed[m & (shade == sh)] = p16[s * ai.SHADES + int(sh)]

    a_abs = np.asarray(gen, np.float32)
    a_col = collapsed.astype(np.float32)
    orig = np.zeros((*slot_up.shape, 3), np.uint8)
    for s in range(4):
        orig[slot_up == s] = p16[s * ai.SHADES + ai.BASE_SHADE]
    a_org = orig.astype(np.float32)
    body = slot_up != 0
    d_abs = float(np.abs(a_abs - a_org)[body].sum(-1).mean() / 765 * 100)
    d_col = float(np.abs(a_col - a_org)[body].sum(-1).mean() / 765 * 100)
    print(f"change vs original, on sprite pixels:")
    print(f"   absolute RGB   {d_abs:5.1f}%   (everything the model drew)")
    print(f"   (slot, shade)  {d_col:5.1f}%   (what the runtime allows)")
    print(f"   kept: {d_col / max(d_abs, 1e-6) * 100:.0f}% of the change")

    Z = 4
    W = cols * 16 * Z
    out = Image.new("RGB", (W, rows * 16 * Z * 3 + 16), (32, 32, 38))
    for i, im in enumerate((Image.fromarray(orig), gen, Image.fromarray(collapsed))):
        out.paste(im.resize((W, rows * 16 * Z), Image.NEAREST), (0, i * (rows * 16 * Z + 8)))
    out.save(SCRATCH / "sprite_nudge.png")
    print("rows: original | absolute RGB | (slot, shade)")
    print(f"wrote {SCRATCH / 'sprite_nudge.png'}")


if __name__ == "__main__":
    main()
