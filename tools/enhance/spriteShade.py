"""Give a 3-colour NES sprite the colour depth of a SNES one.

The engine change to 16-colour sprites is only worth doing if there is art that
uses the colours, and there is no source for it: EPX copies existing pixels so
it cannot add any, and every generative attempt destroyed features too small for
a diffusion model to see.

What actually separates a SNES sprite from an NES one is mostly not technique,
it is budget: 15 colours plus transparency against 3 plus transparency. Spend
that budget the way a pixel artist does and most of the gap closes without
inventing anything:

  outline   the boundary against transparency, darkened. NES art has no room
            for this; it is the single biggest visual difference.
  shadow    inward from the lower-right boundary of each material
  base      the original colour, untouched, over most of the body
  highlight the upper-left facing edge of each material

Four shades x 3 materials = 12, plus transparency: 13 of the SNES budget of 16.

Every output colour still belongs to exactly one original slot, so the runtime
recolour survives: when the tunic changes with the ring, all four of slot 1's
shades move with it. That is the property the whole design rests on.
"""

import numpy as np

# Multipliers applied to a material's base colour. Deliberately gentle at the
# top: NES colours are already near the top of the display range, and a bright
# highlight clips to white and reads as damage rather than form.
SHADE_GAIN = {"outline": 0.35, "shadow": 0.70, "base": 1.0, "highlight": 1.22}
SHADE_ORDER = ("outline", "shadow", "base", "highlight")


def _neighbours(a):
    up = np.roll(a, 1, 0)
    down = np.roll(a, -1, 0)
    left = np.roll(a, 1, 1)
    right = np.roll(a, -1, 1)
    up[0], down[-1], left[:, 0], right[:, -1] = a[0], a[-1], a[:, 0], a[:, -1]
    return up, down, left, right


def shade_slots(slots, transparent=0):
    """Assign each pixel one of four shade classes within its own material.

    Returns an int array of the same shape holding 0..3 (SHADE_ORDER index).
    Transparent pixels are left at `base` and ignored by the caller.
    """
    up, down, left, right = _neighbours(slots)
    clear = slots == transparent
    out = np.full(slots.shape, SHADE_ORDER.index("base"), np.uint8)

    # Outline: a body pixel touching transparency. This is what makes a sprite
    # read as an object sitting on the world rather than a hole cut in it.
    touches_clear = ((up == transparent) | (down == transparent)
                     | (left == transparent) | (right == transparent))
    out[~clear & touches_clear] = SHADE_ORDER.index("outline")

    # Shadow / highlight from which side the material changes, so each material
    # is shaded within itself rather than against its neighbour.
    diff_up = (slots != up) & ~clear
    diff_left = (slots != left) & ~clear
    diff_down = (slots != down) & ~clear
    diff_right = (slots != right) & ~clear
    lit = diff_up | diff_left           # upper-left faces the light
    shadowed = diff_down | diff_right

    interior = ~clear & (out == SHADE_ORDER.index("base"))
    out[interior & shadowed] = SHADE_ORDER.index("shadow")
    out[interior & lit & ~shadowed] = SHADE_ORDER.index("highlight")
    out[clear] = SHADE_ORDER.index("base")
    return out


def build_palette(base_rgb, transparent=0):
    """16-entry palette: 4 shades for each of 3 materials, plus transparency.

    Returns (palette, group) where `palette[i]` is an RGB triple and `group[i]`
    is the original slot that entry belongs to — the map the runtime recolour
    needs so it can move a material's whole ramp together.
    """
    palette = [(0, 0, 0)]
    group = [transparent]
    for slot in range(1, 4):
        r, g, b = base_rgb[slot]
        for name in SHADE_ORDER:
            k = SHADE_GAIN[name]
            palette.append((min(255, int(r * k)), min(255, int(g * k)),
                            min(255, int(b * k))))
            group.append(slot)
    while len(palette) < 16:
        palette.append((0, 0, 0))
        group.append(transparent)
    return palette, group


def index_image(slots, shades, transparent=0):
    """Pack (slot, shade) into a single 0..15 palette index."""
    idx = np.zeros(slots.shape, np.uint8)
    body = slots != transparent
    idx[body] = 1 + (slots[body].astype(np.int32) - 1) * 4 + shades[body]
    return idx
