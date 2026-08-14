"""Pixel-art upscalers, for sprites that diffusion cannot touch.

Four generative configurations failed on 16x16 sprites — whole-sheet, whole-
character atlas, every ratio, every strength — because Link's identity lives in
1-2 pixel features and a generative model has no setting that preserves them.

That was the wrong tool. A generative model synthesises plausible content; an
upscaler raises resolution while keeping every existing pixel's meaning. The
pixel-art community solved this decades ago, and the algorithms are exact,
instant and need no model.

Implemented here, weakest to strongest:

  EPX / scale2x   the classic. A pixel expands to 2x2; a corner takes a
                  neighbour's colour only when two adjacent neighbours agree
                  and the diagonal does not. Never invents a colour.
  Eagle           same idea, decided from the three pixels around each corner.
                  Rounds more aggressively; can eat single-pixel details.
  XBR-lite        edge-directed: interpolates along a detected edge rather than
                  across it, using colour distance rather than equality, so it
                  smooths anti-aliased art that EPX leaves blocky.

All three keep the palette when the source is paletted (EPX and Eagle exactly;
XBR-lite only where it interpolates). That matters here: sprite colours are
remapped at runtime by slot, so a scaler that invents colours would break the
recolouring the same way absolute-RGB art does.
"""

import numpy as np


def _pad(a):
    return np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")


def epx(img):
    """EPX/scale2x. Exact: output colours are always input colours."""
    h, w = img.shape[:2]
    p = _pad(img)
    c = p[1:-1, 1:-1]
    up, down = p[:-2, 1:-1], p[2:, 1:-1]
    left, right = p[1:-1, :-2], p[1:-1, 2:]

    eq = lambda x, y: np.all(x == y, axis=-1)  # noqa: E731
    out = np.empty((h * 2, w * 2, img.shape[2]), img.dtype)
    # Each corner rounds only when the two neighbours touching it agree and the
    # opposite pair does not — the rule that stops EPX rounding off a diagonal
    # line into a staircase of blobs.
    ul = np.where((eq(left, up) & ~eq(left, down) & ~eq(up, right))[..., None], left, c)
    ur = np.where((eq(up, right) & ~eq(up, left) & ~eq(right, down))[..., None], right, c)
    dl = np.where((eq(down, left) & ~eq(down, right) & ~eq(left, up))[..., None], left, c)
    dr = np.where((eq(right, down) & ~eq(right, up) & ~eq(down, left))[..., None], right, c)
    out[0::2, 0::2], out[0::2, 1::2] = ul, ur
    out[1::2, 0::2], out[1::2, 1::2] = dl, dr
    return out


def eagle(img):
    """Eagle. Rounds a corner when all three pixels around it agree."""
    h, w = img.shape[:2]
    p = _pad(img)
    c = p[1:-1, 1:-1]
    up, down = p[:-2, 1:-1], p[2:, 1:-1]
    left, right = p[1:-1, :-2], p[1:-1, 2:]
    ul_d, ur_d = p[:-2, :-2], p[:-2, 2:]
    dl_d, dr_d = p[2:, :-2], p[2:, 2:]

    eq = lambda x, y: np.all(x == y, axis=-1)  # noqa: E731
    out = np.empty((h * 2, w * 2, img.shape[2]), img.dtype)
    out[0::2, 0::2] = np.where((eq(up, ul_d) & eq(ul_d, left))[..., None], left, c)
    out[0::2, 1::2] = np.where((eq(up, ur_d) & eq(ur_d, right))[..., None], right, c)
    out[1::2, 0::2] = np.where((eq(down, dl_d) & eq(dl_d, left))[..., None], left, c)
    out[1::2, 1::2] = np.where((eq(down, dr_d) & eq(dr_d, right))[..., None], right, c)
    return out


def _dist(a, b):
    """Perceptual-ish colour distance; cheaper than Lab and good enough to tell
    'same material' from 'edge' on a 4-colour sprite."""
    d = a.astype(np.int32) - b.astype(np.int32)
    return (np.abs(d) * np.array([3, 6, 1])).sum(-1)


def xbr_lite(img, threshold=48):
    """Edge-directed 2x. Interpolates along an edge, never across it.

    EPX only rounds when colours are *equal*, so it leaves any anti-aliased or
    shaded edge blocky. Using distance instead lets a near-match round too,
    which is what makes curves read as curves at 2x.
    """
    h, w = img.shape[:2]
    p = _pad(img).astype(np.int32)
    c = p[1:-1, 1:-1]
    up, down = p[:-2, 1:-1], p[2:, 1:-1]
    left, right = p[1:-1, :-2], p[1:-1, 2:]

    out = np.empty((h * 2, w * 2, img.shape[2]), np.int32)
    for dy, dx, n1, n2 in ((0, 0, up, left), (0, 1, up, right),
                           (1, 0, down, left), (1, 1, down, right)):
        # The corner blends towards its two neighbours only when they resemble
        # each other more than they resemble the centre — i.e. an edge runs
        # diagonally through this corner.
        near = _dist(n1, n2) < threshold
        edge = (_dist(n1, c) > threshold) & (_dist(n2, c) > threshold)
        blend = ((n1 + n2 + 2 * c) // 4)
        out[dy::2, dx::2] = np.where((near & edge)[..., None], blend, c)
    return out.astype(img.dtype)


SCALERS = {"epx": epx, "eagle": eagle, "xbr-lite": xbr_lite}
