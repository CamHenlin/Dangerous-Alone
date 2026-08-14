#!/usr/bin/env python3
"""
Regenerate every CHR tile through FLUX, one tile at a time, and rebuild the
sheets from the results.

The original 8x8 pattern bins under `assets/extracted/graphics/` are the
reference and are only ever READ. Everything this produces lands in a separate
directory, so a bad prompt costs a rerun and nothing else.

    python3 tools/enhance/aiTiles.py --count        # how much work, no model load
    python3 tools/enhance/aiTiles.py --sheets overworld_bg
    python3 tools/enhance/aiTiles.py               # everything

Edit PROMPT_TEMPLATE below and rerun. The cache keys on the prompt text, so
changing it regenerates; leaving it alone resumes where you left off.

--------------------------------------------------------------------------
COLOUR: WHAT THE MODEL IS ALLOWED TO USE

Two schemes, chosen per sheet kind by COLOUR_MODE.

"master" — the model may use any colour in the 512-entry master palette. This is
what lets the art be genuinely enhanced rather than a reshaded original: FLUX
picks its own colours and we keep them. Alongside the colour plane we store a
*slot* plane (which of the tile's original 4 NES colours each pixel descends
from), so a runtime recolor can still shift the whole tile by the delta between
the old and new palette row. Detail survives; dungeon levels still differ.

"row" — the older scheme: every pixel must land on its palette row's 4 slots x 8
shades. Cheaper and exactly recolourable, but the model can only shade, never
choose a colour.

Recolors that depend on this: dungeon LevelInfo rows, Link's tunic by ring,
damage flash, the death fade.

--------------------------------------------------------------------------
"""

import argparse
import hashlib
import re
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from tileContext import (  # noqa: E402
    build_context_index,
    self_tiled_context,
    transparent_context,
)
from backends import make_backend  # noqa: E402
from spriteFrames import (  # noqa: E402
    compose_frame,
    extract_parts,
    frame_render_size,
    load_frames,
)

GRAPHICS = ROOT / "assets" / "extracted" / "graphics"
EXTRACTED_DIR_PLAY = ROOT / "assets" / "extracted" / "play"
OUT_DIR = ROOT / "assets" / "extracted" / "graphics_ai"
# Intermediate renders and the reference copies live OUTSIDE assets/extracted.
# That directory is vite's publicDir: anything under it is copied verbatim into
# every production build, and two thousand 768px scratch renders have no
# business being shipped to a browser.
CACHE_ROOT = ROOT / "assets" / "ai-cache"
CACHE_DIR = CACHE_ROOT / "tiles"

# =============================================================================
# EDITABLE CONFIG — change these and rerun.
# =============================================================================

# {colors}      -> the hex list this unit may use
# {description} -> what this unit depicts, from DESCRIPTIONS below
# {src_px}      -> source size in pixels ("8px by 8px" or "16px by 16px")
# {dst_px}      -> target size
PROMPT_TEMPLATE = (
    "This is a tile from a video game that we are working on upscaling. "
    "It was originally {src_px} and we are going to {dst_px}. "
    "{context_note}"
    "This tile depicts: {description}. "
    "We are also allowing additional colors, and you can use ANY color within "
    "this list to add detail and shading: {colors}. "
    "We want to take this original tile and add details to it, to make the game "
    "more immersive. Please update the tile to be more detailed. "
    "Keep the same subject, shape and silhouette as the original. "
    "{transparency_note}"
    "The result must fill the entire frame edge to edge with the same layout as "
    "the input: do not centre the subject, do not shrink it, and do not add any "
    "empty or plain background around it. "
    "Crisp, detailed, pixel art in an SNES style, no blur, no text, no background scenery."
)

# What each unit depicts, keyed by sheet id then by unit base index.
#
# This is the single biggest lever on output quality. Measured directly: a unit
# whose input is a recognisable object (the @76 gravestone) came back with real
# stone texture and a bevelled rim; units that were half an object came back
# essentially unchanged, because there was nothing coherent to detail. Telling
# the model what it is looking at does the same job as showing it a whole
# object, and costs nothing at generation time.
#
# These are read off the rendered squares by eye and are meant to be corrected.
# Anything missing falls back to DEFAULT_DESCRIPTION.
# Fallback description per sheet, used for any unit not listed below. A sprite
# sheet described as terrain produces nonsense, so these matter as much as the
# per-unit entries — most of the 290 units rely on them.
DEFAULT_DESCRIPTION = "a piece of top-down fantasy overworld terrain"

SHEET_DESCRIPTIONS = {
    "overworld_bg": "a piece of top-down fantasy overworld (outdoors) terrain",
    "underworld_bg": "a piece of a top-down stone dungeon (indoors) wall or floor, seen from above",
    "common_background": "a small user-interface symbol or piece of stonework",
    "common_sprites": "a small character sprite from a top-down fantasy game, on a plain background",
    "common_misc": "a small pickup item icon from a fantasy game, on a plain background",
    "overworld_sprites": "a small monster or creature sprite from a top-down fantasy game, on a plain background",
    "underworld_sprites_127": "a small dungeon monster sprite, on a plain background",
    "underworld_sprites_358": "a small dungeon monster sprite, on a plain background",
    "underworld_sprites_469": "a small dungeon monster sprite, on a plain background",
    "underworld_sprites_common": "a small dungeon monster sprite, on a plain background",
    "boss_sprites_1257": "part of a large fantasy boss monster, on a plain background",
    "boss_sprites_3468": "part of a large fantasy boss monster, on a plain background",
    "boss_sprites_9": "part of a large fantasy boss monster, on a plain background",
    "demo_background": "a piece of a fantasy game title screen illustration",
    "demo_sprites": "a decorative sprite from a fantasy game title screen",
}

DESCRIPTIONS = {
    "overworld_bg": {
        0: "vertical stone bars of a barred gate, dark opening behind",
        4: "a stone dungeon entrance with pillars either side",
        8: "a sandy shoreline meeting blue water at a corner",
        12: "a sandy shore with a curved blue water edge",
        16: "a sandy shore with a blue water inlet",
        20: "pale desert sand with small green shrubs scattered across it, seen from above",
        24: "open blue water with ripples, seen from above, filling the whole frame",
        28: "blue water breaking against dark rocks at the shore",
        32: "the boundary between blue water and pale sand",
        36: "a shallow sandy shore with water and green reeds",
        40: "grey rocks sitting on pale sand",
        44: "a single round leafy green bush sitting on sand, seen from above",
        48: "an ornate stone fountain or shrine structure",
        52: "wooden planks of a bridge crossing",
        56: "wooden bridge planking over water",
        60: "flat open desert sand seen from directly above, filling the whole frame",
        64: "a narrow blue stream winding through green grass",
        68: "a rocky cliff face with two dark cave openings",
        72: "a steep green cliff edge dropping to sand",
        76: "a stone gravestone with a cross, standing on grass",
        80: "a carved stone statue on a plinth",
        84: "the top of a dense round leafy bush, filling most of the frame",
        88: "dense green leafy tree canopy seen from directly above, filling the whole frame",
        92: "the tops of several leafy green trees packed together, seen from above, filling the frame",
        96: "green forest canopy seen from directly above, filling the whole frame",
        100: "dense green forest canopy from above, leaves filling the entire frame",
        104: "green treetops from above with dark gaps between them, filling the frame",
        108: "a mossy green rock outcrop",
        112: "the arched stone entrance to a dungeon",
        116: "a stone staircase descending underground",
        120: "a waterfall cascading down dark rock",
        124: "falling water over a dark cliff face",
        128: "the base of a waterfall meeting a pool",
    },
}

# What to send FLUX in one request.
#   "square" — a 16x16 metatile: 4 consecutive CHR tiles as UL/LL/UR/LR, the
#              same grouping `renderUwSquareRgba` uses. This is the game's real
#              visual unit; a whole tree, rock or door arrives in one image.
#   "tile"   — a single 8x8 tile. Almost always a meaningless fragment (a bar,
#              a corner), so FLUX invents detail for an abstract shape rather
#              than for the object it belongs to.
UNIT = "square"

# Draw each unit inside its 3x3 neighbourhood and crop the middle back out, so
# the model draws the joins itself and adjacent squares agree at their seams.
# Set to 1 to send the unit alone (no continuity guarantee).
CONTEXT = 3

# Slot 0 is the transparent hole on a sprite sheet. Rendering it as a colour the
# palette never uses — and saying so in the prompt — stops the model completing
# the figure into the empty space, which would otherwise poison the luminance
# right at the silhouette where it matters most.
TRANSPARENT_RGB = (255, 0, 255)

# Which image model does the work.
#   "sdxl-pixelart" — SDXL with a pixel-art LoRA. Measured 2.4x closer to the
#                     game's palette than FLUX and ~2.3x faster, because it is
#                     the only option here actually trained on pixel art.
#   "flux2-klein"   — FLUX.2-klein via mflux.
BACKEND = "sdxl-pixelart"

# Each backend's strength parameter, in that backend's own units. They are
# inverses of each other, so they are deliberately NOT one shared number.
FLUX_INFLUENCE = 0.55   # mflux: how strongly the input is HELD (1 = untouched)
SDXL_DENOISE = 0.45     # diffusers: how much is DENOISED AWAY (0 = untouched)

MODE = "img2img"       # "edit" (instruction-style) or "img2img", FLUX only
STEPS = 12             # also sets strength granularity: mflux buckets to an integer step
SEED = 7
GEN_PX = 768           # render size; must divide by CONTEXT so the crop is exact
QUANTIZE = 4           # model weight quantization (3/4/5/6/8), None for full

# How much freedom FLUX has over *shape*, as opposed to shading.
#
#   "pinned"  every pixel keeps the original's palette slot, so the slot plane
#             is exactly the 8x8 art doubled. Provably safe, but it means the
#             extra resolution carries shading only and no new geometry — the
#             silhouettes stay 8x8-blocky no matter how good the render is.
#
#   "refine"  FLUX's own slots are used, so it can add real detail at 16x16:
#             a face, a strap, a chipped stone corner. Constrained rather than
#             free — see REFINE_MAX_CHANGE below — because a tile is still not
#             allowed to become a different thing.
# Set per sheet kind, because the two behave differently and it was measured
# rather than guessed:
#
#   background — "refine" is a clear win. Walls, floors and canopies are large
#                structures, and FLUX genuinely adds chipped corners, mortar and
#                leaf shapes that survive the downsample.
#
#   sprites    — "pinned". A character's defining features are 1-2 pixels in the
#                original (Link's eyes, his belt buckle). Rendered at 256px and
#                brought back to 32x32 they do not survive, and refinement loses
#                his face while gaining nothing. Shading-only is better here.
SLOT_MODE = {"background": "pinned", "sprites": "pinned"}

# Generate sprites as whole characters rather than 16x16 at a time, using the
# frame manifest from dumpSpriteFrames.js. A normal enemy frame is one 16x16
# square either way, but a boss is not: Manhandla is 48x48 from five parts and
# Gohma 48x16 from three, and generated separately those parts do not agree.
SPRITE_FRAMES = True

# Where output colours may come from, per sheet kind.
#   "master" — any of the 512 master-palette entries; FLUX's own colours are
#              kept, and a slot plane is written alongside so recolors still work
#   "row"    — constrained to the tile's own palette row (4 slots x 8 shades)
#
# MEASURED: 92% of background tiles are drawn under more than one palette
# context (one common_background tile appears in 12), so "master" bakes in
# whichever row the tile happened to be generated under and the same sand comes
# out orange on one screen and cream on another. Absolute colour is only sound
# for art that appears in exactly one context — 19 of 226 background tiles.
# Backgrounds therefore stay on "row" until the shade is widened (see below).
#
# Sprites stay on "row" for now because their textures are cut from baked PNGs
# and recoloured by exact RGB match at runtime; moving them to "master" needs the
# sprite texture builders to read planes instead. Backgrounds have no such
# coupling: overworld screens are pre-baked, and dungeon rooms already compose
# from planes.
COLOUR_MODE = {"background": "row", "sprites": "row"}

# Let FLUX's own shading through instead of re-deriving it from luminance.
# Only meaningful in "master" colour mode, where the model's colours are kept.
AI_SHADING = True

# What a sprite frame depicts, by key prefix. Same lever as DESCRIPTIONS.
FRAME_DESCRIPTIONS = {
    "link:": "a small hero in a green tunic and cap, seen from above",
    "boss:60": "a large four-headed plant monster with snapping mouths",
    "boss:57": "a large round spiked monster",
    "boss:52": "a large armoured insect with a single eye and legs either side",
    "boss:": "a large fantasy boss monster",
    "obj:": "a small monster from a top-down fantasy game",
}

# Reject a refinement that moves more than this fraction of the tile's pixels to
# a different slot, and fall back to pinned for that tile. Catches the case where
# the model quietly redrew the tile as something else instead of detailing it.
#
# This guard is what makes a freer generation safe. Held tightly the render barely
# departed from the input (median slot change 0.5%), so refinement had nothing to
# work with and new geometry was 1.25% of pixels. Dropping to 0.55 lets the model
# actually add structure; anything that goes too far lands back on the original
# instead of corrupting the map.
REFINE_MAX_CHANGE = 0.35

# Pin each pixel's palette slot to the original and take only shading from FLUX.
# True  = silhouettes and tile edges provably preserved, detail is shading only.
# False = FLUX may reshape the tile; expect seams between background tiles.
PRESERVE_SLOTS = True
# Shading is proportional to the *actual* luminance difference from the rest of
# the slot, in shade steps per luminance unit.
#
# This used to normalise by the region's own standard deviation, which is wrong
# in the one case that matters: a nearly-flat region has a tiny std, so dividing
# by it amplified sensor-level noise to the full range. On a 16x16 sprite, where
# a slot may cover only a few dozen pixels, every tile hit the clamp at both
# ends — a 150-step spread across Link's tunic, which is not shading but grain.
#
# The gain is set so detailed art is unchanged: a typical textured tile has a
# luminance std around 30, and 30 * 1.15 = 34.5 shade steps, which is what the
# old "37 per std-dev" produced there. Flat regions now stay flat instead of
# being stretched to fill the ramp.
SHADE_GAIN = 1.15
SHADE_DEADZONE = 4.0   # luminance differences below this produce no shading
# Radius, in output pixels, of the same-slot reference a sprite pixel is shaded
# against. Roughly a character feature wide at 2x, so a limb can be lit on one
# side while the model's larger disagreements with the original silhouette do
# not become shading. 0 falls back to the slot's global mean.
SPRITE_LOCAL_REF = 4.0
# How many uniform tiles a slot needs before it counts as flat ground — see
# `flat_slots`. One is an incidental solid block; repeats mean a fill colour.
MIN_FLAT_FILL_TILES = 2
# Farthest a pixel may move from its base shade. 1 keeps everything within one
# step, which matters most on large flat fills: FLUX draws real cast shadows
# under trees, and on a four-step cream ramp an unclamped shadow lands on the
# darkest step as a flat grey blob that also fails to line up with the same
# shadow in the neighbouring tile. 2 allows deeper contrast on detailed art.
SHADE_MAX_STEP = 96    # farthest a pixel may move from base (was 3 of 8 steps)
# Radius of the high-pass applied to FLUX's luminance before it becomes shading.
#
# Each tile is rendered independently, so the model's *global* lighting — a
# vignette, a gradient, a shadow it cast across the whole cell — cannot possibly
# agree with the tile drawn next to it. Tiled across a screen those gradients
# show up as lines on every boundary. Subtracting a blurred copy keeps the local
# texture, which is the part we actually want, and discards the low-frequency
# lighting, which is the part that cannot tile. 0 disables.
HIGHPASS_RADIUS = 3.0

# Leave a unit flat if this fraction of it is a single palette slot.
#
# A square that is one solid colour — open sand, dungeon floor — has no
# structure for detail to attach to, so whatever the model draws there is an
# arbitrary mark. That mark then repeats at every one of the hundreds of places
# the tile is placed, and reads as a lattice of dashes across the map rather
# than as texture. Flat is the better failure: it is what the original does, and
# it is invisible instead of wrong. Squares with actual shape are unaffected.
FLAT_SLOT_THRESHOLD = 0.97

# Which palette row to *render the input with*, per sheet.
#
# Sheets are baked with an arbitrary row (BG row 1 for backgrounds), which for
# overworld terrain is orange — so FLUX is handed an orange blob and has no way
# to tell it is meant to be a tree. Rendering with the row the tiles actually
# appear in makes the subject legible, and it is also the row the output is
# quantized back onto, so the two stay consistent.
INPUT_PALETTE_ROW = {
    "overworld_bg": 2,      # black / green / cream / blue — terrain as played
    "underworld_bg": 1,     # dungeon masonry
}

# Sheets to process, in order. Empty list = all sheets in the manifest.
SHEETS: list[str] = []

# =============================================================================

TILE_PX = 16  # enhanced tile edge

# Identifies the backend and its settings in the cache key, so switching models
# or strengths regenerates rather than silently reusing another model's art.
_BACKEND_SIG = (f"sdxl-pixelart|{SDXL_DENOISE}" if BACKEND == "sdxl-pixelart"
                else f"flux2-klein|{MODE}|{STEPS}|{FLUX_INFLUENCE}|{QUANTIZE}")

# The run of "#RRGGBB, #RRGGBB, ..." the prompt lists as the allowed colours.
_COLOR_LIST_RE = re.compile(r"(?:#[0-9A-F]{6}(?:, )?){2,}")


def load_manifest():
    return json.loads((GRAPHICS / "graphics_manifest.json").read_text())


def load_palettes():
    doc = json.loads((GRAPHICS / "palettes.json").read_text())
    return next(p for p in doc["paletteSets"] if p["id"] == "overworld")


SHADES = 256        # shade steps per NES colour; must match masterPalette.js
BASE_SHADE = 128    # the step whose RGB equals the untouched NES colour


def expand_row(row_nes):
    """4 NES colour *indices* -> the 4 x SHADES entries of their ramps.

    Looked up in the palette dumped from masterPalette.js rather than
    recomputed. A hand-mirrored copy of the ramp maths lived here and drifted
    the first time the ramp was retuned; reading the dump makes that impossible.
    """
    pal = master_palette_rgb()
    out = []
    for nes in row_nes:
        base = int(nes) * SHADES
        for shade in range(SHADES):
            out.append(tuple(int(v) for v in pal[base + shade]))
    return out


def decode_tiles(raw: bytes):
    """NES 2bpp -> list of 8x8 slot grids."""
    tiles = []
    for off in range(0, len(raw), 16):
        b = raw[off:off + 16]
        grid = np.zeros((8, 8), dtype=np.uint8)
        for y in range(8):
            lo, hi = b[y], b[y + 8]
            for x in range(8):
                bit = 7 - x
                grid[y, x] = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1)
        tiles.append(grid)
    return tiles


def tile_to_png(grid, palette16, path, size, transparent_slot0=False):
    """Nearest-upscale a slot grid so FLUX sees hard pixel edges, not a blur.

    `size` is either an int (square) or a (width, height) pair, because sprite
    frames are not square — Gohma is 48x16.
    """
    h, w = grid.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    for s in range(4):
        rgb[grid == s] = palette16[s * SHADES + BASE_SHADE]  # base shade of each slot
    if transparent_slot0:
        rgb[grid == 0] = TRANSPARENT_RGB
    wh = size if isinstance(size, tuple) else (size, size)
    Image.fromarray(rgb).resize(wh, Image.NEAREST).save(path)


def crop_centre(img, context):
    """Keep only the middle cell of a context grid the model drew."""
    if context <= 1:
        return img
    w, h = img.size
    cw, ch = w // context, h // context
    return img.crop((cw, ch, cw * 2, ch * 2))


def context_for(grid, sheet_kind, index):
    """The 3x3 neighbourhood to draw this unit inside."""
    if CONTEXT <= 1:
        return grid
    if sheet_kind == "sprites":
        return transparent_context(grid)
    ctx = index.get(grid.tobytes()) if index else None
    # No map context means this art never appears on the overworld — dungeon
    # walls, HUD pieces. Repeating it is the honest default: it is at least a
    # surface that meets itself.
    return ctx if ctx is not None else self_tiled_context(grid)


def quantize_to_palette(img, palette16, out_px=TILE_PX):
    """Nearest of the 16 allowed entries; returns (slot, shade) planes."""
    a = np.asarray(img.convert("RGB").resize((out_px, out_px), Image.BOX), dtype=np.int32)
    pal = np.array(palette16, dtype=np.int32)
    d = ((a[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    idx = d.argmin(-1)
    return (idx // SHADES).astype(np.uint8), (idx % SHADES).astype(np.uint8)


def flat_slots(tiles):
    """Slots the game uses as flat ground, which must never be shaded.

    A slot qualifies if the sheet contains at least one tile made entirely of
    it. That is the signature of a fill colour: the game repeats that tile
    across open ground, so every instance has to stay identical.

    This generalises `flatten_if_uniform`, which only protects a tile that is
    uniform on its own. The visible failure was on *mixed* tiles — a tile that
    is half sand and half rock had its sand shaded to match the rock's shadow,
    and since that tile sits against plain sand tiles the boundary showed up as
    a grid of faintly darker squares across the desert. The colour has to be
    flat everywhere it appears, not just where it appears alone.
    """
    counts = {}
    for t in tiles:
        v = np.unique(t)
        if len(v) == 1:
            counts[int(v[0])] = counts.get(int(v[0]), 0) + 1
    # A real fill colour *repeats* — overworld sand has 7 uniform tiles, the HUD
    # backdrop 49. A slot with exactly one uniform tile is an incidental solid
    # block, and the text sheets have one of those in every colour: taking them
    # at face value marked all four slots flat, so demo_background and
    # common_background came out with zero shading and the title screen was
    # pixel-identical to Classic.
    flat = {0} | {s for s, n in counts.items() if n >= MIN_FLAT_FILL_TILES}
    return flat


def _masked_blur(lum, mask, radius):
    """Blur `lum` using only the pixels in `mask` (normalised convolution).

    An ordinary blur pulls in whatever sits next to the region — for a sprite
    that is the transparent background, which is why a plain high-pass wrecked
    sprite shading. Weighting by the mask and dividing by the blurred mask keeps
    the average strictly inside the material.
    """
    m = mask.astype(np.float32)
    num, den = _blur(lum * m, radius), _blur(m, radius)
    return np.where(den > 1e-3, num / np.maximum(den, 1e-3), lum)


def _blur(a, radius):
    """Separable Gaussian blur on a float array.

    PIL's GaussianBlur rejects float images, and rounding to uint8 first would
    quantise the very differences this is measuring.
    """
    r = max(1.0, float(radius))
    x = np.arange(-int(3 * r), int(3 * r) + 1, dtype=np.float32)
    k = np.exp(-(x ** 2) / (2 * r * r))
    k /= k.sum()
    pad = len(k) // 2
    out = np.pad(a.astype(np.float32), ((0, 0), (pad, pad)), mode="edge")
    out = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, out)
    out = np.pad(out, ((pad, pad), (0, 0)), mode="edge")
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, out)


def shade_from_luminance(img, slot_map, keep_flat=(0,), highpass=HIGHPASS_RADIUS,
                         local_ref=0.0):
    """Take only shading from the model, relative to other pixels of the same slot.

    `keep_flat` lists slots left at the base shade — see `flat_slots`.
    `highpass` is the blur radius subtracted first; 0 keeps the model's own
    lighting, which is what a free-standing sprite wants — see the call site.
    `local_ref` compares each pixel against a blur of its *own slot* at that
    radius instead of that slot's average over the whole image. Measured
    silhouette separation between the model's drawing and the original is only
    ~1.7 std, so on a whole character the two disagree about where things are;
    against a global mean that disagreement becomes a large shade offset, which
    is what made bosses blotchy. A local reference keeps genuine form and drops
    the disagreement. 0 uses the global mean.
    """
    # Not necessarily square: a sprite frame can be 48x16 (Gohma) or 48x48
    # (Manhandla), so take both dimensions from the slot map rather than
    # assuming a tile.
    h, w = slot_map.shape
    a = np.asarray(img.convert("RGB").resize((w, h), Image.BOX), dtype=np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    if highpass > 0:
        blurred = np.asarray(
            Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8))
            .filter(ImageFilter.GaussianBlur(radius=highpass)),
            dtype=np.float32,
        )
        # Re-centre so the residual still has a meaningful mean per slot.
        lum = lum - blurred + float(lum.mean())
    shade = np.full(slot_map.shape, BASE_SHADE, dtype=np.uint8)
    for s in range(4):
        if s in keep_flat:
            continue
        m = slot_map == s
        if not m.any():
            continue
        ref = _masked_blur(lum, m, local_ref)[m] if local_ref > 0 else lum[m].mean()
        vals = lum[m]
        d = vals - ref
        # Deadzone, then proportional. A flat region has small |d| and so stays
        # flat; only real luminance structure becomes shading.
        d = np.sign(d) * np.maximum(np.abs(d) - SHADE_DEADZONE, 0.0)
        off = np.clip(d * SHADE_GAIN, -SHADE_MAX_STEP, SHADE_MAX_STEP)
        shade[m] = np.clip(np.rint(BASE_SHADE + off), 0, SHADES - 1).astype(np.uint8)
    return shade


def flatten_if_uniform(plane, source_tile, colour_mode="row", nes_row=None):
    """Strip shading from a tile whose original art is a single colour.

    Checked per CHR tile rather than per generated square: a square of four
    tiles is rarely uniform, but the *tile* the game repeats across open sand
    often is, and that is the one whose invented detail becomes a lattice.
    """
    counts = np.bincount(source_tile.ravel(), minlength=4)
    if counts.max() >= FLAT_SLOT_THRESHOLD * source_tile.size:
        slot = int(counts.argmax())
        if colour_mode == "master" and nes_row is not None:
            value = int(nes_row[slot]) * SHADES + BASE_SHADE
        else:
            value = int(slot) * SHADES + BASE_SHADE
        return np.full(plane.shape, value, dtype=plane.dtype)
    return plane


def master_colours(img, out_px):
    """Nearest master-palette index for every pixel — the model's own colours.

    No shade derivation, no high-pass, no clamp: whatever FLUX drew is what the
    tile gets, snapped only to the nearest available entry. The 512-entry master
    is a full ramp per NES colour, so "snapped" is a very light constraint.
    """
    a = np.asarray(img.convert("RGB").resize((out_px, out_px), Image.BOX), dtype=np.int32)
    pal = master_palette_rgb()
    d = ((a[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return d.argmin(-1).astype(np.uint16)


_MASTER_CACHE = {}


def master_palette_rgb():
    """The master entries as an array, loaded once from the JS dump.

    Read rather than mirrored: masterPalette.js owns the ramp maths, and a
    second hand-written copy would drift the next time it is retuned.
    """
    if "pal" not in _MASTER_CACHE:
        path = GRAPHICS / "master_palette.json"
        if not path.exists():
            raise SystemExit("missing master_palette.json — run: node tools/enhance/dumpMasterPalette.js")
        doc = json.loads(path.read_text())
        if doc.get("shades") != SHADES:
            raise SystemExit(f"master palette has {doc.get('shades')} shades, aiTiles.py expects {SHADES}")
        _MASTER_CACHE["pal"] = np.array(doc["rgb"], dtype=np.int32)
    return _MASTER_CACHE["pal"]


def slots_by_chroma(img, palette16, out_px):
    """Assign each pixel a palette slot by colour *identity*, not by RGB distance.

    Nearest-RGB matching fails here for a specific reason: a shaded skin tone is
    numerically closer to a dark green than to base skin, so slots scramble
    wherever the model shaded anything. Dividing out luminance first compares
    what colour a pixel *is* rather than how lit it happens to be — the same
    split the palette itself uses, where slot carries hue and shade carries
    light.
    """
    a = np.asarray(img.convert("RGB").resize((out_px, out_px), Image.BOX), dtype=np.float32)
    bases = np.array([palette16[s * SHADES + BASE_SHADE] for s in range(4)], dtype=np.float32)

    def chroma(rgb):
        lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])
        return rgb / np.maximum(lum, 8.0)[..., None]

    d = ((chroma(a)[:, :, None, :] - chroma(bases)[None, None, :, :]) ** 2).sum(-1)
    return d.argmin(-1).astype(np.uint8)


def looks_like_glyph(tile8):
    """Structural test for a text/HUD character cell.

    Mirrors the detector in classify.js: two colours, with the bottom row and
    right column reserved as spacing so glyphs do not touch when written side by
    side. Refinement must never touch these — it added a stroke to the "F" in
    LIFE and turned it into an "E", which no amount of shading quality makes up
    for.
    """
    slots = np.unique(tile8)
    if len(slots) != 2:
        return False
    counts = np.bincount(tile8.ravel(), minlength=4)
    bg = int(counts.argmax())
    if not (tile8[-1, :] == bg).all() or not (tile8[:, -1] == bg).all():
        return False
    figure = float((tile8 != bg).mean())
    return 0.04 < figure < 0.62


def unit_has_glyph(grid):
    """True if any 8x8 tile inside a generated unit is a character cell."""
    h, w = grid.shape
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            if looks_like_glyph(grid[y:y + 8, x:x + 8]):
                return True
    return False


def refine_slots(img, palette16, base_slot, out_px, kind):
    """FLUX's own slot assignment, constrained so a tile cannot become a
    different tile.

    Two guards, for the two things the engine actually depends on:

      * A sprite's silhouette is its transparency mask. Slot 0 stays exactly
        where the original had it and nowhere else, so the outline and the
        hitbox still agree while the interior is free to gain detail.

      * A background tile that changed beyond recognition is rejected outright
        and falls back to the original slots. Walkability comes from the tile
        grid, so a grass tile quietly redrawn as a wall would look solid and
        not be.
    """
    slot = slots_by_chroma(img, palette16, out_px)

    if kind == "sprites":
        outside = base_slot == 0
        slot[outside] = 0
        # Inside the silhouette, anything the model made transparent is pulled
        # back to the original slot rather than punching a hole in the sprite.
        holes = (~outside) & (slot == 0)
        slot[holes] = base_slot[holes]
        return slot

    if float((slot != base_slot).mean()) > REFINE_MAX_CHANGE:
        return base_slot
    return slot


def upscale_slots(grid, factor=2):
    """Nearest-upscale a slot plane. Used when slots are pinned."""
    return np.repeat(np.repeat(grid, factor, axis=0), factor, axis=1)


def square_slots(tiles, base):
    """4 consecutive CHR tiles -> one 16x16 slot grid.

    Order matches `renderUwSquareRgba`: base is upper-left, +1 lower-left,
    +2 upper-right, +3 lower-right. Missing tiles at the end of a sheet read
    as blank so the last partial square still assembles.
    """
    def at(i):
        return tiles[i] if i < len(tiles) else np.zeros((8, 8), dtype=np.uint8)
    out = np.zeros((16, 16), dtype=np.uint8)
    out[0:8, 0:8] = at(base)
    out[8:16, 0:8] = at(base + 1)
    out[0:8, 8:16] = at(base + 2)
    out[8:16, 8:16] = at(base + 3)
    return out


def split_square(plane32):
    """A generated 32x32 square -> the four 16x16 tile planes it is made of."""
    return [
        plane32[0:16, 0:16],
        plane32[16:32, 0:16],
        plane32[0:16, 16:32],
        plane32[16:32, 16:32],
    ]


def cache_key(tile_bytes, prompt):
    h = hashlib.sha256()
    h.update(tile_bytes)
    # The colour list is stripped before hashing. It is worth stating in the
    # prompt, but the model does not obey it — the output is quantized onto the
    # palette afterwards, and with PRESERVE_SLOTS only its luminance is used at
    # all. Keying on it would mean re-rendering every tile for hours whenever
    # the palette depth changes, which cannot alter what FLUX draws.
    h.update(_COLOR_LIST_RE.sub("<colors>", prompt).encode())
    h.update(f"{UNIT}|{SEED}|{GEN_PX}|{CONTEXT}|{_BACKEND_SIG}".encode())
    h.update(repr(sorted(INPUT_PALETTE_ROW.items())).encode())
    return h.hexdigest()[:16]


# SDXL reads its prompt through CLIP, which hard-truncates at 77 tokens — about
# 55 words. The long prompt below is ~1300 words, so under SDXL everything after
# the first sentence was silently discarded: the per-tile description, the
# transparency rule, the tiling rules, all of it. Worse, the fragment that did
# survive describes a *background* ("one continuous piece of the game world,
# seen from above"), which is actively wrong for a sprite.
#
# FLUX encodes with T5 and has a 512-token window, so it reads the long form as
# written. Pick per backend rather than settling for one that suits neither.
CLIP_TOKEN_LIMIT = 77
CLIP_BACKENDS = ("sdxl-pixelart",)


def build_short_prompt(sheet_id, base, kind="background", description=None):
    """A prompt that fits CLIP's window, description first.

    Ordering is the whole point: whatever matters most has to appear before the
    truncation, so the subject leads and the style notes follow.

    The palette is deliberately not listed. Spelling out even four colours costs
    ~25 of the 77 tokens, and it buys nothing — output is quantised to the
    palette afterwards regardless, so the colours are enforced by construction
    rather than by asking.
    """
    fallback = SHEET_DESCRIPTIONS.get(sheet_id, DEFAULT_DESCRIPTION)
    desc = description or DESCRIPTIONS.get(sheet_id, {}).get(base, fallback)
    if kind == "sprites":
        return (f"{desc}. Pixel art game character sprite, crisp flat colours, "
                f"hard edges, plain magenta background left untouched.")
    return (f"{desc}. Top-down pixel art terrain, one continuous scene, "
            f"seamless and tileable, detail right to every edge, crisp flat "
            f"colours, no grid lines or borders.")


def build_prompt(palette16, sheet_id, base, kind="background", description=None):
    if BACKEND in CLIP_BACKENDS:
        return build_short_prompt(sheet_id, base, kind, description)
    # Distinct colours only. This listed every entry of the *expanded* palette —
    # 1024 of them, 530 distinct, opening with a long run of #000000 from slot
    # 0's dark shades — which is noise even for a model that can read it all.
    seen_c, colour_list = set(), []
    for c in palette16:
        t = tuple(c)
        if t not in seen_c:
            seen_c.add(t)
            colour_list.append("#%02X%02X%02X" % t)
    colors = ", ".join(colour_list)
    fallback = SHEET_DESCRIPTIONS.get(sheet_id, DEFAULT_DESCRIPTION)
    desc = description or DESCRIPTIONS.get(sheet_id, {}).get(base, fallback)
    src = 16 if UNIT == "square" else 8

    context_note = ""
    if CONTEXT > 1:
        # Never call this a grid of tiles. Doing so made FLUX draw the grid —
        # borders between the nine cells — and since we crop the centre cell,
        # every square came back with a line down its edge and the map ended up
        # striped. Describe it as one continuous scene instead.
        context_note = (
            "The image is a single continuous piece of the game world, seen from "
            "above. Redraw it as ONE seamless continuous scene at exactly the same "
            "scale and position, with no borders, frames, seams, panels or dividing "
            "lines anywhere in it. Terrain must flow smoothly across the whole image "
            "without any repeating grid pattern. "
            # The centre is cut out and laid next to other tiles, so its four
            # edges have to be drawable neighbours. Saying so is worth more than
            # it sounds: the model otherwise composes each render as a picture
            # with a natural focal point and quiet edges, and quiet edges are
            # exactly what shows up as a seam when tiled.
            "This artwork will be cut into tiles and laid side by side in a grid, "
            "so the pattern MUST continue across every edge of the image: what "
            "touches the left edge must line up with what touches the right edge, "
            "and the same top to bottom. Keep the detail even right up to the "
            "edges — do not fade, darken, blur or vignette towards them, and do "
            "not leave a plain margin. "
        )

    transparency_note = ""
    if kind == "sprites":
        hexcol = "#%02X%02X%02X" % TRANSPARENT_RGB
        transparency_note = (
            f"The areas that are exactly {hexcol} are TRANSPARENT background, not "
            f"part of the artwork. Leave them exactly {hexcol} — do not draw, shade "
            "or extend the subject into them, and do not add a backdrop. The shape "
            "of the transparent area must stay exactly as it is. "
        )

    return PROMPT_TEMPLATE.format(
        colors=colors,
        description=desc,
        src_px=f"{src}px by {src}px",
        dst_px=f"{src * 2}px by {src * 2}px",
        context_note=context_note,
        transparency_note=transparency_note,
    )


def units_for(tiles):
    """Yield (base_index, slot_grid) for each unit this run generates."""
    if UNIT == "square":
        for base in range(0, len(tiles), 4):
            yield base, square_slots(tiles, base)
    else:
        for i, grid in enumerate(tiles):
            yield i, grid


def plan(manifest):
    """Distinct non-blank units to generate, and the total unit count."""
    wanted = SHEETS or [s["id"] for s in manifest["sheets"]]
    jobs, seen, total = [], set(), 0
    for sheet in manifest["sheets"]:
        if sheet["id"] not in wanted:
            continue
        tiles = decode_tiles((GRAPHICS / sheet["bin"]).read_bytes())
        for base, grid in units_for(tiles):
            total += 1
            if not grid.any():
                continue  # nothing drawn here; nothing to detail
            key = (grid.tobytes(),
                   DESCRIPTIONS.get(sheet["id"], {}).get(
                       base, SHEET_DESCRIPTIONS.get(sheet["id"], DEFAULT_DESCRIPTION)))
            if key in seen:
                continue  # identical artwork and description already queued
            seen.add(key)
            jobs.append((sheet["id"], base))
    return jobs, total


def _write_sheet(sheet, grids, planes, bake_palette16, slots_plane=None, colour_mode="row"):
    """Write a sheet's planes and its baked PNG.

    Row mode writes a 16-bit value per pixel (slot * SHADES + shade). Master mode
    writes a 16-bit master-palette index plus a companion slot plane, which is
    what lets a runtime recolor move the pixel without its colour having to be
    one of the row's entries.
    """
    if colour_mode == "master":
        (OUT_DIR / f"{sheet['id']}.colour16").write_bytes(
            planes.astype("<u2").tobytes())
        if slots_plane is not None:
            (OUT_DIR / f"{sheet['id']}.slot").write_bytes(slots_plane.tobytes())
    else:
        (OUT_DIR / f"{sheet['id']}.plane").write_bytes(planes.astype("<u2").tobytes())
    cols = min(16, max(len(grids), 1))
    rows = (len(grids) + cols - 1) // cols
    # RGBA, not RGB: on a sprite sheet slot 0 is the transparent hole, and a
    # sheet written without alpha paints it solid — Link ends up in a black box.
    sheet_img = np.zeros((rows * TILE_PX, cols * TILE_PX, 4), dtype=np.uint8)
    if colour_mode == "master":
        pal = master_palette_rgb().astype(np.uint8)
        alpha = np.full(len(pal), 255, dtype=np.uint8)
    else:
        pal = np.array(bake_palette16, dtype=np.uint8)
        alpha = np.full(4 * SHADES, 255, dtype=np.uint8)
        if sheet["kind"] == "sprites":
            alpha[0:SHADES] = 0
    rgba = np.concatenate([pal, alpha[:, None]], axis=1)
    for i in range(len(grids)):
        y, x = divmod(i, cols)
        sheet_img[y*TILE_PX:(y+1)*TILE_PX, x*TILE_PX:(x+1)*TILE_PX] = rgba[planes[i]]
    Image.fromarray(sheet_img, mode="RGBA").save(OUT_DIR / sheet["sheet"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", action="store_true", help="report the work and exit")
    ap.add_argument("--sheets", nargs="*", help="sheet ids to process")
    ap.add_argument("--limit", type=int, help="stop after N generations (for trying a prompt)")
    ap.add_argument("--only", type=int, nargs="*",
                    help="only generate these unit base indices (for trying a prompt on known art)")
    args = ap.parse_args()

    global SHEETS
    if args.sheets:
        SHEETS = args.sheets

    manifest = load_manifest()
    ow = load_palettes()
    jobs, total = plan(manifest)

    if args.count:
        print(f"tiles total:        {total}")
        print(f"distinct non-blank: {len(jobs)}  <- generations needed")
        # Render cost scales with area, and CONTEXT>1 renders the whole
        # neighbourhood to keep one cell of it.
        secs = 25 * (GEN_PX / 512) ** 2
        print(f"render size:        {GEN_PX}px ({CONTEXT}x{CONTEXT} context)")
        print(f"est. at {secs:.0f}s each:   {len(jobs) * secs / 3600:.1f} h")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Keep a copy of the untouched originals next to the output so the input to
    # any given run is always recoverable, whatever happens to the extract.
    ref = CACHE_ROOT / "reference"
    ref.mkdir(exist_ok=True)
    for sheet in manifest["sheets"]:
        dst = ref / sheet["bin"]
        if not dst.exists():
            shutil.copy2(GRAPHICS / sheet["bin"], dst)

    # Neighbourhoods come from the real map, so a square is drawn in a context
    # it actually appears in. Built once and shared across sheets.
    context_index = {}
    if CONTEXT > 1:
        banks = {}
        for sh in manifest["sheets"]:
            banks[sh["id"]] = {
                "kind": sh["kind"],
                "tiles": decode_tiles((GRAPHICS / sh["bin"]).read_bytes()),
            }
        screens = EXTRACTED_DIR_PLAY / "screens"
        rooms = EXTRACTED_DIR_PLAY / "room_grids.json"
        if screens.exists():
            context_index = build_context_index(screens, banks, rooms if rooms.exists() else None)
            src = "overworld + dungeons" if rooms.exists() else "overworld only"
            print(f"context: {len(context_index)} squares have real neighbours ({src})")
            if not rooms.exists():
                print("  (run: node tools/enhance/dumpRoomGrids.js for dungeon context)")

    # Weights load on first use, not up front. Re-deriving the planes after a
    # change to the palette depth or the shading maths needs no generation at
    # all, and loading gigabytes to then do nothing turns a seconds-long job
    # into a minutes-long one.
    backend = (make_backend(BACKEND, denoise=SDXL_DENOISE)
               if BACKEND == "sdxl-pixelart"
               else make_backend(BACKEND, quantize=QUANTIZE, steps=STEPS,
                                 influence=FLUX_INFLUENCE, mode=MODE))

    wanted = SHEETS or [s["id"] for s in manifest["sheets"]]
    done = 0

    # ---- whole-sprite pass -------------------------------------------------
    # Runs first and fills a (sheet, index) -> plane map. The per-sheet loop
    # below then reads sprite planes from here instead of generating them one
    # square at a time.
    sprite_parts = {}
    frames = load_frames(EXTRACTED_DIR_PLAY / "sprite_frames.json") if SPRITE_FRAMES else []
    if frames:
        all_banks = {
            sh["id"]: {"kind": sh["kind"],
                       "tiles": decode_tiles((GRAPHICS / sh["bin"]).read_bytes())}
            for sh in manifest["sheets"]
        }
        sprite_pal = expand_row(ow["rows"][4])   # sprites bake with SP0
        print(f"sprite frames: {len(frames)} whole characters")
        for n, frame in enumerate(frames):
            if not any(p["sheet"] in wanted for p in frame["parts"]):
                continue
            grid = compose_frame(frame, all_banks)
            if not grid.any():
                continue

            desc = next((v for k, v in FRAME_DESCRIPTIONS.items()
                         if frame["key"].startswith(k)), DEFAULT_DESCRIPTION)
            prompt = build_prompt(sprite_pal, "__frame__", frame["key"],
                                  "sprites", description=desc)

            key = cache_key(grid.tobytes(), prompt)
            cached = CACHE_DIR / f"{key}.png"
            if not cached.exists():
                if args.limit is not None and done >= args.limit:
                    continue
                w, h = frame_render_size(frame)
                src = CACHE_DIR / f"{key}_in.png"
                tile_to_png(grid, sprite_pal, src, (w, h), transparent_slot0=True)
                backend.generate(src, w, h, prompt, SEED).save(cached)
                done += 1
                print(f"  [frame {n + 1}/{len(frames)}] {frame['key']} {frame['width']}x{frame['height']}")

            out = Image.open(cached)
            # Sprites stay pinned: the silhouette is the hitbox, and 1-2px
            # features do not survive a re-render.
            slot = np.repeat(np.repeat(grid, 2, axis=0), 2, axis=1)
            # No high-pass on a sprite. The filter exists so that per-tile
            # lighting cannot disagree across a tiled background, but a sprite
            # is free-standing and never tiles — and its low-frequency lighting
            # (a body rounded by a light from above) is precisely the shading
            # worth keeping. High-passing it threw that away and kept the noise.
            shade = shade_from_luminance(
                out.resize((slot.shape[1], slot.shape[0]), Image.BOX), slot,
                highpass=0, local_ref=SPRITE_LOCAL_REF)
            plane = slot.astype(np.uint16) * SHADES + shade
            for k, v in extract_parts(plane, frame, scale=2).items():
                sprite_parts.setdefault(k, v)
        print(f"sprite tiles from whole characters: {len(sprite_parts)}")
    for sheet in manifest["sheets"]:
        if sheet["id"] not in wanted:
            continue
        raw = (GRAPHICS / sheet["bin"]).read_bytes()
        grids = decode_tiles(raw)
        # Which slots are this sheet's flat ground, measured from the original
        # art rather than assumed — it is slot 2 on the overworld, not slot 0.
        sheet_flat = flat_slots(grids) if sheet["kind"] == "background" else {0}
        # Two different palettes, deliberately:
        #   input_pal — renders what FLUX sees, chosen so the subject is legible
        #   bake_pal  — colours the sheet PNG, and must follow the convention
        #               the runtime remaps from (sprites SP0/row 4, BG row 1)
        # The stored planes are (slot, shade) and therefore palette-independent,
        # so these can differ without the two ever disagreeing.
        default_row = 4 if sheet["kind"] == "sprites" else 1
        row = INPUT_PALETTE_ROW.get(sheet["id"], default_row)
        palette16 = expand_row(ow["rows"][row])
        bake_palette16 = expand_row(ow["rows"][default_row])

        colour_mode = COLOUR_MODE.get(sheet["kind"], "row")
        planes = np.zeros((len(grids), TILE_PX, TILE_PX), dtype=np.uint16)
        # A parallel slot plane travels with the colours so runtime recolors can
        # shift a pixel by its slot's delta without needing its colour to be one
        # of the row's entries.
        slots_plane = np.zeros((len(grids), TILE_PX, TILE_PX), dtype=np.uint8)
        # Anything not generated keeps the original art rather than coming out
        # black: slot 0 at base shade for row mode, the equivalent master entry
        # for master mode.
        for i, g in enumerate(grids):
            up = upscale_slots(g)
            slots_plane[i] = up
            if colour_mode == "master":
                nes = np.array(ow["rows"][row], dtype=np.int64)
                planes[i] = nes[up].astype(np.uint32) * SHADES + BASE_SHADE
            else:
                planes[i] = up.astype(np.uint16) * SHADES + BASE_SHADE

        # Tiles a whole-character frame already produced. Everything else falls
        # through to the per-square path below rather than being skipped: the
        # frame manifest reaches most of a sprite sheet but not all of it (the
        # demo/title sprites are not part of any animation), and a tile no frame
        # covers used to keep the original art untouched.
        covered = set()
        if sheet["kind"] == "sprites" and sprite_parts:
            for i in range(len(grids)):
                got = sprite_parts.get((sheet["id"], i))
                if got is not None:
                    planes[i] = flatten_if_uniform(got, grids[i])
                    covered.add(i)

        for base, grid in units_for(grids):
            if not grid.any():
                continue
            if all(base + n in covered for n in range(4)):
                continue
            if args.only is not None and base not in args.only:
                continue

            prompt = build_prompt(palette16, sheet["id"], base, sheet["kind"])
            render_grid = context_for(grid, sheet["kind"], context_index)
            key = cache_key(render_grid.tobytes(), prompt)
            cached = CACHE_DIR / f"{key}.png"
            if not cached.exists():
                if args.limit is not None and done >= args.limit:
                    continue  # leave the original art in place
                src = CACHE_DIR / f"{key}_in.png"
                tile_to_png(
                    render_grid, palette16, src, GEN_PX,
                    transparent_slot0=(sheet["kind"] == "sprites"),
                )
                # Only the centre cell was ever the subject; the rest was
                # context so the model could draw the joins.
                crop_centre(backend.generate(src, GEN_PX, GEN_PX, prompt, SEED),
                            CONTEXT).save(cached)
                done += 1
                print(f"  [{done}/{len(jobs)}] {sheet['id']} {UNIT} @{base}")

            out = Image.open(cached)
            out_px = grid.shape[0] * 2  # 8->16 for a tile, 16->32 for a square
            base_slot = upscale_slots(grid)
            mode = SLOT_MODE.get(sheet["kind"], "pinned") if isinstance(SLOT_MODE, dict) else SLOT_MODE
            # Text is never refined, whatever the sheet's mode says.
            if unit_has_glyph(grid):
                mode = "pinned"
            if PRESERVE_SLOTS and mode == "pinned":
                slot = base_slot
            else:
                slot = refine_slots(out, palette16, base_slot, out_px, sheet["kind"])
            # Shading always runs through the same path, so the high-pass, the
            # step clamp and the flat-fill rule apply whichever slots we ended up
            # with.
            if colour_mode == "master" and AI_SHADING:
                # The model's own colours, snapped only to the nearest master
                # entry. No shade derivation, no high-pass, no clamp.
                plane = master_colours(out, out_px)
            else:
                is_sprite = sheet["kind"] == "sprites"
                shade = shade_from_luminance(
                    out, slot, keep_flat=sheet_flat,
                    highpass=0 if is_sprite else HIGHPASS_RADIUS,
                    local_ref=SPRITE_LOCAL_REF if is_sprite else 0.0)
                plane = slot.astype(np.uint16) * SHADES + shade

            if UNIT == "square":
                parts = split_square(plane)
                slot_parts = split_square(slot)
                for n, part in enumerate(parts):
                    if base + n >= len(planes) or base + n in covered:
                        # A frame drew this tile as part of a whole character,
                        # which is better context than a lone 16x16 square.
                        continue
                    planes[base + n] = flatten_if_uniform(
                        part, grids[base + n], colour_mode, ow["rows"][row])
                    slots_plane[base + n] = slot_parts[n]
            else:
                planes[base] = flatten_if_uniform(plane, grid, colour_mode, ow["rows"][row])
                slots_plane[base] = slot

        _write_sheet(sheet, grids, planes, bake_palette16, slots_plane, colour_mode)
        print(f"{sheet['id']}: {len(grids)} tiles -> {sheet['sheet']}")

    # Absolute colours are only meaningful relative to the palette row the tile
    # was rendered under for the model. Record it, or a consumer cannot shift
    # the tile into a different row later.
    (OUT_DIR / "ai_manifest.json").write_text(json.dumps({
        "shades": SHADES,
        "sheets": {
            sh["id"]: {
                "colourMode": COLOUR_MODE.get(sh["kind"], "row"),
                "genRow": INPUT_PALETTE_ROW.get(
                    sh["id"], 4 if sh["kind"] == "sprites" else 1),
            }
            for sh in manifest["sheets"]
        },
    }, indent=2))
    (OUT_DIR / "prompt.txt").write_text(prompt)
    print(f"\nwrote {OUT_DIR}")
    print(f"generations this run: {done}")


if __name__ == "__main__":
    main()
