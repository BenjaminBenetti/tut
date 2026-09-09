# Handoff: Map Generation Specialist

Last updated: 2026-09-09 (Astra 6 seat; #960 final arrangements/evidence; #1042 scout review repair pushed once at `29ac6b5`). Read this entry before the historical notes.

## Current seat status

- **05:33 pause checkpoint:** explicitly routed p1 **#1089** preempted this #960 draft at 05:12. Repair is in draft **#1095**, branch `fix/1089-scout-progress-waits` (`fb91df4`, later paced candidate testing), own checkout `.git/mapgen-1089/worktree`. Actual failing runner trace proves saved discovery at turn 3/command 7 while mesh count stays zero; the old fixture walks away. Three ordinary CI-mode repetitions pass; a controlled 2× CPU + six-second redraw delay exposed animation backlog, so the candidate now waits for rendered feet after each saved move. Preserve failed-control evidence. Root #960 remains runtime `ecaebc4` / checkpoint `52aacf0`, with 2,348 units, 1,200 wide maps (430.01 s, zero relocations) and all 108 current paired preservation comparisons passing. Fresh PNGs were interrupted and moved to scratch; they are not accepted evidence. Return here after submitting #1089. **06:00 UTC studio cutoff is absolute**: push/checkpoint, stop owned jobs/watch, no automatic rearm or GitHub messaging until resume. #1087 is merged; queue after #960 remains #1082 → #1083 → #1084 → #591.

- **04:58 checkpoint:** #1042 is merged at `6967394`; four fresh merged-main arrival records are submitted in #1087 (`f44063a`), independently matched by the Map Critic in [5595938558](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5595938558). #960/#1075 integrates that main at `ecaebc4`: actual TS/lint/format/build and 2,348 units pass. New paired 108-map survey preserves all landing/hook/terrain/building/road/connector/non-target records and all 36 rural complete maps. Current town 999→359 and city 2101→523 objects; cover adjacency costs −1.05pp / −2.85pp. Wide/sim/browser and fresh pairs are being completed serially. Earlier records remain dated. Queue remains #1082 → #1083 → #1084 → #591; begin #1082 in the same turn once #960 is submitted.

- **04:39 active checkpoint:** the merged-main four-arrival-frame follow-up is submitted as **#1087**, branch `docs/911-merged-arrival-frames`, `f44063a`; all four PNGs inspected/repeated, both two-test runs and four camera restorations pass. MapGen has returned to **#960/#1075 immediately** and is integrating main `6967394`: retain both scratch yard provenance and production dropship requirements in MapDraft, measure all combined goldens, then validate/capture the new combination. The verified pre-dropship record stays dated and intact. New Critic children were caught by the watch and read: **#1082 Lagos → #1083 Perth → #1084 Johannesburg**, all p2 and ahead of the older #591 measurement/design. #1082 is claimed `seat:mapgen`, queued diagnosis with Art before implementation; no new child is being invented from #1068. #1087 review remains on the single watch alongside #1075 and the standing-orders thread.

- **04:27 checkpoint:** #960's `6653941` integration on main `154f2c5` is now fully verified: 2,317 units, 1,200 wide maps / zero relocations (428.95 s isolated), seven sim, **67 browser tests / 37 optional skips / zero retries**, all final exits 0. All 19 frames are inspected/repeated; five integration frames match the original final bytes. Preserve this dated record. **#1042 has now merged at `6967394` and creates three #1075 conflicts** (handoff, MapDraft fields, ASCII goldens). PR #1075 stays draft until that new combination is resolved/tested/rendered. First finish the Director's bounded four-arrival-frame docs follow-up on merged main, then return to these #960 review conflicts; #591 remains measurement/design only afterward. Current captures/test runs have all closed; do not repeat the completed pre-dropship gate.

- **Latest review checkpoint (04:22 UTC): #960 submitted as draft #1075.** Current integration runtime `6653941` includes main `154f2c5`. All 19 comparison/integration frames are inspected and repeat; the five integrated reported/control PNGs match the prior final bytes exactly. Direct 108-map pairing against this main preserves the same invariants and all 36 rural full maps; counts/costs remain 325 town / 529 city. Map Critic preview judgment is positive (5595683809), Director judgment remains pending. Current typecheck/lint/format/build, 2,317 units and seven sim checks pass. Browser shards 1–3 pass (14/23/14 tests); shard 4 was terminated before completion. Integrated wide first hit its 600-second budget under concurrent software rendering; unchanged isolated rerun is active after closing every browser, then shard 4 runs alone. CI is fully green at `6653941`. Complete these final local checks and record their real exits, mark ready, then take the follow-up below.
- **#1042 Director ruling at 04:16 (5595696909): merge authorized at `29ac6b5`.** TL's combined gate on main `154f2c5` is green (2,344 units, 69 browser tests), and its twice-rendered arrival views prove zero change to dropship/ramp/squad/landing tiles. New HUD/fence/bench pixels are other PRs. Director requests a **separate follow-up docs PR regenerating all four `mission*/arrival*.png` on actually merged main**, with provenance. Acknowledged in 5595740429; it now goes **after #960 submission and before #591 measurement**. Last checked at 04:21: merge authorized but not yet performed. Do not re-push the completed dropship branch. Its CI e2e was cancelled, reported in 5595642514; TL's local combined gate is the accepted coverage. The one watcher now treats current-head `cancelled` checks as events, preserving the original deadline during that manual reload.

- **Current orders:** normal sequencing resumed at 01:08. **v0.2.16 is live** (Director, 03:40); #1042 is still in the gate, outside that release. Older merge-pause and queue notes below are historical. #1006/#1052, #984/#1053, Art's #1043/#1055 and #1005/#1064, and eng-3's #869/#1063 are merged. After #960, take **#591 measurement/design only** in the same turn; no tree-opacity change is authorized. Epic #1068 asks the Critic to survey v0.2.16 and file ranked children first: do not implement or decompose the epic directly. Preserve dated evidence; newer-main measurements are separate records. TL owns the CI e2e timeout/sharding repair (#1070/#1071); a cancelled check may mean timeout, not supersession.
- **#1042 interruption and review repair:** initial user-requested rebase of `9b8575c` onto `b4acf3f` was pushed once as `a7e7a22`. TL's full combined gate then exposed seed-4242's lone rifle dying beside the objective while the script never fought. Exact merged-tree diagnosis and event record are in `docs/design/diagnostics/911/scouting-fixture.json` on the dropship branch. Rebased onto TL's `ffcf7ea`, used the real full roster and saved scout class/sight, retained initial-unseen and actual scouting, and repaired framing so an actual mouse click selects the spawner. Omitting that click fails. Six integration tests pass (2.3 min, zero retries, exit 0), with actual typecheck/lint/format. Single review push **`29ac6b5236ed4f6bb6fa201b27353ed41b69f4c1`**; comment 5595419537 hands it back to TL's current-head full gate and fresh arrival render. Production sources are unchanged from the reproduced combined tree. The `9b8575c` derived-entrance fixture remains byte-identical, #1052's two wheel steps and torso targeting survive, historical PNGs are untouched. Back on #960 immediately; do not repeat this completed push.
- **#960 final runtime:** `f20701a` on branch `feat/960-building-yard-arrangements`, comparison base `8d20dd4`. Art's real bench from merged #1060 is integrated with original authorship. Homes get one seat; apartments/towers two seats two tiles apart; shops/warehouses a small rear/side storage group. One group per building, old attributed yard LOW-cover allocation as ceiling. Seating prefers front/side before rear. Two development regressions were repaired: pre-hook candidate changes gave a 14-turn first shot; a bench then isolated an outdoor firing approach. The final pass runs after hooks/boundaries, before connectivity, protects hatch/deploy/door/connector space and window staging, and preserves short local paths around each group for both classes. The failing firing seed runs explicitly on CI. No limits were relaxed.
- **#960 evidence:** all fourteen final before/after/control PNGs under `docs/design/diagnostics/960/arrangements/` are inspected and repeat byte-identically in two browsers per phase. Six-view records plus supplemental S02 shop delivery pair, baseline `8d20dd4` / after `f20701a`. Rural PNG is byte-identical across the change. The 108 independently paired maps preserve hooks, terrain/walls, buildings, roads, connectors and non-target props; all 36 rural full maps match. Original baseline hashes match every regenerated baseline. Town target clutter **1,003→325**, city **2,171→529**; mean cover adjacency **13.71→12.65%** and **11.63→8.74%**, disclosed costs of 1.06/2.89 percentage points. Reported city recipes **59→13** and **69→19**. Earlier 317/519 and second-seed 17 figures are superseded. Some lots deliberately have no safe arrangement. No equal battle-outcomes claim.
- **#960 validation/submission:** actual `tsc -b`, lint/format, production build and full **2,272 units** pass (168.28 s, exit 0); **1,200-map wide** pass with zero relocations (442.05 s, clean standalone exit 0); **seven simulation checks** pass (194.47 s, exit 0). First full browser invocation printed 65 passed / 31 optional skips, zero retries, then its process returned 143; standalone rerun is completing for a clean completion record. Final evidence commit/PR and Director frame judgment remain pending. Submit when that finishes, then start #591. Provisional pre-access/pre-frontage after captures remain scratch only.

- **Runtime:** Codex, Astra 6, xhigh. Work map-generation issues only; never borrow engineering work or grow the backlog. Director judges committed frames before Tech Lead merge; the critic re-checks afterwards. There is no production hold.
- **Standing orders 01:08 UTC:** usage restored and merges resumed. TL is sweeping the accepted queue; accepted work needs no re-judgment unless its runtime/evidence changes. Keep taking the next assigned job after submission. Focus remains tactical UX and map generation; off-focus work yields. All GitHub direction is mandatory, including Discussion #968.
- **#917 is accepted, merged as #973, and shipped in v0.2.13.** Rural fences now describe lot/trail boundaries. Evidence is `docs/design/diagnostics/917/README.md`. The disclosed rural cover-adjacency cost was accepted: 1,331 → 1,273 panels (95.6% retained), 1,327 singletons → 0, about 1.2–1.3 percentage points less distributed cover adjacency. All 72 town/city complete maps and all 108 terrain/road/building/non-fence-prop hashes matched. The TL requested a separate small ADR 0004 §7 pass-table update for `waterfronts` and `rural-fences`; keep it separate from the visual repair.
- **#945 is Director-accepted and merged as [PR #1007](https://github.com/BenjaminBenetti/tut/pull/1007)**, branch `fix/945-natural-material-boundaries`, baseline `b315d5c`, runtime checkpoint `5af0cb5` (rebased onto `5655eca`, including #978). [Cause posted before building](https://github.com/BenjaminBenetti/tut/issues/945#issuecomment-5591598475): continuous terrain noise becomes one surface per two-metre tile, then the renderer draws that tile's entire material with no neighboring transition. The reported coastal map has 524 natural material edges; the snowy city has 142. Lot/building passes repaint zero ground columns in either. Existing atlas surfaces are sufficient; this is a rendering repair owned by MapGen on the cross-domain issue.
- **#945 repair/evidence:** continuous seeded world-space material weights on existing tops and slopes, baked once when models load. No mapgen output or geometry changes. Hard pavement/water/building/walled boundaries and vertical-face materials stay authored. `docs/design/diagnostics/945/README.md` links both critic examples in both angles, the already readable snowy rural trail (resume P03 actual focus **13,3,24**, not the requested y2), and the accepted #915 waterfront. Diagnostic tool records pass provenance and whole-map hashes. Cost: two textures, 2.26/5.08/9.04 MiB for small/medium/large; one load-time bake. Software capture timings are not hardware FPS evidence. All six after PNGs repeat byte-identically after integrating #978. Typecheck/lint/build, 2,263 unit tests and 60 browser tests pass. Director accepted `3fc3a38` after judging the coastal and waterfront pairs (four of twelve frames); do not claim all twelve were individually judged. TL approved code and its merge-result gate, then requested two current tactical fog frames. Those were rendered in an isolated #945 checkout, inspected and pushed as `cd5e119` (two PNGs only); their capture passed. TL re-gated and merged as `c6be260` at 22:20 UTC. Critic re-checked at 00:34 UTC: the contours improve the picture. #945 readability controls change at natural margins; the byte equality is between repeated **after** captures across integration, not between baseline and repair.
- **#959 is Director-accepted and merged as [PR #1016](https://github.com/BenjaminBenetti/tut/pull/1016)**, branch `fix/959-temperate-trail-identity`, original runtime `3f8efcc`. Rebased onto `main@c6be260` after #1007 merged, dropping the superseded #945 ancestry. Director accepted final head `d2fdf7b`; TL merged as `ad72e5d` at 22:41 UTC. Critic re-checked at 00:34 UTC: the narrow stone lane remains readable and plausible. [Cause before build](https://github.com/BenjaminBenetti/tut/issues/959#issuecomment-5592311314): temperate natural ground and the used trail both selected `dirt`. Temperate rural trails now use the existing stone surface. Evidence is `docs/design/diagnostics/959/README.md`: both reported angles, snowy/desert controls and medium/large wide views. Across 108 paired maps, only nine temperate rural maps change, confined to road surface paint; all non-surface map hashes, off-road tiles, road geometry and metrics match. Their 512 indistinguishable roadside contacts become zero. Snow/desert before/after PNGs are byte-identical because both sides already include #945. Rendering cost in P01: +42 calls (7.1%), +11,016 triangles (5.1%), one extra texture; stone detail is not free even though tactical geometry is unchanged. Typecheck/lint/build, 2,263 units, 1,200 wide maps/zero relocations, seven sim checks and 60 browser tests pass. Only rural golden changes to `1604470458`.
- **Active: #960 remaining outdoor arrangements**, cause 5594641226, base `8d20dd4` includes accepted #1006. Art confirmed one bounded bench asset in 5594726548; generation proceeds independently, final integrated frames await that model. Both reported city groups and the existing rural control are being captured. After this: #591 measurement/design only; no tree-opacity change authorized. Take the next assigned job after submission.
- **Current review/hand-off updates:** #1006/#1052 merged as `8d20dd4`; TL's merge gate passed 2,268 units, sim and 65 browser tests. #984/#1053 Director accepted `eb0234a` in 5594566047; rebased onto `8d20dd4` on TL request (handoff-only conflict), preserving its source/test changes and dated 108-map evidence. #911/#1042 accepted `9b8575c`: doorway fixture now derives the real entrance, requested combined three-test browser run passes; TL requests its next rebase only after #1053 lands, then fresh combined-runtime arrival render before merge. #1043 repair is Art's accepted #1055. #1005 diagnosis is pushed at `0b49492`, demonstrated retained water boxes/internal sides; **Art now owns its production repair** (5594687665). MapGen makes no competing repair.
- **#869 specialist sign-off delivered** in 5594641108: eng-3 implements only the exact crossed-half-wall clearance, preserving existing pass order because fences now require kerbs before hooks/connectivity. Preserve flanks, both height-specific representations, paved-edge audit and contextual fence inputs. Producer recorded the approval; no old raised-plinth population is revived.
- **#984 cause before production edits:** 5594293169. At baseline `1b0ff8d`, a legal eight-mech roster fails on its fifth unit on an 8×2 map that passes old I6 (four mech/eight infantry spaces); repeated coordinates can also inflate capacity. Two assertions fail against the old validator. Both floors now derive from existing `MAX_DEPLOYED_UNITS`, distinct indexed tiles are counted, I6 and obsolete placement/cap comments updated. Legal cap and 16-tile target unchanged; defensive launch guards retained. The same minimal map now fails I6; all nine full class mixtures seat eight distinct units on the shared-eight control, and one-short checks cover both classes. Typecheck/lint/build and 60 targeted tests pass. Independently paired 108 maps have identical complete hashes and sixteen shared spaces in every zone. Full units pass 2,277/one skipped with two workers and unchanged timeouts; first unrestricted run timed out three sweeps. First full browser run: 61 pass/capture timeout. Second: 60 pass/capture and end-turn navigation timeouts. Both affected cases pass in isolated one-worker run (1.9 min), no timeout/assertion edits. All 62 browser cases have passes, but no clean single full invocation is claimed. Submit with this limitation and normal CI gate, then assess #1005. Runtime checkpoint `53f6cea`, no map/renderer/art change.
- **#1006 current checkpoint:** `fix/1006-urban-fence-boundaries`, runtime `03569fb` on main `9d9ea01`. Cause before code: 5593901448. Original city two fragments are vegetation (49,1,30) and yard (48,1,28); 29/29 city panels and 36/36 in the town corroboration were singletons because the boundary pass skipped both scales. Class/module is now `BoundaryFencePass`, but internal `rural-fences` id stays for RNG stability. Rules/other prop draws unchanged; remove the urban guard. Eight tests pass; the four urban assertions failed under the original guard. 108 paired opening-seed maps: all terrain/building/non-fence-prop hashes match, all 36 entire rural maps match, urban singletons 2,454→0, panels 2,496→2,494. Town mean cover adjacency loses 0.82 percentage points, city 0.60; disclose the distribution cost. The reported city keeps 29 in 10/10/9 runs; town 36 in 10/10/10/6. Sixteen before/after frames are captured under `docs/design/diagnostics/1006`; all sixteen frames inspected (the two rural pairs are identical bytes). Both rural PNG controls match before/after byte-for-byte. Five urban goldens updated; rural remains 1604470458. The independent unit rerun passes **2,267 tests** with exit 0 (61.5 s). The earlier compound shell exited 143 after its unit assertions and before wide; no false wide-pass claim. Seven sim checks pass, typecheck/lint/build pass. Final independent wide sweep passes 1,200 maps/zero relocations (295.4 s), final browser suite passes 62 tests/31 optional skips (2.0 min), zero flaky. A relocated preview rifle projected 263 px offscreen; two real wheel steps repair fixture framing with all click assertions retained, no production camera/picker changes. Typecheck/lint rechecked after that test edit. Submitted as #1052 at `0233926`; Director accepted that head in 5594272983 after inspecting C1 plus the rural trail/plot and waterfront controls. Critic provisionally judged all sixteen author frames improved (5594198760); fresh integrated-main check remains. No runtime/frame change after acceptance.
- **#1043 Art-owned, supporting MapGen assessment delivered** in 5594261619, agreement 5594306496. Director/Producer routed primary implementation to Art while #1006 finished; the crossed MapGen claim was corrected immediately before any production edit. Opened all D1/E1/E2 critic frames; independent actual pipeline on `9d9ea01` matches Art at runtime-identical `1b0ff8d`: 108 road columns in one connected footprint, 29 already natural dirt before paint, 41 equal-surface road/open-ground contacts. Coastal natural dirt and `trailSurface: DIRT` both resolve to the same ground asset; specialised road appearance only applies to ROAD. Art is testing existing ROCK for coastal rural trails, preserving non-surface output and temperate/snow/desert controls. No competing MapGen code branch/repair. Critic 00:34 re-checked #945 contours and #959 temperate stone lane as improved/readable; #978 roof holds.
- **#911 implementation checkpoint:** branch `feat/911-generated-dropship-site` on main `9d9ea01` (v0.2.15), initial pushed checkpoint `dbc4e9b`. Cause was posted before code at issue comment 5592752738; bounded fallback reasoning is 5593195381. An early pass reserves real ground before lots, a 5×7 hull plus 16 external 4×4 boarding tiles and margins (7×13 total); deploy/extraction share the hook. Optional `TacticalMap.dropships` drives the actual Art model in both tactical and Map Lab. Hull is impassable/opaque under the existing tile convention, no cover bonus. Old maps remain unchanged. Searches are ordered at insets 4/8/12 with cuts capped at one layer, then a final 12/two-layer fallback for four measured narrow snowy towns; no fill or road cuts. Final-map I6 validation checks support and clearance after downstream passes. Do not suppress slope wedges throughout the reservation: that produced bare hillside joins; the extra approach row lets only the outer margin slope. Outer quay/kerb walls are legal boundaries. Egg-spawner fallback now prefers roomy shootable outdoor sites over cramped indoor ones; the real regression fails with the old order.
- **#911 evidence/checkpoint status (not yet a merge claim):** runtime `a793060`, 22 rendered frames at `docs/design/diagnostics/911/generated/`, all inspected. 108 paired resume maps: 108 supported ships, 98 ungraded, 154 cut columns (max one layer), zero raised; all road-pass/segment/paint hashes match. Buildings across 36 maps per scale: rural 96→96, town 377→371, city 507→488. Mean cover adjacency drops 0.19/0.29/0.44 percentage points respectively. The 216-map terrain/playability matrix and **1,200-map wide sweep pass**, zero relocations; all nine measured no-fit recipes repaired (eight wide, one resume), four narrow towns use max-two cuts. Typecheck/lint/build pass; **2,288 unit tests pass** with four workers and unchanged timeouts. Seven sim checks passed, not identical-outcomes proof. Real campaign capture passes and was inspected. A full browser run caught two fixture assumptions: swarmer eight pixels offscreen, mech click through a leg gap. Real wheel framing and visible torso targeting repair these while retaining assertions; both targeted tests pass. Sabotaging the picker makes the corrected click test fail. The complete browser rerun passes **63 tests, zero flaky** and all ten Map Lab after PNGs repeat byte-identically. **Arrival-camera correction `2eaab51`:** south/east nose orientations can hide the rifle squad from default yaw 0. The tactical host starts those landings at yaw 2 only while all living TDF units remain on boarding. Map Lab inspection yaw and squad cutaway settings stay unchanged. Real campaign 9 gives a south-facing coastal town (map seed 3677615265); its actual corrected opening and old-yaw view are captured in `generated/mission-s/`. Four camera taps restore the opening PNG byte-identically. Campaign 4242 is the west-facing control: both PNGs match pre-camera `a8caeb6`, and its four-tap restore also matches. There are now 26 frames. Final units pass 2,295, typecheck/lint/build pass; final browser checks pass **64 tests, zero flaky** (31 optional captures skipped). Disabling the arrival-yaw call makes the real seed-9 integration assertion fail (expected 2, received 0). All local gates and capture obligations are complete; **Submitted as #1042** at `00af271`; #1006 is now active on a separate main branch. Director says placement reads right and asked about the changed building. Answered in 5593960157: reserve before lots/buildings, pictured city 10→9 and deployment moves; across 108 maps, 72 same, 29 down one, one down two, six up one. No one-building-loss guarantee. Director accepted runtime/evidence head `00af271` in comment 5594131182; latest `d4faaf9` only adds the requested building distribution. Director explicitly carried acceptance to `d4faaf9` in 5594221872 after checking both city PNGs byte-identical; TL recorded the docs-only delta and all three CI checks pass. Merges resumed. Critic independently judged the largest-loss 6→4 building recipe acceptable in six new views (5594284923), below the live defects. TL requested rebase after #1048 landed. Rebased to `b54d55d` on fetched main `3b7da52`, manually retaining frontages alongside ordinary props plus dropships. Requested graphics check passes 575 tests; typecheck passes. All historical evidence tree hashes stay `f7d6d411749ca07709b1233b246fbbd8030740ba`. Director carried acceptance to b54 in 5594446205 but requires TL to include a fresh dropship frame from the merged tree; file equality alone is not runtime proof. New-head CI/TL render/merge and integrated Critic re-check remain. New Critic #1043 is queued after #1006, before latent #984; then #1005 and #591. The capture helper resolves a same-day event dialog before selecting a mission; optional three-shutter captures get 120 seconds, regular integration tests retain the standard budget. Temporary orientation probes are removed. Director judgment is accepted at `00af271`; TL merge and the Critic integration re-check remain owed.
- **#911 Art's model/contact contract merged as #1008 (`a5efc99`)**. Remaining generated reservation, placement and scene mapping are now **seat:mapgen**. Use `docs/design/kits/tdf-dropship.md` and [MapGen's agreement](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5591821453): full 5×7 tiles, max height 3.6 units, +Z nose, +Y up, feet-plane pivot; 16 external boarding/start columns, one-column side/front margin, nose outward/ramp inward. Real level support, no terrain/building/road/connector collision, plinth or off-board clipping. Deploy/extraction remain the same boarding tiles. Art's constructed fixtures and the critic's model verdict do not prove generated placement; that is the active implementation and capture obligation. Art owns #960 next.
- **Delivered:** #910/#926, #915/#932, #936/#940, Art-owned #906/#913 foundations, #916/#925 roofs, #947 pointer cutaway. #936 supersedes the old instruction to preserve planted plinths: all artificial non-road plinth families are disabled. Natural terrain is unchanged. City mech outdoor high ground fell 9,271 → 5 tiles; building height does not compensate for mech outdoor height. Do not put mounds back.
- **Legacy queue:** #849 requires re-measuring the piece-fit bucket before geometry; #869 is now eng-3-owned under the exact-wall approval above; #787 remains parked. #793 is already Done: #795/#796 shipped in v0.2.6 and eng-4 delivered the residual profile in 5592431547; there is no active MapGen profiling job. #905 is calibration. Legacy work does not outrank the live critic/assigned queue.
- **Standing orders:** [Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is mandatory at startup/refresh and in the same five-minute watch using the exact query and overlap/catch-up rule. MapGen confirmed in discussion comment 18355553. GitHub is the direction channel; terminal messages start/resume the CLI. Cross-cutting orders belong in the discussion, work direction on issues/PRs.
- **Watch/process:** one bounded background terminal, five-minute REST polling, three-hour hard stop, no cron or second loop. Poll both `area:mapgen` intake and `seat:mapgen` claims, owned PR reviews/merges/CI, active issue direction, and Discussion #968. Consume the pending event before rearming. Keep an active-issue comment cursor separate from the PR-review cursor, so acknowledging a PR review cannot skip pending work-scoped direction. A received SIGTERM once ended a yielded watch early; it was incorrectly labelled a three-hour timeout. The handler now reports interruption, and the same bounded loop is launched in a detached terminal with its own three-hour deadline, never a second loop. Producer routing may precede role headers in issue bodies, so do not match only the first line. Check assigned work before parking and report an actually empty queue in a GitHub thread.

Older measurements below predate later elevation and scale rulings unless explicitly dated otherwise.

The single local watcher now samples **all** channels before exiting on any change (#1018): Discussion #968, newly labelled/claimed mapgen issues, owned PR comments/reviews/merges, active-issue direction and CI. All events from the cycle are retained together. Its five-minute cadence, three-hour bound and separate issue/PR cursors remain. Read pending cached direction before rearming; never infer that a discussion event meant no work-thread update.

## 1. Where things stand

- **M1.5 is on `main` and validated.** Every pass, `generateTacticalMap`, the sweep with goldens, the
  preview harness (built since #209) and the mission → recipe adapter merged 2026-09-03. Validated
  against `main`: tsc, unit suite, build, the preview e2e (QA promoted a 72-combination preview
  matrix in #225), and a 1200-map wide sweep (0 relocations, I1–I8 clean). Its one crash (#221)
  is fixed (#223).
- **Merged quality PRs today:** #206 city plats graded flat, #211 two-lane city streets with
  `blockSize` 12, #212 room furnishing per kind, #215 visible trails, #224 vegetation clusters,
  #235 hatch space around egg spawners (M2), #239 map metrics in the preview, #242 apartment
  template, #245 wide sweep behind `MAPGEN_WIDE=1`, #249 snowy fences, #253 ladder climb cap,
  #223 edge-trail crash fix. Epic #32 has no open children (noted on the epic for the Producer).
- **Also merged since update 6:** #260 edge-spawn spacing relaxes on the smallest maps, #269 tuning
  pass 1 (desert cover, ramp spacing), #272 city block jitter ± 2, #276 preview seed stepping and
  metric deltas. `main` re-validated at bb98b7e: unit suite and the 1200-map wide sweep.
- **Design decision #281** (cover density): the Director chose *keep as is* (~20 % towns, ~23 %
  cities) and to halve `streetPropDensity` only if two-lane cities read busy in play; the issue stays
  open under M2 for the Executive Director's call from a playable mission.
- **#353 and #355 merged.** `Tile.blocksLos` (#352) and `hatchTiles` / `snapshotMap` (#354) are on
  `main` and #326 / #329 consume them. No mapgen PR was left open by session 2.
- **Session 3 (2026-09-04) — the tactical audit.** With movement, sight, hit chance, the turn engine,
  spawning and bug AI landed, I measured the maps through the services that now consume them rather
  than through mapgen's own metrics. Findings and what came of them are in §3a. **Merged:** #437
  (#432 directional cover metrics), #443 (#433 edge spawn distance bands), #470 (#465 hook distance
  fitted to the board — a real `MapGenerationError` on small maps) and #456 (#448 `assessMap`, the
  play read-outs in the preview). **Waiting on other people:** #444 (a design call: mechs never gain
  elevation on city maps), #446 (melee bugs invert the cover rules — tactical's), #447 (the M3
  archetype sketch, with two questions to answer before anything is built) and the ruling asked for
  on #465 (should `resolveParams` reject an over-constrained recipe outright).
- **Session 3, last stretch.** Merged: #647 and #672 (test budgets — see §7), #662 (the crash-site
  prototype, §2c). Filed for other people and landed by them: #593 (a hill blocks line of sight,
  which I found and eng-5 built), #487, #488. Open findings of mine: **#685, ambush is impossible on
  current maps** (§3d), #591 (vegetation opacity — re-measured after the hill fix, one-line
  recommendation waiting on a call, §3e), #281 (the Executive Director's cover call, re-measured
  twice today and now clean).
- **Session 3, later stretch.** Merged: #587 (#586, the cover that stops a melee attacker), #597
  (#596, how much fog of war hides), #607 (#508, half walls and parapets). Filed and handed on:
  #591 (trees do not block sight — parked behind #593), #593 (**a hill does not block line of
  sight**, p1, seat eng-5). Re-ran #281's tables after #446 shipped, as the Director asked. Details
  in §2b and §3c.
- **After the tag, three more mapgen changes merged.** #506 (#492) took `windowDensity` from 0.5–0.7
  to 0.3 so buildings stop reading as glass towers; #547 (#544) made the egg-spawner placer prefer a
  tile something can shoot; #535 (#512) gave city maps outdoor high ground for mechs, on the
  Director's #444 ruling. §2a describes the new pass, §3b the numbers.
- **Two bugs found outside mapgen while checking the release, both filed with evidence and neither
  mine to fix:** #488 (p0, eng-3) — `tactical-hud-view` sends `move(unit, [clickedTile])`, a
  one-element path, so a unit can only ever step to an orthogonally adjacent tile and every farther
  click is refused; `pathTo` has been in `movement-service` since #325 and nothing in `src/ui` or
  `src/app` calls it. That, not tuning and not the map, is why QA's mech "closed 14 tiles to 12 in
  40 turns". And #487 (p2) — a deployment over 16 units cannot launch, because a deploy zone is
  exactly `TARGET_TILES` = 16 and nothing caps the roster or the deployment screen.
- **M2 issues that consume the map** (#316–#345 filed by the Producer): I left the exact APIs as
  comments on #323 (mission start), #325 (movement), #326 (sight and cover), #329 (spawning). #337
  reuses `graphics/view/tactical-map-view.ts`; #343 (headless sim) needs nothing new.
- Art follow-up #213 (`prop.table` placeholder) merged as #350.

- **Session 3, final stretch.** Merged: **#717** (#714, a prop pass requires what its placements
  need — the capability wall §2c predicted, cleared before the hive hits it). **#703 was merged and
  then reverted** (#723): desert palm clustering turned `main` red on `sim · mission sweep`, and
  §3f is the investigation of why — the short version is that it was not the palms. #701 is still
  open and still real. Also open: **#712** (temperate boulders, minor). **#591 is unbundled from
  #281** and my option 2 is the recommendation of record, pre-checked clean against the sweep (§3e).
  Measured and posted: the **emergence** half of #685 and the visibility-break numbers (§3d), and
  two findings handed to #497 (§3g).

- **Session 4 (2026-09-06) — scale (#829, epic #826, ADR 0009).** Maps 48²/72²/96², roads as
  carriageways (trail 2 / streets 3 / grid 4 lanes, `sidewalkWidth` 1 / 2), lots and footprints
  doubled, interiors as structures (one corridor plan per building, room-size targets, a door per
  room, interior cover tables, stairs ranked to land in the corridor), a three-floor guarantee, and
  the nearest egg spawner within 30 of deploy. §2d has the shape, §7 the gotchas. Earlier in the
  session: #765 (`?models=1`), #769, #789, #801, #823 (half steps, I11, #817 classification).

- **Session 4 close (2026-09-06).** Merged on my output: #838 (#829 scale, ADR 0009 Accepted),
  #853 (#847 lot-margin wedges), #866 (#863 kerb walls on paved two-layer edges, ramp planks
  spanning their rise). The #813 ramp audit is closed by the Director and v0.2.9–v0.2.11 tagged.
  **Where the rest stands for whoever takes this seat:**
  - **#849 (J3, a tile low on three sides)** is the Art Director's; its piece merged in #874 and
    the issue is still open. **Caveat before anyone cuts more geometry:** QA's J3 bucket is
    "three or more high orthogonal sides" (522 tiles on the 108 `qa813` maps), which is wider
    than the one configuration the piece targets (three high sides with a low opening). Four
    high sides, three-high with a high diagonal, and so on sit in the same bucket. **Re-measure
    the bucket per canonical mask (`docs/design/diagnostics/813/method.md`) against the piece's
    fit boundary first**, and classify only what the piece covers; do not take the 522 as the
    target. Any placement or classification change is mapgen's (`SlopePass` never emits a
    three-sided piece today; that is the resolver's or a new pass's call).
  - **#869 (MapGen-owned, backlog p2, not promoted).** Two items: `kerbs` runs before
    `connectivity`, so a connectivity ramp repair could bridge a kerb wall it never clears
    (latent: zero repairs fire on the CI matrix); and ~2,000 pre-existing ramps on city plats
    pass through raised-feature parapets, which QA confirmed is drawn across the ramp (a visual
    defect). My proposed fix is on the issue: move `kerbs` after `connectivity` requiring
    `connected`; have the ramp pass and the repair clear the `half` wall on the exact edge a ramp
    crosses; pin that no connector crosses a walled edge. About twenty lines; wait for the
    Director to promote it.
  - Measurement probes for the ramp audit (draft-side bucket table with a reason column; paved
    two-layer edge classifier) are pasted into #847 and #863 as `zz-*.test.ts` bodies; drop one
    into `src/mapgen/service/`, run it with `OUT=` set, delete it before lint.

## 2. Pipeline as built

```
 MapRecipe ─► hashSeed ─► Rng ─► PipelineMapGenerator(createSettlementPasses())
   terrain ─► water ─► roads ─► lots ─► buildings ─► interiors ─► props ─► ramps ─► hooks ─► connectivity
   ─► freezeDraft ─► validateTacticalMap (throws MapGenerationError) ─► TacticalMap
```

| Pass | What it does | Key decisions |
|---|---|---|
| terrain | fbm value noise, contrast ×2.2, quantised to levels; surface patches at 2× freq | raw fbm piles on one level |
| water | coastal band along one edge, level 0, sand beach | edge = rng pick |
| roads | builder per style (trail/streets/grid); largest network; 8-col chunks ±1; ramps at chunk steps; sidewalks; flat networks grade the whole plat; grid lays `roadWidth` lanes every `blockSize ± blockJitter` | cities: block 12 ± 2, two lanes, one level |
| lots | shuffled (road column, side) anchors; rect beside corridor; gap 1, margin 1; count × `areaFactor` | inner-lane anchors reject themselves |
| buildings | weighted template per lot (house, shop, warehouse, tower, apartment); `ensureMultiStorey` | templates in `data/building-templates` |
| interiors | recursive bisection with a door per cut; room kinds `hall`/`room`/`storage` (`data/room-kind-ids`); stairs BFS-verified, holes interior-first; roof tiles; ladders ≤ 2 storeys and ≤ 2 levels of climb (#253) | `interiors` capability |
| props | vegetation by density with per-kind clusters; width-aware street props; yard clutter; room furnishing via `registries.roomFurnishing`; every interior placement BFS-verified | blocked: thresholds, connector ends |
| ramps | union-find over ground (`service/ground-components`); ramp per one-level step between components; spacing ramps | 2-level steps stay cliffs |
| hooks | `HookPlacer` registry; deploy (largest ground component, edge band); egg spawners (≥ 12 from deploy, ≥ 6 apart, half indoors, `HATCH_SPACE_MIN` 6 reachable tiles within `hatchRadius`, checked lazily in draw order); edge spawns (strict spacing first, relaxed only for zones that do not fit); extraction = deploy | placers share one `snapshotDraft` |
| connectivity | per hook × class: freeze, check, 0-1 BFS for cheapest repairs (prop / door / ramp), else relocate | I7 guarantee |

Entry: `service/generate-tactical-map.ts`. Adapter: `service/mission-map-recipe-adapter.ts` +
`data/hook-kind-defaults.ts`. Metrics: `service/map-metrics.ts` (`computeMapMetrics`, PR #239).
Hatch BFS: `service/hatch-space.ts`. Wide sweep: `MAPGEN_WIDE=1 pnpm exec vitest run generation-wide-sweep`
(PR #245). Scratch measurements: a throwaway `src/mapgen/zz-debug.test.ts` (git-excluded; move it
out before `pnpm typecheck`/`lint`).

## 2a. The elevation pass (#512, merged as #535)

City plats are graded flat and mechs cannot enter buildings or stand on roofs, so before this the
only height on a city map was indoors and a mech never held ground above anything (#444). The pass
runs **between lots and buildings** and stamps raised outdoor structures from
`registries.elevatedFeatures`: a viaduct that lifts a run of carriageway, a podium, a plaza, a
raised park, a causeway, a rail embankment, a terrace, a rubble mound. A new kind is a data entry,
not a pass edit.

Everything it builds is **exactly one level up**. That is the whole trick: the ramp pass already
bridges one-level steps and treats two as cliffs, so ramps, reachability and I7 come for free.

**Three rules it must keep, each of which was a bug first:**

| rule | why | what broke without it |
|---|---|---|
| `EDGE_KEEPOUT` 5 columns from every map edge | deploy zones and edge spawns are placed *after* this pass, in the outer band | a plaza against the border boxed a squad into its own deploy zone: three `mission-driver` tests (#494) and the lurker flanking sweep |
| `MIN_APPROACH_COLUMNS` 3 of open ground round the edge | ramps are built between *ground* components | a platform ringed by lots got no ramp and became tiles a unit can stand on and never reach, which the driver reports as `no-route` |
| never the lot's frontage strip | the building pass puts the entrance on the frontage | a door opened onto a raised face and the building was unreachable |

The other three sides of a lot are fair game — a terrace against a building is what a city looks
like. Placement runs off a **summed-area table**: the free-rectangle test has to be O(1) or the
property sweep blows its budget (it hit 60 s before, 8.8 s after; the pass costs about 40 ms on a
medium map).

The knob is `SETTLEMENT_DEFINITIONS.city.elevatedFeatures`, attempts rather than placements — the
plat runs out of room around forty, so raising it only costs generation time.

## 2b. Half walls and parapets (#508, merged as #607)

`WallKind` gained **`half`**: infantry vaults it, a mech goes round, it never blocks sight, and it
grades to low cover. The movement rule is what makes it a distinct piece — an impassable,
transparent, low-cover wall is `window`, which already existed. ADR 0004 §4.2 now carries the wall
table and §5's traversal line includes it.

**Why it matters more than another prop:** every cover prop stands *on* a tile, so cover and
standing room compete for the same ground. An edge-mounted piece does not, so a unit can stand *at*
the cover and shoot over it. The elevation pass rails the outer edge of everything it raises, and on
city maps that took cover on ≥ 1 side from 28 % to 41 % and flank-proof ground from 4 % to 8 %, with
**mech reach, ramp count and approach length all unchanged**. Ramps still climb a railed edge: a
connector joins its two tiles directly and never consults the wall between them.

Graphics rode along because `WallKind` is a compile-time union — `tsc` names every site. Walls now
draw at a per-kind height (`WALL_HEIGHTS`), because at full storey height the parapets made the city
read as a walled compound. **Look at the render before believing a cover number**; that is twice now.

## 2c. The crash-site archetype (#447, merged as #662)

**A prototype, deliberately.** The Director's steer: exploratory groundwork while the Executive
Director's playtest decides M3, not shipped content. No mission type names `crash-site` and
`missionToMapRecipe` cannot produce one, so it reaches the generator only from
`/mapgen-preview.html?archetype=crash-site` or a test.

```
terrain ─► water ─► crater ─► debris ─► ramps ─► hooks ─► connectivity
```

Two things it settled that the sketch in #447 could not:

- **The bowl must be terraced, not dug.** A single deep hole is a pit nothing can enter, because the
  ramp pass only bridges one-level steps. The pass also lifts the whole plat before digging (there
  is no level below zero) and flattens its disc first (crater relief and terrain relief compound
  into steps nothing can climb).
- **The prop pass could not be reused, and now can.** It required `interiors`, which a site with no
  buildings can never provide — the one link in the settlement chain a bare archetype cannot satisfy.
  #714 made the requirement follow the placements, so `new PropPass({ placements: ["vegetation"] })`
  asks only for a heightmap. **The hive will not hit this wall.**
- **But vegetation is still not wired in, and that is deliberate.** Having made it possible I tried
  it, rendered it, and took it back out: debris already fills this ground, so vegetation does not
  layer onto a crash site, it **competes for the same tiles**. Measured, 137 props and 18.2 % of open
  tiles beside cover become 271 and 30.8 % — double, against a rural settlement's 15–19 %. Tuning
  does not rescue it: debris `outside` 3 → 1 still leaves 238 props, and a vegetation density scaled
  to 0.35 still leaves 187. To reach the prototype's own baseline the vegetation would have to
  contribute nothing. **Whether a crash site's ambient clutter is wreckage or vegetation is a design
  call**, not a refactor's side effect.

Known gaps, listed rather than papered over: no wreck (wants art), and no vegetation — but note that
the earlier claim here, that its cover deficit "follows from the missing vegetation", was wrong. The
prototype sits at 137 props and 18.2 % beside cover, which is a rural settlement's range already.

## 2d. Scale (#829, ADR 0009, 2026-09-06)

Every factor is a knob in `mapgen/data/`, recorded with its reason in ADR 0009 §5 and the PR body.
The shape of the change, pass by pass:

- **Roads.** `RoadLine.columns` lists every column of one position along the road together; the
  road pass groups them by position (`groupByPosition`), chunks `CHUNK_LENGTH` *positions*, and
  never ends a chunk between two positions that both touch another line's mouth (`chunkPositions`
  / `mouths`), so a three-lane side street meets one level. A step gets one ramp per lane
  (`adjacentPairs`). Sidewalks paint ring by ring to `sidewalkWidth`. Trail and streets stamp lanes
  themselves; the grid still lays one line per lane (flat levelling makes that safe).
- **Resolver.** `fitJunction` classifies a tile with three or four same-surface neighbours as a
  junction only when the run through it is at least `JUNCTION_EXTENT` (6) on both axes; otherwise
  it is a straight along the longer run. A 4×4 crossing is a box of cross pieces. The kit has no
  slab, kerb or centre-line piece — that is the art child (ADR 0009 §3c).
- **Lots.** `LOT_GAP` 2, `EDGE_MARGIN` 2, `REFERENCE_AREA` 72², setback = `sidewalkWidth`.
- **Buildings.** `ensureMultiStorey` re-plans one lot with the tallest fitting template so some
  building reaches `TALL_FLOORS` (3) where the settlement allows it (`fittingTemplates` /
  `sizePlan` are the shared halves of `planBuilding`).
- **Interiors.** `BuildingTemplate.interior: InteriorPlan` (`roomSize`, `corridorWidth`) replaces
  `minRoomSize`. `planFloor` lays the corridor once per building (narrowing, then dropping it, when
  the footprint cannot hold a room on both sides); `partitionFloor` cuts each strip beside it into
  segments of `roomSize` with one door onto the corridor each, a door between neighbours by
  `SUITE_DOOR_CHANCE`, and bisects a strip deep enough for two rooms. Without a corridor the old
  recursive split runs, but now cuts while an edge exceeds `roomSize.max`. Room kind `corridor`
  furnishes with a crate or two; the entrance room stays `hall` even when it is the corridor.
  `placeStairs` takes the upper floor's rooms and ranks candidates interior-hole → landing in a
  corridor/hall → rising from one.
- **Hooks.** `HookRequirement.maxNearestDistanceFromDeploy` (egg spawner 30): the first spawner is
  drawn from candidates within it when any exist. Without it a 72² map put the nearest spawner 11–17
  mech turns out on five of twelve shipped maps.
- **Map Lab.** `?floor=N` cuts the view through building floor N (`showLevelCut`); an Interiors
  stats row (`footprintMean`, `roomsPerFloor`, `corridorBuildings`). The capture spec has a 300 s
  budget and writes the large city's frame rate beside its shot.

## 3. Measurements (medium maps, 8 seeds per cell, `main` before #269; desert and ramps moved as noted below)

Share of open ground beside a cover prop / beside a wall; high and low cover tiles per 100 ground
tiles; interior props per building; ramps per map.

| | temperate | snowy | desert | coastal |
|---|---|---|---|---|
| rural | 15 % / 1 %, 5.6 H 1.0 L, 2.3, 41 ramps | 13 % / 1 %, 5.0 H 0.9 L, 2.6, 47 | 16 % / 1 %, 2.2 H 3.1 L, 2.5, 36 | 16 % / 2 %, 5.0 H 1.0 L, 2.6, 19 |
| town | 18 % / 6 %, 5.5 H 2.2 L, 3.1, 54 | 15 % / 5 %, 5.0 H 2.0 L, 3.2, 58 | 16 % / 6 %, 1.6 H 3.6 L, 2.8, 42 | 16 % / 8 %, 3.8 H 2.2 L, 2.9, 20 |
| city | 23 % / 10 %, 3.5 H 4.0 L, 3.2, 0 | 22 % / 11 %, 3.5 H 3.7 L, 3.3, 0 | 23 % / 11 %, 1.7 H 5.1 L, 3.4, 0 | 22 % / 15 %, 2.6 H 4.3 L, 3.1, 0 |

Hatch space minimum is 7–13 tiles of 25 everywhere (floor is 6). City maps with a 3+-floor
building: 71/72 (was 61/72 before apartments); towns 67/72.

**Applied in #269 (tuning pass 1), measured the same way:** desert boulders 2.5 + palms 1 take
desert high cover to 3.5 (rural) / 3.0 (town) per 100 and cover adjacency to 18.8 % / 19.8 %;
`rampSpacing` rural 8 / town 7 takes ramps per medium map from 37 / 43 to 28 / 33 with connectivity
repairs and relocations still zero.

**Decided on #281:** cover density stays where it is until a playable mission says otherwise; the
knobs if it changes are `yardPropDensity` (town 10 → 15 for ~30 %), a `cabinet` interior kind (high,
blocks LOS; needs a placeholder like #213), and `streetPropDensity` (halve if two-lane cities read
busy). Explicit sizes: the resolver accepts 16–256 and every accepted size generates (#260); 128²
takes ~260 ms. Heavy recipes (8 egg spawners, 6 edge spawns) generate on small and medium presets
with zero relocations.

## 3a. The tactical audit (2026-09-04)

**Read the size note first.** Missions do not all use their type's `mapSize`: `mapSizeFor` in
`overworld/service/mission-generation-service.ts` picks by difficulty — `small` 32² below 4,
`medium` 48² below 8, `large` 64² above — so an early campaign plays **small** maps and everything
in this section except the last table is measured on **medium**. The small-map read-outs are at the
end of §3a. The smallest map any mission can ask for is 32²; 16² is reachable only from a
hand-built `MapDimensions`, which is why #465 could not bite the release.

Everything below was measured on `main` at `9b15c69` through the real tactical services
(`sight-service.hasLineOfSight`, `ReachabilityService`, `TileIndex`), medium maps, 6–8 seeds per
biome × settlement. Rebuild any of it as a throwaway `src/mapgen/zz-*.test.ts` (git-exclude it, move
it out of `src/` before `pnpm typecheck` / `lint`) — the recipe is `generateTacticalMap` with
`DEFAULT_MISSION_HOOKS`, then a BFS from `map.hooks.deployZones` per `PassMask`.

**Cover, the way tactical credits it.** `coverAgainst` only counts the one or two sides a shot
arrives from, so "20–23 % beside cover" is not what a squad feels. Share of open ground with cover
on ≥ 1 side: 15–20 % rural, 21–25 % town, 29–36 % city; on ≥ 2 sides: 3–6 % everywhere. Of the
tiles a squad can shoot an egg spawner from (infantry-reachable, range 8, LOS clear — 46–107 per
spawner, so position is not the constraint), **5–16 % have any cover against that spawner**. Deploy
tiles with cover on any side: 0–41 %, mean ≈ 24 %. Posted on #281 with the knobs; values unchanged,
the call is the Executive Director's. #432 / PR #437 puts the two directional shares in
`MapMetrics` and the preview so the call can be read live.

**Edge spawn walk-in (#433, PR #443).** Every zone seed came from the farthest third of the boundary
candidates, so waves spent the mission walking: nearest zone at the median 34 / 59 / 77 infantry
steps from deploy on small / medium / large. At two actions a turn (swarmer 14 tiles, lurker 12,
brute 6) the turn-3 wave reached the squad about turn 7 as swarmers and about turn 13 as brutes,
while deploy → nearest spawner is only 23–49 steps. The fix alternates distance bands (far third,
then middle third) and takes the medians to 28 / 45 / 61.

**Mech-passable tagging is healthy.** Mech-passable exterior ground unreachable from deploy: 0.0–0.3 %
of tiles, worst seed 0.9 %, largest pocket 13 tiles; infantry the same. Mech reach is 68–98 % of
infantry reach (the gap is interiors and roofs, which are infantry-only by I5). Nothing to fix.

**Small maps could crash, and now cannot from a mission (#465, PR #470).** A 16×16 map cannot hold
three egg spawners 12 tiles from a 16-tile deploy zone: on some seeds everything that far out is
rock, road or sidewalk, the placer finds no candidate and the map dies on I8. Six failures in 480 at
16×16. `missionToMapRecipe` now fits each kind's `minDistanceFromDeploy` to
`floor((width + depth) / 4) − 2` — manhattan spans both sides, so a long thin map keeps its room —
which leaves every preset untouched and takes 16×16 to 6, where 480 maps generate clean. Hand-built
recipes (`DEFAULT_MISSION_HOOKS`, the sweeps, the preview) still carry a flat 12 and can still fail
below about 24²; #465 asks the Tech Lead whether `resolveParams` should reject those outright.
Everything else about shape is fine: 256², 128², 16×256, 256×16, 17×43 and 33×97 all generate, 256²
in 1.8 s with 66k tiles.

**Heavy recipes are safe.** `INFESTATION_CLEARANCE` at difficulty 10 asks for 4 egg spawners and 3
edge spawns, which the wide sweep never exercises (it only uses `DEFAULT_MISSION_HOOKS`). Swept on
#443's branch: 216 maps over every biome × settlement × size, 0 failures, 0 relocations, 0 repairs.

**Buildings scale with the settlement.** Buildings per medium map and footprint share of the map
area: rural 2.0 / 1.5 %, town 8.4 / 6.3 %, city 18.5 / 9.6 %; mean floors 1.53 / 1.94 / 2.58. A
rural map is a field fight with almost no interior, which is the intended flavour.

**Deploy zones seat everyone.** Every deploy zone on every size is 16 tiles, all mech- and
infantry-passable, against I6's floor of 4 / 8. `startTacticalMission` places mechs first, so a
16-unit deployment fits; there is no roster size that can produce `no-deploy-room`.

**Objectives are all attackable.** Every egg spawner on every seed has an infantry firing position,
and one reachable by a mech too (indoor spawners are shot through windows — doors and solid walls
are opaque, windows are not). Two of three spawners sit indoors by design, so a mech can shoot them
but never reach them; that is the intended split and #426 does not change it.

**Cover cannot protect the player while every bug is melee (#446).** A prop tile is impassable, so no
bug can ever stand on the side a prop covers; the only side it can attack from is an uncovered one,
and `flanked = cover === NONE && anyCover` means having cover anywhere is what flags the squad as
flanked. Measured on a fixture: a squad beside one boulder is hit at 75 % by a swarmer, the same
squad in the open at 60 %. Cover still works for the bugs, who take −20 / −40 crossing open ground.
Filed for the tactical owner with four options; it inverts how #281 should be read, and there is a
second comment on #281 saying so.

**Elevation (#444).** Rural and town give a mech 0.09–0.37 of the reachable high ground; **cities
give it 0.00** on all four biomes and all 24 seeds, because city plats are graded flat with no ramps
and every vantage tile at a city spawner is a building tile. With #327's ±10 per level that is a
standing disadvantage with no counterplay. Filed as a design call with three options (a raised
outdoor feature per few blocks is the cheap one); not built, waiting on the Director. Also measured:
8/18 coastal-rural and 11–12/18 desert/temperate-rural spawners have no elevated firing position at
all, which reads as biome variety rather than a gap.

**What a small map plays like (32², 6 seeds per biome × settlement, difficulty 1–3 recipes).** This
is what the Executive Director actually sees early in a campaign; the walk-in is the friendlier end
of the medium numbers.

| small 32² | rural | town | city |
|---|---|---|---|
| steps to the nearest objective | 26 | 29 | 23 |
| steps from the nearest edge spawn | 34 | 33 | 27 |
| firing positions per objective | 90 | 92 | 80 |
| of those, in cover / shooting down | 8 % / 15 % | 9 % / 22 % | 14 % / 16 % |
| open ground with cover on ≥ 1 side / ≥ 2 | 18 % / 4 % | 22 % / 4 % | 32 % / 5 % |
| mech levels reachable | 2–4 | 2–4 | 1 |

600 small-map generations of the live difficulty-1–3 recipes: zero failures.

**The map is not why a mech cannot close on a spawner.** Tiles a mech can reach from deploy, inside
its range of 10, sight line clear: 0 of 18 spawners per biome × settlement had no mech firing
position, about 90 per spawner on average (worst seed 2), the nearest 20–44 mech steps from deploy.
Two thirds of spawners are indoors and a mech can never stand on one — it shoots them through
windows. The cause was #488.

## 3b. The tables as they stand after #535 (2026-09-04 09:20)

Everything above in §3a was measured before the elevation pass and the window and spawner changes.
These are the current numbers, 6 seeds per biome × settlement through `computeMapMetrics` and
`assessMap`. Shares are percentages; steps are infantry BFS steps from the deploy zone.

| | covered ≥1 | flank-proof | approach | bug walk-in | firing positions | in cover | shooting down | mech reach | mech levels | ramps |
|---|---|---|---|---|---|---|---|---|---|---|
| small rural | 17 % | 3 % | 21 | 33 | 95 | 7 % | 20 % | 96 % | 2–4 | 13 |
| small town | 23 % | 4 % | 22 | 32 | 74 | 9 % | 30 % | 82 % | 2–4 | 17 |
| small city | 32 % | 5 % | 21 | 27 | 75 | 11 % | 35 % | 72 % | **2–2** | 15 |
| medium rural | 17 % | 3 % | 32 | 51 | 82 | 8 % | 22 % | 97 % | 2–4 | 29 |
| medium town | 23 % | 4 % | 32 | 50 | 80 | 9 % | 29 % | 84 % | 2–4 | 33 |
| medium city | 30 % | 4 % | 29 | 41 | 77 | 12 % | 34 % | 74 % | **2–2** | 42 |

**A mech reaches two levels on a city map where it reached one**, and positions that shoot down at
an objective roughly doubled (16 % → 34 %), because the raised ground gives both classes somewhere
above one to stand. City ramps went from none to 15 on a small map and 42 on a medium one.

Cover is unmoved by all of this: 17–32 % of open ground has cover on one side, 3–5 % on two. #281 is
still the open call, and #446 still says the sign is inverted while every bug is melee.

## 3c. Cover and visibility as they stand (2026-09-04 11:10, after #446, #508, #512)

6 seeds per biome × settlement. The two cover columns measure different things and both matter:
`covered` is cover that mitigates *ranged* fire, `sheltered` is directions a *melee* attacker cannot
come from, which is the only cover that protects against the current bestiary (#446, #586).

| | covered ≥1 | flank-proof | sheltered | back-to-wall | firing spots in cover | visible in range |
|---|---|---|---|---|---|---|
| small rural | 16 % | 3 % | 46 % | 16 % | 6 % | 87 % |
| small town | 22 % | 3 % | 47 % | 15 % | 9 % | 67 % |
| small city | 41 % | 8 % | 54 % | 12 % | 15 % | 51 % |
| medium rural | 17 % | 3 % | 43 % | 16 % | 6 % | 89 % |
| medium town | 22 % | 4 % | 47 % | 16 % | 9 % | 70 % |
| medium city | 40 % | 9 % | 54 % | 12 % | 14 % | 56 % |

`visible in range` is #596's number: how much of what is inside sight range a unit can actually see.
**It is wrong until #593 lands** — terrain does not block sight today, so a hill hides nothing. With
that fixed the same maps read 67 / 61 / 43 %, and rural stops being transparent.

**Generation cost**, medium / large, mean over 6 runs: rural 49 / 111 ms, town 58 / 136 ms, city
66 / 165 ms. The elevation pass is 5 ms on a medium city and 17 ms on a large one; `connectivity`
(25–66 ms) and `hooks` (16–33 ms) dominate and always did.

## 3d. Ambush: bugs cannot reach the squad unseen (#685, 2026-09-04)

The design property fog of war made real, and the answer is stark: across **2,409 approach walks**,
not one reached the squad unseen. Every edge-spawn approach walked down the step field to a standing
position, scored against what that position can see; 6 seeds per biome × settlement, medium maps.

The number that decides it is the squad, not the map. `computeVision` unions every living unit on a
side and a squad is five soldiers (`SQUAD_MAX_STRENGTH`), so four extra pairs of eyes roughly halve
concealment and push first contact *past* the 12-tile sight range — the forward soldiers see for the
anchor:

| scale | stand | concealed of last 12 (1 soldier → 5) | first spotted at (1 → 5) | never seen |
|---|---|---|---|---|
| rural | deploy | 20 % → **11 %** | 10.4 → 12.1 steps | 0 % |
| rural | mid-map | 22 % → **13 %** | 13.7 → 15.3 steps | 0 % |
| town | deploy | 19 % → **16 %** | 11.6 → 12.7 steps | 0 % |
| town | mid-map | 19 % → **12 %** | 12.2 → 14.1 steps | 0 % |
| city | deploy | 13 % → **7 %** | 10.7 → 12.3 steps | 0 % |
| city | mid-map | 24 % → **12 %** | 9.8 → 12.2 steps | 0 % |

Ambush is not rare on these maps; it is impossible. Fog pays out entirely to the player.

Four things to save the next person the work:

- **The map is not the binding constraint, and map-side fixes are weak.** The densest ground this
  generator makes — a city interior — buys 32 % concealment against one soldier and **12 % against
  five**. Scenery cannot beat five overlapping vision cones with no facing, no arcs and no falloff.
  The lever is a rules one, or letting bugs *arrive* close (emergence, burrowing, hive tunnels)
  rather than approach.
- **Trees are not the lever *for this*, but they are for fog readability.** Making every tree opaque
  moves approach concealment 7 % → 10 % on rural and nothing in a city — yet the same change moves
  `assessMap`'s visible share by ten points (§3e). Two different metrics, both measured, both true:
  opacity improves what fog hides *at rest* and barely improves the concealment of a *moving*
  approach into a five-soldier vision union. Do not quote one number for the other.
- **Cover and concealment are different knobs.** Only four of thirteen prop kinds block sight
  (`car`, `dumpster`, `shelving`, `boulder`); crates, sandbags, fences and every tree are
  transparent. Answering #281 with "more cover" will change survivability under fire and will not
  make an ambush possible.
- **The deploy zone is not a special case.** I first blamed our own `EDGE_KEEPOUT` (§2a) for making
  the ground around deploy zones the flattest on the map. Measured against other tiles in the same
  edge band it is false — deploy 15/20/18 %, same band 15/20/18 % — and I withdrew it on #685. The
  only real gradient anywhere is the city interior, which is building mass.

Two methodology traps I fell into, both of which made the first numbers (7–10 %) too low: an
approach shorter than twelve steps fills a partial "last 12" window and inflates the seen share, so
require `distance ≥ 12`; and one watcher is not a squad. Measure the union.

Option 1 on #685 — accept it — has a cost worth naming: it makes the lurker's premise (#333, stalk
out of sight and strike from behind) impossible on the maps as they are.

### The other half: a bug that *hatches* is not seen at all

Walking is the wrong verb. Egg spawners are concealed almost until contact, so an enemy that emerges
rather than approaches gets the ambush the terrain refuses to give it. Squad of five walked from its
deploy zone straight at each spawner, asking at every step whether the nest is visible yet; 72
spawners per scale, 6 seeds per biome × settlement:

| | rural | town | city |
|---|---|---|---|
| still unseen when the squad is 20 steps away | 94 % | 94 % | 96 % |
| still unseen at 16 steps | 82 % | 81 % | 90 % |
| still unseen at 12 steps | 40 % | 50 % | 53 % |
| still unseen at **8 steps** | **19 %** | **28 %** | **33 %** |
| spawner is indoors | 56 % | 67 % | 68 % |

Beside the approach numbers that is the whole finding: a bug that walks is seen every time; a bug
that hatches is, a fifth to a third of the time, already inside the squad's eight-step bubble having
never been observed. **The map is not the obstacle — the arrival mechanism is.**

Three consequences worth carrying forward:

- The placer already puts nests where the squad cannot see them, because it prefers interiors and
  overlookable buildings (#544). No map work is needed to make emergence an ambush.
- It retires the "sight-blocking mass on the approaches" option I proposed on #685, which would have
  spent #281's ground budget for a few percent.
- It gives the lurker (#333) a premise that works: stalking out of sight is map-impossible;
  *emerging* out of sight is map-native today.

Caveat on the method: "never seen: 0 %" is an artefact of walking the squad directly at each spawner.
The claim is the distance, not the eventual sighting.

### Does visibility ever break? A third of the time, briefly

The follow-up question, because "a bug can start unseen" is not the same as "a bug can stalk".
Squad of five holding a mid-map position, every approach walked, counting visibility transitions
*after* the bug is first seen:

| | at least one break | mean time hidden |
|---|---|---|
| rural, from an edge | 23 % | 2.0 steps |
| rural, from a nest | **41 %** | 3.7 steps |
| town, from an edge | 36 % | **5.6 steps** |
| town, from a nest | 32 % | 4.3 steps |
| city, from an edge | 32 % | 2.1 steps |
| city, from a nest | 27 % | 2.4 steps |

100 % of approaches are seen at some point, and **59–77 % never break at all** — one continuous
observation from first contact to arrival. So emergence buys concealed *initiation*, not concealed
*pursuit*, and a memory of where an enemy was last seen (#722) pays out on about a third of
engagements for a two-to-six-step window. I first said the lurker's premise was "map-native today";
that was too broad and I corrected it on #281.

The lever for anyone tuning this is break *length*, not blocker count: two steps is a bug clipping a
corner, five is a bug behind a building. Town has the longest breaks because its buildings are big
enough to hide behind and sparse enough to walk around.

## 3e. Vegetation opacity, re-measured after the hill fix (#591, 2026-09-04)

#591's original table (rural 87–89 % visible) is **stale** — it was taken before #593 landed, when
terrain was invisible to the sight rule. `fix(tactical): a hill blocks line of sight` (#645) and the
diagonal seam fix (#677) merged on 2026-09-04 and bought about twenty points of concealment on rural
maps for free. Re-measured through `assessMap` on `main`, 4 seeds per biome × settlement:

| biome | scale | baseline | clustered trees opaque | all trees opaque | trees already in a clump |
|---|---|---|---|---|---|
| temperate | rural | 68 % | **58 %** | 57 % | 98 % |
| snowy | rural | 68 % | **58 %** | 58 % | 99 % |
| desert | rural | 70 % | **70 %** | 66 % | **0 %** |
| coastal | rural | 72 % | **64 %** | 62 % | 82 % |

The finding that decides it: the prop pass already clusters **82–100 % of trees** outside the desert,
so #591's option 1 (only clumped trees block) and option 2 (all trees block) differ by 0–2 points —
and where they differ, option 1 does *nothing*, because desert palms are placed singly. Option 1 also
needs per-instance opacity, which would stop `Tile.blocksLos` being a straight denormalisation of the
kind. I withdrew my preference for option 1 and recommended option 2: three data lines in
`data/props.ts`, no model change. Awaiting the call.

It changes no placement, so unlike most of §3 it does **not** spend the ground budget #281 is
judging — which is the argument that got it unbundled from #281 on 2026-09-04.

**Pre-checked against the trap that reverted #703** (§3f), so whoever lands it is not caught the same
way: goldens **unchanged** and no re-pin needed (`blocksLos` does not alter the ASCII glyph, which is
keyed by cover level); shipped `pnpm test:sim` **exit 0**; 114/120 wins against a baseline 115/120 at
difficulties 1–4, which is the same one-mission noise §3f measures; outcomes byte-identical between
runs. It is a same-day change the moment the call comes.

## 3f. The palm revert, and what it actually showed (#701, #723, 2026-09-04)

#703 clustered desert palms; `main` went red on `sim · mission sweep`; the Tech Lead bisected it to
that commit and reverted. The revert was right — `main` must be green — but **the diagnosis does not
survive a larger sample**, and the mechanism matters for every future map change.

**The sim plays a desert city.** Every one of its sixty seeds builds Istanbul, because the biome
comes from campaign seed 7's first infested city rather than from the map seed. So all sixty maps
are exactly the maps a desert data change touches. The bisect was causally sound; establish this
before arguing with a sweep result.

**The paired experiment.** 120 seeds, thirty at each of difficulties 1–4, played twice on the same
seeds with a 60-turn cap so nothing hides behind the cap:

| | d1 | d2 | d3 | d4 | total |
|---|---|---|---|---|---|
| scattered (`main`) | 30/30 | 30/30 | **26/30** | 29/30 | **115/120** |
| clustered (#701) | 30/30 | 30/30 | **30/30** | 27/30 | **117/120** |

Clustering wins *more*. Eight missions flipped, five toward winning and three away — marginal
missions falling either side of a line, not a difficulty change.

**The finding underneath: the walkover band is not a walkover.** Unmodified `main` loses 5 of 120 at
difficulties 1–4. The sweep's `WALKOVER_CEILING` assertion reads zero because it samples six seeds
per difficulty, and twenty-four cannot see a 4 % rate. So `expect(lostOrStalled).toBe(0)` is a
knife-edge that **any** map change can trip by resampling which marginal missions fall which way.
Mine was simply first. Before landing any map change, run `pnpm test:sim`; if it trips this
assertion, measure at 120 seeds before believing the change caused it.

## 3g. Two findings handed to #497 (2026-09-04)

Neither is mapgen's to act on; both came out of map measurement and are recorded so they are not
re-derived.

- **Traversal does not explain the difficulty cliff.** The walk from deploy to a tile that can shoot
  each spawner (range 8, with line of sight — a squad stops when it can fire, not when it arrives)
  is 4.8–6.0 turns at difficulties 1–4 and 6.5–8.9 at 5–10, scaling linearly at 21–30 steps per
  spawner with no discontinuity at 5. Mission length over the same range steps 5–7 → 25–34 turns.
  Across all 36 biome × settlement × size combinations the worst map in the game is **10.9 turns of
  walking**, so no configuration accounts for it. Size is the only lever that moves traversal
  (small → large roughly doubles it); settlement scale barely registers, and `INFESTATION_CLEARANCE`
  hard-codes `mapSize: "medium"` so the variance is currently unreachable.
- **Outcomes are bimodal with nothing in between.** Every win lands at 4–6 turns, every loss at
  39–50, over 240 plays. A won mission *is* the walk — combat adds almost nothing to the clock — and
  a lost one is a forty-turn grind. Difficulty today is a coin flip between the two rather than a
  gradient.

## 4. What M2 (tactical) consumes

- `generateTacticalMap(missionToMapRecipe(mission, missionType).value)` → `TacticalMap` (plain JSON).
- `service/tile-index.ts` (`TileIndex.getAt/column/neighbour`) and `service/reachability-service.ts`
  (`canStep`, `neighbours`, `reachableFrom`, `isConnected`) implement ADR 0004 §5 exactly; tactical's
  movement rules must not make a move legal that `canStep` forbids.
- Hooks: `map.hooks.deployZones[].tiles`, `objectives[]` (egg spawners, `meta.hatchRadius` 3, ≥ 6
  reachable tiles around each), `edgeSpawns[]` (boundary tiles, infantry-reachable), `extraction`.
- `snapshotMap(map)` then `hatchTiles(snapshot, origin, radius, PassMask.INFANTRY)` from
  `service/hatch-space.ts` (#355) for the exact tile set a spawner hatches into, origin first.
- `Tile.blocksLos` (#353) and `Tile.coverProvided` for sight and cover; walls on both sides of an edge
  (`tile.walls`, I3); `y` is the level for elevation bonuses.
- **#231's open question is closed:** `unit-factory.bugUnit` gives every species `passClass:
  "infantry"`, brutes included, so edge spawns and egg spawners stay `PassMask.INFANTRY`. If a
  future species is ever built mech-sized, flip that kind's `requiredPass` in
  `data/hook-kind-defaults.ts` and the connectivity pass does the rest.

## 5. Decisions made and why

- Freeze lives in the entry, not a "finalize" pass; ids in `content/model`, definitions in `mapgen/data`
  keyed `Record<Id, Def>`; draft predicates in `service/draft-queries.ts`; repairs are a 0-1 BFS.
- Plat grading follows the builder's `levelling: "flat"`; `roadWidth` sits on the settlement and
  only `grid` honours it; room furnishing and hook placers are registries so hives can extend them.
- Clusters preserve expected density (seed rate = density / mean cluster size).
- Hatch space is checked lazily in draw order (Tech Lead review on #235): candidate-wide BFS pushed
  the CI sweep past 30 s.
- Slow generation tests carry explicit vitest timeouts; the sweep must stay under #30's 20 s budget on
  CI, which is about half the speed of these instances.

## 6. What I would do next, in order

1. **Nothing of mine is in review.** **Waiting on a one-line call:** #591 (flip the three tree kinds
   to `blocksLos: true` — three data lines, no placement change, does *not* spend #281's budget, and
   pre-checked clean against the sweep, §3e) and #712 (temperate boulders). **Waiting on a design
   call:** #685, where the option that matters is now emergence rather than anything mapgen builds
   (§3d) — and note I retired my own option 2 there, which is what unbundled it from #281.
   **Needs a decision from someone who owns the sweep:** #701, where the change is measured harmless
   at 120 seeds but trips a 24-seed assertion (§3f); do not re-push it without that. Other open threads on other people: #446
   (melee bugs invert cover — tactical's, routed), #487 (deployment over 16 units cannot launch),
   #447 (M3 archetypes, two questions for the Director), #281 (the cover call), and the turn-budget
   finding noted in #547 (a worst-case mech needs 11 turns to a firing position on `town/medium/9`
   against a budget of 10 — someone else's assertion, left at four seeds deliberately). When a mapgen PR does conflict on a rebase, the
   sweep goldens are the file to expect it in: take theirs and re-pin from the vitest diff. And if
   the Tech Lead has already merged `main` into your branch (they push the merge to your branch as
   part of the gate), reset to theirs rather than force-pushing a rebase over it.
2. **#444 is decided and built** (#512 → #535). Two things the Director may come back on: the mech
   high-ground share sits at **0.19–0.21**, the floor of their 0.20–0.35 band rather than its
   middle, because the border keep-out that makes deploy placement safe costs about 0.07; and a
   mech-reachable vantage exists at **5–10 of 18** spawners rather than "most", because a sight line
   into a building comes through a window whatever height it starts from. Getting past half needs
   more windows (#506 moved the other way for the Art Director), a spawner placer that prefers
   overlookable buildings, or accepting that spotting an indoor spawner is infantry work.
3. Run `MAPGEN_WIDE=1` before merging any generator change (60–85 s); it is the check that found
   #221. Re-run the §3a audit after any tuning change: the numbers there are the M2 baseline.
4. Answer map questions as the last M2 issues land — #426 (spawners as attack targets), #341 (the
   deploy → tactical → results flow), #343 / #344 (QA's headless sim and Playwright smoke). The map
   contract should not need to move again for M2; #231's question is closed (§4).
5. **Do not add cover to rural or town until the Executive Director has judged #281.** The call is
   a rural map played against a city map, and those are now the two ends of the range (3 % against
   9 % flank-proof, 87 % against 51 % visible). Yard parapets are the obvious next use of #508 and
   would raise rural and town flank-proof ground without touching a density dial — but doing it now
   would move the thing being judged. Tuning from §3 / §3a once the Executive Director calls #281 — read it together with #446, which
   says more cover currently means harder missions. The preview now shows all of it live: the two
   directional cover shares (#437) and the play read-outs — approach, bug walk-in, firing positions
   and how many are in cover or shooting down, mech reach, levels reached (#456, `assessMap`).
   Extend `tactical/service/map-assessment-service.ts` before writing a new scratch probe.
6. M3 archetypes: the sketch is #447, including the two questions to settle first (are hive caverns
   mech-passable, and how big is a hive). `createPipeline`'s per-archetype table in `service/settlement-pipeline.ts` takes a
   new pass list. **#714 cleared the capability wall in advance**: a pass can now be asked for the
   placements an archetype can support, so a hive reuses the settlement's scattering without owning
   buildings. Budget for the lesson §2c paid for, though — ambient clutter is a fixed budget per
   archetype, and a second source competes with the first for tiles rather than adding to it. Hive: cavern carve (cellular automaton on the dense heightmap, one level, `rock`
   walls as solid `WallSet`s), nest rooms as `Building`s with kind `nest` and a `nest` room kind in
   `data/room-furnishing`, `hive-core` hook placer; props/ramps/hooks/connectivity reuse as-is.
   Crash site: terrain + a crater pass (bowl, debris props, `wreck` building) before roads/lots.
   Platform: a decks pass (floor tiles on `void`, `PassMask.NONE` surface) instead of terrain/water.
   Two things the audit says these archetypes must get right from the start: hooks want distance
   bands, not a "far from deploy" rule (§3a), and a corridor map with cover on two sides of most
   tiles will play very differently from the settlement's 3–6 % — decide that deliberately.
7. Preview polish: a "regenerate with next seed" key; the metric delta column already ships (#276).
8. When an engineer takes #108 (promote `Registry` to `core/`), `mapgen/model/registry.ts` and
   `service/definition-registry.ts` are the files to retire; nothing in mapgen depends on the class.

## 7. Gotchas

- GitHub API budget is shared: poll ≤ every 5 min, REST only; create PRs with
  `gh api -X POST repos/.../pulls -f title= -f head= -f base=main -F body=@file` (write the body file
  before any gate that can abort the script). Pushes cost no quota.
- Verify with real exit codes; scratch files must be out of `src/` before `pnpm typecheck`/`lint`.
- Stacked goldens conflict on every rebase: `git checkout --theirs` the sweep file, run a re-pin
  helper that parses the received checksums out of the vitest diff (strip ANSI, stdout+stderr), add,
  `GIT_EDITOR=true git rebase --continue`. Never run other git commands while a rebase is conflicted:
  a stray commit derails `--update-refs`. Check every branch's `rev-list --count origin/main..` before pushing.
- `pkill -f <pattern>` kills your own shell when the pattern is in your command line (exit 144); kill
  the dev server by the PID on :5173 from `ss -ltnp`.
- A worktree with symlinked `node_modules` cannot run `pnpm` scripts; use `node_modules/.bin/*`; run
  Playwright from the real checkout.
- **Test budgets.** The suite-wide `testTimeout` is 20 s (#647) because generation dominates this
  suite and CI runners are contended; the generation sweep keeps its own 60 s (#672). Neither is a
  performance gate — the wide sweep's runtime is. Do not buy time by cutting `SEEDS_PER_COMBO`: the
  sweep asserts `generations >= 200` precisely to stop that, and it is a deliberate tripwire.
- **Measure twice under load, and then measure the thing CI runs.** A branch-versus-`main`
  comparison told me my crash-site PR had doubled the sweep (23.6 s against 11.8 s). It had not — a
  background wide sweep was still running. Later the same day I nearly published "opaque trees cost
  50–60 % of simulation runtime" off two runs at 147 s and 160 s against 84 s and 103 s; the
  *shipped* sweep then came in **faster** with the change than without (78 s against 98.6 s). Nine
  agents share this box. Two agreeing runs are not a signal, and a scratch probe's runtime is not
  the number anyone cares about.
- **Know the baseline before you tune to a target.** I spent three sweeps tuning the crash site's
  prop load toward "about what a settlement has" before checking what the crash site itself was: 137
  props at 18.2 %, already in a settlement's range. The target was right and I had invented it.
  `git stash` will not undo a *committed* change, so measuring a baseline means
  `git checkout main -- <file>`, measure, then restore — twice today a stash produced a
  "before" identical to the "after".
- **Render an archetype you changed.** The suite was green on a crash site that read as a forest with
  a dent in it. Nothing in 1907 tests looks at prop density per open tile, and nothing will.
  Two clean runs said 12.0 s and 16.4 s. Never draw a performance conclusion from one run while
  anything else is going.
- **A pass that runs before the hook placers must keep off the map's border band.** Deploy zones and
  edge spawns land in the outer four columns and need flat ground to stand on and walk off; anything
  raised there boxes units in and shows up as failures in other domains' tests, not mapgen's.
- **A screenshot answers "does it read right"; a table cannot.** One Playwright spec against
  `/mapgen-preview.html` at a 2400×1500 viewport shows a whole medium map; commit the PNG under
  `docs/design/shots/` and link the `raw.githubusercontent.com` URL on the branch. That is how the
  first version of #512 was caught paving every yard.
- The Tech Lead merges minutes after a rebase; expect "stale info" on a push to mean "already merged".
- Every GitHub comment starts with `**MapGen** · TUT agent`.
- **Scale (#829).** A wide road makes every tile inside it look like a junction to any rule that
  counts road neighbours; use run extents, and remember side-street mouths are wider than one column
  when levelling. Golden re-pinning: `scratchpad/repin.py` pairs the `- "checksum": N` /
  `+ "checksum": N` lines of the sweep's diff (numbers, not strings). The lurker seed-sweep test in
  `src/bugs/ai/` ran on the shipped `mission-2:map` and moved with any generator change; #829 left
  it for the bug-AI owner rather than edit it, and #843 gave it a stated fixture. The tactical e2e
  specs walk the map through `nearestSightPosition` / `pathBetween` (map-assessment-service) since
  #829: a spawner deep in a big building or a vantage up a ramp defeats any hop-toward heuristic. The `objective-reachability` engagement
  budget (10 mech turns at 4 steps a turn) is the pin that scale trips first — check the nearest
  spawner before the sweep.
- **Lot-margin wedges (#847, from QA's #813 catalogue).** `SlopePass` no longer asks whether a
  column is at its natural level or a column clear of a lot; `isWedgeGround` asks only whether the
  lower tile is unpaved, unwalled and free of a connector. A wall is the man-made edge. Over the
  108 `qa813` maps the wedge share went 88.7 % → 95.6 %; what is left bare is paved lower tiles
  (~1.6 %, a road meeting higher ground — the kerb question, not a wedge) and one-wide channels
  (opposite high sides, catalogue N1). The ramp pass now keeps both ends off wedge tiles. The
  audit probe that reproduces the bucket table lives in the #847 PR thread; regenerate it with a
  draft-side walk, not the frozen map, when the buckets need a reason column.
- **Kerb walls on paved two-layer edges (#863, QA's rescale exhibit K2).** New `KerbPass` after
  `ramps`: any edge with a paved tile on either side that rises two or more layers and carries
  neither a connector nor a wall gets a `half` wall on the high side (at the foot when the high
  tile is a wedge, so I10 holds). One-layer paved steps are kerbs by design (K1) and untouched.
  Two gotchas: the draft mirrors a wall only onto the neighbour at the *same layer*, so across a
  two-layer edge the wall lives on one tile and every reader of an edge must look from both
  sides (`wallAt(low, d) ?? wallAt(high, opposite(d))`); and the ramp *plank* in
  `tactical-map-view` was a fixed 1.2 u box, which reached half way up a two-layer rise — it now
  spans `hypot(run, rise)`. The K2 seam itself always had one ramp per lane in data.
