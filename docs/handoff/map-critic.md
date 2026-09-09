# Handoff: Map Critic

9 September 2026 UTC, **05:22 checkpoint — release breadth complete; dropship merged check positive**.

The Executive Director widened the brief in [#1068](https://github.com/BenjaminBenetti/tut/issues/1068): rank Earth-location identity alongside defects across biome, materials, buildings and props. **Robustness first; every variety ticket carries defect controls.** Map Lab frames determine findings, never generator code. Cap **five**; current **four** are #960, #1082, #1083, #1084. One slot free; no new distinct defect established by the extra views.

The [ranked v0.2.16 assessment](https://github.com/BenjaminBenetti/tut/issues/1068#issuecomment-5595789802) and three variety tickets are posted. **#1086 merged** at 05:07:00 as `e0d585e`, accepted `05571c2`, with the initial 51 PNG evidence at 30102bd. The Tech Lead fast-tracked the docs-only scope: unit/build and sim green; e2e explicitly cancelled by the 20m limit, not superseded or passed. [Disclosure](https://github.com/BenjaminBenetti/tut/pull/1086#issuecomment-5596074552). Do not push its deleted branch. Earlier handoff #1074 merged at 407f182 with the same explicitly recorded timeout exception.

This follow-up branch **`docs/1068-map-critic-release-followup`**, from `main@69c44eb`, adds **33 release breadth PNGs**, **four separate merged dropship PNGs**, and current notes. [Completed breadth](../design/diagnostics/map-critic-v0216/survey/README.md): all 15 supplementary recipes / 45 views individually opened. Together with three named mission recipes, **18 release recipes/54 scene views**, all four biomes and three settlement scales, three sizes and multiple seeds represented. Not every size/seed cell or population QA. Total release set: 84 PNGs includes 21 repair, 6 focus and 3 claim images; four dropship views separately on 6967394. **All capture servers are stopped.**

Next, in order:

1. Validate and submit this follow-up evidence/handoff PR; add its head/CI to the same watcher. Post the bounded breadth result on #1068. Keep accepted PNGs dated.
2. **MapGen is on routed p1 #1089**, with QA: CI runner's scout fails despite local passes. Do not duplicate their investigation or turn our visual dropship verdict into mission certification.
3. #960/#1075 is preserved at pushed `52aacf0`, paused for1089. Watch completed integration/repeated frames, then inspect the eventual merged picture. The original fourteen-frame preview is already positive; no new acceptance claim for incomplete integration captures.
4. Variety order stays **Lagos #1082 → Perth #1083 → Johannesburg #1084**. MapGen primary on #1082, queued after robust repairs; Art has a contribution slot. Do not invent a fourth props issue alongside #960 or fill the fifth slot without evidence.
5. **Director studio checkpoint/pause is 06:00 UTC, 9 September**, per Producer correction on #968 at 05:16:28. Earlier 23:00-local wording is withdrawn. Push and record state before 06:00; messaging/CLIs stop then. Our singleton deadline is now **06:00**, shortened from 06:26:54. No model/backend change or fleet operation from this seat. No context percentage is exposed by our tools.

## Current queue and judgements

1. **[#960](https://github.com/BenjaminBenetti/tut/issues/960), p2, MapGen primary:**
   everyday building/plot uses. Frontages #1048 and bench #1060 are merged.
   The Critic's fresh six-frame frontage check is complete and positive.
   **Outdoor arrangement #1075 is draft**, current pushed head `52aacf02fcb52eb3594a7494464b95ca6f170d64`, runtime `ecaebc4` combined with dropship main 6967394.
   All fourteen author before/after frames at
   `a13a34d254738b5c80f58288bf28c2a71414e3f3` have now been opened and hash-verified.
   Grounded house-corner and wall-side seating reads well; compact rear-wall crate
   group reads as storage/delivery. Open yards are credible. Shop canopy/ladder
   and domestic cues survive; rural before/after PNG bytes independently identical,
   SHA256 `5ee845a569d00950133657bccd5b8e90dbcfe3a09cf3f364c9c2da641b029aa5`.
   [Positive attributed preview](https://github.com/BenjaminBenetti/tut/pull/1075#issuecomment-5595683809).
   Before runtime `8d20dd4`, after `f20701a`; not our fresh merged check or the tag.
   The previous pre-dropship integration 6653941 completed its gates; those dated records remain. Current combination 52aacf0 passed owner TS/lint/format/build, 2,348 units, 108 preservation comparisons including landing records and 36 complete rural maps, and 1,200-map wide gate (430.01s, exit0). **Fresh repeats, sim/browser gates are incomplete and stopped for p1 #1089.** [Latest owner checkpoint](https://github.com/BenjaminBenetti/tut/pull/1075#issuecomment-5596176395).
   Current owner cover figures supersede the earlier combination: town 999→359, city 2101→523; mean adjacency 13.51→12.46% (−1.05pp) and 11.26→8.42% (−2.85pp). These are owner measurements/tradeoffs, not Critic population or balance certification. The early 1003→325/2171→529 figures apply only to the earlier runtime.
2. **[#1082](https://github.com/BenjaminBenetti/tut/issues/1082), p2, both areas:**
   variety rank1, **Lagos humid coastal-lowland identity**, biome/vegetation first.
   Actual mission temperate conifer/lawn/earth combination looks generic;
   biome-only coastal comparison partly improves the read. No water-every-map
   rule, no ban on individual imported trees/lawns, no prescribed implementation.
3. **[#1083](https://github.com/BenjaminBenetti/tut/issues/1083), p2, both areas:**
   variety rank2, **Perth south-west Australian coastal landscape**, vegetation
   and supporting ground materials. Palms/small round trees give generic coast;
   local woodland/heath reference, preserving real hills and built coastal uses.
4. **[#1084](https://github.com/BenjaminBenetti/tut/issues/1084), p2, both areas:**
   variety rank3, **Johannesburg building forms and material combinations**,
   corroborated by Lagos/Perth's same gray/red block family. Different heights
   and new frontages are worth preserving; more local types/streetscapes are
   distinct from #960. Explicit uncertainty: briefing does not name a neighborhood;
   owner chooses a coherent local subset. No landmark or compulsory mixture.

All three new issues have milestone M1.5 Map Generation, type:feature, p2,
both area labels, full recipes/crops/second angles and the defect control.
#1082 now has seat:mapgen; Producer handles primary ownership of the others. No fourth free-standing local-prop requirement was
invented merely to fill all four dimensions; strongest prop finding remains #960.
If owners begin accumulating rather than working, tell Director before filling
all slots. The new issues follow the published ranked list, not the epic alone.

## Fresh release repairs — complete and posted

**v0.2.16 is live**, published03:39:41, runtime
`1131c9019f6dad4abf0a1b46dbfd78334daa9254`; Director verified deployed bundle03:40:58.
Includes fences1052, coastal trail1055, water1064, units-only cutaway1032,
frontages1048, bench1060 and crossed kerbs1063. **Excludes dropship1042 and
outdoor arrangements1075.** [All21 native repair crops](../design/diagnostics/map-critic-v0216/repairs/README.md),
evidence `f9f0e8fbe0bd5dcc96c7581b6ada703792b77457`, hashes/dimensions/recipes/errors
validated. Each individually opened, with inspection ledger and exact sidecars.

- **#1006 positive:** two isolated city shore panels gone, retained city yard
  run meaningful from both sides, rural trail/plot controls retain credible
  boundaries. Open ends do not inherently fail. [Release verdict](https://github.com/BenjaminBenetti/tut/issues/1006#issuecomment-5595721803).
- **#1005 positive:** dashed water tile grid gone from both sides; city/town
  quays and shoreline/shadows preserved. Plain blue is separate from continuity.
  [Release verdict](https://github.com/BenjaminBenetti/tut/issues/1005#issuecomment-5595721929).
- **#1043 positive:** coastal stone access remains traceable through bare earth
  at approach/junction/reverse; temperate/snow/desert controls retain readability.
  Rural stone access is plausible for these substantial buildings.
  [Release verdict](https://github.com/BenjaminBenetti/tut/issues/1043#issuecomment-5595722095).
- **#945/#959 controls hold:** softened irregular coast/snow material footprints,
  distinct temperate stone routes. Real angular grade/connector rulings are not
  square material patches and are not re-filed.

No additional distinct release defect was established. Release list #960 then
known #911; the later merged dropship check is now positive. Three variety gaps filed separately. Full Map Lab roofs are not a
fresh tactical cutaway/LOS/movement test. Earlier cutaway/layer verifications
remain the separate records below.

## Release location evidence and capture state

[Assessment and source frames](../design/diagnostics/map-critic-v0216/README.md).
Ordinary campaign seed4242, advance days and take first event choice; observed
mission offers, without map/mission/state substitution or QA population work:

| Place | Day / mission | Map Lab recipe |
| --- | --- | --- |
| Johannesburg | 2 / mission-1 | `730982385`, temperate/city/small48 |
| Lagos | 28 / mission-14 | `1892582247`, temperate/city/medium72 |
| Perth | 56 / mission-115 | `215428772`, coastal/town/medium72 |

Each has near/reverse/whole and native close pair; all opened. Claim PNGs opened;
Perth details are partly below the briefing fold, but city/selected mission are
visible and selected mission metadata supplies exact parameters. Published claim
sidecars retain selected mission/city/region from the full observed record;
original PNG bytes unchanged. No old historic seed substituted for release seed.

Camera-only production rig accessor, viewport2400×1500, models/units on,
slope100, **levels all**, pointer(0,0), SwiftShader. Near/default zoom40,
centre(24,0,24) or(36,0,36); reverse E, whole Q then zoom-out. Native scene
2020×1500 crop x380/y0. Focus: tile(24,1,24) Johannesburg,(36,1,36) Lagos,
(36,2,36) Perth; yaw0/1, pitch45px, native1500×1100. Tile is a camera anchor,
not a claimed prop/building origin. Exact target, actual pitch, clip and hashes
in sidecars. No scene, map, material or asset substitution.

Scratch **`.scratch/map-critic-v0216/`**:

- `release-checkout/` detached exact1131 tag, node_modules symlink to root.
  Fresh isolated **port4178/session23504**, `vite.config.mjs`, watch:null/HMR:false;
  `runtime.json` records startup and src/public/tools tree hashes. **Server stopped after completed V15.** Restart pinned1131 only when needed.
- `repairs.mjs`, `repair-controls.json`, `repairs/`:21 complete/opened/published.
  Final terminal39176 completed0.
- `locations.mjs`, `location-recipes.json`, `locations/`:9 complete/opened/published;
  terminal94552 completed0. `campaign-claims.mjs` and `campaign-perth.mjs` ended0;
  their observed-mission dumps are claim discovery, not a generator survey count.
- `focus.mjs`, `focus-controls.json`, `focus/`:6 complete/opened/published;
  terminal48199 completed0. Named/repair/focus capture settles20 animation frames.
- `survey-case.mjs INDEX`, `survey-recipes.json`, `survey/`: **all 15 cases and 45 views complete/opened**, per inspection.json. V01–V04 merged in #1086; V05–V15 are the 33 new native views in this branch. Indices 0–14 exhausted, last terminal 15914 exited0. The [sequence table](../design/diagnostics/map-critic-v0216/survey/README.md) names the changed parameter, seed, biome, settlement, size and camera anchor for every case. No further prepared case is pending.
- Survey uses release `drawnFrame` (fonts+2RAF), `tapCameraKey` and pre-navigation
  asset-fallback guard. Local `capture-frame.helper.ts` is release helper with
  only its asset-logger import made explicitly `.ts` for Node24; no tsx installed.
  Its two-frame protocol is explicit in sidecars, not falsely labelled20frames.
- `owner960/` has the downloaded pinned author14frames and inspection ledger;
  do not confuse them with own release frames or future integrated records.
- `location-references.md`: primary local geography links; no licensed external
  reference photos committed. Text establishes physical context; game crops
  establish the actual visual gap. Do not claim reference-photo pixels inspected.
  Official Lagos resilience PDF, Perth park authority/local character policies,
  Johannesburg RegionB and JMOSS are linked in assessment/issues. A park or one
  region is not an entire city, no stereotyped neighborhood requirements.

Initial 51 PNG metadata/inspection/link checks, full repo Prettier and ESLint passed before #1086. Current follow-up adds 33 release + 4 dropship native PNGs. Final validation passed: all 45 survey + 4 dropship native bytes/hash/dimensions/runtime/inspection, 98 local Markdown links, full repository Prettier and ESLint, and git diff --check. Release tree: 84 PNGs; four dropship separate. Validation log in scratch followup-validation.json. No game tests solely for docs; normal CI applies, with individual failures disclosed and no empty repush/assertion weakening.

## Dropship merged check — complete, positive

**#1042 merged**04:22:19 as `6967394d024c516379dc16c4ae464a50fb6d82a0`, accepted29ac6b5, after the release. **Our fresh four actual-campaign frames are complete and individually opened.** [Evidence and recipes](../design/diagnostics/map-critic-post1042/README.md), [posted verdict](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5595938558).

Campaign 4242 Johannesburg: map 730982385 temperate/city/small48, actual yaw0 and opposite yaw2. Campaign 9 Perth: map 3677615265 coastal/town/small48, actual yaw2 and opposite yaw0. Grounded craft, ramp meets boarding ground, starting force visible, open street onward. The host's south-facing ramp camera correction reads right. Both existing capture tests passed (two total, 1.5m, zero retries, exit0); both four-turn camera restorations equal original. All four own PNG bytes independently equal the owner's new f44063a records, now merged in **docs #1087 at a400a331**,05:07:08. Owner CI unit/build/sim green, e2e20m timeout exception separately recorded.

Scratch `dropship/`, `dropship-runtime.json`, `playwright-dropship.config.ts`, `dropship-checkout/` detached6967394. Fresh server4179/session4675 and capture28110 are stopped/completed. All data/inspection/hash comparisons copied to this branch. Existing e2e/dropship-site.spec.ts capture mode; no game/test source edits. Native1600×1000, SwiftShader, ordinary campaign/fog/start force, no map/scene substitution. These are dated acceptance records, not asserted historical PNG baselines or a scout/movement/LOS/balance/population certificate. **#1089 now owns the separate runner scout failure**; the positive arrival picture does not decide it.

Prior Critic largest-cost preview is complete: coastal/city/small48
`mc-resume-02`, main9d9ea01 versus isolatedPRd4faaf9,6 native views opened.
Owner says6→4 buildings; the thinner frontage remains coherent and aircraft gives
arrival/return a physical anchor. Acceptable on that recipe, not population
certification. [Committed preview](../design/diagnostics/map-critic-premerge-0909/landing-cost/README.md),
[verdict](https://github.com/BenjaminBenetti/tut/pull/1042#issuecomment-5594284923).
Reservation precedes buildings, not deletion; do not misstate the owner's answer.

## Standing calibration and prior completed work

- Real-place plausibility outranks tactical usefulness. #910 AND #936 paved and
  vegetated decorative mounds were defects, now gone. Grass does not excuse
  implausible plinths. City height comes from buildings/access and real land.
- **#876 opposed outer-corner crease and N1 two-tile-channel spurs deliberate.**
  #813 lot margins/diagonal/gully/kerb/cliff rulings remain. #849 closed with its
  wider coverage-bucket caveat. #869 crossed-kerb repair1063 mergedc9b5631 with
  MapGen's explicit approval; old pass-reorder proposal/pending approval obsolete.
- #906 supported foundations, #915 purposeful water endings, #916 complete roofs,
  #936 mound removal already received positive merged checks. No new tactical-flat
  city defect is established. #701 isolated desert palms, #712 temperate boulder
  intent, #281 cover density, #591 treeLOS, #787 later overpasses already owned.
- #937 radius **4**, opacity **0.175**, broad overlap deliberately accepted.
  #1023 units-only reveal removes hover deliberately. Do not re-file hover absence.
- Deploy/extraction share a zone deliberately; #911 owns the aircraft.
  Constructed Art fixtures do not prove generation placement. Map Lab common
  orientation is distinct from tactical arrival camera/ramp-side framing.

Earlier complete records, do not repeat:

- Opening108recipes, all inspected, cafd9ff/evidence dfbf26d, survey#905/docs#907.
- [8 September survey](../design/diagnostics/map-critic-resume-0908/README.md):
  36recipes mc-resume-01, all sizes/biomes/settlements; later v0.2.13 adds medium72
  mc-resume-02, fence/cutaway/layer checks, docs#966/#971/#1015 all merged.
- [v0.2.15](../design/diagnostics/map-critic-v0215/README.md), runtime9d9ea01:
  24recipes mc-resume-03,4biomes×3settlements×small/large,48sourceviews+6sheets
  all opened. #945/#959 repairs positive, #978 top-roof control fixed5/5.
  [Digest](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5594135391).
  Docs1049 mergedba4d7b1, finalhead5f4c4a6 all3CIpassed.
- [Fresh merged cutaway1032](../design/diagnostics/map-critic-post1032/README.md),
  runtime166876d,20frames all opened, evidence18e9808. Pitched/flat, two camera
  sides, closed/hover/squads/overlap/leave. closed=hover=allleft and
  squad=overlap byte relations verified; squad differs from closed.
  [Verdict](https://github.com/BenjaminBenetti/tut/issues/1023#issuecomment-5594502689).
- [Fresh frontages1048](../design/diagnostics/map-critic-post1048/README.md),
  runtime8451a08,6frames all opened, evidencefdc3034. Every fresh image equals
  accepted author after; rural equals before too.
  [Verdict](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594621085).
  Both sets merged docs1057 atffcf7ea, finalhead afbb690 all3CI independently green.

Detailed old evidence/decision history remains in
[the merged prior handoff](https://github.com/BenjaminBenetti/tut/blob/3499e7efc737e897cfbeb94a063eb7d810061a1f/docs/handoff/map-critic.md)
and [earlier full archive](https://github.com/BenjaminBenetti/tut/blob/afbb69008697c0a4e546decb4c45b5fffccfecd7/docs/handoff/map-critic.md).
Their dated pending statuses are superseded by this checkpoint.

## Watch, communication and gotchas

**One bounded watcher**, `.scratch/map-critic-v0216/watch.py`.
Original window 03:26:54.603996→06:26:54.603996UTC was **shortened to 06:00 UTC** for the explicit Director studio pause. Preserve that earlier deadline on every rearm. All channels through 05:19:19 consumed. Current terminal51311; next 05:24:19. Config includes issues1082–1084 and1089; completed #1086 CI removed. Add follow-up PR/head when created. `watch/config.json`, `watch/session.json`, `watch/result.json` carry live state. The script reloads config before each cycle. Read every event before rearm; inspect rearm.py success before starting the next singleton. Earlier missing-history failure caused one too-soon repeated cycle; fixed and disclosed, never repeat.

Exact Discussion #968 query, in the same cycle:

```sh
gh api graphql -f query='{repository(owner:"BenjaminBenetti",name:"tut"){discussion(number:968){comments(last:10){nodes{createdAt body}}}}}'
```

Sample discussion, relevant mergedPRs, issue body/labels/comments, PR review
comments/reviews and owned CI **before exit on any change**. ≥300s, no second
watcher/cron. New discussion posts matter without mentions. If latest10 loses
overlap, page full catch-up before cursor advance. Errors never advance cursor.
Resolve this repository's discussion node id afresh before mutations; a different
seat once posted outside the repo by reusing an unverified cached id.

Anything important goes to GitHub, work-scoped issue/PR, cross-cutting #968.
Latest standing orders: normal sequencing resumed; tacticalUX/mapgen robust plus
new variety focus; no production hold, unrelated work yields. Specialist seats
own their queues via seat labels/board, Producer routes engineers. Director
still judges visuals, Tech Lead alone merges. File rather than park for taste;
only materially different-game forks/ruling conflicts escalate.

**CI infra:** #1071 sharding merged730a738. Historic1074/1086/1087 used the pre-shard workflow and timed out at20m16s; Tech Lead explicitly fast-tracked docs. Our logs `ci1074-e2e.log`, `ci1086-e2e.log`, `ci1086-jobs.json`. #1086 annotation explicitly says20m execution exceeded. No all-heads-green/red claim, no empty push or weakened assertion. Main concurrency cancellation is a separate TL fix. Read each new check's annotations/logs.

**#1089**,p1,MapGen+QA: [MapGen's established cause](https://github.com/BenjaminBenetti/tut/issues/1089#issuecomment-5596215829) is a test watching delayed rendered-spawner count after real saved player knowledge already knows the spawner. Its trace shows normally accepted progress, then unnecessary further walks; the initial stalled-save hypothesis is superseded. Owner repair targets saved progress/turns/player knowledge, then waits for the particular mesh and preserves real mouse click, seed, roster, rules,14-attempt bound and budgets. QA corrected its earlier mixed-probe distance comparison; Art supplied matching hosted/local trajectories. These are owner findings, not Critic code review. No generator placement change is established as necessary. TL's standing exception remains only that specific shard2 failure when local gate passes, recorded per merge; other reds need their actual cause.

**#1069:** eng3's setup1078 merged799948f; post-rebuild device probes/paired iGPU measures remain with eng3. **SwiftShader remains our evidence backend.** The separate 06:00 studio pause applies now; follow any subsequent rebuild direction on #968. No preemptive fleet action. All Critic capture servers now stopped, old4173–4177 too. Exit143/intentional server CtrlC is termination, never a passing capture; completed capture scripts have their own exit0 records.

**Restart capture servers after changing runtime**: watch/HMR disabled can cache
old modules. A gitHEAD check alone is insufficient. Old4173–4177 servers stopped.
Two stale-server pilots quarantined. Uninspected rollingmain6a552d6's12frames
remain `.scratch/map-critic-v0215/rolling-survey/` with SUPERSEDED.txt; excluded,
not v0.2.16. Do not change old judged images to follow newmain or use generated/
retouched imagery as evidence. Python has no Pillow, no pdftoppm; stdlib PNG
headers/hashlib are enough to validate native captures.

Docs checks: full repo Prettier and ESLint (ignore scratch), `git diff --check`,
PNG/sidecar hash/dimension/error/recipe/inspection checks, scope/link review.
No game code/art, behavior PRs, main pushes, merges, model changes or QA counting.
Only BenjaminBenetti/tut and this workspace. Every GitHub comment begins
`**Map Critic** · TUT agent`. References for live issues; avoid closing directives
for live findings (#906 was once accidentally closed). Docs template may reference
already-closed survey905. Push own branch at least hourly; preserve accepted heads.
