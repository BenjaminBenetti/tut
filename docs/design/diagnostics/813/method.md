# #813 — how the catalogue was produced

Enough to reproduce every number and every frame in `README.md`, including after
#826 changes map dimensions. Captured on `main` at `f4557b4`.

## The mask

For a ground tile `t` (top ground layer of its column, building footprints excluded),
each of the eight neighbours clockwise from north — `N NE E SE S SW W NW` — is `H`
when its own top ground tile exists, is not water, and sits at exactly `t.y + 1`;
otherwise `.`. That is the same test `SlopePass.isStepUp` makes, so the mask is the
whole of the input the classifier sees.

Masks are canonicalised by taking the lexicographic minimum over the four rotations
(rotating 90° clockwise cycles the eight positions by two), so one row covers all
four turns of the same shape.

A tile enters the enumeration when at least one **orthogonal** neighbour is `H` — it
faces a one-layer step and could carry a wedge. Tiles whose only `H` is diagonal are
counted only when they actually received an `outer` piece.

## The sample

108 maps: biomes `temperate, snowy, desert, coastal` x settlements `rural, town,
city` x sizes `small, medium, large` x seeds `qa813-<biome>-<settlement>-<size>-{0,1,2}`,
plus `hills-1` snowy/rural/medium. Archetype `settlement`, `DEFAULT_MISSION_HOOKS`,
`slopeShare` left at its default of **1** — verified in `param-resolver.ts`, so no run
is left bare by the Map Lab knob.

The diagonal-chain figure additionally sweeps 64 maps seeded
`hunt-<biome>-<size>-{0..7}` at settlement `rural`.

Maps are generated through `generateTacticalMapWithDiagnostics` and read from the
frozen `TacticalMap`, never from the draft, so the numbers describe what ships.

## The bucket table in §1

Each tile facing a one-layer step is assigned the **first** bucket that matches, in
this order, so the buckets do not double count:

1. carries a wedge (`tile.slope !== undefined`)
2. has a wall on the low tile
3. any of the eight neighbours is water, or the tile is
4. three or more orthogonal `H`
5. the tile carries a connector endpoint
6. on the outermost ring of the map
7. within 3 tiles of any building footprint rect
8. everything else

Bucket 7 approximates `SlopePass.isNatural`'s lot test. The pass reads `draft.lots`,
which the frozen map does not carry and which are larger than the building
footprints it does; bucket 8 is therefore an upper bound on tiles the rule does not
explain, not a separate defect.

## The frames

Map Lab, `mapgen-preview.html`, with
`?seed=&biome=&settlement=&size=&slope=100&models=1&units=1` — `models=1` for the
shipped art, `units=1` because it is what exposes `window.__tutTactical__` and with
it `tileScreenPosition`, which is how a named tile is found on screen.

Playwright drives the page headless in Chromium
(`--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader`) at
1600 x 1000, waits for `body[data-models-ready="true"]`, and then:

1. **centres** the target tile by tapping `w`/`a`/`s`/`d`, each of which pans exactly
   `CAMERA_INPUT_TUNING.tapPanPx` = 96 screen px;
2. **zooms one wheel notch and re-centres**, repeating until the measured distance
   between the projected centres of `(x, y, z)` and `(x + 1, y, z)` reaches the
   wanted **tile pitch of 140 px**;
3. crops **600 x 600** about the tile.

Centring before zooming matters: `tileScreenPosition` returns nothing for a tile that
has left the view, so zooming first loses the target and silently yields a frame at
whatever zoom the loop gave up at.

Because the frames are pinned to a tile pitch rather than a zoom level, a change in
map dimensions does not change what a crop shows.

## What this method does not cover

- Only the `settlement` archetype. Hive and crash-site maps (#447, #760) are not sampled.
- Only the top ground layer of each column: a slope under an overhang would be missed.
- Verdicts are mine, from looking at the frames. The Director judges the crops.
