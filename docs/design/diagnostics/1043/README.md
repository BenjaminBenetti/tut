# Coastal rural route identity (#1043)

[Cause before production edits](https://github.com/BenjaminBenetti/tut/issues/1043#issuecomment-5594274929): coastal trails and natural bare earth share `dirt` and `tile.ground.dirt`. In `mc-resume-03 / coastal / rural / small`, 29 of 108 road columns already have the road paint before RoadPass, and 41 road-to-ground edges share it afterwards. `cause.json` records the real road-mask distinction at z10: x14–15 are road, x13/x16 are natural ground. Camera focus (21,2,10) is natural ground, not a road coordinate.

Coastal's rural trail paint now uses existing `rock`, absent from its natural grass/sand/dirt palette. This is one biome data parameter: road width, routing, heights, connectors, buildings and natural ground remain intact. The strengthened biome regression requires each trail material to be absent from the entire natural palette, including minority bare earth. MapGen independently reproduced the cause and [agreed to this bounded repair](https://github.com/BenjaminBenetti/tut/issues/1043#issuecomment-5594306496) before production edits.

Art judgment: the stone track can be followed past the building and through the broad dirt field, retaining a narrow rural approach without kerbs or lane markings. The existing two-layer crossing at (14–15,0,7) → (14–15,2,8) remains visible in both junction views; its ramps and neighbouring bank faces have not been regraded. This material change is submitted for Director judgment and Critic re-check.

Baseline main `1b0ff8d` has the same runtime as reported `9d9ea01`; its later commits are docs only. The original D1/E1/E2 Critic crops at `ce1ea0c` were opened. Fresh paired views retain their recipes, focus, two angles and 45 ground-axis pixels per tile, in a 2400×1500 viewport with native 1300×1050 crops centred on the focus. This is a fresh pair, not a claim of identical pixels to the older crop.

`capture-coastal-trails.mjs` owns port8797 with HMR/watch disabled and closes browser/server in finally. It uses the real generator, model/unit readiness and camera rig; diagnostic access only records map and renderer counters. All seven views repeat in two browsers; PNG hashes and source commits are in each phase's `captures.json`. The temperate two-angle, snowy y3 and desert y2 controls use the accepted `mc-resume-01` recipes. Full maps go to `.git/art-1043/`.

| View | Before | After | Changed pixels |
| --- | --- | --- | ---: |
| D1 coastal approach, focus (13,2,24), yaw0 | [Frame](before/D1-coastal-approach.png) | [Frame](after/D1-coastal-approach.png) | 102,029 |
| E1 coastal junction, focus (21,2,10), yaw0 | [Frame](before/E1-coastal-junction.png) | [Frame](after/E1-coastal-junction.png) | 97,836 |
| E2 coastal junction, same focus, yaw1 | [Frame](before/E2-coastal-junction.png) | [Frame](after/E2-coastal-junction.png) | 86,694 |
| P1 temperate, yaw0 | [Frame](before/P1-temperate-control.png) | [Frame](after/P1-temperate-control.png) | 0 |
| P2 temperate, yaw1 | [Frame](before/P2-temperate-control.png) | [Frame](after/P2-temperate-control.png) | 0 |
| P3 snowy | [Frame](before/P3-snowy-control.png) | [Frame](after/P3-snowy-control.png) | 0 |
| P4 desert | [Frame](before/P4-desert-control.png) | [Frame](after/P4-desert-control.png) | 0 |

All fourteen PNGs were opened. Every capture reproduced byte-for-byte in a second browser. All four before/after controls are PNG-byte-identical as well as zero changed RGBA pixels. [comparisons.json](comparisons.json) records the hashes, equal cameras, full-map comparisons and actual renderer counters. The three coastal views add 20 draw calls, 12,960 triangles, ten geometries and one texture; shader-program count is unchanged. Calls are D1 788→808, E1 576→596, E2 557→577 (2.5–3.6%); triangles rise 5.3–5.5%. Control render costs are unchanged. This is measured scene cost, not a claim about frame time.

```sh
ROAD_CAPTURE_ROOT=/workspaces/tut/.git/art-1043/baseline \
  node tools/art/preview/capture-coastal-trails.mjs before
node tools/art/preview/capture-coastal-trails.mjs after
node tools/mapgen/survey-trail-identity.mjs .git/art-1043/before-survey.json
```

The existing survey observes actual RoadPass paint, full maps, non-surface map data, complete off-road tiles, road segments, metrics and relocations across four biomes × three settlements × three sizes × three seeds. [paired-survey.json](paired-survey.json) records the 108 before/after pairs on baseline `1b0ff8d` and repair `793099c`: 99 complete maps are identical, and nine coastal rural maps change only road surface. All 108 retain identical non-surface maps, complete off-road tiles, road segments, metrics and relocations. The nine changed maps contain 1,462 road columns; equal-material road-to-natural-ground edges fall from 481 to zero. The captured coastal map changes exactly its 108 road tiles from dirt to rock; the other three captured maps are completely identical.

The paint applies when generating a new coastal rural map. Previously serialized maps retain their stored surface IDs. No new model is emitted: `tile.ground.rock` and the parameterised slope/ramp material kit are existing registered assets. The before survey and clean detached baseline were retained before the runtime edit; accepted historical frames elsewhere in the repository are not refreshed.

[Validation](validation.json): typecheck, full lint/format, build, 2,264 unit tests (one skipped), seven simulation tests and 62 Chromium tests (31 opt-in captures/benchmarks skipped, zero flaky) passed on the recorded source. The final additions are evidence only.
