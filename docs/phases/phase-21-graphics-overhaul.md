# Phase 21 — Graphics Overhaul

**Status:** Shelved — the original art ships.
**Outcome:** Two complete enhancement pipelines were built, measured, and
rejected on looks. Classic mode is the default; both enhanced sets remain one
option (and one rebuild) away.

## Checklist

- [x] Move the game to a 256-colour palette.
- [x] Add detail to every background tile, keeping the spirit of each one.
- [x] Do the same for every sprite.
- [x] Leave no piece of graphics untouched.
- [x] Keep the original art selectable.
- [ ] **Produce enhanced art anyone actually prefers to the original.**

## Outcome

The plumbing all works. The art did not land.

Two pipelines were built end to end and both shipped into the running game
before being judged:

1. **Procedural** (`tools/enhance/`) — scale2x plus geometric shading, material
   texture and ordered dithering. Rejected: *"where we wanted to add details, we
   really just added graininess."* Rendering the same screen with dither and
   noise disabled produced an image nearly identical to the untouched original,
   which proved the grain **was** the enhancement.

2. **FLUX.2-klein-4B** (`tools/enhance/aiTiles.py`) — every 16×16 square
   regenerated locally through mflux, then folded back into the palette.
   Cleaner than the procedural set, with genuine lit volume on tree canopies and
   no grain anywhere. Still judged not good enough to displace the original.

Classic is now the default art set. Nothing here was deleted: `npm run enhance`
or `npm run enhance:ai` rebuilds either set, and Options → Graphics → Enhanced
loads it.

## Why neither set got further

Both pipelines ran into the same wall from different directions.

Collision in this engine comes from the tile grid, not the picture. A model free
enough to genuinely reimagine the art is also free to move a forest edge or
erase a cave mouth, and then the player walks through drawn trees. Measured
across the whole session, on overworld screen $77:

| Method | Slots identical to original | Look |
|---|---|---|
| Relight (slots pinned, shading from FLUX) | 100.00% | clean, modest |
| FLUX img2img 0.70 | 91.30% | modest |
| FLUX img2img 0.62 | — | good trees, cave erased |
| FLUX img2img 0.25 | destroyed | genuinely beautiful, unusable |
| FLUX ControlNet 0.75 | 57.42% | invented its own dark palette |
| SDXL ControlNet 0.9 | 49.42% | muddy, hallucinated props |

The one configuration that is provably safe — pin each pixel's palette slot to
the original and take only FLUX's luminance as shading — is also the one with
the least freedom to change anything. That is the whole trade-off, and no
setting escaped it.

## If this is picked up again

Two levers were identified and never fully pulled:

- **Descriptions.** Telling the model what a tile depicts was the single
  biggest quality lever found — bigger than model, strength or ControlNet. Only
  33 squares have specific descriptions; roughly 250 of the 290 units fell back
  to a generic per-sheet string. Phrasing matters too: terrain must be described
  as a *surface filling the frame*, or the model draws a portrait of the object
  on a background.
- **Square grouping.** `UNIT = "square"` groups 4 consecutive CHR tiles, which
  is how `renderUwSquareRgba` composes dungeon squares but only accidentally
  matches overworld ones. Half-object inputs came back essentially unchanged,
  because there was nothing coherent to detail. Real quads could be derived from
  the 128 screen tile grids; the cost is that art would key by quad rather than
  by tile, which the renderer would need to follow.

## The shape of the problem

The NES gives four colours per palette row and 8×8 tiles. That ceiling is what
makes the original art read as flat — a tree trunk is one brown, a wall is one
grey — and it is also what makes the game look like *this* game. So neither
"repaint everything by hand" nor "leave the palette alone" was right.

What we did instead was give the existing art room to breathe in two directions
at once, without changing what any tile *is*.

### 256 colours, arranged as ramps

[`masterPalette256.js`](../../tools/shared/masterPalette256.js) keeps all 64 NES
hardware colours and gives each one a four-step shading ramp:

```
master index = nesIndex * 4 + shade      (64 * 4 = exactly 256)

shade 0  deep shadow      shade 2  the exact original NES colour
shade 1  shadow           shade 3  highlight
```

Two properties fall out of that arrangement, and the whole phase depends on
them:

1. **Shade 2 is byte-identical to the original.** Collapsing every pixel to
   shade 2 reproduces the 1986 art exactly. That is what Classic mode is, and
   it is what makes side-by-side comparison meaningful rather than approximate.

2. **Every palette swap still works.** This engine recolours constantly —
   dungeon LevelInfo rows, Link's tunic by ring, per-enemy sprite rows, the
   death fade, the triforce flash — and all of it operates on a row of four NES
   colours. An enhanced row is still those same four colours, each expanded to
   its ramp. Swapping a row re-derives 16 entries from 4, so none of that logic
   changed shape. `remapPaletteRgba` expands both rows at the single point that
   touches pixels; every caller still passes four colours.

Ramp steps are multiplicative rather than mixed toward white. Mixing toward
white desaturates fast and turns every highlight into the same milky pastel;
multiplying preserves the ratio between channels, so a saturated NES green
stays a saturated green as it brightens.

### 2× tiles, shaded by shape

Each 8×8 tile becomes 16×16 (`tools/enhance/`), in three passes:

- **Scale2x** rounds diagonals while leaving straight runs and single-pixel
  details crisp. Out-of-bounds neighbours clamp to the edge, which is
  load-bearing: a clamped border can never satisfy the corner-rounding test, so
  background tiles still line up seamlessly even though the enhancer only ever
  sees one tile at a time.
- **Form** — coherent lighting from a fixed upper-left key light: bevelled
  edges, contact shadow, a body gradient across enclosed objects. This does most
  of the work.
- **Texture** — a small material-specific perturbation on top. Deliberately low
  amplitude; loud texture over weak form just reads as dither noise, which looks
  *worse* than the original rather than better.

Everything is computed on the slot plane, never on colours. That is what lets
one enhanced tile serve every palette: the same dungeon wall is grey in level 1
and blue in level 7, and the shading has to be right in both.

Materials are inferred procedurally from tile shape alone — edge density,
whether detail runs vertically or horizontally, mirror symmetry, perimeter-to-
area. Nothing in the classifier knows that tile `$B4` is a tree.

| | tiles |
|---|---|
| soft (skin, cloth, creature bodies) | 541 |
| stone | 144 |
| foliage | 142 |
| flat (empty) | 91 |
| glyph (text, HUD icons) | 65 |
| masonry | 58 |
| water | 43 |
| ground | 41 |
| wood | 38 |
| metal | 19 |
| energy | 14 |

### Ordered dithering

With four shades per colour, plain rounding throws away everything subtle: a
computed shade of 2.35 rounds flat to 2 and the gradient vanishes. A Bayer
matrix lets that 2.35 land on shade 3 for about a third of pixels, so the eye
reads a smooth ramp — the same trick artists used to get gradients out of
four-colour hardware in the first place. The 4×4 period divides 16 exactly, so
the pattern runs continuously across tile boundaries.

Pure Bayer is regular enough that a large area sitting near a shade boundary
reads as polka dots, so the threshold is perturbed with a little hash noise —
closer to blue noise, while keeping the even spatial distribution that makes
gradients look smooth. Glyphs set dither to zero: text takes an embossed edge
but its stroke interiors stay one solid colour.

## Two problems worth remembering

### Repeated tiles show their grain as a grid

A screen of open desert is the same sand tile placed a hundred times. Drawn from
a sheet, every copy carries identical speckle, and the repetition reads as a
hard 16-pixel dot grid across the whole field — far more visible than the
texture it was supposed to be.

Overworld screens are pre-baked per screen, so [`buildScreens.js`](../../tools/enhance/buildScreens.js)
seeds each tile placement from its position in the world. The tile stays
byte-identical everywhere it is used; only its grain varies. Runtime-composed
surfaces (dungeon rooms) still use the sheet-seeded grain, which is fine because
dungeon floors are visually broken up by their own bevels.

### Slot 0 is not pixel 0

Unshaded backdrop pixels were written as a literal `0`, which decodes as *slot 0
at the darkest shade*, not slot 0 at its base colour. Almost every backdrop in
the game is black, where all four shades are black and the mistake is invisible
— so it survived the whole overworld and dungeon pass. The title screen's
backdrop is tan, and it came out muddy grey. Slot 0 is now written at
`BASE_SHADE`, with a regression test.

## Runtime

Game-world coordinates never changed. Link is still 16 NES pixels tall and every
hitbox, speed and screen bound stays in NES units; only the number of device
pixels used to draw them went up. The bridge is Pixi's texture `resolution`: a
32×32 texture at resolution 2 reports itself as 16×16 to the scene graph, so
positioning code needed no edits.

One catch cost a debugging round: a `Texture` copies its frame dimensions from
its source at construction, and setting `source.resolution` afterwards resizes
the source without touching that cached frame. Every sprite drew at twice its
proper size until `markScaled` also resynced the frame and rebuilt the UVs.

- [`gfxScale.js`](../../tools/shared/gfxScale.js) — the active mode; `tilePx()`
  and `markScaled()` are the only two things most call sites need.
- [`scaledCanvas.js`](../../game/src/play/scaledCanvas.js) — scratch canvases
  whose context is pre-scaled, so sprite layout arithmetic stays in NES units
  and only *source* rectangles are multiplied.
- [`bgTilePixels.js`](../../tools/shared/bgTilePixels.js) — mode-aware tile
  lookup for dungeon rooms, which are composed at runtime because doors open,
  blocks move and secrets are revealed. Classic reads 16 bytes of 2bpp planes;
  enhanced reads 256 bytes, one per pixel.

Watch for `getImageData` / `putImageData` and `canvas.width`: those are device
space, while a pre-scaled context's drawing coordinates are NES space. Mixing
them up is the easiest way to reintroduce a 2× bug.

## Building

```bash
npm run enhance
```

Runs the three bakers in order — sheets, then overworld screens, then title and
storyboard — since the screen and demo bakers read the tile data the sheet pass
produces. Output lands beside the originals (`graphics2x/`, `screens2x/`,
`title2x.png`), same filenames, so the runtime swaps sets by changing one path
segment.

## Classic mode

Options → Graphics → Classic restores the original NES art. The setting reloads
the page, because every texture is cut from the sheets during boot and there is
no way to swap art sets in place.

## Not done

- Dungeon room PNGs under `assets/extracted/dungeons/` are still baked at 1×.
  Nothing reads them in enhanced mode — the play client composes rooms at
  runtime and only falls back to the PNGs when the pattern bins are missing —
  but the standalone `dungeon.html` viewer therefore stays on classic art.
- Ending and death sequences were not visually verified in enhanced mode; they
  go through the same shared texture helpers as everything else, so they are
  expected to work, but nobody has looked at them.
