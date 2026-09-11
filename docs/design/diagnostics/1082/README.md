# Lagos place profile — #1082

The adapter discarded mission city identity, leaving Lagos on the region’s generic
temperate trees and wall palette. The optional `placeProfile` now survives mission
adaptation and recipe serialization; Map Lab exposes the same choice through
`?place=lagos`. Omitted profiles retain the existing biome behavior. Art’s merged
#1098 kit supplies tropical almond, oil palm and warm rendered walls.

The intended setting is a modern, landward residential/shop neighborhood on Lagos’s
coastal plain. [Lagos State’s Resilience Strategy, printed pp18–19](https://lasbca.lagosstate.gov.ng/wp-content/uploads/2021/05/Lagos_Resilience_Strategy.pdf)
describes the lowland, tropical city and extensive urban replacement of its earlier
vegetation. This sample keeps an inland street grid; the profile does not force a
waterfront into every mission.

Terrain amplitude changes from four layers to two and frequency from .08 to .04.
The almond/palm density targets remain 4/2 per 100 open columns, with the existing
3–6-tree clustering. Ground materials, building templates, street widths, yard rules,
cover and tree LOS flags keep their definitions. Warm plaster covers ground and upper
walls; civic parapets retain their road kit. Perth/Johannesburg reserve the agreed
profile IDs with no environmental override here, for Art’s #1083/#1084 integration.

| View | Before: no profile | After: Lagos profile |
| --- | --- | --- |
| Reported seed 1892582247, yaw0 | [L01](before/L01-lagos.png) | [L01](after/L01-lagos.png) |
| Same seed, yaw1 | [L02](before/L02-lagos-reverse.png) | [L02](after/L02-lagos-reverse.png) |
| Second seed 1892582248, yaw0 | [S01](before/S01-second-seed.png) | [S01](after/S01-second-seed.png) |
| Accepted snowy rural P3 route control, unprofiled in both | [C01](before/C01-snowy-route.png) | [C01](after/C01-snowy-route.png) |

Both phases run source `8ec75d0`, including the accepted yard arrangements and merged
Lagos asset kit. Sidecars record recipes, cameras, native clips and SHA-256 hashes.
Lagos uses the critic’s focus (36,1,36), 45px/tile, 2400×1500 viewport and 1500×1100
crop. C01 retains the accepted snowy-route recipe/focus (13,3,24), with the same
larger crop in both phases. Models/units on, all levels, slope100%, pointer off map.
The production generator, renderer and camera are used; the driver only exposes the
rig for framing. All captures use SwiftShader, not the iGPU.

## Measurements and verification

[Campaign reproduction](campaign.json) reaches day28 from seed4242 after five first
choices, yielding Lagos mission-14 with the reported map seed1892582247 and the new
profile. [Current survey](survey-after.json) records 18 Lagos before/after pairs
(two seeds × three settlement scales × three sizes), all passing generator invariants.
Its 36 unprofiled maps match [baseline b64e723](survey-before.json) byte for byte across
all four biomes, three scales and three sizes.

The two medium city examples retain 13/15 buildings, 38/35 connectors, five/four
maximum storeys, two ladders each, and identical measured cover/access metrics.
Their graded ground is already flat: absolute level 1→0 and 2→1; the visible local
identity comes chiefly from the tree silhouettes and wall materials. Rural Lagos
samples retain natural relief over 0–2 layers instead of 0–4, and some vegetation
placements change with that terrain. This profile does not claim an ambush or
mission-difficulty improvement.

Commands: `node tools/mapgen/capture-place-profiles.mjs before` and `after`
(`CAPTURE_CASES` selects a partial batch); the two before batches are combined in
`before/captures.json`. Measurements used the production Vite SSR generator and
`computeMapMetrics`; raw recipes, counts and map hashes are retained above.
Typecheck, ESLint, formatting and production build pass. Unit verification: 2,093
passed in the first run, then all 290 tests in its 28 DOM files passed with explicit
Vite filesystem access to this `.git` worktree (the initial DOM imports were denied
by Vite’s default path exclusion); one optional test remains skipped.

All 15 focused Playwright checks pass with no retries/skips: Map Lab controls and
place URL persistence, the 12 biome/settlement previews, and real doorway movement.
The snowy control is byte-identical across phases. Every before frame repeated in
two independent browsers. The after batch was interrupted on its final repeat;
a fresh browser re-captured all four images with `VERIFY_EXISTING=1`, matching every
saved byte while recovering sidecars. [Verification](verification.json) records
hashes, pixel counts, camera agreement and this recovery.
