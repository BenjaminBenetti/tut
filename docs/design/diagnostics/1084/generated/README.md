# Johannesburg building character — #1084

The existing renderer picked a generic wall family from the building ID, while
some ground-floor walls were drawn by an outside tile without that ID and fell
back to brick. All non-walkable pitched roofs used the same gabled cap. The
Johannesburg profile now selects green hipped/rendered houses alongside brick
gabled houses and retained flat-roof apartment/shop blocks. The style choice is
stable per building; ground-floor exterior walls use the owner across the shared
edge so their finish continues up the facade. Civic kerb-and-rail parapets retain
their own kit.

The intended context is an older mixed suburban street, not a named landmark.
[Johannesburg's Region B description](https://joburg.org.za/about_/regions/Pages/Region%20B%20-%20Northcliff%20Randurg/Region-B---Northcliff-Randurg.aspx)
provides the residential/apartment/local-retail range; the city's
[Salisbury House heritage record](https://arts-culture-heritage.joburg/heritage-sites/salisbury-house/)
provides a local precedent for green hipped metal and brick/rendered masonry.
[The accepted kit and Blender contract](../kit.md) supply the cap. Hipped houses
use the same low pitch and wall line as the existing gabled roofs; the new
world-aligned profiles close all four roof ends without changing standable tiles.

| View | Before: shared building kit | After: Johannesburg selection |
| --- | --- | --- |
| Reported seed 730982385, yaw 0 | [J01](before/J01-reported.png) | [J01](after/J01-reported.png) |
| Reported seed, yaw 1 | [J02](before/J02-reverse.png) | [J02](after/J02-reverse.png) |
| Second seed 1892582247, yaw 0 | [J03](before/J03-second-seed.png) | [J03](after/J03-second-seed.png) |
| Second seed, yaw 1 | [J04](before/J04-second-seed.png) | [J04](after/J04-second-seed.png) |
| Perth control, yaw 0 | [C01](before/C01-perth-control.png) | [C01](after/C01-perth-control.png) |
| Perth control, yaw 1 | [C02](before/C02-perth-control.png) | [C02](after/C02-perth-control.png) |

Both phases use the source commit in each JSON sidecar. Only the Johannesburg
profile selector changes in the four target pairs. The [cases](cases.json) use
the critic's reported small48 recipe and camera at (24,1,24), yaw 0/1, 45px/tile,
2400×1500 viewport and native 1500×1100 crops. The second pair uses the issue's
corroborating temperate/city/medium72 recipe with seed 1892582247 and focus
(36,1,36), explicitly selected as Johannesburg; it is not a claim that the
campaign's Lagos mission moved cities. Perth retains its profile in both phases.
Models/units are on, all levels shown, slopes at 100%, pointer off map.

The generated comparisons use `tools/mapgen/capture-place-profiles.mjs before`
and `after`, with `PLACE_CASE_FILE` pointing to `cases.json`, `PLACE_OUTPUT` to
the phase directory, and `PLACE_RECORD_FILE` to its group sidecar. `CAPTURE_CASES`
selects a comma-separated pair; `PLACE_MAP_OUTPUT` retains full map dumps in a
scratch directory. Both phases use the production generator, renderer and camera.
Evidence uses SwiftShader, with two independent browsers per saved view.

The occupied-roof check uses the established `mc-opening-01` interior fixture,
now with `place=johannesburg`. `node tools/art/preview/capture-johannesburg-shelter.mjs`
captures the [closed hip](cutaway/hip-closed.png), [one squad](cutaway/hip-1-squads.png),
[two squads](cutaway/hip-2-squads.png), and [the force having left](cutaway/hip-force-left.png).
The production radius4 / retained opacity .175 and unit counts are asserted, and
the last frame must match the empty roof byte for byte. The code does not modify
the units-only reveal, its eight slots, fade, depth ordering or composition.

Typecheck, ESLint, formatting, build and all 2,410 unit tests pass (one optional
test skipped). New regression checks cover outside-owned solid/window/door walls,
retained civic parapets, both generated seeds, unchanged non-roof placements and
Perth's complete placement set. The shelter test runs the hipped cap through the
production loader/instancer, ray-samples the continuous surface across tile and
ridge seams, verifies shared cutaway uniforms and mist, and checks level peeling,
vision ownership and picking. Original gabled-roof tests remain green.

The occupied-roof set repeats byte for byte in two independent browsers, including
exact closure after the force leaves. Both Perth after-controls also match the
committed #1107 PNGs byte for byte. This adds a new roof silhouette and coherent
facades while keeping the earlier coastal landscape distinct.

[Final paired measurements](verification.json) confirm that every target map is
identical before/after apart from the profile selector: buildings, connectors,
props, hooks, terrain, water and dropships all retain their records. The reported
map has three buildings, seven connectors and a five-storey maximum; the second
has thirteen buildings, thirty-eight connectors and the same maximum. Both Perth
pairs also retain identical complete map data and PNG bytes, including comparison
against #1107. All twelve map frames reproduce in independent browsers. I inspected
both angles on both target seeds and the distinct-place control; the changed
silhouette/facades remain grounded, with frontages and roof access readable.
