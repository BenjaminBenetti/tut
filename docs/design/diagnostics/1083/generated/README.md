# Perth coastal landscape — #1083

Perth now selects a local landscape through the shared `placeProfile` seam from
#1106. The intended setting is a built coastal neighbourhood beside remnant tuart /
Banksia woodland and limestone heath, following [Western Australia's park authority](https://www.bgpa.wa.gov.au/bold-park/attraction/bold-park-bushland).
This is a regional planting mix around streets and plots, not a recreation of Bold
Park. [The accepted Blender kit](../kit.md) supplies its four models.

Tuart's pale branching trunks and open grey-green crowns replace most slender
palms; lower Banksia and grass-tree groups give the open ground a second scale.
Occasional planted palms remain plausible here. Limestone outcrops are scattered
singly: grouping them in a first render made the rocks look arranged like yard
clutter. Sand increases from 35% to 45% of the natural surface mix, grass from 50%
to 45%, and dirt from 15% to 10%. The existing textures, softened contacts, coastal
relief, shoreline and route surfaces are retained.

The total planting target stays at six props per hundred eligible columns, shared
between tuart 1.4, Banksia 2, grass-tree 1.2, limestone .4, palm .2 and fence .8.
These are generation weights, not promises about an individual frame. An explicit
`vegetation` placement context keeps the new low-cover grass-tree out of the
legacy ground-clutter pool, so adding its definition cannot reroll other places'
yards. Building, frontage and yard rules retain their definitions.

| View | Before: generic coastal profile | After: Perth profile |
| --- | --- | --- |
| Reported seed 215428772, yaw 0 | [P01](before/P01-reported.png) | [P01](after/P01-reported.png) |
| Reported seed, yaw 1 | [P02](before/P02-reverse.png) | [P02](after/P02-reverse.png) |
| Second seed 1892582247, yaw 0 | [P03](before/P03-second-seed.png) | [P03](after/P03-second-seed.png) |
| Second seed, yaw 1 | [P04](before/P04-second-seed.png) | [P04](after/P04-second-seed.png) |
| Lagos control, yaw 0 | [C01](before/C01-lagos-control.png) | [C01](after/C01-lagos-control.png) |
| Lagos control, yaw 1 | [C02](before/C02-lagos-control.png) | [C02](after/C02-lagos-control.png) |

Both phases use the same source commit, recorded in each frame's JSON sidecar.
The only recipe change in the Perth pairs is `place=perth`; Lagos retains
`place=lagos` in both phases. [Cases](cases.json) retain the reported camera and
use that same framing for the second seed: focus (36,2,36), yaw 0/1, 45px/tile,
2400×1500 viewport and native 1500×1100 crops. Lagos uses focus (36,1,36).
Models and units are on, all levels shown, slopes at 100%, pointer off map.
The helper uses the production generator, renderer and camera, with diagnostic
access only for camera placement and map measurements. Evidence uses SwiftShader.

Capture one case with `CAPTURE_CASES=P01-reported`,
`PLACE_CASE_FILE=docs/design/diagnostics/1083/generated/cases.json`,
`PLACE_OUTPUT=docs/design/diagnostics/1083/generated/after`,
`PLACE_RECORD_FILE=docs/design/diagnostics/1083/generated/after/P01-reported.json`
and `node tools/mapgen/capture-place-profiles.mjs after`; substitute the case and
phase for the remaining pairs. `PLACE_MAP_OUTPUT` selects a scratch directory for
full map dumps. Each invocation compares two independent browser captures before
recording `repeatedBrowsers: 2`.

Typecheck, ESLint, formatting, the production build and all 2,397 unit tests pass
(one optional test skipped). The new generation regressions cover both displayed
Perth seeds, deterministic recipe replay, valid generated maps, retained coastal
relief/shoreline/building/route rules, and full-map equality with the new prop
definitions removed for all four unprofiled biomes and Lagos. The shared adapter
test covers saved recipes for all three named places.

[Paired measurements](verification.json) confirm identical building records,
water tiles and dropship placements. The reported/second seed keep seven/eight
buildings, three maximum storeys, 23/20 ramps, 8/18 stairs and 2/5 ladders.
Planting changes reroll six optional ramp records, objective/edge-spawn locations
and some yard placements per seed; this is not a byte-identical tactical layout.
Cover-providing tile counts change 310→309 and 320→311. Building stairs and ladders
retain their exact records. The generation invariant checks pass; these art frames
do not certify movement, LOS or mission balance.

All twelve PNGs repeat byte for byte in independent browsers. Both Lagos control
pairs also match the submitted #1106 after-frames byte for byte, and their full
map dumps are unchanged. I inspected the paired frames: roofs/access openings,
frontages, graded carriageways and continuous water remain readable; the local
plant silhouettes and pale stone distinguish Perth from Lagos's fuller green
canopies and warm rendered buildings.
