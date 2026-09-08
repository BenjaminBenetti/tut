# #959 — temperate trail identity

[Cause posted before implementation](https://github.com/BenjaminBenetti/tut/issues/959#issuecomment-5592311314): temperate natural ground includes `dirt`, and its rural `trailSurface` was also `dirt`. RoadPass could paint a used route without producing any visible material distinction. Both resolve to the same ground model. #945 smooths different-material contacts; it cannot distinguish identical dirt from dirt.

## Repair and preservation

Temperate's rural trail now uses the existing `rock` surface as a stone track. That surface is absent from temperate's natural grass/dirt palette, so the route remains distinguishable through bare-earth patches. The trail layout stays narrow and follows the same levels and connectors. This is one biome-data change with its road-paint expectation and rural golden updated; no new material, model or map-contract field is introduced.

The 108-map paired survey covers four biomes × three settlement scales × three sizes × `mc-resume-01/02/03`. Only the nine temperate rural maps change, and those differences are confined to trail surface paint. In **all 108 pairs**, full maps with tile `surface` omitted, complete off-road tiles, road-segment geometry, every map metric and relocation counts match. The other 99 complete maps match, including all snowy/desert maps. `paired-survey.json` records the hashes, palette and contact counts for each pair.

Across the nine changed maps, 1,462 road columns keep their geometry; 512 trail-to-non-road edges with identical materials become zero. These are data observations, not visual acceptance or a claim about every seed.

For the critic's seed `mc-resume-01`:

| Size | Road columns | Already dirt before road paint | Indistinguishable roadside edges before → after |
| --- | ---: | ---: | ---: |
| Small | 113 | 7 | 13 → 0 |
| Medium | 168 | 82 | 95 → 0 |
| Large | 220 | 75 | 83 → 0 |

**Rendering cost:** the existing stone ground asset has modelled chips and introduces another surface batch. In the first reported view, draw calls rise **591 → 633** (+42, 7.1%) and triangles **216,670 → 227,686** (+11,016, 5.1%); one extra texture is resident. This is not a claim that render geometry is identical. Tactical tiles, heights, slopes, connectors, cover, vegetation, buildings and hooks match; the extra stone detail is visual. Sidecars record each view's full render counters. Software-renderer RAF samples are not hardware FPS measurements.

## Before/after frames

Baseline `3fc3a38` includes the Director-accepted #945 contact repair. Runtime `3f8efcc` changes trail identity on top of it. Both sides therefore include the same contact treatment; this isolates the new route distinction. Initial all levels, models/units on, slopes 100%, 2400×1500 viewport, pointer outside the scene. Each PNG has its exact URL, camera state and crop in an adjacent JSON.

| Case | Before | After |
| --- | --- | --- |
| Reported temperate/rural/small, `mc-resume-01`, (13,2,24), 45 px/tile | [P01](before/01-temperate.png) | [P01](after/01-temperate.png) |
| Same location, one E turn | [P02](before/02-temperate-rotated.png) | [P02](after/02-temperate-rotated.png) |
| Known-good snowy rural trail, same seed, actual (13,3,24), 45 px/tile | [P03](before/03-snowy-control.png) | [P03](after/03-snowy-control.png) |
| Known-good desert rural trail, same seed, (13,2,24), 45 px/tile | [Desert](before/04-desert-control.png) | [Desert](after/04-desert-control.png) |
| Temperate/rural/medium, same seed, widest view | [Medium](before/05-temperate-medium.png) | [Medium](after/05-temperate-medium.png) |
| Temperate/rural/large, same seed, widest view | [Large](before/06-temperate-large.png) | [Large](after/06-temperate-large.png) |

P03 follows the critic's actual y3 camera sidecar, rather than the textual y2 request. The snowy and desert **before/after PNGs are byte-identical** for this scoped change. This is a different comparison from #945's readability controls, whose natural margins changed: both sides here already include #945.

The medium/large requests hit Map Lab's existing zoom-out clamp: actual ground-axis pitch is about **16.20 / 12.15 px**, not the requested 14 / 10. Sidecars retain both the requested `pitch` and `actualPitch` derived from the recorded true-isometric camera. These are wide scene views, with the existing sidebar crop, rather than new camera behavior.

## Reproduce and validate

Run the real Map Lab server from the baseline or repaired checkout, then run the capture script from the repair checkout:

```sh
CAPTURE_BASE_URL=http://127.0.0.1:5177 node tools/mapgen/capture-trail-identity.mjs before
CAPTURE_BASE_URL=http://127.0.0.1:5177 node tools/mapgen/capture-trail-identity.mjs after
```

`CAPTURE_ONLY=01-temperate` selects a case. The supplied evidence uses a fresh browser for each case. Capture instrumentation exposes only the actual rig and renderer; it does not replace generation, geometry or lighting.

`node tools/mapgen/survey-trail-identity.mjs result.json` runs the same 108 recipes and observes the actual RoadPass. For a paired rerun, run the tool against the baseline and repaired sources and compare the full-map/non-surface/off-road/road-geometry hashes and metrics. The stored baseline precedes the data edit; it is not reconstructed by guessing which final brown tiles were roads.

Validation: typecheck, lint, build, **2,263 unit tests**, **1,200 wide-sweep maps with zero relocations**, **seven simulation checks**, and **60 browser tests** pass. The only changed golden is `golden-rural`: `743992674 → 1604470458`. One existing unit wide-sweep skip and 30 opt-in browser captures/benchmarks remain under the ordinary commands; the wide sweep was explicitly run separately. Director judges the frames before Tech Lead merge; the Map Critic re-checks afterwards.
