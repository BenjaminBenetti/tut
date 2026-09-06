# Map Critic opening survey

Baseline: `cafd9ff` (2026-09-06), after the map-scale work, the ramp ruling,
and materialled ladders. This is a visual assessment of Map Lab, not a
statistical QA audit or a generator implementation review.

**Checkpoint: 60 of 108 maps inspected; survey still in progress.**

## Method

The survey covers every combination of:

- Biome: temperate, snowy, desert, coastal.
- Settlement: rural, town, city.
- Size: small (48×48), medium (72×72), large (96×96).
- Seed: `mc-opening-01`, `mc-opening-02`, `mc-opening-03`.

The [recipe manifest](recipes.csv) records inspected maps in capture order.
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

The opening assessment ranks new findings separately from existing
work. Only one new actionable ticket will be filed on day one; the remaining
queue stays in the Map Critic handoff.

## Detail index

| Image | Recipe | Focus `(x,y,z)` | Purpose |
| --- | --- | --- | --- |
| [D01](details/D01-snowy-town-foundation.png), [D02](details/D02-snowy-town-foundation-rotated.png) | `mc-opening-01`, snowy/town/small | `(37,3,39)` | Building-base gap, initial orientation and one E turn |
| [D03](details/D03-coastal-road-end.png) | `mc-opening-01`, coastal/town/small | `(37,2,14)` | Railed road stub at water |
| [D04](details/D04-city-platform.png) | `mc-opening-01`, temperate/city/small | `(33,5,30)` | Empty raised paved square; existing #869 also visible |
| [D05](details/D05-desert-town-foundation.png) | `mc-opening-02`, desert/town/small | `(32,0,18)` | Building-base gap beside a ladder |
| [D07](details/D07-coastal-fences.png) | `mc-opening-01`, coastal/rural/small | `(5,2,22)` | Fence fragments and hard material borders |
| [D08](details/D08-rural-floor-cut.png) | `mc-opening-01`, temperate/rural/small, **floor=0** | `(24,2,15)` | Positive interior example; higher terrain is intentionally hidden |
| [D09](details/D09-medium-coastal-road-end.png) | `mc-opening-03`, coastal/city/medium | `(51,1,40)` | Marked road ending against open water |

D06 was an exploratory frame and is omitted because its framing did not
clearly support the observation. Image numbering preserves the capture log.

The [snowy](details/snowy-town-small-01-no-units.png) and
[desert](details/desert-town-small-02-no-units.png) control views use the
initial camera, `units=0`, models on, and all levels. The same building-base
gaps persist without preview units. These are not the intentional missing
higher layers visible in the D08 floor cut.
