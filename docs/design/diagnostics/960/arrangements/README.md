# #960 — outdoor arrangements by building use

Cause posted before implementation: [5594641226](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594641226). Art's accepted frontage-kit records remain untouched in the parent directory. This folder is the subsequent generation comparison.

Baseline runtime **8d20dd4**, 2026-09-09, includes the accepted #1006 fence arrangement. Final generation/access runtime **f20701a**. Art’s actual `prop.bench` from PR #1060 is integrated: 0.90 X × 0.36 Z × 0.45 Y, seat height 0.23, authored +Z front, feet-plane pivot. It has 180 triangles and two material primitives, 14,932 bytes, and uses the existing atlas; no added texture. The real model replaces the development placeholder. All final after frames below use this runtime.

The six before PNGs are dated acceptance records, not asserted image baselines. All were opened and every PNG repeated byte-for-byte in a second browser. `before/captures.json` contains exact runtime, recipe, camera, actual pitch, native crop and hash. The first source capture received a Vite tsconfig-cache notification while another local command ran; the complete independent-browser repeat subsequently established equality for every view. Preliminary incomplete 6a552d6 captures are excluded.

## Reported views and control

| View | Recipe/focus | Purpose |
| --- | --- | --- |
| I01 / I02 | temperate / city / medium, mc-resume-01, (43,2,39), initial / E | Reported intersection and its repeated generic yard objects. |
| I03 / I04 | temperate / city / medium, mc-opening-02, (23,1,34), initial / E | Second reported residential group; keep its actual use, height and access. |
| S01 | first city seed, (24,2,37), initial | Actual nearby shop, workplace and home. |
| C01 | temperate / rural / small, mc-opening-01, (23,4,13), initial | Known-good pitched roof, lane and contextual rural fences; unchanged generation. |
| S02 | first city seed, (34,2,12), two E turns | Supplemental shop delivery yard, showing its two-crate group against the actual rear wall. |

All use models + preview units, all layers, slope 100%, 45 px/tile, 2400×1500 viewport and 1300×1050 native crop. Camera is set through the real rig. Capture: `node tools/mapgen/capture-yard-arrangements.mjs before` (or `after`), with `.git/mapgen-960` created. `FRONTAGE_ROOT` selects a pinned comparison checkout; the command runs from the repository root and writes this folder. The helper records its source HEAD and repeats each phase in two independent browsers.

All fourteen final PNGs were opened. All seven views repeat byte-identically in two independent browsers for each phase. The rural before/after PNG is itself byte-identical (SHA-256 `5ee845a569d00950133657bccd5b8e90dbcfe3a09cf3f364c9c2da641b029aa5`). S02 uses `CAPTURE_CASES=S02-shop-delivery-yard` and separate phases `before-delivery` / `after-delivery`, preserving the original six-view records. Each folder contains its own capture sidecar.

In I01/I02, a bench beside the house corner replaces anonymous yard clutter; the shared seating in I03 remains residential. I04 principally shows clutter removal and retained frontage/height/access. S01 retains the shop ladder and surrounding domestic/working entrances; S02 makes the actual delivery group visible. Some plots intentionally remain open when no safe group fits.

## Placement factors and tradeoff

The original yard pass makes its original random draws, retaining a scratch set of yard IDs on the mutable draft. The new pass runs after contextual fences and mission hooks, before connectivity. It replaces only attributed urban yard crates/sandbags/barriers. Vegetation, fences and street/interior props retain their existing records; rural generation returns immediately. A separate `yard` eligibility keeps benches out of the old generic ground pool. No map schema, terrain paint/grade, roads, building type/height or frontage module changes.

One group per actual building: house one bench; apartment/tower two seats two tiles apart; shop two adjacent delivery crates; warehouse three storage crates. Groups align with a real footprint wall, within that building's existing lot. Seating favors the entrance face, then a side face before the rear; storage favors the rear, then side faces before the frontage. Every object has a same-height open apron, avoids natural-edge pieces, connector landings, the three-column-wide doorway approach, deploy/extraction clearance and the recorded hatch radius. Objects back onto solid wall sections, keeping window firing positions clear. A local traversal check preserves short paths around the whole group for both infantry and mechs, including previously placed groups. The old LOW-cover allocation is a ceiling. A missing fitting group is omitted; no objects are scattered to spend leftover capacity.

108 paired recipes cover four biomes × three settlement scales × three sizes × three seeds (mc-resume-01, mc-opening-02, mc-opening-03). `before-survey.json` / `after-survey.json` contain independent-runtime hashes and metrics; `paired-survey.json` contains placement deltas and preservation results. All 108 hook, terrain/surface/wall, building, road, connector and non-target-prop comparisons match. All 36 rural complete maps match. Re-generating the baseline with the arrangement pass omitted also matches the original `8d20dd4` complete hashes in 108/108 cases; adding the yard-only bench definition does not reroll baseline output.

| Scale (36 maps each) | Targeted yard props → contextual props | Mean cover adjacency before → after | Cost |
| --- | --- | --- | --- |
| Town | 1,003 → 325 | 13.71% → 12.65% | −1.06 percentage point |
| City | 2,171 → 529 | 11.63% → 8.74% | −2.89 percentage points |
| Rural | Complete maps unchanged | 14.32% → 14.32% | none |

The two reported city recipes change 59→13 and 69→19 targeted props. These are intentionally modest groups, not cover-equivalent replacements. The removal reduces distributed cover. No equal battle outcomes are claimed. Survey command: `SURVEY_SOURCE_ROOT=<pinned checkout> node tools/mapgen/survey-yard-arrangements.mjs before` / `after`; raw maps/prop records are scratch output under `.git/mapgen-960`. The compact phase records retain hashes/metrics; the pair file retains actual replacement coordinates and preservation checks. The final sweep is independently generated twice, not inferred from a static diff.

## Validation

The full unit suite passes **2,272 tests**, one optional wide skip, with two workers and unchanged timeouts. Typecheck (`tsc -b`), full ESLint, Prettier and production build pass. Three arrangement tests cover both reported seeds and the rural control, including real infantry access to each seating/loading apron. The hook records are identical to the same-seed baseline. Disabling the new pass makes both city seating assertions fail.

Two real development regressions were repaired before these final frames. Running arrangements before mission hooks changed the open-ground candidate pool and gave `reach-town/medium/0` a 14-turn first-shot approach against the unchanged ceiling 10. Running after hooks preserves those selections. Then the wider firing sweep exposed a bench isolating the only outdoor firing approach in `firing-town/small/8`; both its local route and exterior firing position are now protected. That recipe is explicitly tested even on CI, where the normal firing sweep stops at four seeds. In the isolated measurement, the affected mech approach was 52 steps before, unreachable in the rejected candidate, and 51 in the final map. No reachability assertion or turn limit was relaxed.

The 216-map terrain/playability matrix, determinism and six ASCII goldens pass as part of the full unit suite. Five urban goldens change deliberately; rural remains 1604470458. The standalone 1,200-map wide sweep passes with zero relocations (442.05 s, exit 0); all seven simulation checks pass (194.47 s, exit 0). The browser run reported 65 passed / 31 optional skips with zero retries, but its enclosing process exited 143 after that report; an independent standalone run is completing before submission. The earlier compound wide invocation likewise printed a complete pass before exit 143; the clean standalone result above supersedes it. No assertion, test timeout or turn limit was changed for those runs. Director judgment and the Critic’s integrated-main re-check remain pending.

## Integration on main `154f2c5`

PR #1075 integrates main `154f2c5` at runtime `6653941`; the only manual merge resolutions were current handoff text and the now-registered bench mapping. The yard pass itself is unchanged. `integration-survey.json` compares the original final maps against this runtime: 99 of 108 complete maps match. The nine differences are the coastal rural recipes after the intervening #1043 trail repair.

The decisive preservation comparison is separately regenerated on **main `154f2c5` versus integration `6653941`**, recorded in `integration-paired-survey.json`. All 108 hook/terrain/wall/building/road/connector/non-target-prop comparisons match; all 36 rural complete maps match. Town and city group counts and cover costs are exactly those in the table above. The earlier before/after record is not overwritten to follow this different main revision.

Current integration passes typecheck, full lint/format, build and **2,317 unit tests** (231.82 s, exit 0; one optional wide skip). All seven simulation checks pass (192.52 s, exit 0; one optional skip). The full browser suite passes across four serial shards: **67 passed / 37 optional skips, zero retries, all four exits 0** (14 / 23 / 14 / 16 tests). Shard 4 first returned 143 before completion; the isolated rerun passes in 2.7 minutes. The integrated wide invocation first failed its unchanged 600-second budget while software rendering ran alongside it (642.39 s wall, timeout only). After all Chromium processes closed, the unchanged **1,200-map test passes with zero relocations in 428.95 s, exit 0**. The failed/interrupted attempts remain in `validation.json`; no assertion or timeout was weakened.

**Subsequent integration:** #1042 merged at `6967394` after this record was verified. Its reservation and golden changes are integrated at `ecaebc4`; the following section records that separate comparison. The earlier frames and checks stay attributed to their original revisions.

The integrated reported views and control are all inspected, repeat in independent browsers, and match the original final PNG bytes exactly:

- `integrated-i01/`: I01 and I02, first city seed.
- `integrated-i03/`: I03 and I04, second city seed.
- `integrated-control/`: C01, identical to both original before and after.

Each folder has its own runtime/camera/hash sidecar. Reproduce with `CAPTURE_CASES=<comma-separated view ids> node tools/mapgen/capture-yard-arrangements.mjs <folder>`. These five integration frames supplement the fourteen original comparison frames; the shop/delivery comparisons remain attributed to the original runtimes. `validation.json` records commands, results and the disclosed interrupted attempts.

The Map Critic opened all fourteen original comparison frames and verified their hashes, then judged the picture improved in [review 5595683809](https://github.com/BenjaminBenetti/tut/pull/1075#issuecomment-5595683809). The judgment explicitly applies to the pinned author comparison, and does not certify the measured cover tradeoff or replace the eventual merged-main re-check. Director judgment remains pending.

## Integration after dropship placement, main `6967394`

Runtime `ecaebc4` retains the accepted dropship reservations alongside the yard
provenance. The shared open-ground query excludes the landing clearance, so the
new arrangements use the same restriction as the existing placement passes. No
yard placement factor changed during the merge. All six combined ASCII goldens
were measured from the new runtime; the rural golden remains main's 2656216980.

`dropship-paired-survey.json` records a fresh 108-recipe comparison against main
`6967394`. The baseline checkout is `f44063a` from the four-arrival-frame docs
follow-up; its runtime source and assets are identical to `6967394`. Every
hook, dropship record, terrain/surface/wall, building, road, connector and
non-target prop matches between these two runs. All 36 rural complete maps
match. These measurements supersede the earlier numbers for this combination
without replacing the dated earlier record.

| Scale (36 maps each) | Targeted yard props → contextual props | Mean cover adjacency before → after | Cost |
| --- | --- | --- | --- |
| Town | 999 → 359 | 13.51% → 12.46% | −1.05 percentage points |
| City | 2,101 → 523 | 11.26% → 8.42% | −2.85 percentage points |
| Rural | Complete maps unchanged | 14.02% → 14.02% | none |

The two reported city recipes now change 61→15 and 64→19 targeted props. These
remain fewer, contextual LOW-cover objects, with the distributed-cover cost
disclosed. Landing records themselves are unchanged in all 108 paired cases.

Typecheck (`tsc -b`), full ESLint/Prettier, production build and **2,348 unit
tests** pass on this combination (125.95 s, exit 0; one optional wide skip).
The 1,200-map wide sweep passes with zero relocations (430.01 s, exit 0).
The simulation/browser gates and fresh paired frames remain incomplete. The
capture batch was stopped for routed p1 #1089, the author-owned scout fixture
regression now in draft #1095. Its incomplete PNGs remain scratch; no new
comparison image is represented as verified. Resume this combination after
that bounded repair, respecting the 2026-09-09 06:00 UTC studio pause.
