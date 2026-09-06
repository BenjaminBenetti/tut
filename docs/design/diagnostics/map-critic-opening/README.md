# Map Critic opening survey

Baseline: `cafd9ff` (2026-09-06), after the map-scale work, the ramp ruling,
and materialled ladders. This is a visual assessment of Map Lab, not a
statistical QA audit or a generator implementation review.

## Method

The planned spread is every combination of:

- Biome: temperate, snowy, desert, coastal.
- Settlement: rural, town, city.
- Size: small (48×48), medium (72×72), large (96×96).
- Seed: `mc-opening-01`, `mc-opening-02`, `mc-opening-03`.

Each recipe is generated through `mapgen-preview.html`, with `models=1`,
`units=1` and `slope=100`. The viewport is 2400×1500. The capture traversal
changes exactly one recipe parameter between consecutive maps. Each map has
a whole-map view and a closer view at the initial camera; promising and
uncertain details are revisited by panning, zooming, rotating, or cutting to
an interior floor. The blue and red tiles are the preview's deployment and
spawn overlays, and the green tiles are objective markers.

Comparison sheets put the whole-map view on the left and the closer view on
the right. They are labelled, reduced copies of unaltered screenshots. Detail
PNG crops retain their captured pixels. Their JSON sidecars record the exact
recipe, tile used to centre the camera, camera rotation, viewport, and crop.
Coordinates are `(x,y,z)`; `y` is the half-height layer from ADR 0008. A
whole-map view covers `x,z = 0..47`, `0..71`, or `0..95`, according to size.

Assessment is by looking at the rendered maps. Screenshot collection does
not itself constitute inspection. The visual ledger records the views that
were actually inspected. No defect-frequency claims are inferred from this
spread, and no movement, line-of-sight, balance, or performance validation
is claimed.

## History respected

- #813: lot margins, diagonal climbing pieces, paved retaining edges, the
  named three-sided gully, and materialled ramps shipped and were judged.
- #826 / ADR 0009: 48/72/96 map presets, 2/3/4-lane roads, larger buildings
  with rooms off corridors, and map-aware camera zoom are deliberate.
- #876: the same-level, opposite-facing outer-corner saddle crease stays.
- #813 N1: spurs between two-tile channels are correct, not missing art.
- #849: the API now reports the issue closed; the wider three-or-more-high
  coverage bucket remains an invalid substitute for the piece's target.
- #891: materialled ladders shipped.
- #869 already covers city ramps crossing an unbroken parapet.
- #701 already covers isolated desert palms; #712 records the temperate
  boulder-placement intent question.
- #281: the Executive Director ruled to retain current cover density.

The opening assessment will rank new findings separately from existing
work. Only one new actionable ticket will be filed on day one; the remaining
queue stays in the Map Critic handoff.
