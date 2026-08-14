"""Let a model choose the colours, while EPX keeps the shape.

Every generative attempt on sprites failed the same way: the model moved pixels,
and Link's identity is 1-2 pixel features. But recolouring does not need to move
anything. Split the problem and the model only does the part it is good at:

  shape   EPX, exact. Output pixels are input pixels, so the silhouette and
          every feature survive by construction.
  colour  a model decides how many shades a material gets, which pixels are
          outline / shadow / base / highlight, and how dark or bright each is.

The hand-tuned alternative picked those numbers by eye (0.35 / 0.70 / 1.0 /
1.22 multipliers), which is a guess about art direction. Reading them off a
model trained on real art is a better guess.

The result stays recolour-safe because a shade is stored as a *gain* on its
material's base colour, never as an absolute colour. When the ring changes
Link's tunic, the same gains apply to the new green and the ramp moves with it.
That is the property the 16-colour engine change depends on.
"""

import numpy as np

SHADES_PER_SLOT = 4          # outline, shadow, base, highlight — the SNES budget
GAIN_CLAMP = (0.20, 1.45)    # keep a derived gain inside sane display range


def gains_from_model(slots, model_rgb, base_rgb, transparent=0,
                     shades=SHADES_PER_SLOT):
    """Derive, per material, `shades` brightness gains and a per-pixel index.

    `model_rgb` is any richly-shaded render of the same sprite at the same size.
    Only its *luminance* is used, and only relative to other pixels of the same
    material — so the model's own hue drift cannot leak in and break the palette.
    """
    lum = (0.299 * model_rgb[..., 0] + 0.587 * model_rgb[..., 1]
           + 0.114 * model_rgb[..., 2])
    idx = np.zeros(slots.shape, np.uint8)
    gains = {}
    for slot in range(1, 4):
        m = slots == slot
        if not m.any():
            gains[slot] = [1.0] * shades
            continue
        v = lum[m]
        # Quantile bands rather than k-means: with a few dozen pixels per
        # material the clusters are unstable, and bands guarantee every shade
        # is actually used instead of collapsing to one.
        edges = np.quantile(v, np.linspace(0, 1, shades + 1)[1:-1])
        band = np.digitize(v, edges)
        idx[m] = 1 + (slot - 1) * shades + band

        base_lum = max(1e-6, 0.299 * base_rgb[slot][0] + 0.587 * base_rgb[slot][1]
                       + 0.114 * base_rgb[slot][2])
        g = []
        for b in range(shades):
            sel = v[band == b]
            # An empty band keeps the base colour rather than collapsing to black.
            k = float(sel.mean() / base_lum) if sel.size else 1.0
            g.append(float(np.clip(k, *GAIN_CLAMP)))
        # The model has no notion of "this is the outline"; it only knows this
        # band is darkest. Force the ramp to be monotonic so the darkest band is
        # the outline and the lightest the highlight, which is what the shading
        # has to mean for the recolour to stay legible.
        g.sort()
        gains[slot] = g
    return idx, gains


def palette_from_gains(base_rgb, gains, shades=SHADES_PER_SLOT):
    """Build the 16-entry palette and the entry->slot group map."""
    palette = [(0, 0, 0)]
    group = [0]
    for slot in range(1, 4):
        r, g, b = base_rgb[slot]
        for k in gains.get(slot, [1.0] * shades):
            palette.append((min(255, int(r * k)), min(255, int(g * k)),
                            min(255, int(b * k))))
            group.append(slot)
    while len(palette) < 16:
        palette.append((0, 0, 0))
        group.append(0)
    return palette, group
