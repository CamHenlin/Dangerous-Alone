"""Nudge overworld screens towards 16-bit, without moving anything.

This is the approach that survived every check. Two halves that each failed
alone:

  ControlNet from noise  drew a lovely map and ignored the collision layout
                         entirely (0.12 std separation vs the original's 8.22)
  img2img alone          preserved everything and changed ~4%, i.e. nothing

Together they work: the real screen is the starting image, so content is kept,
and the tile boundaries go in as ControlNet conditioning, so structure is
pinned. The prompt then only has room to change *style*. Measured across
strengths 0.25-0.85 the walkable/solid separation stays at 100-102% of the
original — there is no knee, because layout is held by the conditioning rather
than by keeping the denoise small.

Every screen is scored the same way, and any screen whose separation falls
meaningfully below the original's is reported rather than silently shipped: a
picture that disagrees with the collision map tells the player they can walk
somewhere they cannot.

  python tools/enhance/nudgeScreens.py --screens 3c,0b,74      # sample
  python tools/enhance/nudgeScreens.py --all                   # all 128
  python tools/enhance/nudgeScreens.py --all --install         # write screens2x
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
from proveScreen import GEN_H, GEN_W, screen_slot_grid  # noqa: E402

SCRATCH = Path(os.environ.get("SCRATCH", "/tmp"))
STRENGTH = 0.85
COND_SCALE = 0.9
STEPS = 30
# Fail a screen if its layout reads less clearly than the original's. Some
# variation is fine — the metric is a ratio of standard deviations, not exact.
MIN_SEPARATION_RATIO = 0.85
PROMPT = ("16-bit SNES action RPG overworld, top-down, {hint}, detailed "
          "shading, clean outlines, crisp pixel art, keep the existing layout "
          "and colours, no text, no characters")

# Zelda gives regions their identity by palette-swapping the same tiles: one
# forest is green, another autumn orange, another grey mountain. With no colour
# in the prompt the model picks whatever suits the shapes, and it consistently
# read orange foliage as brown rock — which keeps the collision reading (both
# are solid) while losing what the area is. The hint is derived from what the
# screen actually draws rather than hand-assigned per screen.
COLOUR_HINTS = (
    #  hue range (deg), what that palette means in this game
    ((10, 45), "autumn orange and brown foliage, orange leafy trees"),
    ((45, 90), "green grass and leafy green trees"),
    ((90, 160), "lush green foliage and trees"),
    ((160, 260), "blue water and rocky shores"),
    ((260, 340), "purple-grey rock and dead trees"),
)
DEFAULT_HINT = "grass, foliage and rocky cliffs"


def colour_hint(orig):
    """Describe the screen's dominant non-ground colour, so the palette holds."""
    a = np.asarray(orig.convert("RGB"), dtype=np.float32) / 255.0
    mx, mn = a.max(-1), a.min(-1)
    chroma = mx - mn
    # Sand covers most of a screen and is not as desaturated as it looks —
    # (252,224,168) has chroma 0.33, so a lower cut let it dominate the median
    # and every screen came back "autumn orange", including the green ones.
    # Foliage and water sit at 0.66-0.83, well clear of it.
    m = chroma > 0.5
    if m.sum() < a.shape[0] * a.shape[1] * 0.02:
        return DEFAULT_HINT
    r, g, b = a[..., 0][m], a[..., 1][m], a[..., 2][m]
    mxm, mnm = mx[m], mn[m]
    c = np.maximum(mxm - mnm, 1e-6)
    h = np.where(mxm == r, ((g - b) / c) % 6,
                 np.where(mxm == g, (b - r) / c + 2, (r - g) / c + 4)) * 60.0
    # Circular median is overkill here; the palettes are far apart in hue.
    hue = float(np.median(h))
    for (lo, hi), hint in COLOUR_HINTS:
        if lo <= hue < hi:
            return hint
    return DEFAULT_HINT

PLAY = ai.EXTRACTED_DIR_PLAY
OW = PLAY.parent / "overworld"


def separation(img, walk):
    rows, cols = walk.shape
    a = np.asarray(img.resize((cols, rows), Image.BOX), dtype=np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    w, s = lum[walk], lum[~walk]
    if w.size == 0 or s.size == 0:
        return float("inf")   # nothing to confuse; not a failure
    return abs(w.mean() - s.mean()) / (np.sqrt((w.var() + s.var()) / 2) + 1e-6)


def load_pipe():
    import torch
    from diffusers import (AutoencoderKL, ControlNetModel,
                           StableDiffusionXLControlNetImg2ImgPipeline)
    controlnet = ControlNetModel.from_pretrained(
        "diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
    pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        controlnet=controlnet, vae=vae, torch_dtype=torch.float16, variant="fp16")
    pipe.to("mps")
    pipe.set_progress_bar_config(disable=True)
    return pipe


def main():
    import torch

    ap = argparse.ArgumentParser()
    ap.add_argument("--screens", help="comma-separated hex ids, e.g. 3c,0b,74")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--install", action="store_true",
                    help="write into overworld/screens2x, which the game loads")
    ap.add_argument("--strength", type=float, default=STRENGTH)
    args = ap.parse_args()

    names = ([p.stem for p in sorted((PLAY / "screens").glob("*.json"))] if args.all
             else (args.screens or "77").split(","))
    walkable = json.load(open(PLAY / "walkable.json"))
    man = json.load(open(ai.GRAPHICS / "graphics_manifest.json"))
    banks = {s["id"]: ai.decode_tiles((ai.GRAPHICS / s["bin"]).read_bytes())
             for s in man["sheets"] if (ai.GRAPHICS / s["bin"]).exists()}

    outdir = OW / "screens2x" if args.install else SCRATCH / "nudged"
    outdir.mkdir(parents=True, exist_ok=True)

    pipe = None
    results, suspect = [], []
    for n, name in enumerate(names):
        screen = json.load(open(PLAY / "screens" / f"{name}.json"))
        mi = screen["mapIndex"]
        walk = np.array(walkable[str(mi)], dtype=bool)
        grid = screen_slot_grid(screen, banks)
        orig = Image.open(OW / "screens" / f"screen_{mi:02x}.png").convert("RGB")

        hint = colour_hint(orig)
        prompt = PROMPT.format(hint=hint)
        key = ai.cache_key(grid.tobytes(),
                           f"nudge|{args.strength}|{COND_SCALE}|{GEN_W}|{hint}")
        cached = ai.CACHE_DIR / f"{key}.png"
        if not cached.exists():
            if pipe is None:
                print("loading ControlNet img2img...")
                pipe = load_pipe()
            cond = boundary_map(grid, GEN_W).resize((GEN_W, GEN_H), Image.NEAREST)
            pipe(prompt=prompt, negative_prompt=NEG,
                 image=orig.resize((GEN_W, GEN_H), Image.NEAREST),
                 control_image=cond, strength=args.strength,
                 num_inference_steps=STEPS, guidance_scale=7.0,
                 controlnet_conditioning_scale=COND_SCALE,
                 generator=torch.Generator("cpu").manual_seed(ai.SEED),
                 ).images[0].save(cached)

        gen = Image.open(cached).convert("RGB")
        base, got = separation(orig, walk), separation(gen, walk)
        ratio = got / base if np.isfinite(base) and base > 0 else 1.0
        results.append((name, base, got, ratio))
        if ratio < MIN_SEPARATION_RATIO:
            suspect.append((name, ratio))
        # The game loads screens at 2x; keep that, not the generation size.
        gen.resize((orig.width * 2, orig.height * 2), Image.LANCZOS).save(
            outdir / f"screen_{mi:02x}.png")
        print(f"[{n + 1}/{len(names)}] {name}: separation {got:5.2f} "
              f"({ratio * 100:5.1f}% of original)  [{hint.split(',')[0]}]")

    r = np.array([x[3] for x in results])
    print(f"\n{len(results)} screens   median layout fidelity {np.median(r) * 100:.1f}%"
          f"   worst {r.min() * 100:.1f}%")
    if suspect:
        print(f"below {MIN_SEPARATION_RATIO * 100:.0f}% — check these by eye:")
        for name, ratio in suspect:
            print(f"   screen {name}: {ratio * 100:.0f}%")
    else:
        print("no screen fell below the layout-fidelity threshold")
    print(f"wrote {len(results)} screens to {outdir}")


if __name__ == "__main__":
    main()
