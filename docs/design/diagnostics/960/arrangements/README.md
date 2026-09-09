# #960 — remaining outdoor arrangements (in progress)

Cause posted before implementation: [5594641226](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594641226). Art's accepted frontage-kit records remain untouched in the parent directory. This folder is the subsequent generation comparison.

Baseline runtime **8d20dd4**, 2026-09-09, includes the accepted #1006 fence arrangement. Generation checkpoint **5d7c691**. Art is supplying the confirmed 0.90 X × 0.36 Z × 0.45 Y outdoor bench. The current graphics table mapping is an explicit development placeholder; there is no final after-picture or merge request yet.

The six before PNGs are dated acceptance records, not asserted image baselines. All were opened and every PNG repeated byte-for-byte in a second browser. `before/captures.json` contains exact runtime, recipe, camera, actual pitch, native crop and hash. The first source capture received a Vite tsconfig-cache notification while another local command ran; the complete independent-browser repeat subsequently established equality for every view. Preliminary incomplete 6a552d6 captures are excluded.

## Reported views and control

| View | Recipe/focus | Purpose |
| --- | --- | --- |
| I01 / I02 | temperate / city / medium, mc-resume-01, (43,2,39), initial / E | Reported intersection and its repeated generic yard objects. |
| I03 / I04 | temperate / city / medium, mc-opening-02, (23,1,34), initial / E | Second reported residential group; keep its actual use, height and access. |
| S01 | first city seed, (24,2,37), initial | Actual nearby shop, workplace and home. |
| C01 | temperate / rural / small, mc-opening-01, (23,4,13), initial | Known-good pitched roof, lane and contextual rural fences; unchanged generation. |

All use models + preview units, all layers, slope100%, 45 px/tile, 2400×1500 viewport and 1300×1050 native crop. Camera is set through the real rig. Capture: `node tools/mapgen/capture-yard-arrangements.mjs before` (or `after`), with `.git/mapgen-960` created. `FRONTAGE_ROOT` selects a pinned comparison checkout; the command runs from the repository root and writes this folder. The helper records its source HEAD and repeats each phase in two independent browsers.

## Placement factors and tradeoff

The original yard pass makes its original random draws, retaining a scratch set of yard IDs on the mutable draft. The new pass runs after contextual fences and before hooks/connectivity. It replaces only attributed urban yard crates/sandbags/barriers. Vegetation, fences and street/interior props retain their existing records; rural generation returns immediately. A separate `yard` eligibility keeps benches out of the old generic ground pool. No map schema, terrain paint/grade, roads, building type/height or frontage module changes.

One group per actual building: house one bench; apartment/tower two seats three tiles apart; shop two adjacent delivery crates; warehouse three storage crates. Groups align with a real footprint wall, within that building's existing lot. Seating favors the entrance face; storage favors a side/rear face. Every object has a same-height open apron, avoids natural-edge pieces, connector landings and the three-column-wide doorway approach, and uses only the old LOW-cover allocation. A missing fitting group is omitted; no objects are scattered to spend leftover capacity.

108 paired recipes cover four biomes × three settlement scales × three sizes × three seeds (mc-resume-01, mc-opening-02, mc-opening-03). `before-survey.json` / `after-survey.json` contain independent-runtime hashes and metrics; `paired-survey.json` contains placement deltas and preservation results. All108 terrain/surface/wall, building, road, connector and non-target-prop comparisons match. All36 rural complete maps match.

| Scale (36 maps each) | Targeted yard props → contextual props | Mean cover adjacency before → after | Cost |
| --- | --- | --- | --- |
| Town | 1,003 → 390 | 13.71% → 12.71% | −1.00 percentage point |
| City | 2,171 → 636 | 11.63% → 8.90% | −2.73 percentage points |
| Rural | Complete maps unchanged | 14.32% → 14.32% | none |

The two reported city recipes change59→19 and69→19 targeted props. These are intentionally modest groups, not cover-equivalent replacements. The removal reduces distributed cover. No equal battle outcomes are claimed. Survey command: `SURVEY_SOURCE_ROOT=<pinned checkout> node tools/mapgen/survey-yard-arrangements.mjs before` / `after`; raw maps/prop records are scratch output under `.git/mapgen-960`. A final gate and real integrated asset frames remain.

## Validation checkpoint

Typecheck and changed-file ESLint passed. Three full-pipeline arrangement tests plus34 supporting tests passed. Disabling the new pass makes both reported-city seating assertions fail. The strengthened five-test pair also verifies the actual front aprons are infantry-reachable from deployment. The existing216-map generation/playability matrix passed; its deliberate urban prop changes require five ASCII goldens to move, while rural remains1604470458. The pipeline-order expectation is updated for the new pass. Full suite, wide/simulation/browser gates and Director frame judgment are pending, not implied by these checkpoints.
