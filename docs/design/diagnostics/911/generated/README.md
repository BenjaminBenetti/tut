# #911 — generated dropship landings

Baseline: `main@9d9ea01` (v0.2.15, with Art's accepted aircraft already registered).
Placement runtime: `a793060`; tactical arrival-camera correction: `2eaab51`. The actual model is unchanged: SHA-256
`2034ded38848cd27e4d0872657bf8db9180314d29b95f00faa824bf89a60e238`.
Director frame judgment and the Map Critic's generated-placement re-check are pending.

## Cause and placement decision

[Cause posted before implementation](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5592752738):
the old deploy placer chose sixteen late, potentially sloping ground tiles. There was no earlier
aircraft reservation and no scene consumer of a supported aircraft position. The accepted model
was sufficient; placing it at the old zone's centroid would not establish support or clearance.

The generator now reserves the complete 5×7 aircraft, including its lowered ramp, before lots
and incidental props. Sixteen external 4×4 boarding tiles meet the ramp. One-column side/front
margins and an extra inward approach row make the clearance 7×13. The approach may meet a road;
the hull and boarding tiles may not. Nose faces the selected outer edge; ramp faces inward.
Deploy and extraction still use the same hook. The renderer consumes the optional recorded site;
old maps without that record stay as they were.

The hull's 35 ground tiles are impassable and opaque under the existing tile sight convention.
There is no cover bonus, aircraft damage, boarding animation or new extraction rule. This is a
conservative full-envelope obstacle, including the ramp, with unit starts outside it.

Searches retain already-fitting placements: inset up to four, then eight, then twelve columns,
with at most one layer excavated per column. Only after all three fail can a twelve-column
search excavate two layers (1.5 world units). Each search prefers an ungraded candidate, then
the least excavation. No column is raised; cuts cannot alter roads and retain one-layer joins.
[The measured reason for the last fallback](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5593195381)
is four narrow snowy towns that still had no fit at a sixteen-column inset with one-layer cuts.

The outer margin keeps natural slope pieces; flattening their visual shapes would expose bare
steps. Existing half-height quay/kerb walls may bound the outside perimeter, but cannot cross
the reservation. Final validation checks actual support, walls, props, connectors, pass/sight
masks and sixteen distinct boarding tiles after all downstream passes.

## Frames to judge

Every pair uses the same recipe, camera state, viewport and native crop. These show the same
**location** before/after; the former deployment may be elsewhere. Models and preview units are
on, slopes 100%, level **all**, pointer at (0,0). Nothing is painted over or enlarged.
Full recipes/focus/crop live in [cases.json](cases.json); adjacent JSON files record each capture.

| Case | Before | After | What this checks |
|---|---|---|---|
| Temperate rural, small, `mc-resume-01` | [rear](before/rural.png) | [rear](after/rural.png) | Existing flat ground, external boarding and the retained trail boundary |
| Same, opposite side | [nose](before/rural-opposite.png) | [nose](after/rural-opposite.png) | Nose foot, full envelope and sample squad/mech scale |
| Snowy town, small, `mc-resume-01` | [rear](before/town-cut.png) | [rear](after/town-cut.png) | Four one-layer cut columns; lot reservation and street clearance |
| Same, opposite side | [nose](before/town-cut-opposite.png) | [nose](after/town-cut-opposite.png) | Ground contact and surrounding terrain join |
| Coastal city, medium, `mc-opening-03` | [rear](before/city.png) | [rear](after/city.png) | Ungraded city landing, retained carriageway and pavement |
| Same, opposite side | [nose](before/city-opposite.png) | [nose](after/city-opposite.png) | Full aircraft and circulation margin |
| Snowy town, small, `mc-resume-03` | [inset fallback](before/inset.png) | [inset fallback](after/inset.png) | Twelve-column inset, ten one-layer cuts |
| Narrow snowy town, 40×56, `wide-{"width":40,"depth":56}/snowy/town/10` | [rear](before/narrow-cut.png) | [rear](after/narrow-cut.png) | Hardest pictured fallback: 62 cut columns, 77 layer-columns removed, maximum two layers |
| Same, opposite side | [nose](before/narrow-cut-opposite.png) | [nose](after/narrow-cut-opposite.png) | Foot support and cut continuity from the other side |
| Accepted #915 waterfront, focus (51,1,40) | [control](before/waterfront-control.png) | [control](after/waterfront-control.png) | The carriageway still ends at its paved, railed quay |

The waterfront's incidental props change after the earlier reservation changes available prop
positions; this is **not** a byte-identical whole-scene control. Its road paint, pavement widths,
quay and rails remain. The still-isolated urban fence is queued separately as #1006.

The real campaign is also captured, with its actual fog and full starter deployment:
[arrival](mission/arrival.png), [opposite side](mission/arrival-opposite.png),
[recipe, boarding/extraction and unit positions](mission/arrival.json). These are generated by
launching campaign seed `4242` through the real UI, not by an Art fixture or a supplied save.
The browser test verifies that both squads and the mech occupy external boarding tiles, the
accepted aircraft GLB loaded, and extraction equals the boarding hook.

## Frequency and tactical cost

The [paired 108-map comparison](survey-comparison.json) covers four biomes × three settlement
scales × three presets × `mc-resume-01/02/03`. Full measurements:
[before](survey-before.json), [after](survey-after.json).

- 108/108 supported aircraft; 98/108 need no grading. Ten maps excavate 154 columns total,
  maximum one layer per column; zero raised columns. 107 sites are within four columns of their
  selected edge, one within twelve. No support, reachability or hatch-room failures.
- All 108 road-pass, final road-segment and road-paint hashes match. The reservation runs after
  roads and does not change their RNG stream. Later lots and props do change.
- The broader **1,200-map sweep passes, zero hook relocations** (397.9 seconds locally).
  Its eight initial no-fit recipes and the additional resume failure are retained in
  [fallback-recipes.json](fallback-recipes.json) and [their final measurements](fallback-survey.json).
  All nine now pass; four require the two-layer limit. No failing recipe was excluded.

| Settlement (36 maps each) | Buildings before → after | Props before → after | Mean cover adjacency before → after |
|---|---:|---:|---:|
| Rural | 96 → 96 | 13,900 → 13,686 | 14.94% → 14.75% |
| Town | 377 → 371 | 17,246 → 17,090 | 15.17% → 14.87% |
| City | 507 → 488 | 16,409 → 15,666 | 12.73% → 12.29% |

Those are real space/cover costs, not an unchanged-map claim. The site makes a cleared arrival
place and removes possible building/prop placements. A new boarding origin also exposed one
pre-existing cramped-indoor egg-spawner preference: roomy shootable outdoor ground now ranks
ahead of that fallback. The exact regression fails with the old order (five hatch tiles when
six are required), and passes with the repair. No hatch-room threshold was relaxed.

## Rendering cost and repeatability

The accepted GLB has 1,908 triangles, eight material primitives and a 141,328-byte payload.
The isolated on/off measurement hides only those eight parts in the same live scene, measures
a draw, then restores them and draws again before the PNG. In the narrow-town view this adds
**16 calls and 3,816 rendered triangles** including the shadow pass, plus one loaded texture.
Whole-frame totals also reflect relocated units entering the crop and changed lots/props;
they must not be attributed wholly to the aircraft. The per-frame counters and isolation
measurements are in the JSON sidecars. Software RAF/gl.finish timings are not hardware FPS.

Typecheck, lint, build, all 2,295 unit tests and the 216-map terrain/playability matrix pass.
The unit run uses four workers with unchanged assertions and time limits: the earlier concurrent
run timed out one slope matrix at 20.5 seconds; the final four-worker run passes in 101.7 seconds.
Seven mission-simulation checks pass; this is not a claim of identical before/after outcomes.

The browser sweep initially caught two fixture assumptions. The relocated preview swarmer was
eight pixels outside its fixed viewport after rotation, so the test now uses the real zoom
wheel and retains every on-screen assertion. The real mission test's half-pitch click went
through the mech's leg gap, so it now targets the visible torso. Both corrected tests pass;
there is no picking implementation change. Disabling `TacticalSceneBuilder.pickUnit` only in
the probe browser makes the corrected real-click test fail its selected-unit assertion, as
required. This is an observed mutation failure, not a control assumed to work.

The complete browser rerun passes **63 tests, zero flaky**. All ten independent Map Lab after
captures repeat byte-identically; [hashes and method](repeatability.json). No tolerance or
historical-frame refresh is involved.

### Arrival orientation and actual campaign control

Two extra default-angle checks ([south](orientation/arrival-s.png),
[east](orientation/arrival-e.png)) exposed a gap in the original north/west-facing gallery:
the aircraft can hide the rifle squad from yaw 0. Ground/support validation cannot catch that.
The tactical host now opens S/E landings at yaw 2, viewed from the boarding side, when every
living TDF unit is still on that site's boarding tiles. No turn occurs during player input.
N/W landings, old maps without a recorded site, and forces that have left boarding keep yaw 0.
Map Lab retains its common inspection orientation; no squad cutaway setting changes.

The additional real campaign `9` has a south-facing landing at Perth, coastal/town/small,
map seed `3677615265`. [Old yaw-0 view](mission-s/arrival-opposite.png) and
[actual corrected arrival](mission-s/arrival.png) show the same generated map with real fog,
launched through the UI. This pair isolates **camera orientation**, not generation against
main: the former view is obtained with two synchronous E taps after recording the actual
host-created opening camera. Two more taps reproduce the opening PNG byte-identically.
[Metadata](mission-s/arrival.json) records yaw, recipe, site and the deployed force.
The normal browser test asserts the host-created yaw before rotating. In a separate probe,
replacing only `yawIndex: missionArrivalYaw(mission)` with `yawIndex: 0` in the served
`tactical-scene-host.ts` makes that exact seed-9 assertion fail: expected 2, received 0.
The temporary mutation spec is removed; no sabotage switch exists in production.

The existing west-facing campaign `4242` remains the control. Both its arrival PNGs match the
pre-camera checkpoint `a8caeb6` byte-for-byte; the camera repair did not repaint that control.
These four campaign frames, twenty location-pair frames and two additional orientation
checks make **26 committed frames**. They are dated evidence, not a claim of Director acceptance.

The capture helper now resolves an event dialog if it appears on the same day as the first
mission; a seed-2 probe identified the modal intercepting the mission click. This uses the
existing first-choice policy. The first three-shutter control run exceeded the ordinary
60-second budget at its final screenshot; optional `CAPTURE=1` has a 120-second budget,
while the regular integration tests keep the suite's existing timeout and all assertions.

## Reproduce

```sh
# Start baseline 9d9ea01 on one Vite port and this branch on another.
CAPTURE_BASE_URL=http://127.0.0.1:5178 node tools/mapgen/capture-dropship-sites.mjs before
CAPTURE_BASE_URL=http://127.0.0.1:5177 node tools/mapgen/capture-dropship-sites.mjs after
CAPTURE=1 pnpm exec playwright test e2e/dropship-site.spec.ts --workers=1

SURVEY_SOURCE_ROOT=/absolute/path/to/baseline node tools/mapgen/survey-dropship-sites.mjs baseline.json
node tools/mapgen/survey-dropship-sites.mjs after.json
node tools/mapgen/compare-dropship-surveys.mjs baseline.json after.json comparison.json
SURVEY_RECIPES=docs/design/diagnostics/911/generated/fallback-recipes.json node tools/mapgen/survey-dropship-sites.mjs fallbacks.json
MAPGEN_WIDE=1 pnpm exec vitest run src/mapgen/service/generation-wide-sweep.test.ts
```

The capture tool exposes the existing camera/renderer for framing and counters. For the 40×56
regression only, it supplies those dimensions to Map Lab's real recipe construction because the
UI offers presets. It changes no generation pass, generated tile or scene result. That case's
preset URL alone is insufficient; use the tool and committed case. Other cases use unmodified
Map Lab URLs. Readiness waits for actual models/preview; camera taps use the real rig, with fixed
focus/rotation/pixel pitch. The first custom-input capture exposed a whitespace-sensitive capture
marker, which now accepts the served module's formatting. A navigation timeout was repaired at
the harness by waiting for DOM content plus the existing model/preview readiness markers; no
production logic or assertion changed to make a shutter fire.
