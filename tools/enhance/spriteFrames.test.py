"""
Round-trip check for whole-sprite composition and extraction.

A part drawn H-flipped must be stored un-flipped, because the sheet holds tiles
the way the ROM holds them and the renderer re-applies the flip at draw time.
Get that backwards and the composite still looks right while every mirrored
sprite is wrong in the game — exactly the kind of bug that survives eyeballing.

So: compose a frame, pretend the model returned it unchanged, extract, and
require every tile to come back identical to the source tile it came from.
"""

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from spriteFrames import compose_frame, extract_parts  # noqa: E402

spec = importlib.util.spec_from_file_location("ai", HERE / "aiTiles.py")
ai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai)

FRAMES = ROOT / "assets" / "extracted" / "play" / "sprite_frames.json"


def main():
    if not FRAMES.exists():
        print("SKIP: run tools/enhance/dumpSpriteFrames.js first")
        return 0

    manifest = ai.load_manifest()
    banks = {
        sh["id"]: {"kind": sh["kind"],
                   "tiles": ai.decode_tiles((ai.GRAPHICS / sh["bin"]).read_bytes())}
        for sh in manifest["sheets"]
    }
    frames = json.loads(FRAMES.read_text())["frames"]

    checked = mismatched = 0
    flipped_seen = 0
    for frame in frames:
        grid = compose_frame(frame, banks)
        if not grid.any():
            continue
        # Identity "generation": upscale the composite exactly as the real path
        # does, so any error here is composition or extraction, not the model.
        plane = np.repeat(np.repeat(grid, 2, axis=0), 2, axis=1)
        for (sheet, index), got in extract_parts(plane, frame, scale=2).items():
            src = banks[sheet]["tiles"][index]
            want = np.repeat(np.repeat(src, 2, axis=0), 2, axis=1)
            checked += 1
            if not np.array_equal(got, want):
                mismatched += 1
                if mismatched <= 3:
                    print(f"  MISMATCH {sheet}#{index} in {frame['key']}")
        flipped_seen += sum(1 for p in frame["parts"] if p.get("flipH") or p.get("flipV"))

    print(f"tiles round-tripped: {checked}")
    print(f"flipped parts exercised: {flipped_seen}")
    print(f"mismatches: {mismatched}")
    if mismatched:
        print("FAIL")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
