# Map Critic — resumed survey, 2026-09-08

Current-main baseline: `360778a4a0edbe5cfbc865af4006e5b9d0d92231`.
Its game, asset and capture-tool trees match the post-#936 baseline `900d9a3`.
The two-day pause added no visual change to that comparison.

Preserve the readable road/pavement proportions, complete roofs, differences
in storey count and footprint, and the strong biome palettes. At-grade city
yards read more plausibly than the removed planted boxes. Rural and town
hills still shape the scene. The [post-removal record](../map-critic-post936/README.md)
contains the matched repair and usable-building-height checks; the explicit
[picture-improved verdict on #936](https://github.com/BenjaminBenetti/tut/issues/936#issuecomment-5589275662)
records their limits.

## Method and scope

The fresh spread uses `mc-resume-01`: four biomes, rural/town/city and
48/72/96 sizes. The recipe sequence changes one parameter between maps.
Map Lab uses models and preview units on, slope 100%, initial level label
**all**. Every recipe has an initial closer view and maximum-zoom-out view,
with the actual settings recorded in the manifest. The camera viewport is
2400×1500; each source scene crop is 2020×1500 at `(380,0)`.
Comparison sheets put the whole view left and closer view right, one row
per biome. They resize each source to half its captured dimensions; no
scene content is added, removed or retouched.

This is a visual survey, not a prevalence count, pathfinding/LOS test or
balance certification. The narrow cutaway around a real obscured squad
must be checked through the actual cutaway control, not inferred from
Map Lab's preview units.

## Repair verdicts and follow-up

- Foundations (#906), roofs (#916), paved-platform removal (#910) and
  waterfront endings (#915) have committed matched-frame verdicts in the
  [earlier re-check](../map-critic-recheck-936/README.md). The picture improved.
- Vegetated-platform removal (#936) also improves the picture. The matched
  city floor/roof views support retaining building-based infantry height;
  those views do not justify a new city-flatness ticket. Natural terrain
  remains a preservation control. No request to restore plinths.
- Fences remain owned by #917. MapGen claimed the resumed repair on main;
  fresh rural fragments belong to that issue.
- Hard natural material boundaries are now [#945](https://github.com/BenjaminBenetti/tut/issues/945),
  routed to both MapGen and Art with committed two-angle evidence.
- #937 is still a pending merged-frame check. Radius **4** is the Executive
  Director's chosen coverage, including overlapping reveals. The Director
  has accepted the Art Director's opacity interpretation of **0.175**;
  PR #943 awaits final frames/merge. Do not re-file the chosen wide reveal.
- #911 owns the dropship at the deliberately shared deploy/extract zone.
  #869 owns ramps meeting continuous parapets. #787 owns future big-city
  overpasses. #701, #712 and #591 retain their earlier context.

The settled #813/#876/N1 geometry rulings stand. Hard material boundaries
are a different finding. Useful cover does not excuse implausible placement.


## Survey evidence

All 36 pairs were opened and judged. The 12 large-map whole views also had
native-resolution inspection. [Visual ledger and nine comparison sheets](visual-ledger.md)
record what was seen in each recipe; [recipes.json](recipes.json) records
URLs, level labels, camera settings and source-frame hashes. Source PNGs
remain in Git-ignored `.scratch/map-critic-resume-0908/frames/`.

Seven focused PNGs below were separately opened at native resolution.
Their JSON sidecars record exact camera focus `(x,y,z)` in half-height layers,
URL, actual level label, 45 px/tile zoom, 2400×1500 viewport and 1300×1050 crop.

| Frame | Recipe / focus | What it establishes |
| --- | --- | --- |
| [P01](details/P01-trail-merge.png), [P02](details/P02-trail-merge-rotated.png) | `mc-resume-01`, temperate/rural/small, `(13,2,24)`, initial / one E turn | The narrow dirt route merges visually with broad bare patches; angle does not supply a distinct surface cue. |
| [P03](details/P03-snowy-trail-control.png) | Same seed/scale/size/focus, snowy, initial angle | The brown trail has a much clearer identity against snow and grey rock. This is a readability control, not an identical-height terrain claim. |
| [I01](details/I01-city-frontages.png), [I02](details/I02-city-frontages-rotated.png) | `mc-resume-01`, temperate/city/medium, `(43,2,39)`, initial / one E turn | Repeated small windows, simple door openings and loose yard objects give neighbouring fronts little recognisable difference in use. |
| [I03](details/I03-second-seed.png), [I04](details/I04-second-seed-rotated.png) | `mc-opening-02`, temperate/city/medium, `(23,1,34)`, initial / one E turn | Another seed has clearly different height/footprint, but the same weak exterior use cues. Roof stairs and the neighbouring ladder are positives. |

These last findings progress the original path ambiguity and built-place
identity observations. #204 already repaired snow/desert trail contrast;
the snowy control preserves that success. #945 owns natural material
contact shapes, a related but distinct visual outcome. #509/#511 supplied
wall families and #492 addressed excessive glazing. Preserve their material
contrast and restrained windows; building-use identity asks for more than
another window-density or colour pass. Art and MapGen own the means.
