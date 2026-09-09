# #1006 — urban fences mark plot boundaries

Baseline `9d9ea01` (v0.2.15); repair runtime `03569fb`. These are dated before/after
records for Director judgment. #911 is a separate pending PR and is not in either map.

## Cause and repair

[Cause stated before production edits](https://github.com/BenjaminBenetti/tut/issues/1006#issuecomment-5593901448).
The vegetation scatter and generic yard clutter both place independently rotated timber
panels. The accepted rural boundary pass explicitly skipped town and city. In the city
example, the two waterfront fragments are at (49,1,30), from vegetation, and (48,1,28),
from yard clutter. The complete map has 29 singleton panels (16 vegetation, 13 yard).
The town corroboration has 36 (28 vegetation, eight yard).
[Recorded provenance](provenance.json) distinguishes these sources from their real calls.

`BoundaryFencePass` now applies the existing supported plot/trail-boundary rules to all
settlements. Its internal `rural-fences` id remains unchanged because that id seeds its
RNG stream; renaming it would reroll the accepted rural layouts. Original prop draws
still allocate the panels, preserving other vegetation and clutter. No extra panels or
terrain grading are introduced. Runs contain 3–10 panels, with access openings; doors,
connectors, walls and potential slope corners remain protected.

The reported city keeps all 29 panels in runs of 10, 10 and nine. The town keeps all 36
in runs of 10, 10, 10 and six. Their exact destinations are [city](city-runs.json) and
[town](town-runs.json). The unrelated waterfront fragments disappear; the extra city
views show a retained run marking the rear of an existing building plot.

## Frames

Models and preview units on; slopes 100%; level **all**; pointer at (0,0). Native crops
are neither enlarged nor retouched. Each pair uses the same recipe, viewport and camera.
[Cases](cases.json) and adjacent JSON sidecars record exact URLs, framing and crop.

| Case | Before | After |
|---|---|---|
| Reported city, focus (51,1,31), 55 px/tile | [C1](before/C1-city-fences.png) | [C1](after/C1-city-fences.png) |
| Same, one E turn | [C2](before/C2-city-fences.png) | [C2](after/C2-city-fences.png) |
| Town corroboration, `mc-resume-02`, initial near camera | [town](before/town-corroboration.png) | [town](after/town-corroboration.png) |
| Retained city plot boundary, focus (24,1,27), 45 px/tile, one turn | [plot](before/city-plot-run-1.png) | [plot](after/city-plot-run-1.png) |
| Same, two turns | [plot](before/city-plot-run-2.png) | [plot](after/city-plot-run-2.png) |
| Accepted #917 rural trail run | [control](before/rural-trail-control.png) | [control](after/rural-trail-control.png) |
| Accepted #917 rural garden/plot run | [control](before/rural-plot-control.png) | [control](after/rural-plot-control.png) |
| Accepted #915 paved and railed waterfront | [control](before/waterfront-control.png) | [control](after/waterfront-control.png) |

Both rural control PNGs are byte-identical before/after. The waterfront's timber fragments
change, so its whole frame is not identical; the pavement, quay, rails, planting and crates
remain. Urban hooks run after the fence placement and may move; changed green objective
markers in the town/plot views are the actual generated hooks.

## Population and tactical cost

The independently executed [before](survey-before.jsonl) and [after](survey-after.jsonl)
sweeps cover four biomes × three settlement scales × three sizes × `mc-opening-01/02/03`
(108 maps per phase). The reported town's `mc-resume-02` is additional case evidence.
The [comparison](survey-comparison.json) verifies:

- All 108 terrain/road, building and non-fence-prop hashes match.
- All 36 complete rural-map hashes match, including hooks and cover metrics.
- Urban singletons fall from **2,454 to zero**; urban panels **2,496 → 2,494**.
  The two omitted panels are in desert towns where a supported run cannot use them.
- All retained panels form supported 3–10-panel runs; none is on a slope.

| Urban scale (36 maps) | Panels before → after | Mean cover adjacency before → after |
|---|---:|---:|
| Town | 1,351 → 1,349 | 14.05% → 13.23% |
| City | 1,145 → 1,145 | 11.50% → 10.90% |

**The cover distribution cost is real:** about 0.82 percentage points in towns and 0.60
in cities. Grouped panels cover fewer separate approaches despite almost equal counts.
The panels retain their existing LOW-cover rules and model. Reachable-neighbour counts
in the detailed table are a local access proxy, not a claim of equal firefight outcomes.
The Director and Critic should judge the resulting boundaries and this tradeoff together.

## Validation and reproduction

Four new urban assertions fail on the original guard and pass with the extension. The
existing rural and protected-access assertions remain. Five urban ASCII goldens change;
the rural golden stays `1604470458`. Typecheck/lint/build, **2,267 unit tests**, the
**1,200-map wide sweep** (zero relocations), seven simulation checks and **62 browser
tests** pass (31 optional captures skipped, zero flaky). The first browser run caught a
fixture assumption: the relocated preview rifle projected 263 pixels offscreen after
rotation. Two real wheel zoom steps frame it; the existing picking assertions are
retained and pass. No camera or picker production code changes.

```sh
SURVEY_SOURCE_ROOT=/absolute/path/to/baseline node tools/mapgen/survey-urban-fences.mjs before.jsonl
node tools/mapgen/survey-urban-fences.mjs after.jsonl  # repair checkout
node tools/mapgen/compare-urban-fence-surveys.mjs before.jsonl after.jsonl comparison.json
CAPTURE_BASE_URL=http://127.0.0.1:5178 node tools/mapgen/capture-urban-fences.mjs before
CAPTURE_BASE_URL=http://127.0.0.1:5177 node tools/mapgen/capture-urban-fences.mjs after
```

The capture tool only exposes the existing rig to set the recorded camera; generation,
models and scene are real. Readiness waits for models/preview after DOM content loads.
Baseline destination views were captured from an isolated `9d9ea01` checkout.
