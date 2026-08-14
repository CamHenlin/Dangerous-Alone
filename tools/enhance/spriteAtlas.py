"""Redraw sprites as assembled characters in one atlas, then decompile.

Every previous sprite attempt fed the model the raw CHR sheet — tiles in ROM
order, where neighbouring 8x8 cells are unrelated fragments of different
characters. The model blends across those boundaries, so pieces that were never
adjacent bleed into each other and the decomposed sprites come back corrupted.
That is the smearing seen on Link's shield emblem and face.

The frame path avoided that by composing whole characters, but generated each
one alone on a 768px canvas — a 16x16 subject with almost nothing around it,
which is the other failure mode.

This does both at once:

  * every frame is composed into a whole character first
  * frames are packed into one atlas with transparent gutters, so the model
    cannot blend between characters
  * one generation covers them all, so lighting and palette stay consistent
  * each frame is cut back out and decompiled into its CHR tiles

Sizing follows what worked for screens: generate at 2x the stored size. Stored
is the engine's 2x, so the atlas generates at 4x NES resolution.
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
from proveControlNet import NEG, boundary_map  # noqa: E402
from spriteFrames import compose_frame, extract_parts, load_frames  # noqa: E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
GUTTER = 8          # NES px of empty space around each character
STORE_SCALE = 2     # what the engine loads
GEN_SCALE = 4       # generate at 2x the stored size, as the screens do
STRENGTH = 0.55
COND_SCALE = 0.9
PROMPT = ("16-bit SNES action RPG sprite sheet, individual characters and "
          "monsters on a plain magenta background, top-down view, detailed "
          "shading, crisp clean dark outlines, sharp pixel art, no text")


# Largest atlas to generate in one pass, in NES pixels. At GEN_SCALE this is
# the actual render size, and MPS runs out of memory well before a single
# atlas of every frame would fit — 121 frames padded to the largest (a 48x48
# boss) is 616x616, i.e. 2464x2464 to render.
MAX_ATLAS_NES = 256


def pack(frames):
    """Group frames into atlases small enough to render, padding by size class.

    Frames are binned by their own dimensions first. Padding every sprite to the
    largest one would put a 16x16 enemy in a 56x56 cell, wasting most of the
    canvas on gutter and pushing the atlas past what the GPU can hold.

    Yields (frames, positions, width, height) per atlas.
    """
    by_size = {}
    for f in frames:
        by_size.setdefault((f["width"], f["height"]), []).append(f)

    for (fw, fh), group in sorted(by_size.items()):
        cell_w, cell_h = fw + GUTTER, fh + GUTTER
        cols = max(1, MAX_ATLAS_NES // cell_w)
        rows_max = max(1, MAX_ATLAS_NES // cell_h)
        per_atlas = cols * rows_max
        for start in range(0, len(group), per_atlas):
            chunk = group[start:start + per_atlas]
            pos = []
            for i, _ in enumerate(chunk):
                r, c = divmod(i, cols)
                pos.append((c * cell_w + GUTTER // 2, r * cell_h + GUTTER // 2))
            used_rows = int(np.ceil(len(chunk) / cols))
            yield chunk, pos, cols * cell_w, used_rows * cell_h


def main():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetImg2ImgPipeline)

    ap = argparse.ArgumentParser()
    ap.add_argument("--strength", type=float, default=STRENGTH)
    args = ap.parse_args()

    ow = next(p for p in json.load(open(ai.GRAPHICS / "palettes.json"))["paletteSets"]
              if p["id"] == "overworld")
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: {"kind": s["kind"],
                       "tiles": ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())}
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}

    frames = [f for f in load_frames(ai.EXTRACTED_DIR_PLAY / "sprite_frames.json")
              if compose_frame(f, banks).any()]
    p16 = ai.expand_row(ow["rows"][4])
    atlases = list(pack(frames))
    print(f"{len(frames)} assembled characters in {len(atlases)} atlas(es)")

    pipe = None
    parts = {}
    previews = []
    for n, (chunk, pos, W, H) in enumerate(atlases):
        # The atlas as slot indices, so the render and the ControlNet edges come
        # from the same source of truth.
        atlas = np.zeros((H, W), np.uint8)
        for f, (x, y) in zip(chunk, pos):
            g = compose_frame(f, banks)
            atlas[y:y + g.shape[0], x:x + g.shape[1]] = g

        GW, GH = W * GEN_SCALE, H * GEN_SCALE
        GW, GH = GW + (-GW % 8), GH + (-GH % 8)
        SW, SH = W * STORE_SCALE, H * STORE_SCALE

        key = ai.cache_key(atlas.tobytes(), f"atlas|{args.strength}|{GW}x{GH}")
        cached = ai.CACHE_DIR / f"{key}.png"
        if not cached.exists():
            if pipe is None:
                controlnet = ControlNetModel.from_pretrained(
                    "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
                vae = AutoencoderKL.from_pretrained(
                    "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
                pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
                    "stabilityai/stable-diffusion-xl-base-1.0", controlnet=controlnet,
                    vae=vae, torch_dtype=torch.float16, variant="fp16")
                pipe.to("mps")
                pipe.set_progress_bar_config(disable=True)
            src = SCRATCH / f"atlas_in_{n}.png"
            ai.tile_to_png(atlas, p16, src, (W, H), transparent_slot0=True)
            base = Image.open(src).convert("RGB").resize((GW, GH), Image.NEAREST)
            cond = boundary_map(atlas, GW).resize((GW, GH), Image.NEAREST)
            print(f"  atlas {n + 1}/{len(atlases)}: {len(chunk)} frames, "
                  f"{GW}x{GH} -> {SW}x{SH}")
            pipe(prompt=PROMPT, negative_prompt=NEG, image=base, control_image=cond,
                 strength=args.strength, num_inference_steps=30, guidance_scale=7.0,
                 controlnet_conditioning_scale=COND_SCALE, height=GH, width=GW,
                 generator=torch.Generator("cpu").manual_seed(ai.SEED),
                 ).images[0].save(cached)

        gen = Image.open(cached).convert("RGB").resize((SW, SH), Image.BOX)
        previews.append((chunk, pos, atlas, gen))

        # Decompile: cut each frame back out, then split into its CHR tiles.
        gen_a = np.asarray(gen, np.uint8)
        for f, (x, y) in zip(chunk, pos):
            sub = gen_a[y * STORE_SCALE:(y + f["height"]) * STORE_SCALE,
                        x * STORE_SCALE:(x + f["width"]) * STORE_SCALE]
            for k, v in extract_parts(sub, f, scale=STORE_SCALE).items():
                parts.setdefault(k, v)

    print(f"decompiled to {len(parts)} CHR tiles")
    return frames, previews, parts, p16


if __name__ == "__main__":
    main()
