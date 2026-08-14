"""Nudge a whole screen towards SNES, instead of redrawing it.

The two failures so far were at opposite extremes. Plain img2img on a single
tile changed ~4% because its input — one 8x8 tile blown up ~96x — is a flat
colour field with nothing to work from. Plain ControlNet txt2img drew a lovely
map from noise and ignored the collision layout entirely (0.12 std separation
against the original's 8.22).

This combines them: start from the real screen (so content is preserved),
enforce the tile boundaries through ControlNet (so structure holds), and let the
prompt pull the style toward 16-bit. Low denoise is the point — we want detail
added, not the map reinvented.

The screen is a better subject than a tile for exactly the reason the tile
failed: at 1024x704 the input already has structure at the scale the model
works, so a small denoise has something to act on.

Every variant is scored the same way: how well walkable and solid tiles separate
visually. The original NES screen sets the bar.

Run:  python tools/enhance/proveNudge.py [screen_hex]
Out:  $SCRATCH/nudge_proof.png
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
from proveScreen import GEN_H, GEN_W, screen_slot_grid  # noqa: E402
from tileContext import OW_BG_RANGES, bg_lookup  # noqa: F401,E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
STRENGTHS = (0.55, 0.70, 0.85)
COND_SCALE = 0.9
PROMPT = ("16-bit SNES action RPG overworld, top-down, detailed shading, "
          "textured grass and foliage, clean outlines, crisp pixel art, "
          "keep the existing layout, no text, no characters")


def separation(img, walk):
    """How distinguishable walkable ground is from solid, visually."""
    rows, cols = walk.shape
    a = np.asarray(img.resize((cols, rows), Image.BOX), dtype=np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    w, s = lum[walk], lum[~walk]
    return abs(w.mean() - s.mean()) / (np.sqrt((w.var() + s.var()) / 2) + 1e-6)


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetImg2ImgPipeline)

    want = sys.argv[1] if len(sys.argv) > 1 else "77"
    spath = ai.EXTRACTED_DIR_PLAY / "screens" / f"{want}.json"
    screen = json.load(open(spath))
    walk = np.array(json.load(open(ai.EXTRACTED_DIR_PLAY / "walkable.json"))[
        str(screen["mapIndex"])], dtype=bool)
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}
    grid = screen_slot_grid(screen, banks)

    orig = Image.open(ai.EXTRACTED_DIR_PLAY.parent / "overworld" / "screens" /
                      f"screen_{screen['mapIndex']:02x}.png").convert("RGB")
    init = orig.resize((GEN_W, GEN_H), Image.NEAREST)
    cond = boundary_map(grid, GEN_W).resize((GEN_W, GEN_H), Image.NEAREST)

    base = separation(orig, walk)
    print(f"original NES screen separation: {base:.2f} std  (the bar)")

    pipe = None
    rows = [("original", orig, base)]
    for st in STRENGTHS:
        key = ai.cache_key(grid.tobytes(), f"nudge|{st}|{COND_SCALE}|{GEN_W}")
        cached = ai.CACHE_DIR / f"{key}.png"
        if not cached.exists():
            if pipe is None:
                print("loading ControlNet img2img...")
                controlnet = ControlNetModel.from_pretrained(
                    "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
                vae = AutoencoderKL.from_pretrained(
                    "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
                pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
                    "stabilityai/stable-diffusion-xl-base-1.0",
                    controlnet=controlnet, vae=vae,
                    torch_dtype=torch.float16, variant="fp16")
                pipe.to("mps")
                pipe.set_progress_bar_config(disable=True)
            pipe(prompt=PROMPT, negative_prompt=NEG,
                 image=init, control_image=cond, strength=st,
                 num_inference_steps=30, guidance_scale=7.0,
                 controlnet_conditioning_scale=COND_SCALE,
                 generator=torch.Generator("cpu").manual_seed(ai.SEED),
                 ).images[0].save(cached)
            print(f"  strength {st}")
        img = Image.open(cached).convert("RGB")
        sep = separation(img, walk)
        chg = float(np.abs(
            np.asarray(img.resize(orig.size), np.int16)
            - np.asarray(orig, np.int16)).sum(-1).mean())
        print(f"strength {st}: separation {sep:5.2f} std "
              f"({sep / base * 100:5.1f}% of original)   changed {chg / 765 * 100:4.1f}%")
        rows.append((f"strength {st}", img, sep))

    W = 960
    h = int(W * orig.height / orig.width)
    out = Image.new("RGB", (W, len(rows) * (h + 8)), (24, 24, 30))
    for i, (_, im, _) in enumerate(rows):
        out.paste(im.resize((W, h), Image.LANCZOS if i else Image.NEAREST), (0, i * (h + 8)))
    out.save(SCRATCH / "nudge_proof.png")
    print("rows: " + " | ".join(r[0] for r in rows))
    print(f"wrote {SCRATCH / 'nudge_proof.png'}")


if __name__ == "__main__":
    main()
