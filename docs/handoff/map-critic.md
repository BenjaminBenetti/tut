# Handoff: Map Critic

2026-09-08, v0.2.13 follow-up — #917 visually accepted on current main;
five open Critic tickets (cap reached). Squad/pointer cutaway re-check is
complete. Layers have useful floor views but fail the top-limit roof control;
that regression is already owned under #978. The next seed survey continues.

## Calibration and boundaries

[Studio standing orders, Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968)
are now an explicit subscription for this seat. Anything that matters goes
on GitHub: work-scoped direction in the relevant issue/PR, cross-cutting
orders in #968. Terminal messages can remain unsubmitted. Read the thread
on refresh and include its exact query in each authorised watch. Map design
belongs to Map Critic and MapGen; the Director routes Executive Director
rulings, sets acceptance criteria and judges frames. Existing deliberate
rulings still stand. Ownership uses `seat:mapgen` and `seat:art-director` for the existing
specialists as well as engineer seat labels; area labels remain intake/domain
and Board Owner remains role accountability. The Executive Director’s
assignable account is not an agent claim. There is no production hold.

The Executive Director trusts this seat to file evidenced findings. Cap:
**five open Critic tickets**. File rather than park for taste. Escalate only
a genuine fork that would produce materially different games, or a conflict
with an explicit ruling. State uncertainty in a ticket when necessary.

**Real-place plausibility outranks tactical utility.** Both paved and
vegetated artificial settlement plinths were defects. Frequency and
placement belong to criterion one. Putting grass or useful cover on an
implausible object does not make it acceptable. Earlier planted-bed praise
is withdrawn. Preserve at-grade planting and real natural terrain. City
height should come from usable buildings, floors, roofs, stairs, ladders,
and land that actually rises; never recommend putting the mounds back.
Infantry/mech building-access distinctions remain deliberate.

The Director judges visual changes before merge; the Tech Lead merges.
The Critic supplies render findings and post-merge verdicts, not code review,
art, game-code changes, movement/LOS/balance certification or QA counts.
Map Lab is the instrument. Change one recipe parameter, look, then inspect
another angle before filing. Never inspect generator implementation to
explain a picture. Route to both areas when cause cannot be assigned by eye.

## Current ranked queue

Five open Critic tickets at this checkpoint (cap reached):

1. **[#945](https://github.com/BenjaminBenetti/tut/issues/945), p2 — MapGen + Art:**
   natural ground materials meet in conspicuous squares/right angles.
   Filed this turn with coastal two-angle and snowy corroborating evidence.
   MapGen has submitted the Director-accepted #1007; the Tech Lead requested
   refreshed fog frames before merge. #959 is now MapGen’s active job.
   Producer’s earlier uncertainty about pickup was explicitly cleared in #968. This concerns material contact,
   not the settled slope/crease geometry.
2. **[#959](https://github.com/BenjaminBenetti/tut/issues/959), p2 — MapGen + Art:**
   temperate rural trails disappear into broad dirt patches. Fresh P01/P02,
   `mc-resume-01`, temperate/rural/small, focus `(13,2,24)`, 45 px/tile,
   initial/one E turn; P03 snowy contrast control. Focus is the camera
   reference on the ridge above the trail. #204's snow/desert repair is
   preserved. Coordinate with #945 if one repair serves both outcomes.
3. **[#960](https://github.com/BenjaminBenetti/tut/issues/960), p2 — Art + MapGen:**
   city frontages and plots lack recognisable differences in everyday use.
   I01/I02 `mc-resume-01`, temperate/city/medium, `(43,2,39)`;
   I03/I04 `mc-opening-02`, same settings, `(23,1,34)`, both pairs at
   45 px/tile, initial/one E turn. Preserve wall-family appearances,
   restrained windows, different heights/footprints and roof access.
   #509/#511 and #492 already delivered material/glazing work; this asks
   for building-use identity, not a repeat of those changes.

4. **[#1006](https://github.com/BenjaminBenetti/tut/issues/1006), p2 — MapGen:**
   city timber panels still describe no boundary. Two angles on
   `mc-opening-03`, coastal/city/medium 72², camera anchor `(51,1,31)`,
   55 px/tile. Rural #917 remains accepted; this extends the finding to
   a city case and is distinct from the coherent finite garden run.
5. **[#1005](https://github.com/BenjaminBenetti/tut/issues/1005), p3 — MapGen + Art:**
   regular seams cross one continuous water surface. Two angles plus UI
   controls on `mc-opening-01`, coastal/rural/small 48², `(40,0,4)`,
   55 px/tile. Rotated view is stronger. Cause uncertain by eye; #945's
   between-material contacts are a different acceptance target.

Both new tickets have committed evidence in
[the follow-up findings](../design/diagnostics/map-critic-v0213/followups/README.md),
water `d8babd8` and city panels `ebf67d7`. No sixth ticket while five are open.

No new city-flatness ticket is justified by the inspected views. The
post-removal floor/roof controls show a usable-looking infantry vertical
fight: successive furnished floors/stairs, roof openings and a neighbouring
ladder. That is a bounded visual judgement, not proof that every route works.
MapGen's mech outdoor-height cost is distinct from infantry building access;
#787 already owns future big-city overpasses. Do not duplicate it.

Continue the ranked repairs above; hold further findings until a slot opens. Interior lighting is
still a future play observation requested by the Director in #916 history:
current control interiors are dim, but this pass establishes the cutaway
improvement, not a general lighting failure or sign-off. Wider prop/plot
context is now included in #960 rather than held as a taste question.
Report if either owner begins queueing instead of working. At restart,
MapGen is on #959 with #945 In Review (#1007).
Art is now active on #960, with the #911 model In Review (#1008).
#947 has merged; a queued successor is
not evidence that either seat has stalled.

## Merged fixes: render verdicts

- **#961 / #978:** useful floor views, **failed top-limit preservation control**
  on later main `d0837c6`. Eight fresh frames show 1/5 and 2/5 rooms/stairs
  from two sides, but `]` at initial 5/5 removes the tall roof without changing
  the readout. [Posted on the owning #978 thread](https://github.com/BenjaminBenetti/tut/issues/978#issuecomment-5592433008)
  and cross-referenced from #961. [Evidence](../design/diagnostics/map-critic-v0213/layers/README.md),
  `22d1cad`. #968 confirmed eng-3 already owns the correction; do not open a
  duplicate or claim discovery priority. Both initial frames had their roofs:
  the precise trigger is applying the top focus, including a clamped Up.
  The engineer’s separately attributed same-run hillside pair in merged #1003
  was also opened: the missing building becomes readable ground-floor rooms,
  an actual improvement. The proper flat-map preservation control remains
  owed under #996/#978; our view is not a substitute for that reproducibility work.


- **#937 / #947, current-main confirmation:** 24 fresh pitched/flat, two-angle
  squad/pointer/overlap/closure frames opened. Broad radius-4 room context
  remains useful; hover inspection extends it and both closure paths restore
  the roof. [Posted combined verdict](https://github.com/BenjaminBenetti/tut/issues/937#issuecomment-5592160824)
  and [evidence](../design/diagnostics/map-critic-v0213/cutaway/README.md).
  Dim interiors, stipple and accepted near-wall edge exposure remain limitations.


- **#917 / #973**, merge `07b40cd`: **picture improved** on main `5cead6e`.
  Nine fresh frames show the beach fragments gone, trail/plot runs in context,
  clear entrance approaches and preserved waterfront. [Posted verdict](https://github.com/BenjaminBenetti/tut/issues/917#issuecomment-5591954741).
  [Evidence](../design/diagnostics/map-critic-v0213/README.md), immutable
  `132a5cb8305156947e30ca1c90b536e1dc6a06e9`. The visible open garden end
  ranks below all three live tickets: it marks one legible plot edge and
  does not require a separate defect ticket in this case. This is not a
  blanket exemption for arbitrary stubs, nor a request to enclose every plot.

- **#906 / #913:** snowy/desert bases now have visible support meeting the
  land, checked from two angles and against an already-grounded control.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5562936624).
- **#910 / #926:** the original raised paved enclosure is an ordinary plot.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/910#issuecomment-5562936864).
  Its old planted exception is superseded by #936.
- **#915 / #932:** city asphalt now meets a paved, railed waterfront;
  the town gains a modest paved lookout. The town already had a railing.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/915#issuecomment-5562936697),
  more strongly in the city, confirmed from a second angle.
- **#916 / #925:** intact buildings have shelter again; local cutaway works
  and closes after the squad leaves.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/916#issuecomment-5562936788).
  Its old radius-2 baseline is preserved for #937.
- **#936 / #940**, merge `900d9a3`: planted boxes are gone, leaving ordinary
  snowy/coastal city yards. Town and rural preservation PNGs are byte-identical
  to their pre-removal controls; they are not claimed bed-removal cases.
  [Post-merge picture-improved verdict](https://github.com/BenjaminBenetti/tut/issues/936#issuecomment-5589275662)
  includes the usable-height judgement above. The 15 frames were inspected
  before the pause and committed on restart; runtime trees still matched.
- **#937 / #943**, merge `5e4ea1a`: radius **4**, opacity floor **0.175**.
  The Executive Director chose 4 over Art's original recommendation of 3,
  including the broad two-squad overlap; the Director accepted 0.175.
  **Picture improved on merged main `5040bd0`:** more room boundaries,
  furniture and space between squads are readable in pitched/flat scenes,
  both camera sides. Both roofs close when squads leave. Visible stipple
  and dim interiors remain limitations, not grounds to reverse the chosen
  wide reveal. [Posted verdict](https://github.com/BenjaminBenetti/tut/issues/937#issuecomment-5590284474).
  See the [merged check](../design/diagnostics/map-critic-post937/README.md).

## Evidence and publication

[Resumed survey and ranked queue](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5590312244) are posted on the existing #905 survey record.

- [Opening assessment](../design/diagnostics/map-critic-opening/assessment.md):
  108 recipes, four biomes × three settlements × three sizes × three seeds,
  baseline `cafd9ff`, all inspected. Immutable evidence `dfbf26df4a43360bfd68fa614e2a7d520c56b1ed`.
  PR #907 merged; survey record #905 closed. Original taste/planted-bed
  framing is historical and explicitly superseded.
- [Calibration](../design/diagnostics/map-critic-calibration/README.md): eight
  frames on `f43f73c`, evidence `46270e9a6f369b09334730673989ac1f8f20b38b`.
- [Pre-#936 repair checks](../design/diagnostics/map-critic-recheck-936/README.md):
  21 frames on `2878dfc`, evidence `7055ffaf4f330ef7f1e752cddb4ff0d00d166c19`.
  PR **#918 merged** after all three CI jobs passed; its sidecar formatting
  review was resolved. Do not keep it listed as awaiting merge.
- [Post-#936 check](../design/diagnostics/map-critic-post936/README.md): 15
  frames on `900d9a3`, evidence `29399f9a5543c8b5a0d2aa268c5a682ba3b3baba`.
- [Resumed survey](../design/diagnostics/map-critic-resume-0908/README.md):
  36 fresh `mc-resume-01` recipes on main `360778a`, whole/closer pairs in
  nine sheets, a per-recipe ledger and exact manifest, plus seven focused
  PNGs. All 12 large whole views also opened at native resolution.
  Includes a second-seed building check. Evidence `3547686590364cd1d3735b598e26c8ecb72e3a97`.
- [Post-#937 check](../design/diagnostics/map-critic-post937/README.md): 16
  captures on main `5040bd0`, six previous-setting/runtime pairs and four
  closure frames. Old-setting frames use diagnostic overrides on the same
  current-main scene; they are not represented as old-build captures.
  Evidence `37290a6f89c4fd2e9c0f538d1fd04929baafc87d`.

Evidence PR **[#966](https://github.com/BenjaminBenetti/tut/pull/966) merged**
at 19:14:53 UTC as `d85ecd9`, after all three CI jobs passed at `91ed16b`.
The survey, repair crops and ranked queue are now on main.

PR **#971 merged** as `4148dca`; its standing-orders handoff is complete.
Current branch is **`docs/917-map-critic-v0213`**, based on main `5cead6e`.
Fence, water, city-panel and cutaway evidence is committed and pushed. The
combined evidence/handoff PR has not yet been opened at this checkpoint.
Capture scripts and raw frames remain under ignored
`.scratch/map-critic-v0213/`; older scratch directories retain prior recipes.
No scene was retouched or generated to demonstrate a finding.

## Rulings and capture gotchas

Do not re-file #876 or N1. #813 permits bare unpaved cliffs; dramatic town
road grades do not reopen judged connectors. #849 was closed with its wider
coverage-bucket caveat. #869 owns ramps crossing continuous parapets. #701
owns isolated desert palms; #712 records temperate boulder intent; #281's
cover-density ruling stands. Trees' visible boundaries do not establish
LOS protection (#591).

**#947 / #982 is merged** as `3ea2fb7`, before Art’s #911 work.
The Executive Director wants hover to reveal interiors without a squad
inside. Current-main hovered, pointer/squad overlap and open-ground
roof-preservation controls are now visually accepted in the 24-frame check above.
Art owns the parameters; the Director judges visual changes before merge. The accepted #937 verdict is squad-only and does not certify
this new pointer behavior. Do not re-file its absence.

**#911 is the known dropship gap.** Extraction intentionally stays at deploy;
the TDF dropship is the arrival/return landmark. Art owns the model, MapGen
placement/clearance. Do not re-file a bare marked zone or separate extraction.

In Map Lab, units-off removes the camera-projection hook; use initial framing
for those controls. Keep the initial level label **all** for complete-building
views. Raw slider value 10/max 11 can still mean all. Moving it can select a
floor instead. Explicit floor controls use the observed slider value and
label, not an assumed mapping from the `floor` URL. The misnamed old H02
higher-storey attempt stays in scratch and is excluded from evidence.

The actual cutaway is exercised through `tools/art/preview/roof-cutaway.html`,
not Map Lab preview-unit presence. Its capture-only controls support roof,
units, yaw, radius and opacity floor. Use the stable capture Vite configuration.
Long terminal capture jobs have sometimes disappeared locally; TTY helped
but did not eliminate interruption. Preserve completed PNG/JSON pairs,
restart only the incomplete captures and verify the served baseline.

Local `pnpm lint` scans ignored `.scratch` scripts. Applicable checks exclude
that scratch tree without changing repo configuration:
`pnpm exec eslint . --ignore-pattern '.scratch/**'` and
`pnpm exec prettier --check . --ignore-path .prettierignore --ignore-path .gitignore --ignore-path .git/info/exclude`.
Format all new sidecar JSON. No game suites are needed for diagnostic-only
changes; normal PR CI still applies. Validate image dimensions, metadata,
links and the actual scope.

Avoid negated GitHub closing phrases: one unintentionally closed #906.
Use `References` for active findings; documentation PRs may link the already
closed survey #905 with the template's closing keyword. Never push main or
merge. Every GitHub comment starts with `**Map Critic** · TUT agent` alone.
A model-capacity error is transient: wait/retry, never change model.

## Watch and current work checkpoint — 22:00 UTC

Original #968 subscription: **19:15:28–22:15:28 UTC, 2026-09-08**, 300-second
polls. [Confirmed in the discussion](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18355526).
All prior sessions are completed or explicitly replaced; no cron exists.

Most recent consumed event: `87543` exited at 21:59:26. Read/applied eng-3 and
eng-5's precise roof correction: initial frames are intact; the fault requires
applying the top focus and affects the tallest/tied roofs, not every roof.
This matches our two-angle observation. Do not repeat the earlier overstated
warning. Tech Lead routed a separate roof repair ahead of #996 capture work;
#1009 tether waits for it. #1003's hillside evidence is merged (`29639b3`).

Current singleton uses `.scratch/map-critic-v0213/watch/rearm-07/watch.py`,
started around 22:00, with exact #968 query and owned work threads/PR #1007.
The hard stop remains **22:15:28**. Inspect health/result before re-arming;
never extend the deadline or run two watchers. Catch up discussion pagination
if latest-ten comments have no overlap with the read cursor.

```sh
gh api graphql -f query='{repository(owner:"BenjaminBenetti",name:"tut"){discussion(number:968){comments(last:10){nodes{createdAt body}}}}}'
```

Current runtime/capture state:

- Main workspace remains `docs/917-map-critic-v0213`, baseline `5cead6e`;
  Vite server `86432` on 4173. Only evidence/docs have changed.
- Read-only detached current-main worktree is
  `.scratch/map-critic-v0213/current-main`, `d0837c6`; server `75288` on 4174.
  Its untracked `node_modules` is a symlink to the shared install, not a product edit.
- `fences/`: 9 inspected/committed pairs, #917 accepted.
- `followups/`: 6 inspected/committed pairs, #1005/#1006 filed and claimed MapGen.
- `cutaway/`: 24 inspected/committed pairs, #937/#947 verdict posted.
- `layers-latest/` and `layers-top-angle/`: five plus three valid frames,
  all inspected and committed under `layers/`; #978/#961 verdict posted.
  Completed capture sessions include `45499` (stopped before its unneeded
  rotated continuation) and `40140` (three rotated frames, exit 0).
  Excluded pilots/calibration failures remain scratch only. For fresh repeats,
  use single settled keyboard taps as in `layers-top-angle.mjs`; middle drag
  does not pan this scene, and batch pan calibration near the map edge oscillated.
- `survey.mjs` continues as **`97179`**: `mc-resume-02`, four biomes ×
  rural/town/city, medium 72², whole/closer pairs. All eight rural/town pairs
  are captured and opened; city captures are in progress. Observations live
  in `survey-observations.json`. `survey-sheets.py` arranges captures with labels
  outside the scene; rural/town sheets exist but need opening before publication.
  Town views corroborate #1006 on another seed; add them to its thread after
  the evidence is committed, explicitly noting only one camera side there.

The Director asked for context percentage. No reliable live percentage is
exposed to this seat’s tools; do not invent one. CLI `/status` reports it to
the operator. Completed findings/verdicts are pushed. Next: finish inspecting
four city pairs, commit the continuation/ledger and town corroboration, make
this handoff final and open the docs-only PR. Re-check #945/roof correction
if they merge; do not accept merely on closure. Observe normal CI and finish
the bounded watch without another three-hour extension.
